/**
 * Stage library for the marble race. Each template builds one single-screen course from a seeded RNG, so 99 stages
 * from 5 templates still all look different. Clearances are computed from the ball radius, so the same template
 * works for 10 big balls or 196 small ones.
 *
 * Screen layout (1920x1080): the course uses x 40..1480, the leaderboard panel sits on the right (x 1500+).
 * Every stage: hopper at the top (its floor is a gate that opens at GATE_OPEN_S), obstacles in the middle,
 * finish line at FINISH_Y and a collecting tray at the bottom.
 */

import { composeMix } from './bands.mjs';
import { LAYOUT } from './stages-layout.mjs';

export { LAYOUT };

export const GATE_OPEN_S = 1.6;
/** 'mix' = a new course every stage, stacked from the hurdle library in bands.mjs. The others are classic courses. */
export const TEMPLATES = ['mix', 'zigzag', 'plinko', 'funnels', 'gates', 'spinners'];

const NAMES = {
  zigzag: ['Switchback', 'The Long Slide', 'Zigzag Drop', 'Serpentine', 'Hairpin Run', 'Slalom Steps', 'Drop & Turn', 'The Wringer', 'Ricochet Ramps', 'Snake Pit'],
  plinko: ['Peg Storm', 'Pinball Rain', 'Bounce House', 'The Pegboard', 'Chaos Pins', 'Peg Ripper', 'Pinball Pit', 'Lucky Bounce', 'Nail Biter', 'Peg Avalanche'],
  funnels: ['Bottleneck', 'Triple Funnel', 'The Squeeze', 'Hourglass', 'Traffic Jam', 'Funnel Web', 'Choke Point', 'The Grinder', 'Sand Timer', 'Neck & Neck'],
  gates: ['Trapdoor Alley', 'Red Light Ramps', 'Timing Gates', 'Stop & Go', 'Gatekeeper', 'Green Means Go', 'Door Dash', 'Shutter Run', 'Red Light Riot', 'Hatch Drop'],
  spinners: ['Windmill Field', 'Spin Cycle', 'Blender', 'Rotor Garden', 'Propeller Maze', 'Spin Doctor', 'Twister', 'Pinwheel Panic', 'Whirlpool', 'Rotor Riot'],
};

export const THEMES = [
  { name: 'midnight', bg1: '#0f1b3d', bg2: '#1f3a73', wall: '#e8eefc', accent: '#ffcc33' },
  { name: 'sunset', bg1: '#3b1030', bg2: '#a83f39', wall: '#ffe9d6', accent: '#ffd166' },
  { name: 'forest', bg1: '#0d2b1f', bg2: '#2e6b4a', wall: '#e9f7ee', accent: '#f4d35e' },
  { name: 'ocean', bg1: '#062a3a', bg2: '#0f6c8c', wall: '#e0f7ff', accent: '#ff9f1c' },
  { name: 'grape', bg1: '#1d0f3b', bg2: '#5b2a86', wall: '#f1e6ff', accent: '#5ef38c' },
  { name: 'steel', bg1: '#1b1f24', bg2: '#47515e', wall: '#f2f4f7', accent: '#ff5d5d' },
  { name: 'desert', bg1: '#4a2c0f', bg2: '#b9782f', wall: '#fff4e0', accent: '#3ad1ff' },
];

/** Ball radius for a field size: up to 46 balls -> 20 px, 100 -> 13 px, 196 -> 10 px. */
export function defaultBallRadius(count) {
  return Math.round(Math.max(10, Math.min(20, 26 - count * 0.13)));
}

const W = LAYOUT.wallR;
const wall = (ax, ay, bx, by, r = W) => ({ type: 'wall', a: [ax, ay], b: [bx, by], r });

/** Twists are on by default; a race file can switch each off ("twists": { "pads": false }). */
export const DEFAULT_TWISTS = { pads: true, bumpers: true, shortcuts: true };

/**
 * A straight ramp from (sx, sy) to (ex, ey) made of pieces: plain wall, except where `cuts` put something else
 * (a jump pad, a trapdoor). cuts: [{ u0, u1, make(a, b) }] with 0 <= u0 < u1 <= 1, sorted, not overlapping.
 */
