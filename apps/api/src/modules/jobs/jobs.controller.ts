import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { MaintenanceService } from './maintenance.service';
import {
  BackgroundJob,
  JobType,
} from '../../database/entities/background-job.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List background queue jobs' })
  @ApiResponse({ status: 200, description: 'List of queued and processed background jobs' })
  async listJobs(@Query('limit') limit = 50): Promise<BackgroundJob[]> {
    return this.jobsService.listJobs(Number(limit));
  }

  @Get('audit')
  @ApiOperation({ summary: 'List audit trail events' })
  @ApiResponse({ status: 200, description: 'List of immutable audit trail records' })
  async listAuditEvents(@Query('limit') limit = 50): Promise<AuditEvent[]> {
    return this.jobsService.listAuditEvents(Number(limit));
  }

  @Get('storage/stats')
  @ApiOperation({ summary: 'Get local storage utilization metrics' })
  @ApiResponse({ status: 200, description: 'Storage root size and file counts' })
  async getStorageStats() {
    return this.maintenanceService.getStorageStats();
  }

  @Post('maintenance/cleanup')
  @ApiOperation({ summary: 'Trigger storage cleanup job for temporary scratch files' })
  @ApiResponse({ status: 201, description: 'Triggered cleanup job' })
  async triggerCleanup(@Body() body: { maxAgeHours?: number }) {
    return this.jobsService.enqueue({
      jobType: JobType.Maintenance,
      payload: { maxAgeHours: body.maxAgeHours || 24 },
      maxAttempts: 1,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details for a specific background job' })
  @ApiResponse({ status: 200, description: 'Job record' })
  async getJob(@Param('id') id: string): Promise<BackgroundJob> {
    return this.jobsService.getJob(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending or processing job' })
  @ApiResponse({ status: 200, description: 'Cancelled job record' })
  async cancelJob(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ): Promise<BackgroundJob> {
    return this.jobsService.cancelJob(id, reason);
  }
}
