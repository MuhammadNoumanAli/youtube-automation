import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService, HealthStatus } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'System health check and readiness probe' })
  @ApiResponse({
    status: 200,
    description: 'System health diagnostic status',
  })
  async getHealth(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
