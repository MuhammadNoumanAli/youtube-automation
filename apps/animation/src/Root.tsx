import React from 'react';
import { Composition } from 'remotion';
import { Spike } from './Spike';
import { totalDuration, validateVideo } from './engine/timeline';
import { VideoRenderer } from './render/VideoRenderer';
import { netherlandsDemo } from './videos/netherlands';

const problems = validateVideo(netherlandsDemo);
if (problems.length) {
  // Fail loudly at bundle/selection time rather than rendering a broken video.
  throw new Error(`NetherlandsDemo config is invalid:\n- ${problems.join('\n- ')}`);
}

const NetherlandsDemo: React.FC = () => <VideoRenderer video={netherlandsDemo} />;

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
  </>
);
