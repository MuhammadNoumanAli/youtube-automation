import * as fs from 'fs';
import * as path from 'path';
import { COUNTRY_IDS, EXPRESSIONS, SCENE_TYPES, VOICES } from './countryballs.catalog';

/**
 * Keeps the form's lists in step with the animation app. Runs when apps/animation sits next to apps/api (the normal
 * repo layout) or ANIMATION_APP_DIR points to it; otherwise it is skipped with a note.
 */
const appDir = process.env.ANIMATION_APP_DIR || path.resolve(__dirname, '..', '..', '..', '..', 'animation');
const present = fs.existsSync(path.join(appDir, 'src', 'engine', 'characters.ts'));
const read = (rel: string) => fs.readFileSync(path.join(appDir, rel), 'utf8');

(present ? describe : describe.skip)(`countryballs catalog matches the animation app (${appDir})`, () => {
  it('every country has a character and map data', () => {
    const characters = read('src/engine/characters.ts');
    const geo = read('src/engine/countries.ts');
    for (const id of COUNTRY_IDS) {
      expect(characters).toMatch(new RegExp(`\\n\\s+${id}: \\{`));
      expect(geo).toMatch(new RegExp(`\\n\\s+${id}: \\{`));
    }
  });

  it('expressions, scene types and voices exist there', () => {
    const expressions = read('src/character/expressions.ts');
    for (const e of EXPRESSIONS) expect(expressions).toContain(`'${e}'`);
    const spec = read('src/engine/spec.ts');
    for (const t of SCENE_TYPES) expect(spec).toContain(`'${t}'`);
    const catalog = read('voice/catalog.mjs');
    for (const v of VOICES) expect(catalog).toContain(`'${v}'`);
  });
});

if (!present) {
  // eslint-disable-next-line no-console
  console.log(`[countryballs.catalog.spec] animation app not found at ${appDir}; sync check skipped`);
}
