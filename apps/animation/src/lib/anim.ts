import { Easing, interpolate } from 'remotion';

export type EaseName = 'linear' | 'inOutCubic' | 'outCubic' | 'inOutSine' | 'outBack';

export const EASE: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  inOutCubic: Easing.inOut(Easing.cubic),
  outCubic: Easing.out(Easing.cubic),
  inOutSine: Easing.inOut(Easing.sin),
  outBack: Easing.out(Easing.back(1.4)),
};

export interface Keyframe<T> {
  frame: number;
  value: T;
  /** Easing used on the segment that ENDS at this keyframe. */
  ease?: EaseName;
}

/** Interpolates a numeric keyframe track. Holds the first/last value outside the range. */
export function track(frame: number, keys: Keyframe<number>[]): number {
  if (keys.length === 0) return 0;
  if (frame <= keys[0].frame) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (frame <= b.frame) {
      return interpolate(frame, [a.frame, b.frame], [a.value, b.value], {
        easing: EASE[b.ease ?? 'inOutCubic'],
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
  }
  return keys[keys.length - 1].value;
}

/** Step track for discrete values (e.g. expressions). Returns current and previous value plus blend 0..1. */
export function stepTrack<T>(
  frame: number,
  keys: Keyframe<T>[],
  crossFadeFrames = 4,
): { current: T; previous: T; blend: number } {
  let idx = 0;
  for (let i = 0; i < keys.length; i++) {
    if (frame >= keys[i].frame) idx = i;
  }
  const current = keys[idx].value;
  const previous = keys[Math.max(0, idx - 1)].value;
  const since = frame - keys[idx].frame;
  const blend = idx === 0 ? 1 : Math.min(1, Math.max(0, since / crossFadeFrames));
  return { current, previous, blend };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
