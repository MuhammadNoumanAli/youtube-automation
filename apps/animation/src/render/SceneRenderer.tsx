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
    background = <WorldMap uid={uid} camera={camera} width={width} height={height} highlights={highlights} highlightColor={color} highlightColors={colors} />;
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

  return (
    <AbsoluteFill style={style}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
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
      </svg>
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
