/**
 * Scene templates: turn one simple SceneSpec (from the form) into a full SceneConfig with camera moves, positions,
 * entries and expressions, laid out for the frame size (16:9 or 9:16). Dialogue timing is NOT decided here: the
 * template only says the earliest frame the first line may start ("at"); applyVoiceTiming() then places every line
 * at its measured length and lengthens the scene when needed.
 */
import type { BackgroundConfig, BackgroundElement, CharacterDefinition, CharacterInScene, NumberKey, SceneConfig } from '../engine/types';
import type { DialogueLine } from '../engine/voice-types';
import type { SceneSpec } from '../engine/spec';
import { COUNTRY_GEO } from '../engine/countries';

export interface TemplateContext {
  width: number;
  height: number;
  fps: number;
  characters: Record<string, CharacterDefinition>;
}

export interface BuiltScene {
  scene: SceneConfig;
  lines: DialogueLine[];
}

const k = (frame: number, value: number, ease?: NumberKey['ease']): NumberKey => (ease ? { frame, value, ease } : { frame, value });
const unit = (ctx: TemplateContext) => Math.min(ctx.width, ctx.height) / 1080;

function linesOf(spec: SceneSpec, firstAt: number): DialogueLine[] {
  return spec.lines.map((l, i) => ({
    id: l.id,
    scene: spec.id,
    speaker: l.speaker,
    text: l.text,
    ...(i === 0 ? { at: firstAt } : {}),
    ...(l.expression ? { expression: l.expression } : {}),
    ...(l.prop ? { prop: l.prop } : {}),
    ...(l.move ? { move: l.move } : {}),
  }));
}

function sky(ctx: TemplateContext, groundRatio: number): Extract<BackgroundConfig, { type: 'landscape' }> {
  return {
    type: 'landscape',
    skyTop: '#6fbef5',
    skyBottom: '#d6f0ff',
    ground: '#7cc35a',
    groundDark: '#4b8a37',
    groundY: Math.round(ctx.height * groundRatio),
  };
}

function scenery(ctx: TemplateContext, duration: number, seed: number): BackgroundElement[] {
  const u = unit(ctx);
  const drift = 120 * u;
  return [
    { type: 'sun', x: Math.round(ctx.width * 0.16), y: Math.round(ctx.height * 0.16), r: Math.round(70 * u) },
    { type: 'cloud', x: [k(0, ctx.width * 0.3 + seed * 40), k(duration, ctx.width * 0.3 + seed * 40 + drift, 'linear')], y: Math.round(ctx.height * 0.19), scale: u },
    { type: 'cloud', x: [k(0, ctx.width * 0.72 - seed * 30), k(duration, ctx.width * 0.72 - seed * 30 - drift, 'linear')], y: Math.round(ctx.height * 0.12), scale: 0.75 * u },
  ];
}

// ------------------------------------------------------------------ title card

function titleCard(spec: Extract<SceneSpec, { template: 'title-card' }>, ctx: TemplateContext): BuiltScene {
  const duration = 120;
  return {
    scene: {
      id: spec.id,
      title: spec.title,
      durationInFrames: duration,
      background: sky(ctx, 0.86),
      elements: [
        ...scenery(ctx, duration, 1),
        { type: 'title', text: spec.title, subtitle: spec.subtitle, from: 0, to: 100000, y: Math.round(ctx.height * 0.36) },
      ],
      characters: [],
      captions: [],
    },
    lines: linesOf(spec, 30),
  };
}

// ------------------------------------------------------------------ map: zoom from Europe/world onto one country

function mapIntro(spec: Extract<SceneSpec, { template: 'map-intro' }>, ctx: TemplateContext): BuiltScene {
  const g = COUNTRY_GEO[spec.country];
  const def = ctx.characters[spec.country];
  const u = unit(ctx);
  const duration = 320;
  const startLon = g.lon > 60 ? g.lon - 10 : 10;
  const startLat = g.lat > 60 ? 50 : 35;
  const ch: CharacterInScene = {
    ref: spec.country,
    position: { space: 'geo', lon: [k(0, g.lon)], lat: [k(0, g.lat)] },
    radius: Math.round(100 * u),
    enter: { type: 'drop', frame: 168, duration: 26 },
    expressions: [{ frame: 0, value: 'happy' }],
    lookX: [k(0, -0.5), k(200, -0.5), k(225, 0)],
    showName: true,
    blinkSeed: `${spec.id}-${spec.country}`,
  };
  return {
    scene: {
      id: spec.id,
      title: spec.title ?? def.name,
      durationInFrames: duration,
      background: {
        type: 'worldMap',
        camera: {
          lon: [k(0, startLon), k(40, startLon), k(175, g.lon, 'inOutCubic'), k(duration, g.lon + 0.15, 'inOutSine')],
          lat: [k(0, startLat), k(40, startLat), k(175, g.lat, 'inOutCubic'), k(duration, g.lat + 0.08, 'inOutSine')],
          scale: [k(0, 300), k(40, 320), k(175, g.scale, 'inOutCubic'), k(duration, g.scale * 1.12, 'inOutSine')],
        },
        highlights: [{ countryId: g.iso, color: def.accent, from: 140, fadeIn: 30, pulse: true }],
      },
      elements: spec.title
        ? [{ type: 'title', text: spec.title, subtitle: spec.subtitle, from: 8, to: 135, y: Math.round(ctx.height * 0.083) }]
        : [],
      characters: [ch],
      captions: [],
    },
    lines: linesOf(spec, 150),
  };
}

