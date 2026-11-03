// Generation pipeline with test-tone engines in real child processes: caching, fallback on crash/failure, manifest.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../config.mjs';
import { checkScript, generateVoice, scriptHash } from '../generate.mjs';
import { readWavInfo } from '../wav.mjs';

const quiet = () => {};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'voice-test-'));
const script = {
  schemaVersion: 1,
  videoId: 'TestVideo',
  narrator: { voice: { engine: 'kokoro', voice: 'am_michael' } },
  characters: { hero: { voice: { engine: 'kokoro', voice: 'af_heart', speed: 1.05 } } },
  lines: [
    { id: 'a', scene: 's1', speaker: 'narrator', text: 'Once upon a time.' },
    { id: 'b', scene: 's1', speaker: 'hero', text: 'Hello, world! This line is a bit longer.' },
  ],
};

test('script validation catches bad input', () => {
  assert.deepEqual(checkScript(script), []);
  const bad = { ...script, lines: [{ id: 'a', scene: 's', speaker: 'villain', text: '' }, { id: 'a', scene: 's', speaker: 'narrator', text: 'x', voice: { engine: 'piper', model: 'en_US-lessac-medium' } }] };
  const p = checkScript(bad).join('\n');
  assert.match(p, /text empty/);
  assert.match(p, /duplicate id/);
  assert.match(p, /no voice assigned for speaker "villain"/);
  assert.match(p, /unknown Piper model/);
});

test('generates one WAV per line, measures duration from the file, then serves from cache', async () => {
  const cfg = loadConfig({ audioRoot: tmp(), fake: { kokoro: 'ok', piper: 'ok' } });
  const m1 = await generateVoice({ script, cfg, log: quiet });
  assert.equal(m1.complete, true);
  assert.equal(m1.lines.length, 2);
  for (const l of m1.lines) {
    const pub = path.join(cfg.audioRoot, 'videos', 'TestVideo', 'public', l.file);
    assert.ok(fs.existsSync(pub), 'line copied to the public folder');
    assert.equal(readWavInfo(pub).durationMs.toFixed(2), l.durationMs.toFixed(2));
    assert.equal(l.cached, false);
    assert.equal(l.engine, 'fake:kokoro');
    assert.equal(l.sampleRate, 24000);
    assert.ok(l.licence && l.attribution && l.language && l.speakerName && l.model);
  }
  assert.ok(m1.lines[1].durationMs > m1.lines[0].durationMs, 'longer text, longer audio');
  assert.equal(m1.scriptHash, scriptHash(script));
  const onDisk = JSON.parse(fs.readFileSync(path.join(cfg.audioRoot, 'videos', 'TestVideo', 'voice-manifest.json'), 'utf8'));
  assert.equal(onDisk.complete, true);

  const m2 = await generateVoice({ script, cfg, log: quiet });
  assert.ok(m2.lines.every((l) => l.cached), 'second run is fully cached');
  assert.deepEqual(m2.lines.map((l) => l.hash), m1.lines.map((l) => l.hash));

  const m3 = await generateVoice({ script: { ...script, videoId: 'TestVideoVertical' }, cfg, log: quiet });
  assert.ok(m3.lines.every((l) => l.cached), 'another video (e.g. the 9:16 version) reuses the same audio');

  const m4 = await generateVoice({ script, cfg, force: true, log: quiet });
  assert.ok(m4.lines.every((l) => !l.cached), '--force regenerates');
});

test('Kokoro worker crash falls back to Piper and is recorded; engine disabled after repeated crashes', async () => {
  const cfg = loadConfig({ audioRoot: tmp(), fake: { kokoro: 'crash', piper: 'ok' } });
  const three = { ...script, lines: [...script.lines, { id: 'c', scene: 's1', speaker: 'narrator', text: 'Third line.' }] };
  const m = await generateVoice({ script: three, cfg, log: quiet });
  assert.equal(m.complete, true);
  for (const l of m.lines) {
    assert.equal(l.fallbackUsed, true);
    assert.equal(l.model, 'en_US-libritts-high');
    assert.equal(l.licence, 'test only');
  }
  assert.match(m.lines[0].fallbackReason, /worker exited unexpectedly/);
  assert.match(m.lines[2].fallbackReason, /disabled after 2 crashes/);
  assert.equal(m.stats.fallbacks, 3);
});

test('Kokoro errors (throw, empty audio, failed load) all fall back', async () => {
  for (const mode of ['throw', 'empty', 'init-throw']) {
    const cfg = loadConfig({ audioRoot: tmp(), fake: { kokoro: mode, piper: 'ok' } });
    const m = await generateVoice({ script, cfg, log: quiet });
    assert.equal(m.complete, true, mode);
    assert.ok(m.lines.every((l) => l.fallbackUsed && l.model.startsWith('en_US-')), mode);
  }
});

test('when every voice fails the line is reported and the manifest is incomplete', async () => {
  const cfg = loadConfig({ audioRoot: tmp(), fake: { kokoro: 'throw', piper: 'throw' } });
  const m = await generateVoice({ script, cfg, log: quiet });
  assert.equal(m.complete, false);
  assert.equal(m.stats.failed, 2);
  assert.equal(m.lines[0].error, 'all voices failed');
  assert.equal(m.lines[0].attempts.length, 3); // kokoro, libritts, ljspeech
});

test('attribution is collected for CC BY voices only', async () => {
  const cfg = loadConfig({ audioRoot: tmp(), fake: { kokoro: 'ok', piper: 'ok' } });
  const s = {
    ...script,
    characters: { hero: { voice: { engine: 'piper', model: 'en_US-libritts-high', speaker: 5 } } },
  };
  const m = await generateVoice({ script: s, cfg, log: quiet });
  assert.equal(m.attributions.length, 1);
  assert.match(m.attributions[0], /LibriTTS.*CC BY 4\.0/);
  assert.equal(m.credits.length, 2);
});
