import { Module } from '@nestjs/common';
import { MockTextProvider } from './mock-text.provider';
import { AiProviderFactory } from './ai-provider.factory';

@Module({
  providers: [MockTextProvider, AiProviderFactory],
  exports: [MockTextProvider, AiProviderFactory],
})
export class AiProvidersModule {}
