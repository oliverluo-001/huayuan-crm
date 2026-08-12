import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product, ProductAsset, ProductVariant } from './entities';
import { ProductsService, ProductsController } from './';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant, ProductAsset])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
