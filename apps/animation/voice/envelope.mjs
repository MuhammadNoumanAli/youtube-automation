/**
 * Speech envelope for the "talking" animation: how loud a line is over time, 0..1, sampled RATE times a second.
 * Computed from the line's own WAV, so it is exact and works for cached lines too. Normalised per line (95th
 * percentile = 1), so quiet and loud voices animate equally. Linear and with a short release, so it rises and
 * falls with syllables instead of sitting at a plateau.
 */
import fs from 'node:fs';
import { readWavInfo } from './wav.mjs';

export const ENVELOPE_RATE = 50; // values per second (20 ms)

export function computeEnvelope(input, rate = ENVELOPE_RATE) {
  const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const info = readWavInfo(buf);
  if (info.format !== 1 || info.bitsPerSample !== 16) throw new Error('envelope: 16-bit PCM WAV expected');
  // locate the data chunk
  let pos = 12;
  let dataStart = -1;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'data') {
      dataStart = pos + 8;
      break;
    }
    pos += 8 + size + (size % 2);
  }
  const ch = info.channels;
  const win = Math.max(1, Math.round(info.sampleRate / rate));
  const frames = Math.ceil(info.samples / win);
  const rms = new Float64Array(frames);
  for (let w = 0; w < frames; w++) {
    let sum = 0;
    let n = 0;
    const end = Math.min(info.samples, (w + 1) * win);
    for (let s = w * win; s < end; s++) {
      const v = buf.readInt16LE(dataStart + s * ch * 2) / 32768; // first channel
      sum += v * v;
      n++;
    }
    rms[w] = n ? Math.sqrt(sum / n) : 0;
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1e-9;
  const noise = ref * 0.08;
  const out = new Array(frames);
  let level = 0;
  for (let w = 0; w < frames; w++) {
    const target = Math.min(1, Math.max(0, rms[w] - noise) / (ref - noise || 1e-9));
    level = target > level ? target : level * 0.5 + target * 0.5; // fast attack, ~30 ms release: follows syllables
    out[w] = Math.round(level * 100) / 100;
  }
  return out;
}
