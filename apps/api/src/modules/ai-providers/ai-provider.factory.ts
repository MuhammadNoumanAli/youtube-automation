import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockTextProvider } from './mock-text.provider';
import { TextGenerationProvider } from './text-generation.provider';

@Injectable()
export class AiProviderFactory {
  private readonly logger = new Logger(AiProviderFactory.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mockTextProvider: MockTextProvider,
  ) {}

  getTextProvider(): TextGenerationProvider {
    const textProvider = this.configService.get<string>('TEXT_PROVIDER', 'mock');
    const allowExternal = this.configService.get<boolean>('ENABLE_EXTERNAL_API_CALLS', false);

    if (!allowExternal || textProvider === 'mock') {
      return this.mockTextProvider;
    }

    this.logger.warn(
      `External provider "${textProvider}" requested, but external calls are guarded or adapters pending. Falling back to MockTextProvider.`,
    );
    return this.mockTextProvider;
  }
}
