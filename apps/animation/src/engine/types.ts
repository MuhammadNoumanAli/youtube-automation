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

export type FlagSpec =
  | { layout: 'h-stripes'; colors: string[] }
  | { layout: 'v-stripes'; colors: string[] }
  | { layout: 'nordic-cross'; field: string; cross: string; border?: string }
  | { layout: 'disc'; field: string; disc: string };

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
