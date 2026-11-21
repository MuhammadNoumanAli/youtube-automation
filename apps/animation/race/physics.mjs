/**
 * Tiny deterministic 2D physics for marble races: circles (balls) against capsules (walls, pegs, spinner arms,
 * gates) and against each other. No dependencies, no Math.random, fixed time step, so the same input always
 * gives the same output.
 *
 * Stage elements (plain data, also read by the renderer in src/race/):
 *   { type: 'wall',    a: [x, y], b: [x, y], r }                  static capsule (r = half thickness)
 *   { type: 'peg',     c: [x, y], r }                             static circle
 *   { type: 'spinner', c: [x, y], len, r, arms, speed, phase }    rotating bar(s); len = half length, speed rad/s
 *   { type: 'gate',    a, b, r, closed: { until } | { period, open, phase } }   capsule that is solid only while closed
 *   { type: 'pad',     a, b, r, kick, cooldown }                  jump pad: a ball LANDING on it is launched at `kick` px/s
 *   { type: 'bumper',  c, r, kick, cooldown }                     pinball bumper: any ball touching it is kicked away
 *   { type: 'rotor',   c, len, r, arms, inertia, damping, spring, rest, maxAngle }
 *        bar(s) on a pivot turned BY THE BALLS: seesaw (spring + maxAngle: tilts under the first ball that lands)
 *        or free paddle wheel (spring 0, maxAngle null: falling balls spin it)
 *   { type: 'pendulum', pivot, len, rod, bobR, amp, period, phase }   swinging hammer (angle 0 = hanging down)
 *   { type: 'slider',  a, b, r, axis: [x, y], amp, period, phase }   bar moving back and forth along `axis`
 *   { type: 'belt',    a, b, r, speed, flip }                       conveyor: surface moves at `speed` px/s along a->b,
 *        reversing direction every `flip` seconds (0 = never)
 * Pads and bumpers act on a ball at most once per `cooldown` seconds, so nothing bounces forever.
 */

export const PHYS = {
  gravity: 1500, // px/s^2
  substeps: 10, // per video frame
  maxSpeed: 2200, // px/s, keeps balls from tunnelling through thin walls
  wallBounce: 0.5, // livelier landings: balls hop off walls and into each other
  ballBounce: 0.7,
  padMinImpact: 120, // px/s: rolling over a pad does nothing, landing on it launches
  wallFriction: 0.0015, // fraction of tangential speed lost per contact substep (10 substeps per frame)
  airDamping: 0.9995, // per substep
};

// ------------------------------------------------------------------ kinematic element poses

/** Angle (radians) of a spinner at time t. */
export const spinnerAngle = (el, t) => el.phase + el.speed * t;

/** Arms of a spinner as capsules [ax, ay, bx, by]. `arms` bars through the centre, evenly rotated. */
export function spinnerSegments(el, t) {
  const out = [];
  const base = spinnerAngle(el, t);
  const n = el.arms ?? 1;
  for (let i = 0; i < n; i++) {
    const a = base + (i * Math.PI) / n;
    const dx = Math.cos(a) * el.len;
    const dy = Math.sin(a) * el.len;
    out.push([el.c[0] - dx, el.c[1] - dy, el.c[0] + dx, el.c[1] + dy]);
  }
  return out;
}

/** Angle of a pendulum at time t (0 = hanging straight down). */
export const pendulumAngle = (el, t) => el.amp * Math.sin((2 * Math.PI * t) / el.period + el.phase);

/** Rod and bob of a pendulum as capsules: [{ seg, r }]. */
export function pendulumSegments(el, t) {
  const a = pendulumAngle(el, t);
  const bx = el.pivot[0] + Math.sin(a) * el.len;
  const by = el.pivot[1] + Math.cos(a) * el.len;
  return [
    { seg: [el.pivot[0], el.pivot[1], bx, by], r: el.rod },
    { seg: [bx, by, bx, by], r: el.bobR },
  ];
}

/** Offset of a slider along its axis at time t. */
export const sliderOffset = (el, t) => el.amp * Math.sin((2 * Math.PI * t) / el.period + el.phase);

/** Direction of a conveyor belt at time t: 1 = towards b, -1 = towards a. */
export const beltDirection = (el, t) => (el.flip ? (Math.floor(t / el.flip) % 2 === 0 ? 1 : -1) : 1);

