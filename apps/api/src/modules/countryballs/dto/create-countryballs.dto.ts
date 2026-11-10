import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  COUNTRY_IDS,
  CountryId,
  DIALOGUE_SETTINGS,
  DialogueSetting,
  EXPRESSIONS,
  ExpressionId,
  LIMITS,
  MOVES,
  MoveId,
  PROPS,
  PropId,
  SCENE_TYPES,
  SceneType,
  VOICES,
  VoiceId,
} from '../countryballs.catalog';

export enum CountryballsFormat {
  Short = 'short',
  LongForm = 'long_form',
  Both = 'both',
}

export class CountryballsCastDto {
  @ApiProperty({ enum: COUNTRY_IDS, example: 'netherlands' })
  @IsIn(COUNTRY_IDS as unknown as string[])
  country!: CountryId;

  @ApiPropertyOptional({ enum: VOICES, description: 'Kokoro voice; a distinct default is picked if empty' })
  @IsOptional()
  @IsIn(VOICES as unknown as string[])
  voice?: VoiceId;

  @ApiPropertyOptional({ minimum: LIMITS.speed[0], maximum: LIMITS.speed[1], default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(LIMITS.speed[0])
  @Max(LIMITS.speed[1])
  speed?: number;
}

export class CountryballsLineDto {
  @ApiProperty({ description: "'narrator' or a country from the cast", example: 'netherlands' })
  @IsIn(['narrator', ...COUNTRY_IDS])
  speaker!: 'narrator' | CountryId;

  @ApiProperty({ maxLength: LIMITS.lineChars, example: 'Hallo! Much of my land lies below sea level.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.lineChars)
  text!: string;

  @ApiPropertyOptional({ enum: EXPRESSIONS })
  @IsOptional()
  @IsIn(EXPRESSIONS as unknown as string[])
  expression?: ExpressionId;

  @ApiPropertyOptional({ enum: PROPS, description: 'Prop shown on the speaker from this line (e.g. crown on the winning line)' })
  @IsOptional()
  @IsIn(PROPS as unknown as string[])
  prop?: PropId;

  @ApiPropertyOptional({ enum: MOVES, description: "Roast battles: the speaker's move on this line (default auto)" })
  @IsOptional()
  @IsIn(MOVES as unknown as string[])
  move?: MoveId;
}

export class CountryballsSceneDto {
  @ApiProperty({ enum: SCENE_TYPES, example: 'dialogue' })
  @IsIn(SCENE_TYPES as unknown as string[])
  type!: SceneType;

  @ApiPropertyOptional({ description: 'title-card, map-intro and roast-battle (optional)', maxLength: LIMITS.sceneTitleChars })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.sceneTitleChars)
  title?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  subtitle?: string;

  @ApiPropertyOptional({ enum: COUNTRY_IDS, description: 'map-intro: the country shown' })
  @IsOptional()
  @IsIn(COUNTRY_IDS as unknown as string[])
  country?: CountryId;

  @ApiPropertyOptional({ enum: COUNTRY_IDS, isArray: true, description: 'map-focus: 2-4 countries; dialogue: 1-3; roast-battle: exactly 2' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(COUNTRY_IDS as unknown as string[], { each: true })
  countries?: CountryId[];

  @ApiPropertyOptional({ enum: DIALOGUE_SETTINGS, description: 'dialogue background' })
  @IsOptional()
  @IsIn(DIALOGUE_SETTINGS as unknown as string[])
  setting?: DialogueSetting;

  @ApiProperty({ type: [CountryballsLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.linesPerSceneMax)
  @ValidateNested({ each: true })
  @Type(() => CountryballsLineDto)
  lines!: CountryballsLineDto[];
}

export class CreateCountryballsDto {
  @ApiProperty({ maxLength: LIMITS.titleChars, example: 'Why the Netherlands is still dry' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.titleChars)
  title!: string;

  @ApiPropertyOptional({ description: 'Channel profile; the first channel is used if empty' })
  @IsOptional()
  @IsString()
  channel_profile_id?: string;

  @ApiProperty({ enum: CountryballsFormat, description: 'short = 9:16, long_form = 16:9, both = one project for each' })
  @IsEnum(CountryballsFormat)
  format!: CountryballsFormat;

  @ApiPropertyOptional({ enum: VOICES, default: 'am_michael' })
  @IsOptional()
  @IsIn(VOICES as unknown as string[])
  narrator_voice?: VoiceId;

  @ApiProperty({ type: [CountryballsCastDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.castMax)
  @ValidateNested({ each: true })
  @Type(() => CountryballsCastDto)
  cast!: CountryballsCastDto[];

  @ApiProperty({ type: [CountryballsSceneDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.scenesMax)
  @ValidateNested({ each: true })
  @Type(() => CountryballsSceneDto)
  scenes!: CountryballsSceneDto[];

  @ApiPropertyOptional({ maxLength: 5000, description: 'YouTube description (used at private upload)' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'YouTube tags (max 15)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];
}
