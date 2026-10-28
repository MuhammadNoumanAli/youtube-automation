import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TopicsService } from './topics.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { Topic, TopicStatus } from '../../database/entities/topic.entity';
import { VideoProject } from '../../database/entities/video-project.entity';

@ApiTags('Topics')
@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get()
  @ApiOperation({ summary: 'List all topics / ideas' })
  @ApiQuery({ name: 'channel_id', required: false })
  @ApiQuery({ name: 'status', enum: TopicStatus, required: false })
  @ApiResponse({ status: 200, description: 'List of topics' })
  async findAll(
    @Query('channel_id') channelId?: string,
    @Query('status') status?: TopicStatus,
  ): Promise<Topic[]> {
    return this.topicsService.findAll(channelId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get topic by ID' })
  @ApiResponse({ status: 200, description: 'Topic details' })
  async findById(@Param('id') id: string): Promise<Topic> {
    return this.topicsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new topic idea' })
  @ApiResponse({ status: 201, description: 'Created topic' })
  async create(@Body() dto: CreateTopicDto): Promise<Topic> {
    return this.topicsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a topic idea' })
  @ApiResponse({ status: 200, description: 'Updated topic' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ): Promise<Topic> {
    return this.topicsService.update(id, dto);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert topic idea into an active video project' })
  @ApiResponse({ status: 201, description: 'Created video project' })
  async convert(
    @Param('id') id: string,
  ): Promise<{ topic: Topic; project: VideoProject }> {
    return this.topicsService.convertToProject(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a topic idea' })
  @ApiResponse({ status: 200, description: 'Deletion confirmation' })
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.topicsService.remove(id);
  }
}
