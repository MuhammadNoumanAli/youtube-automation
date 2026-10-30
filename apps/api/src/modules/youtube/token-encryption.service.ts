import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class TokenEncryptionService {
  private readonly logger = new Logger(TokenEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly configService: ConfigService) {}

  private getEncryptionKey(): Buffer {
    const rawKey = this.configService.get<string>('YOUTUBE_TOKEN_ENCRYPTION_KEY');
    if (!rawKey || typeof rawKey !== 'string') {
      throw new InternalServerErrorException(
        'OAuth token encryption configuration is missing. YOUTUBE_TOKEN_ENCRYPTION_KEY must be set.',
      );
    }

    const trimmed = rawKey.trim();
    if (trimmed.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      throw new InternalServerErrorException(
        'YOUTUBE_TOKEN_ENCRYPTION_KEY must be a valid 32-byte hex-encoded string (64 hex characters).',
      );
    }

    return Buffer.from(trimmed, 'hex');
  }

  encrypt(plainText: string): string {
    if (!plainText) {
      throw new InternalServerErrorException('Cannot encrypt empty or null payload.');
    }

    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12); // Standard 12-byte IV for AES-GCM
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Serialized format: iv_hex:auth_tag_hex:ciphertext_hex
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(payload: string): string {
    if (!payload || typeof payload !== 'string') {
      throw new InternalServerErrorException('Invalid encrypted payload format.');
    }

    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException(
        'Encrypted token payload format is invalid (expected iv:tag:ciphertext).',
      );
    }

    const [ivHex, tagHex, dataHex] = parts;
    if (ivHex.length !== 24 || tagHex.length !== 32) {
      throw new InternalServerErrorException(
        'Malformed IV or authentication tag in encrypted token payload.',
      );
    }

    const key = this.getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encryptedData = Buffer.from(dataHex, 'hex');

    try {
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      // Intentionally do not log error details that might contain buffer memory
      throw new InternalServerErrorException(
        'Failed to decrypt token: authentication tag verification failed or payload corrupted.',
      );
    }
  }
}
