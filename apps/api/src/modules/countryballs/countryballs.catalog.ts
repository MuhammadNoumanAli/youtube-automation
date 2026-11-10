/**
 * What the Countryballs form may use. These lists mirror the animation app (apps/animation):
 *   countries   -> src/engine/characters.ts (CHARACTERS) and src/engine/countries.ts (COUNTRY_GEO)
 *   expressions -> src/character/expressions.ts
 *   templates   -> src/engine/spec.ts (TEMPLATES) and the dialogue settings
 *   voices      -> voice/catalog.mjs (KOKORO_ENGLISH_VOICES, US English only: one engine, one lexicon)
 * countryballs.catalog.spec.ts checks they still match the animation app when it is next to the API.
 * Adding a country means adding it to the animation app first, then here.
 */

export const COUNTRY_IDS = ['netherlands', 'belgium', 'germany', 'denmark', 'norway', 'japan'] as const;
export type CountryId = (typeof COUNTRY_IDS)[number];

export const COUNTRY_NAMES: Record<CountryId, string> = {
  netherlands: 'Netherlands',
  belgium: 'Belgium',
  germany: 'Germany',
  denmark: 'Denmark',
  norway: 'Norway',
  japan: 'Japan',
};

export const EXPRESSIONS = ['neutral', 'happy', 'surprised', 'angry', 'sad', 'determined'] as const;
export type ExpressionId = (typeof EXPRESSIONS)[number];

export const SCENE_TYPES = ['title-card', 'map-intro', 'map-focus', 'dialogue'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const DIALOGUE_SETTINGS = ['countryside', 'plain', 'coast'] as const;
export type DialogueSetting = (typeof DIALOGUE_SETTINGS)[number];

/** Kokoro v1.0 US-English voices (af_ = female, am_ = male). am_santa is left out on purpose. */
export const VOICES = [
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river',
  'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck',
] as const;
export type VoiceId = (typeof VOICES)[number];

export const DEFAULT_NARRATOR_VOICE: VoiceId = 'am_michael';
/** Same order as voice/spec.mjs DEFAULT_CAST_VOICES, so an unset voice sounds the same as before. */
export const DEFAULT_CAST_VOICES: VoiceId[] = ['af_heart', 'am_puck', 'af_bella', 'am_adam', 'af_nicole', 'am_eric'];

/** Limits from the animation app's validateSpec (src/engine/spec.ts). */
export const LIMITS = {
  titleChars: 100,
  sceneTitleChars: 40,
  lineChars: 90,
  castMax: 6,
  scenesMax: 12,
  linesPerSceneMax: 8,
  dialogueCast: [1, 3] as const,
  mapFocusCountries: [2, 4] as const,
  speed: [0.8, 1.25] as const,
};
