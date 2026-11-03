/**
 * Checks before anything is synthesised:
 *  - the existing sherpa-onnx runtime is the expected version and its native files are unchanged
 *  - each model's files exist and its main .onnx matches the recorded SHA-256
 *
 * Model hashes are slow on large files (Kokoro is 325 MB), so a verified result is remembered in
 * <audioRoot>/.verified-models.json keyed by path + size + modification time. Change any of those and the file
 * is hashed again. Nothing in the model or runtime folders is ever written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EXPECTED_RUNTIME } from './config.mjs';
import { MODELS } from './catalog.mjs';
import { sha256File } from './hash.mjs';

export function verifyRuntime(cfg) {
  const pkgFile = path.join(cfg.runtimeDir, 'node_modules', EXPECTED_RUNTIME.package, 'package.json');
  if (!fs.existsSync(pkgFile)) throw new Error(`sherpa-onnx runtime not found: ${pkgFile}`);
  const version = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).version;
  if (version !== EXPECTED_RUNTIME.version)
    throw new Error(`sherpa-onnx-node ${version} found, ${EXPECTED_RUNTIME.version} expected (${pkgFile})`);
  const checked = [];
  if (cfg.verifyRuntime && process.platform === 'win32') {
    for (const [file, expected] of Object.entries(EXPECTED_RUNTIME.sha256)) {
      const p = path.join(cfg.runtimeDir, EXPECTED_RUNTIME.nativeDir, file);
      if (!fs.existsSync(p)) throw new Error(`runtime file missing: ${p}`);
      const got = sha256File(p);
      if (got !== expected) throw new Error(`runtime file changed: ${p}\n  got      ${got}\n  expected ${expected}`);
      checked.push(file);
    }
  }
  return { package: EXPECTED_RUNTIME.package, version, dir: cfg.runtimeDir, nativeFilesVerified: checked.length };
}

function stampFile(cfg) {
  return path.join(cfg.audioRoot, '.verified-models.json');
}
function readStamps(cfg) {
  try {
    return JSON.parse(fs.readFileSync(stampFile(cfg), 'utf8'));
  } catch {
    return {};
  }
}

/** Returns the absolute file paths for a model, or throws with the reason (missing file, checksum mismatch). */
export function verifyModel(cfg, modelId, { lexicon } = {}) {
  const model = MODELS[modelId];
  if (!model) throw new Error(`unknown model ${modelId}`);
  const dir = model.dir(cfg);
  const files = Object.fromEntries(Object.entries(model.files).map(([k, f]) => [k, path.join(dir, f)]));
  if (lexicon) files.lexicon = path.join(dir, lexicon);
  for (const [k, p] of Object.entries(files)) {
    if (!fs.existsSync(p)) throw new Error(`model ${modelId}: ${k} not found at ${p}`);
  }
  const stamps = readStamps(cfg);
  let changed = false;
  for (const [file, expected] of Object.entries(model.sha256)) {
    const p = path.join(dir, file);
    const st = fs.statSync(p);
    const id = `${p}|${st.size}|${Math.round(st.mtimeMs)}`;
    if (stamps[id] === expected) continue;
    const got = sha256File(p);
    if (got !== expected) throw new Error(`model ${modelId}: checksum mismatch for ${p}\n  got      ${got}\n  expected ${expected}`);
    stamps[id] = expected;
    changed = true;
  }
  if (changed) {
    fs.mkdirSync(cfg.audioRoot, { recursive: true });
    fs.writeFileSync(stampFile(cfg), JSON.stringify(stamps, null, 2));
  }
  return { dir, files, sha256: Object.values(model.sha256)[0] };
}
