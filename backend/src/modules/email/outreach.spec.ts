import { OutreachService } from './outreach.service';
import { EmailLog, EmailTask, EmailTaskRecipient } from './entities';
import { OutreachReservation } from './entities/outreach-reservation.entity';
import { assertOutreachMessage } from './outreach-types';
import { generateOutreachMessage } from './outreach-messages';
import { isPublicResearchAddress, publicResearchUrl, websiteText } from './outreach-research';
import { EmailService } from './email.service';

const sender = { name: 'Zachary Kael', company: 'Huayuan Flange', email: 'zachary.kael@huayuanflange.com', whatsapp: '+86 152-1503-1006', website: 'huayuanflange.com' };
const draft = () => ({ recipientKey: 'customer:c1', customerId: 1, contactId: null, company: 'Buyer', email: 'sales@buyer.ae', name: 'Buyer', timezone: 'Asia/Dubai', subject: 'Your piping enquiries', body: 'Hello Buyer,\n\nDo you source flanges?', eligible: true, selected: true });

describe('customer analysis evidence and website boundaries', () => {
  it('keeps unverified CRM assumptions conditional and uses only retrieved text for noticed claims', () => {
    const unverified = generateOutreachMessage('Buyer', 'pipe fittings', '', sender, 'Carbon steel flanges.');
    expect(unverified.body).toContain('If your team');
    expect(unverified.body).not.toContain('I noticed');
    const verified = generateOutreachMessage('Buyer', '', 'We supply pipe fittings and flanges.', sender, 'Carbon steel flanges.');
    expect(verified.body).toContain('I noticed your website mentions piping products');
    expect(verified.body).not.toMatch(/certified|lowest price|7-15/);
  });
  it('rejects private destinations, mapped IPv6, local URLs and embedded credentials', () => {
    for (const ip of ['127.0.0.1', '10.0.0.2', '169.254.169.254', '192.168.1.2', '::1', '::ffff:127.0.0.1', 'fc00::1', '64:ff9b::a00:1']) expect(isPublicResearchAddress(ip)).toBe(false);
    expect(isPublicResearchAddress('8.8.8.8')).toBe(true);
    for (const url of ['http://localhost', 'http://127.0.0.1', 'https://[::1]', 'https://user:pass@example.com', 'https://example.com:8080', 'file:///etc/passwd']) expect(() => publicResearchUrl(url)).toThrow();
    expect(websiteText('<script>buy now</script><p>Pipe fittings</p>')).toBe('Pipe fittings');
  });
  it('rejects unfinished variables, HTML and subject header injection', () => {
    expect(assertOutreachMessage('Hello', 'Hello Zachary')).toBe(true);
    for (const body of ['{{company}}', '[Your Name]', '<img src=x>']) expect(assertOutreachMessage('Hello', body)).toBe(false);
    expect(assertOutreachMessage('Hello\r\nBcc: hidden@example.com', 'Hi')).toBe(false);
  });
});

function harness() {
  const task: any = { id: 3, emailTaskId: 'owf_abc', ownerId: '7', status: 'pending', outreachData: { version: 1, revision: 0, targetCountry: 'UAE', sender, drafts: [draft()] } };
  const reservations: any[] = []; const recipients: any[] = [];
  const customer: any = { id: 1, customerId: 'c1', company: 'Buyer', email: 'sales@buyer.ae', country: 'UAE', timezone: 'Asia/Dubai', journeyStage: 'new', emailSentCount: 0, emailStatus: 'valid' };
  const qb: any = {}; for (const method of ['innerJoin', 'where', 'andWhere']) qb[method] = jest.fn(() => qb); qb.getOne = jest.fn(async () => null);
  const repos = new Map<any, any>([
    [EmailTask, { findOne: jest.fn(async () => task) }],
    [EmailLog, { findOne: jest.fn(async () => null) }],
    [OutreachReservation, { findOne: jest.fn(async () => null) }],
    [EmailTaskRecipient, { createQueryBuilder: () => qb }],
  ]);
  const manager: any = { getRepository: (entity: any) => repos.get(entity), create: (_entity: any, value: any) => value,
    save: jest.fn(async (entity: any, value: any) => { if (entity === EmailTaskRecipient) recipients.push(value); return value; }),
    insert: jest.fn(async (_entity: any, value: any) => reservations.push(value)) };
  manager.transaction = async (run: any) => run(manager);
  const tasks: any = { ...repos.get(EmailTask), manager };
  const customers: any = { findByIdentifier: jest.fn(async () => customer), findOne: jest.fn(async () => customer), assertCustomerOwner: jest.fn(async () => customer), isCustomerEmailMarketingAllowed: jest.fn(async () => true) };
  const settings: any = { getSmtpProfile: jest.fn(async () => ({ smtpUser: sender.email, credentialStatus: 'saved' })), getSmtpCredentials: jest.fn(async () => ({ smtpUser: sender.email, smtpHost: 'smtp.example.com', pass: 'fixture-not-a-secret' })) };
  const suppressions: any = { isSuppressed: jest.fn(async () => false) };
  const service = new OutreachService(tasks, customers, settings, suppressions);
  const schedule = { startAt: new Date(Date.now() + 3600_000).toISOString(), batchSize: 10, intervalMinutes: 10, totalRuns: 2, revision: 0 };
  return { service, task, customer, settings, customers, suppressions, manager, repos, reservations, recipients, schedule };
}

