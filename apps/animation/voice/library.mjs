/**
 * Music and sound effects, only from a licence-checked library.
 *
 * src/audio-library.json lists every allowed file: id, kind (music | sfx), absolute file path, SHA-256, licence,
 * source, commercialUse and attribution. A voice script refers to items by id ("music": { "id": ... },
 * "sfx": [{ "id": ..., "scene": ..., "at": ... }]). A file is used only if its entry says commercialUse: true, names
 * a licence and a source, and the file on disk matches the recorded checksum. Anything else is refused and the
 * manifest is marked incomplete, so it cannot be rendered by accident.
 *
 * Accepted files are copied (never moved) into the video's public\library\ folder under their checksum.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256File } from './hash.mjs';
import { readWavInfo } from './wav.mjs';

export function loadLibrary(file) {
  if (!file || !fs.existsSync(file)) return [];
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(j.items) ? j.items : [];
}

function durationMs(file) {
  if (/\.wav$/i.test(file)) {
    try {
      return Math.round(readWavInfo(file).durationMs);
    } catch {
      /* fall through to ffprobe */
    }
  }
  const r = spawnSync(process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const s = parseFloat(r.stdout);
  return r.status === 0 && Number.isFinite(s) ? Math.round(s * 1000) : null;
}

export function checkItem(item, kind) {
  const problems = [];
  if (!item) return ['not in src/audio-library.json'];
  if (item.kind !== kind) problems.push(`is a ${item.kind}, not ${kind}`);
  if (item.commercialUse !== true) problems.push('commercialUse is not true');
  if (!item.licence) problems.push('no licence recorded');
  if (!item.source) problems.push('no source recorded');
  if (item.attributionRequired && !item.attribution) problems.push('attribution required but missing');
  if (!/^[0-9a-f]{64}$/.test(item.sha256 ?? '')) problems.push('no valid sha256 recorded');
  if (!item.file || !fs.existsSync(item.file)) problems.push(`file not found: ${item.file}`);
  else if (/^[0-9a-f]{64}$/.test(item.sha256 ?? '') && sha256File(item.file) !== item.sha256) problems.push('file does not match its recorded sha256');
  return problems;
}

/** Resolves the script's music and SFX against the library. Returns { assets, problems, attributions }. */
export function prepareAssets({ script, library, publicDir }) {
  const problems = [];
  const attributions = [];
  const byId = new Map(library.map((i) => [i.id, i]));
  const use = (ref, kind) => {
    const item = byId.get(ref.id);
    const p = checkItem(item, kind);
    if (p.length) {
      problems.push(`${kind} "${ref.id}": ${p.join('; ')}`);
      return null;
    }
    const target = path.join(publicDir, 'library', `${item.sha256}${path.extname(item.file).toLowerCase()}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(item.file).size) fs.copyFileSync(item.file, target);
    if (item.attributionRequired) attributions.push(item.attribution);
    return {
      id: item.id,
      file: `library/${path.basename(target)}`,
      durationMs: durationMs(item.file),
      licence: item.licence,
      source: item.source,
      attribution: item.attribution ?? null,
      attributionRequired: Boolean(item.attributionRequired),
    };
  };

  let music = null;
  if (script.music) {
    const m = use(script.music, 'music');
    if (m)
      music = {
        ...m,
        volume: script.music.volume ?? 0.25,
        duckVolume: script.music.duckVolume ?? 0.08,
        fadeInFrames: script.music.fadeInFrames ?? 30,
        fadeOutFrames: script.music.fadeOutFrames ?? 45,
      };
  }
  const sfx = [];
  for (const cue of script.sfx ?? []) {
    const s = use(cue, 'sfx');
    if (s) sfx.push({ ...s, scene: cue.scene, at: cue.at ?? 0, volume: cue.volume ?? 0.8 });
  }
  return { assets: { music, sfx }, problems, attributions };
}
