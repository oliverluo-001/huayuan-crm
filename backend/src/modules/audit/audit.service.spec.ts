import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('applies bounded pagination and filters', async () => {
    const query: any = {
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 1 }], 101]),
    };
    const repository: any = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const service = new AuditService(repository);

    const result = await service.findAll({ page: 2, limit: 1000, username: 'admin', status: 'failed' });

    expect(query.skip).toHaveBeenCalledWith(100);
    expect(query.take).toHaveBeenCalledWith(100);
    expect(query.andWhere).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ total: 101, page: 2, limit: 100, pages: 2 }));
  });

  it('stores structured audit metadata', async () => {
    const repository: any = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const service = new AuditService(repository);
    await service.log({ username: 'admin', action: 'POST /customers', method: 'POST', status: 'success' });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ details: '', method: 'POST' }));
  });
});
