import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AssetType, LicenseType } from '../../../database/entities/asset.entity';

export class CreateAssetDto {
  @ApiProperty({ enum: AssetType, default: AssetType.Image })
  @IsEnum(AssetType)
  asset_type!: AssetType;

  @ApiProperty({ enum: LicenseType, default: LicenseType.UserCreated })
  @IsEnum(LicenseType)
  license_type!: LicenseType;

  @ApiProperty({ example: 'Original diagram created by author in Figma', description: 'License details & provenance justification' })
  @IsString()
  @IsNotEmpty()
  license_notes!: string;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Original creator / author' })
  @IsString()
  @IsOptional()
  creator?: string;

  @ApiPropertyOptional({ example: 'https://example.com/asset', description: 'Original source link if acquired online' })
  @IsString()
  @IsOptional()
  source_url?: string;

  @ApiPropertyOptional({ example: 'Created by John Doe under CC-BY 4.0', description: 'Attribution required for video credits/description' })
  @IsString()
  @IsOptional()
  attribution_text?: string;

  @ApiProperty({ example: true, description: 'Explicit declaration that commercial monetization is permitted' })
  @IsBoolean()
  commercial_use_allowed!: boolean;
}
