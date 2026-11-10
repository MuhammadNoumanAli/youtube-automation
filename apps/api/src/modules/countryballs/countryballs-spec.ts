/**
 * Form -> video spec (the format of apps/animation/src/engine/spec.ts, schemaVersion 1). Pure functions, no I/O.
 * The spec is what gets approved (it is stored in the script) and exactly what is rendered.
 */
import { COUNTRY_NAMES, CountryId, DEFAULT_CAST_VOICES, DEFAULT_NARRATOR_VOICE, LIMITS } from './countryballs.catalog';
import { CountryballsFormat, CreateCountryballsDto } from './dto/create-countryballs.dto';
import type { SceneItem } from '../../database/entities/script.entity';

export type SpecFormat = '16:9' | '9:16';

export interface SpecVoice {
  engine: 'kokoro';
  voice: string;
  speed?: number;
}

export interface SpecLine {
  id: string;
  speaker: string;
  text: string;
  expression?: string;
}

export type SpecScene =
  | { template: 'title-card'; id: string; title: string; subtitle?: string; lines: SpecLine[] }
  | { template: 'map-intro'; id: string; country: string; title?: string; subtitle?: string; lines: SpecLine[] }
  | { template: 'map-focus'; id: string; countries: string[]; lines: SpecLine[] }
  | { template: 'dialogue'; id: string; cast: string[]; setting?: string; lines: SpecLine[] };

export interface CountryballsSpec {
  schemaVersion: 1;
  id: string;
  title: string;
  format: SpecFormat;
  narrator: { voice: SpecVoice };
  cast: Array<{ id: string; voice: SpecVoice }>;
  scenes: SpecScene[];
}

export const SPEC_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function formatsFor(format: CountryballsFormat): SpecFormat[] {
  if (format === CountryballsFormat.Both) return ['9:16', '16:9'];
  return [format === CountryballsFormat.Short ? '9:16' : '16:9'];
}

/** Builds the spec. Throws an Error listing every problem (shown to the user as a 400). */
export function buildSpec(dto: CreateCountryballsDto, specId: string, format: SpecFormat): CountryballsSpec {
  const problems: string[] = [];
  if (!SPEC_ID_PATTERN.test(specId)) problems.push('internal: invalid spec id');

  const castIds = new Set<string>();
  const cast = dto.cast.map((c, i) => {
    if (castIds.has(c.country)) problems.push(`cast: ${COUNTRY_NAMES[c.country]} is listed twice`);
    castIds.add(c.country);
    const voice: SpecVoice = { engine: 'kokoro', voice: c.voice ?? DEFAULT_CAST_VOICES[i % DEFAULT_CAST_VOICES.length] };
    if (c.speed !== undefined && c.speed !== 1) voice.speed = Math.round(c.speed * 100) / 100;
    return { id: c.country, voice };
  });

  const scenes: SpecScene[] = dto.scenes.map((s, si) => {
    const id = `s${si + 1}`;
    const where = `scene ${si + 1} (${s.type})`;
    const lines: SpecLine[] = s.lines.map((l, li) => {
      const text = l.text.trim().replace(/\s+/g, ' ');
      if (!text) problems.push(`${where}, line ${li + 1}: empty text`);
      if (text.length > LIMITS.lineChars) problems.push(`${where}, line ${li + 1}: longer than ${LIMITS.lineChars} characters`);
      if (l.speaker !== 'narrator' && !castIds.has(l.speaker))
        problems.push(`${where}, line ${li + 1}: ${COUNTRY_NAMES[l.speaker as CountryId] ?? l.speaker} speaks but is not in the cast`);
      return { id: `${id}-l${li + 1}`, speaker: l.speaker, text, ...(l.expression ? { expression: l.expression } : {}) };
    });
    const onStage = (ids: string[]) => {
      for (const c of ids) if (!castIds.has(c)) problems.push(`${where}: ${COUNTRY_NAMES[c as CountryId] ?? c} is not in the cast`);
      if (new Set(ids).size !== ids.length) problems.push(`${where}: a country is listed twice`);
    };
    switch (s.type) {
      case 'title-card': {
        const title = s.title?.trim() || dto.title.trim().slice(0, LIMITS.sceneTitleChars);
        return { template: 'title-card', id, title, ...(s.subtitle?.trim() ? { subtitle: s.subtitle.trim() } : {}), lines };
      }
      case 'map-intro': {
        if (!s.country) {
          problems.push(`${where}: choose the country to show`);
          return { template: 'map-intro', id, country: '', lines };
        }
        onStage([s.country]);
        return {
          template: 'map-intro',
          id,
          country: s.country,
          title: s.title?.trim() || COUNTRY_NAMES[s.country],
          ...(s.subtitle?.trim() ? { subtitle: s.subtitle.trim() } : {}),
          lines,
        };
      }
      case 'map-focus': {
        const countries = s.countries ?? [];
        const [min, max] = LIMITS.mapFocusCountries;
        if (countries.length < min || countries.length > max) problems.push(`${where}: choose ${min}-${max} countries`);
        onStage(countries);
        return { template: 'map-focus', id, countries: [...countries], lines };
      }
      case 'dialogue': {
        const who = s.countries ?? [];
        const [min, max] = LIMITS.dialogueCast;
        if (who.length < min || who.length > max) problems.push(`${where}: choose ${min}-${max} countries on screen`);
        onStage(who);
        for (const l of s.lines)
          if (l.speaker !== 'narrator' && !who.includes(l.speaker as CountryId))
            problems.push(`${where}: ${COUNTRY_NAMES[l.speaker as CountryId] ?? l.speaker} speaks but is not on screen in this scene`);
        return { template: 'dialogue', id, cast: [...who], setting: s.setting ?? 'countryside', lines };
      }
      default:
        problems.push(`${where}: unknown scene type`);
        return { template: 'title-card', id, title: 'invalid', lines };
    }
  });

  if (problems.length) throw new Error(problems.join('; '));
  return {
    schemaVersion: 1,
    id: specId,
    title: dto.title.trim(),
    format,
    narrator: { voice: { engine: 'kokoro', voice: dto.narrator_voice ?? DEFAULT_NARRATOR_VOICE } },
    cast,
    scenes,
  };
}

