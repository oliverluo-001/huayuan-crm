import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Backup } from './entities/backup.entity';
import { SaveBackupSettingsDto } from './dto/backup.dto';

const DEFAULT_SETTINGS = { enabled: true, intervalHours: 24, retentionDays: 30 };

@Injectable()
export class BackupService {
  constructor(
    @InjectRepository(Backup)
    private backupRepository: Repository<Backup>,
  ) {}

  async getSettings() {
    try {
      const settingsStr = process.env.BACKUP_SETTINGS;
      if (settingsStr) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(settingsStr) };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  async saveSettings(settings: SaveBackupSettingsDto) {
    process.env.BACKUP_SETTINGS = JSON.stringify({ ...DEFAULT_SETTINGS, ...settings });
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async findAll() {
    return this.backupRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async create(data?: string, filename?: string) {
    const backup = this.backupRepository.create({
      backupId: this.generateId('bak'),
      filename: filename || `backup_${Date.now()}.json`,
      data: data || '',
      size: data ? Buffer.byteLength(data, 'utf-8') : 0,
      type: data ? 'manual' : 'auto',
    });
    await this.backupRepository.save(backup);

    // Enforce retention
    const settings = await this.getSettings();
    const cutoff = new Date(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000);
    await this.backupRepository
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute();

    return {
      id: backup.backupId,
      filename: backup.filename,
      size: backup.size,
      createdAt: backup.createdAt,
    };
  }

  async remove(id: number) {
    const result = await this.backupRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('备份不存在');
    return { deleted: true };
  }

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}${random}`;
  }
}
