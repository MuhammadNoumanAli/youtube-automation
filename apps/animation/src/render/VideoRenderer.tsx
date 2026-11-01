import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { placeScenes } from '../engine/timeline';
import type { VideoConfig } from '../engine/types';
import { SceneRenderer } from './SceneRenderer';

/** Renders a whole VideoConfig: scenes in order, each overlapping the previous one by its incoming transition. */
export const VideoRenderer: React.FC<{ video: VideoConfig }> = ({ video }) => {
  const characters = Object.fromEntries(video.characters.map((c) => [c.id, c]));
  return (
    <AbsoluteFill style={{ backgroundColor: '#0b1a2a' }}>
      {placeScenes(video).map((p) => (
        <Sequence key={p.scene.id} from={p.start} durationInFrames={p.scene.durationInFrames} name={p.scene.title}>
          <SceneRenderer scene={p.scene} transitionIn={p.transitionIn} characters={characters} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
