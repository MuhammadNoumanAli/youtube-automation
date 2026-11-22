#!/usr/bin/env node
/**
 * Marble race simulator: runs the whole tournament in plain Node BEFORE rendering and writes a replay that the
 * Remotion renderer (src/race/) only draws. Same race file + same seed = exactly the same race.
 *
 *   node race/simulate.mjs --race race/races/test-10.race.json --out D:\YouTubeStudio\races\test-10 [--seed 7]
 *
 * Writes into <out>\replay\ (the renderer's public folder; scripts/render-race.mjs puts its segments next to it):
 *   race.json          meta: competitors, segments (intro, stages, podium) with frame counts, results, standings
 *   stage-001.json ... one file per stage: course elements, per-frame ball positions, spinner/gate states, events
 *   sfx/*.wav          the project's own synthesised sound kit (voice/sfx.mjs)
 *
 * Elimination: each stage removes a fixed number of balls (the last ones to cross the finish line). "auto" spreads
 * (countries - 1) eliminations over the stages, so the last stage leaves exactly one winner.
 * Never deletes anything; only writes into --out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from './rng.mjs';
import { World, spinnerAngle, gateClosed, pendulumAngle, sliderOffset, beltDirection } from './physics.mjs';
import { buildStage, defaultBallRadius, DEFAULT_TWISTS, LAYOUT, TEMPLATES, TEMPLATE_BANDS } from './stages.mjs';
import { setBandBounds } from './bands.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const moduleRoot = path.resolve(here, '..');
export const REPLAY_VERSION = 1;

/** The race country catalog (src/race/countries.json): [{ id, name, continent, flag? }]. */
export function countryCatalog() {
  return JSON.parse(fs.readFileSync(path.join(moduleRoot, 'src', 'race', 'countries.json'), 'utf8')).countries;
}

/**
 * Every country a race can use: the catalog plus the project's characters (src/engine/characters.ts, read as text;
 * the simulator does not run TypeScript).
 */
export function knownCharacterIds() {
  const src = fs.readFileSync(path.join(moduleRoot, 'src', 'engine', 'characters.ts'), 'utf8');
  const chars = [...src.matchAll(/\bid:\s*'([a-z0-9_-]+)'/g)].map((m) => m[1]);
  const fromCatalog = countryCatalog()
    .filter((c) => c.flag || chars.includes(c.id))
    .map((c) => c.id);
  return [...new Set([...fromCatalog, ...chars])];
}

/**
 * How many are knocked out in each stage, so that exactly one country is left at the end. One of:
 *   { eliminate: [3, 3, 2, 1] }        explicit list
 *   { eliminate: 4 }                   4 per stage; the number of stages follows (the last stage takes the rest)
 *   { eliminatePercent: 10 }           10% of the remaining field per stage (at least 1)
 *   { stages: 12 } or eliminate "auto" spread evenly over that many stages
 */
export function planEliminations(count, { stages, eliminate, eliminatePercent } = {}) {
  if (count < 2) throw new Error('a race needs at least 2 countries');
  if (Array.isArray(eliminate)) return eliminate;
  if (typeof eliminate === 'number') {
    if (!Number.isInteger(eliminate) || eliminate < 1) throw new Error('eliminate per stage must be a whole number of at least 1');
    const out = [];
    for (let left = count; left > 1; ) {
      const n = Math.min(eliminate, left - 1);
      out.push(n);
      left -= n;
    }
    return out;
  }
  if (eliminatePercent !== undefined) {
    const p = Number(eliminatePercent);
    if (!(p > 0 && p < 100)) throw new Error('eliminatePercent must be between 0 and 100');
    const out = [];
    for (let left = count; left > 1; ) {
      const n = Math.min(left - 1, Math.max(1, Math.round((left * p) / 100)));
      out.push(n);
      left -= n;
    }
    return out;
  }
  return autoEliminations(count, stages ?? Math.min(3, count - 1));
}

