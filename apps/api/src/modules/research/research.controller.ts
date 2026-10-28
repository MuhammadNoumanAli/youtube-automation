import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResearchService } from './research.service';
import { CreateResearchSourceDto } from './dto/create-research-source.dto';
import { ResearchSource } from '../../database/entities/research-source.entity';

@ApiTags('Research')
@Controller()
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Get('projects/:projectId/research')
  @ApiOperation({ summary: 'Get all factual research sources for a project' })
  @ApiResponse({ status: 200, description: 'List of research sources' })
  async findByProject(
    @Param('projectId') projectId: string,
  ): Promise<ResearchSource[]> {
    return this.researchService.findByProjectId(projectId);
  }

  @Post('projects/:projectId/research')
  @ApiOperation({ summary: 'Attach a verified research source / claim to a project' })
  @ApiResponse({ status: 201, description: 'Added research source' })
  async addSource(
    @Param('projectId') projectId: string,
    @Body() dto: CreateResearchSourceDto,
  ): Promise<ResearchSource> {
    return this.researchService.addSource(projectId, dto);
  }

  @Delete('research/:id')
  @ApiOperation({ summary: 'Remove a research source' })
  @ApiResponse({ status: 200, description: 'Deletion confirmation' })
  async removeSource(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.researchService.removeSource(id);
  }
}
