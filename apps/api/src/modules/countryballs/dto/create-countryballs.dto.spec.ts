import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateCountryballsDto } from './create-countryballs.dto';

/** Same pipe options as main.ts, so this is exactly what the API accepts. */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
});
const meta: ArgumentMetadata = { type: 'body', metatype: CreateCountryballsDto };

const body = () => ({
  title: 'Why the Netherlands is still dry',
  format: 'both',
  narrator_voice: 'am_michael',
  cast: [{ country: 'netherlands', voice: 'af_heart', speed: 1.05 }, { country: 'belgium' }],
  scenes: [
    { type: 'title-card', lines: [{ speaker: 'narrator', text: 'Hello.' }] },
    { type: 'dialogue', countries: ['netherlands', 'belgium'], setting: 'coast', lines: [{ speaker: 'belgium', text: 'Hi!', expression: 'happy' }] },
  ],
  tags: ['countryballs'],
});

const errorsOf = async (b: unknown): Promise<string> => {
  try {
    await pipe.transform(b, meta);
    return '';
  } catch (e) {
    return JSON.stringify((e as BadRequestException).getResponse());
  }
};

describe('CreateCountryballsDto (global ValidationPipe settings)', () => {
  it('accepts a complete form and transforms nested objects', async () => {
    const dto = (await pipe.transform(body(), meta)) as CreateCountryballsDto;
    expect(dto.scenes[1].lines[0].speaker).toBe('belgium');
    expect(dto.cast[0].speed).toBe(1.05);
  });

  it('rejects unknown countries, voices, scene types and expressions', async () => {
    const b: any = body();
    b.cast[1].country = 'atlantis';
    b.cast[0].voice = 'some_voice';
    b.scenes[0].type = 'explosion';
    b.scenes[1].lines[0].expression = 'smug';
    const errs = await errorsOf(b);
    expect(errs).toMatch(/country must be one of/);
    expect(errs).toMatch(/voice must be one of/);
    expect(errs).toMatch(/type must be one of/);
    expect(errs).toMatch(/expression must be one of/);
  });

  it('rejects lines over 90 characters, empty lines and too many scenes', async () => {
    const b: any = body();
    b.scenes[0].lines[0].text = 'x'.repeat(91);
    b.scenes[1].lines[0].text = '';
    const errs = await errorsOf(b);
    expect(errs).toMatch(/text must be shorter than or equal to 90 characters/);
    expect(errs).toMatch(/text should not be empty/);

    const many: any = body();
    many.scenes = Array.from({ length: 13 }, () => many.scenes[0]);
    expect(await errorsOf(many)).toMatch(/scenes must contain no more than 12 elements/);
  });

  it('rejects unexpected fields (forbidNonWhitelisted), e.g. trying to pre-approve', async () => {
    const errs = await errorsOf({ ...body(), status: 'approved' });
    expect(errs).toMatch(/property status should not exist/);
  });

  it('rejects an invalid format and voice speed outside 0.8-1.25', async () => {
    const b: any = body();
    b.format = 'square';
    b.cast[0].speed = 3;
    const errs = await errorsOf(b);
    expect(errs).toMatch(/format must be one of/);
    expect(errs).toMatch(/speed must not be greater than 1.25/);
  });
});
