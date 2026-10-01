import { CustomersService } from './customers.service';

describe('authorized customer picker search', () => {
  it('groups all search alternatives before applying owner and collaborator scope', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[], 0]),
    };
    const service = new CustomersService({ createQueryBuilder: () => qb } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await service.findAll({ q: '1001', ownerId: '7', offset: '0', limit: '25' });
    const [search, params] = qb.where.mock.calls[0];
    expect(search.startsWith('(') && search.endsWith(')')).toBe(true);
    expect(search).toContain('customer.customerId');
    expect(params.customerNumber).toBe('1001');
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('customerAccessUserId'), { customerAccessUserId: '7' });
    expect(qb.take).toHaveBeenCalledWith(25);
  });
});
