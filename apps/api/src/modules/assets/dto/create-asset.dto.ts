import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
  // Multipart forms send booleans as text. Read the raw value (obj[key]) because
  // implicit conversion would turn the string "false" into true.
  @Transform(({ obj, key }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true' || raw === '1' || raw === 'on') return true;
    if (raw === false || raw === 'false' || raw === '0' || raw === '' || raw === undefined) return false;
    return raw;
  })
  @IsBoolean()
  commercial_use_allowed!: boolean;
}
