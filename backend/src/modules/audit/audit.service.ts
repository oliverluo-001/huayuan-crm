import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEntry } from './entities/audit.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEntry)
    private auditRepository: Repository<AuditEntry>,
  ) {}

  async findAll(options: { page?: number; limit?: number; username?: string; action?: string; status?: string } = {}) {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
    const query = this.auditRepository.createQueryBuilder('audit').orderBy('audit.createdAt', 'DESC');
    if (options.username) query.andWhere('audit.username LIKE :username', { username: `%${options.username}%` });
    if (options.action) query.andWhere('(audit.action LIKE :action OR audit.path LIKE :action)', { action: `%${options.action}%` });
    if (options.status === 'success' || options.status === 'failed') query.andWhere('audit.status = :status', { status: options.status });
    const [items, total] = await query.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  async log(data: Partial<AuditEntry> & Pick<AuditEntry, 'username' | 'action'>) {
    const entry = this.auditRepository.create({ ...data, details: data.details || '' });
    return this.auditRepository.save(entry);
  }
}
