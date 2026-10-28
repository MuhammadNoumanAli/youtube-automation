import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { VideoProject } from '../../database/entities/video-project.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VideoProject, AuditEvent])],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
