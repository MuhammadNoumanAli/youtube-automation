import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { BackgroundJob, JobStatus, JobType } from '../../database/entities/background-job.entity';
import { RenderJob, RenderJobStatus } from '../../database/entities/render-job.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { VideoFormat, VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { RenderingService } from '../rendering/rendering.service';
import { buildCommands, CountryballsRunnerService } from './countryballs-runner.service';
import { buildSpec } from './countryballs-spec';
import { sampleForm } from './countryballs.fixtures';

/**
 * Uses a stand-in animation app (two tiny .mjs scripts) so the real process handling, file layout, report parsing
 * and database bookkeeping are exercised without Remotion or voice models. FAKE_RENDER controls its behaviour.
 */
function makeFakeApp(root: string) {
  fs.mkdirSync(path.join(root, 'voice'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'voice', 'generate.mjs'),
    `import fs from 'node:fs';
const a = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(a[a.indexOf('--spec') + 1], 'utf8'));
console.log('[voice] fake voices for', spec.id, a.includes('--fake') ? 'FAKE' : 'REAL', 'audio', process.env.TTS_AUDIO_ROOT);
process.exit(process.env.FAKE_RENDER === 'voice-fail' ? 2 : 0);
`,
  );
  fs.writeFileSync(
    path.join(root, 'scripts', 'render.mjs'),
    `import fs from 'node:fs';
const a = process.argv.slice(2);
const get = (k) => a[a.indexOf(k) + 1];
const mode = process.env.FAKE_RENDER || 'ok';
if (mode === 'hang') { fs.writeFileSync(get('--out') + '.started', ''); setInterval(() => {}, 1000); }
else {
  const out = get('--out');
  fs.writeFileSync(out, 'video');
  const fail = mode === 'checks-fail';
  fs.writeFileSync(out.replace(/\\.mp4$/, '.metrics.json'), JSON.stringify({
    probe: { ok: !fail, checks: { h264: true, loudness: !fail, truePeak: true } },
    content: { ran: true, blackFrameRuns: [], frozenOver2sStarts: [] },
    voice: { lines: 4, fallbacks: 0, test: a.includes('--fake') },
    mastering: { after: { integratedLUFS: -14 } },
    contactSheet: out.replace(/\\.mp4$/, '.contact-sheet.jpg'),
    args: a,
  }));
  console.log('[render] wrote', out, get('--format'));
  process.exit(fail ? 1 : 0);
}
`,
  );
}

