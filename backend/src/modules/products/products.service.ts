import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Product } from './entities';
import { CreateProductDto, UpdateProductDto } from './dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  async findAll(filters: Record<string, any> = {}) {
    const where: any = {};

    if (filters.q) {
      return this.productRepository
        .createQueryBuilder('product')
        .where(
          `product.code LIKE :q OR product.name LIKE :q OR product.category LIKE :q`,
          { q: `%${filters.q}%` },
        )
        .orderBy('product.createdAt', 'DESC')
        .getMany();
    }

    if (filters.category) {
      where.category = Like(`%${filters.category}%`);
    }

    return this.productRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('产品不存在');
    }
    return product;
  }

  async create(createProductDto: CreateProductDto) {
    const product = this.productRepository.create({
      ...createProductDto,
      productId: this.generateId('prod'),
    });
    return this.productRepository.save(product);
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    const product = await this.findOne(id);
    Object.assign(product, updateProductDto);
    return this.productRepository.save(product);
  }

  async remove(id: number) {
    const result = await this.productRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('产品不存在');
    }
    return { deleted: true };
  }

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}${random}`;
  }
}