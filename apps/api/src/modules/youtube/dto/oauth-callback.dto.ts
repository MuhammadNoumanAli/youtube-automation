import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class OAuthCallbackDto {
  // code/state are optional at the DTO level because Google omits `code` when the
  // user cancels or an error occurs (it sends `error` instead). The controller
  // enforces their presence on the success path.
  @ApiPropertyOptional({ description: 'OAuth 2.0 authorization code from Google' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Cryptographic state parameter for CSRF mitigation' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Granted OAuth scopes from Google' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ description: 'Google Auth issuer parameter' })
  @IsOptional()
  @IsString()
  iss?: string;

  @ApiPropertyOptional({ description: 'Google authenticated user index' })
  @IsOptional()
  @IsString()
  authuser?: string;

  @ApiPropertyOptional({ description: 'Google consent prompt type' })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiPropertyOptional({ description: 'Google hosted domain restriction' })
  @IsOptional()
  @IsString()
  hd?: string;

  @ApiPropertyOptional({ description: 'Error code if authorization was denied' })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({ description: 'Detailed error description' })
  @IsOptional()
  @IsString()
  error_description?: string;
}
