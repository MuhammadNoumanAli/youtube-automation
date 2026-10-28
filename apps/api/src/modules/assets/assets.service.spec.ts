import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AssetsService } from './assets.service';
import { Asset, AssetType, LicenseType } from '../../database/entities/asset.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

describe('AssetsService', () => {
  let service: AssetsService;
  const mockAssetRepo = {
    create: jest.fn().mockImplementation((dto) => ({ id: 'asset-1', ...dto })),
    save: jest.fn().mockImplementation(async (item) => ({ ...item, id: item.id || 'asset-1' })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockProjectRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'proj-1', title: 'Test Project' }),
    save: jest.fn().mockImplementation(async (item) => item),
  };

  const mockAuditRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation(async (dto) => dto),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('./storage_test'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: getRepositoryToken(Asset), useValue: mockAssetRepo },
        { provide: getRepositoryToken(VideoProject), useValue: mockProjectRepo },
        { provide: getRepositoryToken(AuditEvent), useValue: mockAuditRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  afterAll(() => {
    // Clean up test storage directory if created
    const testDir = path.resolve('./storage_test');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate SHA-256 checksum correctly and store safe asset file', async () => {
    const dummyBuffer = Buffer.from('test media image content 12345');
    const expectedHash = crypto.createHash('sha256').update(dummyBuffer).digest('hex');

    const result = await service.createAssetFromFile(
      'proj-1',
      {
        asset_type: AssetType.Image,
        license_type: LicenseType.UserCreated,
        commercial_use_allowed: true,
        license_notes: 'Created directly by creator in design suite',
      },
      dummyBuffer,
      'test_image.png',
      'image/png',
    );

    expect(result.checksum_sha256).toBe(expectedHash);
    expect(result.license_type).toBe(LicenseType.UserCreated);
    expect(result.commercial_use_allowed).toBe(true);
    expect(result.video_project_id).toBe('proj-1');
    expect(result.storage_path.endsWith('.png')).toBe(true);
    expect(mockAssetRepo.save).toHaveBeenCalled();
    expect(mockAuditRepo.save).toHaveBeenCalled();
  });

  it('should reject unauthorized file extensions and MIME types', async () => {
    const dummyBuffer = Buffer.from('malicious executable code');

    await expect(
      service.createAssetFromFile(
        'proj-1',
        {
          asset_type: AssetType.Other,
          license_type: LicenseType.PublicDomain,
          license_notes: 'Testing malicious upload rejection',
          commercial_use_allowed: false,
        },
        dummyBuffer,
        'virus.exe',
        'application/x-msdownload',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject files exceeding the maximum size limit (250MB)', async () => {
    const oversizedBuffer = {
      length: 260 * 1024 * 1024,
    } as any;

    await expect(
      service.createAssetFromFile(
        'proj-1',
        {
          asset_type: AssetType.Video,
          license_type: LicenseType.CreativeCommons,
          license_notes: 'Exceeding limit test',
          commercial_use_allowed: false,
        },
        oversizedBuffer,
        'huge_video.mp4',
        'video/mp4',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should sanitize filename and prevent path traversal', async () => {
    const dummyBuffer = Buffer.from('safe sample content');

    const result = await service.createAssetFromFile(
      'proj-1',
      {
        asset_type: AssetType.Image,
        license_type: LicenseType.FairUseQuoted,
        license_notes: 'Quoted for critique',
        commercial_use_allowed: false,
      },
      dummyBuffer,
      '../../../../etc/passwd.png',
      'image/png',
    );

    // Verify storage path stays firmly within the storage root
    const resolvedPath = path.resolve(result.storage_path);
    const resolvedStorage = path.resolve((service as any).getStorageDir());
    expect(resolvedPath.startsWith(resolvedStorage)).toBe(true);
    expect(resolvedPath).not.toContain('..');
  });

  it('should record license metadata without assuming automated legal verification', async () => {
    const dummyBuffer = Buffer.from('sample audio sound effect');

    const result = await service.createAssetFromFile(
      'proj-1',
      {
        asset_type: AssetType.Audio,
        license_type: LicenseType.CreativeCommons,
        attribution_text: 'CC-BY 4.0 Author Name',
        source_url: 'https://freesound.org/sample/12345',
        commercial_use_allowed: true,
        license_notes: 'Attribution required under CC-BY 4.0',
      },
      dummyBuffer,
      'sfx.wav',
      'audio/wav',
    );

    expect(result.license_type).toBe(LicenseType.CreativeCommons);
    expect(result.attribution_text).toBe('CC-BY 4.0 Author Name');
    expect(result.source_url).toBe('https://freesound.org/sample/12345');
  });
});
