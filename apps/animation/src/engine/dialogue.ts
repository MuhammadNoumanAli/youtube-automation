/**
 * Dialogue timing from measured audio.
 *
 * applyVoiceTiming() takes a video, its voice script and (optionally) the manifest written by the voice step, and
 * returns a NEW VideoConfig in which:
 *   - every line starts at its `at` frame, or right after the previous line of the same scene (plus a gap),
 *   - every line lasts exactly as long as its WAV file (frames = ceil(durationMs * fps / 1000)),
 *   - captions are generated from those timings,
 *   - a scene grows when its dialogue needs more time (never shrinks), keeping a tail and the outgoing
 *     transition clear of speech,
 *   - a character on screen gets a talk segment (its own loudness envelope) for each of its lines, so it bounces
 *     and squashes while it speaks.
 * The input video is not modified. Without a manifest (Studio preview), durations are estimated from word count
 * and the result is marked incomplete; the render script refuses to render an incomplete voiced video.
 *
 * Only type imports here, so this file stays pure and testable outside Remotion.
 */
import type { Caption, CharacterInScene, Choreography, ExpressionKey, MoveKind, NumberKey, PropKind, SceneConfig, SfxKind, TalkSegment, VideoConfig } from './types';
import type { LineAudio, VoiceManifest, VoiceScript } from './voice-types';

export interface PlacedLine {
  id: string;
  sceneId: string;
  speaker: string;
  text: string;
  /** Scene-local start frame. */
  startFrame: number;
  frames: number;
  /** staticFile() path, or null when no audio exists yet. */
  file: string | null;
  estimated: boolean;
}

export interface VoiceTiming {
  video: VideoConfig;
  lines: PlacedLine[];
  problems: string[];
  /** True only when every line has measured audio and nothing is wrong. */
  complete: boolean;
}

export const TIMING_DEFAULTS = { gapFrames: 6, tailFrames: 15, leadFrames: 10, wordsPerSecond: 2.6 };

export function applyVoiceTiming(base: VideoConfig, script: VoiceScript, manifest: VoiceManifest | null): VoiceTiming {
  const t = { ...TIMING_DEFAULTS, ...script.timing };
  const problems: string[] = [];
  const characterIds = new Set(base.characters.map((c) => c.id));
  const sceneIds = new Set(base.scenes.map((s) => s.id));
  const audio = new Map<string, LineAudio>();

  if (manifest) {
    if (manifest.videoId !== script.videoId) problems.push(`manifest is for "${manifest.videoId}", script is "${script.videoId}"`);
    for (const l of manifest.lines) audio.set(l.id, l);
  }
  const seen = new Set<string>();
  for (const line of script.lines) {
    if (seen.has(line.id)) problems.push(`line ${line.id}: duplicate id`);
    seen.add(line.id);
    if (!sceneIds.has(line.scene)) problems.push(`line ${line.id}: unknown scene "${line.scene}"`);
    if (line.speaker !== 'narrator' && !characterIds.has(line.speaker)) problems.push(`line ${line.id}: unknown speaker "${line.speaker}"`);
    if (!line.text.trim()) problems.push(`line ${line.id}: empty text`);
    if (line.text.length > 90) problems.push(`line ${line.id}: too long for a 2-line caption (${line.text.length} chars)`);
    if (manifest) {
      const a = audio.get(line.id);
      if (!a || a.error || !a.file || !a.durationMs) problems.push(`line ${line.id}: no audio in manifest${a?.error ? ` (${a.error})` : ''}`);
      else if (a.text !== line.text) problems.push(`line ${line.id}: text changed since its audio was generated`);
    }
  }

  const placed: PlacedLine[] = [];
  const scenes = base.scenes.map((scene) => {
    const own = script.lines.filter((l) => l.scene === scene.id);
    let cursor = -1;
    const generated: Caption[] = [];
    const talk = new Map<string, TalkSegment[]>();
    const faces = new Map<string, ExpressionKey[]>();
    const props = new Map<string, NonNullable<CharacterInScene['props']>>();
    const timed: TimedLine[] = [];
    for (const line of own) {
      const a = audio.get(line.id);
      const measured = a && !a.error && a.file && a.durationMs ? a : null;
      const frames = measured
        ? Math.max(1, Math.ceil((measured.durationMs! * base.fps) / 1000))
        : Math.max(base.fps, Math.ceil((line.text.split(/\s+/).filter(Boolean).length / t.wordsPerSecond) * base.fps));
      const earliest = line.at ?? t.leadFrames;
      const start = cursor < 0 ? earliest : Math.max(earliest, cursor + t.gapFrames);
      cursor = start + frames;
      placed.push({
        id: line.id,
        sceneId: scene.id,
        speaker: line.speaker,
        text: line.text,
        startFrame: start,
        frames,
        file: measured ? measured.file! : null,
        estimated: !measured,
      });
      const speech = scene.captionStyle === 'speech' && line.speaker !== 'narrator';
      generated.push({
        from: start,
        to: start + frames,
        text: line.text,
        speaker: line.speaker === 'narrator' ? undefined : line.speaker,
        ...(speech ? { style: 'speech' as const } : {}),
      });
      timed.push({ speaker: line.speaker, start, end: start + frames, expression: line.expression, prop: line.prop, move: line.move });
      if (line.prop && line.speaker !== 'narrator') {
        // Crowns and trophies stay to the end of the scene; reactions last a little past the line.
        const lasting = line.prop === 'crown' || line.prop === 'trophy';
        const list = props.get(line.speaker) ?? [];
        list.push({ kind: line.prop, from: start, to: lasting ? 1_000_000 : start + frames + 24 });
        props.set(line.speaker, list);
      }
      if (line.expression && line.speaker !== 'narrator') {
        faces.set(line.speaker, [...(faces.get(line.speaker) ?? []), { frame: start, value: line.expression }]);
      }
      if (measured?.envelope?.length && measured.envelopeRate && line.speaker !== 'narrator') {
        const list = talk.get(line.speaker) ?? [];
        list.push({ from: start, to: start + frames, envelope: measured.envelope, rate: measured.envelopeRate });
        talk.set(line.speaker, list);
      }
    }
    const needed = cursor < 0 ? 0 : cursor + t.tailFrames + (scene.transitionOut?.durationInFrames ?? 0);
    const withLines = scene.characters.map((c) => {
      let out = c;
      if (talk.has(c.ref)) out = { ...out, talk: [...(c.talk ?? []), ...talk.get(c.ref)!] };
      if (faces.has(c.ref)) out = { ...out, expressions: [...c.expressions, ...faces.get(c.ref)!].sort((x, y) => x.frame - y.frame) };
      if (props.has(c.ref)) out = { ...out, props: [...(c.props ?? []), ...props.get(c.ref)!] };
      return out;
    });
    const timedScene: SceneConfig = {
      ...scene,
      durationInFrames: Math.max(scene.durationInFrames, needed),
      captions: [...scene.captions, ...generated].sort((x, y) => x.from - y.from),
      characters: withLines,
    };
    return scene.choreography?.kind === 'roast' ? applyRoast(timedScene, scene.choreography, timed) : timedScene;
  });

  const complete = Boolean(manifest) && problems.length === 0 && placed.every((p) => !p.estimated);
  return { video: { ...base, scenes }, lines: placed, problems, complete };
}

