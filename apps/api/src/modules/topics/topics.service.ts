import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Topic, TopicStatus } from '../../database/entities/topic.entity';
import { VideoProject, VideoProjectStatus, VideoFormat } from '../../database/entities/video-project.entity';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(Topic)
    private readonly topicRepo: Repository<Topic>,
    @InjectRepository(VideoProject)
    private readonly projectRepo: Repository<VideoProject>,
  ) {}

  async findAll(channelProfileId?: string, status?: TopicStatus): Promise<Topic[]> {
    const query = this.topicRepo.createQueryBuilder('topic');
    if (channelProfileId) {
      query.andWhere('topic.channel_profile_id = :channelProfileId', { channelProfileId });
    }
    if (status) {
      query.andWhere('topic.status = :status', { status });
    }
    query.orderBy('topic.created_at', 'DESC');
    return query.getMany();
  }

  async findById(id: string): Promise<Topic> {
    const topic = await this.topicRepo.findOne({
      where: { id },
      relations: ['channel_profile'],
    });
    if (!topic) {
      throw new NotFoundException(`Topic with ID "${id}" not found`);
    }
    return topic;
  }

  async create(dto: CreateTopicDto): Promise<Topic> {
    const topic = this.topicRepo.create({
      channel_profile_id: dto.channel_profile_id,
      title: dto.title,
      description: dto.description || null,
      niche: dto.niche || 'General',
      target_audience: dto.target_audience || 'General Audience',
      priority: dto.priority,
      status: dto.status,
    });
    return this.topicRepo.save(topic);
  }

  async update(id: string, dto: UpdateTopicDto): Promise<Topic> {
    const topic = await this.findById(id);
    Object.assign(topic, dto);
    return this.topicRepo.save(topic);
  }

  async convertToProject(id: string): Promise<{ topic: Topic; project: VideoProject }> {
    const topic = await this.findById(id);

    // Create the video project
    const project = this.projectRepo.create({
      channel_profile_id: topic.channel_profile_id,
      title: topic.title,
      working_title: topic.title,
      topic: topic.description || topic.title,
      target_audience: topic.target_audience,
      format: VideoFormat.LongForm,
      target_duration_seconds: 300,
      status: VideoProjectStatus.Idea,
      script_version: 1,
    });
    const savedProject = await this.projectRepo.save(project);

    // Update topic status
    topic.status = TopicStatus.Converted;
    topic.converted_project_id = savedProject.id;
    const updatedTopic = await this.topicRepo.save(topic);

    return { topic: updatedTopic, project: savedProject };
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const topic = await this.findById(id);
    await this.topicRepo.remove(topic);
    return { deleted: true };
  }
}
