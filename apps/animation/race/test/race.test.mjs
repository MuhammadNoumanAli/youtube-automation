// node --test race/test/*.test.mjs     (no models, no browser, no rendering needed; takes a few seconds)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { autoEliminations, countryCatalog, knownCharacterIds, loadRace, planEliminations, simulateRace, simulateStage } from '../simulate.mjs';
import { buildStage, defaultBallRadius, LAYOUT, TEMPLATES } from '../stages.mjs';
import { gateClosed, World } from '../physics.mjs';
import { makeRng } from '../rng.mjs';

const hash = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const tmpRace = (obj) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'race-')), 'r.race.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
};
const ids = knownCharacterIds();

test('the country catalog has every country once, with a flag or a project character', () => {
  assert.ok(ids.length >= 197, `only ${ids.length} countries`);
  assert.equal(new Set(ids).size, ids.length);
  const cat = countryCatalog();
  assert.equal(new Set(cat.map((c) => c.id)).size, cat.length);
  for (const c of cat) assert.ok(['Europe', 'Asia', 'Africa', 'Americas', 'Oceania'].includes(c.continent), c.id);
  for (const id of ['south_korea', 'new_zealand', 'tanzania', 'jamaica', 'nepal']) assert.ok(ids.includes(id), id);
});

test('elimination plans: per stage, number of stages, percent', () => {
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const per = planEliminations(170, { eliminate: 4 });
  assert.equal(per.length, 43);
  assert.equal(sum(per), 169);
  assert.equal(per[per.length - 1], 1);
  const st = planEliminations(170, { stages: 12 });
  assert.equal(st.length, 12);
  assert.equal(sum(st), 169);
  const pc = planEliminations(170, { eliminatePercent: 10 });
  assert.equal(sum(pc), 169);
  assert.equal(pc[0], 17);
  assert.equal(planEliminations(5, { eliminate: 1 }).length, 4);
  assert.throws(() => planEliminations(10, { eliminatePercent: 0 }));
});

test('jump pads launch a landing ball, but not a rolling one; bumpers kick', () => {
  const fall = new World({ elements: [{ type: 'pad', a: [0, 100], b: [400, 100], r: 5, kick: 600, cooldown: 1.5 }], fps: 30 });
  const b = fall.addBall(200, 0, 12);
  let minVy = 0;
  for (let i = 0; i < 20; i++) {
    fall.stepFrame();
    minVy = Math.min(minVy, b.vy);
  }
  assert.ok(minVy < -550, `pad launch speed ${minVy}`);
  assert.equal(fall.takeHits().length, 1);

  const roll = new World({ elements: [{ type: 'pad', a: [0, 100], b: [400, 100], r: 5, kick: 600, cooldown: 1.5 }], fps: 30 });
  const rb = roll.addBall(50, 100 - 5 - 12, 12);
  rb.vx = 200;
  for (let i = 0; i < 20; i++) roll.stepFrame();
  assert.equal(roll.takeHits().length, 0);
  assert.ok(rb.y > 70, 'rolling ball stays on the pad');

  const bump = new World({ elements: [{ type: 'bumper', c: [200, 100], r: 9, kick: 450, cooldown: 0.35 }], fps: 30 });
  const bb = bump.addBall(203, 40, 12);
  for (let i = 0; i < 15; i++) bump.stepFrame();
  assert.ok(bump.takeHits().length >= 1);
});

test('twists can be switched off', () => {
  for (const template of TEMPLATES) {
    const on = buildStage({ template, rng: makeRng(4), ballR: 13, count: 60 });
    const off = buildStage({ template, rng: makeRng(4), ballR: 13, count: 60, twists: { pads: false, bumpers: false, shortcuts: false } });
    assert.equal(off.elements.filter((e) => e.type === 'pad' || e.type === 'bumper' || e.role === 'trapdoor').length, 0, template);
    if (template !== 'funnels' && template !== 'mix') assert.ok(on.elements.some((e) => e.type === 'pad' || e.type === 'bumper' || e.role === 'trapdoor'), template);
  }
});

