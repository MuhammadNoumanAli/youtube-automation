import * as path from 'path';
import { animationRendersDir, animationStudioRoot, isInsideDir } from './animation-paths';

describe('animation paths', () => {
  const reader = (cfg: Record<string, string>) => (k: string) => cfg[k];

  it('uses ANIMATION_STUDIO_ROOT when set, else <STORAGE_ROOT>/animation', () => {
    expect(animationStudioRoot(reader({ ANIMATION_STUDIO_ROOT: '/studio' }))).toBe(path.resolve('/studio'));
    expect(animationStudioRoot(reader({ STORAGE_ROOT: '/data' }))).toBe(path.resolve('/data/animation'));
    expect(animationRendersDir(reader({ ANIMATION_STUDIO_ROOT: '/studio' }))).toBe(path.resolve('/studio/renders/countryballs'));
  });

  it('isInsideDir accepts files inside and rejects prefixes, parents and traversal', () => {
    const root = path.resolve('/studio/renders/countryballs');
    expect(isInsideDir(root, path.join(root, 'cb-1-9x16.mp4'))).toBe(true);
    expect(isInsideDir(root, path.resolve('/studio/renders/countryballs-evil/x.mp4'))).toBe(false);
    expect(isInsideDir(root, path.join(root, '..', 'secret.mp4'))).toBe(false);
    expect(isInsideDir(root, root)).toBe(false);
    expect(isInsideDir(root, path.resolve('/etc/passwd'))).toBe(false);
  });
});
