// Timing from measured audio (src/engine/dialogue.ts), compiled on the fly with the esbuild that Remotion already
// installs, so no extra dependency is needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const esbuild = createRequire(path.join(moduleRoot, 'package.json'))('esbuild');

async function load(rel) {
  const src = fs.readFileSync(path.join(moduleRoot, rel), 'utf8');
  const { code } = esbuild.transformSync(src, { loader: 'ts', format: 'esm' });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dlg-')), 'mod.mjs');
  fs.writeFileSync(out, code);
  return import(pathToFileURL(out).href);
}
const { applyVoiceTiming } = await load('src/engine/dialogue.ts');

const video = {
  id: 'V', title: 'V', width: 1920, height: 1080, fps: 30,
  characters: [{ id: 'hero', name: 'Hero', flag: { layout: 'h-stripes', colors: ['#000'] }, accent: '#fff' }],
  scenes: [
    { id: 's1', title: 'one', durationInFrames: 100, background: { type: 'landscape' }, elements: [], characters: [], captions: [], transitionOut: { type: 'crossfade', durationInFrames: 20 } },
    { id: 's2', title: 'two', durationInFrames: 200, background: { type: 'landscape' }, elements: [], characters: [], captions: [{ from: 0, to: 10, text: 'kept' }] },
  ],
};
const script = {
  schemaVersion: 1, videoId: 'V',
  narrator: { voice: { engine: 'kokoro', voice: 'am_michael' } },
  characters: { hero: { voice: { engine: 'kokoro', voice: 'af_heart' } } },
  lines: [
    { id: 'a', scene: 's1', speaker: 'narrator', at: 10, text: 'First line.' },
    { id: 'b', scene: 's1', speaker: 'hero', at: 20, text: 'Second line, pushed back.' },
    { id: 'c', scene: 's2', speaker: 'hero', at: 50, text: 'Short.' },
  ],
};
const audio = (id, ms, extra = {}) => ({ id, scene: '', speaker: '', text: script.lines.find((l) => l.id === id).text, file: `lines/${id}.wav`, durationMs: ms, ...extra });
const manifest = (lines) => ({ schemaVersion: 1, videoId: 'V', scriptFile: null, scriptHash: '', createdAt: '', test: true, complete: true, lines, attributions: [], credits: [] });

test('lines use measured durations; later lines wait for earlier ones; scenes grow, never shrink', () => {
  const r = applyVoiceTiming(video, script, manifest([audio('a', 1000), audio('b', 2500), audio('c', 500)]));
  assert.deepEqual(r.problems, []);
  assert.equal(r.complete, true);
  const [a, b, c] = r.lines;
  assert.deepEqual([a.startFrame, a.frames], [10, 30]); // 1.0 s = 30 frames
  assert.deepEqual([b.startFrame, b.frames], [46, 75]); // waits for a (40) + 6 gap; ceil(2.5 s * 30)
  assert.deepEqual([c.startFrame, c.frames], [50, 15]);
  // scene 1: last line ends 121, + 15 tail + 20 transition = 156 > 100
  assert.equal(r.video.scenes[0].durationInFrames, 156);
  // scene 2: 65 + 15 = 80 < 200, unchanged
  assert.equal(r.video.scenes[1].durationInFrames, 200);
  // captions follow the audio exactly; existing captions are kept; narrator has no speaker
  assert.deepEqual(r.video.scenes[0].captions.map((x) => [x.from, x.to, x.speaker]), [[10, 40, undefined], [46, 121, 'hero']]);
  assert.deepEqual(r.video.scenes[1].captions.map((x) => x.text), ['kept', 'Short.']);
  assert.equal(video.scenes[0].durationInFrames, 100, 'input not mutated');
});

test('frame count rounds up so audio is never cut off', () => {
  const r = applyVoiceTiming(video, script, manifest([audio('a', 1001), audio('b', 10), audio('c', 33.4)]));
  assert.equal(r.lines[0].frames, 31);
  assert.equal(r.lines[1].frames, 1);
  assert.equal(r.lines[2].frames, 2);
});

test('same manifest, different format: identical timing (format only changes width/height)', () => {
  const m = manifest([audio('a', 1000), audio('b', 2500), audio('c', 500)]);
  const wide = applyVoiceTiming(video, script, m);
  const tall = applyVoiceTiming({ ...video, width: 1080, height: 1920 }, script, m);
  assert.deepEqual(tall.lines, wide.lines);
  assert.deepEqual(tall.video.scenes.map((s) => s.durationInFrames), wide.video.scenes.map((s) => s.durationInFrames));
});

test('without a manifest: estimated timing, marked incomplete', () => {
  const r = applyVoiceTiming(video, script, null);
  assert.equal(r.complete, false);
  assert.ok(r.lines.every((l) => l.estimated && l.file === null));
  assert.deepEqual(r.problems, []);
});

test('problems: missing audio, failed line, changed text, unknown scene/speaker, wrong video', () => {
  const bad = { ...script, lines: [...script.lines, { id: 'd', scene: 'nope', speaker: 'ghost', text: 'x' }] };
  const r = applyVoiceTiming(video, bad, { ...manifest([audio('a', 1000), audio('b', 1000, { text: 'old text' }), { ...audio('c', 0), error: 'all voices failed' }]), videoId: 'Other' });
  const p = r.problems.join('\n');
  assert.equal(r.complete, false);
  assert.match(p, /manifest is for "Other"/);
  assert.match(p, /line b: text changed/);
  assert.match(p, /line c: no audio in manifest \(all voices failed\)/);
  assert.match(p, /line d: unknown scene "nope"/);
  assert.match(p, /line d: unknown speaker "ghost"/);
});
