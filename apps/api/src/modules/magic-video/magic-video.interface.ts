export interface TimedSubtitleLine {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface GeneratedSceneClip {
  sceneNumber: number;
  durationSeconds: number;
  filePath: string;
  sourceType: 'pexels' | 'local_motion' | 'heygen_avatar' | 'runway_ai';
  searchQuery?: string;
  attribution?: string;
}

export interface MagicGenerationResult {
  project_id: string;
  title: string;
  duration_seconds: number;
  format: 'short' | 'long_form';
  resolution: string;
  render_job_id: string;
  output_video_path: string;
  preview_url: string;
  scene_count: number;
  visual_style: string;
  subtitles_burned: boolean;
}
