#!/usr/bin/env node
/**
 * General renderer for compositions in this module.
 *
 *   node scripts/render.mjs --composition NetherlandsDemo --out E:\YouTubeStudio\prototype\netherlands-demo.mp4 \
 *        --cache E:\YouTubeStudio\cache\remotion [--concurrency 2] [--browser <chrome path>]
 *
 * After rendering it verifies the file with FFprobe (codec, pixel format, size, fps, duration, frame count),
 * scans for black frames with FFmpeg's blackdetect and for frozen stretches with freezedetect, writes a contact sheet
 * of stills, and saves <name>.metrics.json and <name>.report.md next to the video. It uses the ffmpeg/ffprobe binaries
 * shipped inside Remotion's compositor package, so nothing else needs to be installed.
 *
 * Voiced compositions (Phase 3): add --audio-dir <TTS_AUDIO_ROOT>\videos\<videoId>. The voice manifest in that folder
 * is passed to the composition as input props and its public\ folder becomes Remotion's public dir (staticFile).
 * The render is refused if the manifest is incomplete or the voice script changed after the audio was generated.
 *
 * Safety: writes only into --out's folder and --cache. Never deletes. If the output exists, the new file gets a
 * timestamp suffix. No Remotion licence key is passed, so no usage telemetry is sent (Remotion prints a warning).
 */
import './localhost-ipv4.mjs'; // must stay first: fixes ECONNREFUSED ::1 when Remotion downloads the voice WAVs on Windows
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { scriptHash } from '../voice/generate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(here, '..');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const compositionId = args.composition ?? 'NetherlandsDemo';
const requestedOut = path.resolve(args.out ?? path.join(moduleRoot, 'out', `${compositionId}.mp4`));
const cacheDir = path.resolve(args.cache ?? path.join(moduleRoot, '.cache'));
const concurrency = Math.max(1, parseInt(args.concurrency ?? '2', 10) || 2);
const browserExecutable = args.browser ? path.resolve(args.browser) : null;
const audioDir = args['audio-dir'] ? path.resolve(args['audio-dir']) : null;
const drives = String(args.drives ?? (process.platform === 'win32' ? 'C:\\,D:\\,E:\\' : '/'))
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

