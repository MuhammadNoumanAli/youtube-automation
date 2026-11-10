import React from 'react';
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from 'remotion';
import { buildAudioPlan, musicVolumeAt, type PlacedLine } from '../engine/dialogue';
import { placeScenes, totalDuration } from '../engine/timeline';
import type { VideoConfig } from '../engine/types';
import type { VoiceManifest } from '../engine/voice-types';
import { VideoRenderer } from './VideoRenderer';

/**
 * The existing VideoRenderer plus one audio clip per dialogue line, placed at the line's measured start frame, and
 * optional licence-checked music (ducked under speech) and sound effects from the voice manifest.
 * Audio files come from the render's public folder (render.mjs --audio-dir), loaded with staticFile().
 */
export const VoicedVideoRenderer: React.FC<{ video: VideoConfig; lines: PlacedLine[]; manifest?: VoiceManifest | null }> = ({
  video,
  lines,
  manifest = null,
}) => {
  const sceneStart = Object.fromEntries(placeScenes(video).map((p) => [p.scene.id, p.start]));
  const total = totalDuration(video);
  const plan = buildAudioPlan(lines, sceneStart, total, manifest);
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
      {plan.music ? (
        <Sequence from={0} durationInFrames={total} name="music" layout="none">
          <Html5Audio src={staticFile(plan.music.file)} loop volume={(f) => musicVolumeAt(f, plan.music!)} />
        </Sequence>
      ) : null}
      {manifest?.sfxKit
        ? video.scenes.flatMap((scene) =>
            (scene.sfxCues ?? [])
              .filter((cue) => manifest.sfxKit!.files[cue.kind] && cue.frame < scene.durationInFrames)
              .map((cue, i) => (
                <Sequence key={`cue-${scene.id}-${i}`} from={sceneStart[scene.id] + cue.frame} name={`sfx ${cue.kind}`} layout="none">
                  <Html5Audio src={staticFile(manifest.sfxKit!.files[cue.kind]!)} volume={cue.volume ?? 0.6} />
                </Sequence>
              )),
          )
        : null}
      {plan.sfx.map((s, i) => (
        <Sequence key={`${s.id}-${i}`} from={s.from} name={`sfx ${s.id}`} layout="none">
          <Html5Audio src={staticFile(s.file)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
