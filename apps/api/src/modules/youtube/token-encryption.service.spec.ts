import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService (AES-256-GCM)', () => {
  let service: TokenEncryptionService;
  let mockKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars = 32 bytes

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'YOUTUBE_TOKEN_ENCRYPTION_KEY') return mockKey;
      return null;
    }),
  };

  beforeEach(async () => {
    mockKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenEncryptionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TokenEncryptionService>(TokenEncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should successfully encrypt and decrypt a token payload', () => {
    const rawTokens = JSON.stringify({
      access_token: 'ya29.sample_secret_access_token_12345',
      refresh_token: '1//sample_secret_refresh_token_67890',
      expiry_date: Date.now() + 3600000,
    });

    const encrypted = service.encrypt(rawTokens);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toContain('ya29.sample_secret_access_token');
    expect(encrypted.split(':')).toHaveLength(3); // iv:tag:ciphertext

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(rawTokens);
    expect(JSON.parse(decrypted).access_token).toBe('ya29.sample_secret_access_token_12345');
  });

  it('should generate a fresh IV for each encryption of identical plaintexts', () => {
    const text = 'identical_token_payload';
    const enc1 = service.encrypt(text);
    const enc2 = service.encrypt(text);

    expect(enc1).not.toBe(enc2);
    expect(enc1.split(':')[0]).not.toBe(enc2.split(':')[0]); // Distinct IVs
    expect(service.decrypt(enc1)).toBe(text);
    expect(service.decrypt(enc2)).toBe(text);
  });

  it('should throw InternalServerErrorException when encryption key is missing', () => {
    mockKey = '';
    expect(() => service.encrypt('payload')).toThrow(InternalServerErrorException);
  });

  it('should throw InternalServerErrorException when encryption key is not 64 hex characters (32 bytes)', () => {
    mockKey = 'short-key-123'; // invalid length
    expect(() => service.encrypt('payload')).toThrow(InternalServerErrorException);

    mockKey = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'; // 64 non-hex
    expect(() => service.encrypt('payload')).toThrow(InternalServerErrorException);
  });

  it('should reject tampered ciphertext with authentication tag verification failure', () => {
    const raw = 'secret_content_to_protect';
    const encrypted = service.encrypt(raw);
    const [iv, tag, ciphertext] = encrypted.split(':');

    // Tamper with the ciphertext byte
    const tamperedCipher = ciphertext.substring(0, ciphertext.length - 2) + 'ff';
    const tamperedPayload = `${iv}:${tag}:${tamperedCipher}`;

    expect(() => service.decrypt(tamperedPayload)).toThrow(InternalServerErrorException);
  });

  it('should reject tampered authentication tag', () => {
    const raw = 'sensitive_oauth_token';
    const encrypted = service.encrypt(raw);
    const [iv, tag, ciphertext] = encrypted.split(':');

    const tamperedTag = tag.substring(0, tag.length - 2) + '00';
    const tamperedPayload = `${iv}:${tamperedTag}:${ciphertext}`;

    expect(() => service.decrypt(tamperedPayload)).toThrow(InternalServerErrorException);
  });
});
