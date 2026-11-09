#!/usr/bin/env node
/**
 * Voice generation: one WAV per dialogue line, cached, with measured durations and full licence metadata.
 * Runs before (and separately from) Remotion rendering.
 *
 *   node voice/generate.mjs --video NetherlandsVoiced          (finds src/videos/*.voice.json with that videoId)
 *   node voice/generate.mjs --script src/videos/netherlands-voiced.voice.json [--force]
 *   node voice/generate.mjs --spec path\to\video.spec.json   (a form-style video spec; see src/engine/spec.ts)
 *   node voice/generate.mjs --smoke [--force]                  (engine check: Kokoro, both Piper voices, fallback, cache)
 *   add --fake to use test tones instead of real engines (no models needed; for tests only)
 *
 * Writes (under TTS_AUDIO_ROOT, default D:\YouTubeStudio\audio):
 *   cache\<ab>\<hash>.wav + .json         shared by every video and both formats (16:9 / 9:16)
 *   videos\<videoId>\public\lines\*.wav   the lines this video uses (Remotion's public folder)
 *   videos\<videoId>\voice-manifest.json  per line: file, duration, engine, model, speaker, language, licence, attribution
 * Never deletes files. Never downloads or installs anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_VERSION, DEFAULT_SILENCE_SCALE, EXPECTED_RUNTIME, loadConfig } from './config.mjs';
import { MODELS, resolveVoice, voiceChain } from './catalog.mjs';
import { EnginePool } from './engine-pool.mjs';
import { canonicalJson, lineCacheKey, normalizeText, sha256 } from './hash.mjs';
import { verifyModel, verifyRuntime } from './verify.mjs';
import { readWavInfo } from './wav.mjs';
import { computeEnvelope, ENVELOPE_RATE } from './envelope.mjs';
import { loadLibrary, prepareAssets } from './library.mjs';
import { voiceScriptFromSpec } from './spec.mjs';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ script loading and checks

export function scriptHash(script) {
  return sha256(canonicalJson(script));
}

export function checkScript(script) {
  const problems = [];
  if (script?.schemaVersion !== 1) problems.push('schemaVersion must be 1');
  if (!script?.videoId) problems.push('videoId missing');
  if (!Array.isArray(script?.lines) || script.lines.length === 0) problems.push('lines missing');
  const ids = new Set();
  for (const [i, l] of (script?.lines ?? []).entries()) {
    const where = `line ${i + 1} (${l.id ?? '?'})`;
    if (!l.id) problems.push(`${where}: id missing`);
    else if (ids.has(l.id)) problems.push(`${where}: duplicate id`);
    ids.add(l.id);
    if (!l.speaker) problems.push(`${where}: speaker missing`);
    if (!normalizeText(l.text ?? '')) problems.push(`${where}: text empty`);
    if (l.speaker && l.speaker !== 'narrator' && !script.characters?.[l.speaker] && !l.voice)
      problems.push(`${where}: no voice assigned for speaker "${l.speaker}"`);
  }
  if (script?.music && !script.music.id) problems.push('music: id missing');
  for (const [i, cue] of (script?.sfx ?? []).entries()) {
    if (!cue.id) problems.push(`sfx ${i + 1}: id missing`);
    if (!cue.scene) problems.push(`sfx ${i + 1}: scene missing`);
  }
  const allSpecs = [script?.narrator, ...Object.values(script?.characters ?? {}), ...(script?.lines ?? []).map((l) => l.voice && { voice: l.voice })]
    .filter(Boolean)
    .flatMap((a) => [a.voice, ...(a.fallback ?? [])].filter(Boolean));
  for (const spec of allSpecs) {
    try {
      resolveVoice(spec);
    } catch (e) {
      problems.push(`voice ${JSON.stringify(spec)}: ${e.message}`);
    }
  }
  return problems;
}

export function findScript(videoId) {
  const dir = path.join(moduleRoot, 'src', 'videos');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.voice.json'))) {
    const p = path.join(dir, f);
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (s.videoId === videoId) return p;
  }
  throw new Error(`no src/videos/*.voice.json with videoId "${videoId}"`);
}

function assignmentFor(script, line) {
  const base = line.speaker === 'narrator' ? script.narrator : script.characters?.[line.speaker];
  if (line.voice) return { ...base, voice: line.voice };
  return base;
}

// ------------------------------------------------------------------ generation

/**
 * Generates (or reuses from cache) every line of a voice script and writes the manifest.
 * Returns the manifest. Lines that failed on every voice are listed with `error` and the manifest has complete=false.
 */
