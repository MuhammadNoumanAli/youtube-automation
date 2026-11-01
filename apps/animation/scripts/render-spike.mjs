#!/usr/bin/env node
/**
 * Render spike for the isolated animation module.
 *
 * Bundles src/index.ts, renders the "Spike" composition (10 s, 1920x1080, 30 fps, H.264),
 * verifies the MP4 with FFprobe and writes metrics + a short report next to the video.
 *
 * Usage (from apps/animation):
 *   node scripts/render-spike.mjs --out E:\YouTubeStudio\spike\spike.mp4 \
 *        --cache E:\YouTubeStudio\cache\remotion --concurrency 2
 *   --concurrency accepts a list (e.g. 1,2,3) to benchmark; the first successful run keeps the name spike.mp4.
 *
 * Safety: writes only to --out's folder and --cache. Never deletes anything. If the output file already
 * exists, the new file gets a timestamp suffix instead of overwriting it.
 * No licence key is passed to Remotion, so no usage telemetry is sent (Remotion prints a warning about this).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(here, '..');
const repoRoot = path.resolve(moduleRoot, '..', '..');

// ---------- arguments ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const outPath = path.resolve(args.out ?? path.join(moduleRoot, 'out', 'spike.mp4'));
const cacheDir = path.resolve(args.cache ?? path.join(moduleRoot, '.cache'));
const concurrencies = String(args.concurrency ?? '2')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);
// Optional: use an already-installed Chrome / headless shell instead of Remotion's download.
const browserExecutable = args.browser ? path.resolve(args.browser) : null;
const drives = String(args.drives ?? (process.platform === 'win32' ? 'C:\\,D:\\,E:\\' : '/'))
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

// ---------- helpers ----------
const mb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const fmtDuration = (sec) => {
  if (!Number.isFinite(sec)) return 'n/a';
  if (sec < 90) return `${sec.toFixed(1)} s`;
  if (sec < 5400) return `${(sec / 60).toFixed(1)} min`;
  return `${(sec / 3600).toFixed(2)} h`;
};

function diskFree() {
  const out = {};
  for (const d of drives) {
    try {
      const s = fs.statfsSync(d);
      out[d] = { freeGB: Math.round(((s.bavail * s.bsize) / 1024 ** 3) * 100) / 100 };
    } catch (e) {
      out[d] = { error: String(e.message ?? e) };
    }
  }
  return out;
}

function uniqueOutput(target) {
  if (!fs.existsSync(target)) return target;
  const { dir, name, ext } = path.parse(target);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `${name}-${stamp}${ext}`);
}

/** Samples memory every 250 ms: this process's RSS and whole-system used memory (includes Chrome + encoder). */
function startMemorySampler() {
  const baselineSystemUsed = os.totalmem() - os.freemem();
  let peakRss = process.memoryUsage().rss;
  let peakSystemUsed = baselineSystemUsed;
  const timer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    peakSystemUsed = Math.max(peakSystemUsed, os.totalmem() - os.freemem());
  }, 250);
  return () => {
    clearInterval(timer);
    return {
      nodeProcessPeakRssMB: mb(peakRss),
      systemUsedBaselineMB: mb(baselineSystemUsed),
      systemUsedPeakMB: mb(peakSystemUsed),
      renderAddedPeakMB: mb(peakSystemUsed - baselineSystemUsed),
    };
  };
}

