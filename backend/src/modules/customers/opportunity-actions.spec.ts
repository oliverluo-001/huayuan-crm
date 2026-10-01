import { CustomersService } from './customers.service';

describe('opportunity executable next steps', () => {
  let todos: any[];
  let opportunities: any[];
  let customer: any;
  let service: CustomersService;
  beforeEach(() => {
    todos = []; opportunities = [];
    customer = { id: 1, company: 'Buyer', ownerId: 'seller', tags: [], journeyStage: 'qualified' };
    const repository = (rows: () => any[]) => ({
      create: (value: any) => ({ id: rows().length + 1, ...value }),
      save: jest.fn(async (value: any) => { const i = rows().findIndex((row) => row.id === value.id); if (i < 0) rows().push(value); else rows()[i] = value; return value; }),
      findOne: async ({ where }: any) => rows().find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) || null,
      find: async ({ where = {} }: any = {}) => rows().filter((row) => Object.entries(where).every(([key, value]) => row[key] === value)),
    });
    service = new CustomersService({ findOne: async () => customer, save: async (value: any) => Object.assign(customer, value) } as any,
      {} as any, {} as any, repository(() => todos) as any, repository(() => opportunities) as any,
      {} as any, {} as any, {} as any, {} as any, {} as any);
  });
  const create = (name = 'First order') => service.createOpportunity({ customerId: 1, name, nextStepAction: '确认图纸', nextStepDueDate: '2026-10-10', expectedCloseDate: '2026-11-01' });
  it('creates one linked task, updates it and preserves completed history for the next action', async () => {
    const opportunity = await create();
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ title: '确认图纸', opportunityId: opportunity.id, nextActionKey: `opp:${opportunity.id}`, status: 'open' });
    await service.updateOpportunity(opportunity.id, { nextStepAction: '发送修订报价' });
    expect(todos).toHaveLength(1);
    expect(customer.nextTodoTitle).toBe('发送修订报价');
    await service.updateTodo(todos[0].id, { status: 'done' });
    expect(opportunity.nextStepAction).toBe('');
    expect(customer.nextTodoTitle).toBe('');
    expect(todos[0]).toMatchObject({ status: 'done', resolution: 'completed', nextActionKey: null });
    await service.updateOpportunity(opportunity.id, { nextStepAction: '电话确认采购时间' });
    expect(todos).toHaveLength(2);
    expect(todos[0].title).toBe('发送修订报价');
    expect(todos[1].status).toBe('open');
  });
  it('does not change another project and distinguishes cancelled from completed', async () => {
    const first = await create();
    const second = await create('Second order');
    await service.updateOpportunity(first.id, { stage: 'lost', lossReason: '项目取消' });
    expect(todos[0]).toMatchObject({ status: 'done', resolution: 'cancelled', nextActionKey: null });
    expect(todos[1]).toMatchObject({ status: 'open', nextActionKey: `opp:${second.id}` });
    expect(customer.openOpportunityCount).toBe(1);
  });
  it('protects linked history and has a single editing source', async () => {
    await create();
    await expect(service.updateTodo(todos[0].id, { title: 'different' })).rejects.toThrow('请在商机中修改');
    await expect(service.deleteTodo(todos[0].id)).rejects.toThrow('需要保留');
    await service.updateTodo(todos[0].id, { status: 'done' });
    await expect(service.updateTodo(todos[0].id, { status: 'open' })).rejects.toThrow('不可重新打开');
  });
  it('does not complete a changed action after waiting for the opportunity lock', async () => {
    const opportunity = await create();
    const original = { ...todos[0] };
    (service as any).linkedActionTransaction = true;
    (service as any).todoRepository.findOne = jest.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce({ ...original, title: '新的行动' });
    await expect(service.updateTodo(original.id, { status: 'done' })).rejects.toThrow('行动已被修改');
    expect(opportunity.nextStepAction).toBe('确认图纸');
    expect(todos[0].status).toBe('open');
  });
});
