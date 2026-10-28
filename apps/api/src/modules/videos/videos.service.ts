import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(VideoProject)
    private readonly projectRepo: Repository<VideoProject>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
  ) {}

  async findAll(channelProfileId?: string, status?: VideoProjectStatus): Promise<VideoProject[]> {
    const query = this.projectRepo.createQueryBuilder('project');
    if (channelProfileId) {
      query.andWhere('project.channel_profile_id = :channelProfileId', { channelProfileId });
    }
    if (status) {
      query.andWhere('project.status = :status', { status });
    }
    query.orderBy('project.updated_at', 'DESC');
    return query.getMany();
  }

  async findById(id: string): Promise<VideoProject> {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['channel_profile'],
    });
    if (!project) {
      throw new NotFoundException(`Video project with ID "${id}" not found`);
    }
    return project;
  }

  async create(dto: CreateProjectDto): Promise<VideoProject> {
    const project = this.projectRepo.create({
      channel_profile_id: dto.channel_profile_id,
      title: dto.title,
      working_title: dto.working_title || dto.title,
      topic: dto.topic,
      target_audience: dto.target_audience || 'General Audience',
      format: dto.format,
      target_duration_seconds: dto.target_duration_seconds,
      status: dto.status || VideoProjectStatus.Idea,
      script_version: 1,
    });
    const saved = await this.projectRepo.save(project);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: 'user',
        action: 'PROJECT_CREATED',
        entity_type: 'video_project',
        entity_id: saved.id,
        details_json: { title: saved.title, status: saved.status },
      }),
    );

    return saved;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<VideoProject> {
    const project = await this.findById(id);
    const oldStatus = project.status;
    Object.assign(project, dto);
    const updated = await this.projectRepo.save(project);

    if (dto.status && dto.status !== oldStatus) {
      await this.auditRepo.save(
        this.auditRepo.create({
          actor: 'user',
          action: 'PROJECT_STATUS_CHANGED',
          entity_type: 'video_project',
          entity_id: updated.id,
          details_json: { from: oldStatus, to: updated.status },
        }),
      );
    }

    return updated;
  }

  async setStatus(id: string, status: VideoProjectStatus, actor = 'user'): Promise<VideoProject> {
    const project = await this.findById(id);
    const from = project.status;
    project.status = status;
    const updated = await this.projectRepo.save(project);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor,
        action: 'STATUS_TRANSITION',
        entity_type: 'video_project',
        entity_id: id,
        details_json: { from, to: status },
      }),
    );

    return updated;
  }
}
