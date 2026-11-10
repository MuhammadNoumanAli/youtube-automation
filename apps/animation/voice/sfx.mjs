/**
 * Sound-effect kit, synthesised in code: original sounds made by this studio (no samples, no licence needed).
 * Deterministic: the same kit is produced every time (seeded noise), so renders are reproducible.
 *
 *   writeSfxKit(dir) -> { dir: 'sfx', files: { whoosh: 'sfx/whoosh.wav', ... }, license }
 *
 * The voice step writes the kit into the video's public folder next to the voice lines; the renderer plays the cues
 * that applyVoiceTiming places at the real line times (src/engine/dialogue.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { encodeWav16 } from './wav.mjs';

export const SFX_RATE = 44100;
export const SFX_KINDS = ['whoosh', 'pop', 'boing', 'punch', 'ding', 'sad', 'sparkle', 'flame'];
export const SFX_LICENSE = 'Original sound, synthesised by voice/sfx.mjs in this project (no third-party material).';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

/** One-pole low-pass, coefficient from cutoff in Hz. */
function lowpass(samples, cutoffAt) {
  const out = new Float32Array(samples.length);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    const fc = cutoffAt(i / SFX_RATE);
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SFX_RATE);
    y += a * (samples[i] - y);
    out[i] = y;
  }
  return out;
}

function normalize(s, peak = 0.7) {
  let m = 0;
  for (const v of s) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < s.length; i++) s[i] = (s[i] / m) * peak;
  return s;
}

const make = (seconds, fn) => {
  const n = Math.round(seconds * SFX_RATE);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = fn(i / SFX_RATE, i);
  return s;
};

export const SYNTH = {
  /** Filtered noise sweeping up then down: a dash across the screen. */
  whoosh() {
    const r = rng(11);
    const noise = make(0.45, () => r() * 2 - 1);
    const swept = lowpass(noise, (t) => 300 + 3200 * Math.sin(Math.min(1, t / 0.45) * Math.PI));
    return normalize(swept.map((v, i) => v * Math.sin(Math.min(1, i / SFX_RATE / 0.45) * Math.PI)), 0.55);
  },
  /** Short bubbly pop. */
  pop() {
    return normalize(make(0.12, (t) => Math.sin(2 * Math.PI * (600 + 900 * Math.exp(-t * 40)) * t) * env(t, 0.003, 0.03)), 0.6);
  },
  /** Springy boing: a sine with a wobbling falling pitch. */
  boing() {
    let phase = 0;
    return normalize(
      make(0.6, (t) => {
        const f = 180 + 260 * Math.exp(-t * 5) * (1 + 0.35 * Math.sin(2 * Math.PI * 14 * t));
        phase += (2 * Math.PI * f) / SFX_RATE;
        return Math.sin(phase) * env(t, 0.005, 0.22);
      }),
      0.6,
    );
  },
  /** Cartoon punch: low thump plus a burst of noise. */
  punch() {
    const r = rng(23);
    let phase = 0;
    const s = make(0.32, (t) => {
      phase += (2 * Math.PI * (55 + 120 * Math.exp(-t * 30))) / SFX_RATE;
      return Math.sin(phase) * env(t, 0.002, 0.08) + (r() * 2 - 1) * env(t, 0.001, 0.025) * 0.6;
    });
    return normalize(lowpass(s, () => 2600), 0.8);
  },
  /** Bright bell for a win. */
  ding() {
    return normalize(
      make(1.0, (t) => [1, 2.76, 5.4].reduce((a, h, k) => a + Math.sin(2 * Math.PI * 1320 * h * t) * Math.exp(-t * (3 + k * 3)) / (k + 1), 0) * env(t, 0.002, 0.6)),
      0.5,
    );
  },
  /** Three descending "wah" notes: a sad loser jingle (original melody). */
  sad() {
    const notes = [392, 370, 349, 330];
    const len = 0.32;
    let phase = 0;
    return normalize(
      make(notes.length * len + 0.3, (t) => {
        const k = Math.min(notes.length - 1, Math.floor(t / len));
        const local = t - k * len;
        const vib = k === notes.length - 1 ? 1 + 0.02 * Math.sin(2 * Math.PI * 6 * local) : 1;
        phase += (2 * Math.PI * notes[k] * vib) / SFX_RATE;
        // soft saw (few harmonics) with a "wah" filter feel via amplitude shape
        const saw = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase);
        const shape = k === notes.length - 1 ? env(local, 0.03, 0.35) : Math.sin(Math.min(1, local / len) * Math.PI);
        return saw * shape;
      }),
      0.45,
    );
  },
  /** Twinkly upward chimes. */
  sparkle() {
    const freqs = [1568, 2093, 2637, 3136];
    return normalize(
      make(0.7, (t) => freqs.reduce((a, f, k) => (t >= k * 0.09 ? a + Math.sin(2 * Math.PI * f * (t - k * 0.09)) * Math.exp(-(t - k * 0.09) * 9) : a), 0)),
      0.4,
    );
  },
  /** Crackling flame burst. */
  flame() {
    const r = rng(37);
    const noise = make(0.7, () => r() * 2 - 1);
    const body = lowpass(noise, (t) => 900 + 600 * Math.sin(t * 40));
    return normalize(body.map((v, i) => v * env(i / SFX_RATE, 0.05, 0.3) * (0.7 + 0.3 * (r() > 0.97 ? 3 : 1))), 0.5);
  },
};

/** Writes the kit into <publicDir>/sfx (idempotent: identical bytes every time). */
export function writeSfxKit(publicDir) {
  const dir = path.join(publicDir, 'sfx');
  fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const kind of SFX_KINDS) {
    const file = path.join(dir, `${kind}.wav`);
    const bytes = encodeWav16(SYNTH[kind](), SFX_RATE);
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)) fs.writeFileSync(file, bytes);
    files[kind] = `sfx/${kind}.wav`;
  }
  return { dir: 'sfx', files, license: SFX_LICENSE };
}
