import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveScriptDto {
  @ApiPropertyOptional({ example: 'Reviewed and confirmed technical accuracy. Visual instructions align with scene plan.', description: 'Approval notes / rationale' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 'local_creator', description: 'Name or identifier of reviewer' })
  @IsString()
  @IsOptional()
  approved_by?: string = 'local_creator';
}
