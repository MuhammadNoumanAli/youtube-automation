import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SynthesizedAudioResult, TextToSpeechProvider } from './tts.provider';

@Injectable()
export class MockTtsProvider implements TextToSpeechProvider {
  readonly providerName = 'mock';

  async synthesize(
    text: string,
    outputPath: string,
    options?: { voiceId?: string; speed?: number },
  ): Promise<SynthesizedAudioResult> {
    // Estimate duration based on word count (approx 135 words per minute)
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const estimatedSeconds = Math.max(5, Math.min(600, Math.round((words / 135) * 60)));
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * estimatedSeconds);
    const dataSize = numSamples * 2; // 16-bit mono

    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Chunk size
    buffer.writeUInt16LE(1, 20); // AudioFormat PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
    buffer.writeUInt16LE(2, 32); // BlockAlign
    buffer.writeUInt16LE(16, 34); // BitsPerSample

    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Generate gentle periodic chime
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Pulse tone at start of each 2-second sentence phrase
      const env = Math.exp(-((t % 2.0) * 3));
      const sample = Math.sin(2 * Math.PI * 261.63 * t) * env * 0.15 * 32767; // Middle C
      buffer.writeInt16LE(Math.floor(sample), 44 + i * 2);
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, buffer);

    return {
      filePath: outputPath,
      durationSeconds: estimatedSeconds,
      format: 'wav',
      provider: 'mock',
    };
  }
}
