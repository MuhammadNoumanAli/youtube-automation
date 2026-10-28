import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScriptsService } from './scripts.service';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { VideoProject, VideoProjectStatus, VideoFormat } from '../../database/entities/video-project.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { AiProviderFactory } from '../ai-providers/ai-provider.factory';
import { MockTextProvider } from '../ai-providers/mock-text.provider';

describe('ScriptsService', () => {
  let service: ScriptsService;
  let scriptRepoMock: any;
  let projectRepoMock: any;
  let auditRepoMock: any;

  const mockProject: VideoProject = {
    id: 'proj-123',
    channel_profile_id: 'chan-123',
    channel_profile: { id: 'chan-123', name: 'Tech Channel', niche: 'Engineering' } as any,
    title: 'Modern Architecture',
    working_title: 'Modern Architecture',
    topic: 'Modern Architecture and Patterns',
    target_audience: 'Engineers',
    format: VideoFormat.LongForm,
    target_duration_seconds: 300,
    status: VideoProjectStatus.Idea,
    script_version: 1,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockScript: Script = {
    id: 'script-123',
    video_project_id: 'proj-123',
    video_project: mockProject,
    version: 1,
    content: 'Full script content',
    outline_json: ['Intro', 'Body', 'Outro'],
    scene_plan_json: [],
    metadata_json: { title: 'Modern Architecture', description: 'desc', tags: [] },
    provider: 'mock',
    model: 'mock-engine-v1',
    status: ScriptStatus.Review,
    created_at: new Date(),
  };

  beforeEach(async () => {
    scriptRepoMock = {
      find: jest.fn().mockResolvedValue([mockScript]),
      findOne: jest.fn().mockResolvedValue({ ...mockScript }),
      create: jest.fn().mockImplementation((val) => ({ ...val, id: 'script-new' })),
      save: jest.fn().mockImplementation((val) => Promise.resolve({ ...val })),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    };

    projectRepoMock = {
      findOne: jest.fn().mockResolvedValue({ ...mockProject }),
      save: jest.fn().mockImplementation((val) => Promise.resolve({ ...val })),
    };

    auditRepoMock = {
      create: jest.fn().mockImplementation((val) => ({ ...val, id: 'audit-1' })),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScriptsService,
        {
          provide: getRepositoryToken(Script),
          useValue: scriptRepoMock,
        },
        {
          provide: getRepositoryToken(VideoProject),
          useValue: projectRepoMock,
        },
        {
          provide: getRepositoryToken(AuditEvent),
          useValue: auditRepoMock,
        },
        {
          provide: AiProviderFactory,
          useValue: {
            getTextProvider: () => new MockTextProvider(),
          },
        },
      ],
    }).compile();

    service = module.get<ScriptsService>(ScriptsService);
  });

  it('should generate a script draft and transition project to script_review', async () => {
    const result = await service.generate('proj-123', { tone: 'Technical' });

    expect(result.status).toBe(ScriptStatus.Review);
    expect(result.provider).toBe('mock');
    expect(projectRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: VideoProjectStatus.ScriptReview,
      }),
    );
    expect(auditRepoMock.save).toHaveBeenCalled();
  });

  it('should approve script, transition project to script_approved, and record audit event', async () => {
    const approval = await service.approve('script-123', {
      notes: 'Reviewed and confirmed technical accuracy',
      approved_by: 'creator_1',
    });

    expect(approval.script.status).toBe(ScriptStatus.Approved);
    expect(approval.project.status).toBe(VideoProjectStatus.ScriptApproved);
    expect(auditRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SCRIPT_APPROVED',
        actor: 'creator_1',
      }),
    );
  });
});
