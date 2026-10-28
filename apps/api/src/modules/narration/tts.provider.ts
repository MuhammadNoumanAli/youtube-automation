export interface SynthesizedAudioResult {
  filePath: string;
  durationSeconds: number;
  format: 'wav' | 'aac' | 'mp3';
  provider: string;
}

export interface TextToSpeechProvider {
  readonly providerName: string;
  synthesize(
    text: string,
    outputPath: string,
    options?: { voiceId?: string; speed?: number },
  ): Promise<SynthesizedAudioResult>;
}
