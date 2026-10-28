import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Asset, AssetType, LicenseType } from '../../database/entities/asset.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { CreateAssetDto } from './dto/create-asset.dto';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.mp4',
  '.mov',
  '.webm',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
]);

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    @InjectRepository(VideoProject)
    private readonly projectRepo: Repository<VideoProject>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    private readonly configService: ConfigService,
  ) {}

  private getStorageDir(): string {
    const root = this.configService.get<string>('STORAGE_ROOT', './storage');
    const assetDir = path.resolve(root, 'assets');
    if (!fs.existsSync(assetDir)) {
      fs.mkdirSync(assetDir, { recursive: true });
    }
    return assetDir;
  }

  async findByProjectId(projectId: string): Promise<Asset[]> {
    return this.assetRepo.find({
      where: { video_project_id: projectId },
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string): Promise<Asset> {
    const asset = await this.assetRepo.findOne({
      where: { id },
      relations: ['video_project'],
    });
    if (!asset) {
      throw new NotFoundException(`Asset with ID "${id}" not found`);
    }
    return asset;
  }

  async createAssetFromFile(
    projectId: string,
    dto: CreateAssetDto,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<Asset> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Video project "${projectId}" not found`);
    }

    // Sanitize extension
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`File extension "${ext}" is not supported`);
    }

    const normalizedMime = mimeType.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      throw new BadRequestException(`MIME type "${mimeType}" is not supported`);
    }

    // Size limit check (250MB)
    const MAX_SIZE = 250 * 1024 * 1024;
    if (fileBuffer.length > MAX_SIZE) {
      throw new BadRequestException(`File size exceeds 250MB limit`);
    }

    // Calculate SHA-256 Checksum
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Generate safe, server-controlled filename
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    const storageDir = this.getStorageDir();
    const destinationPath = path.join(storageDir, safeFilename);

    // Path traversal check
    const normalizedDest = path.resolve(destinationPath);
    if (!normalizedDest.startsWith(storageDir)) {
      throw new BadRequestException('Invalid storage path detected');
    }

    // Write file to disk
    fs.writeFileSync(destinationPath, fileBuffer);

    // Save entity record
    const asset = this.assetRepo.create({
      video_project_id: projectId,
      asset_type: dto.asset_type,
      storage_path: destinationPath,
      original_filename: path.basename(originalName),
      mime_type: normalizedMime,
      checksum_sha256: sha256,
      source_url: dto.source_url || null,
      creator: dto.creator || null,
      license_type: dto.license_type,
      license_notes: dto.license_notes,
      attribution_text: dto.attribution_text || null,
      commercial_use_allowed: dto.commercial_use_allowed === true,
    });

    const saved = await this.assetRepo.save(asset);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: 'user',
        action: 'ASSET_INGESTED',
        entity_type: 'asset',
        entity_id: saved.id,
        details_json: {
          project_id: projectId,
          original_filename: saved.original_filename,
          sha256: saved.checksum_sha256,
          license_type: saved.license_type,
          commercial_use_allowed: saved.commercial_use_allowed,
        },
      }),
    );

    return saved;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const asset = await this.findById(id);
    if (fs.existsSync(asset.storage_path)) {
      try {
        fs.unlinkSync(asset.storage_path);
      } catch (err) {
        // Log error but proceed with DB removal
      }
    }
    await this.assetRepo.remove(asset);
    return { deleted: true };
  }
}
