/**
 * Video spec (src/engine/spec.ts) -> voice script for the voice step.
 *
 * Only what changes the audio goes into the voice script: line id, scene, speaker, text and voices. Format
 * (16:9 / 9:16), templates, expressions and timing hints are left out, so changing them never forces new audio
 * and both formats share one manifest and one set of WAVs.
 */

/** Distinct default voices for cast members without an explicit voice (US English, one Kokoro engine). */
export const DEFAULT_CAST_VOICES = ['af_heart', 'am_puck', 'af_bella', 'am_adam', 'af_nicole', 'am_eric'];
export const DEFAULT_NARRATOR = { voice: { engine: 'kokoro', voice: 'am_michael' } };

export function voiceScriptFromSpec(spec) {
  if (!spec || spec.schemaVersion !== 1) throw new Error('spec: schemaVersion must be 1');
  if (!spec.id) throw new Error('spec: id missing');
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) throw new Error('spec: scenes missing');
  const characters = {};
  (spec.cast ?? []).forEach((c, i) => {
    characters[c.id] = {
      voice: c.voice ?? { engine: 'kokoro', voice: DEFAULT_CAST_VOICES[i % DEFAULT_CAST_VOICES.length] },
      ...(c.fallback ? { fallback: c.fallback } : {}),
    };
  });
  const script = {
    schemaVersion: 1,
    videoId: spec.id,
    language: 'en',
    narrator: spec.narrator ?? DEFAULT_NARRATOR,
    characters,
    lines: spec.scenes.flatMap((s) => (s.lines ?? []).map((l) => ({ id: l.id, scene: s.id, speaker: l.speaker, text: l.text }))),
  };
  if (spec.music) script.music = spec.music;
  if (spec.sfx) script.sfx = spec.sfx;
  return script;
}
