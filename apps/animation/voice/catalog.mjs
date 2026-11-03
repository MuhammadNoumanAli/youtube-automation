/**
 * Voice catalogue: the approved models, their licences and attribution, and how a voice request in a script
 * resolves to a concrete engine, model and speaker id.
 *
 * Only these three models are allowed. The rejected Lessac voice (and anything else) is not listed and
 * therefore cannot be selected.
 */
import path from 'node:path';

export const MODELS = {
  'kokoro-multi-lang-v1_0': {
    engine: 'kokoro',
    title: 'Kokoro-82M v1.0 (sherpa-onnx multi-lang package)',
    dir: (cfg) => cfg.kokoroDir,
    files: { model: 'model.onnx', voices: 'voices.bin', tokens: 'tokens.txt', dataDir: 'espeak-ng-data' },
    lexicons: { 'en-US': 'lexicon-us-en.txt', 'en-GB': 'lexicon-gb-en.txt' },
    sha256: { 'model.onnx': 'b40f62b166ac8164b0627ef48a0b358eda0985e272fb03ef5252e7206305da11' },
    sampleRate: 24000,
    speakers: 54,
    licence: 'Apache-2.0',
    attribution: 'Voice: Kokoro-82M by hexgrad (Apache-2.0)',
    requiresAttribution: false,
    source: 'https://huggingface.co/hexgrad/Kokoro-82M',
  },
  'en_US-libritts-high': {
    engine: 'piper',
    title: 'Piper en_US-libritts-high',
    dir: (cfg) => path.join(cfg.piperDir, 'en_US-libritts-high'),
    files: { model: 'en_US-libritts-high.onnx', tokens: 'tokens.txt', dataDir: 'espeak-ng-data' },
    sha256: { 'en_US-libritts-high.onnx': '1a6fa5ce4de0aa7e2a91baa13c683c5f13985196e0f12c4c757c05e4d2dd008b' },
    sampleRate: 22050,
    speakers: 904,
    licence: 'CC BY 4.0',
    attribution:
      'Voice: Piper en_US-libritts-high, trained on LibriTTS (H. Zen et al., 2019), licensed CC BY 4.0 (https://www.openslr.org/60/)',
    requiresAttribution: true,
    source: 'https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/libritts/high',
  },
  'en_US-ljspeech-high': {
    engine: 'piper',
    title: 'Piper en_US-ljspeech-high',
    dir: (cfg) => path.join(cfg.piperDir, 'en_US-ljspeech-high'),
    files: { model: 'en_US-ljspeech-high.onnx', tokens: 'tokens.txt', dataDir: 'espeak-ng-data' },
    sha256: { 'en_US-ljspeech-high.onnx': 'fea8faae21240174e972568a004f1d7afb01a93dbc7b3a58c36ecdc1bae82e33' },
    sampleRate: 22050,
    speakers: 1,
    licence: 'Public domain (LJ Speech dataset)',
    attribution: 'Voice: Piper en_US-ljspeech-high, trained on the public-domain LJ Speech dataset',
    requiresAttribution: false,
    source: 'https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/high',
  },
};

/**
 * Kokoro v1.0 English speaker ids (sherpa-onnx order). Ids 28-53 are other languages and are not offered.
 * Stage 0 confirmed 54 speakers; id 3 (af_heart) is the voice tested on this machine.
 */
export const KOKORO_ENGLISH_VOICES = [
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river',
  'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck',
  'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
];

export const DEFAULT_VOICE = { engine: 'kokoro', voice: 'af_heart' };

function clampSpeed(speed) {
  const s = speed ?? 1;
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0.5 || s > 2) throw new Error(`speed must be 0.5-2.0 (got ${speed})`);
  return Math.round(s * 1000) / 1000;
}

/**
 * Resolve a voice request from a script to a concrete voice.
 *   { engine: 'kokoro', voice: 'af_heart', speed?: 1 }
 *   { engine: 'piper', model: 'en_US-libritts-high' | 'en_US-ljspeech-high', speaker?: 0, speed?: 1 }
 */
export function resolveVoice(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('voice spec missing');
  if (spec.engine === 'kokoro') {
    const sid = KOKORO_ENGLISH_VOICES.indexOf(spec.voice);
    if (sid < 0) throw new Error(`unknown Kokoro voice "${spec.voice}"`);
    const language = spec.voice.startsWith('b') ? 'en-GB' : 'en-US';
    return {
      engine: 'kokoro',
      modelId: 'kokoro-multi-lang-v1_0',
      // British voices use the British lexicon, which needs its own engine instance.
      engineKey: `kokoro-multi-lang-v1_0:${language}`,
      lexicon: MODELS['kokoro-multi-lang-v1_0'].lexicons[language],
      speakerId: sid,
      speakerName: spec.voice,
      language,
      speed: clampSpeed(spec.speed),
    };
  }
  if (spec.engine === 'piper') {
    const model = MODELS[spec.model];
    if (!model || model.engine !== 'piper') throw new Error(`unknown Piper model "${spec.model}" (allowed: en_US-libritts-high, en_US-ljspeech-high)`);
    const speakerId = spec.speaker ?? 0;
    if (!Number.isInteger(speakerId) || speakerId < 0 || speakerId >= model.speakers)
      throw new Error(`Piper ${spec.model} speaker must be 0-${model.speakers - 1} (got ${spec.speaker})`);
    return {
      engine: 'piper',
      modelId: spec.model,
      engineKey: spec.model,
      lexicon: null,
      speakerId,
      speakerName: model.speakers > 1 ? `${spec.model}#${speakerId}` : spec.model,
      language: 'en-US',
      speed: clampSpeed(spec.speed),
    };
  }
  throw new Error(`unknown engine "${spec.engine}" (allowed: kokoro, piper)`);
}

/** Stable LibriTTS speaker for a character, so its fallback voice is the same on every run. */
export function derivedLibrittsSpeaker(name) {
  let h = 2166136261;
  for (const ch of String(name)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % MODELS['en_US-libritts-high'].speakers;
}

/** Primary voice, the script's explicit fallbacks, then the built-in Piper safety net. Duplicates removed. */
export function voiceChain(assignment, speakerName) {
  const primary = assignment?.voice ?? DEFAULT_VOICE;
  const chain = [primary, ...(assignment?.fallback ?? [])];
  if (assignment?.noDefaultFallback !== true) {
    chain.push({ engine: 'piper', model: 'en_US-libritts-high', speaker: derivedLibrittsSpeaker(speakerName), speed: primary.speed });
    chain.push({ engine: 'piper', model: 'en_US-ljspeech-high', speed: primary.speed });
  }
  const seen = new Set();
  return chain.filter((s) => {
    const k = JSON.stringify([s.engine, s.voice ?? s.model, s.speaker ?? 0]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
