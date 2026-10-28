import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { VideoFormat, VideoProjectStatus } from '../../../database/entities/video-project.entity';

export class CreateProjectDto {
  @ApiProperty({ description: 'ID of the channel profile' })
  @IsString()
  @IsNotEmpty()
  channel_profile_id!: string;

  @ApiProperty({ example: 'Building a Reliable Video Automation Pipeline', description: 'Project title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: 'Video Pipeline v1', description: 'Internal working title' })
  @IsString()
  @IsOptional()
  working_title?: string;

  @ApiProperty({ example: 'Architecture walkthrough and engineering best practices', description: 'Core topic description' })
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @ApiPropertyOptional({ example: 'Software Engineers', description: 'Target viewer demographic' })
  @IsString()
  @IsOptional()
  target_audience?: string = 'General Audience';

  @ApiPropertyOptional({ enum: VideoFormat, default: VideoFormat.LongForm })
  @IsEnum(VideoFormat)
  @IsOptional()
  format?: VideoFormat = VideoFormat.LongForm;

  @ApiPropertyOptional({ example: 300, description: 'Target video duration in seconds' })
  @IsInt()
  @Min(15)
  @IsOptional()
  target_duration_seconds?: number = 300;

  @ApiPropertyOptional({ enum: VideoProjectStatus, default: VideoProjectStatus.Idea })
  @IsEnum(VideoProjectStatus)
  @IsOptional()
  status?: VideoProjectStatus = VideoProjectStatus.Idea;
}
