import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';
import { Topic } from '../../database/entities/topic.entity';
import { VideoProject } from '../../database/entities/video-project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Topic, VideoProject])],
  controllers: [TopicsController],
  providers: [TopicsService],
  exports: [TopicsService],
})
export class TopicsModule {}
