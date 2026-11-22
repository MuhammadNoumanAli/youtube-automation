/**
 * Hurdle library for "mix" stages: each stage stacks 3-5 bands (rows of obstacles) between the hopper and the finish,
 * picked at random from the seed, so every stage is a new course. Each band spans the course width, takes the balls
 * falling in from above (`entry`: the x range they arrive in) and lets them out at the bottom (`exit`).
 *
 * Bands: pegs, bumpers, spinners, seesaws, wheels, funnel, ramp, hammers, conveyor, sliders, wipeout, trapdoors.
 * A stage never repeats a band and never reuses a band from the stage before it, so the next hurdle is always new.
 * Every size and gap is derived from the ball radius r, so nothing is narrower than a ball (no wedging), and moving
 * parts never come closer to a wall or another part than a ball's width (no crushing).
 */
import { LAYOUT } from './stages-layout.mjs';

// Bands size themselves off LAYOUT.x0/x1 at call time: narrow races move the walls and call setBandBounds.
let X0 = LAYOUT.x0;
let X1 = LAYOUT.x1;
const full = { x0: X0, x1: X1 };
/** Narrow races: the hurdle bands must stay inside the same walls as the frame and the hopper. */
export function setBandBounds(x0, x1) {
  X0 = x0;
  X1 = x1;
  full.x0 = x0;
  full.x1 = x1;
}
const W = LAYOUT.wallR;
const wall = (ax, ay, bx, by, r = W) => ({ type: 'wall', a: [ax, ay], b: [bx, by], r });

export const BAND_NAMES = {
  pegs: 'Pinball',
  bumpers: 'Bumpers',
  spinners: 'Spinners',
  seesaws: 'Seesaws',
  wheels: 'Windmills',
  funnel: 'Funnel',
  ramp: 'Slide',
  hammers: 'Hammers',
  conveyor: 'Conveyor',
  sliders: 'Sliders',
  wipeout: 'Wipeout',
  trapdoors: 'Trapdoors',
};
export const BANDS = Object.keys(BAND_NAMES);

/** Split a straight ramp into pieces with jump pads / trapdoors (same idea as stages.mjs rampPieces). */
function pieces(sx, sy, ex, ey, cuts) {
  const P = (u) => [sx + (ex - sx) * u, sy + (ey - sy) * u];
  const out = [];
  let u = 0;
  for (const c of cuts.sort((a, b) => a.u0 - b.u0)) {
    if (c.u0 > u) out.push(wall(...P(u), ...P(c.u0)));
    out.push(c.make(P(c.u0), P(c.u1)));
    u = c.u1;
  }
  if (u < 1) out.push(wall(...P(u), ...P(1)));
  return out;
}
const padCut = (u0, u1, kick) => ({ u0, u1, make: (a, b) => ({ type: 'pad', a, b, r: W, kick, cooldown: 1.5 }) });
const trapCut = (u0, u1, rng) => {
  const period = rng.range(3.5, 5.5);
  return { u0, u1, make: (a, b) => ({ type: 'gate', a, b, r: W, role: 'trapdoor', closed: { period, open: rng.range(0.6, 0.9), phase: rng.range(0, period) } }) };
};
const narrow = (e) => e.x1 - e.x0 < 500;

// ------------------------------------------------------------------ band builders
// each: (rng, { r, count, twists, y0, entry }) => { elements, h, exit }

