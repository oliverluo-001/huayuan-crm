import type {
  AuthStatus,
  LoginResult,
  RegisterResult,
  Customer,
  CustomerListResult,
  Customer360,
  Contact,
  Activity,
  Todo,
  Opportunity,
  Product,
  Quote,
  CreateQuoteInput,
  UpdateQuoteInput,
  Sample,
  CreateSampleInput,
  UpdateSampleInput,
  EmailTemplate,
  EmailTask,
  SendLog,
  B2BLeadTask,
  B2BLead,
  B2BAutomationProgress,
  LeadAssociation,
  SearchProfile,
  AiProfile,
  SmtpProfile,
  ImapProfile,
  CustomerView,
  DashboardData,
  DashboardSnapshot,
  User,
  EmailPolicy,
  EmailRecipient,
  SuppressionEntry,
  BackupSettings,
  Backup,
  AuditEntry,
} from "@/types";

export type {
  AuthStatus,
  LoginResult,
  RegisterResult,
  Customer,
  CustomerListResult,
  Customer360,
  Contact,
  Activity,
  Todo,
  Opportunity,
  Product,
  Quote,
  CreateQuoteInput,
  UpdateQuoteInput,
  Sample,
  CreateSampleInput,
  UpdateSampleInput,
  EmailTemplate,
  EmailTask,
  EmailRecipient,
  SendLog,
  B2BLeadTask,
  B2BLead,
  B2BAutomationProgress,
  LeadAssociation,
  SearchProfile,
  AiProfile,
  SmtpProfile,
  ImapProfile,
  CustomerView,
  DashboardData,
  DashboardSnapshot,
  User,
  EmailPolicy,
  SuppressionEntry,
  BackupSettings,
  Backup,
  AuditEntry,
};

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  silent?: boolean;
  rawBody?: BodyInit;
}

let toastCallback: ((message: string) => void) | null = null;
let unauthorizedCallback: (() => void) | null = null;
let setupCallback: (() => void) | null = null;

export function setToastCallback(callback: (message: string) => void) {
  toastCallback = callback;
}

export function setUnauthorizedCallback(callback: () => void) {
  unauthorizedCallback = callback;
}

export function setSetupCallback(callback: () => void) {
  setupCallback = callback;
}

function toast(message: string) {
  if (toastCallback) {
    toastCallback(message);
  }
}

async function api<T = unknown>(url: string, options: ApiOptions = {}): Promise<T> {
  const fetchOptions: RequestInit = { method: options.method || "GET" };

  if (options.rawBody) {
    fetchOptions.body = options.rawBody;
  } else if (options.body !== undefined) {
    fetchOptions.headers = { "Content-Type": "application/json" };
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, { ...fetchOptions, credentials: "include" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && unauthorizedCallback) {
      unauthorizedCallback();
    }
    if (response.status === 428 && setupCallback) {
      setupCallback();
    }
    // Handle wrapped error responses: { statusCode, message, data }
    const errorMsg = data?.data?.error || data?.message || data?.error || "请求失败";
    if (!options.silent) {
      toast(errorMsg);
    }
    throw new Error(errorMsg);
  }

  // Unwrap TransformInterceptor wrapper: { statusCode, message, data, timestamp }
  if (data && typeof data === "object" && "statusCode" in data && "data" in data && "message" in data) {
    return data.data as T;
  }

  return data as T;
}

// Auth API
export async function getAuthStatus(): Promise<AuthStatus> {
  const result = await api<Partial<AuthStatus>>("/api/auth/status", { silent: true });
  return {
    initialized: result.initialized ?? false,
    authenticated: result.authenticated ?? false,
    username: result.username ?? "",
    displayName: result.displayName ?? "",
    userId: result.userId ?? "",
    role: result.role ?? "",
    registrationMode: result.registrationMode ?? "approval",
    registrationEnabled: result.registrationEnabled ?? false,
    registrationRequiresApproval: result.registrationRequiresApproval ?? true,
  };
}

export async function setup(username: string, password: string): Promise<LoginResult> {
  const result = await api<LoginResult & { user?: Partial<LoginResult> }>("/api/auth/setup", {
    method: "POST",
    body: { username, password },
  });
  return {
    ok: result.ok ?? true,
    username: result.username ?? result.user?.username ?? "",
    displayName: result.displayName ?? result.user?.displayName ?? "",
    userId: result.userId ?? result.user?.userId ?? "",
    role: result.role ?? result.user?.role ?? "",
  };
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const result = await api<LoginResult & { user?: Partial<LoginResult> }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
  return {
    ok: result.ok ?? true,
    username: result.username ?? result.user?.username ?? "",
    displayName: result.displayName ?? result.user?.displayName ?? "",
    userId: result.userId ?? result.user?.userId ?? "",
    role: result.role ?? result.user?.role ?? "",
  };
}

