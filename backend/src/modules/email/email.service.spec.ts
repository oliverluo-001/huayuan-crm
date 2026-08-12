import { EmailService } from './email.service';

describe('EmailService ownership', () => {
  const templateRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    delete: jest.fn(),
  };
  const taskRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => ({ id: 5, ...value })),
    save: jest.fn(async (value) => value),
    delete: jest.fn(),
  };
  const recipientRepository = {
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    delete: jest.fn(),
  };
  const customersService = {
    findOne: jest.fn(),
    findByIdentifier: jest.fn(),
    findContactByIdentifier: jest.fn(),
    assertCustomerOwner: jest.fn(),
    isCustomerEmailMarketingAllowed: jest.fn().mockResolvedValue(true),
  };
  const service = new EmailService(
    templateRepository as any,
    taskRepository as any,
    {} as any,
    recipientRepository as any,
    customersService as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('waits for an in-flight scheduler check before module shutdown', async () => {
    let finishScheduler: (() => void) | undefined;
    const schedulerPending = new Promise<void>((resolve) => {
      finishScheduler = resolve;
    });
    const processDueTasks = jest
      .spyOn(service as any, 'processDueTasks')
      .mockReturnValue(schedulerPending);

    service.onModuleInit();
    let shutdownFinished = false;
    const shutdown = service.onModuleDestroy().then(() => {
      shutdownFinished = true;
    });
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);

    finishScheduler?.();
    await shutdown;
    expect(shutdownFinished).toBe(true);
    processDueTasks.mockRestore();
  });

  it('returns a task to its owner', async () => {
    taskRepository.findOne.mockResolvedValue({ id: 1, emailTaskId: 'task_1', ownerId: '7', customerIds: '[]' });
    await expect(service.findOneTask('1', '7')).resolves.toEqual(expect.objectContaining({ id: 1 }));
  });

  it('does not reveal a task owned by another salesperson', async () => {
    taskRepository.findOne.mockResolvedValue({ id: 1, emailTaskId: 'task_1', ownerId: '8', customerIds: '[]' });
    await expect(service.findOneTask('1', '7')).rejects.toThrow('邮件任务不存在');
  });

  it('shows the saved reason for a skipped recipient', async () => {
    taskRepository.find.mockResolvedValue([{
      id: 1,
      ownerId: '7',
      customerIds: '["101"]',
      skippedSendCount: 1,
      lastMessage: '任务结束：成功 0 封，失败 0 封，跳过 1 封',
    }]);
    recipientRepository.find.mockResolvedValue([{
      taskId: 1,
      status: 'skipped',
      lastError: '客户时区缺失，已阻止发送',
    }]);

    await expect(service.findAllTasks({ ownerId: '7' })).resolves.toEqual([
      expect.objectContaining({
        lastMessage: expect.stringContaining('跳过原因：客户时区缺失'),
      }),
    ]);
  });

  it('requeues only an unsuccessful recipient and infers Bangkok timezone', async () => {
    const task = {
      id: 1,
      emailTaskId: 'task_1',
      ownerId: '7',
      customerIds: '["101"]',
      status: 'completed',
      skippedSendCount: 1,
      failedSendCount: 0,
      successfulSendCount: 0,
      startAt: null,
    };
    const recipient = {
      id: 3,
      taskId: 1,
      customerId: 101,
      status: 'skipped',
      attempts: 0,
      lastError: '客户时区缺失，已阻止发送',
      sentAt: null,
      timezone: '',
    };
    taskRepository.findOne.mockResolvedValue(task);
    recipientRepository.find.mockResolvedValue([recipient]);
    recipientRepository.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    customersService.findOne.mockResolvedValue({
      id: 101,
      region: 'Bangkok',
      country: 'Thailand',
      timezone: '',
    });
    const processTask = jest
      .spyOn(service as any, 'processTask')
      .mockResolvedValue(undefined);

    await expect(service.runTask('task_1', '7')).resolves.toEqual(
      expect.objectContaining({ status: 'active' }),
    );
    expect(recipient).toMatchObject({
      status: 'queued',
      timezone: 'Asia/Bangkok',
      lastError: null,
    });
    expect(taskRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
    processTask.mockRestore();
  });

  it('does not let a salesperson edit a shared system template', async () => {
    templateRepository.findOne.mockResolvedValue({ id: 1, ownerId: '', name: 'System template' });
    await expect(service.updateTemplate(1, { name: 'Changed' }, '7'))
      .rejects.toThrow('邮件模板不存在');
  });

  it('stores new salesperson templates under the current account', async () => {
    await expect(service.createTemplate({
      name: 'My template',
      subject: 'Hello',
      body: 'Body',
    }, '7')).resolves.toEqual(expect.objectContaining({ ownerId: '7' }));
    expect(templateRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: '7' }),
    );
  });

  it('creates and automatically activates a complete scheduled batch plan', async () => {
    templateRepository.findOne.mockResolvedValue({
      id: 1,
      templateId: 'tmpl_1',
      ownerId: '7',
      subject: 'Hello',
      body: 'Body',
    });
    recipientRepository.count.mockResolvedValue(2);
    const startAt = new Date(Date.now() + 60_000).toISOString();

    await expect(service.createTask({
      name: 'Scheduled outreach',
      taskMode: 'scheduled',
      templateId: 'tmpl_1',
      customerIds: ['contact:11', 'contact:12'],
      startAt,
      intervalMinutes: 60,
      batchSize: 1,
      totalRuns: 2,
      autoStart: true,
    }, '7')).resolves.toEqual(expect.objectContaining({
      status: 'active',
      taskMode: 'scheduled',
      intervalMinutes: 60,
      batchSize: 1,
      totalRuns: 2,
      customerIds: ['contact:11', 'contact:12'],
    }));
    expect(taskRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      nextRunAt: new Date(startAt),
      status: 'active',
    }));
  });

  it('rejects a scheduled plan whose rounds cannot cover all selected recipients', async () => {
    await expect(service.createTask({
      name: 'Undersized plan',
      taskMode: 'scheduled',
      templateId: 'tmpl_1',
      customerIds: ['contact:11', 'contact:12', 'contact:13'],
      startAt: new Date(Date.now() + 60_000).toISOString(),
      intervalMinutes: 60,
      batchSize: 1,
      totalRuns: 2,
    }, '7')).rejects.toThrow('当前计划最多可发送 2 封');
    expect(taskRepository.save).not.toHaveBeenCalled();
  });

  it('rejects manually submitted recipients outside the sales authorization scope', async () => {
    recipientRepository.count.mockResolvedValue(0);
    customersService.findByIdentifier.mockResolvedValue({
      id: 99,
      customerId: 'CUS-99',
      email: 'other@test',
    });
    customersService.assertCustomerOwner.mockRejectedValue(new Error('not found'));

    await expect((service as any).ensureTaskRecipients({
      id: 3,
      ownerId: '7',
      customerIds: '["customer:CUS-99"]',
    })).resolves.toBe(0);
    expect(recipientRepository.save).not.toHaveBeenCalled();
  });
});