describe('customer analysis scheduling', () => {
  it('commits one selected recipient snapshot and a shared batch plan; repeated confirmation is idempotent', async () => {
    const h = harness();
    await h.service.schedule('owf_abc', h.schedule, '7');
    expect(h.recipients).toHaveLength(1);
    expect(h.reservations).toHaveLength(1);
    expect(h.task).toMatchObject({ status: 'active', batchSize: 10, totalRuns: 2, intervalMinutes: 10 });
    expect(h.task.outreachData.approvedAt).toBeDefined();
    await h.service.schedule('owf_abc', h.schedule, '7');
    expect(h.recipients).toHaveLength(1);
  });
  it.each(['suppressed', 'replied', 'changedEmail', 'history', 'occupied'])('revalidates %s at confirmation before inserting recipients', async (condition) => {
    const h = harness();
    if (condition === 'suppressed') h.suppressions.isSuppressed.mockResolvedValue(true);
    if (condition === 'replied') h.customer.journeyStage = 'replied';
    if (condition === 'changedEmail') h.customer.email = 'changed@buyer.ae';
    if (condition === 'history') h.repos.get(EmailLog).findOne.mockResolvedValue({ status: 'sent' });
    if (condition === 'occupied') h.repos.get(OutreachReservation).findOne.mockResolvedValue({ taskId: 99 });
    await expect(h.service.schedule('owf_abc', h.schedule, '7')).rejects.toThrow();
    expect(h.manager.insert).not.toHaveBeenCalled();
  });
  it('rejects an account/signature mismatch, stale edits, and undersized batches', async () => {
    const h = harness();
    h.settings.getSmtpCredentials.mockResolvedValue({ smtpUser: 'other@example.com', smtpHost: 'smtp.example.com', pass: 'fixture' });
    await expect(h.service.schedule('owf_abc', h.schedule, '7')).rejects.toThrow('发件账户');
    await expect(h.service.edit('owf_abc', 'customer:c1', { subject: 'Hi', body: 'Body', selected: true, revision: 99 }, '7')).rejects.toThrow('已更新');
    h.task.outreachData.drafts.push({ ...draft(), recipientKey: 'customer:c2' });
    await expect(h.service.schedule('owf_abc', { ...h.schedule, batchSize: 1, totalRuns: 1 }, '7')).rejects.toThrow('容量');
  });
  it('denies access through the customer ownership check', async () => {
    const h = harness(); h.customers.assertCustomerOwner.mockRejectedValue(new Error('客户不存在'));
    await expect(h.service.schedule('owf_abc', h.schedule, '7')).rejects.toThrow('客户不存在');
    expect(h.manager.insert).not.toHaveBeenCalled();
  });
});

describe('personalized scheduler delivery', () => {
  it.each(['replied', 'invalid', 'country'])('skips a customer whose %s status changed after scheduling', async (change) => {
    const h = harness(); h.task.outreachData.approvedAt = 'approved';
    if (change === 'replied') h.customer.journeyStage = 'replied';
    if (change === 'invalid') h.customer.emailStatus = 'invalid';
    if (change === 'country') h.customer.country = 'UK';
    const service: any = new EmailService({} as any, {} as any, { findOne: async () => null } as any, { save: async () => undefined } as any, h.customers, h.settings, h.suppressions);
    const transport = { sendMail: jest.fn() };
    const recipient = { ...draft(), attempts: 0 };
    expect(await service.sendRecipient(h.task, {}, recipient, transport, { smtpUser: sender.email }, {})).toBe(false);
    expect(recipient).toMatchObject({ status: 'skipped' });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
  it('uses the exact approved recipient message rather than the generic task template', async () => {
    const h = harness(); h.task.outreachData.approvedAt = new Date().toISOString();
    h.settings.getOrCreateUnsubscribeSecret = async () => 'fixture';
    const recipient: any = { ...draft(), attempts: 0 };
    const recipients: any = { save: jest.fn(async (v) => v) };
    const logs: any = { findOne: jest.fn(async () => null), create: (v: any) => v, save: async () => undefined };
    h.customers.markEmailSent = jest.fn();
    const service: any = new EmailService({} as any, {} as any, logs, recipients, h.customers, h.settings, h.suppressions);
    const transport = { sendMail: jest.fn(async (_input: any) => ({ messageId: 'test@example.com' })) };
    service.createLog = jest.fn(async () => undefined);
    await service.sendRecipient(h.task, { subject: 'Generic', body: 'Generic' }, recipient, transport, { smtpUser: sender.email }, {});
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: draft().subject, to: draft().email }));
    expect(transport.sendMail.mock.calls[0][0].text).toContain('Do you source flanges?');
  });
  it('does not fall back to a generic message when an approved recipient snapshot is missing', async () => {
    const service: any = new EmailService({} as any, {} as any, {} as any, { save: async () => undefined } as any, { findOne: async () => ({}) } as any, {} as any, {} as any);
    const transport = { sendMail: jest.fn() };
    const recipient = { ...draft(), recipientKey: 'customer:missing' };
    const h = harness(); h.task.outreachData.approvedAt = 'approved';
    expect(await service.sendRecipient(h.task, {}, recipient, transport, {}, {})).toBe(false);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});
