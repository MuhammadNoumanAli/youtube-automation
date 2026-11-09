// Phase 4a: video spec -> voice script / video config, templates, map marker spacing, expressions, stale refusal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { voiceScriptFromSpec, DEFAULT_CAST_VOICES } from '../spec.mjs';
import { scriptHash, generateVoice } from '../generate.mjs';
import { loadConfig } from '../config.mjs';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const esbuild = createRequire(path.join(moduleRoot, 'package.json'))('esbuild');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'spec-'));

async function bundleTs(entries) {
  const out = path.join(tmp(), 'bundle.mjs');
  esbuild.buildSync({
    stdin: { contents: entries.map((e) => `export * from './${e}';`).join('\n'), resolveDir: moduleRoot, loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, loader: { '.json': 'json' },
  });
  return import(pathToFileURL(out).href);
}
const eng = await bundleTs(['src/engine/spec-build.ts', 'src/engine/dialogue.ts', 'src/templates/index.ts', 'src/engine/countries.ts']);
const example = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'src/videos/specs/low-countries.spec.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

test('voice script from spec: lines in order, voices assigned, defaults distinct', () => {
  const s = voiceScriptFromSpec(example);
  assert.equal(s.videoId, 'LowCountries');
  assert.equal(s.lines.length, 11);
  assert.deepEqual(s.lines[0], { id: 'title-1', scene: 'title', speaker: 'narrator', text: example.scenes[0].lines[0].text });
  assert.equal(s.characters.belgium.voice.voice, 'am_puck');
  const noVoices = { ...clone(example), cast: example.cast.map((c) => ({ id: c.id })) };
  assert.deepEqual(Object.values(voiceScriptFromSpec(noVoices).characters).map((c) => c.voice.voice), DEFAULT_CAST_VOICES.slice(0, 3));
});

test('format, templates and expressions do not change the audio; text does', () => {
  const h = scriptHash(voiceScriptFromSpec(example));
  const vertical = { ...clone(example), format: '9:16' };
  const faces = clone(example);
  faces.scenes[1].lines[1].expression = 'sad';
  faces.scenes[3].setting = 'plain';
  assert.equal(scriptHash(voiceScriptFromSpec(vertical)), h);
  assert.equal(scriptHash(voiceScriptFromSpec(faces)), h);
  const edited = clone(example);
  edited.scenes[1].lines[1].text = 'Hallo!';
  assert.notEqual(scriptHash(voiceScriptFromSpec(edited)), h);
});

test('example spec builds in both formats with the same scenes and lines', () => {
  const wide = eng.buildFromSpec(example);
  const tall = eng.buildFromSpec(example, '9:16');
  assert.deepEqual(wide.problems, []);
  assert.deepEqual([wide.video.width, wide.video.height, tall.video.width, tall.video.height], [1920, 1080, 1080, 1920]);
  assert.equal(wide.video.scenes.length, 5);
  assert.deepEqual(wide.script.lines.map((l) => l.id), tall.script.lines.map((l) => l.id));
  assert.ok(wide.video.scenes.slice(0, -1).every((s) => s.transitionOut?.type === 'crossfade'));
  assert.equal(wide.video.scenes.at(-1).transitionOut, undefined);
  // first line of each scene carries the template's start hint
  for (const s of example.scenes) assert.equal(typeof wide.script.lines.find((l) => l.id === s.lines[0].id).at, 'number');
});

test('spec validation catches form mistakes with readable messages', () => {
  const bad = clone(example);
  bad.id = 'bad id!';
  bad.cast.push({ id: 'atlantis' });
  bad.scenes[2].countries = ['netherlands', 'japan'];
  bad.scenes[3].cast = ['netherlands', 'belgium', 'germany', 'netherlands'];
  bad.scenes[3].lines[0].speaker = 'france';
  bad.scenes[4].lines[0].id = 'chat-1';
  bad.scenes[4].lines[1].text = 'x'.repeat(95);
  const p = eng.buildFromSpec(bad).problems.join('\n');
  for (const re of [/id must be/, /unknown character "atlantis"/, /"japan" is not in the cast/, /dialogue needs 1-3 characters/, /speaker "france" is not in the cast/, /duplicate line id "chat-1"/, /longer than 90 characters/])
    assert.match(p, re);
});

test('map-focus markers never overlap (both formats), even for close neighbours', () => {
  for (const [w, h] of [[1920, 1080], [1080, 1920]]) {
    const r = 78 * (Math.min(w, h) / 1080);
    const { camera, markers } = eng.layoutMapMarkers(['netherlands', 'belgium', 'germany'].map((id) => eng.COUNTRY_GEO[id]), w, h, r);
    const my = (lat) => -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const px = markers.map((m) => ({ x: (m.lon * Math.PI * camera.scale) / 180, y: my(m.lat) * camera.scale }));
    for (let i = 0; i < px.length; i++)
      for (let j = i + 1; j < px.length; j++) assert.ok(Math.hypot(px[i].x - px[j].x, px[i].y - px[j].y) >= r * 2.3, `${w}x${h}: ${i}-${j} too close`);
  }
});

test('map fills stay distinct and never sea-blue', () => {
  assert.deepEqual(eng.distinctFills(['#f39c34', '#fdda24', '#ffce00']), ['#f39c34', '#fdda24', '#58d68d']);
  assert.notEqual(eng.distinctFills(['#7fb2ff'])[0], '#7fb2ff');
});

test('expressions switch at the measured line start, not the template estimate', () => {
  const built = eng.buildFromSpec(example);
  const lines = voiceScriptFromSpec(example).lines.map((l, i) => ({ ...l, file: `lines/${l.id}.wav`, durationMs: 1500 + i * 100 }));
  const manifest = { schemaVersion: 1, videoId: 'LowCountries', scriptFile: null, scriptHash: '', createdAt: '', test: true, complete: true, lines, attributions: [], credits: [] };
  const t = eng.applyVoiceTiming(built.video, built.script, manifest);
  assert.deepEqual(t.problems, []);
  const chat = t.video.scenes.find((s) => s.id === 'chat');
  const nl = chat.characters.find((c) => c.ref === 'netherlands');
  const start = t.lines.find((l) => l.id === 'chat-2').startFrame;
  assert.ok(nl.expressions.some((e) => e.frame === start && e.value === 'surprised'));
  assert.ok(nl.expressions.every((e, i, a) => i === 0 || a[i - 1].frame <= e.frame), 'sorted');
});

test('render refuses a spec whose dialogue changed after the audio was generated', async () => {
  const d = tmp();
  const cfg = loadConfig({ audioRoot: d, fake: { kokoro: 'ok', piper: 'ok' } });
  await generateVoice({ script: voiceScriptFromSpec(example), source: { kind: 'spec', file: 'x' }, cfg, log: () => {} });
  const edited = clone(example);
  edited.scenes[0].lines[0].text = 'Changed line.';
  const specFile = path.join(d, 'edited.spec.json');
  fs.writeFileSync(specFile, JSON.stringify(edited));
  const r = spawnSync(process.execPath, [path.join(moduleRoot, 'scripts', 'render.mjs'), '--spec', specFile, '--audio-dir', path.join(d, 'videos', 'LowCountries'), '--out', path.join(d, 'x.mp4'), '--cache', d], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /REFUSED: the spec's dialogue or voices changed/);
});