test('comeback start: the slowest of the last stage start at the front of the hopper', () => {
  const alive = ['a', 'b', 'c', 'd', 'e', 'f'];
  const prevRanking = ['f', 'e', 'x', 'd', 'c', 'b', 'a'];
  const { data } = simulateStage({ index: 2, template: 'plinko', alive, eliminate: 1, seed: 1, fps: 30, ballR: 20, startOrder: 'comeback', prevRanking });
  assert.deepEqual(data.balls, ['a', 'b', 'c', 'd', 'e', 'f']);
  const r = simulateStage({ index: 2, template: 'plinko', alive, eliminate: 1, seed: 1, fps: 30, ballR: 20, startOrder: 'random', prevRanking });
  assert.equal(r.data.balls.length, 6);
});

test('auto eliminations leave exactly one winner', () => {
  for (const [n, s] of [[10, 3], [100, 99], [196, 10], [58, 57], [5, 1]]) {
    const e = autoEliminations(n, s);
    assert.equal(e.length, s);
    assert.equal(e.reduce((a, b) => a + b, 0), n - 1);
    assert.ok(e.every((x) => x >= 1));
  }
  assert.throws(() => autoEliminations(10, 10));
});

test('ball radius shrinks with the field size', () => {
  assert.equal(defaultBallRadius(10), 20);
  assert.equal(defaultBallRadius(100), 13);
  assert.equal(defaultBallRadius(196), 10);
});

test('race files are validated', () => {
  assert.throws(() => loadRace(tmpRace({ id: 'x', countries: ['atlantis', ids[0]] })), /unknown countries/);
  assert.throws(() => loadRace(tmpRace({ id: 'x', countries: [ids[0], ids[0]] })), /duplicate/);
  assert.throws(() => loadRace(tmpRace({ id: 'Bad Id', countries: ids.slice(0, 3) })), /race.id/);
  assert.throws(() => loadRace(tmpRace({ id: 'x', countries: ids.slice(0, 4), stages: 2, eliminate: [3, 1] })), /cannot eliminate/);
  const ok = loadRace(tmpRace({ id: 'x', countries: ids.slice(0, 6), stages: 2 }));
  assert.deepEqual(ok.eliminate, [3, 2]);
});

test('same seed gives exactly the same race; another seed gives another race', () => {
  const race = loadRace(tmpRace({ id: 'det', countries: ids.slice(0, 8), stages: 2, templates: ['plinko', 'funnels'], seed: 11 }));
  const stagesA = [];
  const stagesB = [];
  const a = simulateRace(race, (d) => stagesA.push(hash(d)));
  const b = simulateRace(race, (d) => stagesB.push(hash(d)));
  assert.equal(hash(a), hash(b));
  assert.deepEqual(stagesA, stagesB);
  const c = simulateRace({ ...race, seed: 12 }, () => {});
  assert.notEqual(hash(c.standings), hash(a.standings));
});

test('standings rank every country once, winner first', () => {
  const race = loadRace(tmpRace({ id: 'st', countries: ids.slice(0, 7), stages: 3, seed: 3 }));
  const meta = simulateRace(race, () => {});
  assert.equal(meta.standings.length, 7);
  assert.equal(new Set(meta.standings.map((s) => s.id)).size, 7);
  assert.equal(meta.standings[0].id, meta.winner);
  assert.equal(meta.standings[0].out, null);
  assert.equal(meta.segments.length, 3 + 2);
  assert.equal(meta.totalFrames, meta.segments.reduce((x, s) => x + s.frames, 0));
});

test('every template finishes without timing out and keeps the balls on the course', () => {
  for (const template of TEMPLATES) {
    for (const n of [12, 60]) {
      const alive = Array.from({ length: n }, (_, i) => `c${i}`);
      const { data, summary } = simulateStage({ index: 1, template, alive, eliminate: 2, seed: 5, fps: 30, ballR: defaultBallRadius(n) });
      assert.equal(summary.timedOut, false, `${template} with ${n} balls timed out`);
      assert.equal(summary.eliminated.length, 2);
      assert.equal(summary.qualified.length, n - 2);
      for (const t of data.tracks) {
        for (let f = 0; f < data.frames; f++) {
          const x = t[f * 3] / 2;
          const y = t[f * 3 + 1] / 2;
          assert.ok(x > LAYOUT.x0 && x < LAYOUT.x1 && y < LAYOUT.floorY, `${template}: ball left the course at frame ${f} (${x}, ${y})`);
        }
      }
      const finishes = data.events.filter((e) => e.type === 'finish');
      assert.ok(finishes.every((e) => e.frame <= data.decisionFrame), 'nobody finishes after the cut-off');
      assert.equal(finishes.length, summary.timedOut ? finishes.length : n - 2);
    }
  }
});

