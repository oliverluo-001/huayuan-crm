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

  it('uses the public HTML search fallback when no API profile is configured', async () => {
    settings.getSearchProfiles.mockResolvedValue([]);
    const publicHtml = `
      <div class="result results_links results_links_deep web-result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Facme.example%2Fcontact&amp;rut=test">Home | Acme PVF Distribution</a>
        <a class="result__snippet" href="#">Acme is a flange distributor and industrial stockist.</a>
      </div>`;
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => publicHtml } as any)
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => '<html><body>Flange distributor. Contact sales@acme.example</body></html>',
      } as any);

    const result = await service.discover('flange distributor', ['flange'], ['distributor']);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      company: 'Acme PVF Distribution',
      email: 'sales@acme.example',
      sourceName: 'DuckDuckGo 公开搜索 + 企业官网',
    });
    expect(fetchMock.mock.calls[0][0]).toContain('html.duckduckgo.com/html/');
  });

  it('switches to DuckDuckGo Lite when the HTML endpoint is rate limited', async () => {
    settings.getSearchProfiles.mockResolvedValue([]);
    const liteHtml = `
      <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Facme.example%2Fcontact&amp;rut=test" class="result-link">Acme PVF Distribution</a>
      <td class="result-snippet">Flange distributor, stockist and industrial supplier.</td>`;
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<html>anomaly detected</html>' } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => liteHtml } as any)
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => '<html><body>Flange distributor. Email sales@acme.example</body></html>',
      } as any);

    const result = await service.discover('flange distributor', ['flange'], ['distributor']);

    expect(fetchMock.mock.calls[0][0]).toContain('html.duckduckgo.com/html/');
    expect(fetchMock.mock.calls[1][0]).toContain('lite.duckduckgo.com/lite/');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      company: 'Acme PVF Distribution',
      email: 'sales@acme.example',
      sourceName: 'DuckDuckGo Lite 公开搜索 + 企业官网',
    });
  });

  it('discovers company websites from Wikidata and crawls public contacts when search pages are blocked', async () => {
    settings.getSearchProfiles.mockResolvedValue([]);
    jest.spyOn(service as any, 'throttlePublicSearch').mockResolvedValue(undefined);
    const catalogResponse = {
      results: {
        bindings: [{
          company: { value: 'https://www.wikidata.org/entity/Q1' },
          companyLabel: { value: 'Acme Energy' },
          website: { value: 'https://acme.example/' },
          countryLabel: { value: 'United Arab Emirates' },
          industryLabel: { value: 'petroleum industry' },
        }],
      },
    };
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<html>anomaly detected</html>' } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<html>automated requests blocked</html>' } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(catalogResponse) } as any)
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: (name: string) => name === 'content-type' ? 'text/html' : null },
        text: async () => '<html><body>Oil and gas procurement. Flange projects. <a href="tel:+971 2 555 0100">Call</a> sales@acme.example</body></html>',
      } as any);

    const result = await service.discover(
      'flange importer Middle East',
      ['flange'],
      ['oil & gas company'],
      { regions: ['Middle East'], industries: ['Oil & Gas'] },
    );

    expect(fetchMock.mock.calls[2][0]).toContain('query.wikidata.org/sparql');
    expect(result.mode).toBe('catalog-crawler');
    expect(result.sourceExhausted).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      company: 'Acme Energy',
      country: 'United Arab Emirates',
      email: 'sales@acme.example',
      phone: '+971 2 555 0100',
      targetSegment: 'oil & gas company',
      sourceName: 'Wikidata 公开企业目录 + 官网爬虫',
    });
  });
});
