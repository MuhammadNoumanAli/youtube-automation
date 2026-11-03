# apps/animation: Countryballs character and scene engine

An isolated Remotion project for original, code-drawn Countryballs videos. It is **not** part of the root npm
workspace install: install it only with `npm ci --workspaces=false` from this folder (the scripts do this), so the
root `package.json` and `package-lock.json` stay untouched.

## Render (Windows)

```powershell
# 30 s demo -> E:\YouTubeStudio\prototype\netherlands-demo.mp4
powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\render.ps1
# any composition
powershell -ExecutionPolicy Bypass -File ...\render.ps1 -Composition Spike -Out E:\YouTubeStudio\spike\spike.mp4
```

Next to the video you get `<name>.report.md`, `<name>.metrics.json`, `<name>.contact-sheet.jpg` (12 stills) and a run log.
The checks are FFprobe (codec, pixel format, size, fps, duration, frame count), FFmpeg `blackdetect` (black frames) and
`freezedetect` (frozen > 2 s). Black and freeze detection need a full FFmpeg on PATH; Remotion's bundled FFmpeg lacks
those filters, so if none is found the report says **NOT RUN**, never PASS. npm cache, temp files and the Remotion
bundle cache live under `E:\YouTubeStudio\`.

## Architecture

```text
src/
  engine/            plain data and logic, no React
    types.ts         scene configuration model (VideoConfig > SceneConfig > background, elements, characters, captions, camera, transition)
    characters.ts    character library (identity, flag spec, accent colour)
    timeline.ts      places scenes on the global timeline (transitions overlap), total duration, config validation
  videos/
    netherlands.ts   "Netherlands Countryball: A Country Fighting the Sea" (30 s, 3 scenes): pure configuration
  render/            React/Remotion renderers that read the configuration
    VideoRenderer.tsx    one <Sequence> per scene, overlapping by the incoming transition
    SceneRenderer.tsx    background (world map or landscape), stage camera, elements, characters, captions, transition in
    CharacterLayer.tsx   keyframes -> rig props: stage or geo position, hops + landing squash, shakes, entry/exit
    elements.tsx         original illustrations: landscape, sun, clouds, windmill, animated sea, dike, wave splash
    Overlay.tsx          captions (narration / speaker) and title cards, outside the camera
  character/
    CountryBall.tsx  original rig: flag clip (h-stripes, v-stripes, nordic-cross, disc), shading, outline, eyes, blink, squash, name label
    expressions.ts   parametric eye shapes: neutral, happy, surprised, angry, sad, determined
  map/WorldMap.tsx   Natural Earth countries via d3-geo Mercator; 1:110m when zoomed out, 1:50m when zoomed in; off-screen culling
  lib/anim.ts        keyframe tracks and easing
  Spike.tsx          the first 10 s render test (kept as a regression check)
  Root.tsx           registers compositions: Spike, NetherlandsDemo (validated at load)
scripts/
  render.mjs / render.ps1          general renderer + checks (use this)
  render-spike.mjs / spike.ps1     original spike runner (unchanged)