// ------------------------------------------------------------------ music and sound effects

export interface AudioPlan {
  music: {
    file: string;
    volume: number;
    duckVolume: number;
    fadeInFrames: number;
    fadeOutFrames: number;
    totalFrames: number;
    /** Global [from, to) frames where someone is speaking. */
    speech: [number, number][];
  } | null;
  sfx: { id: string; file: string; from: number; volume: number }[];
}

/** Music and SFX placement on the global timeline. `sceneStart` maps scene id to its global start frame. */
export function buildAudioPlan(
  lines: PlacedLine[],
  sceneStart: Record<string, number>,
  totalFrames: number,
  manifest: VoiceManifest | null,
): AudioPlan {
  const a = manifest?.assets;
  const speech = lines
    .filter((l) => l.file)
    .map((l) => [sceneStart[l.sceneId] + l.startFrame, sceneStart[l.sceneId] + l.startFrame + l.frames] as [number, number]);
  return {
    music: a?.music
      ? { file: a.music.file, volume: a.music.volume, duckVolume: a.music.duckVolume, fadeInFrames: a.music.fadeInFrames, fadeOutFrames: a.music.fadeOutFrames, totalFrames, speech }
      : null,
    sfx: (a?.sfx ?? [])
      .filter((s) => s.scene in sceneStart)
      .map((s) => ({ id: s.id, file: s.file, from: sceneStart[s.scene] + s.at, volume: s.volume })),
  };
}

const DUCK_RAMP = 8; // frames to dip under speech and to come back up

/** Music volume at a global frame: fade in/out at the ends, ducked (with short ramps) while anyone speaks. */
export function musicVolumeAt(frame: number, music: NonNullable<AudioPlan['music']>): number {
  let duck = 0;
  for (const [from, to] of music.speech) {
    if (frame >= from - DUCK_RAMP && frame <= to + DUCK_RAMP) {
      const d = frame < from ? (frame - (from - DUCK_RAMP)) / DUCK_RAMP : frame > to ? 1 - (frame - to) / DUCK_RAMP : 1;
      duck = Math.max(duck, Math.max(0, Math.min(1, d)));
    }
  }
  const level = music.volume + (music.duckVolume - music.volume) * duck;
  const fadeIn = music.fadeInFrames > 0 ? Math.min(1, frame / music.fadeInFrames) : 1;
  const fadeOut = music.fadeOutFrames > 0 ? Math.min(1, (music.totalFrames - frame) / music.fadeOutFrames) : 1;
  return Math.max(0, level * Math.max(0, Math.min(fadeIn, fadeOut)));
}

