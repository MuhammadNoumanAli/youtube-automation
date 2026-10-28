import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { Asset } from '../../database/entities/asset.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, VideoProject, AuditEvent])],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
