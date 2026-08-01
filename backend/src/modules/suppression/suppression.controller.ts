import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { SuppressionService } from './suppression.service';
import { AddSuppressionDto } from './dto/suppression.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('suppressions')
@Roles('admin')
export class SuppressionController {
  constructor(private suppressionService: SuppressionService) {}

  @Get()
  findAll() {
    return this.suppressionService.findAll();
  }

  @Post()
  add(@Body() dto: AddSuppressionDto) {
    return this.suppressionService.add(dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.suppressionService.remove(id);
  }
}