// ------------------------------------------------------------------ line-driven motion (roast battles)

export interface TimedLine {
  speaker: string;
  start: number;
  end: number;
  expression?: string;
  prop?: PropKind;
  move?: MoveKind;
}

/** 'auto' resolved from the line's prop and expression. */
export function resolveMove(l: TimedLine): Exclude<MoveKind, 'auto'> {
  if (l.move && l.move !== 'auto') return l.move;
  if (l.prop === 'crown' || l.prop === 'trophy') return 'hop';
  if (l.expression === 'sad' || l.prop === 'tears') return 'deflate';
  if (l.expression === 'angry' || l.expression === 'determined' || l.prop === 'fire' || l.prop === 'anger') return 'charge';
  return 'lean';
}

const PROP_SFX: Partial<Record<PropKind, SfxKind>> = { crown: 'ding', trophy: 'ding', sweat: 'pop', sparkles: 'sparkle', fire: 'flame', anger: 'pop', ice: 'pop' };
const BURSTS = ['POW!', 'BAM!', 'OOF!', 'WHAM!', 'BONK!'];

/** Position track builder: segments [frame, fraction towards target, ease]; merges into monotonic keys. */
function towards(home: { lon: number; lat: number }, target: { lon: number; lat: number }) {
  const lon: NumberKey[] = [{ frame: 0, value: home.lon }];
  const lat: NumberKey[] = [{ frame: 0, value: home.lat }];
  const at = (frame: number, f: number, ease: NumberKey['ease'] = 'inOutCubic') => {
    const last = lon[lon.length - 1].frame;
    const fr = Math.max(last + 1, Math.round(frame));
    lon.push({ frame: fr, value: home.lon + (target.lon - home.lon) * f, ease });
    lat.push({ frame: fr, value: home.lat + (target.lat - home.lat) * f, ease });
  };
  return { lon, lat, at };
}

/**
 * Roast-battle choreography at the real line times:
 *  - lean: the speaker leans towards the other while talking;
 *  - charge: the speaker dashes in and bumps the other, who is knocked back (squash, flash, "POW!", punch sound);
 *  - hop: the speaker hops while talking (winner);
 *  - deflate: the speaker shrinks and droops (loser);
 *  - the camera punches in towards whoever speaks and eases back at the end;
 *  - sound effects for moves and props.
 */