function rampPieces(sx, sy, ex, ey, cuts) {
  const P = (u) => [sx + (ex - sx) * u, sy + (ey - sy) * u];
  const out = [];
  let u = 0;
  for (const c of cuts) {
    if (c.u0 > u) out.push(wall(...P(u), ...P(c.u0)));
    out.push(c.make(P(c.u0), P(c.u1)));
    u = c.u1;
  }
  if (u < 1) out.push(wall(...P(u), ...P(1)));
  return out;
}
const padCut = (u0, u1, kick) => ({ u0, u1, make: (a, b) => ({ type: 'pad', a, b, r: W, kick, cooldown: 1.5 }) });
const trapdoorCut = (u0, u1, closed) => ({ u0, u1, make: (a, b) => ({ type: 'gate', a, b, r: W, closed, role: 'trapdoor' }) });

/** Outer walls and the collecting tray, shared by every template. */
function frameElements() {
  const { x0, x1, floorY } = LAYOUT;
  return [wall(x0, -400, x0, floorY), wall(x1, -400, x1, floorY), wall(x0, floorY, x1, floorY)];
}

/** Hopper (two side walls + a floor gate) sized for `count` balls, and the spawn points inside it. */
function hopper(cx, count, r, gateOpenAt) {
  const spacing = 2 * r + 4;
  const rowsMax = Math.max(1, Math.floor(150 / spacing));
  const cols = Math.ceil(count / rowsMax);
  const width = cols * spacing + 14;
  const { x0: X0, x1: X1, hopperBottom: yb } = LAYOUT;
  const left = Math.max(X0 + 20, Math.min(X1 - 20 - width, cx - width / 2));
  const right = left + width;
  const elements = [
    wall(left, 40, left, yb),
    wall(right, 40, right, yb),
    { type: 'gate', a: [left - 6, yb], b: [right + 6, yb], r: W, closed: { until: gateOpenAt }, role: 'hopper' },
  ];
  const spawn = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    spawn.push([left + W + 2 + r + col * spacing, yb - W - 1 - r - row * spacing]);
  }
  return { elements, spawn, box: { x0: left, x1: right, y0: 40, y1: yb }, width };
}

/**
 * A long, gently sloped ramp under a peg or spinner board: everyone lands on it and rolls to one exit, so the
 * order keeps changing until the finish line. The board above must end at y <= RUNOUT_TOP - 2.5 ball diameters.
 */
const RUNOUT_TOP = 800;
function runout(rng, r, twists) {
  const { x0: X0, x1: X1 } = LAYOUT;
  const gap = Math.max(4 * r + 20, 110);
  const drop = 75;
  const [sx, ex] = rng() < 0.5 ? [X0, X1 - gap] : [X1, X0 + gap];
  // a jump pad in the middle: balls dropping onto it are launched back into the crowd
  const u0 = rng.range(0.3, 0.45);
  const cuts = twists.pads ? [padCut(u0, u0 + 0.2, rng.range(480, 560))] : [];
  return rampPieces(sx, RUNOUT_TOP, ex, RUNOUT_TOP + drop, cuts);
}

// ------------------------------------------------------------------ templates
// Each returns { elements, hopperCx } (hopper and frame are added by buildStage).

