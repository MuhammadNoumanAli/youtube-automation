// Phase 4d: roast-battle template, line props, speech captions, choreography, and the larger country library.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { voiceScriptFromSpec } from '../spec.mjs';
import { scriptHash } from '../generate.mjs';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const esbuild = createRequire(path.join(moduleRoot, 'package.json'))('esbuild');

function bundle(contents, loader = 'ts') {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roast-')), 'bundle.mjs');
  esbuild.buildSync({
    stdin: { contents, resolveDir: moduleRoot, loader },
    bundle: true, format: 'esm', platform: 'node', outfile: out, loader: { '.json': 'json' }, jsx: 'automatic',
    nodePaths: [path.join(moduleRoot, 'node_modules')],
  });
  return import(pathToFileURL(out).href);
}
const eng = await bundle(
  ['src/engine/spec-build.ts', 'src/engine/dialogue.ts', 'src/engine/characters.ts', 'src/engine/countries.ts', 'src/templates/index.ts']
    .map((e) => `export * from './${e}';`).join('\n'),
);
const clone = (o) => JSON.parse(JSON.stringify(o));

const roast = {
  schemaVersion: 1,
  id: 'RoastTest',
  title: 'Italy vs France',
  format: '9:16',
  cast: [{ id: 'italy' }, { id: 'france' }],
  scenes: [
    {
      template: 'roast-battle',
      id: 'roast',
      countries: ['italy', 'france'],
      lines: [
        { id: 'r1', speaker: 'italy', text: 'You call that a croissant?', expression: 'angry' },
        { id: 'r2', speaker: 'france', text: 'Says the pineapple debate country.', prop: 'sweat' },
        { id: 'r3', speaker: 'italy', text: 'The crown stays in Rome.', prop: 'crown' },
        { id: 'r4', speaker: 'narrator', text: 'Next time: coffee.' },
      ],
    },
  ],
};

/** A fake manifest: every line 1.5 s with a flat loudness envelope. */
function manifestFor(spec) {
  const script = voiceScriptFromSpec(spec);
  return {
    videoId: spec.id,
    complete: true,
    lines: script.lines.map((l) => ({ id: l.id, text: l.text, file: `lines/${l.id}.wav`, durationMs: 1500, envelope: Array(75).fill(0.5), envelopeRate: 50 })),
  };
}

test('every character has a map entry and a flag; the old six are unchanged', () => {
  const ids = Object.keys(eng.CHARACTERS);
  assert.ok(ids.length >= 60, `only ${ids.length} countries`);
  for (const id of ids) {
    assert.ok(eng.COUNTRY_GEO[id], `${id}: no map data`);
    assert.match(eng.COUNTRY_GEO[id].iso, /^\d{3}$/);
    assert.ok(eng.CHARACTERS[id].flag?.layout, `${id}: no flag`);
    assert.match(eng.CHARACTERS[id].accent, /^#[0-9a-f]{6}$/i);
  }
  assert.deepEqual(eng.COUNTRY_GEO.netherlands, { iso: '528', lon: 5.6, lat: 52.2, scale: 6000 });
  assert.deepEqual(eng.CHARACTERS.japan.flag, { layout: 'disc', field: '#ffffff', disc: '#bc002d' });
});

test('every flag renders (server-side) without errors', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flags-')), 'flags.cjs');
  esbuild.buildSync({
    stdin: {
      contents: `import { renderToStaticMarkup } from 'react-dom/server';
     import { createElement } from 'react';
     import { Flag } from './src/character/flags';
     import { CHARACTERS } from './src/engine/characters';
     export const svgs = Object.fromEntries(Object.entries(CHARACTERS).map(([id, c]) => [id, renderToStaticMarkup(createElement('svg', null, createElement(Flag, { r: 100, flag: c.flag, uid: id })))]));`,
      resolveDir: moduleRoot,
      loader: 'tsx',
    },
    bundle: true, format: 'cjs', platform: 'node', outfile: out, jsx: 'automatic', nodePaths: [path.join(moduleRoot, 'node_modules')],
  });
  const m = createRequire(import.meta.url)(out);
  for (const [id, svg] of Object.entries(m.svgs)) assert.ok(svg.length > 60 && !svg.includes('NaN'), `${id}: bad svg`);
});

