import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VideosService } from './videos.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';

@ApiTags('Projects')
@Controller('projects')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @ApiOperation({ summary: 'List all video projects' })
  @ApiQuery({ name: 'channel_id', required: false })
  @ApiQuery({ name: 'status', enum: VideoProjectStatus, required: false })
  @ApiResponse({ status: 200, description: 'List of video projects' })
  async findAll(
    @Query('channel_id') channelId?: string,
    @Query('status') status?: VideoProjectStatus,
  ): Promise<VideoProject[]> {
    return this.videosService.findAll(channelId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video project details by ID' })
  @ApiResponse({ status: 200, description: 'Video project details' })
  async findById(@Param('id') id: string): Promise<VideoProject> {
    return this.videosService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new video project' })
  @ApiResponse({ status: 201, description: 'Created video project' })
  async create(@Body() dto: CreateProjectDto): Promise<VideoProject> {
    return this.videosService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update video project details or lifecycle status' })
  @ApiResponse({ status: 200, description: 'Updated video project' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<VideoProject> {
    return this.videosService.update(id, dto);
  }
}
