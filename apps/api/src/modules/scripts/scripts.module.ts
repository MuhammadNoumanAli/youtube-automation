import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScriptsController } from './scripts.controller';
import { ScriptsService } from './scripts.service';
import { Script } from '../../database/entities/script.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Script, VideoProject, AuditEvent]),
    AiProvidersModule,
  ],
  controllers: [ScriptsController],
  providers: [ScriptsService],
  exports: [ScriptsService],
})
export class ScriptsModule {}
