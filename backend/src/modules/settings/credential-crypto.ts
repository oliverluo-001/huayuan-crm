import * as crypto from 'node:crypto';

export interface EncryptedSecret {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
}

export class CredentialCrypto {
  private readonly key: Buffer;

  constructor(secret?: string) {
    const source = String(
      secret || process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || '',
    ).trim();
    if (!source || source === 'your-super-secret-jwt-key-change-in-production') {
      throw new Error('请配置 CREDENTIAL_ENCRYPTION_KEY，用于加密邮箱和 API 凭据');
    }
    this.key = crypto.createHash('sha256').update(source, 'utf8').digest();
  }

  encrypt(value: string): EncryptedSecret {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      version: 1,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  decrypt(value: unknown): string {
    if (!this.isEncrypted(value)) return typeof value === 'string' ? value : '';
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(value.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  isEncrypted(value: unknown): value is EncryptedSecret {
    const candidate = value as Partial<EncryptedSecret> | null;
    return Boolean(
      candidate &&
        candidate.version === 1 &&
        candidate.algorithm === 'aes-256-gcm' &&
        candidate.iv &&
        candidate.authTag &&
        candidate.ciphertext,
    );
  }
}
