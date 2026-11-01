import React from 'react';
import { Composition } from 'remotion';
import { Spike } from './Spike';

export const RemotionRoot: React.FC = () => (
  <Composition id="Spike" component={Spike} durationInFrames={300} fps={30} width={1920} height={1080} />
);
