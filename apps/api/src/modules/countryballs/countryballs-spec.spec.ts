import { buildSpec, checkSpec, estimateSeconds, formatsFor, readableScript, scenePlan } from './countryballs-spec';
import { CountryballsFormat } from './dto/create-countryballs.dto';
import { sampleForm } from './countryballs.fixtures';

describe('countryballs spec builder', () => {
  it('maps formats: both -> 9:16 and 16:9', () => {
    expect(formatsFor(CountryballsFormat.Both)).toEqual(['9:16', '16:9']);
    expect(formatsFor(CountryballsFormat.Short)).toEqual(['9:16']);
    expect(formatsFor(CountryballsFormat.LongForm)).toEqual(['16:9']);
  });

  it('builds a valid schemaVersion 1 spec with stable ids and defaults', () => {
    const spec = buildSpec(sampleForm(), 'cb-abc123', '9:16');
    expect(checkSpec(spec)).toEqual([]);
    expect(spec.id).toBe('cb-abc123');
    expect(spec.format).toBe('9:16');
    expect(spec.narrator.voice).toEqual({ engine: 'kokoro', voice: 'am_michael' });
    expect(spec.cast).toEqual([
      { id: 'netherlands', voice: { engine: 'kokoro', voice: 'af_heart', speed: 1.05 } },
      { id: 'belgium', voice: { engine: 'kokoro', voice: 'am_puck' } }, // second default voice
    ]);
    expect(spec.scenes.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(spec.scenes[0]).toMatchObject({ template: 'title-card', title: 'Why the Netherlands is still dry' });
    expect(spec.scenes[1]).toMatchObject({ template: 'map-intro', country: 'netherlands', title: 'Netherlands' });
    expect(spec.scenes[2]).toMatchObject({ template: 'dialogue', cast: ['netherlands', 'belgium'], setting: 'coast' });
    expect(spec.scenes[2].lines[1]).toEqual({ id: 's3-l2', speaker: 'netherlands', text: 'Dikes. Lots of dikes.', expression: 'determined' });
  });

  it('gives both formats identical dialogue and voices (one shared voice manifest)', () => {
    const a = buildSpec(sampleForm(), 'cb-x', '9:16');
    const b = buildSpec(sampleForm(), 'cb-x', '16:9');
    expect({ ...a, format: null }).toEqual({ ...b, format: null });
  });

  it('rejects speakers that are not in the cast or not on screen, with readable messages', () => {
    const form = sampleForm({
      scenes: [
        { type: 'dialogue', countries: ['netherlands'], lines: [{ speaker: 'belgium', text: 'Hi' }] } as any,
        { type: 'map-intro', country: 'japan', lines: [{ speaker: 'japan', text: 'Konnichiwa' }] } as any,
      ],
    });
    expect(() => buildSpec(form, 'cb-x', '16:9')).toThrow(/Belgium speaks but is not on screen/);
    expect(() => buildSpec(form, 'cb-x', '16:9')).toThrow(/Japan is not in the cast/);
  });

  it('enforces scene sizes from the animation app (map-focus 2-4, dialogue 1-3) and duplicate cast', () => {
    const form = sampleForm({
      cast: [{ country: 'netherlands' }, { country: 'netherlands' }] as any,
      scenes: [{ type: 'map-focus', countries: ['netherlands'], lines: [{ speaker: 'narrator', text: 'One.' }] } as any],
    });
    expect(() => buildSpec(form, 'cb-x', '16:9')).toThrow(/listed twice.*choose 2-4 countries|choose 2-4 countries.*listed twice/);
  });

  it('readable script, scene plan and estimate are filled', () => {
    const spec = buildSpec(sampleForm(), 'cb-x', '16:9');
    const text = readableScript(spec);
    expect(text).toContain('Belgium (surprised): How do you stay dry?');
    expect(text).toContain('Narrator: This country is lower');
    const plan = scenePlan(spec);
    expect(plan).toHaveLength(3);
    expect(plan[0].sceneNumber).toBe(1);
    expect(estimateSeconds(spec)).toBeGreaterThanOrEqual(10);
  });

  it('checkSpec flags a missing or broken spec', () => {
    expect(checkSpec(null)).toEqual(['spec missing or not schemaVersion 1']);
    expect(checkSpec({ schemaVersion: 1, id: '../x', format: '4:3', scenes: [], cast: [] })).toEqual(
      expect.arrayContaining(['spec id invalid', 'spec format invalid', 'spec has no scenes']),
    );
  });

  it('builds a roast-battle scene with props, and rejects bad pairs and narrator props', () => {
    const form = sampleForm({
      cast: [{ country: 'italy' }, { country: 'france' }, { country: 'spain' }] as any,
      scenes: [
        {
          type: 'roast-battle',
          countries: ['italy', 'france'],
          title: 'Italy vs France',
          lines: [
            { speaker: 'italy', text: 'You call that a croissant?', expression: 'angry' },
            { speaker: 'france', text: 'Fine. You win.', prop: 'tears' },
            { speaker: 'italy', text: 'The crown stays in Rome.', prop: 'crown', move: 'auto' },
          ],
        } as any,
      ],
    });
    (form.scenes[0].lines[0] as any).move = 'charge';
    const spec = buildSpec(form, 'cb-roast1', '9:16');
    expect(spec.scenes[0]).toEqual({
      template: 'roast-battle',
      id: 's1',
      countries: ['italy', 'france'],
      title: 'Italy vs France',
      lines: [
        { id: 's1-l1', speaker: 'italy', text: 'You call that a croissant?', expression: 'angry', move: 'charge' },
        { id: 's1-l2', speaker: 'france', text: 'Fine. You win.', prop: 'tears' },
        { id: 's1-l3', speaker: 'italy', text: 'The crown stays in Rome.', prop: 'crown' },
      ],
    });
    expect(readableScript(spec)).toContain('Roast battle: Italy vs France');
    expect(readableScript(spec)).toContain('Italy [crown]: The crown stays in Rome.');

    const bad = sampleForm({
      cast: [{ country: 'italy' }, { country: 'france' }, { country: 'spain' }] as any,
      scenes: [
        {
          type: 'roast-battle',
          countries: ['italy', 'italy'],
          lines: [
            { speaker: 'spain', text: 'Hola' },
            { speaker: 'narrator', text: 'Meanwhile', prop: 'crown' },
          ],
        } as any,
      ],
    });
    expect(() => buildSpec(bad, 'cb-x', '16:9')).toThrow(/exactly 2 different countries/);
    expect(() => buildSpec(bad, 'cb-x', '16:9')).toThrow(/Spain is not one of the two countries/);
    expect(() => buildSpec(bad, 'cb-x', '16:9')).toThrow(/narrator cannot hold a prop/);
  });
});
