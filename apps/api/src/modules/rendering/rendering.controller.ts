import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { RenderingService } from './rendering.service';
import { StartRenderDto } from './dto/start-render.dto';
import { RenderApprovalDto } from './dto/render-approval.dto';
import { RenderJob } from '../../database/entities/render-job.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { ApprovalRecord } from '../../database/entities/approval-record.entity';

@ApiTags('Rendering')
@Controller()
export class RenderingController {
  constructor(private readonly renderingService: RenderingService) {}

  @Get('rendering/binaries')
  @ApiOperation({ summary: 'Check FFmpeg and FFprobe binary availability' })
  @ApiResponse({ status: 200, description: 'Binary availability report' })
  async checkBinaries() {
    return this.renderingService.checkBinaries();
  }

  @Post('projects/:projectId/render')
  @ApiOperation({ summary: 'Initiate video rendering pipeline using local FFmpeg' })
  @ApiResponse({ status: 201, description: 'Render job execution results and FFprobe validation' })
  async startRender(
    @Param('projectId') projectId: string,
    @Body() dto: StartRenderDto,
  ): Promise<RenderJob> {
    return this.renderingService.renderProject(projectId, dto);
  }

  @Get('projects/:projectId/render-status')
  @ApiOperation({ summary: 'Get status and technical validation of latest render job' })
  @ApiResponse({ status: 200, description: 'Latest render job metadata' })
  async getStatus(@Param('projectId') projectId: string): Promise<RenderJob | null> {
    return this.renderingService.getLatestRender(projectId);
  }

  @Get('projects/:projectId/render-video')
  @ApiOperation({ summary: 'Stream latest rendered MP4 video file safely' })
  @ApiResponse({ status: 200, description: 'Rendered MP4 binary stream' })
  async streamVideo(
    @Param('projectId') projectId: string,
    @Res() res: Response,
  ): Promise<void> {
    const job = await this.renderingService.getLatestRender(projectId);
    if (!job || !job.output_path || !fs.existsSync(job.output_path)) {
      throw new NotFoundException('Rendered video file not found for this project');
    }

    // Path traversal check: verify file is strictly inside storage/renders
    const storageDir = path.resolve(this.renderingService.getStorageDir());
    const resolvedTarget = path.resolve(job.output_path);
    if (!resolvedTarget.startsWith(storageDir)) {
      throw new BadRequestException('Unauthorized video path');
    }

    res.sendFile(resolvedTarget, {
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      },
    });
  }

  @Post('projects/:projectId/render-approval')
  @ApiOperation({ summary: 'Record human review decision (approve/reject) on rendered video' })
  @ApiResponse({ status: 200, description: 'Updated project status and audit record' })
  async approveOrReject(
    @Param('projectId') projectId: string,
    @Body() dto: RenderApprovalDto,
  ): Promise<{ project: VideoProject; approval: ApprovalRecord }> {
    return this.renderingService.recordApproval(projectId, dto);
  }
}
