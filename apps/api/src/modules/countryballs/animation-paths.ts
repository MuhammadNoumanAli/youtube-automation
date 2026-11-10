import * as path from 'path';

/** Reads a setting (ConfigService.get or similar). */
export type SettingReader = (key: string) => string | undefined | null;

/** Root for Countryballs files: ANIMATION_STUDIO_ROOT, else <STORAGE_ROOT>/animation. */
export function animationStudioRoot(get: SettingReader): string {
  const storageRoot = path.resolve(get('STORAGE_ROOT') || 'storage');
  return path.resolve(get('ANIMATION_STUDIO_ROOT') || path.join(storageRoot, 'animation'));
}

/** Where finished Countryballs videos are written (and the only extra folder the preview endpoint may serve). */
export function animationRendersDir(get: SettingReader): string {
  return path.join(animationStudioRoot(get), 'renders', 'countryballs');
}

/** True when target is inside root (not just sharing a name prefix). Case-insensitive on Windows. */
export function isInsideDir(root: string, target: string): boolean {
  const norm = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const rel = path.relative(norm(root), norm(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
