import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { SceneItem, ScriptStatus, VideoMetadataPayload } from '../../../database/entities/script.entity';

export class UpdateScriptDto {
  @ApiPropertyOptional({ description: 'Full script content text' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ description: 'Ordered outline points' })
  @IsArray()
  @IsOptional()
  outline_json?: string[];

  @ApiPropertyOptional({ description: 'Scene-by-scene visual and audio instructions' })
  @IsArray()
  @IsOptional()
  scene_plan_json?: SceneItem[];

  @ApiPropertyOptional({ description: 'YouTube metadata package (title, description, tags, chapters)' })
  @IsOptional()
  metadata_json?: VideoMetadataPayload;

  @ApiPropertyOptional({ enum: ScriptStatus })
  @IsEnum(ScriptStatus)
  @IsOptional()
  status?: ScriptStatus;
}
