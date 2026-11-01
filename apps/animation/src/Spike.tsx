import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CountryBall, FlagSpec } from './character/CountryBall';
import { Expression } from './character/expressions';
import { Keyframe, lerp, stepTrack, track } from './lib/anim';
import { Camera, makeProjection, WorldMap } from './map/WorldMap';

/**
 * Render spike: an original Countryball travels across a Natural Earth world map
 * while the camera pushes in from a world view to Western Europe.
 * 10 s · 1920×1080 · 30 fps. Everything is driven by frame number only (deterministic).
 */

const FLAG: FlagSpec = { layout: 'h-stripes', colors: ['#c8102e', '#ffffff', '#1d3f8f'] };
const HOME_ID = '528'; // ISO 3166-1 numeric: Netherlands

// Camera: centre and log-scale keyframes.
const CAM_LON: Keyframe<number>[] = [
  { frame: 0, value: -5 },
  { frame: 45, value: -5 },
  { frame: 190, value: 3, ease: 'inOutCubic' },
  { frame: 300, value: 5.2, ease: 'inOutSine' },
];
const CAM_LAT: Keyframe<number>[] = [
  { frame: 0, value: 22 },
  { frame: 45, value: 22 },
  { frame: 190, value: 49, ease: 'inOutCubic' },
  { frame: 300, value: 51.6, ease: 'inOutSine' },
];
const CAM_LOGSCALE: Keyframe<number>[] = [
  { frame: 0, value: Math.log(300) },
  { frame: 45, value: Math.log(320) },
  { frame: 190, value: Math.log(1600), ease: 'inOutCubic' },
  { frame: 300, value: Math.log(2700), ease: 'inOutSine' },
];

// Character route in geographic coordinates, so it stays pinned to the map while the camera moves.
const BALL_LON: Keyframe<number>[] = [
  { frame: 0, value: -38 },
  { frame: 20, value: -38 },
  { frame: 205, value: 5.3, ease: 'inOutSine' },
];
const BALL_LAT: Keyframe<number>[] = [
  { frame: 0, value: 30 },
  { frame: 20, value: 30 },
  { frame: 110, value: 44, ease: 'inOutSine' },
  { frame: 205, value: 52.2, ease: 'outCubic' },
];

const EXPRESSION_TRACK: Keyframe<Expression>[] = [
  { frame: 0, value: 'neutral' },
  { frame: 30, value: 'happy' },
  { frame: 120, value: 'determined' },
  { frame: 200, value: 'surprised' },
  { frame: 238, value: 'happy' },
  { frame: 276, value: 'angry' },
];

export const Spike: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const camera: Camera = {
    center: [track(frame, CAM_LON), track(frame, CAM_LAT)],
    scale: Math.exp(track(frame, CAM_LOGSCALE)),
  };
  const projection = makeProjection(camera, width, height);
  const geo: [number, number] = [track(frame, BALL_LON), track(frame, BALL_LAT)];
  const [px, py] = projection(geo) ?? [width / 2, height / 2];

  // Travel phase: hop while moving (frames 20–205), then settle with a squash.
  const moving = frame > 20 && frame < 205;
  const hopPhase = ((frame - 20) / 18) * Math.PI;
  const hop = moving ? Math.abs(Math.sin(hopPhase)) : 0;
  const lift = hop * 46;
  const landing = moving ? Math.max(0, 1 - Math.abs(Math.sin(hopPhase)) * 6) : 0;
  const settle =
    frame >= 205 && frame < 235 ? Math.sin(((frame - 205) / 30) * Math.PI * 2) * 0.18 * (1 - (frame - 205) / 30) : 0;
  // Little indignant hop at the end when the expression turns angry.
  const angryHop = frame >= 276 ? Math.abs(Math.sin(((frame - 276) / 12) * Math.PI)) * 18 : 0;
  const squash = landing * 0.22 - hop * 0.08 + settle;

  // Entrance pop.
  const appear = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pop = appear < 1 ? appear * (1 + Math.sin(appear * Math.PI) * 0.25) : 1;

  const tilt = moving ? Math.sin(hopPhase * 0.5) * 6 : lerp(0, -4, Math.min(1, Math.max(0, (frame - 205) / 20)));
  const expr = stepTrack(frame, EXPRESSION_TRACK, 5);

  // Eyes look ahead while travelling, then at the camera, then down at "home".
  const lookX = frame < 200 ? 0.8 : frame < 240 ? lerp(0.8, 0, (frame - 200) / 40) : 0;
  const lookY = frame >= 240 && frame < 276 ? 0.6 : 0;

  // Home country highlight fades in on arrival and pulses gently.
  const hl = interpolate(frame, [196, 232], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = hl > 0 ? 0.85 + 0.15 * Math.sin((frame / fps) * Math.PI * 2) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#5f9fcc' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <WorldMap
          camera={camera}
          width={width}
          height={height}
          highlights={{ [HOME_ID]: hl * pulse }}
          highlightColor="#f39c34"
        />
        <g transform={`translate(${px} ${py}) scale(${pop}) translate(${-px} ${-py})`}>
          <CountryBall
            id="hero"
            frame={frame}
            fps={fps}
            x={px}
            y={py - 120}
            radius={115}
            flag={FLAG}
            expression={expr.current}
            previousExpression={expr.previous}
            expressionBlend={expr.blend}
            squash={squash}
            rotation={tilt}
            look={{ x: lookX, y: lookY }}
            facing={1}
            lift={lift + angryHop}
            blinkSeed="hero"
          />
        </g>
        {/* soft vignette */}
        <defs>
          <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.35} />
          </radialGradient>
        </defs>
        <rect width={width} height={height} fill="url(#vignette)" />
      </svg>
    </AbsoluteFill>
  );
};
