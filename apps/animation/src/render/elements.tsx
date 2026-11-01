import React from 'react';
import { random } from 'remotion';
import { track } from '../lib/anim';
import type { BackgroundElement, BackgroundConfig } from '../engine/types';

/** Original, code-drawn background illustrations. All shapes are functions of the frame number only. */

export const Landscape: React.FC<{
  bg: Extract<BackgroundConfig, { type: 'landscape' }>;
  width: number;
  height: number;
  uid: string;
}> = ({ bg, width, height, uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={bg.skyTop} />
        <stop offset="100%" stopColor={bg.skyBottom} />
      </linearGradient>
      <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={bg.ground} />
        <stop offset="100%" stopColor={bg.groundDark} />
      </linearGradient>
    </defs>
    <rect x={-400} y={-400} width={width + 800} height={height + 800} fill={`url(#${uid}-sky)`} />
    <rect x={-400} y={bg.groundY} width={width + 800} height={height - bg.groundY + 400} fill={`url(#${uid}-ground)`} />
    {/* distant polder strips for depth */}
    {[0, 1, 2, 3].map((i) => (
      <rect
        key={i}
        x={-400}
        y={bg.groundY + 40 + i * 70}
        width={width + 800}
        height={6}
        fill="#000"
        opacity={0.06}
      />
    ))}
  </g>
);

const Sun: React.FC<{ x: number; y: number; r: number; frame: number }> = ({ x, y, r, frame }) => (
  <g>
    <circle cx={x} cy={y} r={r * (1.35 + 0.04 * Math.sin(frame / 12))} fill="#fff3b0" opacity={0.35} />
    <circle cx={x} cy={y} r={r} fill="#ffd95a" />
  </g>
);

const Cloud: React.FC<{ x: number; y: number; scale: number }> = ({ x, y, scale }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} fill="#ffffff" opacity={0.92}>
    <ellipse cx={0} cy={0} rx={90} ry={42} />
    <ellipse cx={-70} cy={12} rx={60} ry={32} />
    <ellipse cx={75} cy={10} rx={66} ry={34} />
    <ellipse cx={10} cy={-28} rx={58} ry={40} />
  </g>
);

const Windmill: React.FC<{ x: number; groundY: number; scale: number; angle: number }> = ({ x, groundY, scale, angle }) => {
  const s = scale;
  return (
    <g transform={`translate(${x} ${groundY}) scale(${s})`}>
      {/* tapered tower */}
      <path d="M -55 0 L -34 -230 L 34 -230 L 55 0 Z" fill="#7b5a3c" stroke="#3b2a1a" strokeWidth={4} />
      <rect x={-16} y={-60} width={32} height={60} rx={14} fill="#3b2a1a" />
      <rect x={-12} y={-170} width={24} height={30} rx={6} fill="#f7e3b5" stroke="#3b2a1a" strokeWidth={3} />
      {/* cap */}
      <path d="M -46 -228 Q 0 -290 46 -228 Z" fill="#a33b2a" stroke="#3b2a1a" strokeWidth={4} />
      {/* sails */}
      <g transform={`translate(0 -246) rotate(${angle})`}>
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <rect x={-5} y={-190} width={10} height={190} fill="#4a3522" />
            <rect x={5} y={-180} width={34} height={150} fill="#f4ead4" stroke="#4a3522" strokeWidth={3} />
            {[0, 1, 2, 3, 4].map((k) => (
              <line key={k} x1={5} x2={39} y1={-150 + k * 30} y2={-150 + k * 30} stroke="#4a3522" strokeWidth={2} />
            ))}
          </g>
        ))}
        <circle r={12} fill="#3b2a1a" />
      </g>
    </g>
  );
};

const Sea: React.FC<{
  edgeX: number;
  level: number;
  floorY: number;
  color: string;
  width: number;
  frame: number;
  uid: string;
}> = ({
  uid,
  edgeX,
  level,
  floorY,
  color,
  width,
  frame,
}) => {
  const right = width + 400;
  const pts: string[] = [];
  for (let x = edgeX; x <= right; x += 16) {
    const y = level + Math.sin(x * 0.02 + frame * 0.16) * 7 + Math.sin(x * 0.0065 - frame * 0.05) * 5;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  // Leading edge: a rolling crest that bulges towards the land.
  const crestTop = level + Math.sin(edgeX * 0.02 + frame * 0.16) * 7;
  const bulge = 26 + Math.sin(frame * 0.2) * 6;
  const body = `M ${right} ${floorY} L ${edgeX + 30} ${floorY} C ${edgeX - bulge} ${floorY - 20}, ${edgeX - bulge - 10} ${
    crestTop + 30
  }, ${edgeX} ${crestTop} L ${pts.join(' L ')} L ${right} ${floorY} Z`;
  const surface = `M ${edgeX} ${crestTop} L ${pts.join(' L ')}`;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.95} />
          <stop offset="100%" stopColor="#0b3d66" stopOpacity={1} />
        </linearGradient>
      </defs>
      <path d={body} fill={`url(#${uid}-sea)`} stroke="#0b3d66" strokeWidth={4} strokeLinejoin="round" />
      <path d={surface} fill="none" stroke="#e8f6ff" strokeWidth={7} strokeLinecap="round" opacity={0.9} />
      {/* foam on the crest */}
      <circle cx={edgeX + 4} cy={crestTop + 4} r={14} fill="#e8f6ff" opacity={0.9} />
      <circle cx={edgeX - 10} cy={crestTop + 22} r={9} fill="#e8f6ff" opacity={0.8} />
    </g>
  );
};