/** Arms of a rotor at angle theta (radians). */
export function rotorSegments(el, theta) {
  const out = [];
  const n = el.arms ?? 1;
  for (let i = 0; i < n; i++) {
    const a = theta + (i * Math.PI) / n;
    const dx = Math.cos(a) * el.len;
    const dy = Math.sin(a) * el.len;
    out.push([el.c[0] - dx, el.c[1] - dy, el.c[0] + dx, el.c[1] + dy]);
  }
  return out;
}

/** Is a gate solid at time t? */
export function gateClosed(el, t) {
  const c = el.closed;
  if (c.until !== undefined) return t < c.until;
  const p = (((t + (c.phase ?? 0)) % c.period) + c.period) % c.period;
  return p >= c.open; // open for the first `open` seconds of each period
}

// ------------------------------------------------------------------ geometry helpers

function closestOnSegment(px, py, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let u = len2 > 1e-9 ? ((px - ax) * ex + (py - ay) * ey) / len2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return [ax + ex * u, ay + ey * u, u];
}

/** Uniform grid holding static capsules, so each ball only tests nearby walls and pegs. */
class StaticGrid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
    this.stamp = 0;
  }
  key(cx, cy) {
    return cx * 73856093 + cy * 19349663;
  }
  insert(cap) {
    const pad = cap.r;
    const x0 = Math.floor((Math.min(cap.ax, cap.bx) - pad) / this.cell);
    const x1 = Math.floor((Math.max(cap.ax, cap.bx) + pad) / this.cell);
    const y0 = Math.floor((Math.min(cap.ay, cap.by) - pad) / this.cell);
    const y1 = Math.floor((Math.max(cap.ay, cap.by) + pad) / this.cell);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(cap);
      }
  }
  query(x, y, r, visit) {
    this.stamp++;
    const x0 = Math.floor((x - r) / this.cell);
    const x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell);
    const y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.map.get(this.key(cx, cy));
        if (!list) continue;
        for (const cap of list) {
          if (cap.seen === this.stamp) continue;
          cap.seen = this.stamp;
          visit(cap);
        }
      }
  }
}

// ------------------------------------------------------------------ world

export class World {
  /**
   * @param {object} opts
   * @param {object[]} opts.elements stage elements (see top of file)
   * @param {number} opts.fps video frame rate; physics runs PHYS.substeps steps per frame
   */
  constructor({ elements, fps }) {
    this.fps = fps;
    this.dt = 1 / (fps * PHYS.substeps);
    this.t = 0;
    this.balls = [];
    this.statics = new StaticGrid(64);
    this.spinners = [];
    this.gates = [];
    this.pendulums = [];
    this.sliders = [];
    this.belts = [];
    /** Ball-driven rotors with their state: { el, idx, theta, omega } */
    this.rotors = [];
    /** Pad and bumper hits since the last takeHits(): [{ ball, el }] */
    this.hits = [];
    elements.forEach((el, idx) => {
      if (el.type === 'wall') this.statics.insert({ ax: el.a[0], ay: el.a[1], bx: el.b[0], by: el.b[1], r: el.r });
      else if (el.type === 'peg') this.statics.insert({ ax: el.c[0], ay: el.c[1], bx: el.c[0], by: el.c[1], r: el.r });
      else if (el.type === 'pad')
        this.statics.insert({ ax: el.a[0], ay: el.a[1], bx: el.b[0], by: el.b[1], r: el.r, kick: el.kick, cooldown: el.cooldown ?? 1.5, idx, pad: true });
      else if (el.type === 'bumper')
        this.statics.insert({ ax: el.c[0], ay: el.c[1], bx: el.c[0], by: el.c[1], r: el.r, kick: el.kick, cooldown: el.cooldown ?? 0.35, idx, pad: false });
      else if (el.type === 'spinner') this.spinners.push(el);
      else if (el.type === 'gate') this.gates.push(el);
      else if (el.type === 'pendulum') this.pendulums.push(el);
      else if (el.type === 'slider') this.sliders.push(el);
      else if (el.type === 'belt') this.belts.push(el);
      else if (el.type === 'rotor') this.rotors.push({ el, idx, theta: el.rest ?? 0, omega: 0 });
      else throw new Error(`unknown element type "${el.type}"`);
    });
  }

