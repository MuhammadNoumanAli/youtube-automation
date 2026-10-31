import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  BackgroundJob,
  JobStatus,
  JobType,
} from '../../database/entities/background-job.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

export interface EnqueueJobOptions {
  jobType: JobType;
  videoProjectId?: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;

  constructor(
    @InjectRepository(BackgroundJob)
    private readonly jobRepo: Repository<BackgroundJob>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
  ) {}

  getWorkerId(): string {
    return this.workerId;
  }

  async enqueue(options: EnqueueJobOptions): Promise<BackgroundJob> {
    const { jobType, videoProjectId, payload, idempotencyKey, maxAttempts = 3 } = options;

    if (idempotencyKey) {
      const existing = await this.jobRepo.findOne({
        where: { idempotency_key: idempotencyKey },
      });
      if (existing) {
        if (existing.status === JobStatus.Completed) {
          this.logger.log(`Idempotent job hit: key=${idempotencyKey} already completed`);
          return existing;
        }
        if (existing.status === JobStatus.Processing || existing.status === JobStatus.Pending) {
          throw new ConflictException(
            `Job with idempotency key '${idempotencyKey}' is already active (${existing.status})`,
          );
        }
        // If failed or cancelled and user re-triggers with same key, return the existing record
        return existing;
      }
    }

    const job = this.jobRepo.create({
      id: randomUUID(),
      job_type: jobType,
      status: JobStatus.Pending,
      idempotency_key: idempotencyKey || null,
      video_project_id: videoProjectId || null,
      payload_json: payload,
      max_attempts: maxAttempts,
      attempt_count: 0,
      next_retry_at: new Date(),
    });

    const saved = await this.jobRepo.save(job);

    await this.auditRepo.save({
      actor: 'studio-user',
      action: 'job_enqueued',
      entity_type: 'background_job',
      entity_id: saved.id,
      details_json: {
        job_type: saved.job_type,
        video_project_id: saved.video_project_id,
        idempotency_key: saved.idempotency_key,
      },
    });

    return saved;
  }

  /**
   * Acquire a lease on the next eligible job atomically.
   * Lock duration is in seconds (default 300s = 5 minutes).
   */
  async acquireNextJob(lockDurationSeconds = 300): Promise<BackgroundJob | null> {
    const now = new Date();
    const lockExpiry = new Date(now.getTime() + lockDurationSeconds * 1000);

    // Find candidate pending/retryable jobs or expired locked jobs
    const candidate = await this.jobRepo
      .createQueryBuilder('job')
      .where('(job.status = :pending AND (job.next_retry_at IS NULL OR job.next_retry_at <= :now))', {
        pending: JobStatus.Pending,
        now,
      })
      .orWhere('(job.status = :processing AND job.lock_expires_at <= :now)', {
        processing: JobStatus.Processing,
        now,
      })
      .orderBy('job.created_at', 'ASC')
      .getOne();

    if (!candidate) {
      return null;
    }

    // Atomic update with lease lock
    const updateResult = await this.jobRepo
      .createQueryBuilder()
      .update(BackgroundJob)
      .set({
        status: JobStatus.Processing,
        locked_by: this.workerId,
        locked_at: now,
        lock_expires_at: lockExpiry,
        attempt_count: candidate.attempt_count + 1,
      })
      .where('id = :id AND (status = :pending OR (status = :processing AND lock_expires_at <= :now))', {
        id: candidate.id,
        pending: candidate.status,
        processing: JobStatus.Processing,
        now,
      })
      .execute();

    if (updateResult.affected === 0) {
      // Race condition lost to another concurrent worker
      return null;
    }

    return this.jobRepo.findOne({ where: { id: candidate.id } });
  }

  async completeJob(jobId: string, result?: Record<string, unknown>): Promise<BackgroundJob> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    job.status = JobStatus.Completed;
    job.result_json = result || null;
    job.locked_by = null;
    job.lock_expires_at = null;
    job.last_error = null;

    const saved = await this.jobRepo.save(job);

    await this.auditRepo.save({
      actor: this.workerId,
      action: 'job_completed',
      entity_type: 'background_job',
      entity_id: saved.id,
      details_json: {
        job_type: saved.job_type,
        video_project_id: saved.video_project_id,
        attempts: saved.attempt_count,
      },
    });

    return saved;
  }

  async failJob(jobId: string, errorMessage: string): Promise<BackgroundJob> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    job.last_error = errorMessage;
    job.locked_by = null;
    job.lock_expires_at = null;

    if (job.attempt_count >= job.max_attempts) {
      job.status = JobStatus.Failed;
      job.next_retry_at = null;
      this.logger.error(`Job ${jobId} permanently failed after ${job.attempt_count} attempts: ${errorMessage}`);
    } else {
      job.status = JobStatus.Pending;
      // Exponential backoff: 2^attempts * 15 seconds (15s, 30s, 60s, etc.)
      const backoffSecs = Math.pow(2, job.attempt_count) * 15;
      job.next_retry_at = new Date(Date.now() + backoffSecs * 1000);
      this.logger.warn(`Job ${jobId} failed (attempt ${job.attempt_count}/${job.max_attempts}). Retrying in ${backoffSecs}s: ${errorMessage}`);
    }

    const saved = await this.jobRepo.save(job);

    await this.auditRepo.save({
      actor: this.workerId,
      action: saved.status === JobStatus.Failed ? 'job_permanently_failed' : 'job_retry_scheduled',
      entity_type: 'background_job',
      entity_id: saved.id,
      details_json: {
        job_type: saved.job_type,
        attempt: saved.attempt_count,
        max_attempts: saved.max_attempts,
        next_retry_at: saved.next_retry_at,
        error: errorMessage,
      },
    });

    return saved;
  }

  async cancelJob(jobId: string, reason = 'Cancelled by user'): Promise<BackgroundJob> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    if (job.status === JobStatus.Completed) {
      throw new BadRequestException('Cannot cancel a completed job');
    }

    job.status = JobStatus.Cancelled;
    job.last_error = reason;
    job.locked_by = null;
    job.lock_expires_at = null;

    const saved = await this.jobRepo.save(job);

    await this.auditRepo.save({
      actor: 'studio-user',
      action: 'job_cancelled',
      entity_type: 'background_job',
      entity_id: saved.id,
      details_json: { reason },
    });

    return saved;
  }

  async listJobs(limit = 50): Promise<BackgroundJob[]> {
    return this.jobRepo.find({
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  async getJob(id: string): Promise<BackgroundJob> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async listAuditEvents(limit = 50): Promise<AuditEvent[]> {
    return this.auditRepo.find({
      order: { created_at: 'DESC' },
      take: limit,
    });
  }
}
