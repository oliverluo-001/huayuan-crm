import { IsString, IsOptional, IsEnum, IsEmail, IsArray, IsNumber, IsDateString } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  contact?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  region?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  business?: string;

  @IsString()
  @IsOptional()
  product?: string;

  @IsString()
  @IsOptional()
  customerType?: string;

  @IsEnum(['A', 'B', 'C', 'D', ''])
  @IsOptional()
  tier?: 'A' | 'B' | 'C' | 'D' | '';

  @IsEnum(['prospect', 'lead', 'qualified', 'proposal', 'negotiation', 'closed', ''])
  @IsOptional()
  journeyStage?: 'prospect' | 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed' | '';

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(['valid', 'invalid', 'unknown'])
  @IsOptional()
  emailStatus?: 'valid' | 'invalid' | 'unknown';
}

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  contact?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  region?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  business?: string;

  @IsString()
  @IsOptional()
  product?: string;

  @IsString()
  @IsOptional()
  customerType?: string;

  @IsEnum(['A', 'B', 'C', 'D', ''])
  @IsOptional()
  tier?: 'A' | 'B' | 'C' | 'D' | '';

  @IsEnum(['prospect', 'lead', 'qualified', 'proposal', 'negotiation', 'closed', ''])
  @IsOptional()
  journeyStage?: 'prospect' | 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed' | '';

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(['valid', 'invalid', 'unknown'])
  @IsOptional()
  emailStatus?: 'valid' | 'invalid' | 'unknown';
}

export class BulkTagsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];

  @IsString()
  action: 'add' | 'remove';

  @IsString()
  tag: string;
}

export class BulkDeleteDto {
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];
}

export class BulkTierDto {
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];

  @IsEnum(['A', 'B', 'C', 'D', ''])
  tier: 'A' | 'B' | 'C' | 'D' | '';
}

export class CreateContactDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsOptional()
  isPrimary?: boolean;
}

export class UpdateContactDto extends CreateContactDto {}

export class CreateActivityDto {
  @IsEnum(['email', 'call', 'meeting', 'note', 'other'])
  @IsOptional()
  type?: 'email' | 'call' | 'meeting' | 'note' | 'other';

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  content?: string;
}

export class CreateTodoDto {
  @IsNumber()
  customerId: number;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  dueAt?: string;
}

export class UpdateTodoDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @IsEnum(['open', 'done'])
  @IsOptional()
  status?: 'open' | 'done';
}

export class CreateOpportunityDto {
  @IsNumber()
  customerId: number;

  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsEnum(['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'])
  @IsOptional()
  stage?: 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'won' | 'lost';

  @IsNumber()
  @IsOptional()
  probability?: number;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateOpportunityDto extends CreateOpportunityDto {}

export class QuoteItemDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  productName: string;

  @IsString()
  @IsOptional()
  productCode?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @IsNumber()
  @IsOptional()
  discount?: number;

  @IsNumber()
  @IsOptional()
  subtotal?: number;
}

export class CreateQuoteDto {
  @IsNumber()
  customerId: number;

  @IsString()
  @IsOptional()
  quoteNo?: string;

  @IsString()
  @IsOptional()
  opportunityId?: string;

  @IsEnum(['draft', 'sent', 'accepted', 'rejected', 'expired'])
  @IsOptional()
  status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  subtotal?: number;

  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @IsNumber()
  @IsOptional()
  total?: number;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  terms?: string;

  @IsArray()
  items: QuoteItemDto[];
}

export class UpdateQuoteDto extends CreateQuoteDto {}

export class CreateSampleDto {
  @IsNumber()
  customerId: number;

  @IsString()
  @IsOptional()
  opportunityId?: string;

  @IsString()
  productName: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsEnum(['pending', 'sent', 'delivered', 'returned'])
  @IsOptional()
  status?: 'pending' | 'sent' | 'delivered' | 'returned';

  @IsString()
  @IsOptional()
  trackingNo?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSampleDto extends CreateSampleDto {}