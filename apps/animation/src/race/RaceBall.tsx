import React from 'react';
import { EXPRESSIONS, eyePath, type Expression } from '../character/expressions';
import { RaceFlag, type RaceFlagSpec } from './RaceFlag';
import { blinkAmount } from '../character/CountryBall';

/**
 * A marble version of the countryball: the flag rolls with the ball, the shading, outline and eyes stay upright
 * (so it still reads as a character). Reuses the existing flag artwork and eye shapes unchanged.
 */
export const RaceBall: React.FC<{
  uid: string;
  x: number;
  y: number;
  r: number;
  flag: RaceFlagSpec;
  /** Degrees the flag has rolled. */
  roll: number;
  expression?: Expression;
  look?: { x: number; y: number };
  frame: number;
  fps: number;
  eyes?: boolean;
  opacity?: number;
}> = ({ uid, x, y, r, flag, roll, expression = 'neutral', look = { x: 0, y: 0 }, frame, fps, eyes = true, opacity = 1 }) => {
  const clipId = `rb-clip-${uid}`;
  const shadeId = `rb-shade-${uid}`;
  const outline = Math.max(1.5, r * 0.07);
  const eye = EXPRESSIONS[expression];
  const blink = blinkAmount(frame, fps, uid);
  const eyeRx = r * 0.23;
  const eyeRy = r * 0.3;
  const eyeDX = r * 0.36;
  const eyeY = -r * 0.12 + look.y * r * 0.05;
  const lookX = look.x * r * 0.08;
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <defs>
        <clipPath id={clipId}>
          <circle r={r} />
        </clipPath>
        <radialGradient id={shadeId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.4} />
          <stop offset="55%" stopColor="#fff" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.25} />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`rotate(${roll})`}>
          <RaceFlag r={r} flag={flag} uid={uid} />
        </g>
        <circle r={r} fill={`url(#${shadeId})`} />
      </g>
      <circle r={r} fill="none" stroke="#141414" strokeWidth={outline} />
      {eyes && r >= 9 ? (
        <g transform={`translate(${lookX} ${eyeY})`}>
          {([-1, 1] as const).map((side) => (
            <path
              key={side}
              d={eyePath(eyeRx, eyeRy, eye, side, blink)}
              transform={`translate(${side * eyeDX} 0)`}
              fill="#fff"
              stroke="#141414"
              strokeWidth={outline * 0.8}
              strokeLinejoin="round"
            />
          ))}
        </g>
      ) : null}
    </g>
  );
};
