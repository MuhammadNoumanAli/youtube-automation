import type { SceneConfig, VideoConfig } from './types';

export interface PlacedScene {
  scene: SceneConfig;
  index: number;
  /** Global frame where this scene starts. */
  start: number;
  /** Frames of overlap with the previous scene (incoming transition length). */
  transitionIn: { type: NonNullable<SceneConfig['transitionOut']>['type']; durationInFrames: number } | null;
}

/** Places scenes on the global timeline. Each outgoing transition overlaps the next scene's start. */
export function placeScenes(video: VideoConfig): PlacedScene[] {
  const placed: PlacedScene[] = [];
  let cursor = 0;
  video.scenes.forEach((scene, index) => {
    const prev = index > 0 ? video.scenes[index - 1] : null;
    const overlap = prev?.transitionOut?.durationInFrames ?? 0;
    const start = index === 0 ? 0 : cursor - overlap;
    placed.push({
      scene,
      index,
      start,
      transitionIn: prev?.transitionOut && overlap > 0 ? { type: prev.transitionOut.type, durationInFrames: overlap } : null,
    });
    cursor = start + scene.durationInFrames;
  });
  return placed;
}

export function totalDuration(video: VideoConfig): number {
  const placed = placeScenes(video);
  const last = placed[placed.length - 1];
  return last ? last.start + last.scene.durationInFrames : 0;
}

/** Structural checks. Returns a list of human-readable problems (empty = valid). */
export function validateVideo(video: VideoConfig): string[] {
  const problems: string[] = [];
  const ids = new Set(video.characters.map((c) => c.id));
  video.scenes.forEach((s, i) => {
    const where = `scene ${i + 1} (${s.id})`;
    if (s.durationInFrames <= 0) problems.push(`${where}: duration must be > 0`);
    if (s.transitionOut && s.transitionOut.durationInFrames >= s.durationInFrames)
      problems.push(`${where}: transition longer than scene`);
    if (i === video.scenes.length - 1 && s.transitionOut) problems.push(`${where}: last scene cannot have transitionOut`);
    s.characters.forEach((c) => {
      if (!ids.has(c.ref)) problems.push(`${where}: unknown character "${c.ref}"`);
      if (c.expressions.length === 0) problems.push(`${where}: character "${c.ref}" has no expression keys`);
    });
    s.captions.forEach((cap) => {
      if (cap.from >= cap.to) problems.push(`${where}: caption "${cap.text}" ends before it starts`);
      if (cap.to > s.durationInFrames) problems.push(`${where}: caption "${cap.text}" runs past the scene end`);
      if (cap.speaker && !ids.has(cap.speaker)) problems.push(`${where}: caption speaker "${cap.speaker}" unknown`);
      if (cap.text.length > 90) problems.push(`${where}: caption too long for 2 lines (${cap.text.length} chars)`);
    });
  });
  return problems;
}