const mb = (b) => Math.round((b / 1024 / 1024) * 10) / 10;
const fmt = (sec) => (sec < 90 ? `${sec.toFixed(1)} s` : sec < 5400 ? `${(sec / 60).toFixed(1)} min` : `${(sec / 3600).toFixed(2)} h`);
const uniquePath = (target) => {
  if (!fs.existsSync(target)) return target;
  const { dir, name, ext } = path.parse(target);
  return path.join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}${ext}`);
};
const diskFree = () =>
  Object.fromEntries(
    drives.map((d) => {
      try {
        const s = fs.statfsSync(d);
        return [d, Math.round(((s.bavail * s.bsize) / 1024 ** 3) * 100) / 100];
      } catch (e) {
        return [d, `error: ${e.message}`];
      }
    }),
  );

/** ffmpeg / ffprobe shipped with @remotion/compositor-<platform>. */
function remotionBinary(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const base = path.join(moduleRoot, 'node_modules', '@remotion');
  for (const d of fs.readdirSync(base)) {
    if (!d.startsWith('compositor-')) continue;
    const p = path.join(base, d, exe);
    if (fs.existsSync(p)) return { bin: p, dir: path.join(base, d) };
  }
  return { bin: exe, dir: undefined };
}
function run(name, argv) {
  const { bin, dir } = remotionBinary(name);
  return spawnBin(bin, dir, argv);
}
function spawnBin(bin, dir, argv) {
  const env = { ...process.env };
  // On Linux the bundled binaries need their shared libraries next to them.
  if (dir && process.platform === 'linux') env.LD_LIBRARY_PATH = `${dir}:${env.LD_LIBRARY_PATH ?? ''}`;
  return spawnSync(bin, argv, { encoding: 'utf8', windowsHide: true, env, maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Remotion's bundled ffmpeg is a reduced build (no blackdetect/freezedetect/fps/tile filters). For the content
 * checks we need a full ffmpeg: --ffmpeg, FFMPEG_PATH, or the one on PATH. If none has the filters, the checks are
 * reported as "not run", never as passed.
 */
const NEEDED_FILTERS = ['blackdetect', 'freezedetect', 'fps', 'tile', 'scale'];
function findAnalysisFfmpeg() {
  const bundled = remotionBinary('ffmpeg');
  const candidates = [
    args.ffmpeg && { bin: args.ffmpeg, dir: undefined },
    process.env.FFMPEG_PATH && { bin: process.env.FFMPEG_PATH, dir: undefined },
    { bin: process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', dir: undefined },
    bundled,
  ].filter(Boolean);
  for (const c of candidates) {
    const r = spawnBin(c.bin, c.dir, ['-hide_banner', '-filters']);
    if (r.status !== 0 || !r.stdout) continue;
    const names = new Set(r.stdout.split('\n').map((l) => l.trim().split(/\s+/)[1]).filter(Boolean));
    if (NEEDED_FILTERS.every((f) => names.has(f))) return c;
  }
  return null;
}

function memorySampler() {
  const base = os.totalmem() - os.freemem();
  let peakSys = base;
  let peakRss = process.memoryUsage().rss;
  const t = setInterval(() => {
    peakSys = Math.max(peakSys, os.totalmem() - os.freemem());
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 250);
  return () => {
    clearInterval(t);
    return { renderAddedPeakMB: mb(peakSys - base), nodeProcessPeakRssMB: mb(peakRss), systemUsedPeakMB: mb(peakSys) };
  };
}

// ------------------------------------------------------------------ main
const report = {
  composition: compositionId,
  startedAt: new Date().toISOString(),
  machine: {
    cpu: os.cpus()[0]?.model?.trim(),
    threads: os.cpus().length,
    ramGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    platform: `${process.platform} ${os.release()}`,
    node: process.version,
  },
  tmpdir: os.tmpdir(),
  diskBefore: diskFree(),
};
// ---- voice manifest (voiced compositions only); checked before anything is bundled or rendered
let inputProps = {};
let publicDir = null;
if (audioDir) {
  const refuse = (msg) => {
    console.error(`[render] REFUSED: ${msg}`);
    process.exit(1);
  };
  const manifestFile = path.join(audioDir, 'voice-manifest.json');
  if (!fs.existsSync(manifestFile)) refuse(`no voice manifest at ${manifestFile}. Run scripts\\voice.ps1 first.`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!manifest.complete) refuse(`voice manifest is incomplete (${manifest.stats?.failed ?? '?'} line(s) failed). See ${manifestFile}.`);
  if (manifest.scriptFile) {
    const scriptPath = path.join(moduleRoot, manifest.scriptFile);
    if (!fs.existsSync(scriptPath)) refuse(`voice script ${scriptPath} not found.`);
    if (scriptHash(JSON.parse(fs.readFileSync(scriptPath, 'utf8'))) !== manifest.scriptHash)
      refuse(`${manifest.scriptFile} changed after the audio was generated. Run scripts\\voice.ps1 again.`);
  }
  publicDir = path.join(audioDir, 'public');
  const missing = manifest.lines.filter((l) => !l.file || !fs.existsSync(path.join(publicDir, l.file)));
  if (missing.length) refuse(`audio missing for: ${missing.map((l) => l.id).join(', ')}`);
  if (manifest.test) console.warn('[render] WARNING: this manifest uses FAKE test tones, not real voices.');
  inputProps = { manifest };
  report.voice = {
    manifest: manifestFile,
    lines: manifest.lines.length,
    audioSeconds: manifest.stats?.totalAudioSeconds,
    fallbacks: manifest.stats?.fallbacks,
    test: manifest.test,
    attributions: manifest.attributions,
    credits: manifest.credits,
  };
  console.log(`[render] voice: ${manifest.lines.length} lines from ${manifestFile}`);
}

fs.mkdirSync(path.dirname(requestedOut), { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
const out = uniquePath(requestedOut);
const stem = out.replace(/\.mp4$/i, '');

console.log(`[render] ${compositionId} -> ${out}`);
console.log(`[render] temp dir: ${os.tmpdir()}`);
if (process.platform === 'win32' && os.tmpdir().toUpperCase().startsWith('C:'))
  console.warn('[render] WARNING: temp dir is on C:. Use scripts/render.ps1 so TEMP/TMP point to E:.');

if (!browserExecutable) await ensureBrowser({ logLevel: 'warn' });

const tb = Date.now();
const serveUrl = await bundle({
  entryPoint: path.join(moduleRoot, 'src', 'index.ts'),
  outDir: path.join(cacheDir, `bundle-${Date.now()}`),
  onProgress: () => {},
  ...(publicDir ? { publicDir } : {}),
});
report.bundleSeconds = (Date.now() - tb) / 1000;
console.log(`[render] bundled in ${report.bundleSeconds.toFixed(1)} s`);

const composition = await selectComposition({ serveUrl, id: compositionId, inputProps, logLevel: 'warn', browserExecutable });
const expectedSeconds = composition.durationInFrames / composition.fps;
report.compositionInfo = {
  width: composition.width,
  height: composition.height,
  fps: composition.fps,
  frames: composition.durationInFrames,
  seconds: expectedSeconds,
};

const stop = memorySampler();
const t0 = Date.now();
let last = -10;
await renderMedia({
  composition,
  serveUrl,
  inputProps,
  codec: 'h264',
  crf: 18,
  x264Preset: 'veryfast',
  pixelFormat: 'yuv420p',
  colorSpace: 'bt709',
  outputLocation: out,
  concurrency,
  overwrite: false,
  browserExecutable,
  logLevel: 'warn',
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct >= last + 10) {
      last = pct;
      console.log(`  ${pct}%`);
    }
  },
});
const renderSeconds = (Date.now() - t0) / 1000;
report.render = {
  concurrency,
  seconds: Math.round(renderSeconds * 10) / 10,
  framesPerSecond: Math.round((composition.durationInFrames / renderSeconds) * 100) / 100,
  realtimeFactor: Math.round((renderSeconds / expectedSeconds) * 10) / 10,
  memory: stop(),
};
const spf = renderSeconds / composition.durationInFrames;
report.estimates = {
  note: "Linear extrapolation of this video's average per-frame cost.",
  '60s': fmt(spf * 60 * composition.fps),
  '5min': fmt(spf * 300 * composition.fps),
  '10min': fmt(spf * 600 * composition.fps),
};

// ---- FFprobe
const pr = run('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames,color_range,color_space:format=duration,size',
  '-of', 'json', out,
]);
let probe = { ok: false, error: pr.stderr || String(pr.error) };
if (pr.status === 0) {
  const j = JSON.parse(pr.stdout);
  const v = j.streams?.[0] ?? {};
  const dur = parseFloat(j.format?.duration ?? '0');
  const checks = {
    h264: v.codec_name === 'h264',
    yuv420p: v.pix_fmt === 'yuv420p',
    size1920x1080: v.width === composition.width && v.height === composition.height,
    fps: v.r_frame_rate === `${composition.fps}/1`,
    duration: Math.abs(dur - expectedSeconds) <= 0.1,
    frameCount: v.nb_frames === undefined ? null : parseInt(v.nb_frames, 10) === composition.durationInFrames,
  };
  let audioStream;
  if (audioDir) {
    const ar = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'json', out]);
    const a = ar.status === 0 ? JSON.parse(ar.stdout).streams?.[0] : null;
    checks.audioTrack = Boolean(a) && a.codec_name === 'aac';
    audioStream = a ?? null;
  }
  probe = { audioStream, ok: Object.values(checks).every((c) => c !== false), checks, stream: v, durationSeconds: dur, sizeMB: mb(+j.format.size) };
}
report.probe = probe;

// ---- black frames (any >= 0.1 s run where 98% of pixels are near-black), frozen stretches (> 2 s), contact sheet
const analysis = findAnalysisFfmpeg();
const sheet = `${stem}.contact-sheet.jpg`;
if (analysis) {
  const ff = (argv) => spawnBin(analysis.bin, analysis.dir, argv);
  const bd = ff(['-hide_banner', '-nostats', '-i', out, '-vf', 'blackdetect=d=0.1:pic_th=0.98', '-an', '-f', 'null', '-']);
  const fd = ff(['-hide_banner', '-nostats', '-i', out, '-vf', 'freezedetect=n=0.001:d=2', '-an', '-f', 'null', '-']);
  const ran = bd.status === 0 && fd.status === 0;
  const blackRuns = [...(bd.stderr ?? '').matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)].map((m) => ({ start: +m[1], end: +m[2] }));
  const freezeStarts = [...(fd.stderr ?? '').matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
  report.content = {
    ffmpeg: analysis.bin,
    ran,
    blackFrameRuns: blackRuns,
    frozenOver2sStarts: freezeStarts,
    ok: ran ? blackRuns.length === 0 && freezeStarts.length === 0 : null,
  };
  // 12 evenly spaced stills on a 4x3 sheet
  const stillsPerSecond = (12 / expectedSeconds).toFixed(4);
  const cs = ff(['-hide_banner', '-v', 'error', '-y', '-i', out, '-vf', `fps=${stillsPerSecond},scale=480:-1,tile=4x3`, '-frames:v', '1', '-q:v', '3', sheet]);
  report.contactSheet = cs.status === 0 ? sheet : `failed: ${cs.stderr}`;
} else {
  report.content = { ran: false, ok: null, note: 'No ffmpeg with blackdetect/freezedetect found; content checks NOT run.' };
  report.contactSheet = 'not created (no full ffmpeg found)';
}

report.diskAfter = diskFree();
report.finishedAt = new Date().toISOString();
fs.writeFileSync(`${stem}.metrics.json`, JSON.stringify(report, null, 2));

const yes = (b) => (b === null ? 'n/a' : b ? 'PASS' : 'FAIL');
const md = [
  `# Render report: ${compositionId}`,
  '',
  `- Output: ${out} (${probe.sizeMB ?? '?'} MB)`,
  `- Machine: ${report.machine.cpu} (${report.machine.threads} threads), ${report.machine.ramGB} GB RAM, ${report.machine.platform}, Node ${report.machine.node}`,
  `- Temp dir: ${report.tmpdir}`,
  `- Composition: ${composition.width}x${composition.height}, ${composition.fps} fps, ${composition.durationInFrames} frames (${expectedSeconds.toFixed(1)} s)`,
  `- Bundle: ${report.bundleSeconds.toFixed(1)} s`,
  `- Render: ${fmt(renderSeconds)} at concurrency ${concurrency}: ${report.render.framesPerSecond} fps, ${report.render.realtimeFactor}x realtime`,
  `- Peak added RAM: ${report.render.memory.renderAddedPeakMB} MB (node process peak ${report.render.memory.nodeProcessPeakRssMB} MB)`,
  `- Estimates: 60 s ${report.estimates['60s']}, 5 min ${report.estimates['5min']}, 10 min ${report.estimates['10min']}`,
  '',
  '| Check | Result |',
  '| --- | --- |',
  ...(probe.checks ? Object.entries(probe.checks).map(([k, v]) => `| ${k} | ${yes(v)} |`) : ['| ffprobe | FAIL |']),
  report.content.ran
    ? `| no black frames | ${yes(report.content.blackFrameRuns.length === 0)} ${report.content.blackFrameRuns.length ? JSON.stringify(report.content.blackFrameRuns) : ''} |`
    : '| no black frames | NOT RUN (no full ffmpeg) |',
  report.content.ran
    ? `| no frozen stretch > 2 s | ${yes(report.content.frozenOver2sStarts.length === 0)} ${report.content.frozenOver2sStarts.length ? JSON.stringify(report.content.frozenOver2sStarts) : ''} |`
    : '| no frozen stretch > 2 s | NOT RUN (no full ffmpeg) |',
  `Content checks used: ${report.content.ffmpeg ?? 'none'}`,
  '',
  ...(report.voice
    ? [
        `Voice: ${report.voice.lines} lines, ${report.voice.audioSeconds} s of speech, ${report.voice.fallbacks} fallback(s)${report.voice.test ? ' (FAKE TEST TONES)' : ''}`,
        ...(report.voice.attributions.length ? ['Attribution required in the video description:', ...report.voice.attributions.map((a) => `- ${a}`)] : []),
        '',
      ]
    : []),
  `Contact sheet: ${report.contactSheet}`,
  `Disk free before: ${JSON.stringify(report.diskBefore)}`,
  `Disk free after:  ${JSON.stringify(report.diskAfter)}`,
];
fs.writeFileSync(`${stem}.report.md`, md.join('\n') + '\n');
console.log('\n' + md.join('\n'));
process.exit(probe.ok && report.content.ok !== false ? 0 : 1);
