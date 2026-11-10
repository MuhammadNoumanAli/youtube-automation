import React from 'react';
import type { Emblem, FlagSpec } from '../engine/types';

/**
 * Flag artwork for the countryball body: original, simplified geometric drawings (no coats of arms, no text).
 * Everything is drawn in a square from -r..r (the ball clips it to a circle).
 */

const star = (cx: number, cy: number, outer: number, rot = -90, inner = 0.382) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 === 0 ? outer : outer * inner;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
};

/** Simplified original maple-leaf outline (unit coordinates, centred, ~1 tall). */
const MAPLE =
  'M0,-0.5 L0.07,-0.36 L0.15,-0.4 L0.12,-0.2 L0.26,-0.32 L0.3,-0.24 L0.42,-0.27 L0.37,-0.12 L0.46,-0.07 ' +
  'L0.24,0.1 L0.28,0.18 L0.05,0.15 L0.04,0.42 L-0.04,0.42 L-0.05,0.15 L-0.28,0.18 L-0.24,0.1 L-0.46,-0.07 ' +
  'L-0.37,-0.12 L-0.42,-0.27 L-0.3,-0.24 L-0.26,-0.32 L-0.12,-0.2 L-0.15,-0.4 L-0.07,-0.36 Z';

const EmblemShape: React.FC<{ r: number; e: Emblem; uid: string }> = ({ r, e, uid }) => {
  const cx = (e.x ?? 0) * r;
  const cy = (e.y ?? 0) * r;
  const s = (e.size ?? 0.4) * r;
  const c = e.color;
  switch (e.kind) {
    case 'disc':
      return <circle cx={cx} cy={cy} r={s} fill={c} />;
    case 'ring':
      return <circle cx={cx} cy={cy} r={s * 0.8} fill="none" stroke={c} strokeWidth={s * 0.28} />;
    case 'star':
      return <polygon points={star(cx, cy, s)} fill={c} />;
    case 'crescent-star': {
      const id = `${uid}-cres`;
      return (
        <>
          <defs>
            <mask id={id}>
              <rect x={-r} y={-r} width={r * 2} height={r * 2} fill="#000" />
              <circle cx={cx} cy={cy} r={s * 0.62} fill="#fff" />
              <circle cx={cx + s * 0.17} cy={cy} r={s * 0.5} fill="#000" />
            </mask>
          </defs>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={c} mask={`url(#${id})`} />
          <polygon points={star(cx + s * 0.5, cy, s * 0.22, 180)} fill={c} />
        </>
      );
    }
    case 'maple':
      return <path d={MAPLE} transform={`translate(${cx} ${cy}) scale(${s * 2})`} fill={c} />;
    case 'wheel': {
      const spokes = Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * s * 0.85} y2={cy + Math.sin(a) * s * 0.85} stroke={c} strokeWidth={s * 0.07} />;
      });
      return (
        <>
          <circle cx={cx} cy={cy} r={s * 0.85} fill="none" stroke={c} strokeWidth={s * 0.12} />
          {spokes}
          <circle cx={cx} cy={cy} r={s * 0.14} fill={c} />
        </>
      );
    }
    case 'sun': {
      const rays = Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI) / 8;
        const p = (d: number, off: number) => `${(cx + Math.cos(a + off) * d).toFixed(2)},${(cy + Math.sin(a + off) * d).toFixed(2)}`;
        return <polygon key={i} points={`${p(s * 0.55, -0.12)} ${p(s, 0)} ${p(s * 0.55, 0.12)}`} fill={c} />;
      });
      return (
        <>
          {rays}
          <circle cx={cx} cy={cy} r={s * 0.5} fill={c} />
        </>
      );
    }
    case 'star-grid': {
      // rows x cols of small stars filling a box of size 2s (width) x 1.4s (height), top-left at (cx-s, cy-0.7s)
      const rows = e.rows ?? 5;
      const cols = e.cols ?? 6;
      const w = s * 2;
      const h = s * 1.4;
      const out: React.ReactNode[] = [];
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) {
          const x = cx - s + (w * (j + 0.5 + (i % 2) * 0.25)) / (cols + 0.25);
          const y = cy - h / 2 + (h * (i + 0.5)) / rows;
          out.push(<polygon key={`${i}-${j}`} points={star(x, y, Math.min(w / cols, h / rows) * 0.42)} fill={c} />);
        }
      return <>{out}</>;
    }
    case 'star-cluster':
      return (
        <>
          <polygon points={star(cx, cy, s)} fill={c} />
          {[
            [1.35, -0.75, 20],
            [1.75, -0.25, 45],
            [1.75, 0.35, 70],
            [1.35, 0.85, 20],
          ].map(([dx, dy, rot], i) => (
            <polygon key={i} points={star(cx + dx * s, cy + dy * s, s * 0.32, rot)} fill={c} />
          ))}
        </>
      );
    case 'hexagram': {
      const tri = (rot: number) =>
        [0, 1, 2]
          .map((i) => {
            const a = ((rot + i * 120) * Math.PI) / 180;
            return `${(cx + Math.cos(a) * s).toFixed(2)},${(cy + Math.sin(a) * s).toFixed(2)}`;
          })
          .join(' ');
      return (
        <>
          <polygon points={tri(-90)} fill="none" stroke={c} strokeWidth={s * 0.14} strokeLinejoin="round" />
          <polygon points={tri(90)} fill="none" stroke={c} strokeWidth={s * 0.14} strokeLinejoin="round" />
        </>
      );
    }
    case 'pentagram-outline':
      return <polygon points={star(cx, cy, s, -90, 0.382)} fill="none" stroke={c} strokeWidth={s * 0.13} strokeLinejoin="round" />;
    case 'taeguk':
      return (
        <g transform={`translate(${cx} ${cy}) rotate(30)`}>
          <circle r={s} fill={e.color2 ?? '#0047a0'} />
          <path d={`M${-s},0 A${s},${s} 0 0 1 ${s},0 A${s / 2},${s / 2} 0 0 1 0,0 A${s / 2},${s / 2} 0 0 0 ${-s},0 Z`} fill={c} />
        </g>
      );
    case 'checker': {
      const n = 5;
      const side = (s * 2) / n;
      const cells: React.ReactNode[] = [];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          cells.push(
            <rect key={`${i}-${j}`} x={cx - s + j * side} y={cy - s + i * side} width={side + 0.3} height={side + 0.3} fill={(i + j) % 2 === 0 ? c : e.color2 ?? '#ffffff'} />,
          );
      return <>{cells}</>;
    }
    case 'cross':
      return (
        <>
          <rect x={cx - s} y={cy - s * 0.2} width={s * 2} height={s * 0.4} fill={c} />
          <rect x={cx - s * 0.2} y={cy - s} width={s * 0.4} height={s * 2} fill={c} />
        </>
      );
  }
};

