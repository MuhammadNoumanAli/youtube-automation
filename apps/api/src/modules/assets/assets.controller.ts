import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { Asset } from '../../database/entities/asset.entity';

@ApiTags('Assets')
@Controller()
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get('projects/:projectId/assets')
  @ApiOperation({ summary: 'List all media assets for a video project' })
  @ApiResponse({ status: 200, description: 'List of assets with provenance and license info' })
  async findByProject(@Param('projectId') projectId: string): Promise<Asset[]> {
    return this.assetsService.findByProjectId(projectId);
  }

  @Get('assets/:id')
  @ApiOperation({ summary: 'Get asset details by ID' })
  @ApiResponse({ status: 200, description: 'Asset metadata and storage information' })
  async findById(@Param('id') id: string): Promise<Asset> {
    return this.assetsService.findById(id);
  }

  @Post('projects/:projectId/assets')
  @ApiOperation({ summary: 'Upload and ingest an original or licensed media asset' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Uploaded asset with SHA-256 checksum' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAsset(
    @Param('projectId') projectId: string,
    @Body() dto: CreateAssetDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Asset> {
    if (!file) {
      throw new BadRequestException('A valid file payload must be provided');
    }
    return this.assetsService.createAssetFromFile(
      projectId,
      dto,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Delete('assets/:id')
  @ApiOperation({ summary: 'Delete an asset and its underlying disk file' })
  @ApiResponse({ status: 200, description: 'Deletion confirmation' })
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.assetsService.remove(id);
  }
}
