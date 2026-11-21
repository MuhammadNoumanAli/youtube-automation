/**
 * Hurdle library for "mix" stages: each stage stacks 2-4 bands (rows of obstacles) between the hopper and the finish,
 * picked at random from the seed, so every stage is a new course. Each band spans the course width, takes the balls
 * falling in from above (`entry`: the x range they arrive in) and lets them out at the bottom (`exit`).
 *
 * Bands: pegs, spinners, seesaws, wheels, funnel, ramp, hammers, conveyor, sliders.
 * Every size and gap is derived from the ball radius r, so nothing is narrower than a ball (no wedging), and moving
 * parts never come closer to a wall or another part than a ball's width (no crushing).
 */
import { LAYOUT } from './stages-layout.mjs';

const { x0: X0, x1: X1 } = LAYOUT;
const W = LAYOUT.wallR;
const wall = (ax, ay, bx, by, r = W) => ({ type: 'wall', a: [ax, ay], b: [bx, by], r });

export const BAND_NAMES = {
  pegs: 'Pinball',
  spinners: 'Spinner',
  seesaws: 'Seesaw',
  wheels: 'Windmill',
  funnel: 'Bottleneck',
  ramp: 'Slide',
  hammers: 'Hammer',
  conveyor: 'Conveyor',
  sliders: 'Moving Floor',
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
const full = { x0: X0, x1: X1 };
const narrow = (e) => e.x1 - e.x0 < 500;

// ------------------------------------------------------------------ band builders
// each: (rng, { r, count, twists, y0, entry }) => { elements, h, exit }

function pegs(rng, { r, twists, y0 }) {
  const pegR = 7;
  const colSp = Math.max(72, 4.6 * r + 2 * pegR);
  const rowSp = colSp * 0.8;
  const rows = rng.int(2, 3);
  const h = (rows - 1) * rowSp + 30;
  const els = [];
  const minX = X0 + W + pegR + 2.3 * r;
  const maxX = X1 - W - pegR - 2.3 * r;
  for (let row = 0; row < rows; row++) {
    const y = y0 + 15 + row * rowSp;
    const off = row % 2 ? colSp / 2 : 0;
    for (let x = X0 + colSp / 2 + off; x <= X1 - colSp / 2; x += colSp) {
      if (x < minX || x > maxX || rng() < 0.08) continue;
      const c = [x + rng.range(-3, 3), y];
      if (twists.bumpers && rng() < 0.12) els.push({ type: 'bumper', c, r: 9, kick: rng.range(380, 460), cooldown: 0.35 });
      else els.push({ type: 'peg', c, r: pegR });
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
    els.push({ type: 'spinner', c: [xa + c * sx, cy], len: L, r: 6, arms, speed: (rng() < 0.5 ? -1 : 1) * rng.range(1.4, 2.8), phase: rng.range(0, Math.PI * 2) });
  return { elements: els, h: 2 * L + 16, exit: full };
}

/** Seesaws: tilt under the balls that land on them (the first one decides which way), then spring back. */
function seesaws(rng, { r, y0 }) {
  const n = rng.int(2, 4);
  const gapX = Math.max(6 * r, 90);
  const L = Math.min(200, Math.max(90, (X1 - X0 - (n + 1) * gapX) / (2 * n)));
  const span = n * 2 * L + (n - 1) * gapX;
  const left = X0 + (X1 - X0 - span) / 2;
  const maxAngle = 0.45;
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
  const L = rng.range(55, 70);
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

function funnel(rng, { r, twists, y0, entry }) {
  const h = rng.range(120, 150);
  const neck = Math.max(5.2 * r, 64);
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
function rampGeom(rng, { r, y0, entry }) {
  const gap = Math.max(5 * r, 120) + rng.range(0, 30);
  const centre = (entry.x0 + entry.x1) / 2;
  const dir = narrow(entry) ? (centre < (X0 + X1) / 2 ? 1 : -1) : rng() < 0.5 ? 1 : -1;
  const [sx, ex] = dir === 1 ? [X0, X1 - gap] : [X1, X0 + gap];
  const drop = 0.065 * Math.abs(ex - sx);
  return { gap, dir, sx, ex, sy: y0 + 6, ey: y0 + 6 + drop, drop };
}
function rampCuts(rng, g, { r, twists, entry }) {
  const cuts = [];
  const len = Math.abs(g.ex - g.sx);
  if (twists.pads && narrow(entry) && rng() < 0.75) {
    const c = ((entry.x0 + entry.x1) / 2 - g.sx) / (g.ex - g.sx);
    if (c > 0.08 && c < 0.6) cuts.push(padCut(Math.max(0, c - 70 / len), c + 70 / len, rng.range(500, 640)));
  }
  if (twists.shortcuts && rng() < 0.45) {
    const w = Math.max(5.6 * r, 70) / len;
    const uc = rng.range(0.62, 0.8);
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
  const len = rng.range(85, 110);
  const bobR = Math.max(16, 1.2 * r);
  // lowest point of the hammer just over a rolling ball: it can never block the ramp (a ball stuck in a rhythm of
  // being knocked back), but it whacks every ball that bounces or flies into its swing
  const clearance = 2 * r + 6;
  const top = y0;
  const g = rampGeom(rng, { ...ctx, y0: top + len + bobR + clearance + W });
  const n = rng.int(1, 2);
  const els = pieces(g.sx, g.sy, g.ex, g.ey, rampCuts(rng, g, { ...ctx, twists: { ...ctx.twists, pads: false } }));
  const span = g.ex - g.sx;
  const amp = rng.range(0.6, 0.9);
  for (let i = 0; i < n; i++) {
    // lower half of the ramp only: balls arrive with speed, so a hit throws them around instead of blocking a queue
    const u = 0.45 + (0.38 * i) / Math.max(1, n - 1);
    const px = g.sx + span * u;
    const surface = g.sy + (g.ey - g.sy) * u - W;
    els.push({ type: 'pendulum', pivot: [px, surface - clearance - bobR - len], len, rod: 4, bobR, amp, period: rng.range(1.6, 2.4), phase: rng.range(0, Math.PI * 2) });
  }
  const exit = g.dir === 1 ? { x0: X1 - g.gap, x1: X1 } : { x0: X0, x1: X0 + g.gap };
  return { elements: els, h: g.ey - top + 14, exit };
}

/** Flat conveyor belt that reverses direction every few seconds; gaps at both ends. */
function conveyor(rng, { r, y0 }) {
  const gap = Math.max(4 * r + 20, 110);
  const y = y0 + 10;
  // flip >= time to cross the whole belt, so every ball always reaches an end
  const speed = rng.range(260, 340);
  const flip = Math.max(rng.range(7, 10), (X1 - X0 - 2 * gap) / speed + 1.5);
  const dir = rng() < 0.5;
  const [a, b] = dir ? [[X0 + gap, y], [X1 - gap, y]] : [[X1 - gap, y], [X0 + gap, y]];
  return { elements: [{ type: 'belt', a, b, r: W + 1, speed, flip }], h: 24, exit: full };
}

/** Floor with slots that slides back and forth under the balls: they drop through when a slot passes beneath. */
function sliders(rng, { r, y0 }) {
  const slot = 2.2 * 2 * r + 10;
  const bar = rng.range(200, 280);
  const amp = (bar + slot) / 2;
  const side = amp + 2 * r + 15;
  const usable = X1 - X0 - 2 * side;
  const n = Math.max(2, Math.floor((usable + slot) / (bar + slot)));
  const total = n * bar + (n - 1) * slot;
  const start = X0 + side + (usable - total) / 2;
  const y = y0 + 10;
  const period = rng.range(2.5, 4);
  const phase = rng.range(0, Math.PI * 2);
  const els = [];
  for (let i = 0; i < n; i++) {
    const x = start + i * (bar + slot);
    els.push({ type: 'slider', a: [x, y], b: [x + bar, y], r: W + 1, axis: [1, 0], amp, period, phase });
  }
  return { elements: els, h: 24, exit: full };
}

const BUILD = { pegs, spinners: spinnerRow, seesaws, wheels, funnel, ramp, hammers, conveyor, sliders };

/**
 * Compose a mixed course between yStart and yEnd.
 * @returns {{ elements, bands: string[], name: string }}
 */
export function composeMix(rng, { r, count, twists, entry, yStart = 250, yEnd = 900 }) {
  const gapY = Math.max(3 * r + 12, 45); // free space between rows: more than a ball, so nothing jams between them
  const els = [];
  const used = [];
  let y = yStart;
  let e = entry;
  const want = rng.int(3, 4);
  for (let tries = 0; used.length < want && tries < 40; tries++) {
    const options = BANDS.filter((b) => b !== used[used.length - 1] || b === 'ramp');
    const kind = rng.pick(options);
    const res = BUILD[kind](rng, { r, count, twists, y0: y, entry: e });
    if (y + res.h > yEnd) {
      if (used.length >= 2) break;
      continue; // too tall for the room left: try another band
    }
    els.push(...res.elements);
    used.push(kind);
    y += res.h + gapY;
    e = res.exit;
  }
  const distinct = [...new Set(used)].map((b) => BAND_NAMES[b]);
  const suffix = rng.pick(['Gauntlet', 'Mayhem', 'Run', 'Chaos', 'Express', 'Alley', 'Showdown', 'Circuit']);
  const name = distinct.length > 1 ? `${distinct[0]} & ${distinct[1]} ${suffix}` : `${distinct[0]} ${suffix}`;
  return { elements: els, bands: used, name };
}
