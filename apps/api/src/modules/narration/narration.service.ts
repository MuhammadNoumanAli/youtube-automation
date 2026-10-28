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
import { Narration, NarrationStatus } from '../../database/entities/narration.entity';
import { VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { MockTtsProvider } from './mock-tts.provider';

@Injectable()
export class NarrationService {
  constructor(
    @InjectRepository(Narration)
    private readonly narrationRepo: Repository<Narration>,
    @InjectRepository(VideoProject)
    private readonly projectRepo: Repository<VideoProject>,
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    private readonly configService: ConfigService,
    private readonly mockTtsProvider: MockTtsProvider,
  ) {}

  private getStorageDir(): string {
    const root = this.configService.get<string>('STORAGE_ROOT', './storage');
    const dir = path.resolve(root, 'narration');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async findByProjectId(projectId: string): Promise<Narration[]> {
    return this.narrationRepo.find({
      where: { video_project_id: projectId },
      order: { created_at: 'DESC' },
    });
  }

  async generate(projectId: string, scriptId?: string): Promise<Narration> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Video project "${projectId}" not found`);
    }

    let script: Script | null = null;
    if (scriptId) {
      script = await this.scriptRepo.findOne({ where: { id: scriptId, video_project_id: projectId } });
    } else {
      // Find latest approved script, or latest review script
      script = await this.scriptRepo.findOne({
        where: { video_project_id: projectId, status: ScriptStatus.Approved },
        order: { version: 'DESC' },
      });
      if (!script) {
        script = await this.scriptRepo.findOne({
          where: { video_project_id: projectId },
          order: { version: 'DESC' },
        });
      }
    }

    if (!script) {
      throw new BadRequestException('Cannot generate narration: no script found for this project.');
    }

    const filename = `${crypto.randomUUID()}.wav`;
    const outputPath = path.join(this.getStorageDir(), filename);

    const result = await this.mockTtsProvider.synthesize(script.content, outputPath);

    const narration = this.narrationRepo.create({
      video_project_id: projectId,
      script_id: script.id,
      provider: 'mock',
      storage_path: result.filePath,
      duration_seconds: result.durationSeconds,
      status: NarrationStatus.Ready,
    });
    const saved = await this.narrationRepo.save(narration);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: 'system',
        action: 'NARRATION_GENERATED',
        entity_type: 'narration',
        entity_id: saved.id,
        details_json: {
          project_id: projectId,
          script_id: script.id,
          duration: result.durationSeconds,
          provider: 'mock',
        },
      }),
    );

    return saved;
  }

  async importVoiceover(
    projectId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<Narration> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Video project "${projectId}" not found`);
    }

    const ext = path.extname(originalName).toLowerCase();
    if (!['.mp3', '.wav', '.m4a', '.aac'].includes(ext)) {
      throw new BadRequestException(`Unsupported audio format "${ext}". Allowed: .mp3, .wav, .m4a, .aac`);
    }

    const filename = `${crypto.randomUUID()}${ext}`;
    const destinationPath = path.join(this.getStorageDir(), filename);

    // Path traversal check
    const normalizedDest = path.resolve(destinationPath);
    if (!normalizedDest.startsWith(path.resolve(this.getStorageDir()))) {
      throw new BadRequestException('Invalid storage path detected');
    }

    fs.writeFileSync(destinationPath, fileBuffer);

    // Rough duration estimation or probe
    const estimatedSeconds = Math.max(5, Math.round(fileBuffer.length / (16000 * 2)));

    const narration = this.narrationRepo.create({
      video_project_id: projectId,
      script_id: null,
      provider: 'user_uploaded',
      storage_path: destinationPath,
      duration_seconds: estimatedSeconds,
      status: NarrationStatus.Ready,
    });
    const saved = await this.narrationRepo.save(narration);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: 'user',
        action: 'VOICEOVER_IMPORTED',
        entity_type: 'narration',
        entity_id: saved.id,
        details_json: {
          project_id: projectId,
          original_filename: originalName,
          size_bytes: fileBuffer.length,
        },
      }),
    );

    return saved;
  }
}
