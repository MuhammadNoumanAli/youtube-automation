import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import { RACE_COUNTRIES, type RaceCountry } from './countries';
import type { RaceMeta, StageData } from './types';

/**
 * Replay files live in the render's public folder (<race folder>\replay: race.json, stage-NNN.json, sfx/).
 * Each browser tab fetches a stage file once and keeps it in memory.
 */
const pending = new Map<string, Promise<unknown>>();
const loaded = new Map<string, unknown>();

export function fetchJson<T>(file: string): Promise<T> {
  let p = pending.get(file);
  if (!p) {
    p = fetch(staticFile(file)).then((r) => {
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}. Is <race folder>\\replay the public dir?`);
      return r.json();
    });
    pending.set(file, p);
    p.then((d) => loaded.set(file, d)).catch(() => pending.delete(file));
  }
  return p as Promise<T>;
}

export const loadMeta = () => fetchJson<RaceMeta>('race.json');

/** Load a JSON file from the public folder, holding the render until it has arrived. */
export function useJson<T>(file: string): T | null {
  const [data, setData] = useState<T | null>(() => (loaded.get(file) as T) ?? null);
  const [handle] = useState(() => (loaded.has(file) ? null : delayRender(`loading ${file}`, { timeoutInMilliseconds: 120_000 })));
  useEffect(() => {
    if (data) return;
    fetchJson<T>(file)
      .then((d) => {
        setData(d);
        if (handle !== null) continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [file, data, handle]);
  return data;
}

const FALLBACK: RaceCountry = { id: '?', name: '?', continent: 'Other', flag: { layout: 'h-stripes', colors: ['#888', '#bbb'] }, accent: '#fff' };
export const character = (id: string): RaceCountry => RACE_COUNTRIES[id] ?? { ...FALLBACK, id, name: id };

export const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";
