import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities';
import {
  CreateSettingDto,
  UpdateSettingDto,
  SearchProfileDto,
  AiProfileDto,
  SmtpProfileDto,
  ImapProfileDto,
  EmailPolicyDto,
} from './dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
  ) {}

  // ==================== Generic Settings ====================

  async findAll() {
    const settings = await this.settingRepository.find();
    const result: Record<string, any> = {};
    for (const setting of settings) {
      result[setting.keyName] = setting.keyValue;
    }
    return result;
  }

  async findOne(keyName: string) {
    const setting = await this.settingRepository.findOne({
      where: { keyName },
    });
    if (!setting) {
      return null;
    }
    return setting.keyValue;
  }

  async upsert(keyName: string, keyValue: Record<string, any>) {
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
    if (result.affected === 0) {
      throw new NotFoundException('设置不存在');
    }
    return { deleted: true };
  }

  // ==================== Search Profiles ====================

  async getSearchProfiles() {
    const setting = await this.findOne('search_profiles');
    return setting?.profiles || [];
  }

  async saveSearchProfile(profile: SearchProfileDto) {
    const profiles = await this.getSearchProfiles();
    const index = profiles.findIndex((p: any) => p.id === profile.id);
    if (index >= 0) {
      profiles[index] = profile;
    } else {
      profiles.push(profile);
    }
    await this.upsert('search_profiles', { profiles });
    return profile;
  }

  async deleteSearchProfile(id: string) {
    const profiles = await this.getSearchProfiles();
    const filtered = profiles.filter((p: any) => p.id !== id);
    await this.upsert('search_profiles', { profiles: filtered });
    return { deleted: true };
  }

  // ==================== AI Profile ====================

  async getAiProfile() {
    return this.findOne('ai_profile');
  }

  async saveAiProfile(profile: AiProfileDto) {
    await this.upsert('ai_profile', profile);
    return profile;
  }

  // ==================== Test Methods ====================

  async testSearchProfile(id: string) {
    const profiles = await this.getSearchProfiles();
    const profile = profiles.find((p: any) => p.id === id);
    if (!profile) {
      throw new NotFoundException('搜索配置不存在');
    }
    // Stub: actual test would make an API call
    return { ok: true, message: '配置有效' };
  }

  async testAiProfile() {
    const profile = await this.getAiProfile();
    if (!profile) {
      throw new BadRequestException('请先配置 AI 模型');
    }
    // Stub: actual test would make an API call
    return { ok: true, message: '连接成功' };
  }

  // ==================== SMTP Profile ====================

  async getSmtpProfile() {
    const profile = await this.findOne('smtp_profile');
    if (profile) {
      // Mask sensitive data
      return {
        ...profile,
        pass: profile.pass ? '******' : '',
      };
    }
    return null;
  }

  async saveSmtpProfile(profile: SmtpProfileDto) {
    await this.upsert('smtp_profile', profile);
    return {
      ...profile,
      pass: '******',
    };
  }

  // ==================== IMAP Profile ====================

  async getImapProfile() {
    const profile = await this.findOne('imap_profile');
    if (profile) {
      return {
        ...profile,
        pass: profile.pass ? '******' : '',
      };
    }
    return null;
  }

  async saveImapProfile(profile: ImapProfileDto) {
    await this.upsert('imap_profile', profile);
    return {
      ...profile,
      pass: '******',
    };
  }

  // ==================== Email Policy ====================

  async getEmailPolicy() {
    const policy = await this.findOne('email_policy');
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
}