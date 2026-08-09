import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createTransport } from 'nodemailer';
import { Repository } from 'typeorm';
import { Setting } from './entities';
import {
  AiProfileDto,
  EmailPolicyDto,
  ImapProfileDto,
  SearchProfileDto,
  SmtpProfileDto,
} from './dto';
import { CredentialCrypto, EncryptedSecret } from './credential-crypto';
import { formatSmtpError } from '../email/smtp-error';

type StoredProfile = Record<string, any>;

@Injectable()
export class SettingsService {
  private credentialCrypto?: CredentialCrypto;

  constructor(
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
  ) {}

  private get crypto() {
    this.credentialCrypto ||= new CredentialCrypto();
    return this.credentialCrypto;
  }

  // ==================== Generic Settings ====================

  async findAll() {
    const settings = await this.settingRepository.find();
    const result: Record<string, any> = {};
    for (const setting of settings) {
      if (!['search_profiles', 'ai_profile', 'smtp_profile', 'imap_profile', 'unsubscribe_secret'].includes(setting.keyName)) {
        result[setting.keyName] = setting.keyValue;
      }
    }
    result.search_profiles = { profiles: await this.getSearchProfiles() };
    result.ai_profile = await this.getAiProfile();
    result.smtp_profile = await this.getSmtpProfile();
    result.imap_profile = await this.getImapProfile();
    return result;
  }

  async findOne(keyName: string) {
    if (keyName === 'search_profiles') return { profiles: await this.getSearchProfiles() };
    if (keyName === 'ai_profile') return this.getAiProfile();
    if (keyName === 'smtp_profile') return this.getSmtpProfile();
    if (keyName === 'imap_profile') return this.getImapProfile();
    if (keyName === 'unsubscribe_secret') return null;
    return this.findRaw(keyName);
  }

  private async findRaw(keyName: string): Promise<any> {
    const setting = await this.settingRepository.findOne({ where: { keyName } });
    return setting?.keyValue ?? null;
  }

  async upsert(keyName: string, keyValue: any) {
    let setting = await this.settingRepository.findOne({ where: { keyName } });
    if (setting) {
      setting.keyValue = keyValue;
    } else {
      setting = this.settingRepository.create({ keyName, keyValue });
    }
    return this.settingRepository.save(setting);
  }

  async remove(keyName: string) {
    const result = await this.settingRepository.delete({ keyName });
    if (result.affected === 0) throw new NotFoundException('设置不存在');
    return { deleted: true };
  }

  // ==================== Search Profiles ====================

  async getSearchProfiles() {
    const profiles = await this.getStoredSearchProfiles();
    let migrated = false;
    const publicProfiles = profiles.map((profile) => {
      const { apiKey, apiKeyEncrypted, ...safe } = profile;
      let encrypted = apiKeyEncrypted as EncryptedSecret | undefined;
      if (!encrypted && apiKey) {
        encrypted = this.crypto.encrypt(String(apiKey));
        profile.apiKeyEncrypted = encrypted;
        delete profile.apiKey;
        migrated = true;
      }
      return {
        ...safe,
        apiKey: '',
        apiKeySet: Boolean(encrypted),
        credentialStatus: encrypted ? 'saved' : 'not_set',
      };
    });
    if (migrated) await this.upsert('search_profiles', { profiles });
    return publicProfiles;
  }

  async getSearchProfileCredentials(id: string) {
    const profile = (await this.getStoredSearchProfiles()).find((item) => item.id === id);
    if (!profile) throw new NotFoundException('搜索配置不存在');
    return {
      ...profile,
      apiKey: this.decryptStoredSecret(profile.apiKeyEncrypted, profile.apiKey),
      apiKeyEncrypted: undefined,
    };
  }

  async saveSearchProfile(profile: SearchProfileDto) {
    const profiles = await this.getStoredSearchProfiles();
    const index = profiles.findIndex((item) => item.id === profile.id);
    const existing = index >= 0 ? profiles[index] : null;
    const incomingSecret = this.usableSecret(profile.apiKey);
    const stored: StoredProfile = { ...existing, ...profile };
    delete stored.apiKey;
    stored.apiKeyEncrypted = incomingSecret
      ? this.crypto.encrypt(incomingSecret)
      : existing?.apiKeyEncrypted || (existing?.apiKey ? this.crypto.encrypt(existing.apiKey) : undefined);
    if (index >= 0) profiles[index] = stored;
    else profiles.push(stored);
    await this.upsert('search_profiles', { profiles });
    return this.publicSearchProfile(stored);
  }

