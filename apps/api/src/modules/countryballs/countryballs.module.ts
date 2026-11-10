import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { BackgroundJob } from '../../database/entities/background-job.entity';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { Script } from '../../database/entities/script.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { JobsModule } from '../jobs/jobs.module';
import { VideosModule } from '../videos/videos.module';
import { CountryballsController } from './countryballs.controller';
import { CountryballsRunnerModule } from './countryballs-runner.module';
import { CountryballsService } from './countryballs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoProject, ChannelProfile, Script, AuditEvent, BackgroundJob]),
    VideosModule,
    JobsModule,
    CountryballsRunnerModule,
  ],
  controllers: [CountryballsController],
  providers: [CountryballsService],
})
export class CountryballsModule {}
