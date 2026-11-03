import crypto from 'node:crypto';
import fs from 'node:fs';

/** JSON with object keys sorted, so the same data always gives the same string. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(',')}}`;
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Whitespace and Unicode normalisation: cosmetic edits to a line do not force re-synthesis. */
export function normalizeText(text) {
  return String(text).normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * Cache key for one synthesised line. Covers everything that changes the audio: text, engine, model (by
 * checksum), speaker, speed, sentence silence and runtime version. Video format (16:9 / 9:16) is deliberately
 * not part of it, so both formats share the same audio files.
 */
export function lineCacheKey({ text, voice, modelSha256, silenceScale, runtimeVersion, cacheVersion }) {
  return sha256(
    canonicalJson({
      v: cacheVersion,
      text: normalizeText(text),
      engine: voice.engine,
      model: voice.modelId,
      modelSha256,
      lexicon: voice.lexicon ?? null,
      speaker: voice.speakerId,
      speed: voice.speed,
      silenceScale,
      runtime: runtimeVersion,
    }),
  );
}

export function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(4 * 1024 * 1024);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}