  async deleteSearchProfile(id: string) {
    const profiles = (await this.getStoredSearchProfiles()).filter((profile) => profile.id !== id);
    await this.upsert('search_profiles', { profiles });
    return { deleted: true };
  }

  private async getStoredSearchProfiles(): Promise<StoredProfile[]> {
    const setting = await this.findRaw('search_profiles');
    return Array.isArray(setting?.profiles) ? setting.profiles : [];
  }

  private publicSearchProfile(profile: StoredProfile) {
    const { apiKey, apiKeyEncrypted, ...safe } = profile;
    return {
      ...safe,
      apiKey: '',
      apiKeySet: Boolean(apiKeyEncrypted || apiKey),
      credentialStatus: apiKeyEncrypted || apiKey ? 'saved' : 'not_set',
    };
  }

  // ==================== AI Profile ====================

  async getAiProfile() {
    const profile = await this.findRaw('ai_profile');
    if (!profile) return null;
    const { apiKey, apiKeyEncrypted, ...safe } = profile;
    let encrypted = apiKeyEncrypted as EncryptedSecret | undefined;
    if (!encrypted && apiKey) {
      encrypted = this.crypto.encrypt(String(apiKey));
      await this.upsert('ai_profile', { ...safe, apiKeyEncrypted: encrypted });
    }
    return {
      ...safe,
      apiKey: '',
      apiKeySet: Boolean(encrypted),
      credentialStatus: encrypted ? 'saved' : 'not_set',
    };
  }

  async getAiCredentials() {
    const profile = await this.findRaw('ai_profile');
    if (!profile) return null;
    return {
      ...profile,
      apiKey: this.decryptStoredSecret(profile.apiKeyEncrypted, profile.apiKey),
      apiKeyEncrypted: undefined,
    };
  }

  async saveAiProfile(profile: AiProfileDto) {
    const existing = (await this.findRaw('ai_profile')) || {};
    const incomingSecret = this.usableSecret(profile.apiKey);
    const stored: StoredProfile = { ...existing, ...profile };
    delete stored.apiKey;
    stored.apiKeyEncrypted = incomingSecret
      ? this.crypto.encrypt(incomingSecret)
      : existing.apiKeyEncrypted || (existing.apiKey ? this.crypto.encrypt(existing.apiKey) : undefined);
    await this.upsert('ai_profile', stored);
    return this.getAiProfile();
  }

  // ==================== Connection Tests ====================

  async testSearchProfile(id: string) {
    const profile = await this.getSearchProfileCredentials(id);
    if (!profile.apiKey) throw new BadRequestException('该搜索数据源未配置 API 密钥');
    return { ok: true, message: '密钥已安全保存；真实搜索测试将在获客引擎恢复阶段启用' };
  }

  async testAiProfile() {
    const profile = await this.getAiCredentials();
    if (!profile?.apiKey) throw new BadRequestException('请先配置 AI 模型密钥');
    return { ok: true, message: '密钥已安全保存；真实模型测试将在获客引擎恢复阶段启用' };
  }

  async testSmtpProfile() {
    const profile = await this.getSmtpCredentials();
    this.assertSmtpProfile(profile);
    const transport = createTransport({
      host: profile.smtpHost,
      port: Number(profile.smtpPort || 587),
      secure: Boolean(profile.smtpSecure),
      auth: { user: profile.smtpUser, pass: profile.pass },
    });
    try {
      await transport.verify();
      return { ok: true, message: 'SMTP 连接和身份认证成功' };
    } catch (error) {
      throw new BadRequestException(formatSmtpError(error));
    }
  }

  // ==================== SMTP Profile ====================

  async getSmtpProfile() {
    const profile = await this.findRaw('smtp_profile');
    if (!profile) return null;
    const migrated = await this.migrateLegacySecret('smtp_profile', profile, 'pass');
    const { pass, passEncrypted, ...safe } = migrated;
    return {
      ...safe,
      pass: '',
      credentialStatus: passEncrypted ? 'saved' : 'not_set',
    };
  }

  async getSmtpCredentials(): Promise<StoredProfile> {
    const profile: StoredProfile | null = await this.findRaw('smtp_profile');
    if (!profile) throw new BadRequestException('请先在设置中配置发件邮箱');
    const migrated = await this.migrateLegacySecret('smtp_profile', profile, 'pass');
    return {
      ...migrated,
      pass: this.decryptStoredSecret(migrated.passEncrypted, migrated.pass),
      passEncrypted: undefined,
    };
  }

