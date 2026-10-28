import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TopicPriority, TopicStatus } from '../../../database/entities/topic.entity';

export class CreateTopicDto {
  @ApiProperty({ description: 'ID of the channel profile this topic belongs to' })
  @IsString()
  @IsNotEmpty()
  channel_profile_id!: string;

  @ApiProperty({ example: 'Microservices vs Monoliths: A 2026 Pragmatic Review', description: 'Topic title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: 'A deep-dive analyzing latency, operational overhead, and developer velocity.', description: 'Brief description / premise' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'System Design', description: 'Niche / sub-category' })
  @IsString()
  @IsOptional()
  niche?: string;

  @ApiPropertyOptional({ example: 'Mid to Senior Software Engineers', description: 'Target viewer demographic' })
  @IsString()
  @IsOptional()
  target_audience?: string;

  @ApiPropertyOptional({ enum: TopicPriority, default: TopicPriority.Medium })
  @IsEnum(TopicPriority)
  @IsOptional()
  priority?: TopicPriority = TopicPriority.Medium;

  @ApiPropertyOptional({ enum: TopicStatus, default: TopicStatus.Idea })
  @IsEnum(TopicStatus)
  @IsOptional()
  status?: TopicStatus = TopicStatus.Idea;
}
