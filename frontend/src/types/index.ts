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
  timezone?: string;
  tags?: string[];
  tier: "A" | "B" | "C" | "D" | "";
  journeyStage: "new" | "contacted" | "replied" | "qualified" | "opportunity" | "won" | "lost" | "prospect" | "lead" | "proposal" | "negotiation" | "closed" | "";
  customerType?: string;
  product?: string;
  source?: string;
  ownerId?: string;
  ownerName?: string;
  notes?: string;
  emailStatus?: "valid" | "invalid" | "unknown";
  emailFailureReason?: string;
  emailFailedAt?: string;
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

export interface Contact {
  id: string;
  customerId: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  createdAt: string;
}

export interface Activity {
  id: string;
  customerId: string;
  type: "email" | "call" | "meeting" | "note" | "other";
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
  stage: "prospecting" | "qualification" | "proposal" | "negotiation" | "won" | "lost";
  amount?: number;
  probability?: number;
  expectedCloseDate?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Product types
export interface Product {
  id: string;
  productId?: string;
  code?: string;
  name: string;
  category?: string;
  unit?: string;
  price?: number;
  currency?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Quote types (mirrors the backend Quote + QuoteItem entities)
export interface QuoteItem {
  id?: string;
  productId?: string;
  productName: string;
  productCode?: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discount: number;
  subtotal: number;
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
  freight: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  validUntil?: string;
  notes?: string;
  terms?: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  createdAt: string;
  updatedAt: string;
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
  expectedCloseDate?: string;
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
  freight?: number;
  taxRate?: number;
  validUntil?: string;
  notes?: string;
  terms?: string;
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
  name: string;
  subject: string;
  body: string;
  images?: Array<{ id: string; dataUrl: string }>;
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
  status: "pending" | "active" | "completed" | "cancelled" | "failed";
  runsCompleted?: number;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
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
  status: "draft" | "ready" | "running" | "paused" | "completed" | "exhausted" | "cancelled" | "failed";
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
  imapMailbox?: string;
  imapScanLimit?: number;
  imapUseSmtpCredentials?: boolean;
  imapSecure?: boolean;
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
    byTemplate: Array<{ name: string; total: number; sent: number; rate: number }>;
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
  emailStatus: string;
  suppressed: boolean;
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
    days30: Array<{ date: string; customers: number; sent: number; failed: number; bounced: number }>;
  };
  salesFunnel: {
    stages: Array<{ stage: string; count: number; value: number; weightedValue: number }>;
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
    leads: Array<{ id: string; name: string; status: string; current: number; target: number }>;
    emails: Array<{ id: string; name: string; status: string; current: number; target: number }>;
  };
  openTodos: Array<{ id: string; title: string; customerName: string; dueAt?: string }>;
  recentSendLogs: Array<{ id: string; email: string; status: string; templateName?: string; message?: string; createdAt: string }>;
}