  async saveSmtpProfile(profile: SmtpProfileDto) {
    const existing = (await this.findRaw('smtp_profile')) || {};
    const incomingSecret = this.usableSecret(profile.pass);
    const stored: StoredProfile = {
      ...existing,
      ...profile,
      smtpHost: profile.smtpHost || profile.host || existing.smtpHost || '',
      smtpPort: profile.smtpPort || profile.port || existing.smtpPort || 587,
      smtpUser: profile.smtpUser || profile.user || existing.smtpUser || '',
      smtpFrom: profile.smtpFrom || profile.fromEmail || existing.smtpFrom || '',
    };
    delete stored.pass;
    stored.passEncrypted = incomingSecret
      ? this.crypto.encrypt(incomingSecret)
      : existing.passEncrypted || (existing.pass ? this.crypto.encrypt(existing.pass) : undefined);
    await this.upsert('smtp_profile', stored);
    return this.getSmtpProfile();
  }

  // ==================== IMAP Profile ====================

  async getImapProfile() {
    const profile = await this.findRaw('imap_profile');
    if (!profile) return null;
    const migrated = await this.migrateLegacySecret('imap_profile', profile, 'pass');
    const { pass, passEncrypted, ...safe } = migrated;
    return {
      ...safe,
      pass: '',
      credentialStatus: passEncrypted ? 'saved' : 'not_set',
    };
  }

  async getImapCredentials() {
    const profile = await this.findRaw('imap_profile');
    if (!profile) return null;
    const migrated = await this.migrateLegacySecret('imap_profile', profile, 'pass');
    return {
      ...migrated,
      pass: this.decryptStoredSecret(migrated.passEncrypted, migrated.pass),
      passEncrypted: undefined,
    };
  }

  async saveImapProfile(profile: ImapProfileDto) {
    const existing = (await this.findRaw('imap_profile')) || {};
    const incomingSecret = this.usableSecret(profile.pass);
    const stored: StoredProfile = { ...existing, ...profile };
    delete stored.pass;
    stored.passEncrypted = incomingSecret
      ? this.crypto.encrypt(incomingSecret)
      : existing.passEncrypted || (existing.pass ? this.crypto.encrypt(existing.pass) : undefined);
    await this.upsert('imap_profile', stored);
    return this.getImapProfile();
  }

  // ==================== Email Policy ====================

  async getEmailPolicy() {
    const policy = await this.findRaw('email_policy');
    return policy || {
      maxPerHour: 40,
      maxPerDay: 200,
      minDelaySeconds: 20,
      workdayStart: 8,
      workdayEnd: 18,
      enforceTimezone: true,
      allowWeekends: false,
    };
  }

  async saveEmailPolicy(policy: EmailPolicyDto) {
    await this.upsert('email_policy', policy);
    return policy;
  }

  async getOrCreateUnsubscribeSecret() {
    const stored = await this.findRaw('unsubscribe_secret');
    if (stored?.valueEncrypted) return this.crypto.decrypt(stored.valueEncrypted);
    const legacy = typeof stored === 'string' ? stored : stored?.value;
    const secret = legacy || require('node:crypto').randomBytes(32).toString('hex');
    await this.upsert('unsubscribe_secret', { valueEncrypted: this.crypto.encrypt(secret) });
    return secret;
  }

  private async migrateLegacySecret(
    keyName: string,
    profile: StoredProfile,
    field: string,
  ): Promise<StoredProfile> {
    if (!profile?.[field] || profile[`${field}Encrypted`]) return profile;
    const migrated = { ...profile, [`${field}Encrypted`]: this.crypto.encrypt(String(profile[field])) };
    delete migrated[field];
    await this.upsert(keyName, migrated);
    return migrated;
  }

  private decryptStoredSecret(encrypted: unknown, legacy: unknown) {
    try {
      return encrypted ? this.crypto.decrypt(encrypted) : typeof legacy === 'string' ? legacy : '';
    } catch {
      throw new BadRequestException('凭据无法解密，请在设置中重新输入并保存');
    }
  }

  private usableSecret(value?: string) {
    const normalized = String(value || '').trim();
    return normalized && normalized !== '******' ? normalized : '';
  }

  private assertSmtpProfile(profile: StoredProfile) {
    if (!profile.smtpHost || !profile.smtpUser || !profile.pass) {
      throw new BadRequestException('SMTP 主机、用户名或密码未配置完整');
    }
  }
}