function zigzag(rng, r, count, twists, withGates = false, tight = false) {
  const { x0: X0, x1: X1 } = LAYOUT;
  const top = 290;
  const bottom = 900;
  // tight races: the drop chute at the end of each ramp is barely wider than a ball, so the field falls through
  // one at a time. The tunnel stays tall enough to fit a hammer over the ramp below (a hammer inside a one-ball
  // chute would seal it: there is no room for a ball to get around the bob).
  const gap = (tight ? Math.max(2.8 * r, 66) : Math.max(5 * r, 120)) + rng.range(0, tight ? 8 : 30);
  // as steep as possible while keeping room for a ball between one ramp and the next; at least ~3.5 degrees
  // the tunnel under the ramp above must be tall enough that balls cannot wedge (arch) against its tip
  const headroom = tight ? 4.8 * r + 18 : 5 * r + 20 + (count > 40 ? r : 0);
  const minDrop = 0.05 * (X1 - X0 - gap); // ~3 degrees
  const dropFor = (k) => Math.min(((bottom - top) / k) * 0.6, (bottom - top) / k - headroom);
  const options = [3, 4, 5].filter((k) => dropFor(k) >= minDrop);
  const k = options.length ? rng.pick(options) : 3;
  const spacing = (bottom - top) / k;
  const drop = Math.max(dropFor(k), minDrop);
  const firstDir = rng() < 0.5 ? 1 : -1;
  const elements = [];
  for (let i = 0; i < k; i++) {
    const dir = i % 2 === 0 ? firstDir : -firstDir;
    const y = top + i * spacing;
    const [sx, ex] = dir === 1 ? [X0, X1 - gap] : [X1, X0 + gap];
    const len = Math.hypot(ex - sx, drop);
    const cuts = [];
    // jump pad where the balls from the ramp above land: they bounce up into the others, the order shuffles
    if (twists.pads && i > 0 && rng() < 0.85) cuts.push(padCut(0, Math.min(0.3, (gap + 30) / len), rng.range(520, 680)));
    // shortcut trapdoor: opens now and then; whoever is rolling over it drops straight to the next ramp
    if (twists.shortcuts && i < k - 1 && rng() < 0.55) {
      const w = Math.max(5.6 * r, 70) / len;
      const uc = rng.range(0.4, 0.62);
      const period = rng.range(3.5, 5.5);
      cuts.push(trapdoorCut(uc - w / 2, uc + w / 2, { period, open: rng.range(0.6, 0.9), phase: rng.range(0, period) }));
    }
    elements.push(...rampPieces(sx, y, ex, y + drop, cuts));
    // a hammer swings over the landing zone of every ramp that receives the drop above. With only a few balls
    // left there is no queue to throttle, so the bob hangs low enough (4 px past the top of a rolling ball) that
    // it really knocks a ball back up the ramp; the swing is wide and the arm long, so the bob rises and steps
    // aside at each extreme and a ball always has a window to slip through. In a crowded field the lane has to
    // stay open, so the bob sits one ball width up and only taps balls that hop under it.
    if (tight && i > 0) {
      const few = count <= 4;
      const u = rng.range(0.05, 0.22);
      const surf = y + drop * u;
      // a small bob on a long arm: it dips 4 px into the top of a rolling ball at the bottom of the swing, and
      // at each extreme it lifts clear and steps ~35 px aside, so a ball always has a window to get past
      const bobR = few ? Math.max(12, 0.55 * r) : Math.max(12, 0.85 * r);
      const clearance = few ? 2 * r - 4 : 2 * r + 1;
      const arm = few ? 38 + Math.max(0, r - 20) * 0.5 : Math.max(28, Math.min(40, 0.3 * r + 24));
      elements.push({
        type: 'pendulum',
        pivot: [sx + (ex - sx) * u, surf - clearance - bobR - arm],
        len: arm,
        rod: 4,
        bobR,
        amp: few ? rng.range(1.0, 1.15) : rng.range(0.75, 1.0),
        period: rng.range(1.2, 1.8),
        phase: rng.range(0, Math.PI * 2),
      });
    }
    // a kicker peg in the drop column now and then
    // only where both passages next to it stay wider than a ball (+ margin), or balls wedge against the wall
    const passage = (gap - 2 * 8 - 2 * W) / 2 - 6;
    // ...and only with room under it for a ball rolling along the next ramp
    const pegY = y + drop + (spacing - drop) / 2;
    const below = y + spacing - pegY - 8 - W;
    if (i < k - 1 && count <= 40 && passage >= 2 * r + 12 && below >= 2 * r + 12 && rng() < 0.5) {
      const colX = dir === 1 ? X1 - gap / 2 : X0 + gap / 2;
      elements.push({ type: 'peg', c: [colX + rng.range(-6, 6), pegY], r: 8 });
    }
    // gates on most ramps, but never all of them with a big crowd (throughput)
    const gateHere = withGates && (i === 0 || rng() < (count > 40 ? 0.5 : 0.75));
    if (gateHere) {
      const gx = ex - dir * (r + 10);
      const u = (gx - sx) / (ex - sx);
      const gy = y + drop * u;
      const height = Math.max(4.5 * r, 70);
      const period = rng.range(2.0, 3.0);
      elements.push({
        type: 'gate',
        a: [gx, gy - height],
        b: [gx, gy],
        r: 6,
        closed: { period, open: period * rng.range(0.55, 0.7), phase: rng.range(0, period) },
      });
    }
  }
  const hopperCx = firstDir === 1 ? X0 + 360 : X1 - 360;
  return { elements, hopperCx };
}

