import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { LocalSapiTtsProvider } from '../src/modules/narration/local-sapi-tts.provider';
import { ConfigService } from '@nestjs/config';

async function runVerification() {
  console.log('=== STARTING LOCAL VIDEO RENDER & FFPROBE VALIDATION WITH NATURAL SPOKEN SPEECH ===');

  const ffmpegPath = 'C:\\WINDOWS\\system32\\ffmpeg.exe';
  const ffprobeStatic = require('ffprobe-static');
  const ffprobePath = ffprobeStatic.path;

  console.log(`FFmpeg binary path: ${ffmpegPath}`);
  console.log(`FFprobe binary path: ${ffprobePath}`);

  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg binary not found at ${ffmpegPath}`);
  }
  if (!fs.existsSync(ffprobePath)) {
    throw new Error(`FFprobe binary not found at ${ffprobePath}`);
  }

  // Ensure output directory exists
  const outDir = path.resolve(__dirname, '../storage/renders');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Synthesize natural spoken voiceover from an original short script using LocalSapiTtsProvider
  const originalScript = `
# YouTube Automation Studio
[SECTION 1: INTRODUCTION & DEMO]
Welcome to YouTube Automation Studio!
(Visual cue: System dashboard overview)
In this demonstration, our local video rendering pipeline synchronizes clear spoken narration with visual text overlays.
Everything is processed offline using local tools without requiring any paid third-party APIs.
[OUTRO]
Thank you for reviewing, and enjoy creating original content!
`;

  console.log('--- ORIGINAL SCRIPT FOR SPOKEN NARRATION ---');
  console.log(originalScript.trim());

  const audioPath = path.join(outDir, 'sample_spoken_narration.wav');
  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }

  const mockConfigService = {
    get: (key: string, def?: any) => {
      if (key === 'FFPROBE_PATH') return ffprobePath;
      if (key === 'TTS_VOICE') return 'Microsoft David Desktop';
      return def;
    },
  } as unknown as ConfigService;

  const ttsProvider = new LocalSapiTtsProvider(mockConfigService);
  console.log(`Synthesizing spoken audio via provider: ${ttsProvider.providerName}...`);

  const ttsResult = await ttsProvider.synthesize(originalScript, audioPath, {
    voiceId: 'Microsoft David Desktop',
    speed: 0,
  });

  console.log(`Synthesized spoken voiceover file: ${ttsResult.filePath}`);
  console.log(`Voiceover duration: ${ttsResult.durationSeconds}s, format: ${ttsResult.format}, size: ${fs.statSync(audioPath).size} bytes`);

  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 1000) {
    throw new Error('Synthesized audio file is missing or contains no audio data');
  }

  const audioDuration = ttsResult.durationSeconds;
  if (audioDuration < 5.0) {
    throw new Error(`Spoken audio duration unexpectedly short (${audioDuration}s). Speech might be truncated.`);
  }

  // 2. Render MP4 video via FFmpeg using lavfi color source + text overlays + synchronized spoken audio
  const videoOutputPath = path.join(outDir, 'sample_verification.mp4');
  if (fs.existsSync(videoOutputPath)) {
    fs.unlinkSync(videoOutputPath);
  }

  // Render video slightly longer than audio so -shortest cleanly clamps to audio duration
  const canvasDuration = Math.ceil(audioDuration) + 1;

  const ffmpegArgs = [
    '-f', 'lavfi',
    '-i', `color=c=0x0b0f17:s=1280x720:r=30:d=${canvasDuration}`,
    '-i', audioPath,
    '-vf', "drawtext=text='YOUTUBE AUTOMATION STUDIO':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=text='NATURAL SPOKEN SPEECH VERIFIED':fontcolor=0x38bdf8:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2+25,drawtext=text='OFFLINE SAPI TTS SYNCHRONIZED':fontcolor=0x22c55e:fontsize=16:x=(w-text_w)/2:y=(h-text_h)/2+70",
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-y',
    videoOutputPath,
  ];

  console.log(`Executing FFmpeg command:\n${ffmpegPath} ${ffmpegArgs.join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('FFmpeg render completed successfully!');
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });
  });

  // 3. Technical validation with FFprobe
  const ffprobeArgs = [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_name,codec_type,width,height,r_frame_rate,duration',
    '-show_entries', 'format=duration,size,format_name',
    '-of', 'json',
    videoOutputPath,
  ];

  console.log(`Executing FFprobe technical validation on ${videoOutputPath}...`);

  const probeOutput = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffprobePath, ffprobeArgs, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`FFprobe exited with code ${code}: ${stderr}`));
      }
    });
  });

  const parsed = JSON.parse(probeOutput);
  console.log('FFprobe Raw Metadata:', JSON.stringify(parsed, null, 2));

  const videoStream = parsed.streams?.find((s: any) => s.codec_type === 'video');
  const audioStream = parsed.streams?.find((s: any) => s.codec_type === 'audio');
  const duration = parseFloat(parsed.format?.duration || '0');
  const sizeBytes = parseInt(parsed.format?.size || '0', 10);

  console.log('--- TECHNICAL VALIDATION RESULTS ---');
  console.log(`Output File: ${videoOutputPath}`);
  console.log(`Size: ${sizeBytes} bytes (${Math.round(sizeBytes / 1024)} KB)`);
  console.log(`Duration: ${duration}s (narration was ${audioDuration}s)`);
  console.log(`Video Stream: ${videoStream?.codec_name} (${videoStream?.width}x${videoStream?.height} @ ${videoStream?.r_frame_rate} fps)`);
  console.log(`Audio Stream: ${audioStream?.codec_name} (${audioStream?.duration}s)`);

  if (!videoStream || videoStream.codec_name !== 'h264') {
    throw new Error('Video stream is missing or not H.264');
  }
  if (!audioStream || audioStream.codec_name !== 'aac') {
    throw new Error('Audio stream is missing or not AAC');
  }
  if (Math.abs(duration - audioDuration) > 1.5) {
    throw new Error(`Video duration (${duration}s) does not match audio duration (${audioDuration}s)`);
  }

  console.log('=== VERIFICATION PASSED: REAL SAMPLE MP4 CREATED AND VALIDATED WITH SPOKEN SPEECH NARRATION ===');
}

runVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
