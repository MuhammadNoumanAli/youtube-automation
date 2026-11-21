import React from 'react';
import { Flag } from '../character/flags';
import type { Emblem, FlagSpec } from '../engine/types';

/**
 * Flags for the race country catalog (src/race/countries.json). Standard layouts are drawn by the project's own
 * Flag component (unchanged); this adds, for the race only:
 *   - layout 'shapes': a field colour + polygons / rectangles / lines (diagonal bands, pennants, saltires...)
 *   - `over`: shapes drawn on top of any layout (hoist triangles, cantons...)
 *   - `extra`: more emblems on top of any layout, including a few race-only emblem kinds
 * Coordinates are in the flag square -1..1 (x right, y down), like the existing flags. Simplified, original
 * geometric drawings: no coats of arms, no text.
 */

export type RaceShape =
  | { poly: [number, number][]; color: string }
  | { rect: [number, number, number, number]; color: string }
  | { line: [number, number, number, number]; width: number; color: string };

export type RaceEmblem = Omit<Emblem, 'kind'> & { kind: Emblem['kind'] | 'eagle' | 'tree' | 'shield' | 'temple' | 'hat' | 'trident' | 'diamond' };

export type RaceFlagSpec =
  | (FlagSpec & { over?: RaceShape[]; extra?: RaceEmblem[] })
  | { layout: 'shapes'; field: string; shapes: RaceShape[]; over?: RaceShape[]; extra?: RaceEmblem[] };

const RACE_KINDS = new Set(['eagle', 'tree', 'shield', 'temple', 'hat', 'trident', 'diamond']);

const Shape: React.FC<{ s: RaceShape; r: number }> = ({ s, r }) => {
  if ('poly' in s) return <polygon points={s.poly.map(([x, y]) => `${(x * r).toFixed(2)},${(y * r).toFixed(2)}`).join(' ')} fill={s.color} />;
  if ('rect' in s) {
    const [x, y, w, h] = s.rect;
    return <rect x={x * r} y={y * r} width={w * r + 0.3} height={h * r + 0.3} fill={s.color} />;
  }
  const [x1, y1, x2, y2] = s.line;
  return <line x1={x1 * r} y1={y1 * r} x2={x2 * r} y2={y2 * r} stroke={s.color} strokeWidth={s.width * r} />;
};

/** Race-only emblems: simple silhouettes, unit coordinates scaled by size. */
const RaceEmblemShape: React.FC<{ e: RaceEmblem; r: number }> = ({ e, r }) => {
  const cx = (e.x ?? 0) * r;
  const cy = (e.y ?? 0) * r;
  const s = (e.size ?? 0.4) * r;
  const t = `translate(${cx} ${cy}) scale(${s})`;
  switch (e.kind) {
    case 'eagle': // generic spread-wing bird, two heads
      return (
        <path
          transform={t}
          fill={e.color}
          d="M0,-0.55 L0.12,-0.75 L0.22,-0.62 L0.16,-0.45 L0.95,-0.7 L0.8,-0.35 L1,-0.25 L0.7,-0.05 L0.85,0.1 L0.45,0.15 L0.3,0.45 L0.4,0.85 L0,0.6 L-0.4,0.85 L-0.3,0.45 L-0.45,0.15 L-0.85,0.1 L-0.7,-0.05 L-1,-0.25 L-0.8,-0.35 L-0.95,-0.7 L-0.16,-0.45 L-0.22,-0.62 L-0.12,-0.75 Z"
        />
      );
    case 'tree': // stacked triangles + trunk (cedar)
      return (
        <g transform={t} fill={e.color}>
          <polygon points="0,-1 0.45,-0.45 -0.45,-0.45" />
          <polygon points="0,-0.65 0.7,0.05 -0.7,0.05" />
          <polygon points="0,-0.25 0.95,0.6 -0.95,0.6" />
          <rect x={-0.12} y={0.55} width={0.24} height={0.4} />
        </g>
      );
    case 'shield':
      return (
        <g transform={t}>
          <path d="M-0.7,-0.9 L0.7,-0.9 L0.7,0.1 Q0.7,0.7 0,1 Q-0.7,0.7 -0.7,0.1 Z" fill={e.color} stroke="#ffffff" strokeWidth={0.08} />
          {e.color2 ? (
            <g fill={e.color2}>
              <rect x={-0.09} y={-0.7} width={0.18} height={1.35} />
              <rect x={-0.42} y={-0.42} width={0.84} height={0.15} />
              <rect x={-0.55} y={-0.1} width={1.1} height={0.15} />
            </g>
          ) : null}
        </g>
      );
    case 'temple': // three towers on a base (Angkor-like silhouette)
      return (
        <g transform={t} fill={e.color}>
          <rect x={-1} y={0.45} width={2} height={0.25} />
          <polygon points="-0.2,0.45 -0.2,-0.3 0,-0.8 0.2,-0.3 0.2,0.45" />
          <polygon points="-0.75,0.45 -0.75,-0.05 -0.6,-0.45 -0.45,-0.05 -0.45,0.45" />
          <polygon points="0.45,0.45 0.45,-0.05 0.6,-0.45 0.75,-0.05 0.75,0.45" />
        </g>
      );
    case 'hat': // conical hat
      return (
        <g transform={t} fill={e.color}>
          <polygon points="0,-0.9 0.85,0.55 -0.85,0.55" />
          <rect x={-0.15} y={-1.05} width={0.3} height={0.25} />
        </g>
      );
    case 'trident':
      return (
        <g transform={t} fill={e.color}>
          <rect x={-0.08} y={-0.5} width={0.16} height={1.5} />
          <path d="M-0.7,-0.9 L-0.55,-0.9 Q-0.55,-0.3 0,-0.3 Q0.55,-0.3 0.55,-0.9 L0.7,-0.9 Q0.7,-0.1 0,-0.1 Q-0.7,-0.1 -0.7,-0.9 Z" />
          <polygon points="0,-1 0.15,-0.65 -0.15,-0.65" />
        </g>
      );
    case 'diamond':
      return <polygon transform={t} points="0,-1 0.6,0 0,1 -0.6,0" fill={e.color} />;
    default:
      return null;
  }
};

export const RaceFlag: React.FC<{ r: number; flag: RaceFlagSpec; uid: string }> = ({ r, flag, uid }) => {
  const base =
    flag.layout === 'shapes' ? (
      <>
        <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={flag.field} />
        {flag.shapes.map((s, i) => (
          <Shape key={i} s={s} r={r} />
        ))}
      </>
    ) : (
      <Flag r={r} flag={flag as FlagSpec} uid={uid} />
    );
  return (
    <>
      {base}
      {flag.over?.map((s, i) => <Shape key={`o${i}`} s={s} r={r} />)}
      {flag.extra?.map((e, i) =>
        RACE_KINDS.has(e.kind) ? (
          <RaceEmblemShape key={`e${i}`} e={e} r={r} />
        ) : (
          // standard emblem kinds: let the existing Flag draw just the emblem on a transparent field
          <Flag key={`e${i}`} r={r} uid={`${uid}-x${i}`} flag={{ layout: 'h-stripes', colors: ['none'], emblem: e as Emblem }} />
        ),
      )}
    </>
  );
};
