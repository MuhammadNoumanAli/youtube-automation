import React from 'react';
import { Composition } from 'remotion';
import { Spike } from './Spike';
import { totalDuration, validateVideo } from './engine/timeline';
import { VideoRenderer } from './render/VideoRenderer';
import { netherlandsDemo } from './videos/netherlands';
import { applyVoiceTiming } from './engine/dialogue';
import type { VoiceManifest } from './engine/voice-types';
import { VoicedVideoRenderer } from './render/VoicedVideoRenderer';
import { netherlandsVoicedBase, netherlandsVoiceScript } from './videos/netherlands-voiced';
import { buildFromSpec } from './engine/spec-build';
import type { VideoSpec } from './engine/spec';
import exampleSpec from './videos/specs/low-countries.spec.json';

const problems = validateVideo(netherlandsDemo);
if (problems.length) {
  // Fail loudly at bundle/selection time rather than rendering a broken video.
  throw new Error(`NetherlandsDemo config is invalid:\n- ${problems.join('\n- ')}`);
}

const NetherlandsDemo: React.FC = () => <VideoRenderer video={netherlandsDemo} />;

// ---- Voiced variant (Phase 3). Timing comes from the voice manifest passed in as input props by render.mjs.
type VoicedProps = { manifest: VoiceManifest | null };
const voicedTiming = (manifest: VoiceManifest | null) => applyVoiceTiming(netherlandsVoicedBase, netherlandsVoiceScript, manifest);
{
  const preview = voicedTiming(null);
  const structural = [...preview.problems, ...validateVideo(preview.video)];
  if (structural.length) throw new Error(`NetherlandsVoiced config is invalid:\n- ${structural.join('\n- ')}`);
}
const NetherlandsVoiced: React.FC<VoicedProps> = ({ manifest }) => {
  const t = voicedTiming(manifest);
  return <VoicedVideoRenderer video={t.video} lines={t.lines} manifest={manifest} />;
};

// ---- Generic composition (Phase 4): renders any video spec passed as input props (render.mjs --spec).
type SpecProps = { spec: VideoSpec; manifest: VoiceManifest | null };
const specTiming = ({ spec, manifest }: SpecProps) => {
  const built = buildFromSpec(spec);
  if (built.problems.length) throw new Error(`Video spec "${spec?.id}" is invalid:\n- ${built.problems.join('\n- ')}`);
  const t = applyVoiceTiming(built.video, built.script, manifest);
  const structural = [...t.problems.filter((p) => !manifest || !p.includes('no audio')), ...validateVideo(t.video)];
  if (manifest && t.problems.length) throw new Error(`Video spec "${spec.id}" does not match its voice manifest:\n- ${t.problems.join('\n- ')}`);
  if (structural.length) throw new Error(`Video spec "${spec.id}" produced an invalid video:\n- ${structural.join('\n- ')}`);
  return t;
};
const FromSpec: React.FC<SpecProps> = (props) => {
  const t = specTiming(props);
  return <VoicedVideoRenderer video={t.video} lines={t.lines} manifest={props.manifest} />;
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Spike" component={Spike} durationInFrames={300} fps={30} width={1920} height={1080} />
    <Composition
      id={netherlandsDemo.id}
      component={NetherlandsDemo}
      durationInFrames={totalDuration(netherlandsDemo)}
      fps={netherlandsDemo.fps}
      width={netherlandsDemo.width}
      height={netherlandsDemo.height}
    />
    <Composition
      id={netherlandsVoicedBase.id}
      component={NetherlandsVoiced}
      defaultProps={{ manifest: null } as VoicedProps}
      calculateMetadata={({ props }) => ({ durationInFrames: totalDuration(voicedTiming(props.manifest).video) })}
      durationInFrames={totalDuration(voicedTiming(null).video)}
      fps={netherlandsVoicedBase.fps}
      width={netherlandsVoicedBase.width}
      height={netherlandsVoicedBase.height}
    />
    <Composition
      id="FromSpec"
      component={FromSpec}
      defaultProps={{ spec: exampleSpec as unknown as VideoSpec, manifest: null } as SpecProps}
      calculateMetadata={({ props }) => {
        const t = specTiming(props);
        return { durationInFrames: totalDuration(t.video), width: t.video.width, height: t.video.height, fps: t.video.fps };
      }}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
