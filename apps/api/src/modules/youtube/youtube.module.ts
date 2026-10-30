import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadRecord } from '../../database/entities/upload-record.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { RenderJob } from '../../database/entities/render-job.entity';
import { Script } from '../../database/entities/script.entity';
import { ApprovalRecord } from '../../database/entities/approval-record.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { TokenEncryptionService } from './token-encryption.service';
import { YouTubeOAuthService } from './youtube-oauth.service';
import { YouTubeUploadService } from './youtube-upload.service';
import { YouTubeController } from './youtube.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UploadRecord,
      VideoProject,
      ChannelProfile,
      RenderJob,
      Script,
      ApprovalRecord,
      AuditEvent,
    ]),
  ],
  controllers: [YouTubeController],
  providers: [TokenEncryptionService, YouTubeOAuthService, YouTubeUploadService],
  exports: [TokenEncryptionService, YouTubeOAuthService, YouTubeUploadService],
})
export class YouTubeModule {}