function plinko(rng, r, count, twists) {
  const { x0: X0, x1: X1 } = LAYOUT;
  const pegR = 7;
  const colSp = Math.max(72, 4.6 * r + 2 * pegR);
  const rowSp = colSp * 0.8;
  const elements = [];
  const minX = X0 + W + pegR + 2.3 * r;
  const maxX = X1 - W - pegR - 2.3 * r;
  let row = 0;
  const lastRow = RUNOUT_TOP - W - pegR - 5 * r;
  for (let y = 300; y <= lastRow; y += rowSp, row++) {
    const offset = row % 2 ? colSp / 2 : 0;
    for (let x = X0 + colSp / 2 + offset; x <= X1 - colSp / 2; x += colSp) {
      if (x < minX || x > maxX) continue;
      if (rng() < 0.04) continue; // a few missing pegs make each board different
      const c = [x + rng.range(-3, 3), y + rng.range(-3, 3)];
      // pinball bumpers among the pegs kick balls sideways and up
      if (twists.bumpers && rng() < 0.15) elements.push({ type: 'bumper', c, r: 9, kick: rng.range(420, 520), cooldown: 0.35 });
      else elements.push({ type: 'peg', c, r: pegR });
    }
  }
  elements.push(...runout(rng, r, twists));
  return { elements, hopperCx: rng.range(X0 + 420, X1 - 420) };
}

function funnels(rng, r, count, twists, tight = false) {
  const { x0: X0, x1: X1 } = LAYOUT;
  const k = 3;
  const h = 150;
  // tight races: one ball high between funnels and a neck that only fits one at a time
  const between = tight ? Math.max(2.4 * r + 10, 40) : Math.max(4 * r, 70);
  const neck = tight ? Math.max(2.3 * r + 10, 40) : Math.max(4.8 * r, 60);
  const elements = [];
  let y = 280;
  let prevNeck = null;
  for (let i = 0; i < k; i++) {
    const nx = rng.range(X0 + 260, X1 - 260);
    const lx = nx - neck / 2;
    const rx = nx + neck / 2;
    // jump pad where the stream from the neck above lands on this funnel
    const pad = (sx, ex) => {
      if (!twists.pads || prevNeck === null || rng() < 0.35) return [];
      const lo = Math.min(sx, ex);
      const hi = Math.max(sx, ex);
      if (prevNeck - 60 < lo + 20 || prevNeck + 60 > hi - 20) return [];
      const u0 = (prevNeck - 60 - sx) / (ex - sx);
      const u1 = (prevNeck + 60 - sx) / (ex - sx);
      return [padCut(Math.min(u0, u1), Math.max(u0, u1), rng.range(380, 440))];
    };
    elements.push(...rampPieces(X0, y, lx, y + h, pad(X0, lx)), ...rampPieces(X1, y, rx, y + h, pad(X1, rx)));
    prevNeck = nx;
    y += h + between;
  }
  return { elements, hopperCx: rng.range(X0 + 420, X1 - 420) };
}

