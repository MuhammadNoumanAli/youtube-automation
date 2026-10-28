import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { VideoFormat } from '../../../database/entities/video-project.entity';

export class GenerateScriptRequestDto {
  @ApiPropertyOptional({ example: 'Professional and authoritative yet accessible', description: 'Tone of voice' })
  @IsString()
  @IsOptional()
  tone?: string;

  @ApiPropertyOptional({ enum: VideoFormat, default: VideoFormat.LongForm })
  @IsEnum(VideoFormat)
  @IsOptional()
  format?: VideoFormat;

  @ApiPropertyOptional({ example: 300, description: 'Target duration in seconds' })
  @IsInt()
  @Min(15)
  @IsOptional()
  target_duration_seconds?: number;

  @ApiPropertyOptional({ example: ['Explain the problem with monolithic locks', 'Show event-driven approach'], description: 'Key points to cover' })
  @IsArray()
  @IsOptional()
  key_points?: string[];
}
