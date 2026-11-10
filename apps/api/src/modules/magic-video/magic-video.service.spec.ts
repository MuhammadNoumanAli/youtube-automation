import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';

// FFmpeg is replaced by a stub that writes the output file (last argument) and exits 0.
jest.mock('child_process', () => ({
  spawn: jest.fn((_cmd: string, args: string[]) => {
    const proc: any = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.kill = jest.fn();
    setImmediate(() => {
      const out = args[args.length - 1];
      require('fs').mkdirSync(require('path').dirname(out), { recursive: true });
      require('fs').writeFileSync(out, 'stub');
      proc.emit('close', 0);
    });
    return proc;
  }),
}));
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MagicVideoService } from './magic-video.service';
import { VideoProject, VideoFormat, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { Narration } from '../../database/entities/narration.entity';
import { Asset, LicenseType } from '../../database/entities/asset.entity';
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
      find: jest.fn().mockResolvedValue([{ id: 'chan-1', name: 'Main Channel' }]),
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

  describe('generateOneClickVideo (safety fixes)', () => {
    const storage = path.resolve('./storage_test_magic');
    afterAll(() => fs.rmSync(storage, { recursive: true, force: true }));

    it('leaves the generated script in review: no automatic approval record, no approved status', async () => {
      const result = await service.generateOneClickVideo({ prompt: '3 Deep Ocean Facts', format: MagicVideoFormat.Short });
      expect(result.project_id).toBe('proj-magic-1');
      expect(mockApprovalRepo.save).not.toHaveBeenCalled();
      for (const call of mockScriptRepo.save.mock.calls) expect(call[0].status).not.toBe(ScriptStatus.Approved);
      const audit = mockAuditRepo.create.mock.calls.map((c: any[]) => c[0].action);
      expect(audit).toContain('MAGIC_SCRIPT_AWAITING_REVIEW');
    });

    it('labels locally generated clips as user-created, never Creative Commons', async () => {
      await service.generateOneClickVideo({ prompt: '3 Deep Ocean Facts', format: MagicVideoFormat.Short });
      const assets = mockAssetRepo.create.mock.calls.map((c: any[]) => c[0]);
      expect(assets.length).toBeGreaterThan(0);
      for (const a of assets) {
        expect(a.license_type).toBe(LicenseType.UserCreated);
        expect(a.license_type).not.toBe(LicenseType.CreativeCommons);
      }
    });

    it('does not call Pexels when external API calls are disabled, even with a key set', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false } as any);
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'STORAGE_ROOT') return './storage_test_magic';
        if (key === 'PEXELS_API_KEY') return 'test-key';
        if (key === 'ENABLE_EXTERNAL_API_CALLS') return false;
        return null;
      });
      await service.generateOneClickVideo({
        prompt: '3 Deep Ocean Facts',
        format: MagicVideoFormat.Short,
        visual_style: MagicVisualStyle.StockBroll,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('labels Pexels clips with the Pexels licence, contributor and source page when allowed', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as any).mockImplementation(async (url: any) => {
        if (String(url).includes('api.pexels.com')) {
          return {
            ok: true,
            json: async () => ({
              videos: [
                {
                  url: 'https://www.pexels.com/video/ocean-123/',
                  user: { name: 'Jane Doe' },
                  video_files: [{ height: 1280, link: 'https://videos.pexels.com/x.mp4' }],
                },
              ],
            }),
          } as any;
        }
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as any;
      });
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'STORAGE_ROOT') return './storage_test_magic';
        if (key === 'PEXELS_API_KEY') return 'test-key';
        if (key === 'ENABLE_EXTERNAL_API_CALLS') return true;
        return null;
      });
      await service.generateOneClickVideo({
        prompt: '3 Deep Ocean Facts',
        format: MagicVideoFormat.Short,
        visual_style: MagicVisualStyle.StockBroll,
      });
      const assets = mockAssetRepo.create.mock.calls.map((c: any[]) => c[0]);
      expect(assets[0].license_type).toBe(LicenseType.StockLicense);
      expect(assets[0].creator).toBe('Jane Doe (Pexels)');
      expect(assets[0].source_url).toBe('https://www.pexels.com/video/ocean-123/');
      expect(assets[0].license_notes).toContain('Pexels License');
      fetchSpy.mockRestore();
    });
  });
});
