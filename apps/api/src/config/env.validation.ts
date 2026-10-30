import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum TextProvider {
  Mock = 'mock',
  OpenAI = 'openai',
  Anthropic = 'anthropic',
}

export enum TtsProvider {
  Mock = 'mock',
  ElevenLabs = 'elevenlabs',
  Local = 'local',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  HOST: string = '127.0.0.1';

  @IsString()
  @IsOptional()
  WEB_ORIGIN: string = 'http://localhost:5173';

  @IsString()
  @IsOptional()
  API_BASE_URL: string = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  DB_HOST: string = '127.0.0.1';

  @IsNumber()
  @IsOptional()
  DB_PORT: number = 3306;

  @IsString()
  @IsOptional()
  DB_USERNAME: string = 'root';

  @IsString()
  @IsOptional()
  DB_PASSWORD: string = '';

  @IsString()
  @IsOptional()
  DB_DATABASE: string = 'youtube_automation';

  @IsBoolean()
  @IsOptional()
  DB_SYNCHRONIZE: boolean = false;

  @IsBoolean()
  @IsOptional()
  DB_LOGGING: boolean = true;

  @IsString()
  @IsOptional()
  STORAGE_ROOT: string = './storage';

  @IsEnum(TextProvider)
  @IsOptional()
  TEXT_PROVIDER: TextProvider = TextProvider.Mock;

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  OPENAI_MODEL?: string;

  @IsString()
  @IsOptional()
  ANTHROPIC_API_KEY?: string;

  @IsString()
  @IsOptional()
  ANTHROPIC_MODEL?: string;

  @IsEnum(TtsProvider)
  @IsOptional()
  TTS_PROVIDER: TtsProvider = TtsProvider.Mock;

  @IsString()
  @IsOptional()
  TTS_VOICE?: string = 'Microsoft David Desktop';

  @IsString()
  @IsOptional()
  TTS_API_KEY?: string;

  @IsString()
  @IsOptional()
  TTS_VOICE_ID?: string;

  @IsString()
  @IsOptional()
  YOUTUBE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  YOUTUBE_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  YOUTUBE_REDIRECT_URI: string = 'http://localhost:3000/api/youtube/oauth/callback';

  @IsString()
  @IsOptional()
  YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;

  @IsBoolean()
  @IsOptional()
  ENABLE_EXTERNAL_API_CALLS: boolean = false;

  @IsBoolean()
  @IsOptional()
  ENABLE_YOUTUBE_UPLOADS: boolean = false;

  @IsBoolean()
  @IsOptional()
  ENABLE_PUBLIC_RELEASE: boolean = false;

  @IsString()
  @IsOptional()
  FFMPEG_PATH: string = 'ffmpeg';

  @IsString()
  @IsOptional()
  FFPROBE_PATH?: string;
}

export function validate(config: Record<string, unknown>) {
  const transformed = {
    ...config,
    PORT: config.PORT ? Number(config.PORT) : 3000,
    DB_PORT: config.DB_PORT ? Number(config.DB_PORT) : 3306,
    DB_SYNCHRONIZE: config.DB_SYNCHRONIZE === 'true' || config.DB_SYNCHRONIZE === true,
    DB_LOGGING: config.DB_LOGGING === 'true' || config.DB_LOGGING === true,
    ENABLE_EXTERNAL_API_CALLS:
      config.ENABLE_EXTERNAL_API_CALLS === 'true' || config.ENABLE_EXTERNAL_API_CALLS === true,
    ENABLE_YOUTUBE_UPLOADS:
      config.ENABLE_YOUTUBE_UPLOADS === 'true' || config.ENABLE_YOUTUBE_UPLOADS === true,
    ENABLE_PUBLIC_RELEASE:
      config.ENABLE_PUBLIC_RELEASE === 'true' || config.ENABLE_PUBLIC_RELEASE === true,
  };

  const validatedConfig = plainToInstance(EnvironmentVariables, transformed, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Configuration validation error: ${errors.toString()}`);
  }
  return validatedConfig;
}
