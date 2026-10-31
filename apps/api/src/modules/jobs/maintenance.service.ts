import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface StorageCleanupReport {
  scannedAt: Date;
  storageRoot: string;
  filesScanned: number;
  filesDeleted: number;
  bytesFreed: number;
  errors: string[];
}

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly storageRoot: string;

  constructor(private readonly config: ConfigService) {
    this.storageRoot = path.resolve(
      process.cwd(),
      this.config.get<string>('STORAGE_ROOT', './storage'),
    );
  }

  /**
   * Cleans up temporary or orphan scratch files older than maxAgeHours.
   * Preserves approved renders, ingested assets, and final narration WAVs.
   */
  async cleanScratchFiles(maxAgeHours = 24): Promise<StorageCleanupReport> {
    const report: StorageCleanupReport = {
      scannedAt: new Date(),
      storageRoot: this.storageRoot,
      filesScanned: 0,
      filesDeleted: 0,
      bytesFreed: 0,
      errors: [],
    };

    const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const scratchDirs = [
      path.join(this.storageRoot, 'scratch'),
      path.join(this.storageRoot, 'tmp'),
    ];

    for (const dir of scratchDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isFile()) {
            report.filesScanned++;
            const filePath = path.join(dir, entry.name);
            try {
              const stat = await fs.stat(filePath);
              if (stat.mtimeMs < cutoffTime) {
                await fs.unlink(filePath);
                report.filesDeleted++;
                report.bytesFreed += stat.size;
                this.logger.debug(`Deleted stale scratch file: ${filePath}`);
              }
            } catch (err: any) {
              report.errors.push(`Failed to delete ${filePath}: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        report.errors.push(`Failed to access directory ${dir}: ${err.message}`);
      }
    }

    this.logger.log(
      `Storage maintenance complete: freed ${(report.bytesFreed / 1024 / 1024).toFixed(2)} MB across ${report.filesDeleted} files.`,
    );

    return report;
  }

  async getStorageStats(): Promise<{
    storageRoot: string;
    totalSizeBytes: number;
    fileCount: number;
  }> {
    let totalSizeBytes = 0;
    let fileCount = 0;

    const walk = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            fileCount++;
            const stat = await fs.stat(fullPath);
            totalSizeBytes += stat.size;
          }
        }
      } catch (e) {
        // ignore unreadable dirs
      }
    };

    await walk(this.storageRoot);

    return {
      storageRoot: this.storageRoot,
      totalSizeBytes,
      fileCount,
    };
  }
}