function pegs(rng, { r, twists, y0 }) {
  const pegR = 7;
  const colSp = Math.max(72, 4.6 * r + 2 * pegR);
  const rowSp = colSp * 0.8;
  const rows = rng.int(3, 4);
  const h = (rows - 1) * rowSp + 30;
  const els = [];
  const minX = X0 + W + pegR + 2.3 * r;
  const maxX = X1 - W - pegR - 2.3 * r;
  for (let row = 0; row < rows; row++) {
    const y = y0 + 15 + row * rowSp;
    const off = row % 2 ? colSp / 2 : 0;
    for (let x = X0 + colSp / 2 + off; x <= X1 - colSp / 2; x += colSp) {
      if (x < minX || x > maxX || rng() < 0.03) continue;
      const c = [x + rng.range(-3, 3), y];
      if (twists.bumpers && rng() < 0.18) els.push({ type: 'bumper', c, r: 9, kick: rng.range(420, 520), cooldown: 0.35 });
      else els.push({ type: 'peg', c, r: pegR });
    }
  }
  return { elements: els, h, exit: full };
}

/** Two or three staggered rows of pinball bumpers: every hit throws balls off course. */
function bumpers(rng, { r, y0 }) {
  const rows = rng.int(2, 3);
  const colSp = Math.max(96, 3.2 * r + 40);
  const rowSp = colSp * 0.78;
  const h = (rows - 1) * rowSp + 34;
  const els = [];
  const minX = X0 + W + 9 + 2.4 * r;
  const maxX = X1 - W - 9 - 2.4 * r;
  for (let row = 0; row < rows; row++) {
    const y = y0 + 17 + row * rowSp;
    const off = row % 2 ? colSp / 2 : 0;
    for (let x = X0 + colSp / 2 + off; x <= X1 - colSp / 2; x += colSp) {
      if (x < minX || x > maxX) continue;
      els.push({ type: 'bumper', c: [x + rng.range(-4, 4), y], r: 9, kick: rng.range(430, 540), cooldown: 0.35 });
    }
  }
  return { elements: els, h, exit: full };
}

function spinnerRow(rng, { r, y0 }) {
  const L = rng.range(50, 62);
  const spacing = 2 * L + Math.max(5 * r, 110);
  const xa = X0 + L + 3 * r + 24;
  const xb = X1 - L - 3 * r - 24;
  const cols = Math.max(2, Math.floor((xb - xa) / spacing) + 1);
  const sx = (xb - xa) / (cols - 1);
  const cy = y0 + L + 8;
  const arms = rng() < 0.5 ? 1 : 2;
  const els = [];
  for (let c = 0; c < cols; c++)
    els.push({ type: 'spinner', c: [xa + c * sx, cy], len: L, r: 6, arms, speed: (rng() < 0.5 ? -1 : 1) * rng.range(2.0, 3.6), phase: rng.range(0, Math.PI * 2) });
  return { elements: els, h: 2 * L + 16, exit: full };
}

/** Seesaws: tilt under the balls that land on them (the first one decides which way), then spring back. */
function seesaws(rng, { r, y0 }) {
  const gapX = Math.max(5.5 * r, 80);
  // narrow races: a seesaw is never shorter than 90 px, so drop one instead of spilling past the walls
  let n = rng.int(3, 5);
  while (n > 2 && n * 180 + (n - 1) * gapX > X1 - X0 - 8) n--;
  const L = Math.min(200, Math.max(90, (X1 - X0 - (n + 1) * gapX) / (2 * n)));
  const span = n * 2 * L + (n - 1) * gapX;
  const left = X0 + (X1 - X0 - span) / 2;
  const maxAngle = 0.55;
  const cy = y0 + Math.sin(maxAngle) * L + 12;
  const k = L / 140;
  const els = [];
  for (let i = 0; i < n; i++) {
    const rest = (rng() < 0.5 ? -1 : 1) * rng.range(0.06, 0.16); // never perfectly level: nothing balances on it
    els.push({ type: 'rotor', style: 'seesaw', c: [left + L + i * (2 * L + gapX), cy], len: L, r: 6, arms: 1, inertia: 14000 * k * k, damping: 40000 * k ** 1.5, spring: 300000 * k, rest, maxAngle });
  }
  return { elements: els, h: 2 * Math.sin(maxAngle) * L + 30, exit: full };
}

