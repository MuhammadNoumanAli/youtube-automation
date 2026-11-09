/**
 * VideoSpec -> VideoConfig + timing script (for applyVoiceTiming). Pure: same spec, same result.
 * Voices are not needed here; voice/spec.mjs builds the voice script for the voice step from the same spec.
 */
import { CHARACTERS, pickCharacters } from './characters';
import { COUNTRY_GEO } from './countries';
import { dimensions, validateSpec, type VideoFormat, type VideoSpec } from './spec';
import type { VideoConfig } from './types';
import type { VoiceScript } from './voice-types';
import { buildScene } from '../templates';

export interface BuiltVideo {
  video: VideoConfig;
  /** Dialogue lines with scene placement hints; voices are irrelevant for timing. */
  script: VoiceScript;
  problems: string[];
}

const TRANSITION = 20;

export function buildFromSpec(spec: VideoSpec, formatOverride?: VideoFormat): BuiltVideo {
  const problems = validateSpec(spec, new Set(Object.keys(CHARACTERS)), new Set(Object.keys(COUNTRY_GEO)));
  const format = formatOverride ?? spec.format;
  const { width, height } = dimensions(format === '9:16' ? '9:16' : '16:9');
  const fps = 30;
  const empty: BuiltVideo = {
    video: { id: spec?.id ?? 'invalid', title: spec?.title ?? '', width, height, fps, characters: [], scenes: [] },
    script: { schemaVersion: 1, videoId: spec?.id ?? 'invalid', narrator: { voice: { engine: 'kokoro', voice: 'am_michael' } }, characters: {}, lines: [] },
    problems,
  };
  if (problems.length) return empty;

  const characters = pickCharacters(...spec.cast.map((c) => c.id));
  const ctx = { width, height, fps, characters: Object.fromEntries(characters.map((c) => [c.id, c])) };
  const built = spec.scenes.map((s) => buildScene(s, ctx));
  const scenes = built.map((b, i) => (i < built.length - 1 ? { ...b.scene, transitionOut: { type: 'crossfade' as const, durationInFrames: TRANSITION } } : b.scene));

  return {
    video: { id: spec.id, title: spec.title, width, height, fps, characters, scenes },
    script: {
      schemaVersion: 1,
      videoId: spec.id,
      narrator: spec.narrator ?? { voice: { engine: 'kokoro', voice: 'am_michael' } },
      characters: Object.fromEntries(spec.cast.map((c) => [c.id, { voice: c.voice ?? { engine: 'kokoro', voice: 'af_heart' } }])),
      lines: built.flatMap((b) => b.lines),
      music: spec.music,
      sfx: spec.sfx,
    },
    problems,
  };
}
