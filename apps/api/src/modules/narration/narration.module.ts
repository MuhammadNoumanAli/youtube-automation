import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NarrationController } from './narration.controller';
import { NarrationService } from './narration.service';
import { MockTtsProvider } from './mock-tts.provider';
import { Narration } from '../../database/entities/narration.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { Script } from '../../database/entities/script.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Narration, VideoProject, Script, AuditEvent])],
  controllers: [NarrationController],
  providers: [NarrationService, MockTtsProvider],
  exports: [NarrationService, MockTtsProvider],
})
export class NarrationModule {}
