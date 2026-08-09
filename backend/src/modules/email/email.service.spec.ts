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
    save: jest.fn(async (value) => value),
  };
  const recipientRepository = {
    find: jest.fn(),
    count: jest.fn(),
    save: jest.fn(async (value) => value),
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
