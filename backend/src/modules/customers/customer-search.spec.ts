import { CustomersService } from './customers.service';

describe('authorized customer picker search', () => {
  it('groups all search alternatives before applying owner and collaborator scope', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[], 0]),
    };
    const service = new CustomersService({ createQueryBuilder: () => qb } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await service.findAll({ q: '1001', ownerId: '7', journeyStage: 'negotiation', tier: 'A', tag: 'buyer', emailStatus: 'valid', health: 'followup', region: 'Thailand', offset: '0', limit: '25' });
    const [search, params] = qb.where.mock.calls[0];
    expect(search.startsWith('(') && search.endsWith(')')).toBe(true);
    expect(search).toContain('customer.customerId');
    expect(params.customerNumber).toBe('1001');
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('customerAccessUserId'), { customerAccessUserId: '7' });
    expect(qb.take).toHaveBeenCalledWith(25);
    expect(qb.andWhere).toHaveBeenCalledWith('customer.journeyStage = :journeyStage', { journeyStage: 'negotiation' });
    expect(qb.andWhere).toHaveBeenCalledWith('customer.tier = :tier', { tier: 'A' });
    expect(qb.andWhere).toHaveBeenCalledWith('customer.emailStatus = :emailStatus', { emailStatus: 'valid' });
    expect(qb.andWhere).toHaveBeenCalledWith('customer.region LIKE :region', { region: '%Thailand%' });
    expect(qb.andWhere).toHaveBeenCalledWith('customer.health IN (:...followupHealth)', { followupHealth: ['warning', 'critical'] });
    expect(qb.innerJoin).toHaveBeenCalledWith('customer.tags', 'filterTag', 'filterTag.name = :tagName', { tagName: 'buyer' });
    qb.andWhere.mockClear(); qb.innerJoin.mockClear();
    await service.findAll({ tag: '(all)', journeyStage: 'new' });
    expect(qb.innerJoin).not.toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith('customer.journeyStage = :journeyStage', { journeyStage: 'new' });
    await service.findAll({ tag: '(untagged)', journeyStage: 'won' });
    expect(qb.andWhere).toHaveBeenCalledWith('tag.id IS NULL');
  });
});