test('periodic gates open for the configured share of each period', () => {
  const g = { closed: { period: 2, open: 0.5, phase: 0 } };
  assert.equal(gateClosed(g, 0.1), false);
  assert.equal(gateClosed(g, 1.0), true);
  assert.equal(gateClosed(g, 2.2), false);
  assert.equal(gateClosed({ closed: { until: 1 } }, 0.5), true);
  assert.equal(gateClosed({ closed: { until: 1 } }, 1.5), false);
});

test('seesaw tilts under a landing ball and springs back; wheel is spun by falling balls; belt carries balls', () => {
  const see = { type: 'rotor', c: [400, 300], len: 140, r: 6, arms: 1, inertia: 14000, damping: 40000, spring: 300000, rest: 0, maxAngle: 0.45 };
  const w = new World({ elements: [see], fps: 30 });
  w.addBall(480, 200, 13);
  let maxTheta = 0;
  for (let f = 0; f < 90; f++) {
    w.stepFrame();
    maxTheta = Math.max(maxTheta, w.rotors[0].theta);
  }
  assert.ok(maxTheta > 0.3, `tilt ${maxTheta}`);
  assert.ok(Math.abs(w.rotors[0].theta) < 0.15, 'back near level after the ball left');

  const wheel = { type: 'rotor', c: [400, 300], len: 70, r: 6, arms: 3, inertia: 9000, damping: 2500, spring: 0, rest: 0, maxAngle: null };
  const w2 = new World({ elements: [wheel], fps: 30 });
  for (let i = 0; i < 6; i++) w2.addBall(430 + i * 3, 100 - i * 40, 13);
  for (let f = 0; f < 60; f++) w2.stepFrame();
  assert.ok(Math.abs(w2.rotors[0].theta) > 1, 'wheel turned');

  const belt = new World({ elements: [{ type: 'belt', a: [0, 300], b: [800, 300], r: 6, speed: 300, flip: 0 }], fps: 30 });
  const bb = belt.addBall(100, 280, 13);
  for (let f = 0; f < 45; f++) belt.stepFrame();
  assert.ok(bb.x > 300, `carried to ${bb.x}`);
});

test('mixed stages: a new course every stage, no repeated hurdles, never too tall, no jams', () => {
  const seen = new Set();
  const names = [];
  let avoid = [];
  for (let i = 1; i <= 30; i++) {
    const { data, summary } = simulateStage({
      index: i,
      template: 'mix',
      alive: ids.slice(0, 25),
      eliminate: 3,
      seed: 9,
      fps: 30,
      ballR: defaultBallRadius(25),
      avoidBands: avoid,
      takenNames: names,
    });
    assert.ok(data.bands.length >= 2 && data.bands.length <= 5, data.bands.join('>'));
    assert.equal(new Set(data.bands).size, data.bands.length, `repeated hurdle in ${data.bands.join('>')}`);
    assert.ok(!data.bands.some((b) => avoid.includes(b)), `hurdle reused from the previous stage: ${data.bands.join('>')}`);
    assert.equal(summary.timedOut, false, data.bands.join('>'));
    names.push(summary.name);
    avoid = data.bands;
    seen.add(data.bands.join('>'));
  }
  assert.ok(seen.size >= 28, `only ${seen.size} different courses in 30 stages`);
  assert.equal(new Set(names).size, names.length, `duplicate stage names: ${names.join(', ')}`);
});

test('a whole race never reuses the previous stage hurdles and never repeats a stage name', () => {
  const race = loadRace(tmpRace({ id: 'variety', countries: ids.slice(0, 12), stages: 10, templates: ['mix'], seed: 21 }));
  const names = [];
  let prev = [];
  simulateRace(race, (data, summary) => {
    const bands = data.bands ?? []; // the grand final is a classic long course even when only mix was picked
    assert.ok(!bands.some((b) => prev.includes(b)), `stage ${summary.index} reused ${bands.join('>')} after ${prev.join('>')}`);
    assert.ok(!names.includes(summary.name), `duplicate stage name ${summary.name}`);
    assert.equal(summary.timedOut, false, `stage ${summary.index} timed out`);
    names.push(summary.name);
    prev = bands;
  });
  assert.equal(names.length, 10);
});
