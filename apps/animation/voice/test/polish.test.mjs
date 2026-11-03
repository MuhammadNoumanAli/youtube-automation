// Phase 3.5: talking envelope, licence-checked music/SFX library, talk segments and music ducking.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeEnvelope, ENVELOPE_RATE } from '../envelope.mjs';
import { checkItem, prepareAssets } from '../library.mjs';
import { loadConfig } from '../config.mjs';
import { generateVoice } from '../generate.mjs';
import { encodeWav16 } from '../wav.mjs';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const esbuild = createRequire(path.join(moduleRoot, 'package.json'))('esbuild');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'polish-'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function loadTs(rel) {
  const { code } = esbuild.transformSync(fs.readFileSync(path.join(moduleRoot, rel), 'utf8'), { loader: 'ts', format: 'esm' });
  const out = path.join(tmp(), 'mod.mjs');
  fs.writeFileSync(out, code);
  return import(pathToFileURL(out).href);
}
const { applyVoiceTiming, buildAudioPlan, musicVolumeAt } = await loadTs('src/engine/dialogue.ts');

test('envelope follows loudness: silence 0, loud 1, ENVELOPE_RATE values per second', () => {
  const sr = 24000;
  const s = new Float32Array(sr); // 1 s: 0.5 s silence, 0.5 s tone
  for (let i = sr / 2; i < sr; i++) s[i] = 0.5 * Math.sin((2 * Math.PI * 200 * i) / sr);
  const env = computeEnvelope(encodeWav16(s, sr));
  assert.equal(env.length, ENVELOPE_RATE);
  assert.ok(env.slice(0, ENVELOPE_RATE / 2 - 1).every((v) => v === 0), 'silent half is 0');
  assert.ok(env.slice(ENVELOPE_RATE / 2 + 2).every((v) => v > 0.9), 'loud half near 1');
  assert.ok(env.every((v) => v >= 0 && v <= 1));
});

function makeItem(dir, extra = {}) {
  const f = path.join(dir, 'music.wav');
  fs.writeFileSync(f, encodeWav16(new Float32Array(4800).fill(0.1), 48000));
  return { id: 'm', kind: 'music', file: f, sha256: sha(f), licence: 'CC0', source: 'https://example.org', commercialUse: true, ...extra };
}

test('library refuses unlicensed, non-commercial, unchecked or changed files', () => {
  const d = tmp();
  assert.deepEqual(checkItem(makeItem(d), 'music'), []);
  assert.match(checkItem(makeItem(d, { commercialUse: false }), 'music').join(), /commercialUse/);
  assert.match(checkItem(makeItem(d, { licence: '' }), 'music').join(), /licence/);
  assert.match(checkItem(makeItem(d, { source: undefined }), 'music').join(), /source/);
  assert.match(checkItem(makeItem(d, { sha256: 'x' }), 'music').join(), /sha256/);
  assert.match(checkItem(makeItem(d, { sha256: 'a'.repeat(64) }), 'music').join(), /does not match/);
  assert.match(checkItem(makeItem(d, { attributionRequired: true }), 'music').join(), /attribution/);
  assert.match(checkItem(makeItem(d), 'sfx').join(), /not sfx/);
  assert.match(checkItem(undefined, 'music').join(), /not in src\/audio-library.json/);
});

test('accepted assets are copied (not moved) into public/library under their checksum', () => {
  const d = tmp();
  const item = makeItem(d, { attributionRequired: true, attribution: 'Music: X (CC BY)' });
  const pub = path.join(d, 'public');
  const r = prepareAssets({ script: { music: { id: 'm' }, sfx: [] }, library: [item], publicDir: pub });
  assert.deepEqual(r.problems, []);
  assert.ok(fs.existsSync(item.file), 'original still there');
  assert.ok(fs.existsSync(path.join(pub, r.assets.music.file)));
  assert.equal(r.assets.music.durationMs, 100);
  assert.deepEqual(r.attributions, ['Music: X (CC BY)']);
});

