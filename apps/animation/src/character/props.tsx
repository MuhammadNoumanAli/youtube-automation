import React from 'react';
import type { PropKind } from '../engine/types';

/**
 * Original prop drawings attached to a countryball. (cx, cy) is the ball centre (after hops), r its radius,
 * `age` the frames since the prop appeared, `facing` 1 = looking right.
 */
export interface PropDrawProps {
  kind: PropKind;
  cx: number;
  cy: number;
  r: number;
  age: number;
  frame: number;
  facing: 1 | -1;
}

const pop = (age: number) => {
  const t = Math.min(1, age / 8);
  return t < 1 ? 1 - Math.pow(1 - t, 3) * (1 - 2.2 * t) : 1; // quick overshoot
};

/** Props drawn behind the ball. */
export const BEHIND: readonly PropKind[] = ['fire'];

export const Prop: React.FC<PropDrawProps> = ({ kind, cx, cy, r, age, frame, facing }) => {
  const s = Math.max(0, pop(age));
  const g = (x: number, y: number, children: React.ReactNode) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>{children}</g>
  );
  switch (kind) {
    case 'crown': {
      const w = r * 0.9;
      const h = r * 0.5;
      return g(
        cx + facing * r * 0.12,
        cy - r * 1.02,
        <g transform={`rotate(${facing * 10})`}>
          <path
            d={`M${-w / 2},0 L${-w / 2},${-h} L${-w / 4},${-h * 0.45} L0,${-h * 1.1} L${w / 4},${-h * 0.45} L${w / 2},${-h} L${w / 2},0 Z`}
            fill="#f6c431"
            stroke="#7a5200"
            strokeWidth={r * 0.04}
            strokeLinejoin="round"
          />
          <circle cx={0} cy={-h * 0.35} r={r * 0.07} fill="#d6283a" />
          <circle cx={-w * 0.3} cy={-h * 0.25} r={r * 0.05} fill="#2a7bd6" />
          <circle cx={w * 0.3} cy={-h * 0.25} r={r * 0.05} fill="#2a7bd6" />
        </g>,
      );
    }
    case 'trophy': {
      const t = r * 0.55;
      const shine = 0.5 + 0.5 * Math.sin(frame / 6);
      return g(
        cx + facing * r * 1.05,
        cy + r * 0.05,
        <g>
          <path d={`M${-t * 0.5},${-t * 0.6} L${t * 0.5},${-t * 0.6} Q${t * 0.5},${t * 0.15} 0,${t * 0.25} Q${-t * 0.5},${t * 0.15} ${-t * 0.5},${-t * 0.6} Z`} fill="#f6c431" stroke="#7a5200" strokeWidth={r * 0.035} />
          <path d={`M${-t * 0.5},${-t * 0.45} q${-t * 0.35},0 ${-t * 0.3},${t * 0.3} q${t * 0.05},${t * 0.2} ${t * 0.32},${t * 0.15}`} fill="none" stroke="#7a5200" strokeWidth={r * 0.05} />
          <path d={`M${t * 0.5},${-t * 0.45} q${t * 0.35},0 ${t * 0.3},${t * 0.3} q${-t * 0.05},${t * 0.2} ${-t * 0.32},${t * 0.15}`} fill="none" stroke="#7a5200" strokeWidth={r * 0.05} />
          <rect x={-t * 0.08} y={t * 0.25} width={t * 0.16} height={t * 0.3} fill="#d9a520" />
          <rect x={-t * 0.32} y={t * 0.55} width={t * 0.64} height={t * 0.16} rx={t * 0.04} fill="#8a5a1a" />
          <path d={`M${-t * 0.3},${-t * 0.5} L${-t * 0.15},${-t * 0.5} L${-t * 0.22},${t * 0.05} Z`} fill="#fff" opacity={0.35 + 0.4 * shine} />
        </g>,
      );
    }
    case 'sweat': {
      const drip = (frame % 36) / 36;
      return g(
        cx - facing * r * 0.78,
        cy - r * 0.55 + drip * r * 0.18,
        <path d={`M0,${-r * 0.2} C${r * 0.13},${-r * 0.02} ${r * 0.12},${r * 0.12} 0,${r * 0.12} C${-r * 0.12},${r * 0.12} ${-r * 0.13},${-r * 0.02} 0,${-r * 0.2} Z`} fill="#7fd0ff" stroke="#2a7bd6" strokeWidth={r * 0.025} opacity={1 - drip * 0.4} />,
      );
    }
    case 'anger': {
      const throb = 1 + 0.12 * Math.sin(frame / 3);
      const a = r * 0.13;
      const arc = (rot: number) => (
        <path key={rot} d={`M${a * 0.35},${-a} Q${a * 0.35},${-a * 0.35} ${a},${-a * 0.35}`} transform={`rotate(${rot})`} fill="none" stroke="#e8202e" strokeWidth={r * 0.05} strokeLinecap="round" />
      );
      return g(cx + facing * r * 0.62, cy - r * 0.78, <g transform={`scale(${throb})`}>{[0, 90, 180, 270].map(arc)}</g>);
    }
    case 'fire': {
      const flick = (i: number) => 1 + 0.15 * Math.sin(frame / 2.5 + i * 1.7);
      const flame = (x: number, h: number, w: number, color: string, i: number) => (
        <path key={`${color}-${i}`} d={`M${x - w},0 Q${x - w * 0.8},${-h * 0.6 * flick(i)} ${x},${-h * flick(i)} Q${x + w * 0.8},${-h * 0.6 * flick(i)} ${x + w},0 Z`} fill={color} />
      );
      return g(
        cx,
        cy + r * 0.85,
        <g opacity={0.95}>
          {[-1.0, -0.55, 0, 0.55, 1.0].map((p, i) => flame(p * r, r * (2.9 - Math.abs(p) * 0.9), r * 0.5, '#ff4d00', i))}
          {[-0.75, -0.25, 0.25, 0.75].map((p, i) => flame(p * r, r * (2.3 - Math.abs(p) * 0.6), r * 0.36, '#ff9a00', i + 5))}
          {[-0.4, 0.4].map((p, i) => flame(p * r, r * 1.6, r * 0.25, '#ffd400', i + 9))}
        </g>,
      );
    }
    case 'tears': {
      const stream = (side: number) =>
        [0, 1, 2].map((i) => {
          const t = ((frame + i * 9) % 27) / 27;
          return <ellipse key={`${side}-${i}`} cx={side * r * 0.36} cy={r * 0.12 + t * r * 0.75} rx={r * 0.055} ry={r * 0.09} fill="#7fd0ff" opacity={1 - t} />;
        });
      return g(cx, cy, <g>{[...stream(-1), ...stream(1)]}</g>);
    }
    case 'ice':
      return g(
        cx,
        cy,
        <g>
          <circle r={r * 1.02} fill="#bfefff" opacity={0.42} />
          {[-0.5, -0.15, 0.2, 0.55].map((p, i) => (
            <path key={i} d={`M${p * r - r * 0.08},${r * 0.86 - Math.abs(p) * r * 0.2} L${p * r},${r * (1.12 + (i % 2) * 0.1) - Math.abs(p) * r * 0.2} L${p * r + r * 0.08},${r * 0.86 - Math.abs(p) * r * 0.2} Z`} fill="#dff8ff" stroke="#7fc8e6" strokeWidth={r * 0.02} />
          ))}
        </g>,
      );
    case 'sparkles': {
      const sp = (x: number, y: number, i: number) => {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(frame / 5 + i * 1.3));
        const a = r * 0.16 * tw;
        return <path key={i} d={`M${x},${y - a} L${x + a * 0.25},${y - a * 0.25} L${x + a},${y} L${x + a * 0.25},${y + a * 0.25} L${x},${y + a} L${x - a * 0.25},${y + a * 0.25} L${x - a},${y} L${x - a * 0.25},${y - a * 0.25} Z`} fill="#fff6a8" stroke="#e6b800" strokeWidth={r * 0.015} />;
      };
      return g(cx, cy, <g>{[[-1.15, -0.7], [1.2, -0.55], [-0.95, 0.45], [1.05, 0.6]].map(([x, y], i) => sp(x * r, y * r, i))}</g>);
    }
  }
};
