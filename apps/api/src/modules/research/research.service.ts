import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearchSource } from '../../database/entities/research-source.entity';
import { VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { CreateResearchSourceDto } from './dto/create-research-source.dto';

@Injectable()
export class ResearchService {
  constructor(
    @InjectRepository(ResearchSource)
    private readonly sourceRepo: Repository<ResearchSource>,
    @InjectRepository(VideoProject)
    private readonly projectRepo: Repository<VideoProject>,
  ) {}

  async findByProjectId(projectId: string): Promise<ResearchSource[]> {
    return this.sourceRepo.find({
      where: { video_project_id: projectId },
      order: { created_at: 'DESC' },
    });
  }

  async addSource(projectId: string, dto: CreateResearchSourceDto): Promise<ResearchSource> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Video project with ID "${projectId}" not found`);
    }

    const source = this.sourceRepo.create({
      video_project_id: projectId,
      url: dto.url,
      title: dto.title,
      publisher: dto.publisher || 'Independent Source',
      published_at: dto.published_at ? new Date(dto.published_at) : null,
      claim_supported: dto.claim_supported,
      source_type: dto.source_type || 'article',
      notes: dto.notes || null,
      verification_status: dto.verification_status,
      accessed_at: new Date(),
    });

    const saved = await this.sourceRepo.save(source);

    // If project is still in 'idea' status, transition to 'researching'
    if (project.status === VideoProjectStatus.Idea) {
      project.status = VideoProjectStatus.Researching;
      await this.projectRepo.save(project);
    }

    return saved;
  }

  async removeSource(id: string): Promise<{ deleted: boolean }> {
    const source = await this.sourceRepo.findOne({ where: { id } });
    if (!source) {
      throw new NotFoundException(`Research source with ID "${id}" not found`);
    }
    await this.sourceRepo.remove(source);
    return { deleted: true };
  }
}
