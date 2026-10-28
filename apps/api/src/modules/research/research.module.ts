import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { ResearchSource } from '../../database/entities/research-source.entity';
import { VideoProject } from '../../database/entities/video-project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ResearchSource, VideoProject])],
  controllers: [ResearchController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
