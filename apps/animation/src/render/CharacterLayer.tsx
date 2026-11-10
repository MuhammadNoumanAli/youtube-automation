import React from 'react';
import { CountryBall } from '../character/CountryBall';
import { BEHIND, Prop } from '../character/props';
import { EASE, stepTrack, track } from '../lib/anim';
import type { CharacterDefinition, CharacterInScene, NumberKey } from '../engine/types';

type Project = (lonLat: [number, number]) => [number, number] | null;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const val = (frame: number, keys: NumberKey[] | undefined, fallback: number) =>
  keys && keys.length ? track(frame, keys) : fallback;

/**
 * Turns one CharacterInScene (keyframed data) into CountryBall props for the current frame.
 * Handles stage/geo positions, hops with landing squash, talking, shakes, and entry/exit animations.
 */
export const CharacterLayer: React.FC<{
  c: CharacterInScene;
  def: CharacterDefinition;
  frame: number;
  fps: number;
  width: number;
  project: Project | null;
  uid: string;
}> = ({ c, def, frame, fps, width, project, uid }) => {
  const r = c.radius ?? 100;

  // ---- visibility window
  if (c.enter && frame < c.enter.frame) return null;
  if (c.exit && frame > c.exit.frame + c.exit.duration) return null;

  // ---- base position (ground contact point)
  let gx: number;
  let gy: number;
  if (c.position.space === 'geo') {
    const p = project?.([track(frame, c.position.lon), track(frame, c.position.lat)]) ?? [width / 2, 540];
    gx = p[0];
    gy = p[1];
  } else {
    gx = track(frame, c.position.x);
    gy = track(frame, c.position.y);
  }

  // ---- hops: lift while hopping, squash on each landing
  let lift = 0;
  let squash = 0;
  for (const h of c.hops ?? []) {
    if (frame >= h.from && frame <= h.to) {
      const phase = ((frame - h.from) / h.period) * Math.PI;
      const s = Math.abs(Math.sin(phase));
      lift += s * h.height;
      squash += Math.max(0, 1 - s * 6) * 0.22 - s * 0.08;
    }
    // settle wobble after the last landing
    if (frame > h.to && frame < h.to + 20) {
      const t = (frame - h.to) / 20;
      squash += Math.sin(t * Math.PI * 2) * 0.14 * (1 - t);
    }
  }

  // ---- talking: bounce and stretch with the loudness of the character's own voice (from the voice manifest)
  for (const t of c.talk ?? []) {
    if (frame < t.from || frame >= t.to || t.envelope.length === 0) continue;
    const pos = ((frame - t.from) / fps) * t.rate;
    const i = Math.floor(pos);
    const a = t.envelope[Math.min(i, t.envelope.length - 1)] ?? 0;
    const b = t.envelope[Math.min(i + 1, t.envelope.length - 1)] ?? a;
    const level = a + (b - a) * (pos - i);
    lift += level * 10;
    squash -= level * 0.07; // negative = taller and narrower
  }

  // ---- impacts: hit squash that wobbles out, plus a tilt away from the hit
  let impactTilt = 0;
  for (const f0 of c.impacts ?? []) {
    const d = frame - f0;
    if (d < 0 || d >= 16) continue;
    const t = d / 16;
    squash += 0.38 * (1 - t) * Math.cos(t * Math.PI * 3);
    impactTilt += -(c.facing ?? 1) * 14 * (1 - t) * Math.sin(t * Math.PI * 2 + 0.6);
  }

  // ---- rotation and shakes
  let rotation = val(frame, c.rotation, 0) + impactTilt;
  for (const s of c.shakes ?? []) {
    if (frame >= s.from && frame <= s.to) rotation += Math.sin(frame * 1.9) * s.degrees;
  }

  let scale = val(frame, c.scale, 1);
  let opacity = 1;
  let dx = 0;

  // ---- entry
  if (c.enter) {
    const p = clamp01((frame - c.enter.frame) / Math.max(1, c.enter.duration));
    switch (c.enter.type) {
      case 'pop':
        scale *= p >= 1 ? 1 : EASE.outBack(p);
        break;
      case 'fade':
        opacity *= p;
        break;
      case 'slide-left':
        dx -= (gx + r * 2 + 60) * (1 - EASE.outCubic(p));
        if (p < 1) lift += Math.abs(Math.sin(p * Math.PI * 3)) * 40;
        break;
      case 'slide-right':
        dx += (width - gx + r * 2 + 60) * (1 - EASE.outCubic(p));
        if (p < 1) lift += Math.abs(Math.sin(p * Math.PI * 3)) * 40;
        break;
      case 'drop': {
        const fall = 1 - EASE.inOutCubic(Math.min(1, p * 1.4));
        lift += fall * 900;
        if (p > 0.7 && p < 1) squash += Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.3;
        break;
      }
    }
  }

  // ---- exit
  if (c.exit && frame >= c.exit.frame) {
    const q = clamp01((frame - c.exit.frame) / Math.max(1, c.exit.duration));
    switch (c.exit.type) {
      case 'pop':
        scale *= 1 - EASE.outCubic(q);
        break;
      case 'fade':
        opacity *= 1 - q;
        break;
      case 'slide-left':
        dx -= (gx + r * 2 + 60) * EASE.inOutCubic(q);
        break;
      case 'slide-right':
        dx += (width - gx + r * 2 + 60) * EASE.inOutCubic(q);
        break;
    }
  }

  const expr = stepTrack(frame, c.expressions, 5);
  const cx = gx + dx;
  const cy = gy - r; // CountryBall takes the ball centre; ground contact is one radius below.
  const activeProps = (c.props ?? []).filter((p) => frame >= p.from && frame < p.to);
  const facing = c.facing ?? 1;
  const drawProps = (behind: boolean) =>
    activeProps
      .filter((p) => BEHIND.includes(p.kind) === behind)
      .map((p, i) => <Prop key={`${p.kind}-${i}`} kind={p.kind} cx={cx} cy={cy - lift} r={r} age={frame - p.from} frame={frame} facing={facing} />);

  return (
    <g transform={`translate(${cx} ${gy}) scale(${Math.max(0, scale)}) translate(${-cx} ${-gy})`}>
      {drawProps(true)}
      <CountryBall
        id={uid}
        frame={frame}
        fps={fps}
        x={cx}
        y={cy}
        radius={r}
        flag={def.flag}
        expression={expr.current}
        previousExpression={expr.previous}
        expressionBlend={expr.blend}
        squash={squash}
        rotation={rotation}
        look={{ x: val(frame, c.lookX, 0), y: val(frame, c.lookY, 0) }}
        facing={c.facing ?? 1}
        lift={lift}
        blinkSeed={c.blinkSeed ?? def.id}
        opacity={opacity}
        name={c.showName ? def.name : undefined}
        nameColor={def.accent}
      />
      {drawProps(false)}
    </g>
  );
};
