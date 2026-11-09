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
 * Voiced renders are also loudness-mastered: Remotion renders to an intermediate file in --cache, then FFmpeg applies
 * a gentle compressor, a gain to about -14 LUFS and a peak limiter (speech peaks are too high for gain alone), and
 * a two-pass loudnorm fine-tunes to -14 LUFS integrated with true peak <= -1.5 dBTP (YouTube's playback level). The
 * audio is trimmed to the exact video length; the video stream is copied untouched. The report checks the result.
 *
 * Form-style videos (Phase 4): --spec <file.spec.json> renders the generic "FromSpec" composition from a video spec
 * (src/engine/spec.ts); --format 9:16 or 16:9 overrides the spec's format, so one spec and one voice manifest give
 * both versions.
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
import { voiceScriptFromSpec } from '../voice/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(here, '..');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const specFile = args.spec ? path.resolve(args.spec) : null;
const compositionId = args.composition ?? (specFile ? 'FromSpec' : 'NetherlandsDemo');
const formatOverride = args.format === '9:16' || args.format === '16:9' ? args.format : null;
if (args.format && !formatOverride) {
  console.error('[render] --format must be 9:16 or 16:9');
  process.exit(1);
}
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
function findAnalysisFfmpeg(needed = NEEDED_FILTERS) {
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
    if (needed.every((f) => names.has(f))) return c;
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
let spec = null;
if (specFile) {
  if (!fs.existsSync(specFile)) {
    console.error(`[render] REFUSED: spec not found: ${specFile}`);
    process.exit(1);
  }
  spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  if (formatOverride) spec = { ...spec, format: formatOverride };
  inputProps = { spec, manifest: null };
  console.log(`[render] spec: ${specFile} (${spec.id}, ${spec.format})`);
}
if (audioDir) {
  const refuse = (msg) => {
    console.error(`[render] REFUSED: ${msg}`);
    process.exit(1);
  };
  const manifestFile = path.join(audioDir, 'voice-manifest.json');
  if (!fs.existsSync(manifestFile)) refuse(`no voice manifest at ${manifestFile}. Run scripts\\voice.ps1 first.`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!manifest.complete) refuse(`voice manifest is incomplete (${manifest.stats?.failed ?? '?'} line(s) failed). See ${manifestFile}.`);
  if (spec) {
    if (manifest.videoId !== spec.id) refuse(`manifest is for video "${manifest.videoId}", spec is "${spec.id}".`);
    if (scriptHash(voiceScriptFromSpec(spec)) !== manifest.scriptHash)
      refuse(`the spec's dialogue or voices changed after the audio was generated. Run scripts\\voice.ps1 -Spec again.`);
  } else if (manifest.source?.kind === 'voice-script' || manifest.scriptFile) {
    const scriptPath = manifest.source?.file ?? path.join(moduleRoot, manifest.scriptFile);
    if (!fs.existsSync(scriptPath)) refuse(`voice script ${scriptPath} not found.`);
    if (scriptHash(JSON.parse(fs.readFileSync(scriptPath, 'utf8'))) !== manifest.scriptHash)
      refuse(`${scriptPath} changed after the audio was generated. Run scripts\\voice.ps1 again.`);
  }
  publicDir = path.join(audioDir, 'public');
  const missing = manifest.lines.filter((l) => !l.file || !fs.existsSync(path.join(publicDir, l.file)));
  if (missing.length) refuse(`audio missing for: ${missing.map((l) => l.id).join(', ')}`);
  if (manifest.test) console.warn('[render] WARNING: this manifest uses FAKE test tones, not real voices.');
  inputProps = spec ? { spec, manifest } : { manifest };
  report.voice = {
    manifest: manifestFile,
    lines: manifest.lines.length,
    audioSeconds: manifest.stats?.totalAudioSeconds,
    fallbacks: manifest.stats?.fallbacks,
    test: manifest.test,
    attributions: manifest.attributions,
    credits: manifest.credits,
    music: manifest.assets?.music ? `${manifest.assets.music.id} (${manifest.assets.music.licence})` : null,
    sfx: manifest.assets?.sfx?.length ? manifest.assets.sfx.map((x) => `${x.id} (${x.licence})`).join(', ') : null,
  };
  console.log(`[render] voice: ${manifest.lines.length} lines from ${manifestFile}`);
}

fs.mkdirSync(path.dirname(requestedOut), { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
const out = uniquePath(requestedOut);
const stem = out.replace(/\.mp4$/i, '');
const renderTarget = audioDir ? path.join(cacheDir, `premaster-${Date.now()}.mp4`) : out;

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

const composition = await selectComposition({ serveUrl, id: compositionId, inputProps, logLevel: 'warn', browserExecutable, timeoutInMilliseconds: 120_000 });
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
// Chrome can crash on a busy laptop ("Target closed"), and the page reload then needs more than Remotion's default
// 30 s. Allow 2 min per page load and retry the whole render once after a browser crash. The output is a fresh path
// chosen by this run, so overwriting a half-written attempt is safe.
const RENDER_TIMEOUT_MS = 120_000;
const isBrowserCrash = (e) => /Target closed|Session closed|browser crashed|Timeout \(\d+ms\) exceeded|Page crashed/i.test(String(e?.message ?? e));
report.renderAttempts = 0;
for (let attempt = 1; ; attempt++) {
  report.renderAttempts = attempt;
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
      outputLocation: renderTarget,
      concurrency,
      overwrite: attempt > 1,
      browserExecutable,
      timeoutInMilliseconds: RENDER_TIMEOUT_MS,
      logLevel: 'warn',
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100);
        if (pct >= last + 10) {
          last = pct;
          console.log(`  ${pct}%`);
        }
      },
    });
    break;
  } catch (e) {
    if (attempt >= 2 || !isBrowserCrash(e)) throw e;
    console.warn(`[render] browser crashed (${String(e?.message ?? e).split('\n')[0]}). Retrying the render once...`);
    last = -10;
  }
}
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

