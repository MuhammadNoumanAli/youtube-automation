import { SceneItem, VideoMetadataPayload } from '../../database/entities/script.entity';

export interface GenerateScriptInput {
  topic: string;
  targetAudience?: string;
  niche?: string;
  targetDurationSeconds?: number;
  format?: 'long_form' | 'short';
  keyPoints?: string[];
  tone?: string;
}

export interface GeneratedScriptOutput {
  title: string;
  hook: string;
  content: string;
  outline: string[];
  scenePlan: SceneItem[];
  metadata: VideoMetadataPayload;
  provider: string;
  model: string;
}

export interface TextGenerationProvider {
  readonly providerName: string;
  generateScript(input: GenerateScriptInput): Promise<GeneratedScriptOutput>;
  generateScenePlan(scriptContent: string, targetDurationSeconds: number): Promise<SceneItem[]>;
  generateMetadata(title: string, scriptContent: string): Promise<VideoMetadataPayload>;
}
