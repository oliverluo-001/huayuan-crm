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
    jest.clearAllMocks();
    settings.getAiCredentials.mockResolvedValue(null);
    settings.getSearchProfiles.mockResolvedValue([]);
    (service as any).multiSourceCache.clear();
    (service as any).robotsCache.clear();
    (service as any).commonCrawlIndexCache = null;
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
    jest.spyOn(service as any, 'searchIndustryDirectories').mockResolvedValue([]);
    jest.spyOn(service as any, 'searchExhibitorDirectories').mockResolvedValue([]);
    jest.spyOn(service as any, 'searchCommonCrawlDomains').mockResolvedValue([]);
    const catalogResponse = {
      results: {
        bindings: [{
          company: { value: 'https://www.wikidata.org/entity/Q1' },
          companyLabel: { value: 'Acme Energy' },
          website: { value: 'https://acme.example/' },
          countryLabel: { value: 'United Arab Emirates' },
          companyIndustryLabel: { value: 'petroleum industry' },
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
    const wikidataUrl = new URL(String(fetchMock.mock.calls[2][0]));
    expect(wikidataUrl.searchParams.get('query')).toContain('?company wdt:P452 ?companyIndustry.');
    expect(result.mode).toBe('multi-source-crawler');
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

  it('interleaves successful public sources and continues when one provider fails', async () => {
    jest.spyOn(service as any, 'searchWikidataCatalog').mockResolvedValue([{
      title: 'Wiki Energy', url: 'https://wiki-energy.example', snippet: 'Oil and gas', sourceKey: 'wikidata',
    }]);
    jest.spyOn(service as any, 'searchIndustryDirectories').mockResolvedValue([{
      title: 'Directory Valve', url: 'https://directory-valve.example', snippet: 'Valve distributor', sourceKey: 'industry-directory',
    }]);
    jest.spyOn(service as any, 'searchExhibitorDirectories').mockRejectedValue(new Error('HTTP 403'));
    jest.spyOn(service as any, 'searchCommonCrawlDomains').mockResolvedValue([{
      title: 'Archive Flange', url: 'https://archive-flange.example', snippet: 'Flange supplier', sourceKey: 'common-crawl',
    }]);

    const catalog = await (service as any).searchMultiSourceCompanyCatalog(
      ['Middle East'], ['Oil & Gas'], ['flange'], ['distributor'],
    );

    expect(catalog.results.map((item: any) => item.title)).toEqual([
      'Wiki Energy', 'Directory Valve', 'Archive Flange',
    ]);
    expect(catalog.sources).toEqual([
      'Wikidata 公开企业目录', 'Curlie 公开行业目录', 'Common Crawl 企业域名索引',
    ]);
    expect(catalog.errors).toEqual(['公开展商目录: HTTP 403']);
  });

  it('extracts company websites from a public industry directory and ignores navigation or social links', () => {
    const results = (service as any).extractExternalCompanyLinks(`
      <a href="https://directory.example/about">About</a>
      <a href="https://acme-valves.example/company">Acme Valves</a><p>Industrial valve and flange distributor</p>
      <a href="https://linkedin.com/company/acme">LinkedIn</a>
      <a href="https://supplier.example/">Supplier International</a>
    `, 'https://directory.example/list', {
      name: '测试行业目录', url: 'https://directory.example/list', industry: 'Valves and flanges', match: /valve/i,
    }, 'industry-directory');

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Acme Valves',
      url: 'https://acme-valves.example',
      sourceKey: 'industry-directory',
      directoryUrl: 'https://directory.example/list',
    });
  });

  it('deep-crawls priority company pages and aggregates public contact evidence', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(async (input: string) => {
      const url = String(input);
      const html = url.endsWith('/contact')
        ? '<html><body>Contact our procurement team: sales@deep.example <a href="tel:+1 555 0100">Call</a></body></html>'
        : url.endsWith('/products')
          ? '<html><body>ASME flange, valve and pipe products for oil and gas distributors.</body></html>'
          : '<html><body><a href="/contact">Contact</a><a href="/products">Products</a></body></html>';
      return {
        status: 200,
        headers: { get: (name: string) => name === 'content-type' ? 'text/html' : null },
        text: async () => html,
      } as any;
    });

    const candidates = await (service as any).enrich({
      title: 'Deep Industrial',
      url: 'https://deep.example/',
      snippet: 'Oil and gas distributor',
      sourceName: '公开展商目录 + 官网爬虫',
      sourceKey: 'exhibitor-directory',
    }, ['flange'], ['distributor'], ['Oil & Gas']);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(candidates[0]).toMatchObject({
      email: 'sales@deep.example',
      phone: '+1 555 0100',
      sourceUrl: 'https://deep.example/contact',
      sourceType: 'Contact Page',
    });
    expect(candidates[0].rawData.crawledPages).toEqual(expect.arrayContaining([
      'https://deep.example/', 'https://deep.example/contact', 'https://deep.example/products',
    ]));
  });

  it('honors robots.txt before requesting a disallowed company page', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'User-agent: *\nDisallow: /private',
    } as any);

    const page = await (service as any).fetchPage('https://robots-test.invalid/private/contact');

    expect(page).toEqual({ status: 0, html: '' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://robots-test.invalid/robots.txt');
  });

  it('uses the latest Common Crawl URL index and keeps only matching directory-host pages', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => [
        JSON.stringify({ url: 'https://expo.example/exhibitors/acme-valves' }),
        JSON.stringify({ url: 'https://expo.example/company/global-flange' }),
        JSON.stringify({ url: 'https://other.example/exhibitor/ignored' }),
        '{invalid-json}',
      ].join('\n'),
    } as any);

    const pages = await (service as any).findCommonCrawlDirectoryPages(
      'CC-MAIN-2026-30', 'https://expo.example/exhibitor-list',
    );

    expect(pages).toEqual([
      'https://expo.example/exhibitors/acme-valves',
      'https://expo.example/company/global-flange',
    ]);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://index.commoncrawl.org/CC-MAIN-2026-30');
    expect(requestUrl.searchParams.get('url')).toBe('expo.example/*');
    expect(requestUrl.searchParams.getAll('filter')).toEqual(expect.arrayContaining([
      'status:200', 'mime:text/html',
    ]));
  });
});
