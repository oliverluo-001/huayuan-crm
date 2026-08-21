import { LeadSearchService } from './lead-search.service';

describe('LeadSearchService', () => {
  const settings = {
    getAiCredentials: jest.fn(),
    getSearchProfiles: jest.fn(),
    getSearchProfileCredentials: jest.fn(),
  };
  const service = new LeadSearchService(settings as any);

  beforeEach(() => {
    jest.restoreAllMocks();
    settings.getAiCredentials.mockResolvedValue(null);
  });

  it('expands a flange product into buyer industries without AI', async () => {
    const result = await service.associateProduct('flange');
    expect(result.aliases).toContain('forged flanges');
    expect(result.industries).toContain('Oil & Gas');
    expect(result.recommendedSegments).toContain('distributor');
  });

  it('uses Serper results, rejects content sites and extracts only public page emails', async () => {
    settings.getSearchProfiles.mockResolvedValue([{ id: 'serper-1', name: 'Serper', apiKeySet: true }]);
    settings.getSearchProfileCredentials.mockResolvedValue({
      id: 'serper-1', provider: 'serper', apiUrl: 'https://google.serper.dev/search', apiKey: 'test-key',
    });
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ organic: [
          { title: 'Home | Acme PVF Distribution', link: 'https://acme.example/contact', snippet: 'flange distributor and stockist' },
          { title: 'Flange encyclopedia', link: 'https://en.wikipedia.org/wiki/Flange', snippet: 'flange information' },
        ] }),
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => '<html><body>Flanges and valves. Email sales@acme.example or noreply@acme.example</body></html>',
      } as any);

    const result = await service.discover('"flange" distributor USA', ['flange'], ['distributor']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.searched).toBe(2);
    expect(result.crawled).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      company: 'Acme PVF Distribution',
      email: 'sales@acme.example',
      sourceUrl: 'https://acme.example/contact',
      targetSegment: 'distributor',
      fitScore: 100,
      confidence: 'High',
    });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ num: 20 });
  });

  it('drops low-value training and editorial pages before crawling them', async () => {
    settings.getSearchProfiles.mockResolvedValue([{ id: 'serper-1', name: 'Serper', apiKeySet: true }]);
    settings.getSearchProfileCredentials.mockResolvedValue({
      id: 'serper-1', provider: 'serper', apiUrl: 'https://google.serper.dev/search', apiKey: 'test-key',
    });
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ organic: [
        { title: 'Flange distributor training course', link: 'https://training.example/course', snippet: 'Training for flange distributors' },
      ] }),
    } as any);

    const result = await service.discover('flange distributor', ['flange'], ['distributor']);

    expect(result.candidates).toEqual([]);
    expect(result.crawled).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