function findFfprobe() {
  const exe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const candidates = [
    args.ffprobe,
    process.env.FFPROBE_PATH,
    // Read-only use of the ffprobe already installed for the API workspace.
    path.join(repoRoot, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, exe),
    path.join(repoRoot, 'apps', 'api', 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, exe),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return exe; // rely on PATH
}

function probe(file) {
  const ffprobe = findFfprobe();
  const r = spawnSync(
    ffprobe,
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_frames:format=duration,size,format_name',
      '-of', 'json', file],
    { encoding: 'utf8', windowsHide: true },
  );
  if (r.error || r.status !== 0) {
    return { ffprobe, ok: false, error: String(r.error?.message ?? r.stderr ?? 'ffprobe failed') };
  }
  const j = JSON.parse(r.stdout);
  const v = j.streams?.[0] ?? {};
  const duration = parseFloat(j.format?.duration ?? '0');
  const checks = {
    codecH264: v.codec_name === 'h264',
    pixFmtYuv420p: v.pix_fmt === 'yuv420p',
    width1920: v.width === 1920,
    height1080: v.height === 1080,
    fps30: v.r_frame_rate === '30/1',
    duration10s: Math.abs(duration - 10) <= 0.1,
    frames300: v.nb_frames === undefined ? null : parseInt(v.nb_frames, 10) === 300,
  };
  const ok = Object.values(checks).every((c) => c !== false);
  return {
    ffprobe,
    ok,
    checks,
    stream: v,
    durationSeconds: duration,
    sizeMB: mb(parseInt(j.format?.size ?? '0', 10)),
    container: j.format?.format_name,
  };
}

// ---------- main ----------
const report = {
  startedAt: new Date().toISOString(),
  machine: {
    platform: `${process.platform} ${os.release()}`,
    cpu: os.cpus()[0]?.model?.trim(),
    logicalCpus: os.cpus().length,
    totalRamGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    node: process.version,
  },
  paths: { moduleRoot, outPath, cacheDir, tmpdir: os.tmpdir() },
  diskBefore: diskFree(),
  versions: {},
  bundle: {},
  runs: [],
};

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'node_modules', 'remotion', 'package.json'), 'utf8'));
  report.versions.remotion = pkg.version;
} catch {
  /* ignore */
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

console.log(`[spike] temp dir: ${os.tmpdir()}`);
if (process.platform === 'win32' && os.tmpdir().toUpperCase().startsWith('C:')) {
  console.warn('[spike] WARNING: temp dir is on C:. Run through scripts/spike.ps1 so TEMP/TMP point to E:.');
}

const tBrowser = Date.now();
if (browserExecutable) {
  console.log(`[spike] using browser: ${browserExecutable}`);
} else {
  console.log('[spike] ensuring headless browser (downloads once into node_modules/.remotion)...');
  await ensureBrowser({ logLevel: 'warn' });
}
report.browser = { executable: browserExecutable ?? 'remotion-managed', ensureSeconds: (Date.now() - tBrowser) / 1000 };

console.log('[spike] bundling...');
const tBundle = Date.now();
const bundleDir = path.join(cacheDir, `bundle-${Date.now()}`);
const serveUrl = await bundle({
  entryPoint: path.join(moduleRoot, 'src', 'index.ts'),
  outDir: bundleDir,
  onProgress: () => {},
});
report.bundle = { seconds: (Date.now() - tBundle) / 1000, dir: bundleDir };
console.log(`[spike] bundled in ${report.bundle.seconds.toFixed(1)} s`);

const composition = await selectComposition({ serveUrl, id: 'Spike', inputProps: {}, logLevel: 'warn', browserExecutable });
report.composition = {
  id: composition.id,
  width: composition.width,
  height: composition.height,
  fps: composition.fps,
  durationInFrames: composition.durationInFrames,
};

let primaryWritten = false;
for (const concurrency of concurrencies) {
  const target = primaryWritten
    ? outPath.replace(/\.mp4$/i, `-c${concurrency}.mp4`)
    : outPath;
  const output = uniqueOutput(target);
  console.log(`[spike] rendering at concurrency ${concurrency} -> ${output}`);
  const stopSampler = startMemorySampler();
  const t0 = Date.now();
  let lastLogged = -1;
  const run = { concurrency, output };
  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      crf: 18,
      x264Preset: 'veryfast',
      pixelFormat: 'yuv420p',
      colorSpace: 'bt709',
      outputLocation: output,
      concurrency,
      overwrite: false,
      browserExecutable,
      logLevel: 'warn',
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100);
        if (pct >= lastLogged + 10) {
          lastLogged = pct;
          process.stdout.write(`  ${pct}%\n`);
        }
      },
    });
    const seconds = (Date.now() - t0) / 1000;
    const frames = composition.durationInFrames;
    const secPerFrame = seconds / frames;
    run.ok = true;
    run.renderSeconds = Math.round(seconds * 10) / 10;
    run.framesPerSecond = Math.round((frames / seconds) * 100) / 100;
    run.realtimeFactor = Math.round((seconds / (frames / composition.fps)) * 10) / 10;
    run.memory = stopSampler();
    run.estimates = {
      note: 'Linear extrapolation of this scene\'s per-frame cost; busier scenes will be slower.',
      '60s': fmtDuration(secPerFrame * 60 * composition.fps),
      '5min': fmtDuration(secPerFrame * 300 * composition.fps),
      '10min': fmtDuration(secPerFrame * 600 * composition.fps),
    };
    run.probe = probe(output);
    primaryWritten = primaryWritten || run.probe.ok;
    console.log(
      `[spike] done in ${fmtDuration(seconds)} | ${run.framesPerSecond} fps | peak added RAM ${run.memory.renderAddedPeakMB} MB | ffprobe ${run.probe.ok ? 'PASS' : 'FAIL'}`,
    );
  } catch (e) {
    run.ok = false;
    run.error = String(e?.stack ?? e);
    run.memory = stopSampler();
    console.error(`[spike] render failed at concurrency ${concurrency}: ${e?.message ?? e}`);
  }
  report.runs.push(run);
}

