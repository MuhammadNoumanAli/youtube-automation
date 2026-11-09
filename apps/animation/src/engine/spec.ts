/**
 * Video spec: the simple, form-friendly description of a video (what the dashboard form will produce).
 * Plain serialisable data. src/engine/spec-build.ts turns it into a full VideoConfig + timed dialogue using the
 * scene templates, for either 16:9 or 9:16. voice/spec.mjs turns the same spec into the voice script, so the
 * spec is the single source of truth for both picture and sound.
 */
import type { Expression } from '../character/expressions';
import type { VoiceAssignment, VoiceScript, VoiceSpec } from './voice-types';

export type VideoFormat = '16:9' | '9:16';

export interface LineSpec {
  /** Unique within the video, e.g. "intro-1". */
  id: string;
  /** 'narrator' or a cast id. */
  speaker: string;
  text: string;
  /** Expression the speaker switches to when the line starts. */
  expression?: Expression;
}

export type SceneSpec =
  | { template: 'title-card'; id: string; title: string; subtitle?: string; lines: LineSpec[] }
  | { template: 'map-intro'; id: string; country: string; title?: string; subtitle?: string; lines: LineSpec[] }
  | { template: 'map-focus'; id: string; countries: string[]; lines: LineSpec[] }
  | { template: 'dialogue'; id: string; cast: string[]; setting?: 'countryside' | 'plain' | 'coast'; lines: LineSpec[] };

export const TEMPLATES = ['title-card', 'map-intro', 'map-focus', 'dialogue'] as const;

export interface CastMember {
  /** Character id from the character library (engine/characters.ts). */
  id: string;
  voice?: VoiceSpec;
  fallback?: VoiceSpec[];
}

export interface VideoSpec {
  schemaVersion: 1;
  /** Video id: also the voice manifest folder name. Letters, digits, - and _. */
  id: string;
  title: string;
  format: VideoFormat;
  cast: CastMember[];
  narrator?: VoiceAssignment;
  scenes: SceneSpec[];
  music?: VoiceScript['music'];
  sfx?: VoiceScript['sfx'];
}

export function dimensions(format: VideoFormat): { width: number; height: number } {
  return format === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

/**
 * Structural checks with readable messages (empty = valid). `characters` and `geo` are the ids known to the
 * character library and the map table.
 */
export function validateSpec(spec: VideoSpec, characters: Set<string>, geo: Set<string>): string[] {
  const p: string[] = [];
  if (spec?.schemaVersion !== 1) p.push('schemaVersion must be 1');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(spec?.id ?? '')) p.push('id must be 1-64 letters, digits, - or _');
  if (!spec?.title?.trim()) p.push('title missing');
  if (spec?.format !== '16:9' && spec?.format !== '9:16') p.push('format must be "16:9" or "9:16"');
  const cast = new Set<string>();
  for (const c of spec?.cast ?? []) {
    if (!characters.has(c.id)) p.push(`cast: unknown character "${c.id}"`);
    if (cast.has(c.id)) p.push(`cast: "${c.id}" listed twice`);
    cast.add(c.id);
  }
  if (!spec?.scenes?.length) p.push('at least one scene is required');
  const sceneIds = new Set<string>();
  const lineIds = new Set<string>();
  for (const [i, s] of (spec?.scenes ?? []).entries()) {
    const where = `scene ${i + 1} (${s.id ?? '?'})`;
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(s.id ?? '')) p.push(`${where}: id must be 1-40 letters, digits, - or _`);
    if (sceneIds.has(s.id)) p.push(`${where}: duplicate scene id`);
    sceneIds.add(s.id);
    if (!(TEMPLATES as readonly string[]).includes(s.template)) p.push(`${where}: unknown template "${s.template}"`);
    const onStage: string[] =
      s.template === 'map-intro' ? [s.country] : s.template === 'map-focus' ? s.countries ?? [] : s.template === 'dialogue' ? s.cast ?? [] : [];
    for (const id of onStage) {
      if (!cast.has(id)) p.push(`${where}: "${id}" is not in the cast`);
      if ((s.template === 'map-intro' || s.template === 'map-focus') && !geo.has(id)) p.push(`${where}: no map data for "${id}" (add it to engine/countries.ts)`);
    }
    if (s.template === 'dialogue' && (onStage.length < 1 || onStage.length > 3)) p.push(`${where}: dialogue needs 1-3 characters`);
    if (s.template === 'map-focus' && (onStage.length < 2 || onStage.length > 4)) p.push(`${where}: map-focus needs 2-4 countries`);
    if ((s.template === 'title-card' || s.template === 'map-intro') && s.title && s.title.length > 40) p.push(`${where}: title longer than 40 characters`);
    for (const l of s.lines ?? []) {
      if (!/^[A-Za-z0-9_-]{1,60}$/.test(l.id ?? '')) p.push(`${where}: line id "${l.id}" invalid`);
      if (lineIds.has(l.id)) p.push(`${where}: duplicate line id "${l.id}"`);
      lineIds.add(l.id);
      if (l.speaker !== 'narrator' && !cast.has(l.speaker)) p.push(`${where}: line ${l.id}: speaker "${l.speaker}" is not in the cast`);
      if (!l.text?.trim()) p.push(`${where}: line ${l.id}: empty text`);
      if ((l.text ?? '').length > 90) p.push(`${where}: line ${l.id}: longer than 90 characters`);
    }
  }
  return p;
}
