import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VerificationStatus } from '../../../database/entities/research-source.entity';

export class CreateResearchSourceDto {
  @ApiProperty({ example: 'https://docs.nestjs.com/first-steps', description: 'Source URL or reference document' })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiProperty({ example: 'NestJS Official Documentation - Architecture Overview', description: 'Source title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: 'NestJS Core Team', description: 'Publisher or author name' })
  @IsString()
  @IsOptional()
  publisher?: string = 'Independent Source';

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00.000Z', description: 'Original publication date' })
  @IsDateString()
  @IsOptional()
  published_at?: string;

  @ApiProperty({ example: 'Supports the modular dependency injection and safety lifecycle model', description: 'Specific factual claim or assertion supported' })
  @IsString()
  @IsNotEmpty()
  claim_supported!: string;

  @ApiPropertyOptional({ example: 'Official docs', description: 'Format / medium of source' })
  @IsString()
  @IsOptional()
  source_type?: string = 'article';

  @ApiPropertyOptional({ example: 'Reviewed chapter 3 on lifecycle events', description: 'Internal research notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ enum: VerificationStatus, default: VerificationStatus.Verified })
  @IsEnum(VerificationStatus)
  @IsOptional()
  verification_status?: VerificationStatus = VerificationStatus.Verified;
}