  /** Current state of moving element `idx` for the replay (angle in radians, offset in px, gate/belt flags). */
  rotorAngle(idx) {
    return this.rotors.find((r) => r.idx === idx)?.theta ?? 0;
  }

  takeHits() {
    const h = this.hits;
    this.hits = [];
    return h;
  }

  addBall(x, y, r) {
    const b = { x, y, vx: 0, vy: 0, r, angle: 0, av: 0, cool: {} };
    this.balls.push(b);
    return b;
  }

  /** Advance one video frame. */
  stepFrame() {
    for (let i = 0; i < PHYS.substeps; i++) this.substep();
  }

  substep() {
    const dt = this.dt;
    const t = this.t;
    // kinematic capsules for this instant, with the pose dt later to get contact velocities
    const kin = [];
    for (const s of this.spinners) {
      const now = spinnerSegments(s, t);
      const next = spinnerSegments(s, t + dt);
      now.forEach((seg, i) => kin.push({ seg, next: next[i], r: s.r }));
    }
    for (const g of this.gates) {
      if (gateClosed(g, t)) kin.push({ seg: [g.a[0], g.a[1], g.b[0], g.b[1]], next: null, r: g.r });
    }
    for (const p of this.pendulums) {
      const now = pendulumSegments(p, t);
      const next = pendulumSegments(p, t + dt);
      now.forEach((s, i) => kin.push({ seg: s.seg, next: next[i].seg, r: s.r }));
    }
    for (const sl of this.sliders) {
      const o0 = sliderOffset(sl, t);
      const o1 = sliderOffset(sl, t + dt);
      const [ax, ay] = sl.axis;
      const at = (o) => [sl.a[0] + ax * o, sl.a[1] + ay * o, sl.b[0] + ax * o, sl.b[1] + ay * o];
      kin.push({ seg: at(o0), next: at(o1), r: sl.r });
    }
    for (const be of this.belts) {
      const len = Math.hypot(be.b[0] - be.a[0], be.b[1] - be.a[1]) || 1;
      const dir = beltDirection(be, t);
      kin.push({ seg: [be.a[0], be.a[1], be.b[0], be.b[1]], next: null, r: be.r, belt: { ux: (be.b[0] - be.a[0]) / len, uy: (be.b[1] - be.a[1]) / len, speed: be.speed * dir } });
    }
    for (const ro of this.rotors) for (const seg of rotorSegments(ro.el, ro.theta)) kin.push({ seg, next: null, r: ro.el.r, rotor: ro });

    for (const b of this.balls) {
      b.vy += PHYS.gravity * dt;
      b.vx *= PHYS.airDamping;
      b.vy *= PHYS.airDamping;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > PHYS.maxSpeed) {
        b.vx *= PHYS.maxSpeed / sp;
        b.vy *= PHYS.maxSpeed / sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.av *= 0.995;

      this.statics.query(b.x, b.y, b.r + 2, (cap) => this.collideCapsule(b, cap.ax, cap.ay, cap.bx, cap.by, cap.r, null, 0, cap.kick ? cap : null));
      for (const k of kin) this.collideCapsule(b, k.seg[0], k.seg[1], k.seg[2], k.seg[3], k.r, k.next, dt, null, k);
      b.angle += b.av * dt;
    }
    this.collideBalls();
    // rotors: spring back towards rest (seesaws), damping, angle limits
    for (const ro of this.rotors) {
      const el = ro.el;
      const rest = el.rest ?? 0;
      ro.omega += ((-(el.spring ?? 0) * (ro.theta - rest) - (el.damping ?? 0) * ro.omega) / el.inertia) * dt;
      ro.omega = Math.max(-10, Math.min(10, ro.omega));
      ro.theta += ro.omega * dt;
      if (el.maxAngle != null) {
        if (ro.theta > rest + el.maxAngle) {
          ro.theta = rest + el.maxAngle;
          ro.omega = -ro.omega * 0.2;
        } else if (ro.theta < rest - el.maxAngle) {
          ro.theta = rest - el.maxAngle;
          ro.omega = -ro.omega * 0.2;
        }
      }
    }
    this.t += dt;
  }

