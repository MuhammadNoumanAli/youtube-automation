/** Test fixture: a complete, valid Countryballs form. */
import { CountryballsFormat, CreateCountryballsDto } from './dto/create-countryballs.dto';

export function sampleForm(overrides: Partial<CreateCountryballsDto> = {}): CreateCountryballsDto {
  return {
    title: 'Why the Netherlands is still dry',
    format: CountryballsFormat.Both,
    cast: [{ country: 'netherlands', voice: 'af_heart', speed: 1.05 }, { country: 'belgium' }],
    scenes: [
      { type: 'title-card', lines: [{ speaker: 'narrator', text: 'This country is lower than the sea next to it.' }] },
      {
        type: 'map-intro',
        country: 'netherlands',
        lines: [{ speaker: 'netherlands', text: 'Hallo! Much of my land lies below sea level.', expression: 'happy' }],
      },
      {
        type: 'dialogue',
        countries: ['netherlands', 'belgium'],
        setting: 'coast',
        lines: [
          { speaker: 'belgium', text: 'How do you stay dry?', expression: 'surprised' },
          { speaker: 'netherlands', text: 'Dikes.   Lots of dikes.', expression: 'determined' },
        ],
      },
    ],
    ...overrides,
  } as CreateCountryballsDto;
}
