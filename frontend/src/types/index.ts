// Auth types
export interface AuthStatus {
  initialized: boolean;
  authenticated: boolean;
  username: string;
  displayName?: string;
  userId?: string;
  role?: string;
  registrationMode?: "approval" | "open" | "disabled";
  registrationEnabled?: boolean;
  registrationRequiresApproval?: boolean;
}

export interface LoginResult {
  ok: boolean;
  username: string;
  displayName?: string;
  userId?: string;
  role?: string;
}

export interface RegisterResult extends LoginResult {
  requiresApproval: boolean;
  message?: string;
}

export interface User {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  role: "admin" | "sales" | "viewer";
  status: "active" | "pending" | "rejected";
  active: boolean;
  registrationSource?: "setup" | "admin" | "self";
  approvedAt?: string;
  approvedBy?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UserDirectoryEntry {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: "admin" | "sales" | "viewer";
}

// Customer types
export interface Customer {
  id: string;
  company: string;
  business?: string;
  contact?: string;
  email?: string;
  phone?: string;
  website?: string;
  region?: string;
  country?: string;
  address?: string;
  timezone?: string;
  tags?: string[];
  tier: "A" | "B" | "C" | "D" | "";
  journeyStage:
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
  customerType?: string;
  mainMarkets?: string[];
  annualPurchaseAmount?: number;
  preferredCurrency?: string;
  preferredIncoterm?: string;
  product?: string;
  source?: string;
  sourceHistory?: Array<{
    customerId: string;
    company: string;
    source: string;
    mergedAt: string;
  }>;
  ownerId?: string;
  ownerName?: string;
  collaboratorIds?: string[];
  notes?: string;
  emailStatus?: "valid" | "invalid" | "unknown";
  emailFailureReason?: string;
  emailFailedAt?: string;
  emailSentCount?: number;
  firstEmailSentAt?: string;
  lastEmailSentAt?: string;
  createdAt: string;
  updatedAt: string;
  // Extended fields from backend
  nextTodoTitle?: string;
  nextTodoAt?: string;
  health?: "good" | "warning" | "critical" | "";
  openOpportunityCount?: number;
  openOpportunityValue?: number;
  lastActivityAt?: string;
  lastActivityType?: string;
}

export interface CustomerListResult {
  customers: Customer[];
  total: number;
}

export interface DuplicateCustomerSummary {
  id: number;
  customerId: string;
  company: string;
  contact?: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
  ownerId?: string;
  collaboratorIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateCustomerMatch {
  type: "email" | "domain" | "phone" | "company";
  label: string;
  value: string;
  confidence: number;
  customerIds: number[];
}

export interface DuplicateCustomerGroup {
  id: string;
  confidence: number;
  matches: DuplicateCustomerMatch[];
  members: DuplicateCustomerSummary[];
}

export interface DuplicateCustomerGroupsResult {
  groups: DuplicateCustomerGroup[];
  summary: {
    scannedCustomers: number;
    duplicateGroups: number;
    duplicateCustomers: number;
  };
}

export interface DuplicateMergeFieldValue {
  customerId: number;
  customerKey: string;
  company: string;
  value: unknown;
  isPrimary: boolean;
}

export interface DuplicateMergePreview {
  primary: DuplicateCustomerSummary;
  duplicates: DuplicateCustomerSummary[];
  matches: DuplicateCustomerMatch[];
  fields: Array<{
    key: string;
    label: string;
    values: DuplicateMergeFieldValue[];
    conflict: boolean;
    recommendedCustomerId: number;
  }>;
  contactOptions: Array<{
    key: string;
    contactId: number | null;
    customerId: number;
    customerKey: string;
    company: string;
    name: string;
    email: string;
    phone: string;
    isPrimary: boolean;
    synthetic: boolean;
  }>;
  defaultPrimaryContactSelection: string;
  defaultFieldSelections: Record<string, number>;
  relationCounts: Record<string, Record<string, number>>;
  accessPlan: { ownerId: string; collaboratorIds: string[] };
  mergeAllowed: boolean;
  warnings: string[];
  previewToken: string;
}

export interface DuplicateMergeResult {
  mergeId: string;
  customer: Customer;
  mergedCustomerIds: string[];
  movedRelations: Record<string, number>;
}

export interface Customer360 {
  customer: Customer;
  contacts: Contact[];
  activities: Activity[];
  todos: Todo[];
  opportunities: Opportunity[];
  quotes: Quote[];
  samples: Sample[];
  sendLogs?: SendLog[];
}

export interface CustomerAttachment {
  id: string;
  attachmentId?: string;
  customerId: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: "inquiry" | "drawing" | "contract" | "other";
  note?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  customerId: string;
  name: string;
  title?: string;
  department?: string;
  decisionRole?:
    | ""
    | "decision_maker"
    | "influencer"
    | "champion"
    | "user"
    | "gatekeeper"
    | "other";
  purchasingInfluence?: "" | "high" | "medium" | "low";
  preferredLanguage?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  linkedin?: string;
  contactStatus?: "unknown" | "active" | "inactive" | "left";
  marketingAllowed?: boolean;
  isPrimary?: boolean;
  createdAt: string;
}

export interface Activity {
  id: string;
  customerId: string;
  type: "email" | "call" | "meeting" | "whatsapp" | "note" | "other";
  subject: string;
  content?: string;
  createdAt: string;
}

export interface Todo {
  id: string;
  customerId: string;
  customerName?: string;
  title: string;
  description?: string;
  status: "open" | "done";
  dueAt?: string;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  opportunityId?: string;
  customerId: string;
  customerName?: string;
  customer?: { id: string; customerId?: string; company: string };
  name: string;
  stage:
    | "prospecting"
    | "qualification"
    | "proposal"
    | "negotiation"
    | "won"
    | "lost";
  amount?: number;
  probability?: number;
  ownerId?: string;
  ownerName?: string;
  collaboratorIds?: string[];
  productName?: string;
  productSpecification?: string;
  expectedQuantity?: number;
  quantityUnit?: string;
  targetPrice?: number;
  currency?: string;
  budget?: number;
  purchaseTime?: string;
  decisionProcess?: string;
  nextStepAction?: string;
  nextStepDueDate?: string;
  expectedCloseDate: string;
  forecastCategory?: "pipeline" | "best_case" | "commit" | "closed" | "omitted";
  winReason?: string;
  lossReason?: string;
  competitors?: string;
  stageEnteredAt?: string;
  closedAt?: string;
  stageDurationHours?: number;
  stageDurationDays?: number;
  isOverdue?: boolean;
  missingNextStep?: boolean;
  alerts?: Array<"overdue" | "missing_next_step">;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityStageHistory {
  id: string;
  opportunityPk: number;
  opportunityKey: string;
  fromStage?: Opportunity["stage"] | null;
  toStage: Opportunity["stage"];
  durationHours: number;
  changedById?: string;
  changedByName?: string;
  changeNote?: string;
  changedAt: string;
}

// Product types
export interface Product {
  id: string;
  productId?: string;
  sku: string;
  code?: string;
  name: string;
  category?: string;
  productType?: "general" | "flange";
  unit?: string;
  weight?: number;
  weightUnit?: string;
  packaging?: string;
  packageQuantity?: number;
  baseCost?: number;
  costCurrency?: string;
  price?: number;
  currency?: string;
  prices?: ProductCurrencyPrice[];
  standards?: string[];
  materials?: string[];
  specifications?: ProductSpecification[];
  descriptionTemplates?: ProductDescriptionTemplate[];
  variants?: ProductVariant[];
  assets?: ProductAsset[];
  description?: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCurrencyPrice {
  currency: string;
  referencePrice: number;
}

export interface ProductSpecification {
  name: string;
  value: string;
  unit?: string;
}

export interface ProductDescriptionTemplate {
  id?: string;
  name: string;
  content: string;
}

export interface ProductVariant {
  id?: string;
  variantId?: string;
  sku: string;
  name?: string;
  standard?: string;
  material?: string;
  pressureRating?: string;
  nominalSize?: string;
  facing?: string;
  surfaceTreatment?: string;
  unit?: string;
  weight?: number;
  weightUnit?: string;
  packaging?: string;
  packageQuantity?: number;
  baseCost?: number;
  costCurrency?: string;
  prices?: ProductCurrencyPrice[];
  specifications?: ProductSpecification[];
  inspectionRequirements?: string;
  certificateRequirements?: string;
  quoteDescription?: string;
  active?: boolean;
}

export interface ProductAsset {
  id: string;
  assetId?: string;
  productPk: number;
  assetType: "image" | "technical";
  originalName: string;
  mimeType?: string;
  size: number;
  note?: string;
  createdAt: string;
}

// Quote types (mirrors the backend Quote + QuoteItem entities)
export interface QuoteItem {
  id?: string;
  productId?: string;
  productName: string;
  productCode?: string;
  variantId?: string;
  sku?: string;
  standard?: string;
  material?: string;
  pressureRating?: string;
  nominalSize?: string;
  facing?: string;
  surfaceTreatment?: string;
  weight?: number;
  weightUnit?: string;
  packaging?: string;
  inspectionRequirements?: string;
  certificateRequirements?: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discount: number;
  subtotal: number;
}

export interface QuoteAdditionalCharge {
  label: string;
  amount: number;
}

export interface QuoteTermTemplate {
  id: string;
  name: string;
  contentZh?: string;
  contentEn?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  id: string;
  quoteId?: string;
  quoteNo?: string;
  customerId: string;
  customer?: { id: string; customerId?: string; company: string };
  opportunityId?: string;
  items: QuoteItem[];
  currency: string;
  baseCurrency: string;
  exchangeRate: number;
  freight: number;
  additionalCharges: QuoteAdditionalCharge[];
  additionalFeeTotal: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  validUntil?: string;
  incoterm?: string;
  originPort?: string;
  destinationPort?: string;
  deliveryTime?: string;
  paymentTerms?: string;
  packagingTerms?: string;
  warrantyTerms?: string;
  notes?: string;
  notesEn?: string;
  terms?: string;
  termsEn?: string;
  termTemplateId?: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  createdAt: string;
  updatedAt: string;
}

export type QuoteOutputLanguage = "zh" | "en" | "bilingual";

export interface QuoteBrandAsset {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
}

export interface QuoteOutputProfile {
  companyNameZh: string;
  companyNameEn: string;
  taglineZh: string;
  taglineEn: string;
  addressZh: string;
  addressEn: string;
  phone: string;
  email: string;
  website: string;
  contactName: string;
  contactTitle: string;
  contactPhone: string;
  contactEmail: string;
  bankName: string;
  bankAddress: string;
  accountName: string;
  accountNumber: string;
  swiftCode: string;
  beneficiaryAddress: string;
  defaultLanguage: QuoteOutputLanguage;
  footerZh: string;
  footerEn: string;
  logoAsset?: QuoteBrandAsset | null;
  signatureAsset?: QuoteBrandAsset | null;
}

// Sample types
export interface Sample {
  id: string;
  sampleId?: string;
  customerId: string;
  customer?: { id: string; customerId?: string; company: string };
  opportunityId?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unit: string;
  status: "pending" | "sent" | "delivered" | "returned";
  sentAt?: string;
  deliveredAt?: string;
  trackingNo?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOpportunityInput {
  name: string;
  amount?: number;
  stage?: Opportunity["stage"];
  probability?: number;
  ownerId?: string;
  collaboratorIds?: string[];
  productName?: string;
  productSpecification?: string;
  expectedQuantity?: number;
  quantityUnit?: string;
  targetPrice?: number;
  currency?: string;
  budget?: number;
  purchaseTime?: string;
  decisionProcess?: string;
  nextStepAction?: string;
  nextStepDueDate?: string;
  expectedCloseDate: string;
  forecastCategory?: Opportunity["forecastCategory"];
  winReason?: string;
  lossReason?: string;
  competitors?: string;
  description?: string;
}

export interface UpdateOpportunityInput extends Partial<CreateOpportunityInput> {
  customerId?: number;
  probability?: number;
}

export interface QuoteItemInput {
  productId?: string;
  productName: string;
  productCode?: string;
  variantId?: string;
  sku?: string;
  standard?: string;
  material?: string;
  pressureRating?: string;
  nominalSize?: string;
  facing?: string;
  surfaceTreatment?: string;
  weight?: number;
  weightUnit?: string;
  packaging?: string;
  inspectionRequirements?: string;
  certificateRequirements?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  discount?: number;
}

export interface CreateQuoteInput {
  customerId: number;
  opportunityId?: string | null;
  quoteNo?: string;
  status?: Quote["status"];
  currency?: string;
  baseCurrency?: string;
  exchangeRate?: number;
  freight?: number;
  additionalCharges?: QuoteAdditionalCharge[];
  taxRate?: number;
  validUntil?: string;
  incoterm?: string;
  originPort?: string;
  destinationPort?: string;
  deliveryTime?: string;
  paymentTerms?: string;
  packagingTerms?: string;
  warrantyTerms?: string;
  notes?: string;
  notesEn?: string;
  terms?: string;
  termsEn?: string;
  termTemplateId?: number | null;
  items: QuoteItemInput[];
}

export type UpdateQuoteInput = Partial<CreateQuoteInput>;

export interface CreateSampleInput {
  customerId: number;
  opportunityId?: string | null;
  productId?: string;
  productName: string;
  quantity?: number;
  unit?: string;
  status?: Sample["status"];
  sentAt?: string;
  deliveredAt?: string;
  trackingNo?: string;
  notes?: string;
}

export type UpdateSampleInput = Partial<CreateSampleInput>;

// Email template types
export interface EmailTemplate {
  id: string;
  templateId?: string;
  name: string;
  subject: string;
  body: string;
  images?: Array<{ id: string; dataUrl: string }>;
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
}

// Email task types
export interface EmailTask {
  id: string;
  name: string;
  taskMode: "once" | "scheduled";
  templateId: string;
  templateName?: string;
  customerIds: string[];
  region?: string;
  business?: string;
  successfulSendCount?: number;
  failedSendCount?: number;
  skippedSendCount?: number;
  intervalMinutes?: number;
  totalRuns?: number;
  startAt?: string;
  batchSize?: number;
  smtpProvider?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpFrom?: string;
  smtpSecure?: boolean;
  status: "pending" | "active" | "sending" | "sent" | "completed" | "cancelled" | "failed";
  runsCompleted?: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastMessage?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmailTaskInput {
  name: string;
  taskMode: "once" | "scheduled";
  templateId: string;
  customerIds: string[];
  batchSize?: number;
  region?: string;
  business?: string;
  intervalMinutes?: number;
  totalRuns?: number;
  startAt?: string;
  autoStart?: boolean;
}

export interface SendLog {
  id: string;
  email: string;
  customerId?: string;
  customerName?: string;
  templateId?: string;
  templateName?: string;
  taskId?: string;
  taskName?: string;
  contactId?: string;
  subject?: string;
  status: "sent" | "failed" | "bounced";
  message?: string;
  createdAt: string;
}

// B2B Lead types
export interface B2BAutomationProgress {
  stage: string;
  progress: number;
  message?: string;
  searchedQueries?: number;
  totalQueries?: number;
  leadsFound?: number;
  leadsCleaned?: number;
  leadsValidated?: number;
  duplicateRemoved?: number;
  searchedResults?: number;
  websitesCrawled?: number;
  publicEmailsFound?: number;
  qualifiedCandidates?: number;
  verifiedLeads?: number;
  lastValidatedCandidates?: number;
  stopReason?: "qualified_target_reached" | "queries_exhausted";
  currentQuery?: string;
  lastError?: string;
}

export interface LeadAssociation {
  productName: string;
  canonicalName: string;
  aliases: string[];
  industries: string[];
  companyTypes: string[];
  source?: string;
  warning?: string;
}

export interface B2BLeadTask {
  id: string;
  productName?: string;
  region?: string;
  industry?: string;
  buyerType?: string;
  targetCount?: number;
  status:
    | "draft"
    | "ready"
    | "running"
    | "paused"
    | "completed"
    | "exhausted"
    | "cancelled"
    | "failed";
  cleanedLeadCount?: number;
  automationCursor?: number;
  automationProgress?: B2BAutomationProgress;
  searchQueries?: string[];
  targetRegions?: string[];
  buyerIndustries?: string[];
  rawLeadCount?: number;
  duplicateCount?: number;
  importedCustomerCount?: number;
  lastMessage?: string;
  cancelRequested?: boolean;
  productAliases?: string[];
  buyerCompanyTypes?: string[];
  automationStage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface B2BLead {
  id: string;
  taskId: string;
  company: string;
  website?: string;
  email?: string;
  phone?: string;
  contact?: string;
  contactName?: string;
  industry?: string;
  business?: string;
  region?: string;
  largeRegion?: string;
  country?: string;
  buyerType?: string;
  targetSegment?: string;
  purchaseScore?: number;
  leadScore?: number;
  leadTier?: "high" | "medium" | "review" | "remove";
  emailStatus?: "verified" | "invalid" | "unknown";
  emailConfidence?: number;
  regionStatus?: "confirmed" | "likely" | "unknown";
  source?: string;
  sourceUrl?: string;
  sourceType?: string;
  sourceName?: string;
  sourcePage?: string;
  sourceHttpStatus?: number;
  confidence?: "High" | "Medium" | "Low" | string;
  recommendedAction?: string;
  crmCustomerId?: string;
  cleaningNotes?: string;
  emailSourceDomainMatch?: boolean;
  matchedProductKeyword?: string;
  rawData?: {
    evidence?: string[];
    gaps?: string[];
    fitScore?: number;
    [key: string]: unknown;
  };
  status: string;
  createdAt: string;
}

// Search profile types
export interface SearchProfile {
  id: string;
  name: string;
  provider: "brave-search" | "serper" | "serpapi" | "generic-json";
  apiUrl: string;
  apiKeySet?: boolean;
  apiKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiProfile {
  provider?: "deepseek" | "openai-compatible";
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
  apiKey?: string;
  credentialStatus?: "saved" | "reentry_required" | "not_set";
}

export interface SmtpProfile {
  smtpProvider: "qq" | "163" | "126" | "gmail" | "outlook" | "custom";
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpSecure?: boolean;
  credentialStatus?: "saved" | "reentry_required" | "not_set";
}

export interface ImapProfile {
  imapEnabled?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  pass?: string;
  imapMailbox?: string;
  imapScanLimit?: number;
  imapUseSmtpCredentials?: boolean;
  imapSecure?: boolean;
  credentialStatus?: "saved" | "reentry_required" | "not_set";
  imapLastCheckedAt?: string;
  imapLastCheckStatus?: "ok" | "error";
  imapLastCheckMessage?: string;
  imapLastSeenUid?: number;
}

// Dashboard types
export interface DashboardData {
  customerTotal: number;
  newCustomers7d: number;
  leadTotal: number;
  highConfidenceLeads: number;
  contactableLeads: number;
  sentTotal: number;
  failedTotal: number;
  openTodoCount: number;
  overdueTodoCount: number;
  emailActivity?: {
    days7: { total: number; sent: number; failed: number; rate: number };
    days30: { total: number; sent: number; failed: number; rate: number };
    byTemplate: Array<{
      name: string;
      total: number;
      sent: number;
      rate: number;
    }>;
  };
}

// State types
export interface AppState {
  customers: Customer[];
  customerTotal: number;
  tags: string[];
  templates: EmailTemplate[];
  emailTasks: EmailTask[];
  sendLogs: SendLog[];
  products: Product[];
  quotes: Quote[];
  samples: Sample[];
  crm: {
    openTodos: Todo[];
    opportunities: Opportunity[];
  };
  leadTasks: B2BLeadTask[];
  dashboard?: DashboardData;
  users?: User[];
  settings: {
    searchProfiles?: SearchProfile[];
    aiProfile?: AiProfile;
    smtpProfile?: SmtpProfile;
    imapProfile?: ImapProfile;
    customerViews?: CustomerView[];
    emailPolicy?: EmailPolicy;
    backupSettings?: BackupSettings;
  };
}

// Customer view types
export interface CustomerView {
  id: string;
  name: string;
  filters: Record<string, string>;
  createdAt: string;
}

export interface EmailPolicy {
  maxPerHour: number;
  maxPerDay: number;
  minDelaySeconds: number;
  workdayStart: number;
  workdayEnd: number;
  enforceTimezone: boolean;
  allowWeekends: boolean;
}

export interface EmailRecipient {
  recipientKey: string;
  type: "customer" | "contact";
  email: string;
  name: string;
  contact: string;
  customerId: string;
  customerName: string;
  region: string;
  tier?: string;
  journeyStage?: string;
  business?: string;
  emailStatus: string;
  suppressed: boolean;
  suppressionReason?: string;
}

export interface SuppressionEntry {
  id: string;
  email: string;
  reason: string;
  source: string;
  createdAt: string;
}

export interface BackupSettings {
  enabled: boolean;
  intervalHours: number;
  retentionDays: number;
}

export interface Backup {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  createdBy: string;
  type: "manual" | "auto" | "pre-restore" | "pre-migration-rollback";
}

export interface AuditEntry {
  id: string;
  action: string;
  userId: string;
  username: string;
  details: string;
  ip: string;
  method?: string;
  path?: string;
  status?: "success" | "failed";
  durationMs?: number;
  createdAt: string;
}

// Tag types
export interface CustomerTag {
  name: string;
  count: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  scope: "owned" | "all";
  metrics: DashboardData;
  emailActivity: NonNullable<DashboardData["emailActivity"]>;
  trends: {
    days30: Array<{
      date: string;
      customers: number;
      sent: number;
      failed: number;
      bounced: number;
    }>;
  };
  salesFunnel: {
    stages: Array<{
      stage: string;
      count: number;
      value: number;
      weightedValue: number;
    }>;
    openValue: number;
    weightedValue: number;
    wonValue: number;
    winRate: number;
  };
  emailPerformance: {
    total: number;
    sent: number;
    failed: number;
    bounced: number;
    deliveryRate: number;
    bounceRate: number;
  };
  activeTasks: {
    leads: Array<{
      id: string;
      name: string;
      status: string;
      current: number;
      target: number;
    }>;
    emails: Array<{
      id: string;
      name: string;
      status: string;
      current: number;
      target: number;
    }>;
  };
  openTodos: Array<{
    id: string;
    title: string;
    customerName: string;
    dueAt?: string;
  }>;
  recentSendLogs: Array<{
    id: string;
    email: string;
    status: string;
    templateName?: string;
    message?: string;
    createdAt: string;
  }>;
}
