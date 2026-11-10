/**
 * Scene configuration model.
 *
 * Plain, serialisable data only: no React, no Remotion imports. A video is a list of scenes; each scene
 * describes its background, background elements, characters (with keyframed tracks), captions, camera and
 * outgoing transition. Frames are always LOCAL to the scene (0 = first frame of that scene).
 *
 * The same structure is what the backend will later store and validate; the renderer in src/render/ reads it.
 */
import type { EaseName } from '../lib/anim';
import type { Expression } from '../character/expressions';

export type { EaseName, Expression };

/** A keyframe on a numeric track. `ease` applies to the segment that ends at this key. */
export interface NumberKey {
  frame: number;
  value: number;
  ease?: EaseName;
}

export interface ExpressionKey {
  frame: number;
  value: Expression;
}

// ---------------------------------------------------------------- characters

/** A simple symbol drawn on top of a flag. x/y/size are relative to the ball radius (0 = centre). */
export interface Emblem {
  kind:
    | 'disc'
    | 'ring'
    | 'star'
    | 'crescent-star'
    | 'maple'
    | 'wheel'
    | 'sun'
    | 'star-grid'
    | 'star-cluster'
    | 'hexagram'
    | 'pentagram-outline'
    | 'taeguk'
    | 'checker'
    | 'cross';
  color: string;
  color2?: string;
  x?: number;
  y?: number;
  size?: number;
  rows?: number;
  cols?: number;
}

/**
 * Flag designs: original, simplified geometric drawings. Coats of arms and any text are left out on purpose.
 * `weights` give relative band sizes (default equal).
 */
export type FlagSpec =
  | { layout: 'h-stripes'; colors: string[]; weights?: number[]; emblem?: Emblem }
  | { layout: 'v-stripes'; colors: string[]; weights?: number[]; emblem?: Emblem }
  | { layout: 'nordic-cross'; field: string; cross: string; border?: string }
  | { layout: 'disc'; field: string; disc: string }
  | { layout: 'cross'; field: string; cross: string; arm?: number; emblem?: Emblem }
  | { layout: 'union' }
  | { layout: 'union-canton'; field: string; emblem?: Emblem }
  | { layout: 'canton-stripes'; stripes: string[]; count: number; canton: string; cantonW: number; cantonH: number; emblem?: Emblem }
  | { layout: 'hoist-triangle'; colors: string[]; weights?: number[]; triangle: string; depth: number; emblem?: Emblem }
  | { layout: 'hoist-band'; band: string; bandWidth: number; colors: string[]; weights?: number[] }
  | { layout: 'diamond'; field: string; diamond: string; disc: string };

/** A reusable character: identity and look. Lives in the character library, not in scenes. */
export interface CharacterDefinition {
  id: string;
  name: string;
  flag: FlagSpec;
  /** Accent colour for captions and name labels. */
  accent: string;
}

export type EntryType = 'pop' | 'slide-left' | 'slide-right' | 'drop' | 'fade';
export type ExitType = 'pop' | 'slide-left' | 'slide-right' | 'fade';

export interface HopSpec {
  from: number;
  to: number;
  /** Peak height in px. */
  height: number;
  /** Frames per hop. */
  period: number;
}

/** A stretch of speech: the character bounces and squashes with the loudness of its own voice. */
export interface TalkSegment {
  from: number;
  to: number;
  /** 0..1 loudness values, `rate` per second, starting at `from`. */
  envelope: number[];
  rate: number;
}

/** Props drawn on a character (original drawings in src/character/props.tsx). */
export type PropKind = 'crown' | 'trophy' | 'sweat' | 'anger' | 'fire' | 'tears' | 'ice' | 'sparkles';
export const PROP_KINDS: readonly PropKind[] = ['crown', 'trophy', 'sweat', 'anger', 'fire', 'tears', 'ice', 'sparkles'];

/**
 * How a speaker moves on its line in a roast battle. 'auto' picks from the expression and prop:
 * crown/trophy -> hop, sad/tears -> deflate, angry/determined/fire -> charge, otherwise lean.
 */
export type MoveKind = 'auto' | 'lean' | 'charge' | 'hop' | 'deflate' | 'none';
export const MOVE_KINDS: readonly MoveKind[] = ['auto', 'lean', 'charge', 'hop', 'deflate', 'none'];

/** Sound effects synthesised by voice/sfx.mjs (original sounds). */
export type SfxKind = 'whoosh' | 'pop' | 'boing' | 'punch' | 'ding' | 'sad' | 'sparkle' | 'flame';

