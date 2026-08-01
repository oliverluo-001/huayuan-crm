import { EmailService } from './email.service';

describe('EmailService ownership', () => {
  const taskRepository = { findOne: jest.fn() };
  const service = new EmailService(
    {} as any,
    taskRepository as any,
    {} as any,
    {} as any,
    {} as any,
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
});
