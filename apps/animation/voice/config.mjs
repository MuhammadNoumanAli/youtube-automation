/**
 * Voice generation settings. Every path can be overridden with an environment variable; the defaults are the
 * locations verified in Stage 0 (3 Nov 2026). Nothing here downloads or installs anything.
 *
 *   TTS_RUNTIME_DIR   existing sherpa-onnx runtime folder (default: D:\\YouTubeStudio\\runtime\\sherpa-onnx if copied there,
 *                     else E:\\YouTubeStudio\\runtime\\sherpa-onnx)
 *   TTS_KOKORO_DIR    Kokoro v1.0 model folder (primary: internal SSD)
 *   TTS_PIPER_DIR     folder holding en_US-ljspeech-high/ and en_US-libritts-high/
 *   TTS_AUDIO_ROOT    where generated audio, the cache and manifests are written
 *   TTS_THREADS       onnxruntime threads per engine (default 2)
 *   TTS_RUNTIME_VERIFY=0  skip the runtime file checksum check (not recommended)
 */
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;
const win = process.platform === 'win32';

function defaultRuntimeDir() {
  const internal = 'D:\\YouTubeStudio\\runtime\\sherpa-onnx';
  return fs.existsSync(path.join(internal, 'node_modules', 'sherpa-onnx-node', 'package.json')) ? internal : 'E:\\YouTubeStudio\\runtime\\sherpa-onnx';
}

export function loadConfig(overrides = {}) {
  const base = {
    // Prefer the verified copy on the internal drive (scripts/copy-runtime-to-d.ps1), else the original on E:.
    runtimeDir: env.TTS_RUNTIME_DIR || (win ? defaultRuntimeDir() : '/opt/sherpa-onnx'),
    kokoroDir: env.TTS_KOKORO_DIR || (win ? 'D:\\YouTubeStudio\\models\\tts\\kokoro-multi-lang-v1_0' : '/opt/models/kokoro-multi-lang-v1_0'),
    piperDir: env.TTS_PIPER_DIR || (win ? 'D:\\YouTubeStudio\\models\\tts\\piper' : '/opt/models/piper'),
    audioRoot: env.TTS_AUDIO_ROOT || (win ? 'D:\\YouTubeStudio\\audio' : path.resolve('audio')),
    threads: Math.max(1, parseInt(env.TTS_THREADS || '2', 10) || 2),
    verifyRuntime: env.TTS_RUNTIME_VERIFY !== '0',
    /** Engines replaced by in-process test doubles (tests and --fake only). */
    fake: null,
  };
  return { ...base, ...overrides };
}

/** The runtime that Stage 0 verified. A different version or changed native file stops generation. */
export const EXPECTED_RUNTIME = {
  package: 'sherpa-onnx-node',
  version: '1.13.8',
  nativeDir: path.join('node_modules', 'sherpa-onnx-win-x64'),
  sha256: {
    'sherpa-onnx.node': 'f5fd562bdc4bea167eee8ac981c6acd88c05cc8d2792b67d8951566818e293ca',
    'onnxruntime.dll': '7f66f939a881baf4f46a2216496798edf4a1429878b646d12674aa62f27d8a25',
    'sherpa-onnx-c-api.dll': 'b0801cd8eeead83213c60b92cc004de6f3ac4cd4a9ac7c388c16b97c590f1e99',
    'sherpa-onnx-cxx-api.dll': 'e709c46a63e4b84f3862aa0c843a804040b42ea054a398b420142f6c8e58ec77',
    'onnxruntime_providers_shared.dll': '551d0e1fe4c227d8542314ba718d52f4379e0c7bfe729a37c59833a884e27b4d',
  },
};

/** Bump when the audio format or synthesis settings change in a way that should invalidate cached lines. */
export const CACHE_VERSION = 1;

/** Silence between sentences inside one line (sherpa GenerationConfig.silenceScale). */
export const DEFAULT_SILENCE_SCALE = 0.2;
