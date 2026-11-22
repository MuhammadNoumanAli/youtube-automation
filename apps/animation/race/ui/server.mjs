#!/usr/bin/env node
/**
 * Marble race form: pick countries and rules in the browser, then simulate + render the video.
 *
 *   node race/ui/server.mjs [--studio E:\YouTubeStudio] [--port 4600] [--browser <chrome>]
 *   then open http://127.0.0.1:4600   (scripts\race-ui.ps1 does both)
 *
 * Plain Node (no extra dependencies), listens on this computer only (127.0.0.1). Runs one job at a time:
 * race/simulate.mjs, then scripts/render-race.mjs, exactly as on the command line. Everything goes into
 * <studio>\races\<race id>\ (race file, replay, segments) and <studio>\races\<race id>.mp4. Never deletes files.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { countryCatalog, knownCharacterIds, loadRace, planEliminations } from '../simulate.mjs';
import { TEMPLATES } from '../stages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(here, '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const defaultStudio = () => {
  if (process.platform === 'win32') for (const d of ['E:\\YouTubeStudio', 'D:\\YouTubeStudio']) if (fs.existsSync(d.slice(0, 3))) return d;
  return path.join(os.homedir(), 'YouTubeStudio');
};
const studio = path.resolve(args.studio ?? process.env.RACE_STUDIO ?? defaultStudio());
const racesDir = path.join(studio, 'races');
const cacheDir = path.join(studio, 'cache', 'remotion');
const browser = args.browser ?? process.env.RACE_BROWSER ?? null;
const port = parseInt(args.port ?? '4600', 10);
const instanceId = crypto.randomUUID().slice(0, 8); // lets an open page notice that the server was restarted
const tmpDir = path.join(studio, 'tmp'); // Remotion/FFmpeg scratch: keep it off the system drive, which is often full
fs.mkdirSync(racesDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });
const childEnv = { ...process.env, FORCE_COLOR: '0', TEMP: tmpDir, TMP: tmpDir, TMPDIR: tmpDir };

// ------------------------------------------------------------------ countries + flag thumbnails
const catalog = countryCatalog();
const ids = knownCharacterIds();
const byId = Object.fromEntries(catalog.map((c) => [c.id, c]));
const countries = ids.map((id, i) => ({ id, name: byId[id]?.name ?? id, continent: byId[id]?.continent ?? 'Other', sprite: i }));
const spriteHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(ids) + fs.readFileSync(path.join(moduleRoot, 'src', 'race', 'countries.json')) + fs.readFileSync(path.join(moduleRoot, 'src', 'engine', 'characters.ts')))
  .digest('hex')
  .slice(0, 12);
const spriteFile = path.join(cacheDir, `race-flags-${spriteHash}.png`);
let spriteState = fs.existsSync(spriteFile) ? 'ready' : 'rendering';
if (spriteState === 'rendering') {
  const idsFile = path.join(cacheDir, `race-flags-${spriteHash}.json`);
  fs.writeFileSync(idsFile, JSON.stringify(ids));
  const a = [path.join(here, 'render-flags.mjs'), '--out', spriteFile, '--ids', idsFile, '--cache', cacheDir];
  if (browser) a.push('--browser', browser);
  const child = spawn(process.execPath, a, { cwd: moduleRoot, windowsHide: true, env: childEnv });
  child.on('exit', (code) => {
    spriteState = code === 0 && fs.existsSync(spriteFile) ? 'ready' : 'failed';
    console.log(`[race-ui] flag thumbnails: ${spriteState}`);
  });
}

// ------------------------------------------------------------------ estimates
// typical stage lengths (s) measured with the simulator; stages that wait for almost everyone run longer
const STAGE_SECONDS = { mix: 16, zigzag: 36, plinko: 18, funnels: 17, gates: 44, spinners: 19 };
function plan(body) {
  const count = Number(body.count);
  const opts =
    body.mode === 'perStage'
      ? { eliminate: Math.max(1, parseInt(body.value, 10) || 1) }
      : body.mode === 'percent'
        ? { eliminatePercent: Number(body.value) }
        : { stages: Math.max(1, Math.min(count - 1, parseInt(body.value, 10) || 1)) };
  const eliminate = planEliminations(count, opts);
  const templates = Array.isArray(body.templates) && body.templates.length ? body.templates : TEMPLATES;
  const weight = (t) => (t === 'mix' ? 24 : 1); // engine draws mixed courses ~24 of 29 stages
  const avg = templates.reduce((a, t) => a + (STAGE_SECONDS[t] ?? 25) * weight(t), 0) / templates.reduce((a, t) => a + weight(t), 0);
  let left = count;
  let seconds = 16;
  for (const n of eliminate) {
    seconds += avg * (1 + 0.15 * Math.min(2, left / 100)) * (n / left < 0.2 ? 1.1 : 1);
    left -= n;
  }
  return { eliminate, stages: eliminate.length, estimateSeconds: Math.round(seconds), opts };
}

// ------------------------------------------------------------------ jobs
let job = null;
const raceStatus = (id) => {
  const dir = path.join(racesDir, id);
  const s = { id, simulated: fs.existsSync(path.join(dir, 'replay', 'race.json')), video: null, meta: null };
  try {
    s.video = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8')).path;
    if (!fs.existsSync(s.video)) s.video = null;
  } catch {}
  if (s.simulated) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'replay', 'race.json'), 'utf8'));
      const name = (id) => byId[id]?.name ?? id;
      s.meta = {
        title: m.title,
        countries: m.competitors.length,
        stages: m.stageCount,
        seconds: Math.round(m.totalFrames / m.fps),
        winner: name(m.winner),
        top: m.standings.slice(0, 10).map((x) => ({ ...x, name: name(x.id) })),
      };
    } catch {}
  }
  return s;
};

function log(line) {
  if (!job) return;
  job.log.push(line);
  if (job.log.length > 3000) job.log.splice(0, job.log.length - 3000);
  let m;
  if ((m = line.match(/stage (\d+)\/(\d+) /))) job.progress = { phase: 'simulate', done: +m[1], total: +m[2] };
  if ((m = line.match(/\[race-render\] .*: (\d+) segment\(s\).*?(\d+) already rendered/))) {
    job.progress = { phase: 'render', done: +m[2], total: +m[1] };
  }
  if (job.progress?.phase === 'render' && /^\s+seg-\d+.* frames in /.test(line)) job.progress.done++;
  if ((m = line.match(/about (.+) left/))) job.eta = m[1];
  if ((m = line.match(/\[race-render\] joined .* -> (.+)$/))) {
    job.video = m[1].trim();
    fs.writeFileSync(path.join(racesDir, job.raceId, 'video.json'), JSON.stringify({ path: job.video, at: new Date().toISOString() }));
  }
  if ((m = line.match(/\[race\] winner: ([a-z0-9_-]+)/))) job.winner = m[1];
}

function runStep(argv) {
  return new Promise((resolve) => {
    log(`> node ${argv.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
    const child = spawn(process.execPath, argv, { cwd: moduleRoot, windowsHide: true, env: childEnv });
    job.child = child;
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      const parts = buf.split(/\r?\n|\r/);
      buf = parts.pop();
      for (const raw of parts) {
        const p = raw.replace(/\x1b\[[0-9;]*m/g, '');
        if (p.trim() && !/^\s*seg-[\w-]+: \d+%$/.test(p) && !/memory|docker run|lower amount/i.test(p)) log(p);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (buf.trim()) log(buf);
      job.child = null;
      resolve(code ?? 1);
    });
  });
}

async function startJob({ raceId, simulate, render, concurrency }) {
  const dir = path.join(racesDir, raceId);
  job = { id: crypto.randomUUID(), raceId, status: 'running', log: [], progress: null, eta: null, video: null, winner: null, startedAt: Date.now(), child: null };
  try {
    if (simulate) {
      const code = await runStep([path.join(moduleRoot, 'race', 'simulate.mjs'), '--race', path.join(dir, 'race.race.json'), '--out', dir]);
      if (code !== 0) throw new Error(`simulation failed (exit ${code})`);
    }
    if (render && job.status === 'running') {
      const a = [path.join(moduleRoot, 'scripts', 'render-race.mjs'), '--race-dir', dir, '--out', path.join(racesDir, `${raceId}.mp4`), '--cache', cacheDir, '--concurrency', String(concurrency)];
      if (browser) a.push('--browser', browser);
      const code = await runStep(a);
      if (code !== 0 && job.status === 'running') throw new Error(`render failed (exit ${code})`);
    }
    if (job.status === 'running') job.status = 'done';
  } catch (e) {
    if (job.status === 'running') {
      job.status = 'failed';
      log(`ERROR: ${e.message}`);
    }
  }
  job.endedAt = Date.now();
}

function stopJob() {
  if (!job || job.status !== 'running') return false;
  job.status = 'stopped';
  log('Stopped by user. Click "Render / resume" on this race to continue later: finished stages are kept.');
  if (job.child) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(job.child.pid), '/T', '/F'], { windowsHide: true });
    else job.child.kill('SIGTERM');
  }
  return true;
}

// ------------------------------------------------------------------ http
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => {
      d += c;
      if (d.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'race';
const validId = (id) => typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && fs.existsSync(path.join(racesDir, id));

function serveFile(req, res, file, type) {
  const stat = fs.statSync(file);
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? parseInt(range[2], 10) : stat.size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'accept-ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(path.join(here, 'index.html')));
    }
    if (req.method === 'GET' && p === '/api/info')
      return json(res, 200, { countries, templates: TEMPLATES, studio, sprite: spriteState, cores: os.cpus().length, instance: instanceId });
    if (req.method === 'GET' && p === '/flags.png') {
      if (spriteState !== 'ready') return json(res, 404, { error: 'not ready' });
      return serveFile(req, res, spriteFile, 'image/png');
    }
    if (req.method === 'POST' && p === '/api/plan') return json(res, 200, plan(await readBody(req)));
    if (req.method === 'GET' && p === '/api/job') {
      if (!job) return json(res, 200, null);
      const { child, ...rest } = job;
      return json(res, 200, { ...rest, log: job.log.slice(-400), race: raceStatus(job.raceId) });
    }
    if (req.method === 'POST' && p === '/api/job/stop') return json(res, 200, { stopped: stopJob() });
    if (req.method === 'GET' && p === '/api/races') {
      const list = fs
        .readdirSync(racesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(racesDir, d.name, 'race.race.json')))
        .map((d) => ({ ...raceStatus(d.name), mtime: fs.statSync(path.join(racesDir, d.name, 'race.race.json')).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 30);
      return json(res, 200, list);
    }
    if (req.method === 'POST' && p === '/api/create') {
      if (job?.status === 'running') return json(res, 409, { error: 'A video is already being made. Stop it first or wait.' });
      const b = await readBody(req);
      const picked = Array.isArray(b.countries) ? b.countries.filter((c) => ids.includes(c)) : [];
      if (picked.length < 2) return json(res, 400, { error: 'Pick at least 2 countries.' });
      const pl = plan({ ...b, count: picked.length });
      const title = String(b.title || `${picked.length} Countries Marble Race`).slice(0, 80);
      const d = new Date();
      const two = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
      const raceId = `${slug(title)}-${stamp}`;
      const race = {
        id: raceId,
        title,
        countries: picked,
        ...pl.opts,
        templates: Array.isArray(b.templates) && b.templates.length ? b.templates.filter((t) => TEMPLATES.includes(t)) : undefined,
        twists: { pads: b.twists?.pads !== false, bumpers: b.twists?.bumpers !== false, shortcuts: b.twists?.shortcuts !== false },
        startOrder: b.comeback === false ? 'random' : 'comeback',
        // one-ball passages only make sense for a small field; a big crowd would jam behind every chute
        flow: b.flow === 'single' && picked.length <= 24 ? 'single' : undefined,
        seed: b.seed === '' || b.seed === undefined ? Math.floor(Math.random() * 1e6) : Number.isNaN(Number(b.seed)) ? String(b.seed) : Number(b.seed),
        fps: 30,
      };
      const dir = path.join(racesDir, raceId);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'race.race.json');
      fs.writeFileSync(file, JSON.stringify(race, null, 2));
      try {
        loadRace(file); // validate before starting
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
      startJob({ raceId, simulate: true, render: !b.simulateOnly, concurrency: Math.max(1, Math.min(32, parseInt(b.concurrency, 10) || 2)) });
      return json(res, 200, { raceId });
    }
    if (req.method === 'POST' && p === '/api/render') {
      if (job?.status === 'running') return json(res, 409, { error: 'A video is already being made.' });
      const b = await readBody(req);
      if (!validId(b.raceId)) return json(res, 400, { error: 'unknown race' });
      const simulated = fs.existsSync(path.join(racesDir, b.raceId, 'replay', 'race.json'));
      startJob({ raceId: b.raceId, simulate: !simulated, render: true, concurrency: Math.max(1, Math.min(32, parseInt(b.concurrency, 10) || 2)) });
      return json(res, 200, { raceId: b.raceId });
    }
    if (req.method === 'GET' && p.startsWith('/video/')) {
      const id = p.slice(7);
      if (!validId(id)) return json(res, 404, { error: 'unknown race' });
      const v = raceStatus(id).video;
      if (!v) return json(res, 404, { error: 'no video yet' });
      return serveFile(req, res, v, 'video/mp4');
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[race-ui] open http://127.0.0.1:${port}   (videos go to ${racesDir})`);
  if (spriteState === 'rendering') console.log('[race-ui] preparing flag thumbnails (first start only, about a minute)...');
});
