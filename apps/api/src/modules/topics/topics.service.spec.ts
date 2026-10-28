import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TopicsService } from './topics.service';
import { Topic, TopicPriority, TopicStatus } from '../../database/entities/topic.entity';
import { VideoProject, VideoProjectStatus, VideoFormat } from '../../database/entities/video-project.entity';

describe('TopicsService', () => {
  let service: TopicsService;
  let topicRepoMock: any;
  let projectRepoMock: any;

  const mockTopic: Topic = {
    id: 'topic-123',
    channel_profile_id: 'chan-123',
    channel_profile: {} as any,
    title: 'Microservices Performance',
    description: 'Deep dive into gRPC vs REST',
    niche: 'Backend',
    target_audience: 'Engineers',
    priority: TopicPriority.High,
    status: TopicStatus.Idea,
    converted_project_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    topicRepoMock = {
      find: jest.fn().mockResolvedValue([mockTopic]),
      findOne: jest.fn().mockResolvedValue({ ...mockTopic }),
      create: jest.fn().mockImplementation((val) => ({ ...val, id: 'topic-new' })),
      save: jest.fn().mockImplementation((val) => Promise.resolve({ ...val })),
    };

    projectRepoMock = {
      create: jest.fn().mockImplementation((val) => ({ ...val, id: 'proj-new' })),
      save: jest.fn().mockImplementation((val) => Promise.resolve({ ...val })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicsService,
        {
          provide: getRepositoryToken(Topic),
          useValue: topicRepoMock,
        },
        {
          provide: getRepositoryToken(VideoProject),
          useValue: projectRepoMock,
        },
      ],
    }).compile();

    service = module.get<TopicsService>(TopicsService);
  });

  it('should create a new topic idea', async () => {
    const topic = await service.create({
      channel_profile_id: 'chan-123',
      title: 'New Topic',
      niche: 'Cloud',
    });

    expect(topic.title).toBe('New Topic');
    expect(topicRepoMock.save).toHaveBeenCalled();
  });

  it('should convert an idea to a video project and mark topic converted', async () => {
    const result = await service.convertToProject('topic-123');

    expect(result.topic.status).toBe(TopicStatus.Converted);
    expect(result.topic.converted_project_id).toBe('proj-new');
    expect(result.project.status).toBe(VideoProjectStatus.Idea);
    expect(result.project.title).toBe('Microservices Performance');
  });
});
