import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { NarrationService } from './narration.service';
import { Narration } from '../../database/entities/narration.entity';

@ApiTags('Narration')
@Controller()
export class NarrationController {
  constructor(private readonly narrationService: NarrationService) {}

  @Get('projects/:projectId/narration')
  @ApiOperation({ summary: 'List all narration tracks for a project' })
  @ApiResponse({ status: 200, description: 'List of narration audio tracks' })
  async findByProject(@Param('projectId') projectId: string): Promise<Narration[]> {
    return this.narrationService.findByProjectId(projectId);
  }

  @Post('projects/:projectId/narration/generate')
  @ApiOperation({ summary: 'Synthesize narration audio from approved script using active TTS provider (default mock)' })
  @ApiResponse({ status: 201, description: 'Generated narration track' })
  async generate(
    @Param('projectId') projectId: string,
    @Body('script_id') scriptId?: string,
  ): Promise<Narration> {
    return this.narrationService.generate(projectId, scriptId);
  }

  @Post('projects/:projectId/narration/import')
  @ApiOperation({ summary: 'Import user-recorded voiceover audio file (.mp3, .wav)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Imported narration track' })
  @UseInterceptors(FileInterceptor('file'))
  async importVoiceover(
    @Param('projectId') projectId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Narration> {
    if (!file) {
      throw new BadRequestException('A valid voiceover audio file must be uploaded');
    }
    return this.narrationService.importVoiceover(
      projectId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }
}
