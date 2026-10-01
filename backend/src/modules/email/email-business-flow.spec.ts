import { EmailService } from './email.service';

function harness(totalRuns = 1, batchSize = 1) {
  let task: any = { id: 1, ownerId: '7', emailTaskId: 'task_1', customerIds: '["1","2","3"]', templateId: 'template_1', status: 'active', taskMode: 'scheduled', totalRuns, batchSize, intervalMinutes: 1, runsCompleted: 0, roundProcessedCount: 0, startAt: null };
  const recipients = [1, 2, 3].map((id) => ({ id, taskId: 1, customerId: id, email: `buyer${id}@example.com`, status: 'queued', attempts: 0 }));
  const taskRepo = { findOne: jest.fn(async () => ({ ...task })), save: jest.fn(async (value) => { task = { ...value }; return value; }) };
  const recipientRepo = {
    find: jest.fn(async ({ where }) => recipients.filter((item) => item.status === where.status).map((item) => ({ ...item }))),
    count: jest.fn(async ({ where }) => recipients.filter((item) => !where.status || item.status === where.status).length),
    save: jest.fn(async (value) => { Object.assign(recipients.find((item) => item.id === value.id)!, value); return value; }),
  };
  const logs = { count: jest.fn(async () => 0) };
  const customers = { assertCustomerOwner: jest.fn(async () => undefined) };
  const settings = { getSmtpCredentials: jest.fn(async () => ({})), getEmailPolicy: jest.fn(async () => ({})) };
  const service = new EmailService({} as any, taskRepo as any, logs as any, recipientRepo as any, customers as any, settings as any, { isSuppressed: async () => false } as any);
  jest.spyOn(service as any, 'findTemplateByIdentifier').mockResolvedValue({});
  jest.spyOn(service as any, 'createSmtpTransport').mockReturnValue({ verify: async () => undefined });
  const send = jest.spyOn(service as any, 'sendRecipient').mockImplementation(async (...args: any[]) => {
    const recipient = args[2];
    recipient.status = 'sent';
    await recipientRepo.save(recipient);
    return true;
  });
  return { service, recipients, logs, send, task: () => task };
}

describe('business email schedules (no external email)', () => {
  it('never resends an SMTP-accepted email after a logging failure', async () => {
    const recipients = { save: jest.fn(async (value) => value) };
    const service = new EmailService({} as any, {} as any, {} as any, recipients as any,
      { findOne: async () => null } as any,
      { getOrCreateUnsubscribeSecret: async () => 'test-secret' } as any, {} as any);
    jest.spyOn(service, 'createLog').mockRejectedValue(new Error('database unavailable'));
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    const transport = { sendMail: jest.fn(async () => ({ messageId: 'accepted' })) };
    const recipient = { id: 1, email: 'buyer@example.com', attempts: 0 };
    await expect((service as any).sendRecipient({ id: 1, ownerId: '7', subject: 'Hello', body: 'Body' }, {}, recipient, transport, {}, {})).resolves.toBe(true);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(recipient).toMatchObject({ status: 'sent', attempts: 1 });
  });
  it('retains overflow as queued and continues without resending success', async () => {
    const h = harness();
    await (h.service as any).processTask(1);
    expect(h.task()).toMatchObject({ status: 'completed', successfulSendCount: 1, skippedSendCount: 0 });
    expect(h.recipients.map((item) => item.status)).toEqual(['sent', 'queued', 'queued']);
    const process = jest.spyOn(h.service as any, 'processTask').mockResolvedValue(undefined);
    await h.service.runTask('1', '7');
    expect(h.task()).toMatchObject({ status: 'active', runsCompleted: 0 });
    process.mockRestore();
    await (h.service as any).processTask(1);
    expect(h.recipients.map((item) => item.status)).toEqual(['sent', 'sent', 'queued']);
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it('all-recipients mode continues beyond one round', async () => {
    const h = harness(0);
    await (h.service as any).processTask(1);
    expect(h.task().status).toBe('active');
    await (h.service as any).processTask(1);
    await (h.service as any).processTask(1);
    expect(h.task()).toMatchObject({ status: 'completed', successfulSendCount: 3, runsCompleted: 3 });
  });

  it('pauses after the in-flight message and resumes only the remainder of that round', async () => {
    const h = harness(1, 2);
    h.send.mockImplementationOnce(async (...args: any[]) => {
      const recipient = args[2];
      Object.assign(h.recipients.find((item) => item.id === recipient.id)!, { status: 'sent' });
      await h.service.pauseTask('1', '7');
      return true;
    });
    await (h.service as any).processTask(1);
    expect(h.task()).toMatchObject({ status: 'pending', roundProcessedCount: 1, runsCompleted: 0 });
    const process = jest.spyOn(h.service as any, 'processTask').mockResolvedValue(undefined);
    await h.service.runTask('1', '7');
    process.mockRestore();
    await (h.service as any).processTask(1);
    expect(h.task()).toMatchObject({ status: 'completed', successfulSendCount: 2, skippedSendCount: 0 });
    expect(h.recipients[2].status).toBe('queued');
  });

  it('counts provider quota under the current sender identity', async () => {
    const h = harness();
    await (h.service as any).getRateLimitWait({ maxPerDay: 100 }, '7');
    expect(h.logs.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: '7' }) }));
  });
});
