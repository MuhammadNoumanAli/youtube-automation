import { CHARACTERS } from '../engine/characters';
import catalog from './countries.json';
import type { RaceFlagSpec } from './RaceFlag';

/**
 * Race country catalog: the project's own characters (src/engine/characters.ts, unchanged) plus the race-only
 * countries in countries.json. 197 countries in total.
 */
export interface RaceCountry {
  id: string;
  name: string;
  continent: string;
  flag: RaceFlagSpec;
  accent: string;
}

type CatalogEntry = { id: string; name: string; continent: string; flag?: RaceFlagSpec };

/** First colour of a flag that is not plain white: used as the country's accent colour. */
function accentOf(flag: RaceFlagSpec): string {
  const colors: string[] = [];
  const f = flag as unknown as Record<string, unknown>;
  for (const k of ['field', 'band', 'canton', 'triangle', 'disc', 'cross']) if (typeof f[k] === 'string') colors.push(f[k] as string);
  for (const k of ['colors', 'stripes']) if (Array.isArray(f[k])) colors.push(...(f[k] as string[]));
  return colors.find((c) => c && c.toLowerCase() !== '#ffffff' && c !== 'none') ?? '#cccccc';
}

export const RACE_COUNTRIES: Record<string, RaceCountry> = {};
for (const c of (catalog as { countries: CatalogEntry[] }).countries) {
  const builtin = CHARACTERS[c.id];
  const flag = (builtin?.flag ?? c.flag) as RaceFlagSpec | undefined;
  if (!flag) continue;
  RACE_COUNTRIES[c.id] = { id: c.id, name: builtin?.name ?? c.name, continent: c.continent, flag, accent: builtin?.accent ?? accentOf(flag) };
}
// any project character not listed in the catalog still works in a race
for (const ch of Object.values(CHARACTERS)) {
  if (!RACE_COUNTRIES[ch.id]) RACE_COUNTRIES[ch.id] = { id: ch.id, name: ch.name, continent: 'Other', flag: ch.flag, accent: ch.accent };
}
