import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChannelProfile } from './entities/channel-profile.entity';
import { VideoProject } from './entities/video-project.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { Topic } from './entities/topic.entity';
import { ResearchSource } from './entities/research-source.entity';
import { Script } from './entities/script.entity';
import { Asset } from './entities/asset.entity';
import { Narration } from './entities/narration.entity';
import { RenderJob } from './entities/render-job.entity';
import { ApprovalRecord } from './entities/approval-record.entity';
import { UploadRecord } from './entities/upload-record.entity';
import { BackgroundJob } from './entities/background-job.entity';

export const entities = [
  ChannelProfile,
  VideoProject,
  AuditEvent,
  Topic,
  ResearchSource,
  Script,
  Asset,
  Narration,
  RenderJob,
  ApprovalRecord,
  UploadRecord,
  BackgroundJob,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get<string>('DB_USERNAME', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'youtube_automation'),
        entities,
        synchronize: false,
        logging: config.get<boolean>('DB_LOGGING', false),
        autoLoadEntities: true,
      }),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