  collideCapsule(b, ax, ay, bx, by, cr, next, dt, kicker = null, extra = null) {
    const [qx, qy, u] = closestOnSegment(b.x, b.y, ax, ay, bx, by);
    let dx = b.x - qx;
    let dy = b.y - qy;
    const min = b.r + cr;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return;
    let d = Math.sqrt(d2);
    let nx;
    let ny;
    if (d > 1e-6) {
      nx = dx / d;
      ny = dy / d;
    } else {
      // centre exactly on the segment: push along the segment normal (upwards preferred)
      const ex = bx - ax;
      const ey = by - ay;
      const el = Math.hypot(ex, ey) || 1;
      nx = -ey / el;
      ny = ex / el;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      d = 0;
    }
    b.x += nx * (min - d);
    b.y += ny * (min - d);

    // velocity of the contact point (moving spinner arms)
    let cvx = 0;
    let cvy = 0;
    if (next) {
      const px = next[0] + (next[2] - next[0]) * u;
      const py = next[1] + (next[3] - next[1]) * u;
      cvx = (px - qx) / dt;
      cvy = (py - qy) / dt;
    }
    const ro = extra?.rotor;
    if (ro) {
      // point on a turning rotor moves at omega x r
      cvx = -ro.omega * (qy - ro.el.c[1]);
      cvy = ro.omega * (qx - ro.el.c[0]);
    }
    const vx0 = b.vx;
    const vy0 = b.vy;
    let rvx = b.vx - cvx;
    let rvy = b.vy - cvy;
    const vn = rvx * nx + rvy * ny;
    let kicked = false;
    if (kicker && (b.cool[kicker.idx] ?? -1) <= this.t && (!kicker.pad || vn < -PHYS.padMinImpact)) {
      // launch: outgoing normal speed is at least `kick`
      const out = Math.max(-vn * PHYS.wallBounce, kicker.kick);
      rvx += (out - vn) * nx;
      rvy += (out - vn) * ny;
      b.cool[kicker.idx] = this.t + kicker.cooldown;
      this.hits.push({ ball: b, el: kicker.idx });
      kicked = true;
    } else if (vn < 0) {
      rvx -= (1 + PHYS.wallBounce) * vn * nx;
      rvy -= (1 + PHYS.wallBounce) * vn * ny;
    }
    const tx = -ny;
    const ty = nx;
    const vt = rvx * tx + rvy * ty;
    rvx -= tx * vt * PHYS.wallFriction;
    rvy -= ty * vt * PHYS.wallFriction;
    const belt = extra?.belt;
    if (belt) {
      // conveyor: drag the ball's tangential speed towards the belt speed
      const target = belt.speed * (belt.ux * tx + belt.uy * ty);
      const cur = rvx * tx + rvy * ty;
      rvx += tx * (target - cur) * 0.08;
      rvy += ty * (target - cur) * 0.08;
    }
    b.vx = rvx + cvx;
    b.vy = rvy + cvy;
    if (!kicked) b.av = (vt * (1 - PHYS.wallFriction)) / b.r; // rolling
    if (ro) {
      // equal and opposite: the ball's change of momentum turns the rotor (ball mass = 1)
      const dvx = b.vx - vx0;
      const dvy = b.vy - vy0;
      ro.omega -= ((qx - ro.el.c[0]) * dvy - (qy - ro.el.c[1]) * dvx) / ro.el.inertia;
    }
  }

  collideBalls() {
    const balls = this.balls;
    if (balls.length < 2) return;
    let maxR = 0;
    for (const b of balls) if (b.r > maxR) maxR = b.r;
    const cell = maxR * 2;
    const grid = new Map();
    const key = (cx, cy) => cx * 92837111 + cy * 689287499;
    balls.forEach((b, i) => {
      const k = key(Math.floor(b.x / cell), Math.floor(b.y / cell));
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(i);
    });
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      const cx = Math.floor(a.x / cell);
      const cy = Math.floor(a.y / cell);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          const list = grid.get(key(cx + ox, cy + oy));
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const b = balls[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const min = a.r + b.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 < 1e-9) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const push = (min - d) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rv < 0) {
              const j2 = (-(1 + PHYS.ballBounce) * rv) / 2;
              a.vx -= j2 * nx;
              a.vy -= j2 * ny;
              b.vx += j2 * nx;
              b.vy += j2 * ny;
            }
          }
        }
    }
  }
}