/** Split (count - 1) eliminations over `stages` stages; earlier stages take the remainder. */
export function autoEliminations(count, stages) {
  const total = count - 1;
  if (stages < 1) throw new Error('a race needs at least 1 stage');
  if (stages > total) throw new Error(`${count} countries can have at most ${total} stages (one elimination each)`);
  const base = Math.floor(total / stages);
  const rem = total % stages;
  return Array.from({ length: stages }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Template per stage, picked at random (from the seed) among the allowed ones, never the same classic course twice in
 * a row. 'mix' (a new hurdle course every stage) is about 70% of stages when all types are allowed.
 * The grand final (last stage, more than one stage in the race) runs on a long course: zigzag if allowed, else gates.
 */
function stageTemplates(race, rng) {
  const allowed = Array.isArray(race.templates) && race.templates.length ? race.templates : TEMPLATES;
  for (const t of allowed) if (!TEMPLATES.includes(t)) throw new Error(`unknown template "${t}"`);
  const out = [];
  for (let i = 0; i < race.stages; i++) {
    const options = allowed.length > 1 ? allowed.filter((t) => t === 'mix' || t !== out[i - 1]) : allowed;
    const weighted = options.flatMap((t) => (t === 'mix' ? Array(24).fill(t) : [t]));
    out.push(rng.pick(weighted));
  }
  // the final always runs on a long course for drama, even when only mixed (or one classic type) was picked
  const finalT = race.finalTemplate ?? (allowed.includes('zigzag') ? 'zigzag' : allowed.includes('gates') ? 'gates' : 'zigzag');
  if (race.stages > 1 && finalT) out[out.length - 1] = finalT;
  return out;
}

const q2 = (v) => Math.round(v * 2); // half-pixel integers keep the replay small

/** Full course walls at module load: courseWidth squeezes the course towards this centre and then restores it. */
const FULL = { x0: LAYOUT.x0, x1: LAYOUT.x1 };

/**
 * Bounds of a course `width` (fraction of the normal course, 0.6..1) centred in the screen. A narrow course makes the
 * field go almost single file. Builders read LAYOUT while they run, so the caller swaps LAYOUT.x0/x1 around buildStage.
 */
function courseBounds(width) {
  const f = Math.max(0.5, Math.min(1, Number(width) || 1));
  const cx = (FULL.x0 + FULL.x1) / 2;
  const half = ((FULL.x1 - FULL.x0) * f) / 2;
  return width === 1 ? { ...FULL } : { x0: Math.round(cx - half), x1: Math.round(cx + half) };
}

/**
 * Simulate one stage.
 * @param {object} p
 * @param {string[]} p.alive country ids racing in this stage
 * @param {number} p.eliminate how many are knocked out
 */
export function simulateStage({
  index,
  template,
  alive,
  eliminate,
  seed,
  fps,
  ballR,
  maxSeconds = 90,
  holdSeconds = 2.5,
  twists = DEFAULT_TWISTS,
  startOrder = 'comeback',
  prevRanking = null,
  avoidBands = [],
  takenNames = [],
  courseWidth = 1,
  tight = false,
}) {
  if (eliminate < 1 || eliminate >= alive.length) throw new Error(`stage ${index}: cannot eliminate ${eliminate} of ${alive.length}`);
  const rng = makeRng(`${seed}:stage:${index}`);
  const course = courseBounds(courseWidth);
  let stage;
  // builders size themselves off LAYOUT, so narrow the course only while they run; physics keeps the replay's bounds
  try {
    LAYOUT.x0 = course.x0;
    LAYOUT.x1 = course.x1;
    setBandBounds(course.x0, course.x1);
    stage = buildStage({ template, rng, ballR, count: alive.length, twists, avoidBands, takenNames, tight });
  } finally {
    LAYOUT.x0 = FULL.x0;
    LAYOUT.x1 = FULL.x1;
    setBandBounds(FULL.x0, FULL.x1);
  }
  const world = new World({ elements: stage.elements, fps });
  // spawn slot 0 is the bottom row of the hopper (released first). "comeback": last stage's slowest start in front.
  const shuffled = rng.shuffle(alive);
  const order =
    startOrder === 'comeback' && prevRanking
      ? prevRanking.filter((id) => alive.includes(id)).reverse()
      : shuffled;
  const balls = order.map((id, i) => {
    const [x, y] = stage.spawn[i];
    const b = world.addBall(x + rng.range(-1.5, 1.5), y, ballR);
    b.id = id;
    b.finished = -1;
    b.check = { x, y, slow: 0 };
    return b;
  });

  const qualifyCount = alive.length - eliminate;
  const gateFrame = Math.round(stage.gateOpenAt * fps);
  const maxFrames = Math.round(maxSeconds * fps);
  const holdFrames = Math.round(holdSeconds * fps);
  const tracks = balls.map(() => []);
  const MOVING = new Set(['spinner', 'gate', 'rotor', 'pendulum', 'slider', 'belt']);
  const kinIdx = stage.elements.map((el, i) => (MOVING.has(el.type) ? i : -1)).filter((i) => i >= 0);
  const kin = Object.fromEntries(kinIdx.map((i) => [i, []]));
  const events = [{ frame: gateFrame, type: 'gate' }];
  const finishOrder = [];
  let decisionFrame = -1;
  let endFrame = -1;
  let timedOut = false;
  let nudges = 0;
  let ranking = null;
  let boosts = 0;
  const lastBoost = new Map();

  for (let f = 0; ; f++) {
    const t = f / fps;
    balls.forEach((b, i) => tracks[i].push(q2(b.x), q2(b.y), Math.round(((b.angle * 180) / Math.PI) % 360)));
    for (const i of kinIdx) {
      const el = stage.elements[i];
      // angles in tenths of a degree, slider offset in half pixels, gate 1 = closed, belt 1 / -1 = direction
      const deg10 = (rad) => Math.round(((rad * 180) / Math.PI) * 10);
      kin[i].push(
        el.type === 'spinner'
          ? deg10(spinnerAngle(el, t))
          : el.type === 'rotor'
            ? deg10(world.rotorAngle(i))
            : el.type === 'pendulum'
              ? deg10(pendulumAngle(el, t))
              : el.type === 'slider'
                ? Math.round(sliderOffset(el, t) * 2)
                : el.type === 'belt'
                  ? beltDirection(el, t)
                  : gateClosed(el, t)
                    ? 1
                    : 0,
      );
    }

    for (const b of balls) {
      // after the cut-off nobody else qualifies: late arrivals are not recorded as finishers
      if (decisionFrame < 0 && b.finished < 0 && b.y > stage.finishY && b.x > course.x0 && b.x < course.x1) {
        // a ball crossing on the same frame as the last qualifying place keeps its distance in `rest`,
        // but is not billed as a finisher (and cannot make the finish list one longer than the cut)
        if (finishOrder.length >= qualifyCount) continue;
        b.finished = f;
        finishOrder.push(b.id);
        events.push({ frame: f, type: 'finish', id: b.id, place: finishOrder.length });
      }
    }

    if (decisionFrame < 0) {
      timedOut = f >= maxFrames;
      if (finishOrder.length >= qualifyCount || timedOut) {
        decisionFrame = f;
        // finishers in order, then the rest by how far down the course they are (further = better)
        const rest = balls.filter((b) => b.finished < 0).sort((a, b) => b.y - a.y || a.x - b.x);
        ranking = [...finishOrder, ...rest.map((b) => b.id)];
        const out = ranking.slice(qualifyCount);
        events.push({ frame: f, type: 'eliminated', ids: out, timedOut });
        endFrame = f + holdFrames;
      }
    }
    if (f === endFrame) break;

    // pad / bumper hits during the previous frame (one event per ball per ~1/3 s, for the effects and sound)
    for (const h of world.takeHits()) {
      boosts++;
      if (f - (lastBoost.get(h.ball.id) ?? -99) < 10) continue;
      lastBoost.set(h.ball.id, f);
      events.push({ frame: f, type: 'boost', id: h.ball.id, el: h.el });
    }

    // anti-jam: a ball that has barely moved for 4 s after the gate opened gets a small random kick
    if (f > gateFrame && f % fps === 0) {
      for (const b of balls) {
        if (b.finished >= 0) continue;
        const moved = Math.hypot(b.x - b.check.x, b.y - b.check.y);
        b.check.slow = moved < Math.max(4, ballR * 0.25) ? b.check.slow + 1 : 0;
        b.check.x = b.x;
        b.check.y = b.y;
        if (b.check.slow >= 4) {
          b.vx += rng.range(-140, 140);
          b.vy -= rng.range(140, 240);
          b.check.slow = 0;
          nudges++;
          if (process.env.RACE_DEBUG) console.log(`    nudge ${b.id} f${f} at ${b.x.toFixed(0)},${b.y.toFixed(0)}`);
        }
      }
    }
    world.stepFrame();
  }

  const qualified = ranking.slice(0, qualifyCount);
  const eliminated = ranking.slice(qualifyCount);
  return {
    data: {
      version: REPLAY_VERSION,
      index,
      template,
      name: stage.name,
      bands: stage.bands ?? null,
      theme: stage.theme,
      fps,
      frames: endFrame + 1,
      gateFrame,
      decisionFrame,
      ballR,
      finishY: stage.finishY,
      course,
      hopper: stage.hopper,
      elements: stage.elements,
      balls: order,
      tracks,
      kin,
      events,
      ranking,
      qualified,
      eliminated,
      timedOut,
    },
    summary: {
      index,
      template,
      name: stage.name,
      bands: stage.bands ?? null,
      frames: endFrame + 1,
      alive: alive.length,
      eliminate,
      qualified,
      eliminated,
      ranking,
      timedOut,
      nudges,
      boosts,
    },
  };
}

/** Validate and normalise a race file. */
export function loadRace(raceFile, overrides = {}) {
  const race = { ...JSON.parse(fs.readFileSync(raceFile, 'utf8')), ...overrides };
  const known = knownCharacterIds();
  const countries = race.countries === 'all' ? known : race.countries;
  if (!Array.isArray(countries) || countries.length < 2) throw new Error('race.countries must be "all" or a list of at least 2 ids');
  const unknown = countries.filter((c) => !known.includes(c));
  if (unknown.length) throw new Error(`unknown countries (add them to src/engine/characters.ts first): ${unknown.join(', ')}`);
  const dupes = countries.filter((c, i) => countries.indexOf(c) !== i);
  if (dupes.length) throw new Error(`duplicate countries: ${dupes.join(', ')}`);
  if (!race.id || !/^[a-z0-9-]+$/.test(race.id)) throw new Error('race.id must be lowercase letters, digits and dashes');
  const eliminate = planEliminations(countries.length, {
    stages: race.stages,
    eliminate: race.eliminate === 'auto' ? undefined : race.eliminate,
    eliminatePercent: race.eliminatePercent,
  });
  if (Array.isArray(race.eliminate) && race.stages !== undefined && race.eliminate.length !== race.stages)
    throw new Error('race.eliminate has a different number of entries than race.stages');
  const stages = eliminate.length;
  let left = countries.length;
  eliminate.forEach((n, i) => {
    if (!Number.isInteger(n) || n < 1 || n >= left) throw new Error(`stage ${i + 1}: cannot eliminate ${n} of ${left}`);
    left -= n;
  });
  const courseWidth = race.courseWidth ?? 1;
  if (!(courseWidth >= 0.5 && courseWidth <= 1)) throw new Error('race.courseWidth must be between 0.5 (narrowest) and 1 (full width)');
  // "single" squeezes every vertical passage to one ball: slower, more traffic-jam drama on small fields
  const flow = race.flow ?? 'wide';
  if (!['wide', 'single'].includes(flow)) throw new Error('race.flow must be "wide" (default) or "single" (one-ball passages)');
  return {
    id: race.id,
    title: race.title ?? `${countries.length} Countries Marble Race`,
    seed: race.seed ?? 1,
    fps: race.fps ?? 30,
    countries,
    stages,
    eliminate,
    templates: race.templates,
    finalTemplate: race.finalTemplate,
    twists: { ...DEFAULT_TWISTS, ...(race.twists ?? {}) },
    startOrder: race.startOrder ?? 'comeback',
    ballRadius: race.ballRadius ?? defaultBallRadius(countries.length),
    maxStageSeconds: race.maxStageSeconds ?? 90,
    introSeconds: race.introSeconds ?? 6,
    podiumSeconds: race.podiumSeconds ?? 10,
    courseWidth: race.courseWidth ?? 1,
    flow,
    finalists: left,
  };
}

/** Run the whole race. onStage(data, summary) is called after each stage (so the CLI can stream files to disk). */
export function simulateRace(race, onStage = () => {}) {
  const rng = makeRng(`${race.seed}:race`);
  const templates = stageTemplates(race, rng);
  let alive = race.countries.slice();
  let prevRanking = null;
  const summaries = [];
  const out = []; // elimination order, last stage first when reversed
  let lastBands = [];
  const usedNames = [];
  for (let i = 0; i < race.stages; i++) {
    const { data, summary } = simulateStage({
      index: i + 1,
      template: templates[i],
      alive,
      eliminate: race.eliminate[i],
      seed: race.seed,
      fps: race.fps,
      ballR: race.ballRadius,
      maxSeconds: race.maxStageSeconds,
      twists: race.twists,
      startOrder: race.startOrder,
      prevRanking,
      avoidBands: lastBands,
      takenNames: usedNames,
      courseWidth: race.courseWidth,
      tight: race.flow === 'single',
    });
    onStage(data, summary);
    summaries.push(summary);
    out.push(summary.eliminated);
    usedNames.push(summary.name);
    lastBands = summary.bands ?? TEMPLATE_BANDS[templates[i]] ?? [];
    alive = summary.qualified;
    prevRanking = summary.ranking;
  }
  // standings: survivors of the last stage in their finish order, then each stage's eliminated, latest first
  const last = summaries[summaries.length - 1];
  const order = [...last.qualified, ...out.slice().reverse().flat()];
  const stageOf = Object.fromEntries(summaries.flatMap((s) => s.eliminated.map((id) => [id, s.index])));
  const standings = order.map((id, i) => ({ place: i + 1, id, out: stageOf[id] ?? null }));
  const fps = race.fps;
  const segments = [
    { kind: 'intro', frames: Math.round(race.introSeconds * fps) },
    ...summaries.map((s) => ({ kind: 'stage', index: s.index, file: stageFile(s.index), frames: s.frames })),
    { kind: 'podium', frames: Math.round(race.podiumSeconds * fps) },
  ];
  return {
    version: REPLAY_VERSION,
    id: race.id,
    title: race.title,
    seed: race.seed,
    fps,
    width: LAYOUT.width,
    height: LAYOUT.height,
    ballRadius: race.ballRadius,
    competitors: race.countries,
    stageCount: race.stages,
    segments,
    totalFrames: segments.reduce((a, s) => a + s.frames, 0),
    stages: summaries.map(({ ranking, ...s }) => s),
    standings,
    winner: standings[0].id,
  };
}

export const stageFile = (i) => `stage-${String(i).padStart(3, '0')}.json`;

// ------------------------------------------------------------------ CLI
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, cur, i, arr) => {
      if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
      return acc;
    }, []),
  );
  if (!args.race || !args.out) {
    console.error('usage: node race/simulate.mjs --race <file.race.json> --out <folder> [--seed <n>]');
    process.exit(1);
  }
  const overrides = args.seed !== undefined ? { seed: Number.isNaN(Number(args.seed)) ? args.seed : Number(args.seed) } : {};
  const race = loadRace(path.resolve(args.race), overrides);
  const outDir = path.join(path.resolve(args.out), 'replay');
  fs.mkdirSync(outDir, { recursive: true });
  console.log(
    `[race] ${race.title}: ${race.countries.length} countries, ${race.stages} stages, seed ${race.seed}, ball r=${race.ballRadius}` +
      `${race.flow === 'single' ? ', one-ball passages' : ''}`,
  );
  const t0 = Date.now();
  const meta = simulateRace(race, (data, s) => {
    fs.writeFileSync(path.join(outDir, stageFile(s.index)), JSON.stringify(data));
    const flag = s.timedOut ? ' (TIMEOUT: ranked by position)' : '';
    console.log(
      `  stage ${s.index}/${race.stages} ${s.template.padEnd(8)} "${s.name}": ${s.alive} -> ${s.qualified.length}, ` +
        `${(s.frames / race.fps).toFixed(1)} s, out: ${s.eliminated.join(', ')}${s.nudges ? `, ${s.nudges} anti-jam nudges` : ''}${flag}`,
    );
  });
  const { writeSfxKit } = await import('../voice/sfx.mjs');
  meta.sfx = writeSfxKit(outDir);
  fs.writeFileSync(path.join(outDir, 'race.json'), JSON.stringify(meta, null, 1));
  const totalSecs = Math.round(meta.totalFrames / meta.fps);
  console.log(`[race] winner: ${meta.winner}. Video length ${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s (${meta.totalFrames} frames).`);
  console.log(`[race] simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${outDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`[race] ERROR: ${e.message}`);
    process.exit(1);
  });
}
