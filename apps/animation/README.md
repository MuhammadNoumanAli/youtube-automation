# apps/animation: Countryballs animation module (render spike)

An isolated Remotion project. It does **not** belong to the root npm workspace install. Install it only with
`npm ci --workspaces=false` from this folder, so the root `package.json` and `package-lock.json` stay untouched.

## Run the spike (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\spike.ps1
# benchmark several concurrency levels:
powershell -ExecutionPolicy Bypass -File ...\spike.ps1 -Concurrency "1,2,3"
```

Outputs go to `E:\YouTubeStudio\spike\`: `spike.mp4`, `metrics.json`, `report.md`, and `run-<time>.log`.
The npm cache, temp files and the Remotion bundle cache live under `E:\YouTubeStudio\`. Nothing is written to C:.

## What is in it

| Path | Purpose |
| --- | --- |
| `src/Root.tsx` | Registers the `Spike` composition (300 frames, 1920x1080, 30 fps) |
| `src/Spike.tsx` | Camera, character route, expression and highlight keyframes |
| `src/character/CountryBall.tsx` | Original code-drawn Countryball rig: flag clip, shading, outline, eyes, seeded blink, squash, hop, shadow |
| `src/character/expressions.ts` | Parametric eye shapes (neutral, happy, surprised, angry, sad, determined) |
| `src/map/WorldMap.tsx` | Natural Earth 1:50m countries (via `world-atlas`) drawn with `d3-geo` Mercator; animated camera; region highlight |
| `src/lib/anim.ts` | Keyframe tracks and easing |
| `scripts/render-spike.mjs` | Bundle, render, FFprobe verification, metrics, report |
| `scripts/spike.ps1` | Windows runner: checks, E: paths, isolated install, render, git status |

## Licences

- Remotion: free licence for individuals and teams of up to 3 people (https://www.remotion.dev/docs/license/faq).
  No licence key is passed, so no usage telemetry is sent, and Remotion prints a reminder warning.
- Natural Earth: public domain. world-atlas, topojson-client and d3-geo: ISC. React: MIT.
- The Countryball character, flag rendering and animation are original code in this folder.

## Known caveat

The root `package.json` declares `"workspaces": ["apps/*"]`, which matches this folder. If someone runs a plain
`npm install` in the **repository root**, npm will add this module to the root lockfile and install its
dependencies at the root. Until a decision is made, do not run root installs, or move this module out of the
`apps/*` glob. Changing the root `package.json` requires approval.

## Preview while editing

```powershell
cd D:\wamp64\www\youtube-automation\apps\animation
$env:TEMP="E:\YouTubeStudio\tmp"; $env:TMP=$env:TEMP
npx remotion studio src/index.ts
```
