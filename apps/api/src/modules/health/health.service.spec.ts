import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let dataSourceMock: { isInitialized: boolean; query: jest.Mock };
  let configServiceMock: { get: jest.Mock };

  beforeEach(async () => {
    dataSourceMock = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '1': 1 }]),
    };

    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'DB_DATABASE') return 'youtube_automation';
        if (key === 'STORAGE_ROOT') return './storage';
        if (key === 'NODE_ENV') return 'test';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return ok when DB query succeeds and storage is accessible', async () => {
    const health = await service.check();
    expect(health.status).toBe('ok');
    expect(health.database.connected).toBe(true);
    expect(health.storage.accessible).toBe(true);
    expect(health.environment).toBe('test');
  });

  it('should return degraded when DB fails but storage is accessible', async () => {
    dataSourceMock.query.mockRejectedValue(new Error('Connection failed'));
    const health = await service.check();
    expect(health.status).toBe('degraded');
    expect(health.database.connected).toBe(false);
    expect(health.database.error).toBe('Connection failed');
    expect(health.storage.accessible).toBe(true);
  });
});
