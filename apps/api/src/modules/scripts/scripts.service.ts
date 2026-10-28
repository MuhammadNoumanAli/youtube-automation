import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { AiProviderFactory } from '../ai-providers/ai-provider.factory';
import { GenerateScriptRequestDto } from './dto/generate-script-request.dto';
import { UpdateScriptDto } from './dto/update-script.dto';
import { ApproveScriptDto } from './dto/approve-script.dto';

@Injectable()
export class ScriptsService {
  constructor(
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(VideoProject)
    private readonly projectRepo: Repository<VideoProject>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    private readonly aiFactory: AiProviderFactory,
  ) {}

  async findByProjectId(projectId: string): Promise<Script[]> {
    return this.scriptRepo.find({
      where: { video_project_id: projectId },
      order: { version: 'DESC' },
    });
  }

  async findById(id: string): Promise<Script> {
    const script = await this.scriptRepo.findOne({
      where: { id },
      relations: ['video_project'],
    });
    if (!script) {
      throw new NotFoundException(`Script with ID "${id}" not found`);
    }
    return script;
  }

  async generate(projectId: string, dto: GenerateScriptRequestDto): Promise<Script> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['channel_profile'],
    });
    if (!project) {
      throw new NotFoundException(`Video project with ID "${projectId}" not found`);
    }

    // Determine next version number
    const latestScript = await this.scriptRepo.findOne({
      where: { video_project_id: projectId },
      order: { version: 'DESC' },
    });
    const nextVersion = latestScript ? latestScript.version + 1 : 1;

    // Use selected provider (MockTextProvider by default)
    const provider = this.aiFactory.getTextProvider();
    const generated = await provider.generateScript({
      topic: project.topic || project.title,
      targetAudience: project.target_audience,
      niche: project.channel_profile?.niche || 'General',
      targetDurationSeconds: dto.target_duration_seconds || project.target_duration_seconds,
      format: dto.format || project.format,
      keyPoints: dto.key_points,
      tone: dto.tone,
    });

    // Save as draft script version
    const script = this.scriptRepo.create({
      video_project_id: projectId,
      version: nextVersion,
      content: generated.content,
      outline_json: generated.outline,
      scene_plan_json: generated.scenePlan,
      metadata_json: generated.metadata,
      provider: generated.provider,
      model: generated.model,
      status: ScriptStatus.Review,
    });
    const saved = await this.scriptRepo.save(script);

    // Transition project lifecycle state to script_review
    project.status = VideoProjectStatus.ScriptReview;
    project.script_version = nextVersion;
    await this.projectRepo.save(project);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: 'system',
        action: 'SCRIPT_GENERATED',
        entity_type: 'script',
        entity_id: saved.id,
        details_json: {
          project_id: projectId,
          version: nextVersion,
          provider: generated.provider,
        },
      }),
    );

    return saved;
  }

  async update(id: string, dto: UpdateScriptDto): Promise<Script> {
    const script = await this.findById(id);
    if (script.status === ScriptStatus.Approved) {
      throw new BadRequestException(
        'Cannot modify an already approved script. Please generate or create a new draft version.',
      );
    }
    Object.assign(script, dto);
    return this.scriptRepo.save(script);
  }

  async approve(id: string, dto: ApproveScriptDto): Promise<{ script: Script; project: VideoProject }> {
    const script = await this.findById(id);
    const project = await this.projectRepo.findOne({ where: { id: script.video_project_id } });

    if (!project) {
      throw new NotFoundException(`Associated project "${script.video_project_id}" not found`);
    }

    // Mark previous approved scripts for this project as superseded
    await this.scriptRepo
      .createQueryBuilder()
      .update(Script)
      .set({ status: ScriptStatus.Superseded })
      .where('video_project_id = :projectId AND id != :scriptId AND status = :approved', {
        projectId: project.id,
        scriptId: id,
        approved: ScriptStatus.Approved,
      })
      .execute();

    // Approve current script
    script.status = ScriptStatus.Approved;
    const approvedScript = await this.scriptRepo.save(script);

    // Transition project lifecycle to script_approved
    project.status = VideoProjectStatus.ScriptApproved;
    project.script_version = script.version;
    const updatedProject = await this.projectRepo.save(project);

    // Log immutable audit record
    await this.auditRepo.save(
      this.auditRepo.create({
        actor: dto.approved_by || 'local_creator',
        action: 'SCRIPT_APPROVED',
        entity_type: 'script',
        entity_id: approvedScript.id,
        details_json: {
          project_id: project.id,
          version: script.version,
          notes: dto.notes || 'Human approval granted',
        },
      }),
    );

    return { script: approvedScript, project: updatedProject };
  }
}
