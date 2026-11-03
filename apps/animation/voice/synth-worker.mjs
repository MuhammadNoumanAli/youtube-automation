/**
 * Child process that owns one loaded TTS engine (one model). The parent (engine-pool.mjs) talks to it over IPC.
 * Running sherpa in a child keeps a native crash or a disk read error from taking down the whole run: the parent
 * sees the child exit and falls back to the next voice.
 *
 * Messages in:   { type: 'init', spec }            spec.kind = 'sherpa' | 'fake'
 *                { type: 'synth', id, text, sid, speed, silenceScale, outFile }
 * Messages out:  { type: 'ready', sampleRate, numSpeakers, loadMs }   | { type: 'init-error', message }
 *                { type: 'done', id, samples, sampleRate, genMs }      | { type: 'error', id, message }
 *
 * Output WAVs are written to "<outFile>.tmp-<pid>" and renamed, so a half-written file is never left under the
 * final name.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { encodeWav16 } from './wav.mjs';

let engine = null;

function loadSherpa(spec) {
  const req = createRequire(path.join(spec.runtimeDir, 'package.json'));
  const sherpa = req('sherpa-onnx-node');
  const t0 = Date.now();
  const model =
    spec.engine === 'kokoro'
      ? { kokoro: { model: spec.files.model, voices: spec.files.voices, tokens: spec.files.tokens, dataDir: spec.files.dataDir, lexicon: spec.files.lexicon } }
      : { vits: { model: spec.files.model, tokens: spec.files.tokens, dataDir: spec.files.dataDir } };
  const tts = new sherpa.OfflineTts({ model: { ...model, numThreads: spec.threads, provider: 'cpu', debug: false }, maxNumSentences: 1 });
  return {
    sampleRate: tts.sampleRate,
    numSpeakers: tts.numSpeakers,
    loadMs: Date.now() - t0,
    generate: ({ text, sid, speed, silenceScale }) => {
      const audio = tts.generate({ text, generationConfig: new sherpa.GenerationConfig({ sid, speed, silenceScale }) });
      return { samples: audio.samples, sampleRate: audio.sampleRate };
    },
  };
}

/** Deterministic stand-in used by tests and --fake: a quiet tone whose length depends on the text. */
function loadFake(spec) {
  if (spec.mode === 'init-throw') throw new Error('fake engine: init failure');
  const sampleRate = spec.sampleRate ?? 24000;
  return {
    sampleRate,
    numSpeakers: spec.speakers ?? 1,
    loadMs: 0,
    generate: ({ text, sid, speed }) => {
      if (spec.mode === 'crash') process.exit(134); // simulates a native abort
      if (spec.mode === 'throw') throw new Error('fake engine: generate failure');
      if (spec.mode === 'empty') return { samples: new Float32Array(0), sampleRate };
      const seconds = (0.4 + 0.055 * text.length) / (speed || 1);
      const n = Math.round(seconds * sampleRate);
      const out = new Float32Array(n);
      const f = 180 + (sid % 7) * 40;
      for (let i = 0; i < n; i++) out[i] = 0.1 * Math.sin((2 * Math.PI * f * i) / sampleRate);
      return { samples: out, sampleRate };
    },
  };
}

process.on('message', (msg) => {
  if (msg.type === 'init') {
    try {
      engine = msg.spec.kind === 'fake' ? loadFake(msg.spec) : loadSherpa(msg.spec);
      process.send({ type: 'ready', sampleRate: engine.sampleRate, numSpeakers: engine.numSpeakers, loadMs: engine.loadMs });
    } catch (e) {
      process.send({ type: 'init-error', message: e?.message ?? String(e) });
    }
    return;
  }
  if (msg.type === 'synth') {
    try {
      if (!engine) throw new Error('engine not initialised');
      const t0 = Date.now();
      const { samples, sampleRate } = engine.generate(msg);
      if (!samples || samples.length === 0) throw new Error('engine returned empty audio');
      fs.mkdirSync(path.dirname(msg.outFile), { recursive: true });
      const tmp = `${msg.outFile}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, encodeWav16(samples, sampleRate));
      fs.renameSync(tmp, msg.outFile);
      process.send({ type: 'done', id: msg.id, samples: samples.length, sampleRate, genMs: Date.now() - t0 });
    } catch (e) {
      process.send({ type: 'error', id: msg.id, message: e?.message ?? String(e) });
    }
    return;
  }
  if (msg.type === 'exit') process.exit(0);
});

process.on('disconnect', () => process.exit(0));