report.diskAfter = diskFree();
report.finishedAt = new Date().toISOString();

const best = report.runs.filter((r) => r.ok).sort((a, b) => a.renderSeconds - b.renderSeconds)[0];
const metricsPath = path.join(path.dirname(outPath), 'metrics.json');
const reportPath = path.join(path.dirname(outPath), 'report.md');
fs.writeFileSync(uniqueOutput(metricsPath), JSON.stringify(report, null, 2));

const lines = [
  '# Render spike report',
  '',
  `- Machine: ${report.machine.cpu} (${report.machine.logicalCpus} threads), ${report.machine.totalRamGB} GB RAM, ${report.machine.platform}, Node ${report.machine.node}`,
  `- Remotion: ${report.versions.remotion ?? 'unknown'} | temp dir: ${report.paths.tmpdir}`,
  `- Composition: ${composition.width}x${composition.height}, ${composition.fps} fps, ${composition.durationInFrames} frames`,
  `- Bundle: ${report.bundle.seconds.toFixed(1)} s`,
  '',
  '| Concurrency | Result | Render time | Actual FPS | x realtime | Peak added RAM | 60 s est. | 5 min est. | 10 min est. | FFprobe |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...report.runs.map((r) =>
    r.ok
      ? `| ${r.concurrency} | ok | ${fmtDuration(r.renderSeconds)} | ${r.framesPerSecond} | ${r.realtimeFactor}x | ${r.memory.renderAddedPeakMB} MB | ${r.estimates['60s']} | ${r.estimates['5min']} | ${r.estimates['10min']} | ${r.probe.ok ? 'PASS' : 'FAIL'} |`
      : `| ${r.concurrency} | FAILED | - | - | - | - | - | - | - | - |`,
  ),
  '',
  `Disk free before: ${JSON.stringify(report.diskBefore)}`,
  `Disk free after:  ${JSON.stringify(report.diskAfter)}`,
  '',
  best ? `Recommended RENDER_CONCURRENCY: ${best.concurrency}` : 'No successful render.',
];
fs.writeFileSync(uniqueOutput(reportPath), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));

process.exit(report.runs.some((r) => r.ok && r.probe?.ok) ? 0 : 1);