// ------------------------------------------------------------------ map: several neighbouring countries

// Mercator in "unit scale" (multiply by the d3 scale for pixels), matching d3.geoMercator.
const mx = (lon: number) => (lon * Math.PI) / 180;
const my = (lat: number) => -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const unLat = (y: number) => ((2 * Math.atan(Math.exp(-y)) - Math.PI / 2) * 180) / Math.PI;

/**
 * Camera and ball positions for several countries: the camera fits all markers with a margin, and markers closer
 * than two radii are pushed apart (in screen space) so no ball hides another. Deterministic.
 */
export function layoutMapMarkers(points: { lon: number; lat: number }[], width: number, height: number, radius: number) {
  const xs = points.map((p) => mx(p.lon));
  const ys = points.map((p) => my(p.lat));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const spanX = Math.max(...xs) - Math.min(...xs) || 1e-3;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1e-3;
  const scale = Math.max(800, Math.min(9000, Math.min((width * 0.5) / spanX, (height * 0.42) / spanY)));
  // screen offsets from centre, in px
  const pos = points.map((_, i) => ({ x: (xs[i] - cx) * scale, y: (ys[i] - cy) * scale }));
  const minDist = radius * 2.4;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        const ux = d > 1e-6 ? dx / d : 1;
        const uy = d > 1e-6 ? dy / d : 0;
        const push = (minDist - d) / 2 + 0.5;
        pos[i].x -= ux * push;
        pos[i].y -= uy * push;
        pos[j].x += ux * push;
        pos[j].y += uy * push;
        moved = true;
      }
    if (!moved) break;
  }
  const lon = (cx * 180) / Math.PI;
  const lat = unLat(cy);
  return {
    camera: { lon, lat, scale },
    markers: pos.map((p) => ({ lon: ((cx + p.x / scale) * 180) / Math.PI, lat: unLat(cy + p.y / scale) })),
  };
}

const MAP_PALETTE = ['#58d68d', '#c39bd3', '#f1948a', '#f39c34', '#f7dc6f', '#76d7c4']; // no blues: they read as sea
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Character accents as map fills, replacing any colour too close to one already used with a distinct one. */
export function distinctFills(accents: string[]): string[] {
  const used: number[][] = [];
  return accents.map((a) => {
    const near = (c: number[]) => used.some((u) => Math.hypot(u[0] - c[0], u[1] - c[1], u[2] - c[2]) < 60);
    let pick = /^#[0-9a-f]{6}$/i.test(a) ? a : MAP_PALETTE[0];
    const [r, g, b] = rgb(pick);
    const seaLike = b > r + 40 && b >= g; // blue fills read as water on the map
    if (seaLike || near(rgb(pick))) pick = MAP_PALETTE.find((p) => !near(rgb(p))) ?? pick;
    used.push(rgb(pick));
    return pick;
  });
}

