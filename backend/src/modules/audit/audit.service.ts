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

  async findAll(limit = 50) {
    return this.auditRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async log(username: string, action: string, details?: string) {
    const entry = this.auditRepository.create({ username, action, details: details || '' });
    return this.auditRepository.save(entry);
  }
}
