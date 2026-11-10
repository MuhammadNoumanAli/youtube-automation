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
import type { Caption, CharacterInScene, Choreography, ExpressionKey, NumberKey, TalkSegment, VideoConfig } from './types';
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
      timed.push({ speaker: line.speaker, start, end: start + frames });
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
    return {
      ...scene,
      durationInFrames: Math.max(scene.durationInFrames, needed),
      captions: [...scene.captions, ...generated].sort((x, y) => x.from - y.from),
      characters: (() => {
        const withLines = scene.characters.map((c) => {
          let out = c;
          if (talk.has(c.ref)) out = { ...out, talk: [...(c.talk ?? []), ...talk.get(c.ref)!] };
          if (faces.has(c.ref)) out = { ...out, expressions: [...c.expressions, ...faces.get(c.ref)!].sort((x, y) => x.frame - y.frame) };
          if (props.has(c.ref)) out = { ...out, props: [...(c.props ?? []), ...props.get(c.ref)!] };
          return out;
        });
        return scene.choreography?.kind === 'roast' ? applyRoast(withLines, scene.choreography, timed) : withLines;
      })(),
    };
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

/*
 * 'roast': while a character speaks it lunges part of the way towards the other one, holds there, and settles back
 * after the line; consecutive lines by the same speaker keep it forward. The other character flinches (a short
 * shake) a moment after each line starts. Narrator lines move nobody.
 */
export interface TimedLine {
  speaker: string;
  start: number;
  end: number;
}

const LUNGE_IN = 8; // frames to move forward
const SETTLE = 12; // frames to return home
const MERGE_GAP = 14; // lines closer than this keep the speaker forward

export function applyRoast(characters: CharacterInScene[], choreo: Choreography, lines: TimedLine[]): CharacterInScene[] {
  const ids = Object.keys(choreo.home);
  if (ids.length !== 2) return characters;
  const lunge = Math.max(0, Math.min(0.45, choreo.lunge ?? 0.18));
  const spoken = lines.filter((l) => ids.includes(l.speaker)).sort((x, y) => x.start - y.start);

  return characters.map((c) => {
    const home = choreo.home[c.ref];
    if (!home || c.position.space !== 'geo') return c;
    const other = choreo.home[ids.find((id) => id !== c.ref)!];
    const fwd = { lon: home.lon + (other.lon - home.lon) * lunge, lat: home.lat + (other.lat - home.lat) * lunge };

    // speaking intervals, merged when close together
    const own: [number, number][] = [];
    for (const l of spoken.filter((s) => s.speaker === c.ref)) {
      const last = own[own.length - 1];
      if (last && l.start - last[1] <= MERGE_GAP) last[1] = Math.max(last[1], l.end);
      else own.push([l.start, l.end]);
    }
    const lon: NumberKey[] = [{ frame: 0, value: home.lon }];
    const lat: NumberKey[] = [{ frame: 0, value: home.lat }];
    for (const [s, e] of own) {
      const from = Math.max(lon[lon.length - 1].frame + 1, s - 2);
      lon.push({ frame: from, value: home.lon }, { frame: from + LUNGE_IN, value: fwd.lon, ease: 'outBack' }, { frame: Math.max(from + LUNGE_IN + 1, e), value: fwd.lon, ease: 'linear' }, { frame: Math.max(from + LUNGE_IN + 1, e) + SETTLE, value: home.lon, ease: 'inOutCubic' });
      lat.push({ frame: from, value: home.lat }, { frame: from + LUNGE_IN, value: fwd.lat, ease: 'outBack' }, { frame: Math.max(from + LUNGE_IN + 1, e), value: fwd.lat, ease: 'linear' }, { frame: Math.max(from + LUNGE_IN + 1, e) + SETTLE, value: home.lat, ease: 'inOutCubic' });
    }
    // flinch when the other one speaks
    const shakes = spoken
      .filter((l) => l.speaker !== c.ref)
      .map((l) => ({ from: l.start + 6, to: Math.min(l.end, l.start + 18), degrees: 4 }));
    return {
      ...c,
      position: { space: 'geo', lon, lat },
      shakes: [...(c.shakes ?? []), ...shakes],
    };
  });
}