/** Free paddle wheels: falling balls spin them, and the spinning wheels fling the next balls. */
function wheels(rng, { r, y0 }) {
  const L = rng.range(60, 78);
  const spacing = 2 * L + Math.max(5 * r, 110);
  const xa = X0 + L + 3 * r + 24;
  const xb = X1 - L - 3 * r - 24;
  const cols = Math.max(2, Math.floor((xb - xa) / spacing) + 1);
  const sx = (xb - xa) / (cols - 1);
  const arms = rng() < 0.5 ? 2 : 3;
  const els = [];
  for (let c = 0; c < cols; c++)
    els.push({ type: 'rotor', style: 'wheel', c: [xa + c * sx, y0 + L + 8], len: L, r: 6, arms, inertia: 9000 * (L / 70) ** 2, damping: 2500, spring: 0, rest: rng.range(0, Math.PI), maxAngle: null });
  return { elements: els, h: 2 * L + 16, exit: full };
}

function funnel(rng, { r, twists, y0, entry, tight }) {
  const h = rng.range(150, 190);
  // tight races: the neck is barely wider than a ball, so the queue goes through one at a time
  const neck = tight ? Math.max(2.3 * r + 10, 40) : Math.max(4.8 * r, 60);
  const nx = rng.range(X0 + 260, X1 - 260);
  const lx = nx - neck / 2;
  const rx = nx + neck / 2;
  const landing = narrow(entry) ? (entry.x0 + entry.x1) / 2 : null;
  const pad = (sx, ex) => {
    if (!twists.pads || landing === null || rng() < 0.3) return [];
    const lo = Math.min(sx, ex);
    const hi = Math.max(sx, ex);
    if (landing - 60 < lo + 20 || landing + 60 > hi - 20) return [];
    const u0 = (landing - 60 - sx) / (ex - sx);
    const u1 = (landing + 60 - sx) / (ex - sx);
    return [padCut(Math.min(u0, u1), Math.max(u0, u1), rng.range(380, 440))];
  };
  return { elements: [...pieces(X0, y0, lx, y0 + h, pad(X0, lx)), ...pieces(X1, y0, rx, y0 + h, pad(X1, rx))], h, exit: { x0: lx, x1: rx } };
}

/** One long ramp across the course; high end under where the balls come in. Trapdoor shortcut + landing pad twists. */
function rampGeom(rng, { r, y0, entry, tight }) {
  // the drop at the end of the ramp is the vertical passage: one ball wide in tight races
  const gap = (tight ? Math.max(3.2 * r, 78) : Math.max(5 * r, 120)) + rng.range(0, tight ? 8 : 30);
  const centre = (entry.x0 + entry.x1) / 2;
  const dir = narrow(entry) ? (centre < (X0 + X1) / 2 ? 1 : -1) : rng() < 0.5 ? 1 : -1;
  const [sx, ex] = dir === 1 ? [X0, X1 - gap] : [X1, X0 + gap];
  const drop = 0.08 * Math.abs(ex - sx);
  return { gap, dir, sx, ex, sy: y0 + 6, ey: y0 + 6 + drop, drop };
}
function rampCuts(rng, g, { r, twists, entry }) {
  const cuts = [];
  const len = Math.abs(g.ex - g.sx);
  if (twists.pads && narrow(entry) && rng() < 0.75) {
    const c = ((entry.x0 + entry.x1) / 2 - g.sx) / (g.ex - g.sx);
    if (c > 0.08 && c < 0.6) cuts.push(padCut(Math.max(0, c - 70 / len), c + 70 / len, rng.range(500, 640)));
  }
  if (twists.shortcuts && rng() < 0.6) {
    const w = Math.max(5.6 * r, 70) / len;
    const uc = rng.range(0.55, 0.8);
    if (!cuts.some((c) => c.u1 > uc - w / 2 - 0.02)) cuts.push(trapCut(uc - w / 2, uc + w / 2, rng));
  }
  return cuts;
}
function ramp(rng, ctx) {
  const g = rampGeom(rng, ctx);
  const exit = g.dir === 1 ? { x0: X1 - g.gap, x1: X1 } : { x0: X0, x1: X0 + g.gap };
  return { elements: pieces(g.sx, g.sy, g.ex, g.ey, rampCuts(rng, g, ctx)), h: g.drop + 14, exit };
}

