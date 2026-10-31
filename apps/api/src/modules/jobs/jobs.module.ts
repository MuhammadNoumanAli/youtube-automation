import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackgroundJob } from '../../database/entities/background-job.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { JobsService } from './jobs.service';
import { MaintenanceService } from './maintenance.service';
import { JobWorkerService } from './job-worker.service';
import { JobsController } from './jobs.controller';
import { RenderingModule } from '../rendering/rendering.module';
import { YouTubeModule } from '../youtube/youtube.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BackgroundJob, AuditEvent]),
    RenderingModule,
    YouTubeModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, MaintenanceService, JobWorkerService],
  exports: [JobsService, MaintenanceService],
})
export class JobsModule {}
