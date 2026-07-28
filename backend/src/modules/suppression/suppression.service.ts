import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Suppression } from './entities/suppression.entity';
import { AddSuppressionDto } from './dto/suppression.dto';

@Injectable()
export class SuppressionService {
  constructor(
    @InjectRepository(Suppression)
    private suppressionRepository: Repository<Suppression>,
  ) {}

  async findAll() {
    return this.suppressionRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async add(dto: AddSuppressionDto) {
    const existing = await this.suppressionRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) return existing;

    const suppression = this.suppressionRepository.create({
      email: dto.email,
      reason: dto.reason || '',
    });
    return this.suppressionRepository.save(suppression);
  }

  async remove(id: number) {
    const result = await this.suppressionRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('禁止记录不存在');
    return { deleted: true };
  }

  async isSuppressed(email: string): Promise<boolean> {
    const count = await this.suppressionRepository.count({
      where: { email },
    });
    return count > 0;
  }
}
