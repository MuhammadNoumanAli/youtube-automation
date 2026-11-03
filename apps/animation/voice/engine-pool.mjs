/**
 * One child process per engine (model + lexicon), started on first use and reused for every line, so each model
 * is loaded once per run (Stage 0 measured ~4 s per Kokoro load).
 *
 * A child that crashes, hangs past its timeout or fails to initialise is reported as an error for that line; the
 * caller then tries the next voice in the fallback chain. After two crashes an engine is disabled for the run.
 */
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'synth-worker.mjs');

export class EnginePool {
  constructor({ log = () => {}, loadTimeoutMs = 180_000 } = {}) {
    this.log = log;
    this.loadTimeoutMs = loadTimeoutMs;
    this.engines = new Map(); // key -> { child, ready: Promise, info, pending: Map }
    this.crashes = new Map();
    this.disabled = new Map(); // key -> reason
    this.nextId = 1;
  }

  _start(key, spec) {
    const child = fork(WORKER, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
    const entry = { child, pending: new Map(), info: null, exited: false };
    entry.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`engine ${key}: load timed out after ${this.loadTimeoutMs / 1000} s`));
        child.kill();
      }, this.loadTimeoutMs);
      child.on('message', (m) => {
        if (m.type === 'ready') {
          clearTimeout(timer);
          entry.info = m;
          this.log(`  [engine] ${key} loaded in ${(m.loadMs / 1000).toFixed(1)} s (${m.sampleRate} Hz, ${m.numSpeakers} speakers)`);
          resolve(m);
        } else if (m.type === 'init-error') {
          clearTimeout(timer);
          reject(new Error(`engine ${key}: ${m.message}`));
        } else if (m.type === 'done' || m.type === 'error') {
          const p = entry.pending.get(m.id);
          if (!p) return;
          entry.pending.delete(m.id);
          clearTimeout(p.timer);
          if (m.type === 'done') p.resolve(m);
          else p.reject(new Error(m.message));
        }
      });
      child.on('exit', (code, signal) => {
        entry.exited = true;
        clearTimeout(timer);
        const why = `engine ${key}: worker exited unexpectedly (code ${code ?? '-'}${signal ? `, signal ${signal}` : ''})`;
        reject(new Error(why));
        for (const p of entry.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new Error(why));
        }
        entry.pending.clear();
        if (this.engines.get(key) === entry) this.engines.delete(key);
        if (code !== 0) {
          const n = (this.crashes.get(key) ?? 0) + 1;
          this.crashes.set(key, n);
          if (n >= 2) this.disabled.set(key, `${why}; disabled after ${n} crashes`);
        }
      });
    });
    entry.ready.catch(() => {});
    child.send({ type: 'init', spec });
    this.engines.set(key, entry);
    return entry;
  }

  /** Synthesise one line into outFile. Resolves { samples, sampleRate, genMs, loadMs }. */
  async synth(key, spec, job) {
    if (this.disabled.has(key)) throw new Error(this.disabled.get(key));
    let entry = this.engines.get(key);
    if (!entry || entry.exited) entry = this._start(key, spec);
    try {
      await entry.ready;
    } catch (e) {
      // An engine that cannot load will not load on the next line either.
      this.disabled.set(key, e.message);
      if (!entry.exited) entry.child.kill();
      this.engines.delete(key);
      throw e;
    }
    const id = this.nextId++;
    const timeoutMs = 60_000 + job.text.length * 1_500;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        entry.pending.delete(id);
        reject(new Error(`engine ${key}: no result after ${Math.round(timeoutMs / 1000)} s (worker stopped)`));
        entry.child.kill();
      }, timeoutMs);
      entry.pending.set(id, { resolve: (m) => resolve({ ...m, loadMs: entry.info?.loadMs ?? 0 }), reject, timer });
      entry.child.send({ type: 'synth', id, ...job });
    });
  }

  async close() {
    const waits = [];
    for (const entry of this.engines.values()) {
      if (entry.exited) continue;
      waits.push(new Promise((r) => entry.child.once('exit', r)));
      try {
        entry.child.send({ type: 'exit' });
      } catch {
        entry.child.kill();
      }
    }
    this.engines.clear();
    await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 5000))]);
  }
}
