import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export enum MagicVisualStyle {
  StockBroll = 'stock_broll',
  AiAvatar = 'ai_avatar',
  AiGenerative = 'ai_generative',
  MotionGraphics = 'motion_graphics',
}

export enum MagicVideoFormat {
  Short = 'short',
  LongForm = 'long_form',
}

export class MagicGenerateDto {
  @ApiProperty({
    description: 'Natural language video topic, idea, or complete prompt',
    example: '3 Mind-Blowing Facts About Deep Ocean Creatures',
  })
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @ApiPropertyOptional({
    description: 'Target YouTube channel profile ID',
  })
  @IsOptional()
  @IsString()
  channel_profile_id?: string;

  @ApiPropertyOptional({
    description: 'Video format (vertical 9:16 for Shorts/Reels or 16:9 for long-form)',
    enum: MagicVideoFormat,
    default: MagicVideoFormat.Short,
  })
  @IsOptional()
  @IsEnum(MagicVideoFormat)
  format?: MagicVideoFormat = MagicVideoFormat.Short;

  @ApiPropertyOptional({
    description: 'Target duration in seconds (15 to 300 seconds)',
    default: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(300)
  target_duration_seconds?: number = 60;

  @ApiPropertyOptional({
    description: 'Visual generation style (stock B-roll, AI avatar influencer, generative AI, or motion graphics)',
    enum: MagicVisualStyle,
    default: MagicVisualStyle.StockBroll,
  })
  @IsOptional()
  @IsEnum(MagicVisualStyle)
  visual_style?: MagicVisualStyle = MagicVisualStyle.StockBroll;

  @ApiPropertyOptional({
    description: 'Desired tone of voice and delivery pacing',
    example: 'Fast-paced, energetic, fascinating hook',
  })
  @IsOptional()
  @IsString()
  tone?: string = 'Fast-paced, energetic, fascinating hook';
}
