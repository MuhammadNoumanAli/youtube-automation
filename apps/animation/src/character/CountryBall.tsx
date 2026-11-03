import React from 'react';
import { random } from 'remotion';
import { blendEye, EXPRESSIONS, Expression, eyePath } from './expressions';
import type { FlagSpec } from '../engine/types';

export type { FlagSpec };

/**
 * Original, code-drawn Countryball rig.
 * Layers (bottom → top): shadow, flag clipped to the body, soft shading, outline, eyes, optional name label.
 */

export interface CountryBallProps {
  id: string;
  /** Frame number inside the composition (for blinking). */
  frame: number;
  fps: number;
  x: number;
  y: number;
  radius: number;
  flag: FlagSpec;
  expression: Expression;
  previousExpression: Expression;
  /** 0..1 cross-fade from previousExpression to expression. */
  expressionBlend: number;
  /** -1..1 volume-preserving squash (positive = wider and flatter). */
  squash: number;
  /** Degrees. */
  rotation: number;
  /** Eye direction, -1..1 on each axis. */
  look: { x: number; y: number };
  facing: 1 | -1;
  /** Height of the ball above its shadow, in px (for hops). */
  lift: number;
  /** Seed so two characters never blink in sync. */
  blinkSeed: string;
  /** 0..1, used by fade entries/exits. Default 1. */
  opacity?: number;
  /** Optional name shown in a small label above the ball. */
  name?: string;
  nameColor?: string;
}

const BLINK_FRAMES = 6;

/** Deterministic blink schedule: one blink every 2.2–3.8 s, derived from a seed. */
export function blinkAmount(frame: number, fps: number, seed: string): number {
  let t = Math.round(fps * (0.8 + random(`${seed}-0`) * 1.2));
  let i = 1;
  while (t <= frame + BLINK_FRAMES) {
    const since = frame - t;
    if (since >= 0 && since < BLINK_FRAMES) {
      const half = BLINK_FRAMES / 2;
      return since < half ? since / half : (BLINK_FRAMES - since) / half;
    }
    t += Math.round(fps * (2.2 + random(`${seed}-${i}`) * 1.6));
    i++;
  }
  return 0;
}

const Flag: React.FC<{ r: number; flag: FlagSpec }> = ({ r, flag }) => {
  const size = r * 2;
  if (flag.layout === 'nordic-cross') {
    // Cross offset towards the hoist, as on Nordic flags. Proportions are approximate.
    const cx = -r * 0.28;
    const w = r * 0.3;
    const b = flag.border ? r * 0.12 : 0;
    return (
      <>
        <rect x={-r} y={-r} width={size} height={size} fill={flag.field} />
        {flag.border ? (
          <>
            <rect x={cx - w / 2 - b} y={-r} width={w + 2 * b} height={size} fill={flag.border} />
            <rect x={-r} y={-w / 2 - b} width={size} height={w + 2 * b} fill={flag.border} />
          </>
        ) : null}
        <rect x={cx - w / 2} y={-r} width={w} height={size} fill={flag.cross} />
        <rect x={-r} y={-w / 2} width={size} height={w} fill={flag.cross} />
      </>
    );
  }
  if (flag.layout === 'disc') {
    return (
      <>
        <rect x={-r} y={-r} width={size} height={size} fill={flag.field} />
        <circle cx={0} cy={r * 0.08} r={r * 0.42} fill={flag.disc} />
      </>
    );
  }
  const n = flag.colors.length;
  if (flag.layout === 'h-stripes') {
    return (
      <>
        {flag.colors.map((c, i) => (
          <rect key={i} x={-r} y={-r + (size / n) * i} width={size} height={size / n + 0.5} fill={c} />
        ))}
      </>
    );
  }
  return (
    <>
      {flag.colors.map((c, i) => (
        <rect key={i} x={-r + (size / n) * i} y={-r} width={size / n + 0.5} height={size} fill={c} />
      ))}
    </>
  );
};

export const CountryBall: React.FC<CountryBallProps> = (p) => {
  const r = p.radius;
  const s = Math.max(-0.6, Math.min(0.6, p.squash));
  const sx = 1 + s;
  const sy = 1 / (1 + s);
  const blink = blinkAmount(p.frame, p.fps, p.blinkSeed);
  const eye = blendEye(EXPRESSIONS[p.previousExpression], EXPRESSIONS[p.expression], p.expressionBlend);

  const eyeRx = r * 0.23;
  const eyeRy = r * 0.3;
  const eyeY = -r * 0.12 + p.look.y * r * 0.05;
  const eyeDX = r * 0.36;
  const lookX = p.look.x * r * 0.08 * p.facing;
  const outline = Math.max(3, r * 0.045);
  const clipId = `ball-clip-${p.id}`;
  const shadeId = `ball-shade-${p.id}`;

  return (
    <g opacity={p.opacity ?? 1}>
      {/* ground shadow: shrinks as the ball lifts */}
      <ellipse
        cx={p.x}
        cy={p.y + r * 0.95}
        rx={r * 0.9 * (1 - Math.min(0.5, p.lift / (r * 3)))}
        ry={r * 0.16}
        fill="#000"
        opacity={0.28 * (1 - Math.min(0.6, p.lift / (r * 3)))}
      />
      <g
        transform={`translate(${p.x} ${p.y - p.lift + r * (1 - sy)}) rotate(${p.rotation}) scale(${sx * p.facing} ${sy})`}
      >
        <defs>
          <clipPath id={clipId}>
            <circle r={r} />
          </clipPath>
          <radialGradient id={shadeId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.35} />
            <stop offset="55%" stopColor="#fff" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.22} />
          </radialGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <Flag r={r} flag={p.flag} />
          <circle r={r} fill={`url(#${shadeId})`} />
        </g>
        <circle r={r} fill="none" stroke="#141414" strokeWidth={outline} />
        {/* eyes: no mouth, by genre convention */}
        <g transform={`translate(${lookX} ${eyeY})`}>
          <path
            d={eyePath(eyeRx, eyeRy, eye, -1, blink)}
            transform={`translate(${-eyeDX} 0)`}
            fill="#fff"
            stroke="#141414"
            strokeWidth={outline * 0.85}
            strokeLinejoin="round"
          />
          <path
            d={eyePath(eyeRx, eyeRy, eye, 1, blink)}
            transform={`translate(${eyeDX} 0)`}
            fill="#fff"
            stroke="#141414"
            strokeWidth={outline * 0.85}
            strokeLinejoin="round"
          />
        </g>
      </g>
      {p.name ? (
        <g transform={`translate(${p.x} ${p.y - p.lift - r - 46})`}>
          <rect
            x={-(p.name.length * 13 + 36) / 2}
            y={-26}
            width={p.name.length * 13 + 36}
            height={44}
            rx={22}
            fill="#141414"
            fillOpacity={0.78}
            stroke={p.nameColor ?? '#ffffff'}
            strokeWidth={3}
          />
          <text
            x={0}
            y={6}
            textAnchor="middle"
            fontFamily="'Segoe UI', Arial, Helvetica, sans-serif"
            fontWeight={700}
            fontSize={24}
            fill="#ffffff"
          >
            {p.name}
          </text>
        </g>
      ) : null}
    </g>
  );
};
