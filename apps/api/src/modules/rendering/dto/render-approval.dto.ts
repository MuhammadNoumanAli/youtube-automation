import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApprovalDecision } from '../../../database/entities/approval-record.entity';

export class RenderApprovalDto {
  @ApiProperty({ enum: ApprovalDecision, example: ApprovalDecision.Approved })
  @IsEnum(ApprovalDecision)
  @IsNotEmpty()
  decision!: ApprovalDecision;

  @ApiPropertyOptional({ example: 'Video preview matches audio and scene visual instructions.', description: 'Review notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 'local_creator', description: 'Reviewer username / ID' })
  @IsString()
  @IsOptional()
  approved_by?: string = 'local_creator';
}
