import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { NarrationService } from './narration.service';
import { MockTtsProvider } from './mock-tts.provider';
import { Narration, NarrationStatus } from '../../database/entities/narration.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

describe('NarrationService', () => {
  let service: NarrationService;
  let mockTts: MockTtsProvider;

  const mockNarrationRepo = {
    create: jest.fn().mockImplementation((dto) => ({ id: 'narr-1', ...dto })),
    save: jest.fn().mockImplementation(async (item) => ({ ...item, id: item.id || 'narr-1' })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };

  const mockProjectRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'proj-1', title: 'Test Project' }),
  };

  const mockScriptRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'script-1',
      video_project_id: 'proj-1',
      status: ScriptStatus.Approved,
      content: 'Hello and welcome to this video about automated production.',
    }),
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
        NarrationService,
        MockTtsProvider,
        { provide: getRepositoryToken(Narration), useValue: mockNarrationRepo },
        { provide: getRepositoryToken(VideoProject), useValue: mockProjectRepo },
        { provide: getRepositoryToken(Script), useValue: mockScriptRepo },
        { provide: getRepositoryToken(AuditEvent), useValue: mockAuditRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NarrationService>(NarrationService);
    mockTts = module.get<MockTtsProvider>(MockTtsProvider);
  });

  afterAll(() => {
    const testDir = path.resolve('./storage_test');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('MockTtsProvider should generate a valid RIFF/WAVE header and PCM data', async () => {
    const testDir = path.resolve('./storage_test/narration');
    fs.mkdirSync(testDir, { recursive: true });
    const testFile = path.join(testDir, 'test_mock.wav');

    const result = await mockTts.synthesize('This is a test script with eight words here.', testFile);

    expect(result.format).toBe('wav');
    expect(result.provider).toBe('mock');
    expect(result.durationSeconds).toBeGreaterThanOrEqual(5);
    expect(fs.existsSync(testFile)).toBe(true);

    const fileContent = fs.readFileSync(testFile);
    expect(fileContent.toString('ascii', 0, 4)).toBe('RIFF');
    expect(fileContent.toString('ascii', 8, 12)).toBe('WAVE');
    expect(fileContent.toString('ascii', 12, 16)).toBe('fmt ');
    expect(fileContent.readUInt16LE(20)).toBe(1); // PCM format
    expect(fileContent.readUInt32LE(24)).toBe(44100); // 44.1kHz sample rate
    expect(fileContent.readUInt16LE(34)).toBe(16); // 16 bits per sample
  });

  it('should generate narration audio record from approved script', async () => {
    const result = await service.generate('proj-1');

    expect(result.video_project_id).toBe('proj-1');
    expect(result.status).toBe(NarrationStatus.Ready);
    expect(result.provider).toBe('mock');
    expect(mockNarrationRepo.save).toHaveBeenCalled();
    expect(mockAuditRepo.save).toHaveBeenCalled();
  });

  it('should import voiceover file with allowed audio extension', async () => {
    const dummyAudio = Buffer.from('RIFF....WAVEfmt ....data....');

    const result = await service.importVoiceover(
      'proj-1',
      dummyAudio,
      'my_voiceover.mp3',
      'audio/mpeg',
    );

    expect(result.provider).toBe('user_uploaded');
    expect(result.status).toBe(NarrationStatus.Ready);
    expect(mockNarrationRepo.save).toHaveBeenCalled();
  });

  it('should reject invalid voiceover extensions like .exe or .sh', async () => {
    const dummyAudio = Buffer.from('echo malicious');

    await expect(
      service.importVoiceover('proj-1', dummyAudio, 'payload.sh', 'text/x-sh'),
    ).rejects.toThrow(BadRequestException);
  });
});