/** Ramp with swinging hammers just above it: they knock balls back up the slope or send them flying. */
function hammers(rng, ctx) {
  const { r, y0 } = ctx;
  const len = rng.range(90, 115);
  const bobR = Math.max(16, 1.2 * r);
  // lowest point of the hammer just over a rolling ball: it can never block the ramp (a ball stuck in a rhythm of
  // being knocked back), but it whacks every ball that bounces or flies into its swing
  const clearance = 2 * r + 6;
  const top = y0;
  const g = rampGeom(rng, { ...ctx, y0: top + len + bobR + clearance + W });
  const n = rng.int(2, 3);
  const els = pieces(g.sx, g.sy, g.ex, g.ey, rampCuts(rng, g, { ...ctx, twists: { ...ctx.twists, pads: false } }));
  const span = g.ex - g.sx;
  const amp = rng.range(0.75, 1.0);
  for (let i = 0; i < n; i++) {
    // lower half of the ramp only: balls arrive with speed, so a hit throws them around instead of blocking a queue
    const u = 0.4 + (0.42 * i) / Math.max(1, n - 1);
    const px = g.sx + span * u;
    const surface = g.sy + (g.ey - g.sy) * u - W;
    els.push({ type: 'pendulum', pivot: [px, surface - clearance - bobR - len], len, rod: 4, bobR, amp, period: rng.range(1.4, 2.0), phase: rng.range(0, Math.PI * 2) });
  }
  const exit = g.dir === 1 ? { x0: X1 - g.gap, x1: X1 } : { x0: X0, x1: X0 + g.gap };
  return { elements: els, h: g.ey - top + 14, exit };
}

/** Flat conveyor belt that reverses direction every few seconds; gaps at both ends. */
function conveyor(rng, { r, y0 }) {
  const gap = Math.max(4 * r + 20, 110);
  const y = y0 + 10;
  // flip >= time to cross the whole belt, so every ball always reaches an end
  const speed = rng.range(300, 380);
  const flip = Math.max(rng.range(5.5, 8), (X1 - X0 - 2 * gap) / speed + 1.2);
  const dir = rng() < 0.5;
  const [a, b] = dir ? [[X0 + gap, y], [X1 - gap, y]] : [[X1 - gap, y], [X0 + gap, y]];
  return { elements: [{ type: 'belt', a, b, r: W + 1, speed, flip }], h: 24, exit: full };
}

/** One row of slotted bars sliding sideways; balls drop through when a slot passes beneath them. */
function sliderRow(rng, r, y, tight) {
  // the slot is the hole between two bars (each bar capsule is radius W+1): one ball wide in tight races
  const slot = tight ? 2 * r + 26 : 2.2 * 2 * r + 10;
  const bar = rng.range(170, 240);
  const amp = (bar + slot) / 2;
  const side = amp + 2 * r + 15;
  const usable = X1 - X0 - 2 * side;
  const n = Math.max(2, Math.floor((usable + slot) / (bar + slot)));
  const total = n * bar + (n - 1) * slot;
  const start = X0 + side + (usable - total) / 2;
  const period = rng.range(2.2, 3.2);
  const phase = rng.range(0, Math.PI * 2);
  const els = [];
  for (let i = 0; i < n; i++) {
    const x = start + i * (bar + slot);
    els.push({ type: 'slider', a: [x, y], b: [x + bar, y], r: W + 1, axis: [1, 0], amp, period, phase });
  }
  return els;
}

function sliders(rng, { r, y0, tight }) {
  return { elements: sliderRow(rng, r, y0 + 10, tight), h: 24, exit: full };
}

