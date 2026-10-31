import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobStatus, JobType } from '../../database/entities/background-job.entity';
import { RenderingService } from '../rendering/rendering.service';
import { YouTubeUploadService } from '../youtube/youtube-upload.service';
import { MaintenanceService } from './maintenance.service';

@Injectable()
export class JobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobWorkerService.name);
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 4000; // Poll every 4 seconds

  constructor(
    private readonly jobsService: JobsService,
    private readonly renderingService: RenderingService,
    private readonly youtubeUploadService: YouTubeUploadService,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  onModuleInit() {
    this.startWorker();
  }

  onModuleDestroy() {
    this.stopWorker();
  }

  startWorker() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.log(`Background Job Worker started [workerId=${this.jobsService.getWorkerId()}]`);
    this.scheduleNextTick(1000);
  }

  stopWorker() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger.log('Background Job Worker stopped');
  }

  private scheduleNextTick(delayMs: number) {
    if (!this.isRunning) return;
    this.pollTimer = setTimeout(() => {
      this.tick().finally(() => {
        this.scheduleNextTick(this.pollIntervalMs);
      });
    }, delayMs);
  }

  async tick() {
    if (!this.isRunning) return;

    try {
      const job = await this.jobsService.acquireNextJob(300);
      if (!job) {
        return; // No jobs ready
      }

      this.logger.log(`Processing job: id=${job.id} type=${job.job_type} attempt=${job.attempt_count}`);

      try {
        let result: Record<string, unknown> = {};

        switch (job.job_type) {
          case JobType.Render: {
            if (!job.video_project_id) throw new Error('video_project_id is required for render job');
            const fps = (job.payload_json?.fps as number) || 30;
            const renderResult = await this.renderingService.renderProject(job.video_project_id, { fps });
            result = {
              renderJobId: renderResult.id,
              outputPath: renderResult.output_path,
              status: renderResult.status,
              durationSeconds: renderResult.validation_json?.durationSeconds,
            };
            break;
          }

          case JobType.Upload: {
            if (!job.video_project_id) throw new Error('video_project_id is required for upload job');
            const uploadDto = {
              title: job.payload_json?.title as string | undefined,
              description: job.payload_json?.description as string | undefined,
              tags: job.payload_json?.tags as string[] | undefined,
            };
            const uploadResult = await this.youtubeUploadService.uploadVideoToYouTube(
              job.video_project_id,
              uploadDto,
            );
            result = {
              uploadRecordId: uploadResult.id,
              youtubeVideoId: uploadResult.youtube_video_id,
              status: uploadResult.upload_status,
              privacyStatus: uploadResult.privacy_status,
            };
            break;
          }

          case JobType.Maintenance: {
            const maxAge = (job.payload_json?.maxAgeHours as number) || 24;
            const cleanupResult = await this.maintenanceService.cleanScratchFiles(maxAge);
            result = {
              filesDeleted: cleanupResult.filesDeleted,
              bytesFreed: cleanupResult.bytesFreed,
              errors: cleanupResult.errors,
            };
            break;
          }

          default:
            throw new Error(`Unsupported job type: ${job.job_type}`);
        }

        await this.jobsService.completeJob(job.id, result);
        this.logger.log(`Job completed successfully: id=${job.id}`);
      } catch (err: any) {
        this.logger.error(`Job execution error on id=${job.id}: ${err.message}`, err.stack);
        await this.jobsService.failJob(job.id, err.message || 'Unknown execution error');
      }
    } catch (err: any) {
      this.logger.error(`Error in worker tick: ${err.message}`);
    }
  }
}
