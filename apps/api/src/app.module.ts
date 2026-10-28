import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { TopicsModule } from './modules/topics/topics.module';
import { VideosModule } from './modules/videos/videos.module';
import { ResearchModule } from './modules/research/research.module';
import { AiProvidersModule } from './modules/ai-providers/ai-providers.module';
import { ScriptsModule } from './modules/scripts/scripts.module';

import { AssetsModule } from './modules/assets/assets.module';
import { NarrationModule } from './modules/narration/narration.module';
import { RenderingModule } from './modules/rendering/rendering.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env'),
      ],
    }),
    DatabaseModule,
    HealthModule,
    SettingsModule,
    ChannelsModule,
    TopicsModule,
    VideosModule,
    ResearchModule,
    AiProvidersModule,
    ScriptsModule,
    AssetsModule,
    NarrationModule,
    RenderingModule,
  ],
})
export class AppModule {}
