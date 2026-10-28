import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChannelProfile } from './entities/channel-profile.entity';
import { VideoProject } from './entities/video-project.entity';
import { AuditEvent } from './entities/audit-event.entity';

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
        entities: [ChannelProfile, VideoProject, AuditEvent],
        synchronize: false,
        logging: config.get<boolean>('DB_LOGGING', false),
        autoLoadEntities: true,
      }),
    }),
    TypeOrmModule.forFeature([ChannelProfile, VideoProject, AuditEvent]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
