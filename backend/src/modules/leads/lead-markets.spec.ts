import { taskMarkets, uniqueMarkets } from './lead-markets';
import { LeadsService } from './leads.service';

describe('one effective market for the acquisition pipeline', () => {
  const tasks: any = { create: jest.fn((value) => value), save: jest.fn(async (value) => value), findOne: jest.fn() };
  const service = new LeadsService({} as any, tasks, {} as any, {} as any, {} as any);
  it('normalizes common aliases and removes duplicate countries', () => {
    expect(uniqueMarkets(['UAE', '阿联酋', 'uae', '德国', 'USA', 'United States', 'norway'])).toEqual(['United Arab Emirates', 'Germany', 'United States', 'Norway']);
  });
  it('persists only the selected scope and preserves countries on legacy tasks', async () => {
    const countryTask = await service.createTask({ productName: 'flange', marketMode: 'countries', targetCountries: ['UAE'], targetRegions: ['Global'] }, 'sales');
    expect(countryTask.targetRegions).toEqual([]);
    expect(taskMarkets(countryTask)).toEqual(['United Arab Emirates']);
    const globalTask = await service.createTask({ productName: 'flange', marketMode: 'global', targetCountries: ['Germany'], targetRegions: ['Europe'] });
    expect(taskMarkets(globalTask)).toEqual(['Global']);
    expect(globalTask.agentState.targetCountries).toEqual([]);
    expect(taskMarkets({ agentState: { targetCountries: ['UAE'] }, targetRegions: ['Global'] })).toEqual(['United Arab Emirates']);
  });
  it('rejects empty or conflicting scope instead of silently broadening it', async () => {
    await expect(service.createTask({ marketMode: 'countries' })).rejects.toThrow('国家');
    await expect(service.createTask({ marketMode: 'countries', targetCountries: ['Europe'] })).rejects.toThrow('国家');
    await expect(service.createTask({ marketMode: 'regions', targetRegions: ['Global', 'Europe'] })).rejects.toThrow('大区');
  });
  it('regenerates using saved countries rather than stale global defaults', async () => {
    tasks.findOne.mockResolvedValue({ id: 1, productName: 'flange', agentState: { targetCountries: ['UAE'] }, targetRegions: ['Global'], targetSegments: ['distributor'] });
    const result = await service.generateQueries(1, { regenerate: true });
    expect(result.queries.every((query: string) => query.includes('"United Arab Emirates"'))).toBe(true);
  });
  it('covers all selected markets and buyer types in the bounded search budget', () => {
    const regions = ['Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Norway', 'Sweden', 'United States', 'Canada', 'Mexico', 'United Arab Emirates', 'Qatar', 'Oman', 'India', 'Japan', 'South Korea', 'Thailand', 'Vietnam', 'Singapore', 'Malaysia'];
    const segments = Array.from({ length: 16 }, (_, index) => `buyer type ${index}`);
    const queries = service.generateSearchQueries('法兰', { regions, segments, aliases: ['flange', 'forged flange', 'steel flange'], industries: ['Oil & Gas'] });
    expect(queries.length).toBeLessThanOrEqual(120);
    expect(new Set(queries).size).toBe(queries.length);
    for (const region of regions) for (const segment of segments) expect(queries.some((query) => query.includes(`"${region}"`) && query.includes(`"${segment}"`))).toBe(true);
    expect(queries[0]).toContain('"flange"');
    expect(queries[19]).toContain('"Malaysia"');
  });
  it('resets stale directory cursors when replacing a strategy and refuses edits while running', async () => {
    const task = { id: 3, productName: 'flange', status: 'cancelled', automationCursor: 12, agentState: { targetCountries: ['UAE'], sourceBatch: 9, multiSourceCrawlerMode: true } };
    tasks.findOne.mockResolvedValue(task);
    await service.generateQueries(3, { queries: ['new query'] });
    expect(task.automationCursor).toBe(0);
    expect(task.agentState).toMatchObject({ targetCountries: ['UAE'], sourceBatch: 0, multiSourceCrawlerMode: false });
    task.status = 'running';
    await expect(service.generateQueries(3, { regenerate: true })).rejects.toThrow('停止');
  });
});
