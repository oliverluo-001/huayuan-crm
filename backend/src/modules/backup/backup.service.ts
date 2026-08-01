import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Backup } from './entities/backup.entity';
import { SaveBackupSettingsDto } from './dto/backup.dto';
import { SettingsService } from '../settings/settings.service';

const DEFAULT_SETTINGS = { enabled: true, intervalHours: 24, retentionDays: 30 };
const EXCLUDED_TABLES = new Set(['backups', 'schema_migrations']);

interface BackupPayload {
  format: 'huayuan-crm-mysql-json';
  version: 1;
  createdAt: string;
  checksum?: string;
  tables: Record<string, Record<string, unknown>[]>;
}

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private scheduler?: NodeJS.Timeout;
  private creating = false;

  constructor(
    @InjectRepository(Backup)
    private backupRepository: Repository<Backup>,
    private dataSource: DataSource,
    private settingsService: SettingsService,
  ) {}

  onModuleInit() {
    this.scheduler = setInterval(() => void this.runAutomaticBackup(), 15 * 60 * 1000);
    this.scheduler.unref?.();
    setTimeout(() => void this.runAutomaticBackup(), 30_000).unref?.();
  }

  onModuleDestroy() {
    if (this.scheduler) clearInterval(this.scheduler);
  }

  async getSettings() {
    const stored = await this.settingsService.findOne('backup_settings');
    return { ...DEFAULT_SETTINGS, ...(stored || {}) };
  }

  async saveSettings(settings: SaveBackupSettingsDto) {
    const saved = { ...DEFAULT_SETTINGS, ...settings };
    await this.settingsService.upsert('backup_settings', saved);
    return saved;
  }

  async findAll() {
    const backups = await this.backupRepository.find({ order: { createdAt: 'DESC' } });
    return backups.map((backup) => this.toPublic(backup));
  }

  async create(_data?: string, _filename?: string, type: 'manual' | 'auto' = 'manual') {
    if (this.creating) throw new BadRequestException('已有备份任务正在执行');
    this.creating = true;
    try {
      const payload = await this.dumpDatabase();
      const unsigned = JSON.stringify(payload);
      payload.checksum = createHash('sha256').update(unsigned).digest('hex');
      const data = JSON.stringify(payload);
      const filename = `huayuan-crm_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await this.writeBackupFile(filename, data);

      const backup = this.backupRepository.create({
        backupId: this.generateId('bak'),
        filename,
        data,
        size: Buffer.byteLength(data, 'utf8'),
        type,
      });
      await this.backupRepository.save(backup);
      await this.enforceRetention();
      return this.toPublic(backup);
    } finally {
      this.creating = false;
    }
  }

  async verify(idOrBackupId: string) {
    const backup = await this.findEntity(idOrBackupId);
    const payload = await this.readPayload(backup);
    const expected = payload.checksum;
    const unsigned = { ...payload };
    delete unsigned.checksum;
    const actual = createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
    if (expected !== actual) throw new BadRequestException('备份校验失败，文件可能已损坏');
    return {
      valid: true,
      backupId: backup.backupId,
      tableCount: Object.keys(payload.tables).length,
      rowCount: Object.values(payload.tables).reduce((sum, rows) => sum + rows.length, 0),
      createdAt: payload.createdAt,
    };
  }

  async getDownload(idOrBackupId: string) {
    const backup = await this.findEntity(idOrBackupId);
    await this.verify(idOrBackupId);
    const data = backup.data || await readFile(join(this.backupDirectory(), backup.filename), 'utf8');
    return { filename: backup.filename, data };
  }

  async remove(idOrBackupId: string) {
    const backup = await this.findEntity(idOrBackupId);
    await this.backupRepository.remove(backup);
    await rm(join(this.backupDirectory(), backup.filename), { force: true }).catch(() => undefined);
    return { deleted: true };
  }

  private async runAutomaticBackup() {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || this.creating) return;
      const latest = await this.backupRepository.findOne({ order: { createdAt: 'DESC' } });
      const intervalMs = Math.max(1, Number(settings.intervalHours)) * 60 * 60 * 1000;
      if (latest && Date.now() - latest.createdAt.getTime() < intervalMs) return;
      await this.create(undefined, undefined, 'auto');
      this.logger.log('Automatic MySQL backup completed');
    } catch (error) {
      this.logger.error(`Automatic backup failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async dumpDatabase(): Promise<BackupPayload> {
    const tables: BackupPayload['tables'] = {};
    for (const table of await this.tableNames()) {
      if (EXCLUDED_TABLES.has(table) || !/^[a-zA-Z0-9_]+$/.test(table)) continue;
      tables[table] = await this.dataSource.query(`SELECT * FROM \`${table}\``);
    }
    return {
      format: 'huayuan-crm-mysql-json',
      version: 1,
      createdAt: new Date().toISOString(),
      tables,
    };
  }

  private async tableNames() {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    return rows.map((row) => String(Object.values(row)[0] || '')).filter(Boolean);
  }

  private async readPayload(backup: Backup): Promise<BackupPayload> {
    const data = backup.data || await readFile(join(this.backupDirectory(), backup.filename), 'utf8');
    let payload: BackupPayload;
    try { payload = JSON.parse(data); } catch { throw new BadRequestException('备份文件不是有效 JSON'); }
    if (payload?.format !== 'huayuan-crm-mysql-json' || payload.version !== 1 || !payload.tables || !payload.checksum) {
      throw new BadRequestException('备份格式或版本不受支持');
    }
    return payload;
  }

  private async enforceRetention() {
    const settings = await this.getSettings();
    const cutoff = new Date(Date.now() - Number(settings.retentionDays) * 24 * 60 * 60 * 1000);
    const expired = await this.backupRepository
      .createQueryBuilder('backup')
      .where('backup.created_at < :cutoff', { cutoff })
      .getMany();
    for (const backup of expired) await this.remove(String(backup.id));
  }

  private async writeBackupFile(filename: string, data: string) {
    const directory = this.backupDirectory();
    await mkdir(directory, { recursive: true });
    const target = join(directory, filename);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, data, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  }

  private backupDirectory() {
    return resolve(process.env.BACKUP_DIR || join(process.cwd(), 'data', 'backups'));
  }

  private async findEntity(idOrBackupId: string) {
    const numeric = Number(idOrBackupId);
    const backup = await this.backupRepository.findOne({
      where: Number.isInteger(numeric) && numeric > 0
        ? [{ id: numeric }, { backupId: idOrBackupId }]
        : { backupId: idOrBackupId },
    });
    if (!backup) throw new NotFoundException('备份不存在');
    return backup;
  }

  private toPublic(backup: Backup) {
    return {
      id: backup.backupId || String(backup.id),
      filename: backup.filename,
      size: backup.size,
      type: backup.type,
      createdAt: backup.createdAt,
    };
  }

  private generateId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
  }
}
