import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalRecord } from '../../database/entities/approval-record.entity';
import { Asset } from '../../database/entities/asset.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { Narration } from '../../database/entities/narration.entity';
import { RenderJob } from '../../database/entities/render-job.entity';
import { Script } from '../../database/entities/script.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { NarrationModule } from '../narration/narration.module';
import { RenderingModule } from '../rendering/rendering.module';
import { ScriptsModule } from '../scripts/scripts.module';
import { VideosModule } from '../videos/videos.module';
import { MagicVideoController } from './magic-video.controller';
import { MagicVideoService } from './magic-video.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VideoProject,
      ChannelProfile,
      Script,
      Narration,
      Asset,
      RenderJob,
      ApprovalRecord,
      AuditEvent,
    ]),
    VideosModule,
    ScriptsModule,
    NarrationModule,
    RenderingModule,
  ],
  controllers: [MagicVideoController],
  providers: [MagicVideoService],
  exports: [MagicVideoService],
})
export class MagicVideoModule {}
