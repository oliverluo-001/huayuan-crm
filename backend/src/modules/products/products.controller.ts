import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateProductAssetDto, CreateProductDto, UpdateProductDto } from './dto';
import { ProductsService } from './products.service';

interface RequestUser {
  sub: number;
  role: 'admin' | 'sales' | 'viewer';
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    const products = await this.productsService.findAll(query, user.role !== 'viewer');
    return { products };
  }

  @Get('assets/:assetId/preview')
  async previewAsset(@Param('assetId') assetId: string, @Res() response: Response) {
    const { asset, filePath } = await this.productsService.getAssetDownload(+assetId);
    response.type(asset.mimeType || 'application/octet-stream');
    return response.sendFile(filePath);
  }

  @Get('assets/:assetId/download')
  async downloadAsset(@Param('assetId') assetId: string, @Res() response: Response) {
    const { asset, filePath } = await this.productsService.getAssetDownload(+assetId);
    response.type(asset.mimeType || 'application/octet-stream');
    return response.download(filePath, asset.originalName);
  }

  @Delete('assets/:assetId')
  @Roles('admin', 'sales')
  removeAsset(@Param('assetId') assetId: string) {
    return this.productsService.removeAsset(+assetId);
  }

  @Get(':id/assets')
  listAssets(@Param('id') id: string) {
    return this.productsService.listAssets(+id);
  }

  @Post(':id/assets')
  @Roles('admin', 'sales')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  uploadAsset(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: CreateProductAssetDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('请选择需要上传的产品资料');
    return this.productsService.createAsset(+id, file, dto, String(user.sub));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.productsService.findOne(+id, user.role !== 'viewer');
  }

  @Post()
  @Roles('admin', 'sales')
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(+id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  remove(@Param('id') id: string) {
    return this.productsService.remove(+id);
  }
}
