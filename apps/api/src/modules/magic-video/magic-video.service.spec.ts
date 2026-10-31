import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MagicVideoService } from './magic-video.service';
import { VideoProject, VideoFormat, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { Narration } from '../../database/entities/narration.entity';
import { Asset } from '../../database/entities/asset.entity';
import { RenderJob, RenderJobStatus } from '../../database/entities/render-job.entity';
import { ApprovalRecord } from '../../database/entities/approval-record.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { VideosService } from '../videos/videos.service';
import { ScriptsService } from '../scripts/scripts.service';
import { NarrationService } from '../narration/narration.service';
import { RenderingService } from '../rendering/rendering.service';
import { MagicVideoFormat, MagicVisualStyle } from './dto/magic-generate.dto';

describe('MagicVideoService', () => {
  let service: MagicVideoService;
  let mockProjectRepo: any;
  let mockChannelRepo: any;
  let mockScriptRepo: any;
  let mockNarrationRepo: any;
  let mockAssetRepo: any;
  let mockRenderRepo: any;
  let mockApprovalRepo: any;
  let mockAuditRepo: any;
  let mockVideosService: any;
  let mockScriptsService: any;
  let mockNarrationService: any;
  let mockRenderingService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockProjectRepo = {
      create: jest.fn((e) => ({ id: 'proj-magic-1', ...e })),
      save: jest.fn((e) => Promise.resolve({ id: 'proj-magic-1', ...e })),
      findOne: jest.fn(),
    };
    mockChannelRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'chan-1', name: 'Main Channel' }),
      create: jest.fn((e) => ({ id: 'chan-1', ...e })),
      save: jest.fn((e) => Promise.resolve({ id: 'chan-1', ...e })),
    };
    mockScriptRepo = {
      save: jest.fn((e) => Promise.resolve(e)),
    };
    mockNarrationRepo = {};
    mockAssetRepo = {
      create: jest.fn((e) => ({ id: 'asset-1', ...e })),
      save: jest.fn((e) => Promise.resolve({ id: 'asset-1', ...e })),
    };
    mockRenderRepo = {
      create: jest.fn((e) => ({ id: 'render-1', ...e })),
      save: jest.fn((e) => Promise.resolve({ id: 'render-1', ...e })),
    };
    mockApprovalRepo = {
      create: jest.fn((e) => ({ id: 'appr-1', ...e })),
      save: jest.fn((e) => Promise.resolve({ id: 'appr-1', ...e })),
    };
    mockAuditRepo = {
      create: jest.fn((e) => ({ id: 'audit-1', ...e })),
      save: jest.fn((e) => Promise.resolve({ id: 'audit-1', ...e })),
    };

    mockVideosService = {
      create: jest.fn().mockResolvedValue({
        id: 'proj-magic-1',
        title: '3 Deep Ocean Facts',
        format: VideoFormat.Short,
        status: VideoProjectStatus.Idea,
      }),
    };

    mockScriptsService = {
      generate: jest.fn().mockResolvedValue({
        id: 'script-1',
        video_project_id: 'proj-magic-1',
        status: ScriptStatus.Review,
        scene_plan_json: [
          { sceneNumber: 1, visualDescription: 'Deep ocean footage', onScreenText: 'DEEP OCEAN FACTS' },
          { sceneNumber: 2, visualDescription: 'Anglerfish swimming', onScreenText: 'THE ANGLERFISH' },
          { sceneNumber: 3, visualDescription: 'Submarine descending', onScreenText: 'EXTREME PRESSURE' },
        ],
      }),
    };

    mockNarrationService = {
      generate: jest.fn().mockResolvedValue({
        id: 'narr-1',
        storage_path: 'storage/narration/test.wav',
        duration_seconds: 30,
      }),
    };

    mockRenderingService = {
      getFfmpegPath: jest.fn().mockReturnValue('ffmpeg'),
      validateVideo: jest.fn().mockResolvedValue({
        valid: true,
        durationSeconds: 30,
        width: 720,
        height: 1280,
      }),
    };

    mockConfigService = {
      get: jest.fn((key) => {
        if (key === 'STORAGE_ROOT') return './storage_test_magic';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MagicVideoService,
        { provide: getRepositoryToken(VideoProject), useValue: mockProjectRepo },
        { provide: getRepositoryToken(ChannelProfile), useValue: mockChannelRepo },
        { provide: getRepositoryToken(Script), useValue: mockScriptRepo },
        { provide: getRepositoryToken(Narration), useValue: mockNarrationRepo },
        { provide: getRepositoryToken(Asset), useValue: mockAssetRepo },
        { provide: getRepositoryToken(RenderJob), useValue: mockRenderRepo },
        { provide: getRepositoryToken(ApprovalRecord), useValue: mockApprovalRepo },
        { provide: getRepositoryToken(AuditEvent), useValue: mockAuditRepo },
        { provide: VideosService, useValue: mockVideosService },
        { provide: ScriptsService, useValue: mockScriptsService },
        { provide: NarrationService, useValue: mockNarrationService },
        { provide: RenderingService, useValue: mockRenderingService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MagicVideoService>(MagicVideoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
