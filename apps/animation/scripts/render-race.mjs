#!/usr/bin/env node
/**
 * Renders a simulated marble race (race/simulate.mjs) in chunks and joins them into one video.
 *
 *   node scripts/render-race.mjs --race-dir D:\YouTubeStudio\races\test-10 --out E:\YouTubeStudio\races\test-10.mp4 \
 *        [--cache E:\YouTubeStudio\cache\remotion] [--concurrency 2] [--browser <chrome>] [--only 3] [--ffmpeg <path>]
 *
 * <race-dir> is the --out folder of race/simulate.mjs: it holds replay\ (race.json, stage files, sfx) and this script
 * adds segments\ next to it.
 *
 * Why chunks: a 1-hour race is ~108,000 frames. Each segment (intro, every stage, podium) is rendered to its own file
 * in <race-dir>\segments\. A segment that is already rendered from the same replay and the same renderer code is
 * skipped, so a crashed or stopped run continues where it left off. When all segments exist they are joined with
 * FFmpeg's concat demuxer (stream copy: no re-encode, takes seconds).
 *
 * --only N renders just segment N (0 = intro, 1..S = stages, S+1 = podium) as a quick preview, without joining.
 *
 * Writes only into <race-dir>\segments, --out's folder and --cache. Segment files in <race-dir>\segments are this
 * script's own working files and are replaced when their replay or the renderer changes. The final video never
 * overwrites an existing file (a timestamp suffix is added).
 */