export interface CharacterInScene {
  /** Id of a CharacterDefinition. */
  ref: string;
  /**
   * Position. Either stage pixels (x/y, 1920x1080 stage, y = where the ball touches the ground)
   * or geographic (lon/lat), which pins the character to a world-map background while the map camera moves.
   */
  position:
    | { space: 'stage'; x: NumberKey[]; y: NumberKey[] }
    | { space: 'geo'; lon: NumberKey[]; lat: NumberKey[] };
  radius?: number;
  rotation?: NumberKey[];
  /** Extra scale on top of entry/exit animation. */
  scale?: NumberKey[];
  facing?: 1 | -1;
  expressions: ExpressionKey[];
  lookX?: NumberKey[];
  lookY?: NumberKey[];
  hops?: HopSpec[];
  /** Short trembles: rotation jitter in degrees. */
  shakes?: { from: number; to: number; degrees: number }[];
  enter?: { type: EntryType; frame: number; duration: number };
  exit?: { type: ExitType; frame: number; duration: number };
  showName?: boolean;
  /** Seed for blinking so characters never blink in sync. */
  blinkSeed?: string;
  /** Speech segments (normally generated from the voice manifest by applyVoiceTiming). */
  talk?: TalkSegment[];
  /** Props shown on the character between two frames (placed at measured line times by applyVoiceTiming). */
  props?: { kind: PropKind; from: number; to: number }[];
  /** Frames where the character is hit: a squash and a tilt that settle over ~14 frames. */
  impacts?: number[];
}

// ---------------------------------------------------------------- backgrounds

export interface MapHighlight {
  /** ISO 3166-1 numeric id as used by Natural Earth / world-atlas, e.g. "528" = Netherlands. */
  countryId: string;
  color: string;
  from: number;
  /** Frames to fade in. */
  fadeIn: number;
  pulse?: boolean;
}

export type BackgroundConfig =
  | {
      type: 'worldMap';
      camera: { lon: NumberKey[]; lat: NumberKey[]; scale: NumberKey[] };
      highlights?: MapHighlight[];
      /** Give every country its own soft colour (political-map look); highlights still draw on top. */
      fillAll?: boolean;
    }
  | {
      type: 'landscape';
      skyTop: string;
      skyBottom: string;
      ground: string;
      groundDark: string;
      /** Stage y of the ground line. */
      groundY: number;
    };

export type BackgroundElement =
  | { type: 'sun'; x: number; y: number; r: number }
  | { type: 'cloud'; x: NumberKey[]; y: number; scale: number }
  | { type: 'windmill'; x: number; groundY: number; scale: number; rpm: number }
  | {
      type: 'sea';
      /** Stage x of the water's leading (left) edge. */
      edgeX: NumberKey[];
      /** Stage y of the water surface. */
      level: NumberKey[];
      /** Stage y of the sea floor under the water. */
      floorY: number;
      color: string;
    }
  | {
      type: 'dike';
      /** Stage x of the land-side foot. */
      x: number;
      width: number;
      groundY: number;
      height: NumberKey[];
    }
  | { type: 'splash'; x: NumberKey[]; y: NumberKey[]; at: number[]; seed: string }
  | { type: 'title'; text: string; subtitle?: string; from: number; to: number; y: number };

// ---------------------------------------------------------------- captions, camera, transitions

export interface Caption {
  from: number;
  to: number;
  text: string;
  /** Character id; omitted for narration. */
  speaker?: string;
  /** 'speech': a bubble next to the speaking character that types out (roast battles). Default: bottom caption. */
  style?: 'speech';
}

/**
 * Line-driven motion, applied by applyVoiceTiming once real line times are known.
 * 'roast': the speaker lunges towards the other character while talking and settles back; the listener flinches.
 */
export interface Choreography {
  kind: 'roast';
  /** Rest position of each character (geo), keyed by character id. */
  home: Record<string, { lon: number; lat: number }>;
  /** 0..1 of the distance between the two characters to lunge (default 0.18). */
  lunge?: number;
}

export interface StageCamera {
  zoom: NumberKey[];
  /** Stage point that sits at the centre of the frame. */
  x: NumberKey[];
  y: NumberKey[];
}

export type TransitionType = 'crossfade' | 'wipe-left' | 'iris';

export interface SceneConfig {
  id: string;
  title: string;
  durationInFrames: number;
  background: BackgroundConfig;
  elements: BackgroundElement[];
  characters: CharacterInScene[];
  captions: Caption[];
  camera?: StageCamera;
  /** Overlaps the start of the next scene by `durationInFrames`. */
  transitionOut?: { type: TransitionType; durationInFrames: number };
  /** Character lines become speech bubbles next to the speaker instead of bottom captions. */
  captionStyle?: 'speech';
  choreography?: Choreography;
  /** Sound effects at scene-local frames (generated by the roast choreography). */
  sfxCues?: { frame: number; kind: SfxKind; volume?: number }[];
  /** Frames with a short white impact flash. */
  flashes?: number[];
  /** Screen shakes: offset amplitude in px, decaying over the range. */
  screenShakes?: { from: number; to: number; px: number }[];
  /** Comic bursts ("POW!") next to a character. */
  bursts?: { frame: number; ref: string; text: string }[];
}

export interface VideoConfig {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  characters: CharacterDefinition[];
  scenes: SceneConfig[];
}