test('roast battle builds in both formats: close-up map, two balls facing each other, speech captions', () => {
  for (const fmt of ['9:16', '16:9']) {
    const built = eng.buildFromSpec(roast, fmt);
    assert.deepEqual(built.problems, []);
    const scene = built.video.scenes[0];
    assert.equal(scene.background.type, 'worldMap');
    assert.equal(scene.captionStyle, 'speech');
    assert.equal(scene.choreography.kind, 'roast');
    assert.deepEqual(scene.background.highlights.map((h) => h.countryId), ['380', '250']);
    const [it, fr] = scene.characters;
    assert.notEqual(it.facing, fr.facing, 'the two balls face each other');
    assert.ok(built.script.lines.find((l) => l.id === 'r3').prop === 'crown');
  }
});

test('measured timing: speech bubbles, lunges, flinches and props land on the real line times', () => {
  const built = eng.buildFromSpec(roast, '9:16');
  const t = eng.applyVoiceTiming(built.video, built.script, manifestFor(roast));
  assert.deepEqual(t.problems, []);
  const scene = t.video.scenes[0];
  const byId = Object.fromEntries(t.lines.map((l) => [l.id, l]));
  const caps = scene.captions;
  assert.deepEqual(caps.map((c) => c.style ?? 'bottom'), ['speech', 'speech', 'speech', 'bottom'], 'narrator stays a bottom caption');
  const [it, fr] = scene.characters;
  const home = scene.choreography.home;
  // Italy lunges towards France during r1: some key between its start and end is off the home position
  const r1 = byId.r1;
  const lunged = it.position.lon.filter((k) => k.frame > r1.startFrame && k.frame <= r1.startFrame + r1.frames);
  assert.ok(lunged.some((k) => Math.abs(k.value - home.italy.lon) > 0.05), 'speaker lunges');
  assert.ok(it.position.lon.every((k, i, a) => i === 0 || k.frame > a[i - 1].frame), 'keys are in order');
  // France flinches while Italy speaks, and vice versa
  assert.ok(fr.shakes.some((s) => s.from >= r1.startFrame && s.from < r1.startFrame + r1.frames));
  assert.ok(it.shakes.some((s) => s.from >= byId.r2.startFrame));
  // props: sweat on France around r2, crown on Italy from r3 to the end
  assert.deepEqual(fr.props.map((p) => p.kind), ['sweat']);
  assert.equal(fr.props[0].from, byId.r2.startFrame);
  assert.ok(fr.props[0].to < scene.durationInFrames);
  assert.equal(it.props[0].kind, 'crown');
  assert.ok(it.props[0].to >= scene.durationInFrames, 'crown stays to the end');
});

test('props and expressions never change the audio (same voice script hash)', () => {
  const plain = clone(roast);
  for (const l of plain.scenes[0].lines) {
    delete l.prop;
    delete l.expression;
  }
  assert.equal(scriptHash(voiceScriptFromSpec(roast)), scriptHash(voiceScriptFromSpec(plain)));
});

test('roast validation: exactly two different countries, speakers from the pair, known props, no narrator props', () => {
  const bad = clone(roast);
  bad.cast.push({ id: 'spain' });
  bad.scenes[0].countries = ['italy', 'italy'];
  bad.scenes[0].lines[0].speaker = 'spain';
  bad.scenes[0].lines[1].prop = 'rocket';
  bad.scenes[0].lines[3].prop = 'crown';
  const p = eng.buildFromSpec(bad).problems.join('\n');
  for (const re of [/exactly 2 different countries/, /"spain" is not one of the two countries/, /unknown prop "rocket"/, /narrator cannot hold a prop/])
    assert.match(p, re);
});

test('roast layout keeps the balls apart on screen even for tiny neighbours (both formats)', () => {
  const pairs = [['netherlands', 'belgium'], ['israel', 'egypt'], ['usa', 'canada'], ['pakistan', 'india'], ['uk', 'ireland']];
  for (const [a, b] of pairs)
    for (const [w, h] of [[1920, 1080], [1080, 1920]]) {
      const r = 110;
      const { camera, homes } = eng.layoutRoast(eng.COUNTRY_GEO[a], eng.COUNTRY_GEO[b], w, h, r);
      const px = homes.map((p) => ({ x: (p.lon * Math.PI) / 180 * camera.scale, y: -Math.log(Math.tan(Math.PI / 4 + (p.lat * Math.PI) / 360)) * camera.scale }));
      assert.ok(Math.hypot(px[0].x - px[1].x, px[0].y - px[1].y) >= r * 2.5, `${a}/${b} ${w}x${h} too close`);
      assert.ok(camera.scale >= 250 && camera.scale <= 9000);
    }
});

