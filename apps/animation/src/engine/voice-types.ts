/**
 * Voice data model. Plain serialisable data, no React and no Remotion imports.
 *
 * A VoiceScript is what the voice step (voice/generate.mjs) reads; a VoiceManifest is what it writes. The renderer
 * reads both through applyVoiceTiming() in dialogue.ts. Neither depends on width/height, so one script and one set
 * of audio files serve both 16:9 and 9:16 versions of a video.
 */
import type { Expression } from '../character/expressions';

export type VoiceSpec =
  | { engine: 'kokoro'; voice: string; speed?: number }
  | { engine: 'piper'; model: 'en_US-libritts-high' | 'en_US-ljspeech-high'; speaker?: number; speed?: number };

export interface VoiceAssignment {
  voice: VoiceSpec;
  /** Tried in order if the primary voice fails, before the built-in Piper safety net. */
  fallback?: VoiceSpec[];
  /** Skip the built-in Piper safety net (libritts, then ljspeech). */
  noDefaultFallback?: boolean;
}

export interface DialogueLine {
  /** Unique within the script; also the cache-independent identity used for timing. */
  id: string;
  /** Id of the scene the line belongs to. */
  scene: string;
  /** 'narrator' or a character id. */
  speaker: string;
  text: string;
  /** Earliest scene-local frame the line may start at. Later if the previous line is still playing. */
  at?: number;
  /** Per-line voice override. */
  voice?: VoiceSpec;
  /** Expression the speaking character switches to when this line starts (placed at the real, measured start). */
  expression?: Expression;
}

export interface VoiceScript {
  schemaVersion: 1;
  videoId: string;
  language?: string;
  narrator: VoiceAssignment;
  characters: Record<string, VoiceAssignment>;
  lines: DialogueLine[];
  timing?: { gapFrames?: number; tailFrames?: number; leadFrames?: number };
  /** Background music from src/audio-library.json (licence-checked). Ducked under speech. */
  music?: { id: string; volume?: number; duckVolume?: number; fadeInFrames?: number; fadeOutFrames?: number };
  /** Sound effects from src/audio-library.json, placed at a scene-local frame. */
  sfx?: { id: string; scene: string; at?: number; volume?: number }[];
}

export interface AudioAsset {
  id: string;
  /** Path relative to the render's public folder. */
  file: string;
  durationMs: number | null;
  licence: string;
  source: string;
  attribution: string | null;
  attributionRequired: boolean;
}

export interface LineAudio {
  id: string;
  scene: string;
  speaker: string;
  text: string;
  hash?: string;
  /** Path relative to the render's public folder, used with staticFile(). */
  file?: string;
  engine?: string;
  model?: string;
  modelSha256?: string;
  speakerId?: number;
  speakerName?: string;
  language?: string;
  speed?: number;
  licence?: string;
  attribution?: string;
  requiresAttribution?: boolean;
  sampleRate?: number;
  samples?: number;
  /** Measured from the WAV file. */
  durationMs?: number;
  cached?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  error?: string;
  /** Loudness over time, 0..1, `envelopeRate` values per second (drives the talking animation). */
  envelope?: number[];
  envelopeRate?: number;
}

export interface VoiceManifest {
  schemaVersion: 1;
  videoId: string;
  scriptFile: string | null;
  scriptHash: string;
  createdAt: string;
  test: boolean;
  complete: boolean;
  lines: LineAudio[];
  attributions: string[];
  credits: string[];
  assets?: {
    music: (AudioAsset & { volume: number; duckVolume: number; fadeInFrames: number; fadeOutFrames: number }) | null;
    sfx: (AudioAsset & { scene: string; at: number; volume: number })[];
  };
  assetProblems?: string[];
}
