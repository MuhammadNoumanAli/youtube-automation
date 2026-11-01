import { pickCharacters } from '../engine/characters';
import type { BackgroundConfig, BackgroundElement, VideoConfig } from '../engine/types';

/**
 * "Netherlands Countryball: A Country Fighting the Sea": 30 s demonstration.
 * Pure configuration: no React here. Frames are local to each scene.
 * Scene lengths 320 + 320 + 300, minus two 20-frame transitions = 900 frames = 30.0 s at 30 fps.
 */

const GROUND_Y = 800;

const polder: Extract<BackgroundConfig, { type: 'landscape' }> = {
  type: 'landscape',
  skyTop: '#6fbef5',
  skyBottom: '#d6f0ff',
  ground: '#7cc35a',
  groundDark: '#4b8a37',
  groundY: GROUND_Y,
};

const scenery = (cloudShift: number): BackgroundElement[] => [
  { type: 'sun', x: 300, y: 170, r: 70 },
  { type: 'cloud', x: [{ frame: 0, value: 520 + cloudShift }, { frame: 320, value: 640 + cloudShift, ease: 'linear' }], y: 210, scale: 1 },
  { type: 'cloud', x: [{ frame: 0, value: 1380 - cloudShift }, { frame: 320, value: 1270 - cloudShift, ease: 'linear' }], y: 135, scale: 0.75 },
  { type: 'windmill', x: 250, groundY: GROUND_Y, scale: 1, rpm: 9 },
];

// Dike geometry (scene 3). Sea-side slope runs from the crown (x + 0.7w, top) down to (x + w, ground).
const DIKE_X = 1060;
const DIKE_W = 280;
const DIKE_H = 170;
const WATER_LEVEL = 700;
const DIKE_WATERLINE_X = DIKE_X + 0.7 * DIKE_W + ((WATER_LEVEL - (GROUND_Y - DIKE_H)) / DIKE_H) * 0.3 * DIKE_W;
const DIKE_CROWN_X = DIKE_X + 0.5 * DIKE_W;

