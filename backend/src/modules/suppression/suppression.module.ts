import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Suppression } from './entities/suppression.entity';
import { SuppressionService } from './suppression.service';
import { SuppressionController } from './suppression.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Suppression])],
  controllers: [SuppressionController],
  providers: [SuppressionService],
  exports: [SuppressionService],
})
export class SuppressionModule {}
