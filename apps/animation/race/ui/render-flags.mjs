#!/usr/bin/env node
/**
 * Renders the flag thumbnails for the race form: one PNG with every country's ball, in the order given.
 *   node race/ui/render-flags.mjs --out <file.png> --ids <file with a JSON array of ids> [--cache <dir>] [--browser <chrome>]
 * Called by race/ui/server.mjs once (the result is cached until the country list changes).
 */
import '../../scripts/localhost-ipv4.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderStill, selectComposition } from '@remotion/renderer';

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(here, '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const ids = JSON.parse(fs.readFileSync(args.ids, 'utf8'));
const cacheDir = path.resolve(args.cache ?? path.join(moduleRoot, '.cache'));
const browserExecutable = args.browser ? path.resolve(args.browser) : null;
if (!browserExecutable) await ensureBrowser({ logLevel: 'warn' });
const serveUrl = await bundle({ entryPoint: path.join(moduleRoot, 'src', 'race', 'index.ts'), outDir: path.join(cacheDir, `bundle-flags-${Date.now()}`), onProgress: () => {} });
const inputProps = { ids, cell: 64, cols: 20 };
const composition = await selectComposition({ serveUrl, id: 'RaceFlagSprite', inputProps, browserExecutable, logLevel: 'warn' });
const tmp = `${args.out}.partial.png`;
await renderStill({ composition, serveUrl, inputProps, output: tmp, imageFormat: 'png', browserExecutable, logLevel: 'warn', overwrite: true });
fs.renameSync(tmp, args.out);
console.log(`flags sprite -> ${args.out}`);