function spinners(rng, r, count, twists) {
  const { x0: X0, x1: X1 } = LAYOUT;
  const L = rng.range(55, 68);
  const spacing = 2 * L + Math.max(5 * r, 110);
  const xa = X0 + L + 3 * r + 24;
  const xb = X1 - L - 3 * r - 24;
  const cols = Math.max(2, Math.floor((xb - xa) / spacing) + 1);
  const sx = (xb - xa) / (cols - 1);
  const ya = 330;
  const yb = RUNOUT_TOP - W - 6 - 5 * r - L;
  const rows = Math.max(1, Math.floor((yb - ya) / spacing) + 1);
  const sy = rows > 1 ? (yb - ya) / (rows - 1) : 0;
  const arms = rng() < 0.5 ? 1 : 2;
  const elements = [];
  for (let row = 0; row < rows; row++) {
    const staggered = row % 2 === 1;
    const n = staggered ? cols - 1 : cols;
    for (let c = 0; c < n; c++) {
      const x = xa + (staggered ? sx / 2 : 0) + c * sx;
      elements.push({
        type: 'spinner',
        c: [x, ya + row * sy],
        len: L,
        r: 6,
        arms,
        speed: (rng() < 0.5 ? -1 : 1) * rng.range(1.8, 3.2),
        phase: rng.range(0, Math.PI * 2),
      });
    }
  }
  elements.push(...runout(rng, r, twists));
  return { elements, hopperCx: rng.range(X0 + 420, X1 - 420) };
}

/** Mixed course: hopper first (its width decides where the balls enter), then 3-5 fresh hurdle bands. */
function mix(rng, r, count, twists, avoidBands = [], takenNames = [], tight = false) {
  const cx = rng.range(LAYOUT.x0 + 420, LAYOUT.x1 - 420);
  const hop = hopper(cx, count, r, GATE_OPEN_S);
  const course = composeMix(rng, {
    r,
    count,
    twists,
    entry: { x0: hop.box.x0, x1: hop.box.x1 },
    yStart: LAYOUT.hopperBottom + 50,
    yEnd: LAYOUT.finishY - 30,
    avoid: avoidBands,
    takenNames,
    tight,
  });
  return { elements: course.elements, hopperCx: cx, name: course.name, bands: course.bands };
}

const BUILDERS = {
  mix,
  zigzag: (rng, r, count, twists, tight) => zigzag(rng, r, count, twists, false, tight),
  gates: (rng, r, count, twists, tight) => zigzag(rng, r, count, twists, true, tight),
  plinko,
  funnels,
  spinners,
};

/** Classic templates are just one kind of hurdle: used to stop the next mixed stage from repeating them. */
export const TEMPLATE_BANDS = {
  zigzag: ['ramp'],
  gates: ['ramp'],
  plinko: ['pegs'],
  funnels: ['funnel'],
  spinners: ['spinners'],
};

/**
 * Build one stage.
 * @returns {{ template, name, theme, elements, spawn, hopper, finishY, gateOpenAt }}
 */
export function buildStage({ template, rng, ballR, count, twists = DEFAULT_TWISTS, avoidBands = [], takenNames = [], tight = false }) {
  const build = BUILDERS[template];
  if (!build) throw new Error(`unknown stage template "${template}" (have: ${TEMPLATES.join(', ')})`);
  const course =
    template === 'mix'
      ? build(rng, ballR, count, { ...DEFAULT_TWISTS, ...twists }, avoidBands, takenNames, tight)
      : build(rng, ballR, count, { ...DEFAULT_TWISTS, ...twists }, tight);
  const hop = hopper(course.hopperCx, count, ballR, GATE_OPEN_S);
  let name = course.name;
  if (name === undefined) {
    const pool = NAMES[template].filter((n) => !takenNames.includes(n));
    name = pool.length ? rng.pick(pool) : rng.pick(NAMES[template]);
  }
  return {
    template,
    name,
    bands: course.bands,
    theme: rng.pick(THEMES),
    elements: [...frameElements(), ...hop.elements, ...course.elements],
    spawn: hop.spawn,
    hopper: hop.box,
    finishY: LAYOUT.finishY,
    gateOpenAt: GATE_OPEN_S,
  };
}
