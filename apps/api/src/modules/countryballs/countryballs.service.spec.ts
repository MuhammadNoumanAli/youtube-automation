import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { BackgroundJob, JobStatus, JobType } from '../../database/entities/background-job.entity';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { VideoFormat, VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { JobsService } from '../jobs/jobs.service';
import { VideosService } from '../videos/videos.service';
import { CountryballsRunnerService } from './countryballs-runner.service';
import { CountryballsService } from './countryballs.service';
import { buildSpec } from './countryballs-spec';
import { sampleForm } from './countryballs.fixtures';
import { CountryballsFormat } from './dto/create-countryballs.dto';

describe('CountryballsService', () => {
  let service: CountryballsService;
  let projects: Record<string, any>;
  let savedScripts: any[];
  let counter: number;
  const projectRepo = { findOne: jest.fn(), save: jest.fn(async (p) => p) };
  const channelRepo = { findOne: jest.fn(), find: jest.fn() };
  const scriptRepo = {
    create: jest.fn((e) => ({ ...e })),
    save: jest.fn(async (e) => {
      const s = { id: `script-${savedScripts.length + 1}`, ...e };
      savedScripts.push(s);
      return s;
    }),
    findOne: jest.fn(),
  };
  const auditRepo = { create: jest.fn((e) => e), save: jest.fn(async (e) => e) };
  const jobRepo = { findOne: jest.fn() };
  const videosService = {
    create: jest.fn(async (dto) => {
      const p = { id: `proj-${++counter}`, ...dto };
      projects[p.id] = p;
      return p;
    }),
  };
  const jobsService = { enqueue: jest.fn() };
  const runner = { status: jest.fn(() => ({ appFound: true, appDir: '/a', studioRoot: '/s', fakeVoices: false })) };

  beforeEach(async () => {
    jest.clearAllMocks();
    projects = {};
    savedScripts = [];
    counter = 0;
    channelRepo.find.mockResolvedValue([{ id: 'chan-1' }]);
    channelRepo.findOne.mockResolvedValue(null);
    jobRepo.findOne.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CountryballsService,
        { provide: getRepositoryToken(VideoProject), useValue: projectRepo },
        { provide: getRepositoryToken(ChannelProfile), useValue: channelRepo },
        { provide: getRepositoryToken(Script), useValue: scriptRepo },
        { provide: getRepositoryToken(AuditEvent), useValue: auditRepo },
        { provide: getRepositoryToken(BackgroundJob), useValue: jobRepo },
        { provide: VideosService, useValue: videosService },
        { provide: JobsService, useValue: jobsService },
        { provide: CountryballsRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(CountryballsService);
  });

  describe('create', () => {
    it('"both" creates a Short and a Long project sharing one spec id, each with a script in REVIEW', async () => {
      const result = await service.create(sampleForm({ format: CountryballsFormat.Both, tags: ['dutch'] }));
      expect(result.projects).toHaveLength(2);
      expect(result.projects.map((p) => [p.format, p.aspect])).toEqual([
        [VideoFormat.Short, '9:16'],
        [VideoFormat.LongForm, '16:9'],
      ]);
      expect(result.spec_id).toMatch(/^cb-[0-9a-f]{12}$/);
      expect(savedScripts).toHaveLength(2);
      for (const s of savedScripts) {
        expect(s.status).toBe(ScriptStatus.Review);
        expect(s.provider).toBe('countryballs-form');
        expect(s.metadata_json.countryballsSpec.id).toBe(result.spec_id);
        expect(s.metadata_json.tags).toEqual(['dutch']);
        expect(s.content).toContain('Netherlands');
      }
      expect(savedScripts[0].metadata_json.countryballsSpec.format).toBe('9:16');
      expect(savedScripts[1].metadata_json.countryballsSpec.format).toBe('16:9');
      for (const p of Object.values(projects)) expect(p.status).toBe(VideoProjectStatus.ScriptReview);
      expect(jobsService.enqueue).not.toHaveBeenCalled(); // nothing is rendered before approval
      expect(auditRepo.create.mock.calls.map((c) => c[0].action)).toEqual(['COUNTRYBALLS_PROJECT_CREATED', 'COUNTRYBALLS_PROJECT_CREATED']);
    });

    it('"short" creates one 9:16 project', async () => {
      const result = await service.create(sampleForm({ format: CountryballsFormat.Short }));
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].aspect).toBe('9:16');
    });

    it('turns spec problems into a 400 and saves nothing', async () => {
      const bad = sampleForm({ scenes: [{ type: 'map-focus', countries: ['netherlands'], lines: [{ speaker: 'narrator', text: 'x' }] }] as any });
      await expect(service.create(bad)).rejects.toThrow(BadRequestException);
      expect(videosService.create).not.toHaveBeenCalled();
    });

    it('requires an existing channel', async () => {
      channelRepo.find.mockResolvedValue([]);
      await expect(service.create(sampleForm())).rejects.toThrow(/Create a channel profile first/);
      await expect(service.create(sampleForm({ channel_profile_id: 'nope' }))).rejects.toThrow(/not found/);
    });
  });

  describe('startRender', () => {
    const spec = buildSpec(sampleForm(), 'cb-abc', '9:16');
    const approved = { id: 'script-9', status: ScriptStatus.Approved, metadata_json: { countryballsSpec: spec } };

    beforeEach(() => {
      projectRepo.findOne.mockResolvedValue({ id: 'proj-1', status: VideoProjectStatus.ScriptApproved });
      scriptRepo.findOne.mockResolvedValue(approved);
      jobsService.enqueue.mockImplementation(async (o) => ({ id: 'job-1', status: JobStatus.Pending, ...o }));
    });

    it('refuses until a person has approved the script', async () => {
      scriptRepo.findOne.mockResolvedValue(null);
      await expect(service.startRender('proj-1')).rejects.toThrow(/Approve the script first/);
      expect(jobsService.enqueue).not.toHaveBeenCalled();
    });

    it('refuses projects that did not come from the form', async () => {
      scriptRepo.findOne.mockResolvedValue({ id: 's', status: ScriptStatus.Approved, metadata_json: { title: 'x' } });
      await expect(service.startRender('proj-1')).rejects.toThrow(/not created from the Countryballs form/);
    });

    it('refuses while a render is already queued or running', async () => {
      jobRepo.findOne.mockResolvedValue({ id: 'job-0', status: JobStatus.Processing });
      await expect(service.startRender('proj-1')).rejects.toThrow(ConflictException);
    });

    it('refuses in states where rendering makes no sense (e.g. already uploaded)', async () => {
      projectRepo.findOne.mockResolvedValue({ id: 'proj-1', status: VideoProjectStatus.UploadedPrivate });
      await expect(service.startRender('proj-1')).rejects.toThrow(/uploaded_private/);
    });

    it('queues one countryballs job with an idempotency key and marks the project ready to render', async () => {
      const job = await service.startRender('proj-1');
      expect(jobsService.enqueue).toHaveBeenCalledTimes(1);
      expect(jobsService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: JobType.CountryballsRender,
          videoProjectId: 'proj-1',
          payload: { scriptId: 'script-9' },
          idempotencyKey: 'countryballs:proj-1:script-9',
          maxAttempts: 2,
        }),
      );
      expect(job.status).toBe(JobStatus.Pending);
      expect(projectRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: VideoProjectStatus.ReadyToRender }));
    });

    it('allows a re-render after a failed job with a fresh key', async () => {
      jobsService.enqueue
        .mockResolvedValueOnce({ id: 'job-old', status: JobStatus.Failed })
        .mockImplementationOnce(async (o) => ({ id: 'job-new', status: JobStatus.Pending, ...o }));
      const job = await service.startRender('proj-1');
      expect(job.id).toBe('job-new');
      expect(jobsService.enqueue.mock.calls[1][0].idempotencyKey).toMatch(/^countryballs:proj-1:script-9:\d+$/);
    });
  });

  it('options lists the form choices and the animation app status', () => {
    const o = service.options();
    expect(o.countries.map((c) => c.id)).toContain('netherlands');
    expect(o.formats.map((f) => f.id)).toEqual(['short', 'long_form', 'both']);
    expect(o.animation.appFound).toBe(true);
  });
});
