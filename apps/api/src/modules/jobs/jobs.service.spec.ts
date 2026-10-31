import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import {
  BackgroundJob,
  JobStatus,
  JobType,
} from '../../database/entities/background-job.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

describe('JobsService', () => {
  let service: JobsService;

  const mockJobRepo = {
    create: jest.fn().mockImplementation((dto) => ({ ...dto })),
    save: jest.fn().mockImplementation(async (entity) => ({ ...entity, id: entity.id || 'job-uuid-1' })),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAuditRepo = {
    save: jest.fn().mockImplementation(async (e) => ({ ...e, id: 'audit-uuid-1' })),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: getRepositoryToken(BackgroundJob),
          useValue: mockJobRepo,
        },
        {
          provide: getRepositoryToken(AuditEvent),
          useValue: mockAuditRepo,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('should be defined with unique workerId', () => {
    expect(service).toBeDefined();
    expect(service.getWorkerId()).toContain('worker-');
  });

  describe('enqueue', () => {
    it('should create and persist a new pending job and audit event', async () => {
      mockJobRepo.findOne.mockResolvedValue(null);

      const job = await service.enqueue({
        jobType: JobType.Render,
        videoProjectId: 'proj-123',
        payload: { fps: 30 },
      });

      expect(job.status).toBe(JobStatus.Pending);
      expect(job.job_type).toBe(JobType.Render);
      expect(mockJobRepo.save).toHaveBeenCalled();
      expect(mockAuditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'job_enqueued',
          entity_type: 'background_job',
        }),
      );
    });

    it('should prevent duplicate active jobs when idempotency key is active', async () => {
      mockJobRepo.findOne.mockResolvedValue({
        id: 'existing-job',
        idempotency_key: 'idem-key-1',
        status: JobStatus.Processing,
      });

      await expect(
        service.enqueue({
          jobType: JobType.Upload,
          idempotencyKey: 'idem-key-1',
          payload: {},
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should return existing completed job when idempotency key hit', async () => {
      const existing = {
        id: 'existing-job',
        idempotency_key: 'idem-key-1',
        status: JobStatus.Completed,
      };
      mockJobRepo.findOne.mockResolvedValue(existing);

      const res = await service.enqueue({
        jobType: JobType.Upload,
        idempotencyKey: 'idem-key-1',
        payload: {},
      });

      expect(res).toBe(existing);
      expect(mockJobRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('failJob', () => {
    it('should schedule retry with backoff when attempts remain', async () => {
      const existingJob: Partial<BackgroundJob> = {
        id: 'job-1',
        attempt_count: 1,
        max_attempts: 3,
        status: JobStatus.Processing,
      };
      mockJobRepo.findOne.mockResolvedValue(existingJob);

      const failed = await service.failJob('job-1', 'Network timeout');

      expect(failed.status).toBe(JobStatus.Pending);
      expect(failed.last_error).toBe('Network timeout');
      expect(failed.next_retry_at).toBeDefined();
      expect(failed.next_retry_at!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should mark job permanently failed when max attempts exhausted', async () => {
      const existingJob: Partial<BackgroundJob> = {
        id: 'job-1',
        attempt_count: 3,
        max_attempts: 3,
        status: JobStatus.Processing,
      };
      mockJobRepo.findOne.mockResolvedValue(existingJob);

      const failed = await service.failJob('job-1', 'Fatal rendering error');

      expect(failed.status).toBe(JobStatus.Failed);
      expect(failed.next_retry_at).toBeNull();
    });
  });

  describe('completeJob', () => {
    it('should mark job completed and store result payload', async () => {
      const existingJob: Partial<BackgroundJob> = {
        id: 'job-1',
        status: JobStatus.Processing,
      };
      mockJobRepo.findOne.mockResolvedValue(existingJob);

      const completed = await service.completeJob('job-1', { videoId: 'yt-123' });

      expect(completed.status).toBe(JobStatus.Completed);
      expect(completed.result_json).toEqual({ videoId: 'yt-123' });
      expect(mockAuditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'job_completed' }),
      );
    });
  });

  describe('cancelJob', () => {
    it('should cancel active job and record reason', async () => {
      const existingJob: Partial<BackgroundJob> = {
        id: 'job-1',
        status: JobStatus.Pending,
      };
      mockJobRepo.findOne.mockResolvedValue(existingJob);

      const cancelled = await service.cancelJob('job-1', 'User stopped');

      expect(cancelled.status).toBe(JobStatus.Cancelled);
      expect(cancelled.last_error).toBe('User stopped');
    });
  });
});