/** Two sliding floors stacked: balls that survive the first one land on a second, opposite-moving one. */
function wipeout(rng, { r, y0, tight }) {
  const gapY = 2 * r + 26; // already the minimum that lets a ball roll between the bar capsules
  const els = [...sliderRow(rng, r, y0 + 10, tight), ...sliderRow(rng, r, y0 + 10 + gapY, tight)];
  return { elements: els, h: gapY + 24, exit: full };
}

/** A floor of timed trapdoors: balls wait on closed gates, then rain through as the gates open in a wave. */
function trapdoors(rng, { r, y0 }) {
  const gap = Math.max(3.2 * r, 46);
  const n = 6;
  const seg = (X1 - X0 - (n - 1) * gap) / n;
  const y = y0 + 10;
  const els = [];
  for (let i = 0; i < n; i++) {
    const x = X0 + i * (seg + gap);
    const period = rng.range(1.8, 2.6);
    els.push({
      type: 'gate',
      a: [x, y],
      b: [x + seg, y],
      r: W + 1,
      role: 'trapdoor',
      closed: { period, open: rng.range(0.3, 0.45), phase: rng.range(0, period) },
    });
  }
  return { elements: els, h: 24, exit: full };
}

const BUILD = { pegs, bumpers, spinners: spinnerRow, seesaws, wheels, funnel, ramp, hammers, conveyor, sliders, wipeout, trapdoors };

const SUFFIXES = ['Gauntlet', 'Mayhem', 'Run', 'Chaos', 'Express', 'Alley', 'Showdown', 'Circuit', 'Blitz', 'Frenzy', 'Squeeze', 'Sprint'];

/**
 * Compose a mixed course between yStart and yEnd. Bands never repeat inside a stage, and `avoid` (the hurdle types of
 * the stage before) is skipped, so the viewer gets a visibly new course on every step. The name is unique per race
 * when `takenNames` is passed.
 * @returns {{ elements, bands: string[], name: string }}
 */
export function composeMix(rng, { r, count, twists, entry, yStart = 250, yEnd = 930, avoid = [], takenNames = [], tight = false }) {
  // the bumper field and the trapdoor floor are the twist bands: switching a twist off removes its hurdle
  const allowedBands = BANDS.filter((b) => (b !== 'bumpers' || twists.bumpers) && (b !== 'trapdoors' || twists.shortcuts));
  // free space between rows: one ball high in tight races, so a crowd has to trickle through
  const gapY = tight ? Math.max(2.3 * r + 12, 30) : Math.max(2.6 * r + 10, 36);
  const els = [];
  const used = [];
  let y = yStart;
  let e = entry;
  const want = rng.int(3, 5);
  for (let tries = 0; used.length < want && tries < 80; tries++) {
    const fresh = allowedBands.filter((b) => !used.includes(b) && !avoid.includes(b));
    const pool = fresh.length ? fresh : allowedBands.filter((b) => !used.includes(b));
    const kind = rng.pick(pool);
    const res = BUILD[kind](rng, { r, count, twists, y0: y, entry: e, tight });
    if (y + res.h > yEnd) continue; // too tall for the room left: try another band
    els.push(...res.elements);
    used.push(kind);
    y += res.h + gapY;
    e = res.exit;
  }
  const distinct = [...new Set(used)].map((b) => BAND_NAMES[b]);
  const base = distinct.length > 1 ? `${distinct[0]} & ${distinct[1]}` : distinct[0];
  const start = Math.floor(rng() * SUFFIXES.length);
  let name = '';
  for (let i = 0; i < SUFFIXES.length; i++) {
    const cand = `${base} ${SUFFIXES[(start + i) % SUFFIXES.length]}`;
    if (!takenNames.includes(cand)) {
      name = cand;
      break;
    }
  }
  if (!name) name = `${base} ${SUFFIXES[start]} II`;
  return { elements: els, bands: used, name };
}