export const netherlandsDemo: VideoConfig = {
  id: 'NetherlandsDemo',
  title: 'Netherlands Countryball: A Country Fighting the Sea',
  width: 1920,
  height: 1080,
  fps: 30,
  characters: pickCharacters('netherlands'),
  scenes: [
    // ------------------------------------------------------------------ 1. Introduction
    {
      id: 'intro',
      title: 'Introduction',
      durationInFrames: 320,
      background: {
        type: 'worldMap',
        camera: {
          lon: [{ frame: 0, value: -10 }, { frame: 40, value: -10 }, { frame: 175, value: 5.6, ease: 'inOutCubic' }, { frame: 320, value: 5.8, ease: 'inOutSine' }],
          lat: [{ frame: 0, value: 25 }, { frame: 40, value: 25 }, { frame: 175, value: 52.3, ease: 'inOutCubic' }, { frame: 320, value: 52.4, ease: 'inOutSine' }],
          scale: [{ frame: 0, value: 300 }, { frame: 40, value: 320 }, { frame: 175, value: 6000, ease: 'inOutCubic' }, { frame: 320, value: 6800, ease: 'inOutSine' }],
        },
        highlights: [{ countryId: '528', color: '#f39c34', from: 140, fadeIn: 30, pulse: true }],
      },
      elements: [
        { type: 'title', text: 'Netherlands Countryball', subtitle: 'A Country Fighting the Sea', from: 8, to: 135, y: 90 },
      ],
      characters: [
        {
          ref: 'netherlands',
          position: { space: 'geo', lon: [{ frame: 0, value: 6.3 }], lat: [{ frame: 0, value: 51.85 }] },
          radius: 100,
          enter: { type: 'drop', frame: 168, duration: 26 },
          expressions: [
            { frame: 0, value: 'happy' },
            { frame: 250, value: 'surprised' },
            { frame: 268, value: 'determined' },
          ],
          lookX: [{ frame: 0, value: -0.6 }, { frame: 215, value: -0.6 }, { frame: 240, value: 0 }, { frame: 268, value: 0.7 }],
          lookY: [{ frame: 0, value: 0.3 }, { frame: 215, value: 0.3 }, { frame: 240, value: 0 }],
          hops: [{ from: 205, to: 241, height: 28, period: 18 }],
          showName: true,
        },
      ],
      captions: [
        { from: 150, to: 205, text: 'Meet the Netherlands, by the North Sea.' },
        { from: 210, to: 312, text: 'Hallo! Much of my land lies below sea level.', speaker: 'netherlands' },
      ],
      transitionOut: { type: 'crossfade', durationInFrames: 20 },
    },

    // ------------------------------------------------------------------ 2. Conflict
    {
      id: 'conflict',
      title: 'Conflict',
      durationInFrames: 320,
      background: polder,
      elements: [
        ...scenery(0),
        {
          type: 'sea',
          edgeX: [{ frame: 0, value: 1990 }, { frame: 40, value: 1990 }, { frame: 210, value: 1230, ease: 'inOutSine' }, { frame: 320, value: 1180, ease: 'outCubic' }],
          level: [{ frame: 0, value: 745 }, { frame: 210, value: 692, ease: 'inOutSine' }, { frame: 320, value: 680 }],
          floorY: 1180,
          color: '#2f7fc1',
        },
      ],
      characters: [
        {
          ref: 'netherlands',
          position: {
            space: 'stage',
            x: [{ frame: 0, value: 760 }, { frame: 160, value: 760 }, { frame: 200, value: 590, ease: 'outCubic' }, { frame: 320, value: 610 }],
            y: [{ frame: 0, value: GROUND_Y }],
          },
          radius: 95,
          expressions: [
            { frame: 0, value: 'happy' },
            { frame: 95, value: 'surprised' },
            { frame: 160, value: 'sad' },
            { frame: 232, value: 'determined' },
            { frame: 282, value: 'angry' },
          ],
          lookX: [{ frame: 0, value: -0.3 }, { frame: 80, value: -0.3 }, { frame: 95, value: 0.9, ease: 'outCubic' }, { frame: 232, value: 0.7 }],
          hops: [{ from: 160, to: 199, height: 24, period: 13 }],
          shakes: [
            { from: 165, to: 200, degrees: 3 },
            { from: 284, to: 320, degrees: 2.5 },
          ],
        },
      ],
      camera: {
        zoom: [{ frame: 0, value: 1 }, { frame: 140, value: 1 }, { frame: 245, value: 1.15, ease: 'inOutCubic' }, { frame: 320, value: 1.15 }],
        x: [{ frame: 0, value: 960 }, { frame: 140, value: 960 }, { frame: 245, value: 900, ease: 'inOutCubic' }],
        y: [{ frame: 0, value: 540 }, { frame: 140, value: 540 }, { frame: 245, value: 600, ease: 'inOutCubic' }],
      },
      captions: [
        { from: 12, to: 100, text: 'But the North Sea never stops pushing.' },
        { from: 112, to: 200, text: 'Uh oh... the water is coming!', speaker: 'netherlands' },
        { from: 232, to: 314, text: 'Not today, sea!', speaker: 'netherlands' },
      ],
      transitionOut: { type: 'wipe-left', durationInFrames: 20 },
    },

    // ------------------------------------------------------------------ 3. Resolution
    {
      id: 'resolution',
      title: 'Resolution',
      durationInFrames: 300,
      background: polder,
      elements: [
        ...scenery(120),
        {
          type: 'dike',
          x: DIKE_X,
          width: DIKE_W,
          groundY: GROUND_Y,
          height: [{ frame: 0, value: 0 }, { frame: 18, value: 0 }, { frame: 80, value: DIKE_H, ease: 'outBack' }],
        },
        {
          type: 'sea',
          edgeX: [{ frame: 0, value: 1180 }, { frame: 18, value: 1180 }, { frame: 80, value: DIKE_WATERLINE_X, ease: 'outCubic' }],
          level: [{ frame: 0, value: 680 }, { frame: 80, value: WATER_LEVEL, ease: 'outCubic' }],
          floorY: 1180,
          color: '#2f7fc1',
        },
        {
          type: 'splash',
          x: [{ frame: 0, value: DIKE_WATERLINE_X + 6 }],
          y: [{ frame: 0, value: WATER_LEVEL - 6 }],
          at: [96, 138, 182, 226, 268],
          seed: 'dike-waves',
        },
        { type: 'title', text: 'A Country Fighting the Sea', subtitle: 'Netherlands Countryball', from: 236, to: 300, y: 110 },
      ],
      characters: [
        {
          ref: 'netherlands',
          position: {
            space: 'stage',
            x: [{ frame: 0, value: 610 }, { frame: 96, value: 610 }, { frame: 166, value: DIKE_CROWN_X, ease: 'inOutSine' }],
            y: [{ frame: 0, value: GROUND_Y }, { frame: 96, value: GROUND_Y }, { frame: 166, value: GROUND_Y - DIKE_H, ease: 'inOutSine' }],
          },
          radius: 95,
          expressions: [
            { frame: 0, value: 'angry' },
            { frame: 40, value: 'surprised' },
            { frame: 92, value: 'happy' },
            { frame: 176, value: 'determined' },
            { frame: 222, value: 'happy' },
          ],
          lookX: [{ frame: 0, value: 0.7 }, { frame: 92, value: 0.5 }, { frame: 176, value: 0.9 }, { frame: 222, value: 0, ease: 'inOutSine' }],
          lookY: [{ frame: 0, value: 0 }, { frame: 40, value: -0.4 }, { frame: 92, value: 0 }],
          hops: [{ from: 96, to: 166, height: 60, period: 14 }],
        },
      ],
      camera: {
        zoom: [{ frame: 0, value: 1.15 }, { frame: 60, value: 1, ease: 'inOutCubic' }, { frame: 300, value: 1.06, ease: 'inOutSine' }],
        x: [{ frame: 0, value: 900 }, { frame: 60, value: 960, ease: 'inOutCubic' }, { frame: 300, value: 1000, ease: 'inOutSine' }],
        y: [{ frame: 0, value: 600 }, { frame: 60, value: 540, ease: 'inOutCubic' }, { frame: 300, value: 525, ease: 'inOutSine' }],
      },
      captions: [
        { from: 12, to: 92, text: 'So the Dutch built dikes...' },
        { from: 100, to: 178, text: '...and held back the sea, one wall at a time.' },
        { from: 186, to: 232, text: 'We fight the sea. And we win!', speaker: 'netherlands' },
      ],
    },
  ],
};