test('moves: auto picks charge/hop/deflate/lean; charges bump the other ball with flash, burst and punch sound', () => {
  const spec = clone(roast);
  spec.scenes[0].lines = [
    { id: 'm1', speaker: 'italy', text: 'Charge line.', expression: 'angry' },
    { id: 'm2', speaker: 'france', text: 'Sad line.', expression: 'sad' },
    { id: 'm3', speaker: 'italy', text: 'Winner line.', prop: 'crown' },
    { id: 'm4', speaker: 'france', text: 'Plain line.', move: 'none' },
    { id: 'm5', speaker: 'italy', text: 'Forced lean.', expression: 'angry', move: 'lean' },
  ];
  const built = eng.buildFromSpec(spec, '9:16');
  assert.deepEqual(built.problems, []);
  const t = eng.applyVoiceTiming(built.video, built.script, manifestFor(spec));
  const scene = t.video.scenes[0];
  const at = Object.fromEntries(t.lines.map((l) => [l.id, l]));
  const [it, fr] = scene.characters;
  // charge (m1): France is hit -> impact, flash, burst, whoosh + punch
  const hit = at.m1.startFrame + 8;
  assert.ok(fr.impacts.includes(hit));
  assert.ok(scene.flashes.includes(hit));
  assert.equal(scene.bursts[0].ref, 'france');
  assert.ok(scene.sfxCues.some((c) => c.kind === 'whoosh' && c.frame === at.m1.startFrame));
  assert.ok(scene.sfxCues.some((c) => c.kind === 'punch' && c.frame === hit));
  // deflate (m2): France shrinks; sad sound
  assert.ok(fr.scale.some((k) => k.value < 0.9 && k.frame > at.m2.startFrame));
  assert.ok(scene.sfxCues.some((c) => c.kind === 'sad' && c.frame === at.m2.startFrame));
  // hop (m3): Italy hops; boing + ding for the crown
  assert.ok(it.hops.some((h) => h.from === at.m3.startFrame));
  assert.ok(scene.sfxCues.some((c) => c.kind === 'boing') && scene.sfxCues.some((c) => c.kind === 'ding'));
  // only one charge in total (m5 forced to lean, m4 none)
  assert.equal(scene.flashes.length, 1);
  // tracks stay ordered and the camera keys too
  for (const keys of [it.position.lon, fr.position.lon, scene.background.camera.scale, scene.background.camera.lon])
    assert.ok(keys.every((k, i, a) => i === 0 || k.frame > a[i - 1].frame));
});

test('unknown move is rejected; moves never change the audio', () => {
  const bad = clone(roast);
  bad.scenes[0].lines[0].move = 'backflip';
  assert.match(eng.buildFromSpec(bad).problems.join('\n'), /unknown move "backflip"/);
  const moved = clone(roast);
  moved.scenes[0].lines[0].move = 'hop';
  assert.equal(scriptHash(voiceScriptFromSpec(moved)), scriptHash(voiceScriptFromSpec(roast)));
});

test('sound-effect kit: original, deterministic, every kind written as a valid WAV', async () => {
  const { writeSfxKit, SFX_KINDS } = await import('../sfx.mjs');
  const { readWavInfo } = await import('../wav.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-'));
  const a = writeSfxKit(dir);
  const first = Object.fromEntries(SFX_KINDS.map((k) => [k, fs.readFileSync(path.join(dir, a.files[k]))]));
  const b = writeSfxKit(dir);
  assert.deepEqual(Object.keys(b.files).sort(), [...SFX_KINDS].sort());
  for (const k of SFX_KINDS) {
    assert.ok(fs.readFileSync(path.join(dir, b.files[k])).equals(first[k]), `${k} not deterministic`);
    const info = readWavInfo(path.join(dir, b.files[k]));
    assert.ok(info.durationMs > 50 && info.durationMs < 2000, `${k}: ${info.durationMs} ms`);
  }
  assert.match(a.license, /Original/);
});
