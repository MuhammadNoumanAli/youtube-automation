import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RenderJob } from '../../database/entities/render-job.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { Script } from '../../database/entities/script.entity';
import { Narration } from '../../database/entities/narration.entity';
import { Asset } from '../../database/entities/asset.entity';
import { ApprovalRecord } from '../../database/entities/approval-record.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { NarrationModule } from '../narration/narration.module';
import { RenderingService } from './rendering.service';
import { RenderingController } from './rendering.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RenderJob,
      VideoProject,
      Script,
      Narration,
      Asset,
      ApprovalRecord,
      AuditEvent,
    ]),
    NarrationModule,
  ],
  controllers: [RenderingController],
  providers: [RenderingService],
  exports: [RenderingService],
})
export class RenderingModule {}
