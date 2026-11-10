import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { track } from '../lib/anim';
import { makeProjection, WorldMap } from '../map/WorldMap';
import type { CharacterDefinition, SceneConfig } from '../engine/types';
import type { PlacedScene } from '../engine/timeline';
import { CharacterLayer } from './CharacterLayer';
import { Landscape, StageElements } from './elements';
import { Captions, SpeechCaptions, Titles } from './Overlay';

/** Renders one scene from its configuration. Frame numbers are local to the scene (Remotion <Sequence>). */
export const SceneRenderer: React.FC<{
  scene: SceneConfig;
  transitionIn: PlacedScene['transitionIn'];
  characters: Record<string, CharacterDefinition>;
}> = ({ scene, transitionIn, characters }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const uid = `s-${scene.id}`;

  // ---- background
  let background: React.ReactNode = null;
  let project: ((p: [number, number]) => [number, number] | null) | null = null;
  if (scene.background.type === 'worldMap') {
    const cam = scene.background.camera;
    const camera = {
      center: [track(frame, cam.lon), track(frame, cam.lat)] as [number, number],
      // interpolate the scale in log space so zooms feel uniform
      scale: Math.exp(track(frame, cam.scale.map((k) => ({ ...k, value: Math.log(k.value) })))),
    };
    const projection = makeProjection(camera, width, height);
    project = (p) => projection(p);
    const highlights: Record<string, number> = {};
    const colors: Record<string, string> = {};
    let color = '#f39c34';
    for (const h of scene.background.highlights ?? []) {
      const a = interpolate(frame, [h.from, h.from + h.fadeIn], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const pulse = h.pulse && a > 0 ? 0.85 + 0.15 * Math.sin((frame / fps) * Math.PI * 2) : 1;
      highlights[h.countryId] = a * pulse;
      color = h.color;
      colors[h.countryId] = h.color;
    }
    background = (
      <WorldMap
        uid={uid}
        camera={camera}
        width={width}
        height={height}
        highlights={highlights}
        highlightColor={color}
        highlightColors={colors}
        fillAll={scene.background.fillAll}
      />
    );
  } else {
    background = <Landscape uid={uid} bg={scene.background} width={width} height={height} />;
  }

  // ---- stage camera (zoom/pan of everything except captions and titles)
  const zoom = scene.camera ? track(frame, scene.camera.zoom) : 1;
  const camX = scene.camera ? track(frame, scene.camera.x) : width / 2;
  const camY = scene.camera ? track(frame, scene.camera.y) : height / 2;
  const stageTransform = `translate(${width / 2} ${height / 2}) scale(${zoom}) translate(${-camX} ${-camY})`;

  // ---- incoming transition (this scene is drawn on top of the previous one during the overlap)
  const style: React.CSSProperties = {};
  if (transitionIn && frame < transitionIn.durationInFrames) {
    const p = Easing.inOut(Easing.cubic)(frame / transitionIn.durationInFrames);
    if (transitionIn.type === 'crossfade') style.opacity = p;
    if (transitionIn.type === 'wipe-left') style.clipPath = `inset(0 0 0 ${((1 - p) * 100).toFixed(2)}%)`;
    if (transitionIn.type === 'iris') style.clipPath = `circle(${(p * 120).toFixed(2)}% at 50% 50%)`;
  }

  // ---- impact screen shake and flash
  let shakeX = 0;
  let shakeY = 0;
  for (const sh of scene.screenShakes ?? []) {
    if (frame < sh.from || frame > sh.to) continue;
    const decay = 1 - (frame - sh.from) / Math.max(1, sh.to - sh.from);
    shakeX += Math.sin(frame * 2.7) * sh.px * decay;
    shakeY += Math.cos(frame * 3.3) * sh.px * 0.6 * decay;
  }
  const flash = (scene.flashes ?? []).reduce((a, f0) => {
    const d = frame - f0;
    return d >= 0 && d < 7 ? Math.max(a, 0.55 * (1 - d / 7)) : a;
  }, 0);
  const screenPos = (ref: string) => {
    const c = scene.characters.find((ch) => ch.ref === ref);
    if (!c) return null;
    const r = c.radius ?? 100;
    if (c.position.space === 'geo') {
      const p = project?.([track(frame, c.position.lon), track(frame, c.position.lat)]);
      return p ? { x: p[0], y: p[1], r } : null;
    }
    return { x: (track(frame, c.position.x) - camX) * zoom + width / 2, y: (track(frame, c.position.y) - camY) * zoom + height / 2, r: r * zoom };
  };

  return (
    <AbsoluteFill style={style}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ transform: shakeX || shakeY ? `translate(${shakeX}px, ${shakeY}px)` : undefined }}>
        {scene.background.type === 'worldMap' ? (
          background
        ) : (
          <g transform={stageTransform}>{background}</g>
        )}
        <g transform={scene.background.type === 'worldMap' ? undefined : stageTransform}>
          <StageElements uid={uid} elements={scene.elements} frame={frame} fps={fps} width={width} />
          {scene.characters.map((c, i) => (
            <CharacterLayer
              key={`${c.ref}-${i}`}
              uid={`${uid}-${c.ref}-${i}`}
              c={c}
              def={characters[c.ref]}
              frame={frame}
              fps={fps}
              width={width}
              project={project}
            />
          ))}
        </g>
        <defs>
          <radialGradient id={`${uid}-vignette`} cx="50%" cy="50%" r="75%">
            <stop offset="62%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.3} />
          </radialGradient>
        </defs>
        <rect width={width} height={height} fill={`url(#${uid}-vignette)`} />
        {(scene.bursts ?? []).map((b, i) => {
          const d = frame - b.frame;
          if (d < 0 || d >= 22) return null;
          const p = screenPos(b.ref);
          if (!p) return null;
          const grow = d < 5 ? 0.5 + (d / 5) * 0.7 : 1.2 - Math.min(0.2, (d - 5) * 0.02);
          const fade = d > 16 ? 1 - (d - 16) / 6 : 1;
          const size = p.r * 1.25;
          const pts = Array.from({ length: 24 }, (_, k) => {
            const a = (k / 24) * Math.PI * 2;
            const rr = k % 2 === 0 ? size : size * 0.62;
            return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
          }).join(' ');
          return (
            <g
              key={`burst-${i}`}
              transform={`translate(${Math.max(size * 1.2, Math.min(width - size * 1.2, p.x + (p.x < width / 2 ? 1 : -1) * p.r * 1.1))} ${Math.max(size * 1.2, p.y - p.r * 1.7)}) rotate(-8) scale(${grow})`}
              opacity={fade}
            >
              <polygon points={pts} fill="#ffe14d" stroke="#141414" strokeWidth={6} strokeLinejoin="round" />
              <text x={0} y={size * 0.2} textAnchor="middle" fontFamily="'Segoe UI', Arial, sans-serif" fontWeight={900} fontSize={size * 0.55} fill="#e8202e" stroke="#141414" strokeWidth={3}>
                {b.text}
              </text>
            </g>
          );
        })}
      </svg>
      {flash > 0 ? <AbsoluteFill style={{ background: '#ffffff', opacity: flash, pointerEvents: 'none' }} /> : null}
      <Titles elements={scene.elements} frame={frame} />
      <Captions captions={scene.captions} frame={frame} characters={characters} />
      <SpeechCaptions
        captions={scene.captions}
        frame={frame}
        fps={fps}
        characters={characters}
        onScreen={scene.characters.filter((c) => !c.enter || frame >= c.enter.frame).map((c) => c.ref)}
        anchor={(ref) => {
          const c = scene.characters.find((ch) => ch.ref === ref);
          if (!c) return null;
          const r = c.radius ?? 100;
          let x: number;
          let y: number;
          if (c.position.space === 'geo') {
            const p = project?.([track(frame, c.position.lon), track(frame, c.position.lat)]);
            if (!p) return null;
            [x, y] = p;
          } else {
            // stage space goes through the stage camera
            x = (track(frame, c.position.x) - camX) * zoom + width / 2;
            y = (track(frame, c.position.y) - camY) * zoom + height / 2;
          }
          const rr = scene.background.type === 'worldMap' ? r : r * zoom;
          return { x, top: y - rr * 2, bottom: y + rr * 0.2 };
        }}
      />
    </AbsoluteFill>
  );
};
