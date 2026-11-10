import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { BackgroundJob, JobStatus, JobType } from '../../database/entities/background-job.entity';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { Script, ScriptStatus, VideoMetadataPayload } from '../../database/entities/script.entity';
import { VideoFormat, VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { JobsService } from '../jobs/jobs.service';
import { VideosService } from '../videos/videos.service';
import {
  COUNTRY_IDS,
  COUNTRY_NAMES,
  DEFAULT_NARRATOR_VOICE,
  DIALOGUE_SETTINGS,
  EXPRESSIONS,
  LIMITS,
  SCENE_TYPES,
  VOICES,
} from './countryballs.catalog';
import { CountryballsRunnerService, specFromScript } from './countryballs-runner.service';
import { buildSpec, CountryballsSpec, estimateSeconds, formatsFor, readableScript, scenePlan, SpecFormat } from './countryballs-spec';
import { CreateCountryballsDto } from './dto/create-countryballs.dto';

export interface CountryballsProjectSummary {
  project_id: string;
  script_id: string;
  format: VideoFormat;
  aspect: SpecFormat;
  status: VideoProjectStatus;
  estimated_seconds: number;
}

export interface CreateCountryballsResult {
  spec_id: string;
  title: string;
  projects: CountryballsProjectSummary[];
  next_step: string;
}

/** Metadata stored with a Countryballs script: the normal upload metadata plus the spec that will be rendered. */
export type CountryballsMetadata = VideoMetadataPayload & { countryballsSpec: CountryballsSpec };

const RENDERABLE_FROM = new Set<VideoProjectStatus>([
  VideoProjectStatus.ScriptApproved,
  VideoProjectStatus.ReadyToRender,
  VideoProjectStatus.RenderReview,
  VideoProjectStatus.AssetsPending,
  VideoProjectStatus.Failed,
]);

@Injectable()
export class CountryballsService {
  private readonly logger = new Logger(CountryballsService.name);

  constructor(
    @InjectRepository(VideoProject) private readonly projectRepo: Repository<VideoProject>,
    @InjectRepository(ChannelProfile) private readonly channelRepo: Repository<ChannelProfile>,
    @InjectRepository(Script) private readonly scriptRepo: Repository<Script>,
    @InjectRepository(AuditEvent) private readonly auditRepo: Repository<AuditEvent>,
    @InjectRepository(BackgroundJob) private readonly jobRepo: Repository<BackgroundJob>,
    private readonly videosService: VideosService,
    private readonly jobsService: JobsService,
    private readonly runner: CountryballsRunnerService,
  ) {}

  options() {
    return {
      countries: COUNTRY_IDS.map((id) => ({ id, name: COUNTRY_NAMES[id] })),
      voices: VOICES.map((id) => ({ id, label: `${id.startsWith('af_') ? 'Female' : 'Male'}: ${id.slice(3)}` })),
      default_narrator_voice: DEFAULT_NARRATOR_VOICE,
      expressions: EXPRESSIONS,
      scene_types: SCENE_TYPES,
      dialogue_settings: DIALOGUE_SETTINGS,
      formats: [
        { id: 'short', label: 'Short (9:16 vertical)' },
        { id: 'long_form', label: 'Long (16:9 horizontal)' },
        { id: 'both', label: 'Both (one project each, same lines and voices)' },
      ],
      limits: LIMITS,
      animation: this.runner.status(),
    };
  }

  /**
   * Creates one project per requested format, each with the script in REVIEW. Nothing is approved here: a person
   * approves the script (POST /api/scripts/:id/approve) before it can be rendered.
   */
  async create(dto: CreateCountryballsDto): Promise<CreateCountryballsResult> {
    const channelId = await this.resolveChannel(dto.channel_profile_id);
    const formats = formatsFor(dto.format);
    const specId = `cb-${randomBytes(6).toString('hex')}`;

    let specs: CountryballsSpec[];
    try {
      specs = formats.map((f) => buildSpec(dto, specId, f));
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }

    const projects: CountryballsProjectSummary[] = [];
    for (const spec of specs) {
      const projectFormat = spec.format === '9:16' ? VideoFormat.Short : VideoFormat.LongForm;
      const seconds = estimateSeconds(spec);
      const project = await this.videosService.create({
        channel_profile_id: channelId,
        title: dto.title.trim().slice(0, 255),
        working_title: `${dto.title.trim().slice(0, 230)} (${projectFormat === VideoFormat.Short ? 'Short 9:16' : 'Long 16:9'})`,
        topic: `Countryballs animation: ${dto.title.trim()}`,
        target_audience: 'General Audience',
        format: projectFormat,
        target_duration_seconds: seconds,
        status: VideoProjectStatus.Idea,
      });

      const metadata: CountryballsMetadata = {
        title: dto.title.trim().slice(0, 100),
        description: dto.description?.trim() || `${dto.title.trim()}\n\nAn original Countryballs animation.`,
        tags: dto.tags?.length ? dto.tags : ['countryballs', 'animation', 'geography'],
        countryballsSpec: spec,
      };
      const script = await this.scriptRepo.save(
        this.scriptRepo.create({
          video_project_id: project.id,
          version: 1,
          content: readableScript(spec),
          outline_json: spec.scenes.map((s, i) => `Scene ${i + 1}: ${s.template}`),
          scene_plan_json: scenePlan(spec),
          metadata_json: metadata,
          provider: 'countryballs-form',
          model: 'spec-v1',
          status: ScriptStatus.Review,
        }),
      );
      project.status = VideoProjectStatus.ScriptReview;
      await this.projectRepo.save(project);

      await this.auditRepo.save(
        this.auditRepo.create({
          actor: 'studio-user',
          action: 'COUNTRYBALLS_PROJECT_CREATED',
          entity_type: 'video_project',
          entity_id: project.id,
          details_json: { spec_id: specId, script_id: script.id, aspect: spec.format, scenes: spec.scenes.length, next_step: 'human script review' },
        }),
      );
      projects.push({
        project_id: project.id,
        script_id: script.id,
        format: projectFormat,
        aspect: spec.format,
        status: VideoProjectStatus.ScriptReview,
        estimated_seconds: seconds,
      });
    }

    return {
      spec_id: specId,
      title: dto.title.trim(),
      projects,
      next_step: 'Review and approve the script of each project, then start the render.',
    };
  }

  /** Queues the render of the project's approved script. Refused until a person has approved the script. */
  async startRender(projectId: string): Promise<BackgroundJob> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Video project "${projectId}" not found`);

    const script = await this.scriptRepo.findOne({
      where: { video_project_id: projectId, status: ScriptStatus.Approved },
      order: { version: 'DESC' },
    });
    if (!script) throw new BadRequestException('Approve the script first: there is no approved script for this project.');
    if (!specFromScript(script)) throw new BadRequestException('This project was not created from the Countryballs form.');
    if (!RENDERABLE_FROM.has(project.status)) {
      throw new BadRequestException(`Cannot start a render while the project is "${project.status}".`);
    }

    const active = await this.jobRepo.findOne({
      where: {
        video_project_id: projectId,
        job_type: JobType.CountryballsRender,
        status: In([JobStatus.Pending, JobStatus.Processing]),
      },
    });
    if (active) throw new ConflictException(`A render for this project is already ${active.status} (job ${active.id}).`);

    const baseKey = `countryballs:${projectId}:${script.id}`;
    let job = await this.jobsService.enqueue({
      jobType: JobType.CountryballsRender,
      videoProjectId: projectId,
      payload: { scriptId: script.id },
      idempotencyKey: baseKey,
      maxAttempts: 2,
    });
    // The same key returns the earlier job. Re-rendering after a failure, cancellation or a rejected render is
    // allowed, so that case gets a fresh job (still one active job at a time per key).
    const rerender = job.status === JobStatus.Failed || job.status === JobStatus.Cancelled || job.status === JobStatus.Completed;
    if (rerender) {
      job = await this.jobsService.enqueue({
        jobType: JobType.CountryballsRender,
        videoProjectId: projectId,
        payload: { scriptId: script.id },
        idempotencyKey: `${baseKey}:${Date.now()}`,
        maxAttempts: 2,
      });
    }
    project.status = VideoProjectStatus.ReadyToRender;
    await this.projectRepo.save(project);
    return job;
  }

  private async resolveChannel(requested?: string): Promise<string> {
    const id = requested?.trim();
    if (id) {
      const channel = await this.channelRepo.findOne({ where: { id } });
      if (!channel) throw new BadRequestException(`Channel profile "${id}" not found`);
      return channel.id;
    }
    const first = await this.channelRepo.find({ order: { created_at: 'ASC' }, take: 1 });
    if (!first.length) throw new BadRequestException('Create a channel profile first (Channels page).');
    return first[0].id;
  }
}