function mapFocus(spec: Extract<SceneSpec, { template: 'map-focus' }>, ctx: TemplateContext): BuiltScene {
  const u = unit(ctx);
  const duration = 240;
  const radius = Math.round(78 * u);
  const { camera, markers } = layoutMapMarkers(spec.countries.map((id) => COUNTRY_GEO[id]), ctx.width, ctx.height, radius);
  return {
    scene: {
      id: spec.id,
      title: spec.countries.map((id) => ctx.characters[id].name).join(', '),
      durationInFrames: duration,
      background: {
        type: 'worldMap',
        camera: { lon: [k(0, camera.lon)], lat: [k(0, camera.lat)], scale: [k(0, camera.scale * 0.92), k(duration, camera.scale, 'inOutSine')] },
        highlights: (() => {
          const fills = distinctFills(spec.countries.map((id) => ctx.characters[id].accent));
          return spec.countries.map((id, i) => ({ countryId: COUNTRY_GEO[id].iso, color: fills[i], from: 10 + i * 8, fadeIn: 20 }));
        })(),
      },
      elements: [],
      characters: spec.countries.map((id, i) => ({
        ref: id,
        position: { space: 'geo', lon: [k(0, markers[i].lon)], lat: [k(0, markers[i].lat)] },
        radius,
        enter: { type: 'pop', frame: 15 + i * 10, duration: 16 },
        expressions: [{ frame: 0, value: 'happy' }],
        showName: true,
        blinkSeed: `${spec.id}-${id}`,
      })),
      captions: [],
    },
    lines: linesOf(spec, 30),
  };
}

// ------------------------------------------------------------------ dialogue on a landscape stage

function dialogue(spec: Extract<SceneSpec, { template: 'dialogue' }>, ctx: TemplateContext): BuiltScene {
  const u = unit(ctx);
  const duration = 180;
  const bg = sky(ctx, ctx.height > ctx.width ? 0.68 : 0.74);
  const n = spec.cast.length;
  const vertical = ctx.height > ctx.width;
  const elements: BackgroundElement[] = scenery(ctx, duration, n);
  if (spec.setting === 'countryside' || spec.setting === undefined)
    elements.push({ type: 'windmill', x: Math.round(ctx.width * (vertical ? 0.12 : 0.11)), groundY: bg.groundY, scale: u * (vertical ? 0.8 : 1), rpm: 9 });
  if (spec.setting === 'coast')
    elements.push({ type: 'sea', edgeX: [k(0, ctx.width * 0.84)], level: [k(0, bg.groundY - 90 * u)], floorY: ctx.height + 200, color: '#2f6fae' });
  const usable = spec.setting === 'coast' ? ctx.width * 0.8 : ctx.width;
  const characters: CharacterInScene[] = spec.cast.map((id, i) => {
    const x = Math.round((usable * (i + 1)) / (n + 1) + (spec.setting === 'coast' ? 0 : 0));
    const facing: 1 | -1 = n === 1 ? 1 : x < ctx.width / 2 ? 1 : -1;
    const enter = n === 1 ? 'pop' : i === 0 ? 'slide-left' : i === n - 1 ? 'slide-right' : 'pop';
    return {
      ref: id,
      position: { space: 'stage', x: [k(0, x)], y: [k(0, bg.groundY)] },
      radius: Math.round((n === 3 && vertical ? 92 : 110) * u),
      facing,
      enter: { type: enter, frame: 4 + i * 8, duration: enter === 'pop' ? 14 : 24 },
      expressions: [{ frame: 0, value: 'happy' }],
      lookX: [k(0, facing * 0.5)],
      showName: true,
      blinkSeed: `${spec.id}-${id}`,
    };
  });
  return {
    scene: { id: spec.id, title: spec.cast.map((id) => ctx.characters[id].name).join(' & '), durationInFrames: duration, background: bg, elements, characters, captions: [] },
    lines: linesOf(spec, 26),
  };
}

// ------------------------------------------------------------------ roast battle: two countries face off on a close-up map

/**
 * Camera and rest positions for two countries: both countries' centres fit with a margin, never zoomed in further
 * than the closer country's own framing, and the two balls are kept at least ~2.6 radii apart on screen.
 */
