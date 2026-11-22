# Marble race (add-on to apps/animation)

Country marble races in the style of "100 countries, 99 stages, last marble standing". A separate add-on: it does
**not** change any existing file, composition, script or dependency. `render.ps1`, `voice.ps1`, `Root.tsx` and the
voiced/spec videos work exactly as before.

## Easiest: the form

```powershell
powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\race-ui.ps1
```

Your browser opens **Marble Race Maker** (http://127.0.0.1:4600, only on this PC):

1. **Countries**: click to pick any of the 197 (search, filter by continent, select a whole continent, or pick N at
   random). 2 to 197 countries.
2. **Rules**: choose one of
   - *countries out per stage* (e.g. 1 = "last marble standing", the number of stages follows),
   - *number of stages* (eliminations spread evenly),
   - *percent out per stage* (big stages first, tense one-by-one stages at the end).
   The plan box shows the stages, the expected video length and roughly how long rendering takes.
3. Stage types, twists, seed, render speed (workers = CPU cores used; more is faster). **Mixed hurdles** is checked
   by default, so every stage is a fresh 3–5 hurdle course; tick a classic type as well for the odd single-theme
   stage (ramps, pegs, funnels, gates, spinners).
4. **Preview results only** simulates in seconds and shows the winner, top 10 and video length; if you like it,
   click **Looks good: render this video**. Or click **Create video** to do both.
5. Progress, time left, log, and the finished video right in the page. **Stop** any time; **Render / resume** under
   *Recent races* continues where it stopped (finished stages are kept).

Videos: `D:\YouTubeStudio\races\<race>.mp4` (+ report). Keep the PowerShell window open while a video is made.

**Do 170 countries need 170 stages?** No. Only "1 out per stage" needs (countries - 1) stages. 170 countries with
4 out per stage = 43 stages (~15 min video), 10% per stage = 36 stages, or simply ask for 20 stages.

## Command line (Windows)

```powershell
cd D:\wamp64\www\youtube-automation\apps\animation
powershell -ExecutionPolicy Bypass -File scripts\race.ps1                                         # 10 countries, ~1.5 min
powershell -ExecutionPolicy Bypass -File scripts\race.ps1 -Race race\races\world-197.race.json -Concurrency 4
powershell -ExecutionPolicy Bypass -File scripts\race.ps1 -Race race\races\long-58.race.json -SimulateOnly
powershell -ExecutionPolicy Bypass -File scripts\race.ps1 -Only 2        # render only stage 2 as a preview
```

Without PowerShell:

```powershell
node race/simulate.mjs --race race/races/test-10.race.json --out D:\YouTubeStudio\races\test-10 [--seed 7]
node scripts/render-race.mjs --race-dir D:\YouTubeStudio\races\test-10 --out D:\YouTubeStudio\races\test-10.mp4 --concurrency 4
npx remotion studio src/race/index.ts --public-dir D:\YouTubeStudio\races\test-10\replay   # "RaceFull", "RaceFlags"
node --test race/test/                                                                         # 15 tests, under a minute
```

## How it works

1. **Simulate** (`race/simulate.mjs`, plain Node, no dependencies). A small deterministic 2D physics engine
   (`race/physics.mjs`: balls against walls, pegs, spinners and gates) runs the whole tournament and records every
   ball's position for every frame into `<race>\replay\` (`race.json` + one `stage-NNN.json` per stage + the
   project's own synthesised sound kit). **Same race file + same seed = exactly the same race.** Simulating a
   57-stage race takes about 10 seconds.
2. **Render** (`scripts/render-race.mjs` + `src/race/`, its own Remotion entry point). Remotion only *draws* the
   replay. Each segment (intro, every stage, podium) is rendered to its own file in `<race>\segments\`; when all
   exist they are joined with FFmpeg stream copy (seconds, no re-encode). A segment is re-rendered only when its
   replay or the renderer code changed.

On screen: the course, the marbles (flag rolls, eyes stay upright and react: determined, surprised in the danger
zone, happy when through, sad when out), a stage title card, gold/silver/bronze badges for the first three, a live
panel (qualified count, finish order, **danger zone** with the current last places), an ELIMINATED banner, a
champion banner on the last stage, an intro with every competitor, and a podium with a crown. Sounds: gate whoosh,
finish pops, winner ding, elimination sound, podium sparkle (all original, from `voice/sfx.mjs`).

## Race file (`race/races/*.race.json`)

| Field | Meaning |
| --- | --- |
| `id` | lowercase id, used for folder and file names |
| `title` | shown on screen |
| `countries` | `"all"` (197) or a list of ids (see `src/race/countries.json`) |
| `eliminate` | number out per stage (stages follow), a list (one number per stage), or `"auto"` with `stages` |
| `eliminatePercent` | instead: percent of the remaining field out per stage |
| `stages` | with `"auto"`: number of stages (at most countries - 1) |
| `templates` | optional list of stage types, cycled; default is a seeded mix with no repeats in a row |
| `finalTemplate` | course of the last stage; default zigzag (or gates) so the final is a long race |
| `twists` | `{ "pads": true, "bumpers": true, "shortcuts": true }`; set any to false |
| `startOrder` | `"comeback"` (default: last stage's slowest start at the front of the hopper) or `"random"` |
| `seed` | any number or text; change it for a different race with the same settings |
| `courseWidth` | `1` (default, full width) down to `0.5`: squeezes the walls toward the centre and rebuilds every hurdle inside them, so a small field races almost single file |
| `fps`, `ballRadius`, `maxStageSeconds`, `introSeconds`, `podiumSeconds` | optional |

Stage types, all randomised from the seed:

- **`mix` – mixed hurdles (a new course every stage)**: 3–5 rows of obstacles stacked between the hopper and the
  finish, picked from 12 hurdles (`race/bands.mjs`). A hurdle never appears twice in one stage, and the next stage
  skips every hurdle the previous stage used, so the course in front of the viewers is always new. With all types
  allowed, about 85% of stages are mixed.
  - **Seesaws** (green): tilt under the balls that land on them (the first one decides which way), then spring back
  - **Windmills** (blue hub): free paddle wheels spun by the falling balls, which then fling the next balls
  - **Hammers**: two or three swinging pendulums over a ramp; they whack every ball that bounces into them
  - **Conveyor belts**: carry balls to one end and reverse direction every few seconds
  - **Sliders** (purple): slotted floor sliding under the balls; they drop when a slot passes beneath
  - **Double floor**: two sliders stacked, the second moving against the first
  - **Trapdoor floor**: a row of timed hatches that opens in a wave and rains the whole field down
  - **Bumper field**: staggered pinball bumpers that throw balls back up the course
  - **Pinball pegs**, **spinners**, **funnels**, **slides** (with trapdoors and jump pads)
- Classic courses: `zigzag` (switchback ramps), `plinko` (peg board + run-out ramp), `funnels` (three bottlenecks),
  `gates` (ramps with timed red/green gates), `spinners` (rotating bars + run-out ramp). Each template has ten names.

Never the same classic course twice in a row, no stage name repeats in a race, and the grand final runs on a long
zigzag. Every gap is wider than a ball and moving parts never come closer to a wall than a ball's width, so nothing
wedges or gets crushed; this is checked by the tests for 8 to 197 balls.

## Twists and fairness

Marbles bounce livelier off walls and each other, and three twists give the back of the field a real chance:

- **Jump pads** (orange springs) where balls land after dropping off a ramp, on run-out ramps and funnel landings:
  a ball landing on one is launched back up into the crowd, so the order shuffles. Rolling over a pad does nothing.
- **Bumpers** (pink) among plinko pegs kick balls sideways and up.
- **Shortcut trapdoors** (yellow/black) in the middle of ramps open for under a second now and then: whoever is
  rolling over it drops straight to the next ramp.
- **Comeback start**: in the next stage the slowest qualifiers start at the bottom of the hopper (released first)
  and the fastest at the top.

All of it comes from the seed, nothing is aimed at a country. A stage ends when enough marbles have crossed the finish
line; the last ones are out. A marble that has barely moved for 4 seconds gets a small random nudge (rare, counted in
the log). At `maxStageSeconds` (90 s) the rest are ranked by how far down the course they are ("TIME UP"). Pick the
seed before you look at the result if you tell viewers the race is random.

## Countries and flags

197 countries: all 193 UN members plus Kosovo, Palestine, Taiwan and Vatican City. The 60 project characters keep
their flags from `src/engine/characters.ts` (unchanged); the others are in `src/race/countries.json` as simplified
geometric flags (no coats of arms or text, like the existing ones), drawn by `src/race/RaceFlag.tsx`. Check them all
in Remotion Studio: composition **RaceFlags**. To fix a flag, edit its entry in `countries.json`.

## Long videos

- Measured on this PC with the dense new courses at 1080p30 and `-Concurrency 3`: about 2.5–4 frames/s, slower
  while 100 marbles are all on screen. The log prints the real speed and "about N min left" after every stage;
  the form's estimate uses the same numbers.
- Rule of thumb: rendering takes about **6–7× the video length**. A 99-stage, 31-minute episode takes roughly
  3.5 hours; a 3-minute race about 20 minutes. Stopping keeps finished segments, so a long render can be split
  across sessions.
- Disk: about 30 MB per minute of video for the segments, the same again for the joined file
  (1 hour ≈ 4 GB in total). `race.ps1` stops if the studio drive has less than 5 GB free.
- Remotion copies the `replay\` folder into each bundle in the cache, like `render.mjs` does with its audio
  folder; old `bundle-race-*` folders in `D:\YouTubeStudio\cache\remotion` can be removed by hand.

## Limits and next steps

- No music yet: add a licensed track through the existing audio library when wanted.
- Next: the survival-games format (Freeze, Peg Drop, Sumo, Hot Bomb, Penalty Final...) can reuse this physics engine
  and replay renderer.

## Files

```text
race/rng.mjs, physics.mjs, stages.mjs, bands.mjs, simulate.mjs   simulator (plain Node)
race/races/*.race.json                                 example races (test-10, world-58, long-58, world-197)
race/ui/server.mjs, index.html, render-flags.mjs       the form (local web page)
race/test/race.test.mjs                                tests
src/race/                                              Remotion renderer (entry: src/race/index.ts), country catalog
scripts/render-race.mjs, race.ps1, race-ui.ps1         chunked render + join, Windows wrappers
```
