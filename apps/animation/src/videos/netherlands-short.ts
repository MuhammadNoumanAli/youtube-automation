import type { VideoConfig } from '../engine/types';
import type { VoiceScript } from '../engine/voice-types';
import { netherlandsVoicedBase } from './netherlands-voiced';
import voiceScriptJson from './netherlands-short.voice.json';

/**
 * Tighter Netherlands Short: same scenes and animation as the voiced demo (nothing there is changed), with a
 * narrator hook from the first second, lines moved to match the animation beats, and short lines filling the gaps.
 * Dialogue and voices: netherlands-short.voice.json (the 8 original lines reuse their cached audio).
 */
export const netherlandsShortBase: VideoConfig = {
  ...netherlandsVoicedBase,
  id: 'NetherlandsShort',
  title: 'Netherlands Countryball (Short)',
};

export const netherlandsShortScript = voiceScriptJson as unknown as VoiceScript;