describe('CountryballsRunnerService', () => {
  let tmp: string;
  let service: CountryballsRunnerService;
  let project: VideoProject;
  let script: Script;
  let renderSaves: RenderJob[];
  let config: Record<string, unknown>;
  const projectRepo = { findOne: jest.fn(), save: jest.fn(async (p) => p) };
  const scriptRepo = { findOne: jest.fn() };
  const renderRepo = {
    create: jest.fn((e) => ({ id: 'render-1', ...e })),
    save: jest.fn(async (e) => {
      renderSaves.push({ ...e });
      return e;
    }),
  };
  const auditRepo = { create: jest.fn((e) => e), save: jest.fn(async (e) => e) };
  const renderingService = {
    validateVideo: jest.fn(async () => ({
      valid: true,
      durationSeconds: 31.1,
      width: 1080,
      height: 1920,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      sizeBytes: 5,
      formatName: 'mp4',
      checks: { hasVideoStream: true, hasAudioStream: true, nonZeroDuration: true, compatibleCodecs: true },
    })),
  };

  const job = (over: Partial<BackgroundJob> = {}) =>
    ({
      id: 'job-1',
      job_type: JobType.CountryballsRender,
      status: JobStatus.Processing,
      video_project_id: 'proj-1',
      payload_json: { scriptId: 'script-1' },
      ...over,
    }) as BackgroundJob;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.FAKE_RENDER;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-runner-'));
    makeFakeApp(path.join(tmp, 'app'));
    renderSaves = [];
    config = { ANIMATION_APP_DIR: path.join(tmp, 'app'), ANIMATION_STUDIO_ROOT: path.join(tmp, 'studio') };
    const spec = buildSpec(sampleForm(), 'cb-test01', '9:16');
    project = { id: 'proj-1', format: VideoFormat.Short, status: VideoProjectStatus.ReadyToRender } as VideoProject;
    script = {
      id: 'script-1',
      video_project_id: 'proj-1',
      status: ScriptStatus.Approved,
      metadata_json: { title: 't', description: 'd', tags: [], countryballsSpec: spec } as any,
    } as Script;
    projectRepo.findOne.mockImplementation(async () => project);
    scriptRepo.findOne.mockImplementation(async () => script);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CountryballsRunnerService,
        { provide: getRepositoryToken(VideoProject), useValue: projectRepo },
        { provide: getRepositoryToken(Script), useValue: scriptRepo },
        { provide: getRepositoryToken(RenderJob), useValue: renderRepo },
        { provide: getRepositoryToken(AuditEvent), useValue: auditRepo },
        { provide: RenderingService, useValue: renderingService },
        { provide: ConfigService, useValue: { get: (k: string) => config[k] } },
      ],
    }).compile();
    service = moduleRef.get(CountryballsRunnerService);
    service.heartbeatMs = 100;
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('builds argument arrays (no shell) for the voice and render steps', () => {
    const paths = service.paths();
    const spec = buildSpec(sampleForm(), 'cb-test01', '16:9');
    const cmds = buildCommands(paths, '/s/cb-test01.spec.json', spec, '16:9', '/o/x.mp4', { fakeVoices: false, concurrency: 2 });
    expect(cmds.voice).toEqual([path.join('voice', 'generate.mjs'), '--spec', '/s/cb-test01.spec.json']);
    expect(cmds.render).toEqual([
      path.join('scripts', 'render.mjs'),
      '--spec', '/s/cb-test01.spec.json',
      '--format', '16:9',
      '--out', '/o/x.mp4',
      '--cache', paths.cacheDir,
      '--audio-dir', path.join(paths.audioRoot, 'videos', 'cb-test01'),
      '--concurrency', '2',
    ]);
    expect(paths.audioRoot).toBe(path.join(tmp, 'studio', 'audio'));
  });

  it('renders an approved script and leaves the project in render review (nothing approved)', async () => {
    const result = await service.run(job(), async () => true);
    expect(result.valid).toBe(true);
    expect(result.format).toBe('9:16');
    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(result.outputPath.startsWith(path.join(tmp, 'studio', 'renders', 'countryballs'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'studio', 'specs', 'cb-test01.spec.json'))).toBe(true);
    const final = renderSaves[renderSaves.length - 1];
    expect(final.status).toBe(RenderJobStatus.Completed);
    expect(final.validation_json?.valid).toBe(true);
    expect(project.status).toBe(VideoProjectStatus.RenderReview);
    expect(auditRepo.create.mock.calls.map((c) => c[0].action)).toEqual(['COUNTRYBALLS_RENDERED']);
    const metrics = JSON.parse(fs.readFileSync(result.outputPath.replace(/\.mp4$/, '.metrics.json'), 'utf8'));
    expect(metrics.args).toContain('9:16');
  });

  it('refuses a script that is not approved, before running anything', async () => {
    script.status = ScriptStatus.Review;
    await expect(service.run(job(), async () => true)).rejects.toThrow(/not approved/);
    expect(renderRepo.save).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmp, 'studio', 'specs'))).toBe(false);
  });

  it('refuses a script from another project', async () => {
    script.video_project_id = 'other';
    await expect(service.run(job(), async () => true)).rejects.toThrow(/Script not found/);
  });

  it('fails the render (for retry) when the renderer reports failed checks', async () => {
    process.env.FAKE_RENDER = 'checks-fail';
    await expect(service.run(job(), async () => true)).rejects.toThrow(/Check failed: loudness/);
    const final = renderSaves[renderSaves.length - 1];
    expect(final.status).toBe(RenderJobStatus.Failed);
    expect(final.validation_json?.valid).toBe(false);
    expect(project.status).toBe(VideoProjectStatus.Failed);
  });

  it('fails cleanly when voice generation fails', async () => {
    process.env.FAKE_RENDER = 'voice-fail';
    await expect(service.run(job(), async () => true)).rejects.toThrow(/Voice generation failed \(exit 2\)/);
    expect(renderSaves[renderSaves.length - 1].status).toBe(RenderJobStatus.Failed);
  });

  it('stops the render when the job is cancelled (heartbeat returns false)', async () => {
    process.env.FAKE_RENDER = 'hang';
    await expect(service.run(job(), async () => !fs.readdirSync(path.join(tmp, 'studio', 'renders', 'countryballs')).some((f) => f.endsWith('.started')))).rejects.toThrow(/cancelled during render/);
    expect(renderSaves[renderSaves.length - 1].status).toBe(RenderJobStatus.Cancelled);
  }, 15000);

  it('test-tone renders stay reviewable but can never pass validation (so they cannot be uploaded)', async () => {
    config.ANIMATION_FAKE_VOICES = true;
    const result = await service.run(job(), async () => true);
    expect(result.valid).toBe(false);
    expect(result.fakeVoices).toBe(true);
    const final = renderSaves[renderSaves.length - 1];
    expect(final.status).toBe(RenderJobStatus.Failed);
    expect(final.validation_json?.errors?.join(' ')).toMatch(/Test tones/);
    expect(project.status).toBe(VideoProjectStatus.RenderReview);
  });

  it('reports a missing animation app clearly', async () => {
    config.ANIMATION_APP_DIR = path.join(tmp, 'nope');
    await expect(service.run(job(), async () => true)).rejects.toThrow(/Animation app not found/);
    expect(service.status().appFound).toBe(false);
  });
});
