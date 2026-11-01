import type { CharacterDefinition } from './types';

/**
 * Character library. Original, code-drawn designs: only the flag pattern and an accent colour are data.
 * National flags are simple geometric designs; emblem/coat-of-arms flags are intentionally not included yet.
 */
export const CHARACTERS: Record<string, CharacterDefinition> = {
  netherlands: {
    id: 'netherlands',
    name: 'Netherlands',
    flag: { layout: 'h-stripes', colors: ['#ae1c28', '#ffffff', '#21468b'] },
    accent: '#f39c34',
  },
  belgium: {
    id: 'belgium',
    name: 'Belgium',
    flag: { layout: 'v-stripes', colors: ['#1a1a1a', '#fdda24', '#ef3340'] },
    accent: '#fdda24',
  },
  germany: {
    id: 'germany',
    name: 'Germany',
    flag: { layout: 'h-stripes', colors: ['#1a1a1a', '#dd0000', '#ffce00'] },
    accent: '#ffce00',
  },
  denmark: {
    id: 'denmark',
    name: 'Denmark',
    flag: { layout: 'nordic-cross', field: '#c8102e', cross: '#ffffff' },
    accent: '#ff6b6b',
  },
  norway: {
    id: 'norway',
    name: 'Norway',
    flag: { layout: 'nordic-cross', field: '#ba0c2f', cross: '#00205b', border: '#ffffff' },
    accent: '#7fb2ff',
  },
  japan: {
    id: 'japan',
    name: 'Japan',
    flag: { layout: 'disc', field: '#ffffff', disc: '#bc002d' },
    accent: '#ff8fa3',
  },
};

export function pickCharacters(...ids: string[]): CharacterDefinition[] {
  return ids.map((id) => {
    const c = CHARACTERS[id];
    if (!c) throw new Error(`Unknown character "${id}"`);
    return c;
  });
}
