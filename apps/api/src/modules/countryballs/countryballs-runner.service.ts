import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { BackgroundJob } from '../../database/entities/background-job.entity';
import { RenderJob, RenderJobStatus, VideoProbeValidation } from '../../database/entities/render-job.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { VideoFormat, VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { RenderingService } from '../rendering/rendering.service';
import { checkSpec, CountryballsSpec, SpecFormat } from './countryballs-spec';
import { runStep, StepResult } from './process-runner';

export interface AnimationPaths {
  appDir: string;
  studioRoot: string;
  specsDir: string;
  rendersDir: string;
  cacheDir: string;
  tmpDir: string;
  audioRoot: string;
}

export interface CountryballsRunResult extends Record<string, unknown> {
  renderJobId: string;
  outputPath: string;
  format: SpecFormat;
  durationSeconds: number;
  valid: boolean;
  checks: Record<string, boolean | null>;
  fakeVoices: boolean;
}

const VOICE_TIMEOUT_MS = 30 * 60 * 1000;
const RENDER_TIMEOUT_MS = 90 * 60 * 1000;

/** Reads the spec stored with a script (metadata_json.countryballsSpec). */
export function specFromScript(script: Script): CountryballsSpec | null {
  const spec = (script.metadata_json as unknown as { countryballsSpec?: CountryballsSpec } | null)?.countryballsSpec;
  return spec ?? null;
}

export function specFormatFor(project: VideoProject): SpecFormat {
  return project.format === VideoFormat.Short ? '9:16' : '16:9';
}

/** Arguments for the animation app's two command-line steps (exported for tests). */
export function buildCommands(
  paths: AnimationPaths,
  specFile: string,
  spec: CountryballsSpec,
  format: SpecFormat,
  outPath: string,
  opts: { fakeVoices: boolean; concurrency: number; browserExecutable?: string },
): { voice: string[]; render: string[] } {
  const voice = [path.join('voice', 'generate.mjs'), '--spec', specFile];
  if (opts.fakeVoices) voice.push('--fake');
  const render = [
    path.join('scripts', 'render.mjs'),
    '--spec', specFile,
    '--format', format,
    '--out', outPath,
    '--cache', paths.cacheDir,
    '--audio-dir', path.join(paths.audioRoot, 'videos', spec.id),
    '--concurrency', String(opts.concurrency),
  ];
  if (opts.browserExecutable) render.push('--browser', opts.browserExecutable);
  return { voice, render };
}

/**
 * Runs an approved Countryballs script through the animation app (apps/animation): voice generation, then the
 * Remotion render with its own checks (codec, size, fps, duration, loudness, black/frozen frames). Records the
 * result as a RenderJob and leaves the project in render_review. It never approves anything and never uploads.
 */
@Injectable()
export class CountryballsRunnerService {
  private readonly logger = new Logger(CountryballsRunnerService.name);
  /** How often the lease is renewed and cancellation is checked while a step runs (tests shorten it). */
  heartbeatMs = 30000;

  constructor(
    @InjectRepository(VideoProject) private readonly projectRepo: Repository<VideoProject>,
    @InjectRepository(Script) private readonly scriptRepo: Repository<Script>,
    @InjectRepository(RenderJob) private readonly renderRepo: Repository<RenderJob>,
    @InjectRepository(AuditEvent) private readonly auditRepo: Repository<AuditEvent>,
    private readonly renderingService: RenderingService,
    private readonly configService: ConfigService,
  ) {}

  paths(): AnimationPaths {
    const configuredApp = this.configService.get<string>('ANIMATION_APP_DIR');
    const candidates = configuredApp
      ? [configuredApp]
      : [path.resolve(process.cwd(), '..', 'animation'), path.resolve(process.cwd(), 'apps', 'animation')];
    const appDir = path.resolve(candidates.find((c) => fs.existsSync(path.join(c, 'scripts', 'render.mjs'))) ?? candidates[0]);
    const storageRoot = path.resolve(this.configService.get<string>('STORAGE_ROOT') || 'storage');
    const studioRoot = path.resolve(this.configService.get<string>('ANIMATION_STUDIO_ROOT') || path.join(storageRoot, 'animation'));
    const audioRoot = path.resolve(this.configService.get<string>('TTS_AUDIO_ROOT') || path.join(studioRoot, 'audio'));
    return {
      appDir,
      studioRoot,
      specsDir: path.join(studioRoot, 'specs'),
      rendersDir: path.join(studioRoot, 'renders', 'countryballs'),
      cacheDir: path.join(studioRoot, 'cache', 'remotion'),
      tmpDir: path.join(studioRoot, 'tmp'),
      audioRoot,
    };
  }