export async function register(username: string, password: string, displayName: string, email: string): Promise<RegisterResult> {
  const result = await api<RegisterResult & { user?: Partial<LoginResult> }>("/api/auth/register", {
    method: "POST",
    body: { username, password, displayName, email },
  });
  return {
    ok: result.ok ?? true,
    username: result.username ?? result.user?.username ?? "",
    displayName: result.displayName ?? result.user?.displayName ?? displayName,
    userId: result.userId ?? result.user?.userId ?? "",
    role: result.role ?? result.user?.role ?? "sales",
    requiresApproval: result.requiresApproval ?? true,
    message: result.message,
  };
}

export async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api("/api/auth/change-password", {
    method: "POST",
    body: { oldPassword: currentPassword, newPassword },
  });
}

export async function getDashboard(): Promise<DashboardSnapshot> {
  return api<DashboardSnapshot>("/api/state/dashboard");
}

// Customers API
export async function getCustomers(
  offset: number,
  limit: number,
  filters: Record<string, string>
): Promise<CustomerListResult> {
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    ...filters,
  }).toString();
  return api<CustomerListResult>(`/api/customers?${query}`);
}

export async function getCustomer360(id: string): Promise<Customer360> {
  return api<Customer360>(`/api/customers/${encodeURIComponent(id)}/360`);
}

