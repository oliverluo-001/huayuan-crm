import { Controller, Get } from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { EmailService } from '../email/email.service';
import { ProductsService } from '../products/products.service';
import { LeadsService } from '../leads/leads.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../auth/users.service';
import { BackupService } from '../backup/backup.service';
import { SuppressionService } from '../suppression/suppression.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService, DashboardUser } from './dashboard.service';

@Controller('state')
export class StateController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly emailService: EmailService,
    private readonly productsService: ProductsService,
    private readonly leadsService: LeadsService,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
    private readonly backupService: BackupService,
    private readonly suppressionService: SuppressionService,
    private readonly auditService: AuditService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: DashboardUser) {
    return this.dashboardService.getDashboard(user);
  }

  @Get()
  async getState(@CurrentUser() user: DashboardUser) {
    const isAdmin = user.role === 'admin';
    const [
      customerResult,
      tags,
      templates,
      tasks,
      sendLogs,
      products,
      quotes,
      samples,
      crmTodos,
      crmOpportunities,
      leadTasks,
      searchProfiles,
      aiProfile,
      smtpProfile,
      imapProfile,
      users,
      backups,
      suppressions,
      auditLogs,
      emailPolicy,
      trashItems,
    ] = await Promise.all([
      this.customersService.findAll(user.role === 'sales' ? { ownerId: String(user.sub) } : {}),
      this.customersService.getAllTags(),
      this.emailService.findAllTemplates(),
      this.emailService.findAllTasks({}),
      this.emailService.findAllLogs({}),
      this.productsService.findAll({}),
      this.customersService.findQuotes({}),
      this.customersService.findSamples({}),
      this.customersService.findTodos({ status: 'open' }),
      this.customersService.findOpportunities({}),
      this.leadsService.findTasks({}),
      this.settingsService.getSearchProfiles(),
      this.settingsService.getAiProfile(),
      this.settingsService.getSmtpProfile(),
      this.settingsService.getImapProfile(),
      this.usersService.findAll(),
      this.backupService.findAll(),
      this.suppressionService.findAll(),
      this.auditService.findAll({ limit: 50 }),
      this.settingsService.getEmailPolicy(),
      this.customersService.findTrash(),
    ]);

    const customers = (customerResult as any).customers || customerResult;
    const customerTotal = (customerResult as any).total || (Array.isArray(customers) ? customers.length : 0);
    const scopedCustomerIds = new Set((Array.isArray(customers) ? customers : []).map((customer: any) => String(customer.customerId || customer.id)));
    const scopedSendLogs = user.role === 'sales'
      ? sendLogs.filter((log: any) => scopedCustomerIds.has(String(log.customerId)))
      : sendLogs;
    const scopedTasks = user.role === 'sales'
      ? tasks.filter((task: any) => {
          const ids = Array.isArray(task.customerIds) ? task.customerIds : String(task.customerIds || task.customerId || '').split(',');
          return ids.some((id: any) => scopedCustomerIds.has(String(id).trim()));
        })
      : tasks;

    // Format entities to frontend types
    const formattedCustomers = (Array.isArray(customers) ? customers : []).map((c: any) => ({
      ...c,
      id: c.customerId || String(c.id),
      customerName: c.company,
    }));

    const formattedOpportunities = crmOpportunities.map((o: any) => ({
      id: o.opportunityId || String(o.id),
      customerId: String(o.customerId),
      customerName: o.customerName || '',
      title: o.name || o.title,
      stage: o.stage,
      value: o.amount ? Number(o.amount) : o.value,
      currency: o.currency || 'USD',
      probability: o.probability,
      expectedCloseDate: o.expectedCloseDate,
      notes: o.description || o.notes,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));

    const formattedTodos = crmTodos.map((t: any) => ({
      ...t,
      id: t.todoId || String(t.id),
      customerId: String(t.customerId),
    }));

    const formattedProducts = products.map((p: any) => ({
      id: p.productId || String(p.id),
      name: p.name,
      code: p.code || p.productCode,
      category: p.category,
      unit: p.unit,
      referencePrice: p.referencePrice || p.price,
      currency: p.currency,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    const formattedQuotes = quotes.map((q: any) => ({
      id: q.quoteId || String(q.id),
      quoteNo: q.quoteNo,
      customerId: String(q.customerId),
      customerName: q.customerName || '',
      status: q.status,
      total: q.total || q.amount,
      currency: q.currency,
      validUntil: q.validUntil,
      notes: q.notes,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }));

    const formattedSamples = samples.map((s: any) => ({
      id: s.sampleId || String(s.id),
      customerId: String(s.customerId),
      customerName: s.customerName || '',
      productName: s.productName,
      quantity: s.quantity,
      unit: s.unit,
      status: s.status,
      trackingNo: s.trackingNo,
      notes: s.notes,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    const formattedTemplates = templates.map((t: any) => ({
      id: t.templateId || String(t.id),
      name: t.name,
      subject: t.subject,
      body: t.body,
      images: t.images || [],
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    // Compute dashboard data
    const sentLogs = scopedSendLogs.filter((l: any) => l.status === 'sent');
    const failedLogs = scopedSendLogs.filter((l: any) => l.status === 'failed');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newCustomers7d = (Array.isArray(customers) ? customers : []).filter(
      (c: any) => new Date(c.createdAt) >= sevenDaysAgo,
    ).length;

    const allLeads = leadTasks.reduce((sum: number, t: any) => sum + (t.rawLeadCount || t.leadCount || 0), 0);
    const highConfidenceLeads = leadTasks.reduce((sum: number, t: any) => sum + (t.cleanedLeadCount || 0), 0);

    // Email activity stats
    const logs7d = scopedSendLogs.filter((l: any) => new Date(l.createdAt || l.sentAt) >= sevenDaysAgo);
    const logs30d = scopedSendLogs.filter((l: any) => new Date(l.createdAt || l.sentAt) >= thirtyDaysAgo);
    const sent7d = logs7d.filter((l: any) => l.status === 'sent').length;
    const failed7d = logs7d.filter((l: any) => l.status === 'failed' || l.status === 'bounced').length;
    const sent30d = logs30d.filter((l: any) => l.status === 'sent').length;
    const failed30d = logs30d.filter((l: any) => l.status === 'failed' || l.status === 'bounced').length;

    // Template performance
    const templateMap = new Map<string, { name: string; total: number; sent: number }>();
    for (const log of scopedSendLogs) {
      const tplName = (log as any).templateName || '未知模板';
      if (!templateMap.has(tplName)) templateMap.set(tplName, { name: tplName, total: 0, sent: 0 });
      const entry = templateMap.get(tplName)!;
      entry.total++;
      if (log.status === 'sent') entry.sent++;
    }
    const byTemplate = [...templateMap.values()]
      .map((t) => ({ ...t, rate: t.total > 0 ? Math.round((t.sent / t.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return {
      customers: formattedCustomers,
      customerTotal,
      tags,
      templates: formattedTemplates,
      emailTasks: scopedTasks,
      sendLogs: scopedSendLogs,
      products: formattedProducts,
      quotes: formattedQuotes,
      samples: formattedSamples,
      crm: {
        openTodos: formattedTodos,
        opportunities: formattedOpportunities,
      },
      leadTasks,
      dashboard: {
        customerTotal,
        newCustomers7d,
        leadTotal: allLeads,
        highConfidenceLeads,
        contactableLeads: highConfidenceLeads,
        sentTotal: sentLogs.length,
        failedTotal: failedLogs.length,
        openTodoCount: formattedTodos.length,
        overdueTodoCount: formattedTodos.filter(
          (t: any) => t.dueAt && new Date(t.dueAt) < new Date(),
        ).length,
        emailActivity: {
          days7: { total: logs7d.length, sent: sent7d, failed: failed7d, rate: logs7d.length > 0 ? Math.round((sent7d / logs7d.length) * 100) : 0 },
          days30: { total: logs30d.length, sent: sent30d, failed: failed30d, rate: logs30d.length > 0 ? Math.round((sent30d / logs30d.length) * 100) : 0 },
          byTemplate,
        },
      },
      users: isAdmin ? users : [],
      backups: isAdmin ? backups : [],
      suppressions: isAdmin ? suppressions : [],
      auditLogs: isAdmin ? auditLogs.items : [],
      trashItems: isAdmin ? trashItems : [],
      settings: {
        searchProfiles: isAdmin ? searchProfiles : [],
        aiProfile: isAdmin ? aiProfile : undefined,
        smtpProfile: isAdmin ? smtpProfile : undefined,
        imapProfile: isAdmin ? imapProfile : undefined,
        emailPolicy,
      },
      username: user.username || '',
      displayName: user.displayName || '',
    };
  }
}
