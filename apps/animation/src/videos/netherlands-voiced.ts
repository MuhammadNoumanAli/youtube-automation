import type { VideoConfig } from '../engine/types';
import type { VoiceScript } from '../engine/voice-types';
import { netherlandsDemo } from './netherlands';
import voiceScriptJson from './netherlands-voiced.voice.json';

/**
 * Voiced version of the Netherlands demo. Same scenes and animation as netherlandsDemo (not modified); its
 * hand-timed captions are removed because captions are now generated from the measured dialogue audio.
 * The dialogue and voice assignments live in netherlands-voiced.voice.json, which the voice step reads too.
 */
export const netherlandsVoicedBase: VideoConfig = {
  ...netherlandsDemo,
  id: 'NetherlandsVoiced',
  title: `${netherlandsDemo.title} (voiced)`,
  scenes: netherlandsDemo.scenes.map((s) => ({ ...s, captions: [] })),
};

export const netherlandsVoiceScript = voiceScriptJson as unknown as VoiceScript;