test('a refused asset makes the manifest incomplete (so it cannot be rendered)', async () => {
  const d = tmp();
  const lib = path.join(d, 'lib.json');
  fs.writeFileSync(lib, JSON.stringify({ items: [makeItem(d, { commercialUse: false })] }));
  const cfg = loadConfig({ audioRoot: d, fake: { kokoro: 'ok', piper: 'ok' }, libraryFile: lib });
  const script = {
    schemaVersion: 1, videoId: 'T', narrator: { voice: { engine: 'kokoro', voice: 'am_michael' } }, characters: {},
    lines: [{ id: 'a', scene: 's', speaker: 'narrator', text: 'Hello.' }], music: { id: 'm' },
  };
  const m = await generateVoice({ script, cfg, log: () => {} });
  assert.equal(m.complete, false);
  assert.match(m.assetProblems[0], /commercialUse/);
  assert.ok(m.lines[0].envelope.length > 0 && m.lines[0].envelopeRate === ENVELOPE_RATE);
});

const video = {
  id: 'V', title: 'V', width: 1920, height: 1080, fps: 30,
  characters: [{ id: 'hero', name: 'Hero', flag: { layout: 'h-stripes', colors: ['#000'] }, accent: '#fff' }],
  scenes: [{ id: 's1', title: 'one', durationInFrames: 300, background: { type: 'landscape' }, elements: [], captions: [],
    characters: [{ ref: 'hero', position: { space: 'stage', x: [{ frame: 0, value: 0 }], y: [{ frame: 0, value: 0 }] }, expressions: [{ frame: 0, value: 'happy' }] }] }],
};
const script = {
  schemaVersion: 1, videoId: 'V', narrator: { voice: { engine: 'kokoro', voice: 'am_michael' } }, characters: { hero: { voice: { engine: 'kokoro', voice: 'af_heart' } } },
  lines: [
    { id: 'n', scene: 's1', speaker: 'narrator', at: 10, text: 'Narration.' },
    { id: 'h', scene: 's1', speaker: 'hero', at: 100, text: 'Hero speaks.' },
  ],
};
const manifest = {
  schemaVersion: 1, videoId: 'V', scriptFile: null, scriptHash: '', createdAt: '', test: true, complete: true, attributions: [], credits: [],
  lines: [
    { id: 'n', scene: 's1', speaker: 'narrator', text: 'Narration.', file: 'lines/n.wav', durationMs: 1000, envelope: [1, 1], envelopeRate: 50 },
    { id: 'h', scene: 's1', speaker: 'hero', text: 'Hero speaks.', file: 'lines/h.wav', durationMs: 2000, envelope: [0, 0.5, 1], envelopeRate: 50 },
  ],
  assets: {
    music: { id: 'm', file: 'library/m.wav', durationMs: 1000, licence: 'CC0', source: 's', attribution: null, attributionRequired: false, volume: 0.3, duckVolume: 0.06, fadeInFrames: 30, fadeOutFrames: 30 },
    sfx: [{ id: 'x', file: 'library/x.wav', durationMs: 100, licence: 'CC0', source: 's', attribution: null, attributionRequired: false, scene: 's1', at: 50, volume: 0.8 }],
  },
};

test('talk segments go to the speaking character only (narrator never animates a ball)', () => {
  const t = applyVoiceTiming(video, script, manifest);
  const hero = t.video.scenes[0].characters[0];
  assert.equal(hero.talk.length, 1);
  assert.deepEqual([hero.talk[0].from, hero.talk[0].to, hero.talk[0].rate], [100, 160, 50]);
  assert.deepEqual(hero.talk[0].envelope, [0, 0.5, 1]);
  assert.equal(video.scenes[0].characters[0].talk, undefined, 'input not mutated');
});

test('music ducks under speech with ramps, fades at both ends; SFX placed on the global timeline', () => {
  const t = applyVoiceTiming(video, script, manifest);
  const plan = buildAudioPlan(t.lines, { s1: 0 }, 300, manifest);
  assert.deepEqual(plan.music.speech, [[10, 40], [100, 160]]);
  assert.deepEqual(plan.sfx, [{ id: 'x', file: 'library/x.wav', from: 50, volume: 0.8 }]);
  const v = (f) => Math.round(musicVolumeAt(f, plan.music) * 1000) / 1000;
  assert.equal(v(0), 0); // fade-in start
  assert.equal(v(70), 0.3); // no speech: full music level
  assert.equal(v(120), 0.06); // speech: ducked
  assert.ok(v(96) > 0.06 && v(96) < 0.3, 'ramping down before speech');
  assert.equal(v(300), 0); // fade-out end
  assert.equal(buildAudioPlan(t.lines, { s1: 0 }, 300, { ...manifest, assets: { music: null, sfx: [] } }).music, null);
});