```

**Scene configuration model.** A video is `VideoConfig { characters, scenes[] }`. Each `SceneConfig` has:

- `durationInFrames`.
- `background`: a world map with camera keyframes and highlights, or a landscape.
- `elements[]`: sun, cloud, windmill, sea, dike, splash, title.
- `characters[]`: reference, stage or geo position tracks, radius, rotation, scale, expressions, eye look, hops,
  shakes, entry/exit, name label.
- `captions[]`: narration or speaker lines.
- `camera`: zoom/pan keyframes.
- `transitionOut`: `crossfade`, `wipe-left` or `iris`.

All frames are local to the scene. The configuration is plain serialisable data, so the backend can later store,
validate and generate it without touching any React code.

**Adding a new video.** Add a file under `src/videos/` that exports a `VideoConfig`, then register it in `Root.tsx`.
For a voiced video, add a `<name>.voice.json` next to it (see Voice below).
Add new characters to `engine/characters.ts`.

## Licences

- Remotion: free licence for individuals and teams of up to 3 people (https://www.remotion.dev/docs/license/faq).
  No licence key is passed, so no usage telemetry is sent, and Remotion prints a reminder warning.
- Natural Earth: public domain. world-atlas, topojson-client and d3-geo: ISC. React: MIT.
- Characters, flags, windmill, sea, dike and all animation are original code in this folder.
- Captions use system fonts (Segoe UI or Arial on Windows); no font files are bundled.

## Voice (Phase 3)

Dialogue audio is generated **before** rendering, one WAV per line, by `voice/` (plain Node, never bundled into
Remotion). It uses the **existing** sherpa-onnx 1.13.8 runtime and local models; nothing is installed or downloaded,
and `package.json` / `package-lock.json` are unchanged.

| What | Default location | Override |
| --- | --- | --- |
| sherpa-onnx runtime (version + native file checksums verified on start) | `E:\YouTubeStudio\runtime\sherpa-onnx` | `TTS_RUNTIME_DIR` |
| Kokoro v1.0 (primary) | `D:\YouTubeStudio\models\tts\kokoro-multi-lang-v1_0` | `TTS_KOKORO_DIR` |
| Piper `en_US-ljspeech-high`, `en_US-libritts-high` (fallback) | `D:\YouTubeStudio\models\tts\piper` | `TTS_PIPER_DIR` |
| Cache, per-video audio and manifests | `D:\YouTubeStudio\audio` | `TTS_AUDIO_ROOT` |

```powershell
# once: copy the Piper voices E: -> D: (checksums verified; E: originals untouched)
powershell -ExecutionPolicy Bypass -File scripts\copy-piper-to-d.ps1
# engine check: Kokoro, both Piper voices, a forced fallback, cache hits
powershell -ExecutionPolicy Bypass -File scripts\voice.ps1 -Smoke
# generate the Netherlands dialogue, then render it with audio
powershell -ExecutionPolicy Bypass -File scripts\voice.ps1 -Video NetherlandsVoiced
powershell -ExecutionPolicy Bypass -File scripts\render.ps1 -Composition NetherlandsVoiced `
  -Out E:\YouTubeStudio\prototype\netherlands-voiced.mp4 -AudioDir D:\YouTubeStudio\audio\videos\NetherlandsVoiced
# unit tests (no models needed)
node --test "voice/test/*.test.mjs"
```

**How it works**

- A *voice script* (`src/videos/<name>.voice.json`) lists the lines (id, scene, speaker, text, earliest frame `at`)
  and assigns a voice per speaker: `{ "engine": "kokoro", "voice": "af_heart" }` or
  `{ "engine": "piper", "model": "en_US-libritts-high", "speaker": 92 }`, with optional `speed` and `fallback` list.
- Fallback per line: assigned voice, then the script's fallbacks, then Piper libritts (a fixed speaker per
  character), then Piper ljspeech. A Kokoro crash, load failure, error, empty or too-short audio triggers it; each
  engine runs in its own child process so a native crash cannot stop the run. The manifest records why.
- Cache key = text + engine + model checksum + speaker + speed + settings + runtime version. The video format is not
  part of it, so 16:9 and 9:16 versions share the same audio.
- Durations are read from the WAV files. `src/engine/dialogue.ts` places each line at its real length, generates the
  captions from those timings and lengthens a scene when its dialogue needs more time (never shortens it).
- `voice-manifest.json` stores, per line: file, duration, sample rate, engine, model + checksum, speaker id and name,
  language, licence, attribution, cache and fallback information.
- `render.mjs --audio-dir` refuses to render if the manifest is incomplete or the voice script changed afterwards.

**Voice licences.** Kokoro-82M weights: Apache-2.0. Piper `en_US-libritts-high`: CC BY 4.0, so **attribution is
required** in the video description (the manifest and render report print the exact line). Piper
`en_US-ljspeech-high`: public domain. The Lessac voices are research-only and are not in the catalogue. The sherpa
1.13.8 runtime contains espeak-ng (GPL-3.0): fine as a local tool; never distribute this module or its runtime.

## Known caveat

The root `package.json` declares `"workspaces": ["apps/*"]`, which matches this folder. A plain `npm install` in the
**repository root** would add this module to the root lockfile. Do not run root installs until that is decided.