/** Simplified Union design (St George + saltires) inside a box. */
const Union: React.FC<{ x: number; y: number; w: number; h: number; uid: string }> = ({ x, y, w, h, uid }) => {
  const id = `${uid}-union`;
  const t = Math.min(w, h);
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y} width={w} height={h} fill="#012169" />
        <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="#ffffff" strokeWidth={t * 0.2} />
        <line x1={x + w} y1={y} x2={x} y2={y + h} stroke="#ffffff" strokeWidth={t * 0.2} />
        <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="#c8102e" strokeWidth={t * 0.07} />
        <line x1={x + w} y1={y} x2={x} y2={y + h} stroke="#c8102e" strokeWidth={t * 0.07} />
        <rect x={x + w / 2 - t * 0.17} y={y} width={t * 0.34} height={h} fill="#ffffff" />
        <rect x={x} y={y + h / 2 - t * 0.17} width={w} height={t * 0.34} fill="#ffffff" />
        <rect x={x + w / 2 - t * 0.1} y={y} width={t * 0.2} height={h} fill="#c8102e" />
        <rect x={x} y={y + h / 2 - t * 0.1} width={w} height={t * 0.2} fill="#c8102e" />
      </g>
    </g>
  );
};

const bands = (colors: string[], weights: number[] | undefined, size: number) => {
  const w = weights && weights.length === colors.length ? weights : colors.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return colors.map((c, i) => {
    const start = (acc / total) * size;
    acc += w[i];
    return { color: c, start, length: (w[i] / total) * size };
  });
};

