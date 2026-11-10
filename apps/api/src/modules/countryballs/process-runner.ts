import { spawn, spawnSync } from 'child_process';

export interface StepOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  /** Called every heartbeatMs; return false to stop the step (job cancelled or lease lost). */
  heartbeat?: () => Promise<boolean>;
  heartbeatMs?: number;
  onLine?: (line: string) => void;
}

export interface StepResult {
  code: number | null;
  /** Last ~6 KB of combined output, for error messages. */
  tail: string;
  stopped: 'timeout' | 'cancelled' | null;
}

/** Kills a process and its children (Remotion starts Chrome processes; on Windows kill() alone leaves them). */
export function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/**
 * Runs one program with an argument array (never through a shell), streaming its output line by line.
 * Resolves with the exit code; never rejects for a non-zero exit (the caller decides).
 */
export function runStep(command: string, args: string[], opts: StepOptions): Promise<StepResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      shell: false,
      detached: process.platform !== 'win32', // own process group on Linux/macOS so killTree reaches Chrome too
    });
    let tail = '';
    let partial = '';
    let stopped: StepResult['stopped'] = null;
    let settled = false;

    const onData = (buf: Buffer) => {
      const text = buf.toString();
      tail = (tail + text).slice(-6000);
      partial += text;
      const lines = partial.split(/\r?\n/);
      partial = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) opts.onLine?.(l);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    const timer = setTimeout(() => {
      stopped = 'timeout';
      killTree(child.pid);
    }, opts.timeoutMs);

    let beat: NodeJS.Timeout | null = null;
    if (opts.heartbeat) {
      beat = setInterval(() => {
        opts.heartbeat!()
          .then((keep) => {
            if (!keep && !settled) {
              stopped = 'cancelled';
              killTree(child.pid);
            }
          })
          .catch(() => undefined); // a failed heartbeat (DB hiccup) must not kill a healthy render
      }, opts.heartbeatMs ?? 30000);
    }

    const finish = () => {
      settled = true;
      clearTimeout(timer);
      if (beat) clearInterval(beat);
    };
    child.on('error', (err) => {
      finish();
      reject(err);
    });
    child.on('close', (code) => {
      finish();
      if (partial.trim()) opts.onLine?.(partial);
      resolve({ code, tail, stopped });
    });
  });
}