export async function generateVoice({ script, scriptFile = null, source = null, cfg = loadConfig(), force = false, log = console.log, pool = null }) {
  const problems = checkScript(script);
  if (problems.length) throw new Error(`voice script invalid:\n- ${problems.join('\n- ')}`);

  let runtime;
  if (cfg.fake) runtime = { package: 'fake', version: 'test', dir: null, nativeFilesVerified: 0, available: true };
  else {
    try {
      runtime = { ...verifyRuntime(cfg), available: true };
      log(`[voice] runtime ${runtime.package} ${runtime.version} at ${runtime.dir} (${runtime.nativeFilesVerified} native files verified)`);
    } catch (e) {
      // Runtime unreachable (e.g. the E: drive is disconnected): cached lines still work; new lines will fail.
      runtime = { package: EXPECTED_RUNTIME.package, version: EXPECTED_RUNTIME.version, dir: cfg.runtimeDir, nativeFilesVerified: 0, available: false };
      log(`[voice] WARNING: runtime not available (${e.message.split('\n')[0]}). Using cached audio only; lines that need new audio will fail.`);
    }
  }

  const ownPool = !pool;
  pool = pool ?? new EnginePool({ log });
  const modelChecks = new Map(); // modelId:lexicon -> { ok, info | error }
  const checkModel = (voice) => {
    const k = `${voice.modelId}:${voice.lexicon ?? ''}`;
    if (!modelChecks.has(k)) {
      try {
        const info = cfg.fake ? { files: {}, sha256: Object.values(MODELS[voice.modelId].sha256)[0] } : verifyModel(cfg, voice.modelId, { lexicon: voice.lexicon });
        modelChecks.set(k, { ok: true, info });
      } catch (e) {
        modelChecks.set(k, { ok: false, error: e.message });
      }
    }
    const r = modelChecks.get(k);
    if (!r.ok) throw new Error(r.error);
    return r.info;
  };
  const initSpec = (voice, info) => {
    const model = MODELS[voice.modelId];
    if (cfg.fake) return { kind: 'fake', mode: cfg.fake[voice.engine] ?? 'ok', sampleRate: model.sampleRate, speakers: model.speakers };
    return { kind: 'sherpa', runtimeDir: cfg.runtimeDir, engine: voice.engine, files: info.files, threads: cfg.threads };
  };

  const videoDir = path.join(cfg.audioRoot, 'videos', script.videoId);
  const publicDir = path.join(videoDir, 'public');
  fs.mkdirSync(path.join(publicDir, 'lines'), { recursive: true });

  const started = Date.now();
  const lines = [];
  try {
    for (const line of script.lines) {
      const chain = voiceChain(assignmentFor(script, line), line.speaker);
      const attempts = [];
      let result = null;
      for (const spec of chain) {
        let voice;
        try {
          voice = resolveVoice(spec);
          const info = checkModel(voice);
          const key = lineCacheKey({
            text: line.text,
            voice,
            modelSha256: info.sha256,
            silenceScale: DEFAULT_SILENCE_SCALE,
            runtimeVersion: runtime.version,
            cacheVersion: CACHE_VERSION,
          });
          const cacheWav = path.join(cfg.audioRoot, 'cache', key.slice(0, 2), `${key}.wav`);
          const cacheMeta = cacheWav.replace(/\.wav$/, '.json');
          let cached = false;
          let genMs = 0;
          let wav = null;
          if (!force && fs.existsSync(cacheWav) && fs.existsSync(cacheMeta)) {
            try {
              const meta = JSON.parse(fs.readFileSync(cacheMeta, 'utf8'));
              const w = readWavInfo(cacheWav);
              if (meta.key === key && meta.samples === w.samples) {
                wav = w;
                cached = true;
              }
            } catch {
              /* unreadable cache entry: regenerate (it is overwritten via an atomic rename) */
            }
          }
          if (!wav) {
            if (!runtime.available) throw new Error(`no cached audio and the sherpa-onnx runtime is not available (${cfg.runtimeDir})`);
            const r = await pool.synth(voice.engineKey, initSpec(voice, info), {
              text: normalizeText(line.text),
              sid: voice.speakerId,
              speed: voice.speed,
              silenceScale: DEFAULT_SILENCE_SCALE,
              outFile: cacheWav,
            });
            wav = readWavInfo(cacheWav);
            if (wav.samples !== r.samples) throw new Error(`WAV check failed: ${wav.samples} samples on disk, ${r.samples} generated`);
            genMs = r.genMs;
          }
          if (/\p{L}/u.test(line.text) && wav.durationMs < 200) throw new Error(`audio too short (${wav.durationMs.toFixed(0)} ms)`);
          if (!cached) {
            fs.writeFileSync(
              cacheMeta,
              JSON.stringify({ key, text: normalizeText(line.text), voice, modelSha256: info.sha256, sampleRate: wav.sampleRate, samples: wav.samples, durationMs: wav.durationMs, runtime: runtime.version, createdAt: new Date().toISOString() }, null, 2),
            );
          }
          const publicFile = path.join(publicDir, 'lines', `${key}.wav`);
          if (!fs.existsSync(publicFile) || fs.statSync(publicFile).size !== fs.statSync(cacheWav).size) fs.copyFileSync(cacheWav, publicFile);
          attempts.push({ engine: voice.engine, model: voice.modelId, speakerId: voice.speakerId, ok: true });
          const model = MODELS[voice.modelId];
          result = {
            id: line.id,
            scene: line.scene,
            speaker: line.speaker,
            text: line.text,
            hash: key,
            file: `lines/${key}.wav`,
            cachePath: cacheWav,
            engine: cfg.fake ? `fake:${voice.engine}` : voice.engine,
            model: voice.modelId,
            modelSha256: info.sha256,
            speakerId: voice.speakerId,
            speakerName: voice.speakerName,
            language: voice.language,
            speed: voice.speed,
            licence: cfg.fake ? 'test only' : model.licence,
            attribution: model.attribution,
            requiresAttribution: model.requiresAttribution,
            sampleRate: wav.sampleRate,
            samples: wav.samples,
            durationMs: Math.round(wav.durationMs * 100) / 100,
            cached,
            genMs,
            fallbackUsed: attempts.length > 1,
            fallbackReason: attempts.length > 1 ? attempts[0].error : undefined,
            attempts,
            envelopeRate: ENVELOPE_RATE,
            envelope: computeEnvelope(cacheWav),
          };
          break;
        } catch (e) {
          attempts.push({ engine: spec.engine, model: spec.model ?? (voice?.modelId || spec.voice), speakerId: voice?.speakerId ?? spec.speaker ?? null, ok: false, error: e.message });
          log(`  [fallback] ${line.id}: ${spec.engine} ${spec.voice ?? spec.model} failed: ${e.message.split('\n')[0]}`);
        }
      }
      if (!result) result = { id: line.id, scene: line.scene, speaker: line.speaker, text: line.text, error: 'all voices failed', attempts };
      lines.push(result);
      log(
        result.error
          ? `  FAIL ${line.id}: all voices failed`
          : `  ${result.cached ? 'cache' : 'new  '} ${line.id.padEnd(14)} ${(result.durationMs / 1000).toFixed(2).padStart(6)} s  ${result.speakerName}${result.fallbackUsed ? '  (fallback)' : ''}${result.genMs ? `  gen ${(result.genMs / 1000).toFixed(1)} s` : ''}`,
      );
    }
  } finally {
    if (ownPool) await pool.close();
  }

  const library = loadLibrary(cfg.libraryFile ?? path.join(moduleRoot, 'src', 'audio-library.json'));
  const { assets, problems: assetProblems, attributions: assetAttributions } = prepareAssets({ script, library, publicDir });
  for (const p of assetProblems) log(`  REFUSED ${p}`);

  const ok = lines.filter((l) => !l.error);
  const manifest = {
    schemaVersion: 1,
    videoId: script.videoId,
    scriptFile: scriptFile ? path.relative(moduleRoot, scriptFile).split(path.sep).join('/') : null,
    /** Where the lines came from, so render.mjs can refuse stale audio: { kind: 'voice-script' | 'spec', file }. */
    source: source ?? (scriptFile ? { kind: 'voice-script', file: path.resolve(scriptFile) } : null),
    scriptHash: scriptHash(script),
    createdAt: new Date().toISOString(),
    test: Boolean(cfg.fake),
    runtime,
    complete: ok.length === lines.length && assetProblems.length === 0,
    lines,
    assets,
    assetProblems,
    attributions: [...new Set([...ok.filter((l) => l.requiresAttribution).map((l) => l.attribution), ...assetAttributions])],
    credits: [...new Set(ok.map((l) => l.attribution))],
    stats: {
      lines: lines.length,
      failed: lines.length - ok.length,
      cached: ok.filter((l) => l.cached).length,
      generated: ok.filter((l) => !l.cached).length,
      fallbacks: ok.filter((l) => l.fallbackUsed).length,
      totalAudioSeconds: Math.round(ok.reduce((s, l) => s + l.durationMs, 0) / 10) / 100,
      generationSeconds: Math.round(ok.reduce((s, l) => s + l.genMs, 0) / 100) / 10,
      wallSeconds: Math.round((Date.now() - started) / 100) / 10,
    },
  };
  fs.writeFileSync(path.join(videoDir, 'voice-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

// ------------------------------------------------------------------ smoke test

async function smoke({ cfg, force, log }) {
  const line = (id, text, voice) => ({ id, scene: 'smoke', speaker: id, text, voice });
  const script = {
    schemaVersion: 1,
    videoId: '_smoke',
    narrator: { voice: { engine: 'kokoro', voice: 'af_heart' } },
    characters: {},
    lines: [
      line('kokoro', 'Hello from Kokoro. This voice is generated locally on this computer.', { engine: 'kokoro', voice: 'af_heart' }),
      line('piper-ljspeech', 'Hello from Piper, using the LJ Speech voice.', { engine: 'piper', model: 'en_US-ljspeech-high' }),
      line('piper-libritts', 'Hello from Piper, using the LibriTTS voice.', { engine: 'piper', model: 'en_US-libritts-high', speaker: 0 }),
    ],
  };
  const checks = [];
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok, detail });
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  };

  log('\n== 1. Each engine, one line ==');
  const first = await generateVoice({ script, cfg, force, log });
  for (const l of first.lines) {
    const rtf = l.genMs ? (l.genMs / l.durationMs).toFixed(2) : null;
    check(`${l.id} produced audio`, !l.error && !l.fallbackUsed && l.durationMs > 500, l.error ?? `${(l.durationMs / 1000).toFixed(2)} s, ${l.sampleRate} Hz${rtf ? `, ${rtf}x realtime` : ', cached'}`);
  }

  log('\n== 2. Forced Kokoro failure (model folder missing) falls back to Piper ==');
  const broken = { ...cfg, kokoroDir: path.join(cfg.audioRoot, '_does_not_exist_'), fake: cfg.fake ? { ...cfg.fake, kokoro: 'init-throw' } : null };
  const fb = await generateVoice({
    script: { ...script, videoId: '_smoke_fallback', lines: [{ id: 'fallback', scene: 'smoke', speaker: 'narrator', text: 'This line proves the fallback works.' }] },
    cfg: broken,
    force: true,
    log,
  });
  const f = fb.lines[0];
  check('fallback used Piper', !f.error && f.fallbackUsed && f.engine.endsWith('piper'), f.error ?? `${f.speakerName}; reason: ${(f.fallbackReason ?? '').split('\n')[0]}`);

  log('\n== 3. Second run is served from cache ==');
  const second = await generateVoice({ script, cfg, force: false, log });
  check('all lines cached on second run', second.lines.every((l) => l.cached), `${second.stats.cached}/${second.stats.lines} cached`);
  check('cached durations identical', second.lines.every((l, i) => l.durationMs === first.lines[i].durationMs));

  const report = { at: new Date().toISOString(), test: Boolean(cfg.fake), checks, first: first.stats, runtime: first.runtime };
  const reportFile = path.join(cfg.audioRoot, 'videos', '_smoke', 'smoke-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  const passed = checks.every((c) => c.ok);
  log(`\nSMOKE ${passed ? 'PASSED' : 'FAILED'}: ${checks.filter((c) => c.ok).length}/${checks.length} checks. Report: ${reportFile}`);
  log(`Listen: ${path.join(cfg.audioRoot, 'videos', '_smoke', 'public', 'lines')}`);
  return passed;
}

// ------------------------------------------------------------------ CLI

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[k] = v;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(args['audio-root'] ? { audioRoot: path.resolve(args['audio-root']) } : {});
  if (args.fake) cfg.fake = { kokoro: args['fake-kokoro'] ?? 'ok', piper: 'ok' };
  fs.mkdirSync(cfg.audioRoot, { recursive: true });
  console.log(`[voice] audio root: ${cfg.audioRoot}${cfg.fake ? '   (FAKE engines: test tones)' : ''}`);
  console.log(`[voice] kokoro: ${cfg.kokoroDir}`);
  console.log(`[voice] piper:  ${cfg.piperDir}`);

  if (args.smoke) {
    const ok = await smoke({ cfg, force: Boolean(args.force), log: console.log });
    process.exit(ok ? 0 : 2);
  }
  let m;
  if (args.spec) {
    const specFile = path.resolve(args.spec);
    const script = voiceScriptFromSpec(JSON.parse(fs.readFileSync(specFile, 'utf8')));
    console.log(`[voice] spec: ${specFile} (${script.lines.length} lines, video ${script.videoId})`);
    m = await generateVoice({ script, source: { kind: 'spec', file: specFile }, cfg, force: Boolean(args.force), log: console.log });
  } else {
    const scriptFile = path.resolve(args.script ?? findScript(args.video ?? 'NetherlandsVoiced'));
    const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
    console.log(`[voice] script: ${scriptFile} (${script.lines.length} lines)`);
    m = await generateVoice({ script, scriptFile, cfg, force: Boolean(args.force), log: console.log });
  }
  const file = path.join(cfg.audioRoot, 'videos', m.videoId, 'voice-manifest.json');
  console.log(
    `\n[voice] ${m.complete ? 'COMPLETE' : 'INCOMPLETE'}: ${m.stats.lines} lines, ${m.stats.generated} generated, ${m.stats.cached} cached, ${m.stats.fallbacks} fallback, ${m.stats.failed} failed; ${m.stats.totalAudioSeconds} s of audio in ${m.stats.wallSeconds} s`,
  );
  if (m.attributions.length) console.log(`[voice] attribution required in the video description:\n  ${m.attributions.join('\n  ')}`);
  console.log(`[voice] manifest: ${file}`);
  process.exit(m.complete ? 0 : 2);
}

const sameFile = (x, y) => (process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y);
if (process.argv[1] && sameFile(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(`[voice] FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