export const Flag: React.FC<{ r: number; flag: FlagSpec; uid: string }> = ({ r, flag, uid }) => {
  const size = r * 2;
  let body: React.ReactNode;
  let emblem: Emblem | undefined;
  switch (flag.layout) {
    case 'nordic-cross': {
      // Cross offset towards the hoist, as on Nordic flags. Proportions are approximate.
      const cx = -r * 0.28;
      const w = r * 0.3;
      const b = flag.border ? r * 0.12 : 0;
      body = (
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
      break;
    }
    case 'disc':
      body = (
        <>
          <rect x={-r} y={-r} width={size} height={size} fill={flag.field} />
          <circle cx={0} cy={r * 0.08} r={r * 0.42} fill={flag.disc} />
        </>
      );
      break;
    case 'cross':
      body = (
        <>
          <rect x={-r} y={-r} width={size} height={size} fill={flag.field} />
          <rect x={-r * (flag.arm ?? 1)} y={-r * 0.16} width={size * (flag.arm ?? 1)} height={r * 0.32} fill={flag.cross} />
          <rect x={-r * 0.16} y={-r * (flag.arm ?? 1)} width={r * 0.32} height={size * (flag.arm ?? 1)} fill={flag.cross} />
        </>
      );
      emblem = flag.emblem;
      break;
    case 'union':
      body = <Union x={-r} y={-r} w={size} h={size} uid={uid} />;
      break;
    case 'union-canton':
      body = (
        <>
          <rect x={-r} y={-r} width={size} height={size} fill={flag.field} />
          <Union x={-r} y={-r} w={r} h={r} uid={uid} />
        </>
      );
      emblem = flag.emblem;
      break;
    case 'canton-stripes': {
      const stripes = Array.from({ length: flag.count }, (_, i) => flag.stripes[i % flag.stripes.length]);
      const h = size / flag.count;
      const cw = size * flag.cantonW;
      const ch = size * flag.cantonH;
      body = (
        <>
          {stripes.map((c, i) => (
            <rect key={i} x={-r} y={-r + h * i} width={size} height={h + 0.5} fill={c} />
          ))}
          <rect x={-r} y={-r} width={cw} height={ch} fill={flag.canton} />
        </>
      );
      // Emblem coordinates for canton flags are relative to the canton centre.
      if (flag.emblem)
        emblem = { ...flag.emblem, x: (-r + cw / 2) / r + (flag.emblem.x ?? 0), y: (-r + ch / 2) / r + (flag.emblem.y ?? 0) };
      break;
    }
    case 'hoist-triangle': {
      const b = bands(flag.colors, flag.weights, size);
      const depth = size * flag.depth;
      body = (
        <>
          {b.map((s, i) => (
            <rect key={i} x={-r} y={-r + s.start} width={size} height={s.length + 0.5} fill={s.color} />
          ))}
          <polygon points={`${-r},${-r} ${-r + depth},0 ${-r},${r}`} fill={flag.triangle} />
        </>
      );
      if (flag.emblem) emblem = { ...flag.emblem, x: (-r + depth * 0.36) / r + (flag.emblem.x ?? 0) };
      break;
    }
    case 'hoist-band': {
      const bw = size * flag.bandWidth;
      const b = bands(flag.colors, flag.weights, size);
      body = (
        <>
          {b.map((s, i) => (
            <rect key={i} x={-r} y={-r + s.start} width={size} height={s.length + 0.5} fill={s.color} />
          ))}
          <rect x={-r} y={-r} width={bw} height={size} fill={flag.band} />
        </>
      );
      break;
    }
    case 'diamond':
      body = (
        <>
          <rect x={-r} y={-r} width={size} height={size} fill={flag.field} />
          <polygon points={`0,${-r * 0.78} ${r * 0.92},0 0,${r * 0.78} ${-r * 0.92},0`} fill={flag.diamond} />
          <circle cx={0} cy={0} r={r * 0.4} fill={flag.disc} />
        </>
      );
      break;
    case 'h-stripes':
    case 'v-stripes': {
      const b = bands(flag.colors, flag.weights, size);
      body =
        flag.layout === 'h-stripes' ? (
          <>
            {b.map((s, i) => (
              <rect key={i} x={-r} y={-r + s.start} width={size} height={s.length + 0.5} fill={s.color} />
            ))}
          </>
        ) : (
          <>
            {b.map((s, i) => (
              <rect key={i} x={-r + s.start} y={-r} width={s.length + 0.5} height={size} fill={s.color} />
            ))}
          </>
        );
      emblem = flag.emblem;
      break;
    }
  }
  return (
    <>
      {body}
      {emblem ? <EmblemShape r={r} e={emblem} uid={uid} /> : null}
    </>
  );
};
