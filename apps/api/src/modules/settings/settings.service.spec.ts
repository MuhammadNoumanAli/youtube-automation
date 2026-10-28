import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let configServiceMock: { get: jest.Mock };

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          NODE_ENV: 'test',
          TEXT_PROVIDER: 'mock',
          TTS_PROVIDER: 'mock',
          OPENAI_API_KEY: '',
          ANTHROPIC_API_KEY: '',
          TTS_API_KEY: '',
          YOUTUBE_CLIENT_ID: '',
          YOUTUBE_CLIENT_SECRET: '',
          YOUTUBE_TOKEN_ENCRYPTION_KEY: '',
          ENABLE_EXTERNAL_API_CALLS: false,
          ENABLE_YOUTUBE_UPLOADS: false,
          ENABLE_PUBLIC_RELEASE: false,
          FFMPEG_PATH: 'ffmpeg',
          FFPROBE_PATH: '',
        };
        return key in configMap ? configMap[key] : defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should report safe configuration without exposing secret values', () => {
    const status = service.getStatus();
    expect(status.environment).toBe('test');
    expect(status.features.publicReleaseEnabled).toBe(false);
    expect(status.features.youtubeUploadsEnabled).toBe(false);
    expect(status.features.externalApiCallsEnabled).toBe(false);
    expect(status.providers.text.activeProvider).toBe('mock');
    expect(status.providers.text.mockAvailable).toBe(true);
    expect(status.providers.text.openaiConfigured).toBe(false);
    expect(status.providers.youtube.oauthConfigured).toBe(false);
    expect(status).not.toHaveProperty('OPENAI_API_KEY');
    expect(status).not.toHaveProperty('YOUTUBE_CLIENT_SECRET');
  });
});
