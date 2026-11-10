import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { RenderJob } from '../../database/entities/render-job.entity';
import { Script } from '../../database/entities/script.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { RenderingModule } from '../rendering/rendering.module';
import { CountryballsRunnerService } from './countryballs-runner.service';

/**
 * The part of Countryballs the background worker needs. Kept separate from CountryballsModule (which enqueues jobs
 * and so imports JobsModule) to avoid a circular module import.
 */
@Module({
  imports: [TypeOrmModule.forFeature([VideoProject, Script, RenderJob, AuditEvent]), RenderingModule],
  providers: [CountryballsRunnerService],
  exports: [CountryballsRunnerService],
})
export class CountryballsRunnerModule {}