export function applyRoast(scene: SceneConfig, choreo: Choreography, lines: TimedLine[]): SceneConfig {
  const ids = Object.keys(choreo.home);
  if (ids.length !== 2) return scene;
  const lean = Math.max(0, Math.min(0.45, choreo.lunge ?? 0.18));
  const spoken = lines.filter((l) => ids.includes(l.speaker)).sort((x, y) => x.start - y.start);
  const sfx: NonNullable<SceneConfig['sfxCues']> = [];
  const flashes: number[] = [];
  const screenShakes: NonNullable<SceneConfig['screenShakes']> = [];
  const bursts: NonNullable<SceneConfig['bursts']> = [];
  const tracks = Object.fromEntries(
    ids.map((id) => {
      const other = choreo.home[ids.find((x) => x !== id)!];
      const home = choreo.home[id];
      // knock-backs use negative fractions on this track, i.e. away from the other character
      return [id, { fwd: towards(home, other), home, hops: [] as NonNullable<CharacterInScene['hops']>, scale: [{ frame: 0, value: 1 }] as NumberKey[], impacts: [] as number[], shakes: [] as NonNullable<CharacterInScene['shakes']> }];
    }),
  );
  // knock-backs are applied on the forward track as negative fractions
  spoken.forEach((l, i) => {
    const me = tracks[l.speaker];
    const otherId = ids.find((x) => x !== l.speaker)!;
    const them = tracks[otherId];
    const s = l.start;
    const e = l.end;
    const nextSame = spoken[i + 1]?.speaker === l.speaker && spoken[i + 1].start - e <= 14;
    const move = resolveMove(l);
    if (move === 'charge') {
      const hit = s + 8;
      me.fwd.at(s - 1, 0);
      me.fwd.at(hit, 0.62, 'inOutCubic');
      me.fwd.at(hit + 4, 0.6, 'linear');
      me.fwd.at(hit + 14, lean, 'outCubic');
      me.fwd.at(e, lean, 'linear');
      if (!nextSame) me.fwd.at(e + 12, 0);
      them.fwd.at(hit, 0, 'linear');
      them.fwd.at(hit + 6, -0.14, 'outCubic');
      them.fwd.at(hit + 26, 0, 'inOutCubic');
      them.impacts.push(hit);
      them.shakes.push({ from: hit, to: hit + 14, degrees: 7 });
      flashes.push(hit);
      screenShakes.push({ from: hit, to: hit + 10, px: 18 });
      bursts.push({ frame: hit, ref: otherId, text: BURSTS[(s * 7 + i) % BURSTS.length] });
      sfx.push({ frame: s, kind: 'whoosh', volume: 0.55 }, { frame: hit, kind: 'punch', volume: 0.8 });
    } else if (move === 'lean') {
      me.fwd.at(s - 1, 0);
      me.fwd.at(s + 8, lean, 'outBack');
      me.fwd.at(e, lean, 'linear');
      if (!nextSame) me.fwd.at(e + 12, 0);
      them.shakes.push({ from: s + 6, to: Math.min(e, s + 18), degrees: 4 });
    } else if (move === 'hop') {
      me.hops.push({ from: s, to: Math.max(s + 28, e - 4), height: 70, period: 14 });
      sfx.push({ frame: s, kind: 'boing', volume: 0.5 });
    } else if (move === 'deflate') {
      me.scale.push({ frame: Math.max(me.scale[me.scale.length - 1].frame + 1, s), value: 1 }, { frame: s + 14, value: 0.8, ease: 'outCubic' }, { frame: Math.max(s + 15, e), value: 0.8, ease: 'linear' }, { frame: Math.max(s + 15, e) + 16, value: 1, ease: 'outBack' });
      sfx.push({ frame: s, kind: 'sad', volume: 0.5 });
    }
    const propSound = l.prop ? PROP_SFX[l.prop] : undefined;
    if (propSound && !(move === 'deflate' && l.prop === 'tears')) sfx.push({ frame: s + 2, kind: propSound, volume: 0.5 });
  });

  // camera: punch in towards the current speaker, back out after the last line
  let camera = scene.background.type === 'worldMap' ? scene.background.camera : null;
  if (camera && spoken.length) {
    const baseLon = camera.lon[camera.lon.length - 1].value;
    const baseLat = camera.lat[camera.lat.length - 1].value;
    const scales = camera.scale.filter((k) => k.frame < 100000);
    const baseScale = scales[scales.length - 1].value;
    const lon: NumberKey[] = [{ frame: 0, value: baseLon }];
    const lat: NumberKey[] = [{ frame: 0, value: baseLat }];
    const scale: NumberKey[] = [...scales];
    const push = (frame: number, toward: { lon: number; lat: number } | null, zoom: number) => {
      const fr = Math.max(lon[lon.length - 1].frame + 1, scale[scale.length - 1].frame + 1, Math.round(frame));
      lon.push({ frame: fr, value: toward ? baseLon + (toward.lon - baseLon) * 0.12 : baseLon, ease: 'inOutCubic' });
      lat.push({ frame: fr, value: toward ? baseLat + (toward.lat - baseLat) * 0.12 : baseLat, ease: 'inOutCubic' });
      scale.push({ frame: fr, value: baseScale * zoom, ease: 'inOutCubic' });
    };
    spoken.forEach((l) => {
      const zoom = resolveMove(l) === 'charge' ? 1.1 : 1.06;
      push(Math.max(l.start + 12, 41), choreo.home[l.speaker], zoom);
      push(l.end, choreo.home[l.speaker], zoom);
    });
    push(spoken[spoken.length - 1].end + 18, null, 1.04);
    camera = { lon, lat, scale };
  }

  const characters = scene.characters.map((c) => {
    const tr = tracks[c.ref];
    if (!tr || c.position.space !== 'geo') return c;
    return {
      ...c,
      position: { space: 'geo' as const, lon: tr.fwd.lon, lat: tr.fwd.lat },
      hops: [...(c.hops ?? []), ...tr.hops],
      scale: tr.scale.length > 1 ? tr.scale : c.scale,
      impacts: [...(c.impacts ?? []), ...tr.impacts],
      shakes: [...(c.shakes ?? []), ...tr.shakes],
    };
  });

  return {
    ...scene,
    background: camera && scene.background.type === 'worldMap' ? { ...scene.background, camera } : scene.background,
    characters,
    sfxCues: [...(scene.sfxCues ?? []), ...sfx].sort((a, b) => a.frame - b.frame),
    flashes: [...(scene.flashes ?? []), ...flashes],
    screenShakes: [...(scene.screenShakes ?? []), ...screenShakes],
    bursts: [...(scene.bursts ?? []), ...bursts],
  };
}
