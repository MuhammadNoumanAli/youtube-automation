import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SafeSettingsStatus {
  environment: string;
  features: {
    externalApiCallsEnabled: boolean;
    youtubeUploadsEnabled: boolean;
    publicReleaseEnabled: boolean;
  };
  providers: {
    text: {
      activeProvider: string;
      mockAvailable: boolean;
      openaiConfigured: boolean;
      anthropicConfigured: boolean;
    };
    tts: {
      activeProvider: string;
      mockAvailable: boolean;
      elevenLabsConfigured: boolean;
    };
    youtube: {
      oauthConfigured: boolean;
      redirectUri: string;
      tokenEncryptionConfigured: boolean;
    };
  };
  rendering: {
    ffmpegConfigured: boolean;
    ffmpegPath: string;
    ffprobeConfigured: boolean;
  };
}

@Injectable()
export class SettingsService {
  constructor(private readonly config: ConfigService) {}

  getStatus(): SafeSettingsStatus {
    const textProvider = this.config.get<string>('TEXT_PROVIDER', 'mock');
    const ttsProvider = this.config.get<string>('TTS_PROVIDER', 'mock');
    const openAiKey = this.config.get<string>('OPENAI_API_KEY');
    const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY');
    const ttsKey = this.config.get<string>('TTS_API_KEY');
    const youtubeClientId = this.config.get<string>('YOUTUBE_CLIENT_ID');
    const youtubeClientSecret = this.config.get<string>('YOUTUBE_CLIENT_SECRET');
    const encryptionKey = this.config.get<string>('YOUTUBE_TOKEN_ENCRYPTION_KEY');
    const ffmpegPath = this.config.get<string>('FFMPEG_PATH', 'ffmpeg');
    const ffprobePath = this.config.get<string>('FFPROBE_PATH');

    return {
      environment: this.config.get<string>('NODE_ENV', 'development'),
      features: {
        externalApiCallsEnabled: this.config.get<boolean>('ENABLE_EXTERNAL_API_CALLS', false),
        youtubeUploadsEnabled: this.config.get<boolean>('ENABLE_YOUTUBE_UPLOADS', false),
        publicReleaseEnabled: this.config.get<boolean>('ENABLE_PUBLIC_RELEASE', false),
      },
      providers: {
        text: {
          activeProvider: textProvider,
          mockAvailable: true,
          openaiConfigured: Boolean(openAiKey && openAiKey.trim().length > 0),
          anthropicConfigured: Boolean(anthropicKey && anthropicKey.trim().length > 0),
        },
        tts: {
          activeProvider: ttsProvider,
          mockAvailable: true,
          elevenLabsConfigured: Boolean(ttsKey && ttsKey.trim().length > 0),
        },
        youtube: {
          oauthConfigured: Boolean(
            youtubeClientId &&
              youtubeClientId.trim().length > 0 &&
              youtubeClientSecret &&
              youtubeClientSecret.trim().length > 0,
          ),
          redirectUri: this.config.get<string>(
            'YOUTUBE_REDIRECT_URI',
            'http://localhost:3000/api/youtube/oauth/callback',
          ),
          tokenEncryptionConfigured: Boolean(encryptionKey && encryptionKey.trim().length === 64),
        },
      },
      rendering: {
        ffmpegConfigured: Boolean(ffmpegPath && ffmpegPath.length > 0),
        ffmpegPath: ffmpegPath,
        ffprobeConfigured: Boolean(ffprobePath && ffprobePath.length > 0),
      },
    };
  }
}