/** The structural checks the renderer needs; used again by the job before it renders an approved script. */
export function checkSpec(spec: unknown): string[] {
  const s = spec as CountryballsSpec;
  const p: string[] = [];
  if (!s || s.schemaVersion !== 1) return ['spec missing or not schemaVersion 1'];
  if (!SPEC_ID_PATTERN.test(s.id ?? '')) p.push('spec id invalid');
  if (s.format !== '16:9' && s.format !== '9:16') p.push('spec format invalid');
  if (!Array.isArray(s.scenes) || s.scenes.length === 0) p.push('spec has no scenes');
  if (!Array.isArray(s.cast)) p.push('spec cast missing');
  return p;
}

/** Readable script for the existing script review screen. */
export function readableScript(spec: CountryballsSpec): string {
  const name = (id: string) => (id === 'narrator' ? 'Narrator' : COUNTRY_NAMES[id as CountryId] ?? id);
  const out: string[] = [`# ${spec.title}`, '', '[Countryballs animation: lines are spoken by local voices, picture is generated]', ''];
  spec.scenes.forEach((sc, i) => {
    const where =
      sc.template === 'title-card'
        ? `Title card: ${sc.title}`
        : sc.template === 'map-intro'
          ? `Map: ${name(sc.country)}`
          : sc.template === 'map-focus'
            ? `Map: ${sc.countries.map(name).join(', ')}`
            : `Dialogue (${sc.setting ?? 'countryside'}): ${sc.cast.map(name).join(', ')}`;
    out.push(`## Scene ${i + 1}. ${where}`);
    for (const l of sc.lines) out.push(`${name(l.speaker)}${l.expression ? ` (${l.expression})` : ''}: ${l.text}`);
    out.push('');
  });
  return out.join('\n');
}

/** Rough speech length: about 14 characters per second plus a short gap per line, plus intro and tail. */
export function estimateSeconds(spec: CountryballsSpec): number {
  const lines = spec.scenes.flatMap((s) => s.lines);
  const speech = lines.reduce((t, l) => t + l.text.length / 14 + 0.4, 0);
  return Math.max(10, Math.round(speech + spec.scenes.length * 1.2 + 1));
}

/** Scene plan in the shape the existing review screens already show. */
export function scenePlan(spec: CountryballsSpec): SceneItem[] {
  const total = estimateSeconds(spec);
  const chars = spec.scenes.map((s) => s.lines.reduce((t, l) => t + l.text.length, 0) + 20);
  const sum = chars.reduce((a, b) => a + b, 0);
  return spec.scenes.map((s, i) => ({
    sceneNumber: i + 1,
    durationSeconds: Math.max(2, Math.round((total * chars[i]) / sum)),
    visualDescription:
      s.template === 'title-card'
        ? `Countryballs title card: ${s.title}`
        : s.template === 'map-intro'
          ? `Map intro of ${COUNTRY_NAMES[s.country as CountryId] ?? s.country}`
          : s.template === 'map-focus'
            ? `Map with ${s.countries.map((c) => COUNTRY_NAMES[c as CountryId] ?? c).join(', ')}`
            : `Countryballs dialogue (${s.setting ?? 'countryside'})`,
    onScreenText: s.template === 'title-card' ? s.title : undefined,
    narrationSnippet: s.lines.map((l) => l.text).join(' ').slice(0, 200),
    suggestedAssetType: 'video',
  }));
}
