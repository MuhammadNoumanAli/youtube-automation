import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScriptsService } from './scripts.service';
import { GenerateScriptRequestDto } from './dto/generate-script-request.dto';
import { UpdateScriptDto } from './dto/update-script.dto';
import { ApproveScriptDto } from './dto/approve-script.dto';
import { Script } from '../../database/entities/script.entity';
import { VideoProject } from '../../database/entities/video-project.entity';

@ApiTags('Scripts')
@Controller()
export class ScriptsController {
  constructor(private readonly scriptsService: ScriptsService) {}

  @Get('projects/:projectId/scripts')
  @ApiOperation({ summary: 'List all script versions for a project' })
  @ApiResponse({ status: 200, description: 'List of script versions' })
  async findByProjectId(@Param('projectId') projectId: string): Promise<Script[]> {
    return this.scriptsService.findByProjectId(projectId);
  }

  @Get('scripts/:id')
  @ApiOperation({ summary: 'Get script details by ID' })
  @ApiResponse({ status: 200, description: 'Script details with scene plan and metadata' })
  async findById(@Param('id') id: string): Promise<Script> {
    return this.scriptsService.findById(id);
  }

  @Post('projects/:projectId/scripts/generate')
  @ApiOperation({ summary: 'Generate a new script draft using active text provider (default mock)' })
  @ApiResponse({ status: 201, description: 'Newly generated script draft' })
  async generate(
    @Param('projectId') projectId: string,
    @Body() dto: GenerateScriptRequestDto,
  ): Promise<Script> {
    return this.scriptsService.generate(projectId, dto);
  }

  @Patch('scripts/:id')
  @ApiOperation({ summary: 'Manually edit an unapproved script draft' })
  @ApiResponse({ status: 200, description: 'Updated script' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateScriptDto,
  ): Promise<Script> {
    return this.scriptsService.update(id, dto);
  }

  @Post('scripts/:id/approve')
  @ApiOperation({
    summary: 'HUMAN APPROVAL GATE: Formally approve script and lock it for rendering',
  })
  @ApiResponse({
    status: 200,
    description: 'Approved script and updated project lifecycle state',
  })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveScriptDto,
  ): Promise<{ script: Script; project: VideoProject }> {
    return this.scriptsService.approve(id, dto);
  }
}
