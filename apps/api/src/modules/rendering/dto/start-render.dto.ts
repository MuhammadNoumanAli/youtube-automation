import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { VideoFormat } from '../../../database/entities/video-project.entity';

export class StartRenderDto {
  @ApiPropertyOptional({ enum: VideoFormat, default: VideoFormat.LongForm })
  @IsEnum(VideoFormat)
  @IsOptional()
  format?: VideoFormat = VideoFormat.LongForm;

  @ApiPropertyOptional({ example: 720, description: 'Vertical resolution: 720 or 1080' })
  @IsInt()
  @IsOptional()
  resolution?: number = 720;

  @ApiPropertyOptional({ example: 30, description: 'Framerate: 24, 30, or 60' })
  @IsInt()
  @Min(24)
  @Max(60)
  @IsOptional()
  fps?: number = 30;

  @ApiPropertyOptional({ example: 'burn_in', description: 'Subtitle mode: burn_in | separate | none' })
  @IsString()
  @IsOptional()
  subtitle_mode?: 'burn_in' | 'separate' | 'none' = 'burn_in';
}
