import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function runVerification() {
  console.log('=== STARTING LOCAL VIDEO RENDER & FFPROBE VALIDATION ===');

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

  // 1. Generate a valid 5-second PCM WAV audio file directly
  const sampleRate = 44100;
  const durationSeconds = 5;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * 2;
  const wavBuffer = Buffer.alloc(44 + dataSize);

  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + dataSize, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20); // PCM
  wavBuffer.writeUInt16LE(1, 22); // Mono
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(sampleRate * 2, 28);
  wavBuffer.writeUInt16LE(2, 32);
  wavBuffer.writeUInt16LE(16, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-((t % 1.5) * 4));
    const sample = Math.sin(2 * Math.PI * 440 * t) * env * 0.2 * 32767;
    wavBuffer.writeInt16LE(Math.floor(sample), 44 + i * 2);
  }

  const audioPath = path.join(outDir, 'sample_audio.wav');
  fs.writeFileSync(audioPath, wavBuffer);
  console.log(`Synthesized valid test audio: ${audioPath} (${fs.statSync(audioPath).size} bytes)`);

  // 2. Render MP4 video via FFmpeg using lavfi color source + text overlays + audio sync
  const videoOutputPath = path.join(outDir, 'sample_verification.mp4');
  if (fs.existsSync(videoOutputPath)) {
    fs.unlinkSync(videoOutputPath);
  }

  const ffmpegArgs = [
    '-f', 'lavfi',
    '-i', 'color=c=0x0b0f17:s=1280x720:r=30:d=5',
    '-i', audioPath,
    '-vf', "drawtext=text='YOUTUBE AUTOMATION STUDIO':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='PHASE 3 VERIFIED RENDER':fontcolor=0x38bdf8:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2+25",
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-y',
    videoOutputPath,
  ];

  console.log(`Executing FFmpeg: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`FFmpeg completed successfully!`);
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

  console.log(`Executing FFprobe validation on ${videoOutputPath}...`);

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
  console.log(`File: ${videoOutputPath}`);
  console.log(`Size: ${sizeBytes} bytes`);
  console.log(`Duration: ${duration}s`);
  console.log(`Video Stream: ${videoStream?.codec_name} (${videoStream?.width}x${videoStream?.height} @ ${videoStream?.r_frame_rate} fps)`);
  console.log(`Audio Stream: ${audioStream?.codec_name} (${audioStream?.duration}s)`);

  if (!videoStream || videoStream.codec_name !== 'h264') {
    throw new Error('Video stream is missing or not H.264');
  }
  if (!audioStream || audioStream.codec_name !== 'aac') {
    throw new Error('Audio stream is missing or not AAC');
  }
  if (duration < 4.0) {
    throw new Error(`Video duration too short: ${duration}s (expected ~5s)`);
  }

  console.log('=== VERIFICATION PASSED: REAL SAMPLE MP4 CREATED AND VALIDATED SUCCESSFULLY ===');
}

runVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
