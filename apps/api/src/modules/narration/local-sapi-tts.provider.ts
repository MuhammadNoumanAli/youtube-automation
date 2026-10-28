import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SynthesizedAudioResult, TextToSpeechProvider } from './tts.provider';

export function extractSpokenText(rawScript: string): string {
  if (!rawScript) return '';
  return rawScript
    // Remove markdown code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove markdown headers (# Header)
    .replace(/^#+\s+.*$/gm, '')
    // Remove bracketed sections like [SECTION 1: ...], [HOOK], [OUTRO], etc.
    .replace(/\[[^\]]*\]/g, '')
    // Remove parenthesis cues like (Visual cue: ...) or (SFX: ...)
    .replace(/\((?:Visual|SFX|Sound|Music|Cut|Zoom|Pause)[^)]*\)/gi, '')
    // Remove explicit line labels like "Visual:", "Narration:", "Host:"
    .replace(/^(?:Visual|Narration|Voiceover|Host|Speaker\s*\d*):/gim, '')
    // Remove markdown bold/italics/code marks
    .replace(/[*_~`]/g, '')
    // Normalize line breaks and multiple spaces
    .replace(/\r?\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

@Injectable()
export class LocalSapiTtsProvider implements TextToSpeechProvider {
  readonly providerName = 'windows_sapi';
  private readonly logger = new Logger(LocalSapiTtsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private getFfprobePath(): string {
    const configured = this.configService.get<string>('FFPROBE_PATH');
    if (configured && fs.existsSync(configured)) {
      return configured;
    }
    try {
      const ffprobeStatic = require('ffprobe-static');
      if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
        return ffprobeStatic.path;
      }
    } catch {
      // Ignore static require error
    }
    return 'ffprobe';
  }

  async probeDuration(filePath: string): Promise<number> {
    const ffprobePath = this.getFfprobePath();
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      filePath,
    ];

    return new Promise((resolve) => {
      const proc = spawn(ffprobePath, args, { windowsHide: true });
      let stdout = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const parsed = JSON.parse(stdout);
            const duration = parseFloat(parsed.format?.duration || '0');
            if (duration > 0) return resolve(Math.round(duration * 100) / 100);
          } catch {
            // Ignore parse errors, fallback below
          }
        }
        // Fallback: estimate based on 22050Hz 16-bit mono wav (approx 44100 bytes/sec)
        try {
          const stats = fs.statSync(filePath);
          const estimated = Math.max(3, Math.round((stats.size - 44) / 44100));
          resolve(estimated);
        } catch {
          resolve(5);
        }
      });
      proc.on('error', () => resolve(5));
    });
  }

  async synthesize(
    text: string,
    outputPath: string,
    options?: { voiceId?: string; speed?: number },
  ): Promise<SynthesizedAudioResult> {
    const spokenText = extractSpokenText(text);
    if (!spokenText) {
      throw new InternalServerErrorException('Script does not contain any spoken narration text.');
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write spoken text to a temporary UTF-8 file to avoid shell escaping issues
    const tempTextPath = path.join(dir, `temp_speech_${crypto.randomUUID()}.txt`);
    fs.writeFileSync(tempTextPath, spokenText, { encoding: 'utf8' });

    // Select voice: default to Microsoft David Desktop or Microsoft Zira Desktop
    const requestedVoice = options?.voiceId || this.configService.get<string>('TTS_VOICE', 'Microsoft David Desktop');
    const speedRate = typeof options?.speed === 'number' ? options.speed : 0; // -10 to 10 in SAPI

    // Safe PowerShell script block executed via child_process.spawn
    const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$targetVoice = '${requestedVoice.replace(/'/g, "''")}'
if ($targetVoice -ne '') {
    try { $synth.SelectVoice($targetVoice) } catch {
        Write-Warning "Voice '$targetVoice' not found, using default system voice."
    }
}
$synth.Rate = ${speedRate}
$text = [System.IO.File]::ReadAllText('${tempTextPath.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)
$synth.SetOutputToWaveFile('${outputPath.replace(/'/g, "''")}')
$synth.Speak($text)
$synth.Dispose()
`;

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
          windowsHide: true,
        });

        let stderr = '';
        proc.stderr.on('data', (d) => (stderr += d.toString()));
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 100) {
            resolve();
          } else {
            reject(new Error(`PowerShell SAPI speech synthesis failed (code ${code}): ${stderr}`));
          }
        });
      });

      const actualDuration = await this.probeDuration(outputPath);
      this.logger.log(`Synthesized local spoken narration via SAPI: "${outputPath}" (${actualDuration}s)`);

      return {
        filePath: outputPath,
        durationSeconds: actualDuration,
        format: 'wav',
        provider: 'windows_sapi',
      };
    } finally {
      // Always cleanup temporary text file
      if (fs.existsSync(tempTextPath)) {
        try {
          fs.unlinkSync(tempTextPath);
        } catch {
          // ignore cleanup error
        }
      }
    }
  }
}
