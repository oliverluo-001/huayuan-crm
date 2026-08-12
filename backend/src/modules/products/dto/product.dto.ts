import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductCurrencyPriceDto {
  @IsString()
  @MaxLength(10)
  currency: string;

  @IsNumber()
  @Min(0)
  referencePrice: number;
}

export class ProductSpecificationDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(255)
  value: string;

  @IsString()
  @MaxLength(30)
  @IsOptional()
  unit?: string;
}

export class ProductDescriptionTemplateDto {
  @IsString()
  @MaxLength(32)
  @IsOptional()
  id?: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(5000)
  content: string;
}

export class ProductVariantDto {
  @IsString()
  @MaxLength(32)
  @IsOptional()
  variantId?: string;

  @IsString()
  @MaxLength(100)
  sku: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  standard?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  material?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  pressureRating?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  nominalSize?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  facing?: string;

  @IsString()
  @MaxLength(160)
  @IsOptional()
  surfaceTreatment?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  unit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  weight?: number;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  weightUnit?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  packaging?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  packageQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseCost?: number;

  @IsString()
  @MaxLength(10)
  @IsOptional()
  costCurrency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCurrencyPriceDto)
  @IsOptional()
  prices?: ProductCurrencyPriceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationDto)
  @IsOptional()
  specifications?: ProductSpecificationDto[];

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  inspectionRequirements?: string;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  certificateRequirements?: string;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  quoteDescription?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateProductDto {
  @IsString()
  @MaxLength(100)
  sku: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  code?: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  category?: string;

  @IsIn(['general', 'flange'])
  @IsOptional()
  productType?: 'general' | 'flange';

  @IsString()
  @MaxLength(20)
  @IsOptional()
  unit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  weight?: number;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  weightUnit?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  packaging?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  packageQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseCost?: number;

  @IsString()
  @MaxLength(10)
  @IsOptional()
  costCurrency?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsString()
  @MaxLength(10)
  @IsOptional()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCurrencyPriceDto)
  @IsOptional()
  prices?: ProductCurrencyPriceDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  standards?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  materials?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationDto)
  @IsOptional()
  specifications?: ProductSpecificationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDescriptionTemplateDto)
  @IsOptional()
  descriptionTemplates?: ProductDescriptionTemplateDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  @IsOptional()
  variants?: ProductVariantDto[];

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateProductDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  sku?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  code?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  category?: string;

  @IsIn(['general', 'flange'])
  @IsOptional()
  productType?: 'general' | 'flange';

  @IsString()
  @MaxLength(20)
  @IsOptional()
  unit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  weight?: number;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  weightUnit?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  packaging?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  packageQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseCost?: number;

  @IsString()
  @MaxLength(10)
  @IsOptional()
  costCurrency?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsString()
  @MaxLength(10)
  @IsOptional()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCurrencyPriceDto)
  @IsOptional()
  prices?: ProductCurrencyPriceDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  standards?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  materials?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationDto)
  @IsOptional()
  specifications?: ProductSpecificationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDescriptionTemplateDto)
  @IsOptional()
  descriptionTemplates?: ProductDescriptionTemplateDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  @IsOptional()
  variants?: ProductVariantDto[];

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateProductAssetDto {
  @IsIn(['image', 'technical'])
  assetType: 'image' | 'technical';

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string;
}