  /** What the settings/options endpoint reports (no secrets, just whether the app is where we expect). */
  status(): { appFound: boolean; appDir: string; studioRoot: string; fakeVoices: boolean } {
    const p = this.paths();
    return {
      appFound: fs.existsSync(path.join(p.appDir, 'scripts', 'render.mjs')) && fs.existsSync(path.join(p.appDir, 'voice', 'generate.mjs')),
      appDir: p.appDir,
      studioRoot: p.studioRoot,
      fakeVoices: this.fakeVoices(),
    };
  }

  private fakeVoices(): boolean {
    const v = this.configService.get<boolean | string>('ANIMATION_FAKE_VOICES');
    return v === true || v === 'true';
  }

  private concurrency(): number {
    const n = Number(this.configService.get('ANIMATION_RENDER_CONCURRENCY') ?? 2);
    return Math.min(4, Math.max(1, Number.isFinite(n) ? Math.round(n) : 2));
  }

  async run(job: BackgroundJob, heartbeat: () => Promise<boolean>): Promise<CountryballsRunResult> {
    if (!job.video_project_id) throw new Error('video_project_id is required for a countryballs render job');
    const scriptId = job.payload_json?.scriptId as string | undefined;
    if (!scriptId) throw new Error('payload.scriptId is required for a countryballs render job');

    const project = await this.projectRepo.findOne({ where: { id: job.video_project_id } });
    if (!project) throw new Error(`Video project ${job.video_project_id} not found`);
    const script = await this.scriptRepo.findOne({ where: { id: scriptId } });
    if (!script || script.video_project_id !== project.id) throw new Error('Script not found for this project');
    // Gate: only a human-approved script is ever rendered by this job.
    if (script.status !== ScriptStatus.Approved) throw new Error('Script is not approved; approve it before rendering');
    const stored = specFromScript(script);
    const problems = checkSpec(stored);
    if (!stored || problems.length) throw new Error(`Approved script has no usable Countryballs spec: ${problems.join(', ')}`);

    const format = specFormatFor(project);
    const spec: CountryballsSpec = { ...stored, format };
    const paths = this.paths();
    if (!this.status().appFound) {
      throw new Error(`Animation app not found at ${paths.appDir} (set ANIMATION_APP_DIR)`);
    }
    for (const d of [paths.specsDir, paths.rendersDir, paths.cacheDir, paths.tmpDir, paths.audioRoot]) fs.mkdirSync(d, { recursive: true });

    // One spec file per spec id; both formats of a "both" request share it (and share the voice audio).
    const specFile = path.join(paths.specsDir, `${spec.id}.spec.json`);
    fs.writeFileSync(specFile, JSON.stringify(stored, null, 2) + '\n', 'utf8');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(paths.rendersDir, `${spec.id}-${format === '9:16' ? '9x16' : '16x9'}-${stamp}.mp4`);
    const fake = this.fakeVoices();
    const cmds = buildCommands(paths, specFile, spec, format, outPath, {
      fakeVoices: fake,
      concurrency: this.concurrency(),
      browserExecutable: this.configService.get<string>('ANIMATION_BROWSER_EXECUTABLE') || undefined,
    });

    const renderJob = await this.renderRepo.save(
      this.renderRepo.create({
        video_project_id: project.id,
        status: RenderJobStatus.Rendering,
        output_path: outPath,
        started_at: new Date(),
        ffmpeg_command_summary: `countryballs ${format}: node ${cmds.voice.join(' ')} && node ${cmds.render.join(' ')}`,
      }),
    );
    project.status = VideoProjectStatus.Rendering;
    await this.projectRepo.save(project);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TTS_AUDIO_ROOT: paths.audioRoot,
      TEMP: paths.tmpDir,
      TMP: paths.tmpDir,
      TMPDIR: paths.tmpDir,
    };
    const step = (name: string, args: string[], timeoutMs: number) =>
      runStep(process.execPath, args, {
        cwd: paths.appDir,
        env,
        timeoutMs,
        heartbeat,
        heartbeatMs: this.heartbeatMs,
        onLine: (l) => this.logger.log(`[${name} ${spec.id} ${format}] ${l}`),
      });

