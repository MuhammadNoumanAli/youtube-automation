/**
 * What the Countryballs form may use. These lists mirror the animation app (apps/animation):
 *   countries   -> src/engine/characters.ts (CHARACTERS) and src/engine/countries.ts (COUNTRY_GEO)
 *   expressions -> src/character/expressions.ts
 *   templates   -> src/engine/spec.ts (TEMPLATES) and the dialogue settings
 *   voices      -> voice/catalog.mjs (KOKORO_ENGLISH_VOICES, US English only: one engine, one lexicon)
 * countryballs.catalog.spec.ts checks they still match the animation app when it is next to the API.
 * Adding a country means adding it to the animation app first, then here.
 */

export const COUNTRY_IDS = [
  'netherlands', 'belgium', 'germany', 'denmark', 'norway', 'japan', 'france', 'spain', 'italy', 'uk', 'portugal',
  'poland', 'sweden', 'finland', 'iceland', 'ireland', 'austria', 'switzerland', 'greece', 'russia', 'ukraine',
  'czechia', 'hungary', 'romania', 'bulgaria', 'serbia', 'croatia', 'estonia', 'latvia', 'lithuania', 'usa',
  'canada', 'mexico', 'brazil', 'argentina', 'colombia', 'chile', 'peru', 'venezuela', 'cuba', 'pakistan', 'india',
  'bangladesh', 'china', 'south_korea', 'indonesia', 'vietnam', 'thailand', 'philippines', 'turkey', 'uae',
  'israel', 'egypt', 'morocco', 'algeria', 'nigeria', 'kenya', 'ethiopia', 'australia', 'new_zealand',
] as const;
export type CountryId = (typeof COUNTRY_IDS)[number];

export const COUNTRY_NAMES: Record<CountryId, string> = {
  netherlands: 'Netherlands',
  belgium: 'Belgium',
  germany: 'Germany',
  denmark: 'Denmark',
  norway: 'Norway',
  japan: 'Japan',
  france: 'France',
  spain: 'Spain',
  italy: 'Italy',
  uk: 'United Kingdom',
  portugal: 'Portugal',
  poland: 'Poland',
  sweden: 'Sweden',
  finland: 'Finland',
  iceland: 'Iceland',
  ireland: 'Ireland',
  austria: 'Austria',
  switzerland: 'Switzerland',
  greece: 'Greece',
  russia: 'Russia',
  ukraine: 'Ukraine',
  czechia: 'Czechia',
  hungary: 'Hungary',
  romania: 'Romania',
  bulgaria: 'Bulgaria',
  serbia: 'Serbia',
  croatia: 'Croatia',
  estonia: 'Estonia',
  latvia: 'Latvia',
  lithuania: 'Lithuania',
  usa: 'USA',
  canada: 'Canada',
  mexico: 'Mexico',
  brazil: 'Brazil',
  argentina: 'Argentina',
  colombia: 'Colombia',
  chile: 'Chile',
  peru: 'Peru',
  venezuela: 'Venezuela',
  cuba: 'Cuba',
  pakistan: 'Pakistan',
  india: 'India',
  bangladesh: 'Bangladesh',
  china: 'China',
  south_korea: 'South Korea',
  indonesia: 'Indonesia',
  vietnam: 'Vietnam',
  thailand: 'Thailand',
  philippines: 'Philippines',
  turkey: 'Turkey',
  uae: 'UAE',
  israel: 'Israel',
  egypt: 'Egypt',
  morocco: 'Morocco',
  algeria: 'Algeria',
  nigeria: 'Nigeria',
  kenya: 'Kenya',
  ethiopia: 'Ethiopia',
  australia: 'Australia',
  new_zealand: 'New Zealand',
};

export const EXPRESSIONS = ['neutral', 'happy', 'surprised', 'angry', 'sad', 'determined'] as const;
export type ExpressionId = (typeof EXPRESSIONS)[number];

export const SCENE_TYPES = ['title-card', 'map-intro', 'map-focus', 'dialogue', 'roast-battle'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

/** Props a line can put on its speaker (src/character/props.tsx). Crowns and trophies stay to the end of the scene. */
export const PROPS = ['crown', 'trophy', 'sweat', 'anger', 'fire', 'tears', 'ice', 'sparkles'] as const;
export type PropId = (typeof PROPS)[number];

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
  castMax: 8,
  scenesMax: 12,
  linesPerSceneMax: 8,
  dialogueCast: [1, 3] as const,
  mapFocusCountries: [2, 4] as const,
  speed: [0.8, 1.25] as const,
};
