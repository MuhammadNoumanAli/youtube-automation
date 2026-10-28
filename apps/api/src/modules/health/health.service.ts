import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    connected: boolean;
    databaseName: string;
    error?: string;
  };
  storage: {
    root: string;
    accessible: boolean;
    error?: string;
  };
  system: {
    nodeVersion: string;
    platform: string;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async check(): Promise<HealthStatus> {
    const dbName = this.configService.get<string>('DB_DATABASE', 'youtube_automation');
    let dbConnected = false;
    let dbError: string | undefined;

    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        dbConnected = true;
      }
    } catch (err: any) {
      dbConnected = false;
      dbError = err.message || 'Database connection error';
    }

    const storageRoot = this.configService.get<string>('STORAGE_ROOT', './storage');
    let storageAccessible = false;
    let storageError: string | undefined;

    try {
      const resolvedStorage = path.resolve(storageRoot);
      if (!fs.existsSync(resolvedStorage)) {
        fs.mkdirSync(resolvedStorage, { recursive: true });
      }
      fs.accessSync(resolvedStorage, fs.constants.R_OK | fs.constants.W_OK);
      storageAccessible = true;
    } catch (err: any) {
      storageAccessible = false;
      storageError = err.message || 'Storage root inaccessible';
    }

    const overallStatus: 'ok' | 'degraded' | 'error' =
      dbConnected && storageAccessible
        ? 'ok'
        : storageAccessible
          ? 'degraded'
          : 'error';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      database: {
        connected: dbConnected,
        databaseName: dbName,
        error: dbError,
      },
      storage: {
        root: storageRoot,
        accessible: storageAccessible,
        error: storageError,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    };
  }
}
