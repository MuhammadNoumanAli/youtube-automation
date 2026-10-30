import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApprovalDecision } from '../../../database/entities/approval-record.entity';

export class UploadApprovalDto {
  @ApiProperty({
    enum: ApprovalDecision,
    description: 'Explicit review decision for YouTube private upload',
    example: ApprovalDecision.Approved,
  })
  @IsEnum(ApprovalDecision)
  @IsNotEmpty()
  decision!: ApprovalDecision;

  @ApiPropertyOptional({
    description: 'Review notes verifying compliance with YouTube policies and private status',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Identity of the reviewer authorizing the upload',
    default: 'local_creator',
  })
  @IsString()
  @IsOptional()
  approved_by?: string;
}
