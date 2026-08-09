import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

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
  address?: string;

  @IsString()
  @IsOptional()
  business?: string;

  @IsString()
  @IsOptional()
  product?: string;

  @IsString()
  @IsOptional()
  customerType?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mainMarkets?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  annualPurchaseAmount?: number;

  @IsString()
  @IsOptional()
  preferredCurrency?: string;

  @IsString()
  @IsOptional()
  preferredIncoterm?: string;

  @IsEnum(["A", "B", "C", "D", ""])
  @IsOptional()
  tier?: "A" | "B" | "C" | "D" | "";

  @IsEnum([
    "new",
    "contacted",
    "replied",
    "qualified",
    "opportunity",
    "won",
    "lost",
    "prospect",
    "lead",
    "proposal",
    "negotiation",
    "closed",
    "",
  ])
  @IsOptional()
  journeyStage?:
    | "new"
    | "contacted"
    | "replied"
    | "qualified"
    | "opportunity"
    | "won"
    | "lost"
    | "prospect"
    | "lead"
    | "proposal"
    | "negotiation"
    | "closed"
    | "";

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  ownerId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  collaboratorIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(["valid", "invalid", "unknown"])
  @IsOptional()
  emailStatus?: "valid" | "invalid" | "unknown";
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
  address?: string;

  @IsString()
  @IsOptional()
  business?: string;

  @IsString()
  @IsOptional()
  product?: string;

  @IsString()
  @IsOptional()
  customerType?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mainMarkets?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  annualPurchaseAmount?: number;

  @IsString()
  @IsOptional()
  preferredCurrency?: string;

  @IsString()
  @IsOptional()
  preferredIncoterm?: string;

  @IsEnum(["A", "B", "C", "D", ""])
  @IsOptional()
  tier?: "A" | "B" | "C" | "D" | "";

  @IsEnum([
    "new",
    "contacted",
    "replied",
    "qualified",
    "opportunity",
    "won",
    "lost",
    "prospect",
    "lead",
    "proposal",
    "negotiation",
    "closed",
    "",
  ])
  @IsOptional()
  journeyStage?:
    | "new"
    | "contacted"
    | "replied"
    | "qualified"
    | "opportunity"
    | "won"
    | "lost"
    | "prospect"
    | "lead"
    | "proposal"
    | "negotiation"
    | "closed"
    | "";

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  ownerId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  collaboratorIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(["valid", "invalid", "unknown"])
  @IsOptional()
  emailStatus?: "valid" | "invalid" | "unknown";
}

export class BulkTagsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];

  @IsString()
  action: "add" | "remove";

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

  @IsEnum(["A", "B", "C", "D", ""])
  tier: "A" | "B" | "C" | "D" | "";
}

export class CreateContactDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsEnum(["", "decision_maker", "influencer", "champion", "user", "gatekeeper", "other"])
  @IsOptional()
  decisionRole?: string;

  @IsEnum(["", "high", "medium", "low"])
  @IsOptional()
  purchasingInfluence?: string;

  @IsString()
  @IsOptional()
  preferredLanguage?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsString()
  @IsOptional()
  linkedin?: string;

  @IsEnum(["unknown", "active", "inactive", "left"])
  @IsOptional()
  contactStatus?: string;

  @IsBoolean()
  @IsOptional()
  marketingAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateContactDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsEnum(["", "decision_maker", "influencer", "champion", "user", "gatekeeper", "other"])
  @IsOptional()
  decisionRole?: string;

  @IsEnum(["", "high", "medium", "low"])
  @IsOptional()
  purchasingInfluence?: string;

  @IsString()
  @IsOptional()
  preferredLanguage?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsString()
  @IsOptional()
  linkedin?: string;

  @IsEnum(["unknown", "active", "inactive", "left"])
  @IsOptional()
  contactStatus?: string;

  @IsBoolean()
  @IsOptional()
  marketingAllowed?: boolean;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class CreateActivityDto {
  @IsEnum(["email", "call", "meeting", "whatsapp", "note", "other"])
  @IsOptional()
  type?: "email" | "call" | "meeting" | "whatsapp" | "note" | "other";

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

  @IsEnum(["open", "done"])
  @IsOptional()
  status?: "open" | "done";
}

export class CreateOpportunityDto {
  @IsNumber()
  customerId: number;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @IsEnum([
    "prospecting",
    "qualification",
    "proposal",
    "negotiation",
    "won",
    "lost",
  ])
  @IsOptional()
  stage?:
    | "prospecting"
    | "qualification"
    | "proposal"
    | "negotiation"
    | "won"
    | "lost";

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  probability?: number;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateOpportunityDto {
  @IsNumber()
  @IsOptional()
  customerId?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @IsEnum([
    "prospecting",
    "qualification",
    "proposal",
    "negotiation",
    "won",
    "lost",
  ])
  @IsOptional()
  stage?:
    | "prospecting"
    | "qualification"
    | "proposal"
    | "negotiation"
    | "won"
    | "lost";

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  probability?: number;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

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
  @Min(0.01)
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discount?: number;

  @IsNumber()
  @Min(0)
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
  opportunityId?: string | null;

  @IsEnum(["draft", "sent", "accepted", "rejected", "expired"])
  @IsOptional()
  status?: "draft" | "sent" | "accepted" | "rejected" | "expired";

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  subtotal?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  freight?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  taxRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  taxAmount?: number;

  @IsNumber()
  @Min(0)
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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];
}

export class UpdateQuoteDto {
  @IsNumber()
  @IsOptional()
  customerId?: number;

  @IsString()
  @IsOptional()
  quoteNo?: string;

  @IsString()
  @IsOptional()
  opportunityId?: string | null;

  @IsEnum(["draft", "sent", "accepted", "rejected", "expired"])
  @IsOptional()
  status?: "draft" | "sent" | "accepted" | "rejected" | "expired";

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  freight?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  taxRate?: number;

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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  @IsOptional()
  items?: QuoteItemDto[];
}

export class CreateSampleDto {
  @IsNumber()
  customerId: number;

  @IsString()
  @IsOptional()
  opportunityId?: string | null;

  @IsString()
  productName: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsEnum(["pending", "sent", "delivered", "returned"])
  @IsOptional()
  status?: "pending" | "sent" | "delivered" | "returned";

  @IsString()
  @IsOptional()
  trackingNo?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  sentAt?: string;

  @IsDateString()
  @IsOptional()
  deliveredAt?: string;
}

export class UpdateSampleDto {
  @IsNumber()
  @IsOptional()
  customerId?: number;

  @IsString()
  @IsOptional()
  opportunityId?: string | null;

  @IsString()
  @IsOptional()
  productName?: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsEnum(["pending", "sent", "delivered", "returned"])
  @IsOptional()
  status?: "pending" | "sent" | "delivered" | "returned";

  @IsString()
  @IsOptional()
  trackingNo?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  sentAt?: string;

  @IsDateString()
  @IsOptional()
  deliveredAt?: string;
}
