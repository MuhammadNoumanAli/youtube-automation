// node --test voice/test     (no models needed: real engines are replaced by test tones where synthesis is involved)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveVoice, voiceChain, derivedLibrittsSpeaker } from '../catalog.mjs';
import { canonicalJson, lineCacheKey } from '../hash.mjs';
import { encodeWav16, readWavInfo } from '../wav.mjs';

const kokoro = resolveVoice({ engine: 'kokoro', voice: 'af_heart' });
const base = { text: 'Hello there.', voice: kokoro, modelSha256: 'abc', silenceScale: 0.2, runtimeVersion: '1.13.8', cacheVersion: 1 };

test('canonical JSON ignores key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
});

test('cache key: stable, whitespace-insensitive, sensitive to everything that changes audio', () => {
  const k = lineCacheKey(base);
  assert.equal(k, lineCacheKey({ ...base }));
  assert.equal(k, lineCacheKey({ ...base, text: '  Hello   there. ' }));
  assert.notEqual(k, lineCacheKey({ ...base, text: 'Hello there!' }));
  assert.notEqual(k, lineCacheKey({ ...base, voice: resolveVoice({ engine: 'kokoro', voice: 'af_bella' }) }));
  assert.notEqual(k, lineCacheKey({ ...base, voice: resolveVoice({ engine: 'kokoro', voice: 'af_heart', speed: 1.1 }) }));
  assert.notEqual(k, lineCacheKey({ ...base, modelSha256: 'def' }));
  assert.notEqual(k, lineCacheKey({ ...base, runtimeVersion: '2.0.1' }));
  assert.notEqual(k, lineCacheKey({ ...base, silenceScale: 0.3 }));
});

test('voice resolution: Kokoro ids, languages, Piper bounds, rejected models', () => {
  assert.equal(kokoro.speakerId, 3); // af_heart = sid 3, the voice tested on the PC
  assert.equal(resolveVoice({ engine: 'kokoro', voice: 'bm_george' }).language, 'en-GB');
  assert.equal(resolveVoice({ engine: 'kokoro', voice: 'bm_george' }).lexicon, 'lexicon-gb-en.txt');
  assert.equal(resolveVoice({ engine: 'piper', model: 'en_US-libritts-high', speaker: 903 }).speakerId, 903);
  assert.throws(() => resolveVoice({ engine: 'piper', model: 'en_US-libritts-high', speaker: 904 }));
  assert.throws(() => resolveVoice({ engine: 'piper', model: 'en_US-ljspeech-high', speaker: 1 }));
  assert.throws(() => resolveVoice({ engine: 'piper', model: 'en_US-lessac-medium' }), /unknown Piper model/);
  assert.throws(() => resolveVoice({ engine: 'kokoro', voice: 'nope' }));
  assert.throws(() => resolveVoice({ engine: 'openai', voice: 'x' }));
  assert.throws(() => resolveVoice({ engine: 'kokoro', voice: 'af_heart', speed: 3 }));
});

test('fallback chain: primary, explicit fallbacks, then Piper safety net, no duplicates', () => {
  const chain = voiceChain({ voice: { engine: 'kokoro', voice: 'af_heart' }, fallback: [{ engine: 'piper', model: 'en_US-ljspeech-high' }] }, 'netherlands');
  assert.deepEqual(chain.map((c) => c.voice ?? c.model), ['af_heart', 'en_US-ljspeech-high', 'en_US-libritts-high']);
  assert.equal(chain[2].speaker, derivedLibrittsSpeaker('netherlands'));
  assert.equal(derivedLibrittsSpeaker('netherlands'), derivedLibrittsSpeaker('netherlands'));
  assert.equal(voiceChain({ voice: { engine: 'kokoro', voice: 'af_heart' }, noDefaultFallback: true }, 'x').length, 1);
});

test('WAV: encode/read round trip gives the exact duration; extra chunks are skipped', () => {
  const wav = encodeWav16(new Float32Array(36000), 24000);
  const info = readWavInfo(wav);
  assert.equal(info.sampleRate, 24000);
  assert.equal(info.samples, 36000);
  assert.equal(info.durationMs, 1500);
  // insert a LIST chunk between fmt and data
  const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([4, 0, 0, 0]), Buffer.from('INFO')]);
  const withList = Buffer.concat([wav.subarray(0, 36), list, wav.subarray(36)]);
  assert.equal(readWavInfo(withList).durationMs, 1500);
  assert.throws(() => readWavInfo(Buffer.from('not a wav file at all')));
});

test('no Lessac or other unapproved model can be configured', async () => {
  const { MODELS } = await import('../catalog.mjs');
  assert.deepEqual(Object.keys(MODELS).sort(), ['en_US-libritts-high', 'en_US-ljspeech-high', 'kokoro-multi-lang-v1_0']);
  for (const m of Object.values(MODELS)) assert.ok(m.licence && m.attribution);
});
