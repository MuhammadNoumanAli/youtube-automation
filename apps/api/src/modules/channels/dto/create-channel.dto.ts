import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChannelDto {
  @ApiProperty({ example: 'Tech Architecture Weekly', description: 'Display name for channel profile' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'Software Engineering & Cloud Architecture', description: 'Channel niche / category' })
  @IsString()
  @IsNotEmpty()
  niche!: string;

  @ApiPropertyOptional({ example: ['US', 'GB', 'CA'], description: 'Target geographic regions' })
  @IsArray()
  @IsOptional()
  target_regions?: string[];

  @ApiPropertyOptional({ example: 'en', description: 'Primary language code' })
  @IsString()
  @IsOptional()
  language?: string = 'en';
}