    try {
      const voice = await step('voice', cmds.voice, VOICE_TIMEOUT_MS);
      this.throwIfStopped(voice, 'voice generation');
      if (voice.code !== 0) throw new Error(`Voice generation failed (exit ${voice.code}): ${lastLines(voice.tail)}`);

      const render = await step('render', cmds.render, RENDER_TIMEOUT_MS);
      this.throwIfStopped(render, 'render');
      if (!fs.existsSync(outPath)) throw new Error(`Render produced no video (exit ${render.code}): ${lastLines(render.tail)}`);

      const validation = await this.collectValidation(outPath, render.code, fake);
      renderJob.validation_json = validation;
      renderJob.finished_at = new Date();
      if (!validation.valid) {
        renderJob.status = RenderJobStatus.Failed;
        renderJob.error_code = 'CHECKS_FAILED';
        renderJob.error_message = (validation.errors ?? []).join('; ').slice(0, 2000);
        await this.renderRepo.save(renderJob);
        // Fake voices are a configuration choice, not a failure worth retrying: keep it reviewable but not uploadable.
        if (fake && (validation.errors ?? []).every((e) => e.startsWith('Test tones'))) {
          project.status = VideoProjectStatus.RenderReview;
          await this.projectRepo.save(project);
          return this.result(renderJob, format, validation, fake);
        }
        throw new Error(`Render checks failed: ${renderJob.error_message}`);
      }

      renderJob.status = RenderJobStatus.Completed;
      await this.renderRepo.save(renderJob);
      project.status = VideoProjectStatus.RenderReview;
      await this.projectRepo.save(project);
      await this.auditRepo.save(
        this.auditRepo.create({
          actor: 'countryballs_render_job',
          action: 'COUNTRYBALLS_RENDERED',
          entity_type: 'render_job',
          entity_id: renderJob.id,
          details_json: {
            project_id: project.id,
            script_id: script.id,
            spec_id: spec.id,
            format,
            duration_seconds: validation.durationSeconds,
            next_step: 'human render review',
          },
        }),
      );
      return this.result(renderJob, format, validation, fake);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (renderJob.status === RenderJobStatus.Rendering) {
        renderJob.status = /cancelled/i.test(message) ? RenderJobStatus.Cancelled : RenderJobStatus.Failed;
        renderJob.error_code = renderJob.status === RenderJobStatus.Cancelled ? 'CANCELLED' : 'RENDER_FAILED';
        renderJob.error_message = message.slice(0, 2000);
        renderJob.finished_at = new Date();
        await this.renderRepo.save(renderJob);
      }
      project.status = VideoProjectStatus.Failed;
      await this.projectRepo.save(project);
      throw err;
    }
  }

  private throwIfStopped(r: StepResult, what: string): void {
    if (r.stopped === 'cancelled') throw new Error(`Job cancelled during ${what}`);
    if (r.stopped === 'timeout') throw new Error(`${what} timed out`);
  }

  private result(renderJob: RenderJob, format: SpecFormat, v: VideoProbeValidation, fake: boolean): CountryballsRunResult {
    return {
      renderJobId: renderJob.id,
      outputPath: renderJob.output_path ?? '',
      format,
      durationSeconds: v.durationSeconds,
      valid: v.valid,
      checks: ((v as unknown as { animation?: { checks?: Record<string, boolean | null> } }).animation?.checks) ?? {},
      fakeVoices: fake,
    };
  }

  /** Combines the animation app's report (metrics.json) with the API's own FFprobe validation. */
  async collectValidation(outPath: string, exitCode: number | null, fake: boolean): Promise<VideoProbeValidation> {
    const errors: string[] = [];
    const metricsFile = outPath.replace(/\.mp4$/i, '.metrics.json');
    let metrics: any = null;
    try {
      metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
    } catch {
      errors.push('Render report (metrics.json) missing or unreadable');
    }
    const checks: Record<string, boolean | null> = { ...(metrics?.probe?.checks ?? {}) };
    if (metrics?.content) {
      checks.noBlackFrames = metrics.content.ran ? (metrics.content.blackFrameRuns?.length ?? 0) === 0 : null;
      checks.noFrozenStretch = metrics.content.ran ? (metrics.content.frozenOver2sStarts?.length ?? 0) === 0 : null;
    }
    for (const [k, v] of Object.entries(checks)) if (v === false) errors.push(`Check failed: ${k}`);
    if (exitCode !== 0 && !errors.length) errors.push(`Renderer exited with code ${exitCode}`);
    const testTones = fake || metrics?.voice?.test === true;
    if (testTones) errors.push('Test tones instead of real voices (ANIMATION_FAKE_VOICES): not for upload');

    const probe = await this.renderingService.validateVideo(outPath);
    const all = [...(probe.errors ?? []), ...errors];
    return {
      ...probe,
      valid: probe.valid && all.length === 0,
      errors: all.length ? all : undefined,
      animation: {
        checks,
        report: outPath.replace(/\.mp4$/i, '.report.md'),
        contactSheet: typeof metrics?.contactSheet === 'string' ? metrics.contactSheet : null,
        loudness: metrics?.mastering?.after ?? null,
        voice: metrics?.voice ? { lines: metrics.voice.lines, fallbacks: metrics.voice.fallbacks, testTones } : null,
      },
    } as VideoProbeValidation;
  }
}

function lastLines(text: string, n = 6): string {
  return text.trim().split(/\r?\n/).slice(-n).join(' | ').slice(0, 1500);
}
