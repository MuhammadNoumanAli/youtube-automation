/**
 * Replay format written by race/simulate.mjs and read by the race renderer. Plain data only.
 * Positions are stored as half-pixel integers (x2) to keep the files small; angles in whole degrees.
 */

export type RaceElement =
  | { type: 'wall'; a: [number, number]; b: [number, number]; r: number }
  | { type: 'peg'; c: [number, number]; r: number }
  | { type: 'pad'; a: [number, number]; b: [number, number]; r: number; kick: number; cooldown: number }
  | { type: 'bumper'; c: [number, number]; r: number; kick: number; cooldown: number }
  | { type: 'spinner'; c: [number, number]; len: number; r: number; arms: number; speed: number; phase: number }
  | {
      type: 'gate';
      a: [number, number];
      b: [number, number];
      r: number;
      role?: 'hopper' | 'trapdoor';
      closed: { until: number } | { period: number; open: number; phase: number };
    };

export interface RaceTheme {
  name: string;
  bg1: string;
  bg2: string;
  wall: string;
  accent: string;
}

export type RaceEvent =
  | { frame: number; type: 'gate' }
  | { frame: number; type: 'finish'; id: string; place: number }
  | { frame: number; type: 'boost'; id: string; el: number }
  | { frame: number; type: 'eliminated'; ids: string[]; timedOut: boolean };

export interface StageData {
  version: number;
  index: number;
  template: string;
  name: string;
  theme: RaceTheme;
  fps: number;
  frames: number;
  gateFrame: number;
  decisionFrame: number;
  ballR: number;
  finishY: number;
  hopper: { x0: number; x1: number; y0: number; y1: number };
  elements: RaceElement[];
  /** Country id per ball index. */
  balls: string[];
  /** Per ball: [x2, y2, deg, x2, y2, deg, ...], one triple per frame. */
  tracks: number[][];
  /** Per kinematic element index: spinner angle in tenths of a degree, or gate 1 = closed / 0 = open, per frame. */
  kin: Record<string, number[]>;
  events: RaceEvent[];
  ranking: string[];
  qualified: string[];
  eliminated: string[];
  timedOut: boolean;
}

export type RaceSegmentInfo =
  | { kind: 'intro'; frames: number }
  | { kind: 'stage'; index: number; file: string; frames: number }
  | { kind: 'podium'; frames: number };

export interface RaceStageSummary {
  index: number;
  template: string;
  name: string;
  frames: number;
  alive: number;
  eliminate: number;
  qualified: string[];
  eliminated: string[];
  timedOut: boolean;
  nudges: number;
}

export interface RaceMeta {
  version: number;
  id: string;
  title: string;
  seed: number | string;
  fps: number;
  width: number;
  height: number;
  ballRadius: number;
  competitors: string[];
  stageCount: number;
  segments: RaceSegmentInfo[];
  totalFrames: number;
  stages: RaceStageSummary[];
  standings: { place: number; id: string; out: number | null }[];
  winner: string;
  sfx?: { dir: string; files: Record<string, string>; license: string };
}

export const COURSE = { x0: 40, x1: 1480, panelX: 1500, width: 1920, height: 1080 };
