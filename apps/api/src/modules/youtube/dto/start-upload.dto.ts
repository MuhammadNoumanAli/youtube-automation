import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class StartUploadDto {
  @ApiPropertyOptional({ description: 'Optional override for YouTube video title (max 100 chars)' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: 'Optional override for YouTube video description' })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Optional list of tags for metadata', type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'YouTube category ID (default 28 = Science & Technology)', example: '28' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{1,3}$/)
  category_id?: string;

  @ApiPropertyOptional({
    description:
      'Creator audience declaration (COPPA). Required for live uploads — never inferred automatically.',
  })
  @IsBoolean()
  @IsOptional()
  made_for_kids?: boolean;

  @ApiPropertyOptional({
    description:
      'Creator declaration that the video contains realistic altered or synthetic content. Required for live uploads.',
  })
  @IsBoolean()
  @IsOptional()
  contains_synthetic_media?: boolean;
}
