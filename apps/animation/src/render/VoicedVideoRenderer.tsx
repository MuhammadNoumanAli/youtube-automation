import React from 'react';
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from 'remotion';
import type { PlacedLine } from '../engine/dialogue';
import { placeScenes } from '../engine/timeline';
import type { VideoConfig } from '../engine/types';
import { VideoRenderer } from './VideoRenderer';

/**
 * The existing VideoRenderer plus one audio clip per dialogue line, placed at the line's measured start frame.
 * Audio files come from the render's public folder (render.mjs --audio-dir), loaded with staticFile().
 */
export const VoicedVideoRenderer: React.FC<{ video: VideoConfig; lines: PlacedLine[] }> = ({ video, lines }) => {
  const sceneStart = Object.fromEntries(placeScenes(video).map((p) => [p.scene.id, p.start]));
  return (
    <AbsoluteFill>
      <VideoRenderer video={video} />
      {lines
        .filter((l) => l.file)
        .map((l) => (
          <Sequence key={l.id} from={sceneStart[l.sceneId] + l.startFrame} durationInFrames={l.frames} name={`voice ${l.id}`} layout="none">
            <Html5Audio src={staticFile(l.file!)} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