export async function createCustomer(data: Partial<Customer>): Promise<Customer> {
  return api<Customer>("/api/customers", { method: "POST", body: data });
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
  return api<Customer>(`/api/customers/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function deleteCustomer(id: string): Promise<void> {
  await api(`/api/customers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function bulkDeleteCustomers(ids: string[]): Promise<void> {
  await api("/api/customers/bulk-delete", { method: "POST", body: { ids } });
}

export async function bulkUpdateCustomerTags(ids: string[], tag: string, action: "add" | "remove"): Promise<void> {
  await api("/api/customers/bulk-tags", { method: "POST", body: { ids, tag, action } });
}

export async function bulkUpdateCustomerTier(ids: string[], tier: string): Promise<void> {
  await api("/api/customers/bulk-tier", { method: "POST", body: { ids, tier } });
}

// Customer Tags API
export async function getCustomerTags(): Promise<string[]> {
  return api<string[]>("/api/customers/tags");
}

export async function createCustomerTag(name: string): Promise<void> {
  await api("/api/customer-tags", { method: "POST", body: { name } });
}

export async function deleteCustomerTag(name: string): Promise<void> {
  await api(`/api/customer-tags/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// Customer Views API
export async function getCustomerViews(): Promise<CustomerView[]> {
  const result = await api<{ views: CustomerView[] }>("/api/customer-views");
  return result.views || [];
}

export async function createCustomerView(name: string, filters: Record<string, string>): Promise<CustomerView> {
  return api<CustomerView>("/api/customer-views", { method: "POST", body: { name, filters, columns: [] } });
}

export async function deleteCustomerView(id: string): Promise<void> {
  await api(`/api/customer-views/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Contacts API
export async function getCustomerContacts(customerId: string): Promise<Contact[]> {
  const result = await api<{ contacts: Contact[] } | Contact[]>(`/api/customers/${encodeURIComponent(customerId)}/contacts`);
  return Array.isArray(result) ? result : result.contacts || [];
}

export async function createCustomerContact(customerId: string, data: Partial<Contact>): Promise<Contact> {
  return api<Contact>(`/api/customers/${encodeURIComponent(customerId)}/contacts`, { method: "POST", body: data });
}

export async function updateContact(id: string, data: Partial<Contact>): Promise<Contact> {
  return api<Contact>(`/api/contacts/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function deleteContact(id: string): Promise<void> {
  await api(`/api/contacts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Activities API
export async function getCustomerActivities(customerId: string): Promise<Activity[]> {
  const result = await api<{ activities: Activity[] } | Activity[]>(`/api/customers/${encodeURIComponent(customerId)}/activities`);
  return Array.isArray(result) ? result : result.activities || [];
}

export async function createCustomerActivity(customerId: string, data: Partial<Activity>): Promise<Activity> {
  return api<Activity>(`/api/customers/${encodeURIComponent(customerId)}/activities`, { method: "POST", body: data });
}

// Todos API
export async function getCustomerTodos(customerId: string): Promise<Todo[]> {
  const result = await api<{ todos: Todo[] } | Todo[]>(`/api/customers/${encodeURIComponent(customerId)}/todos`);
  return Array.isArray(result) ? result : result.todos || [];
}

export async function createCustomerTodo(customerId: string, data: Partial<Todo>): Promise<Todo> {
  return api<Todo>(`/api/customers/${encodeURIComponent(customerId)}/todos`, { method: "POST", body: data });
}

export async function updateTodo(id: string, data: Partial<Todo>): Promise<Todo> {
  return api<Todo>(`/api/todos/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function deleteTodo(id: string): Promise<void> {
  await api(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Opportunities API
export async function getOpportunities(): Promise<Opportunity[]> {
  const result = await api<{ opportunities: Opportunity[] }>("/api/opportunities");
  return result.opportunities || [];
}

export async function createCustomerOpportunity(customerId: string, data: Partial<Opportunity>): Promise<Opportunity> {
  return api<Opportunity>(`/api/customers/${encodeURIComponent(customerId)}/opportunities`, { method: "POST", body: data });
}

export async function updateOpportunity(id: string, data: Partial<Opportunity>): Promise<Opportunity> {
  return api<Opportunity>(`/api/opportunities/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function deleteOpportunity(id: string): Promise<void> {
  await api(`/api/opportunities/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Products API
export async function getProducts(): Promise<Product[]> {
  const result = await api<{ products: Product[] }>("/api/products");
  return result.products || [];
}

export async function createProduct(data: Partial<Product>): Promise<Product> {
  return api<Product>("/api/products", { method: "POST", body: data });
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  return api<Product>(`/api/products/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function deleteProduct(id: string): Promise<void> {
  await api(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Quotes API
export async function getQuotes(): Promise<Quote[]> {
  const result = await api<{ quotes: Quote[] }>("/api/quotes");
  return result.quotes || [];
}

export async function createQuote(data: CreateQuoteInput): Promise<Quote> {
  return api<Quote>("/api/quotes", { method: "POST", body: data });
}

export async function updateQuote(id: string, data: UpdateQuoteInput): Promise<Quote> {
  return api<Quote>(`/api/quotes/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function deleteQuote(id: string): Promise<void> {
  await api(`/api/quotes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Samples API
export async function getSamples(): Promise<Sample[]> {
  const result = await api<{ samples: Sample[] }>("/api/samples");
  return result.samples || [];
}

export async function createSample(data: CreateSampleInput): Promise<Sample> {
  return api<Sample>("/api/samples", { method: "POST", body: data });
}

export async function updateSample(id: string, data: UpdateSampleInput): Promise<Sample> {
  return api<Sample>(`/api/samples/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function deleteSample(id: string): Promise<void> {
  await api(`/api/samples/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Email Templates API
export async function getTemplates(): Promise<EmailTemplate[]> {
  const result = await api<{ templates: EmailTemplate[] }>("/api/templates");
  return result.templates || [];
}

export async function createTemplate(data: Partial<EmailTemplate>): Promise<EmailTemplate> {
  return api<EmailTemplate>("/api/templates", { method: "POST", body: data });
}

export async function updateTemplate(id: string, data: Partial<EmailTemplate>): Promise<EmailTemplate> {
  return api<EmailTemplate>(`/api/templates/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function deleteTemplate(id: string): Promise<void> {
  await api(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Email Tasks API
export async function getEmailTasks(): Promise<EmailTask[]> {
  const result = await api<{ tasks: EmailTask[] }>("/api/email-tasks");
  return result.tasks || [];
}

export async function createEmailTask(data: Partial<EmailTask>): Promise<EmailTask> {
  return api<EmailTask>("/api/email-tasks", { method: "POST", body: data });
}

export async function runEmailTask(id: string): Promise<void> {
  await api(`/api/email-tasks/${encodeURIComponent(id)}/run`, { method: "POST" });
}

export async function cancelEmailTask(id: string): Promise<void> {
  await api(`/api/email-tasks/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export async function deleteEmailTask(id: string): Promise<void> {
  await api(`/api/email-tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getEmailRecipients(params?: Record<string, string>): Promise<{
  recipients: EmailRecipient[];
  total: number;
  offset: number;
  limit: number;
}> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return api(`/api/email-recipients${qs}`);
}

export async function getEmailRecipientIds(params?: Record<string, string>): Promise<{
  ids: string[];
}> {
  const qs = params ? '?' + new URLSearchParams({ ...params, ids: 'true' }).toString() : '?ids=true';
  return api(`/api/email-recipients${qs}`);
}

// Send Logs API
export async function getSendLogs(): Promise<SendLog[]> {
  return api<SendLog[]>("/api/email-logs");
}

export async function deleteSendLog(id: string): Promise<void> {
  await api(`/api/send-logs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// B2B Lead Tasks API
export async function getB2BLeadTasks(): Promise<B2BLeadTask[]> {
  const result = await api<{ tasks: B2BLeadTask[] }>("/api/lead-tasks");
  return result.tasks || [];
}

export async function createB2BLeadTask(data: Partial<B2BLeadTask>): Promise<{ task: B2BLeadTask; queries?: string[] }> {
  return api("/api/lead-tasks", { method: "POST", body: data });
}

export async function getB2BLeads(taskId: string, filters?: Record<string, string>): Promise<{ leads: B2BLead[]; summary: Record<string, unknown> }> {
  const query = filters ? `?${new URLSearchParams(filters).toString()}` : "";
  return api(`/api/lead-tasks/${encodeURIComponent(taskId)}/leads${query}`);
}

export async function runB2BLeadTask(id: string): Promise<void> {
  await api(`/api/lead-tasks/${encodeURIComponent(id)}/run`, { method: "POST" });
}

export async function cancelB2BLeadTask(id: string): Promise<void> {
  await api(`/api/lead-tasks/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export async function deleteB2BLeadTask(id: string): Promise<void> {
  await api(`/api/lead-tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function importB2BLeads(taskId: string, leads: Partial<B2BLead>[]): Promise<{ imported: number }> {
  return api(`/api/lead-tasks/${encodeURIComponent(taskId)}/import-leads`, { method: "POST", body: { leads } });
}

export async function cleanB2BLeads(taskId: string): Promise<{ summary: Record<string, unknown> }> {
  return api(`/api/lead-tasks/${encodeURIComponent(taskId)}/clean`, { method: "POST" });
}

export async function getLeadAssociation(productName: string): Promise<LeadAssociation> {
  const result = await api<LeadAssociation | { association: LeadAssociation }>("/api/lead-associations", {
    method: "POST",
    body: { productName },
  });
  return "association" in result ? result.association : result;
}

export async function saveLeadQueries(taskId: string, regenerate?: boolean, queries?: string[]): Promise<{ task: B2BLeadTask }> {
  return api(`/api/lead-tasks/${encodeURIComponent(taskId)}/generate-queries`, {
    method: "POST",
    body: { regenerate, queries },
  });
}

export async function importB2BLeadsToCustomers(
  taskId: string,
  data: { ids?: string[]; importAll?: boolean }
): Promise<{ imported: number; merged: number; skipped?: number }> {
  return api(`/api/lead-tasks/${encodeURIComponent(taskId)}/import-customers`, {
    method: "POST",
    body: data,
  });
}

// Search Profiles API
export async function getSearchProfiles(): Promise<SearchProfile[]> {
  return api<SearchProfile[]>("/api/settings/search-profiles");
}

export async function createSearchProfile(data: Partial<SearchProfile>): Promise<SearchProfile> {
  return api<SearchProfile>("/api/settings/search-profiles", { method: "POST", body: data });
}

export async function testSearchProfile(id: string): Promise<{ ok: boolean; message?: string }> {
  return api(`/api/settings/search-profiles/${encodeURIComponent(id)}/test`, { method: "POST" });
}

export async function deleteSearchProfile(id: string): Promise<void> {
  await api(`/api/settings/search-profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// AI Profile API
export async function getAiProfile(): Promise<AiProfile> {
  return api<AiProfile>("/api/settings/ai-profile");
}

export async function saveAiProfile(data: Partial<AiProfile>): Promise<void> {
  await api("/api/settings/ai-profile", { method: "POST", body: data });
}

export async function testAiProfile(): Promise<{ ok: boolean; message?: string }> {
  return api("/api/settings/ai-profile/test", { method: "POST" });
}

// SMTP Profile API
export async function getSmtpProfile(): Promise<SmtpProfile> {
  return api<SmtpProfile>("/api/settings/smtp-profile");
}

export async function saveSmtpProfile(data: Partial<SmtpProfile>): Promise<void> {
  await api("/api/settings/smtp-profile", { method: "POST", body: data });
}

// IMAP Profile API
export async function getImapProfile(): Promise<ImapProfile> {
  return api<ImapProfile>("/api/settings/imap-profile");
}

export async function saveImapProfile(data: Partial<ImapProfile>): Promise<void> {
  await api("/api/settings/imap-profile", { method: "POST", body: data });
}

export async function checkMailboxBounces(): Promise<void> {
  await api("/api/email-bounces/check", { method: "POST" });
}

// Import API
export async function importCustomers(file: File): Promise<{ total: number; created: number; updated: number; skipped: number }> {
  const formData = new FormData();
  formData.append("file", file);
  return api("/api/import", { method: "POST", rawBody: formData });
}

export async function previewImport(file: File): Promise<{ total: number; withEmail: number; duplicateCount: number; duplicateUploadCount: number }> {
  const formData = new FormData();
  formData.append("file", file);
  return api("/api/import/preview", { method: "POST", rawBody: formData });
}

// Users API
export async function getUsers(): Promise<User[]> {
  const result = await api<User[] | { users: User[] }>("/api/users");
  return Array.isArray(result) ? result : result.users || [];
}

export async function createUser(data: { username: string; displayName: string; email?: string; role: string; password: string }): Promise<User> {
  return api<User>("/api/users", { method: "POST", body: data });
}

export async function updateUser(id: string, data: Partial<User>): Promise<User> {
  return api<User>(`/api/users/${encodeURIComponent(id)}`, { method: "PUT", body: data });
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  await api(`/api/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: { newPassword: password } });
}

export async function approveUser(id: string): Promise<User> {
  return api<User>(`/api/users/${encodeURIComponent(id)}/approve`, { method: "POST" });
}

export async function rejectUser(id: string): Promise<User> {
  return api<User>(`/api/users/${encodeURIComponent(id)}/reject`, { method: "POST" });
}

// Backup API
export async function getBackupData(): Promise<{ settings: BackupSettings; backups: Backup[] }> {
  const settings = await api<BackupSettings>("/api/backup/settings");
  const backups = await api<Backup[]>("/api/backup/list");
  return { settings, backups };
}

export async function createBackup(): Promise<Backup> {
  return api<Backup>("/api/backup/create", { method: "POST" });
}

export async function saveBackupSettings(settings: Partial<BackupSettings>): Promise<BackupSettings> {
  return api<BackupSettings>("/api/backup/settings", { method: "POST", body: settings });
}

export async function verifyBackup(id: string): Promise<{ valid: boolean; tableCount: number; rowCount: number }> {
  return api(`/api/backup/${encodeURIComponent(id)}/verify`, { method: "POST" });
}

export async function drillBackup(id: string): Promise<{ valid: boolean; restorable: boolean; tableCount: number; rowCount: number; restoredRows: number }> {
  return api(`/api/backup/${encodeURIComponent(id)}/drill`, { method: "POST" });
}

export async function restoreBackup(id: string): Promise<{ restored: boolean; backupId: string; rollbackBackupId: string; tableCount: number; rowCount: number }> {
  return api(`/api/backup/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    body: { confirmation: "RESTORE" },
  });
}

// Email Policy API
export async function getEmailPolicy(): Promise<EmailPolicy> {
  return api("/api/settings/email-policy");
}

export async function saveEmailPolicy(policy: Partial<EmailPolicy>): Promise<EmailPolicy> {
  return api<EmailPolicy>("/api/settings/email-policy", { method: "POST", body: policy });
}

// Suppression API
export async function getSuppressions(): Promise<SuppressionEntry[]> {
  return api<SuppressionEntry[]>("/api/suppressions");
}

export async function addSuppression(data: { email: string; reason: string }): Promise<void> {
  await api("/api/suppressions", { method: "POST", body: data });
}

export async function deleteSuppression(id: string): Promise<void> {
  await api(`/api/suppressions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Audit API
export async function getAuditLogs(filters: { page?: number; limit?: number; username?: string; action?: string; status?: string } = {}): Promise<{ items: AuditEntry[]; total: number; page: number; pages: number }> {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])).toString();
  return api(`/api/audit-logs${query ? `?${query}` : ""}`);
}

// Trash API
export async function getTrashItems(): Promise<{ id: string; type: string; name: string; deletedAt: string }[]> {
  return api<any[]>("/api/trash");
}

export async function restoreTrashItem(id: string): Promise<void> {
  await api(`/api/trash/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

export async function deleteTrashItem(id: string): Promise<void> {
  await api(`/api/trash/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getAccount(): Promise<User> {
  return api<User>("/api/auth/account");
}

export async function updateAccount(data: { displayName: string; email: string }): Promise<User> {
  return api<User>("/api/auth/account", { method: "PUT", body: data });
}