// ---- loudness mastering (voiced renders only)
const LOUDNESS = { I: -14, TP: -1.5, LRA: 11 };
function measureLoudness(ffmpeg, file) {
  const r = spawnBin(ffmpeg.bin, ffmpeg.dir, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = (r.stderr ?? '').split('Summary:').pop();
  const I = parseFloat(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1] ?? 'NaN');
  const TP = parseFloat(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1] ?? 'NaN');
  return { integratedLUFS: I, truePeakDBTP: TP };
}
if (audioDir) {
  const mf = findAnalysisFfmpeg(['loudnorm', 'ebur128']);
  if (!mf) {
    fs.copyFileSync(renderTarget, out);
    report.mastering = { ok: false, note: 'No ffmpeg with loudnorm/ebur128 found; audio NOT loudness-normalised.' };
    console.warn(`[render] WARNING: ${report.mastering.note}`);
  } else {
    const before = measureLoudness(mf, renderTarget);
    const target = `I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`;
    // Stage 1: compressor, gain to the target, limiter at -3 dBFS, so stage 2 can stay linear.
    const comp = 'acompressor=threshold=-24dB:ratio=2.5:attack=5:release=120';
    const rc = spawnBin(mf.bin, mf.dir, ['-hide_banner', '-nostats', '-i', renderTarget, '-vn', '-af', `${comp},ebur128`, '-f', 'null', '-']);
    const compressedI = parseFloat(/I:\s+(-?[\d.]+) LUFS/.exec((rc.stderr ?? '').split('Summary:').pop())?.[1] ?? 'NaN');
    const gainDb = Number.isFinite(compressedI) ? Math.max(-20, Math.min(30, LOUDNESS.I - compressedI)) : 0;
    const pre = `${comp},volume=${gainDb.toFixed(2)}dB,alimiter=limit=0.708:attack=3:release=60:level=0`;
    const endSample = Math.round(expectedSeconds * 48000);
    const p1 = spawnBin(mf.bin, mf.dir, ['-hide_banner', '-nostats', '-i', renderTarget, '-vn', '-af', `${pre},loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
    const json = (p1.stderr ?? '').match(/\{[^{}]*"input_i"[^{}]*\}/);
    if (p1.status !== 0 || !json) {
      fs.copyFileSync(renderTarget, out);
      report.mastering = { ok: false, note: `loudnorm analysis failed: ${(p1.stderr ?? '').slice(-400)}` };
    } else {
      const m = JSON.parse(json[0]);
      const p2 = spawnBin(mf.bin, mf.dir, [
        '-hide_banner', '-v', 'error', '-i', renderTarget, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
        '-af', `${pre},loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000,apad,atrim=end_sample=${endSample}`,
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-n', out,
      ]);
      if (p2.status !== 0) {
        fs.copyFileSync(renderTarget, out);
        report.mastering = { ok: false, note: `loudnorm pass 2 failed: ${p2.stderr}` };
      } else {
        const after = measureLoudness(mf, out);
        report.mastering = { ok: true, target: LOUDNESS, before, after, gainDb: Math.round(gainDb * 100) / 100, ffmpeg: mf.bin };
        fs.unlinkSync(renderTarget); // only the intermediate file this run created in --cache
      }
    }
  }
  console.log(`[render] mastering: ${report.mastering.ok ? `${report.mastering.before.integratedLUFS} -> ${report.mastering.after.integratedLUFS} LUFS, true peak ${report.mastering.after.truePeakDBTP} dBTP` : report.mastering.note}`);
}

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
    frameSize: v.width === composition.width && v.height === composition.height,
    fps: v.r_frame_rate === `${composition.fps}/1`,
    duration: Math.abs(dur - expectedSeconds) <= 0.1,
    frameCount: v.nb_frames === undefined ? null : parseInt(v.nb_frames, 10) === composition.durationInFrames,
  };
  let audioStream;
  if (audioDir) {
    const ar = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'json', out]);
    const a = ar.status === 0 ? JSON.parse(ar.stdout).streams?.[0] : null;
    checks.audioTrack = Boolean(a) && a.codec_name === 'aac';
    const lm = report.mastering?.after;
    checks.loudness = Boolean(report.mastering?.ok) && Math.abs(lm.integratedLUFS - LOUDNESS.I) <= 1;
    checks.truePeak = Boolean(report.mastering?.ok) && lm.truePeakDBTP <= -1.0;
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
  `- Render: ${fmt(renderSeconds)} at concurrency ${concurrency}: ${report.render.framesPerSecond} fps, ${report.render.realtimeFactor}x realtime${report.renderAttempts > 1 ? ` (after a browser crash, attempt ${report.renderAttempts})` : ''}`,
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
        report.mastering?.ok
          ? `Loudness: ${report.mastering.before.integratedLUFS} -> ${report.mastering.after.integratedLUFS} LUFS (target ${LOUDNESS.I}), true peak ${report.mastering.after.truePeakDBTP} dBTP`
          : `Loudness: NOT mastered (${report.mastering?.note})`,
        ...(report.voice.music ? [`Music: ${report.voice.music}`] : []),
        ...(report.voice.sfx ? [`Sound effects: ${report.voice.sfx}`] : []),
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