import './localhost-ipv4.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(here, '..');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const fail = (msg) => {
  console.error(`[race-render] STOPPED: ${msg}`);
  process.exit(1);
};
if (!args['race-dir']) fail('usage: node scripts/render-race.mjs --race-dir <folder from race/simulate.mjs> [--out <file.mp4>]');
const raceDir = path.resolve(args['race-dir']);
// <race-dir>\replay is the public folder (copied into the bundle); segments live beside it, not inside it
const replayDir = path.join(raceDir, 'replay');
const metaFile = path.join(replayDir, 'race.json');
if (!fs.existsSync(metaFile)) fail(`${metaFile} not found. Run race/simulate.mjs first.`);
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
if (meta.version !== 1) fail(`unsupported replay version ${meta.version}`);
const cacheDir = path.resolve(args.cache ?? path.join(moduleRoot, '.cache'));
const concurrency = Math.max(1, parseInt(args.concurrency ?? '2', 10) || 2);
const browserExecutable = args.browser ? path.resolve(args.browser) : null;
const only = args.only !== undefined ? parseInt(args.only, 10) : null;
if (only !== null && !(only >= 0 && only < meta.segments.length)) fail(`--only must be 0..${meta.segments.length - 1}`);
const segDir = path.join(raceDir, 'segments');
fs.mkdirSync(segDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const fmt = (sec) => (sec < 90 ? `${sec.toFixed(1)} s` : sec < 5400 ? `${(sec / 60).toFixed(1)} min` : `${(sec / 3600).toFixed(2)} h`);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const uniquePath = (target) => {
  if (!fs.existsSync(target)) return target;
  const { dir, name, ext } = path.parse(target);
  return path.join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}${ext}`);
};

/** Hash of the renderer code: a changed renderer means old segments are out of date. */
function rendererHash() {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|json)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(moduleRoot, 'src', 'race'));
  for (const f of ['character', 'engine']) walk(path.join(moduleRoot, 'src', f));
  return sha(files.sort().map((f) => `${path.relative(moduleRoot, f)}\n${fs.readFileSync(f, 'utf8')}`).join('\n'));
}

function segmentName(seg, i) {
  const n = String(i).padStart(4, '0');
  return seg.kind === 'stage' ? `seg-${n}-stage-${String(seg.index).padStart(3, '0')}` : `seg-${n}-${seg.kind}`;
}

function fingerprint(seg, code) {
  const parts = [code, JSON.stringify(seg), meta.title, meta.stageCount, JSON.stringify(meta.standings), JSON.stringify(meta.sfx ?? null)];
  if (seg.kind === 'stage') parts.push(sha(fs.readFileSync(path.join(replayDir, seg.file))));
  if (seg.kind === 'intro') parts.push(JSON.stringify(meta.competitors));
  return sha(parts.join('|'));
}

// ffmpeg / ffprobe: --ffmpeg, FFMPEG_PATH, PATH, then the copy inside Remotion's compositor package
function remotionBinary(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const base = path.join(moduleRoot, 'node_modules', '@remotion');
  for (const d of fs.readdirSync(base)) {
    if (!d.startsWith('compositor-')) continue;
    const p = path.join(base, d, exe);
    if (fs.existsSync(p)) return { bin: p, dir: path.join(base, d) };
  }
  return null;
}
function spawnBin(tool, argv) {
  const env = { ...process.env };
  if (tool.dir && process.platform === 'linux') env.LD_LIBRARY_PATH = `${tool.dir}:${env.LD_LIBRARY_PATH ?? ''}`;
  return spawnSync(tool.bin, argv, { encoding: 'utf8', windowsHide: true, env, maxBuffer: 64 * 1024 * 1024 });
}
function findTool(name, explicit) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [explicit && { bin: explicit }, { bin: exe }, remotionBinary(name)].filter(Boolean);
  for (const c of candidates) if (spawnBin(c, ['-version']).status === 0) return c;
  return null;
}

// ------------------------------------------------------------------ render
const code = rendererHash();
const todo = meta.segments
  .map((seg, i) => ({ seg, i, name: segmentName(seg, i) }))
  .filter((s) => only === null || s.i === only)
  .map((s) => {
    const file = path.join(segDir, `${s.name}.mp4`);
    const marker = path.join(segDir, `${s.name}.done.json`);
    const fp = fingerprint(s.seg, code);
    let done = false;
    try {
      done = fs.existsSync(file) && JSON.parse(fs.readFileSync(marker, 'utf8')).fingerprint === fp;
    } catch {}
    return { ...s, file, marker, fp, done };
  });
const totalFrames = todo.reduce((a, s) => a + s.seg.frames, 0);
const pendingFrames = todo.filter((s) => !s.done).reduce((a, s) => a + s.seg.frames, 0);
console.log(
  `[race-render] ${meta.title}: ${todo.length} segment(s), ${fmt(totalFrames / meta.fps)} of video; ` +
    `${todo.filter((s) => s.done).length} already rendered, ${fmt(pendingFrames / meta.fps)} to render.`,
);

const report = { race: meta.id, title: meta.title, seed: meta.seed, winner: meta.winner, startedAt: new Date().toISOString(), concurrency, segments: [] };
if (pendingFrames > 0) {
  if (!browserExecutable) await ensureBrowser({ logLevel: 'warn' });
  const tb = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(moduleRoot, 'src', 'race', 'index.ts'),
    outDir: path.join(cacheDir, `bundle-race-${Date.now()}`),
    publicDir: replayDir,
    onProgress: () => {},
  });
  console.log(`[race-render] bundled in ${((Date.now() - tb) / 1000).toFixed(1)} s`);

  let renderedFrames = 0;
  const t0 = Date.now();
  for (const s of todo) {
    if (s.done) {
      report.segments.push({ name: s.name, frames: s.seg.frames, skipped: true });
      continue;
    }
    const inputProps = { segment: s.i, meta };
    const composition = await selectComposition({ serveUrl, id: 'RaceSegment', inputProps, logLevel: 'warn', browserExecutable, timeoutInMilliseconds: 120_000 });
    const partial = path.join(segDir, `${s.name}.partial.mp4`);
    const ts = Date.now();
    let last = -25;
    for (let attempt = 1; ; attempt++) {
      try {
        await renderMedia({
          composition,
          serveUrl,
          inputProps,
          codec: 'h264',
          crf: 18,
          x264Preset: 'veryfast',
          pixelFormat: 'yuv420p',
          colorSpace: 'bt709',
          enforceAudioTrack: true, // every segment has an audio stream, so they can be joined without re-encoding
          audioCodec: 'aac',
          outputLocation: partial,
          concurrency,
          overwrite: true,
          browserExecutable,
          timeoutInMilliseconds: 120_000,
          logLevel: 'warn',
          onProgress: ({ progress }) => {
            const pct = Math.floor(progress * 100);
            if (pct >= last + 25) {
              last = pct;
              process.stdout.write(`  ${s.name}: ${pct}%\r`);
            }
          },
        });
        break;
      } catch (e) {
        const crash = /Target closed|Session closed|browser crashed|Timeout \(\d+ms\) exceeded|Page crashed/i.test(String(e?.message ?? e));
        if (attempt >= 2 || !crash) throw e;
        console.warn(`\n[race-render] browser crashed on ${s.name}; retrying once...`);
      }
    }
    fs.renameSync(partial, s.file);
    fs.writeFileSync(s.marker, JSON.stringify({ fingerprint: s.fp, frames: s.seg.frames, renderedAt: new Date().toISOString() }, null, 1));
    const secs = (Date.now() - ts) / 1000;
    renderedFrames += s.seg.frames;
    const spf = (Date.now() - t0) / 1000 / renderedFrames;
    const left = (pendingFrames - renderedFrames) * spf;
    console.log(`  ${s.name}: ${s.seg.frames} frames in ${fmt(secs)} (${(s.seg.frames / secs).toFixed(1)} fps)${left > 0 ? `, about ${fmt(left)} left` : ''}`);
    report.segments.push({ name: s.name, frames: s.seg.frames, seconds: Math.round(secs * 10) / 10 });
  }
  report.renderSeconds = Math.round((Date.now() - t0) / 100) / 10;
  report.framesPerSecond = Math.round((renderedFrames / ((Date.now() - t0) / 1000)) * 100) / 100;
}

if (only !== null) {
  console.log(`[race-render] preview segment written: ${todo[0].file}`);
  process.exit(0);
}

// ------------------------------------------------------------------ join
const ffmpeg = findTool('ffmpeg', args.ffmpeg ?? process.env.FFMPEG_PATH);
const ffprobe = findTool('ffprobe', args.ffprobe);
if (!ffmpeg) fail('no ffmpeg found to join the segments (pass --ffmpeg <path>).');
const out = uniquePath(path.resolve(args.out ?? path.join(raceDir, `${meta.id}.mp4`)));
fs.mkdirSync(path.dirname(out), { recursive: true });
const list = path.join(segDir, 'concat.txt');
fs.writeFileSync(list, todo.map((s) => `file '${s.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n');
const tj = Date.now();
const j = spawnBin(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
if (j.status !== 0) fail(`joining failed:\n${j.stderr}`);
console.log(`[race-render] joined ${todo.length} segments in ${((Date.now() - tj) / 1000).toFixed(1)} s -> ${out}`);

// ------------------------------------------------------------------ check + report
const expected = meta.totalFrames / meta.fps;
let probe = null;
if (ffprobe) {
  const p = spawnBin(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,duration,nb_frames', '-of', 'json', out]);
  if (p.status === 0) probe = JSON.parse(p.stdout);
}
const duration = probe ? parseFloat(probe.format.duration) : null;
const v = probe?.streams?.find((x) => x.codec_type === 'video');
const a = probe?.streams?.find((x) => x.codec_type === 'audio');
const frames = v?.nb_frames ? parseInt(v.nb_frames, 10) : null;
// Stream-copied AAC adds a few ms of priming at every segment boundary, so the container is a little longer
// than the replay even when every frame is there. Frame count is the real check; the duration fallback gets
// room for that padding (about 12 ms per segment).
const padding = 0.02 * (meta.stageCount + 2);
const checks = probe
  ? {
      duration: frames !== null ? Math.abs(frames - meta.totalFrames) <= 2 : Math.abs(duration - expected) < 0.5 + padding,
      video: v?.codec_name === 'h264' && v.width === meta.width && v.height === meta.height,
      audio: a?.codec_name === 'aac',
    }
  : null;
report.output = out;
report.probe = probe ? { duration, expected, frames, expectedFrames: meta.totalFrames, video: v, audio: a } : 'ffprobe not found: NOT CHECKED';
report.checks = checks;
const ok = checks ? Object.values(checks).every(Boolean) : null;
const lines = [
  `# Race render: ${meta.title}`,
  '',
  `- Output: ${out}`,
  `- Seed: ${meta.seed} · ${meta.competitors.length} countries · ${meta.stageCount} stages · winner **${meta.winner}**`,
  `- Length: ${fmt(duration ?? expected)} (expected ${fmt(expected)}${frames !== null ? `, ${frames} frames` : ''}; a few extra ms per segment come from AAC padding)`,
  report.renderSeconds ? `- Render: ${fmt(report.renderSeconds)} at concurrency ${concurrency} (${report.framesPerSecond} fps)` : '- Render: all segments reused',
  `- Checks: ${checks ? Object.entries(checks).map(([k, val]) => `${k} ${val ? 'PASS' : 'FAIL'}`).join(', ') : 'NOT RUN (no ffprobe)'}`,
  '',
  '## Standings',
  '',
  ...meta.standings.slice(0, 20).map((s) => `${s.place}. ${s.id}${s.out ? ` (out in stage ${s.out})` : ''}`),
  '',
  '## Sound',
  '',
  `All sound effects: ${meta.sfx?.license ?? 'none'}`,
];
const stem = out.replace(/\.mp4$/i, '');
fs.writeFileSync(`${stem}.report.md`, lines.join('\n') + '\n');
fs.writeFileSync(`${stem}.metrics.json`, JSON.stringify(report, null, 1));
console.log(`[race-render] ${ok === null ? 'NOT CHECKED' : ok ? 'PASS' : 'FAIL'}: ${fmt(duration ?? expected)} -> ${stem}.report.md`);
if (ok === false) process.exit(2);