export function layoutRoast(a: { lon: number; lat: number; scale: number }, b: { lon: number; lat: number; scale: number }, width: number, height: number, radius: number) {
  const vertical = height > width;
  const xs = [mx(a.lon), mx(b.lon)];
  const ys = [my(a.lat), my(b.lat)];
  const spanX = Math.abs(xs[1] - xs[0]) || 1e-3;
  const spanY = Math.abs(ys[1] - ys[0]) || 1e-3;
  // Leave room at the sides for the balls themselves (and their lunges and knock-backs), not just their centres.
  const fit = Math.min(Math.max(width * 0.3, width - radius * (vertical ? 4.4 : 5)) / spanX, (height * (vertical ? 0.3 : 0.42)) / spanY);
  const scale = Math.max(250, Math.min(fit, Math.min(a.scale, b.scale) * (vertical ? 1.35 : 1.1), 9000));
  const cx = (xs[0] + xs[1]) / 2;
  // In 9:16 sit the pair slightly below centre: the speech bubbles go in the space above them.
  const cy = (ys[0] + ys[1]) / 2 - (vertical ? (height * 0.06) / scale : 0);
  const pos = [0, 1].map((i) => ({ x: (xs[i] - cx) * scale, y: (ys[i] - cy) * scale }));
  // 16:9: neighbours stacked north-south would overlap (and lean into each other), so spread them side by side.
  if (!vertical) {
    const dx = pos[1].x - pos[0].x;
    const need = radius * 2.9;
    if (Math.abs(dx) < need) {
      const sign = dx >= 0 ? 1 : -1;
      const push = (need - Math.abs(dx)) / 2;
      pos[0].x -= sign * push;
      pos[1].x += sign * push;
    }
  }
  const d = Math.hypot(pos[1].x - pos[0].x, pos[1].y - pos[0].y);
  const minDist = radius * 3;
  if (d < minDist) {
    const ux = d > 1e-6 ? (pos[1].x - pos[0].x) / d : 1;
    const uy = d > 1e-6 ? (pos[1].y - pos[0].y) / d : 0;
    const push = (minDist - d) / 2;
    pos[0].x -= ux * push;
    pos[0].y -= uy * push;
    pos[1].x += ux * push;
    pos[1].y += uy * push;
  }
  return {
    camera: { lon: (cx * 180) / Math.PI, lat: unLat(cy), scale },
    homes: pos.map((p) => ({ lon: ((cx + p.x / scale) * 180) / Math.PI, lat: unLat(cy + p.y / scale) })),
    /** Screen x of each ball relative to the frame centre (decides who faces which way). */
    screenX: pos.map((p) => p.x),
  };
}

function roastBattle(spec: Extract<SceneSpec, { template: 'roast-battle' }>, ctx: TemplateContext): BuiltScene {
  const u = unit(ctx);
  const duration = 150;
  const radius = Math.round((ctx.height > ctx.width ? 150 : 125) * u);
  const [a, b] = spec.countries;
  const { camera, homes, screenX } = layoutRoast(COUNTRY_GEO[a], COUNTRY_GEO[b], ctx.width, ctx.height, radius);
  const fills = distinctFills([ctx.characters[a].accent, ctx.characters[b].accent]);
  const facing = (i: number): 1 | -1 => (screenX[i] <= screenX[1 - i] ? 1 : -1);
  const title = spec.title ?? `${ctx.characters[a].name} vs ${ctx.characters[b].name}`;
  return {
    scene: {
      id: spec.id,
      title,
      durationInFrames: duration,
      background: {
        type: 'worldMap',
        camera: {
          lon: [k(0, camera.lon)],
          lat: [k(0, camera.lat)],
          scale: [k(0, camera.scale * 0.93), k(40, camera.scale, 'outCubic'), k(100000, camera.scale * 1.08, 'linear')],
        },
        highlights: [
          { countryId: COUNTRY_GEO[a].iso, color: fills[0], from: 0, fadeIn: 14 },
          { countryId: COUNTRY_GEO[b].iso, color: fills[1], from: 6, fadeIn: 14 },
        ],
        fillAll: true,
      },
      elements: spec.title ? [{ type: 'title', text: spec.title, from: 4, to: 70, y: Math.round(ctx.height * (ctx.height > ctx.width ? 0.1 : 0.06)) }] : [],
      characters: [a, b].map((id, i) => ({
        ref: id,
        position: { space: 'geo' as const, lon: [k(0, homes[i].lon)], lat: [k(0, homes[i].lat)] },
        radius,
        facing: facing(i),
        enter: { type: 'pop' as const, frame: 6 + i * 8, duration: 14 },
        expressions: [{ frame: 0, value: 'determined' as const }],
        lookX: [k(0, 0.6)],
        showName: false,
        blinkSeed: `${spec.id}-${id}`,
      })),
      captions: [],
      captionStyle: 'speech',
      choreography: { kind: 'roast', home: { [a]: homes[0], [b]: homes[1] } },
      // a whoosh as the round opens (the first line follows quickly, so round breaks stay short)
      sfxCues: [{ frame: 1, kind: 'whoosh', volume: 0.45 }],
    },
    lines: linesOf(spec, 10),
  };
}

export function buildScene(spec: SceneSpec, ctx: TemplateContext): BuiltScene {
  switch (spec.template) {
    case 'title-card':
      return titleCard(spec, ctx);
    case 'map-intro':
      return mapIntro(spec, ctx);
    case 'map-focus':
      return mapFocus(spec, ctx);
    case 'dialogue':
      return dialogue(spec, ctx);
    case 'roast-battle':
      return roastBattle(spec, ctx);
  }
}
