import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { RenderingService } from './rendering.service';
import { RenderJob } from '../../database/entities/render-job.entity';
import { VideoProject, VideoProjectStatus, VideoFormat } from '../../database/entities/video-project.entity';
import { Script } from '../../database/entities/script.entity';
import { Narration } from '../../database/entities/narration.entity';
import { Asset } from '../../database/entities/asset.entity';
import { ApprovalRecord, ApprovalType, ApprovalDecision } from '../../database/entities/approval-record.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { NarrationService } from '../narration/narration.service';

describe('RenderingService', () => {
  let service: RenderingService;

  const mockRenderRepo = {
    create: jest.fn().mockImplementation((dto) => ({ id: 'render-1', ...dto })),
    save: jest.fn().mockImplementation(async (item) => ({ ...item, id: item.id || 'render-1' })),
    findOne: jest.fn(),
  };

  const mockProjectRepo = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (item) => item),
  };

  const mockScriptRepo = {
    findOne: jest.fn(),
  };

  const mockNarrationRepo = {
    findOne: jest.fn(),
  };

  const mockAssetRepo = {
    find: jest.fn().mockResolvedValue([]),
  };

  const mockApprovalRepo = {
    create: jest.fn().mockImplementation((dto) => ({ id: 'approval-1', ...dto })),
    save: jest.fn().mockImplementation(async (item) => ({ ...item, id: item.id || 'approval-1' })),
  };

  const mockAuditRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation(async (dto) => dto),
  };

  const mockConfigService = {
    get: jest.fn((key: string, def?: any) => {
      if (key === 'STORAGE_ROOT') return './storage_test';
      if (key === 'FFMPEG_PATH') return 'C:\\WINDOWS\\system32\\ffmpeg.exe';
      return def;
    }),
  };

  const mockNarrationService = {
    generate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenderingService,
        { provide: getRepositoryToken(RenderJob), useValue: mockRenderRepo },
        { provide: getRepositoryToken(VideoProject), useValue: mockProjectRepo },
        { provide: getRepositoryToken(Script), useValue: mockScriptRepo },
        { provide: getRepositoryToken(Narration), useValue: mockNarrationRepo },
        { provide: getRepositoryToken(Asset), useValue: mockAssetRepo },
        { provide: getRepositoryToken(ApprovalRecord), useValue: mockApprovalRepo },
        { provide: getRepositoryToken(AuditEvent), useValue: mockAuditRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: NarrationService, useValue: mockNarrationService },
      ],
    }).compile();

    service = module.get<RenderingService>(RenderingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkBinaries', () => {
    it('should detect availability of FFmpeg and FFprobe without throwing', async () => {
      const binaries = await service.checkBinaries();
      expect(binaries).toBeDefined();
      expect(binaries.ffmpeg).toHaveProperty('path');
      expect(binaries.ffmpeg).toHaveProperty('available');
      expect(binaries.ffprobe).toHaveProperty('path');
      expect(binaries.ffprobe).toHaveProperty('available');
    });
  });

  describe('recordApproval', () => {
    it('should approve render and update project status to render_approved', async () => {
      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        status: VideoProjectStatus.RenderReview,
      });

      const result = await service.recordApproval('proj-1', {
        decision: ApprovalDecision.Approved,
        notes: 'Audio is synchronized and titles are clear',
        approved_by: 'reviewer_1',
      });

      expect(result.project.status).toBe(VideoProjectStatus.RenderApproved);
      expect(result.approval.approval_type).toBe(ApprovalType.Render);
      expect(result.approval.decision).toBe(ApprovalDecision.Approved);
      expect(mockApprovalRepo.save).toHaveBeenCalled();
      expect(mockAuditRepo.save).toHaveBeenCalled();
    });

    it('should revert project status to assets_pending when rejected', async () => {
      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        status: VideoProjectStatus.RenderReview,
      });

      const result = await service.recordApproval('proj-1', {
        decision: ApprovalDecision.Rejected,
        notes: 'Audio clip volume is too low',
        approved_by: 'reviewer_1',
      });

      expect(result.project.status).toBe(VideoProjectStatus.AssetsPending);
      expect(result.approval.decision).toBe(ApprovalDecision.Rejected);
    });

    it('should never allow render approval to transition to scheduled_or_public or uploaded_private', async () => {
      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        status: VideoProjectStatus.RenderReview,
      });

      const result = await service.recordApproval('proj-1', {
        decision: ApprovalDecision.Approved,
        approved_by: 'reviewer_1',
      });

      expect(result.project.status).not.toBe(VideoProjectStatus.ScheduledOrPublic);
      expect(result.project.status).not.toBe(VideoProjectStatus.UploadedPrivate);
      expect(result.project.status).toBe(VideoProjectStatus.RenderApproved);
    });
  });

  describe('renderProject pre-flight validation', () => {
    it('should throw BadRequestException if project has no script', async () => {
      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        title: 'Empty Project',
        format: VideoFormat.LongForm,
      });
      mockScriptRepo.findOne.mockResolvedValue(null);

      await expect(
        service.renderProject('proj-1', { fps: 30 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