const Dike: React.FC<{ x: number; width: number; groundY: number; height: number }> = ({ x, width, groundY, height }) => {
  if (height <= 0.5) return null;
  const topL = x + width * 0.3;
  const topR = x + width * 0.7;
  const top = groundY - height;
  const seaSlope = `M ${topR} ${top} L ${x + width} ${groundY} L ${topR - 6} ${groundY} Z`;
  const rows = Math.max(1, Math.floor(height / 26));
  return (
    <g>
      <path
        d={`M ${x} ${groundY} L ${topL} ${top} L ${topR} ${top} L ${x + width} ${groundY} Z`}
        fill="#6aa84f"
        stroke="#2f4f1f"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {/* stone revetment on the sea side */}
      <path d={seaSlope} fill="#8d8f93" stroke="#3d3f44" strokeWidth={4} strokeLinejoin="round" />
      {Array.from({ length: rows }).map((_, i) => {
        const y = top + ((i + 1) * height) / (rows + 1);
        const t = (y - top) / height;
        return (
          <line
            key={i}
            x1={topR}
            x2={topR + (x + width - topR) * t}
            y1={y}
            y2={y}
            stroke="#3d3f44"
            strokeWidth={3}
            opacity={0.7}
          />
        );
      })}
      {/* grass crown */}
      <path d={`M ${topL - 4} ${top + 2} L ${topR + 4} ${top + 2}`} stroke="#9fd67a" strokeWidth={8} strokeLinecap="round" />
    </g>
  );
};

const Splash: React.FC<{ x: number; y: number; at: number[]; seed: string; frame: number }> = ({ x, y, at, seed, frame }) => {
  const life = 26;
  return (
    <g>
      {at.map((start, k) => {
        const t = frame - start;
        if (t < 0 || t > life) return null;
        const p = t / life;
        return (
          <g key={k} opacity={1 - p}>
            {Array.from({ length: 16 }).map((_, i) => {
              const ang = (-160 + random(`${seed}-${k}-a${i}`) * 140) * (Math.PI / 180);
              const speed = 9 + random(`${seed}-${k}-s${i}`) * 9;
              const dx = Math.cos(ang) * speed * t;
              const dy = Math.sin(ang) * speed * t + 0.55 * t * t;
              const r = 5 + random(`${seed}-${k}-r${i}`) * 8;
              return <circle key={i} cx={x + dx} cy={y + dy} r={r * (1 - p * 0.5)} fill="#e8f6ff" />;
            })}
            <path
              d={`M ${x - 70 * p - 20} ${y} Q ${x} ${y - 120 * Math.sin(p * Math.PI)} ${x + 70 * p + 20} ${y}`}
              fill="none"
              stroke="#e8f6ff"
              strokeWidth={10 * (1 - p)}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
};

/** Renders all non-title elements of a scene inside the SVG stage. */
export const StageElements: React.FC<{
  elements: BackgroundElement[];
  frame: number;
  fps: number;
  width: number;
  uid: string;
}> = ({
  uid,
  elements,
  frame,
  fps,
  width,
}) => (
  <>
    {elements.map((el, i) => {
      switch (el.type) {
        case 'sun':
          return <Sun key={i} x={el.x} y={el.y} r={el.r} frame={frame} />;
        case 'cloud':
          return <Cloud key={i} x={track(frame, el.x)} y={el.y} scale={el.scale} />;
        case 'windmill':
          return <Windmill key={i} x={el.x} groundY={el.groundY} scale={el.scale} angle={(frame / fps) * el.rpm * 6} />;
        case 'sea':
          return (
            <Sea
              key={i}
              uid={`${uid}-${i}`}
              edgeX={track(frame, el.edgeX)}
              level={track(frame, el.level)}
              floorY={el.floorY}
              color={el.color}
              width={width}
              frame={frame}
            />
          );
        case 'dike':
          return <Dike key={i} x={el.x} width={el.width} groundY={el.groundY} height={track(frame, el.height)} />;
        case 'splash':
          return <Splash key={i} x={track(frame, el.x)} y={track(frame, el.y)} at={el.at} seed={el.seed} frame={frame} />;
        case 'title':
          return null; // drawn in the HTML overlay, outside the camera
        default:
          return null;
      }
    })}
  </>
);
