import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface SearchCandidate {
  company: string;
  email: string;
  phone: string;
  website: string;
  sourceUrl: string;
  sourceType: string;
  sourceName: string;
  sourceHttpStatus: number;
  business: string;
  matchedProductKeyword: string;
  targetSegment: string;
  fitNote: string;
  fitScore: number;
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string[];
  gaps: string[];
  rawData: Record<string, unknown>;
  country?: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceName?: string;
  sourceKey?: string;
  directoryUrl?: string;
  catalogCountry?: string;
  catalogIndustry?: string;
}

export interface LeadDiscoveryOptions {
  regions?: string[];
  industries?: string[];
  preferMultiSourceCrawler?: boolean;
  sourceBatch?: number;
  // Backward compatible with tasks created before the multi-source crawler.
  preferCatalogCrawler?: boolean;
  catalogBatch?: number;
}

export interface LeadDiscoveryResult {
  candidates: SearchCandidate[];
  searched: number;
  crawled: number;
  mode: 'web-search' | 'multi-source-crawler';
  sourceExhausted?: boolean;
  sources?: string[];
  sourceErrors?: string[];
}

interface MultiSourceCatalog {
  results: SearchResult[];
  sources: string[];
  errors: string[];
}

interface PublicDirectorySource {
  name: string;
  url: string;
  industry: string;
  match: RegExp;
}

const BLOCKED_HOST_PARTS = [
  'wikipedia.org', 'youtube.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'pinterest.', 'reddit.com', 'quora.com', 'amazon.', 'alibaba.com', 'made-in-china.com',
  'indiamart.com', 'tradeindia.com', 'exportersindia.com', 'thomasnet.com', 'volza.com',
  'kompass.com', 'yellowpages.', 'zoominfo.com', 'linkedin.com', 'crunchbase.com', 'dnb.com',
  'researchgate.net', 'sciencedirect.com', 'springer.com', 'iso.org', 'gov.',
  'google.', 'bing.com', 'duckduckgo.com', 'search.aol.com', 'ask.com', 'ecosia.org',
  'startpage.com', 'yahoo.', 'yandex.',
];
const BLOCKED_PATH_PARTS = ['/news/', '/article/', '/blog/', '/wiki/', '/search?', '/video/', '/listings/', '/directory/'];
const EXCLUDED_EMAIL_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'abuse', 'postmaster', 'hostmaster'];
const PREFERRED_EMAIL_PREFIXES = [
  'sales', 'info', 'export', 'enquiry', 'inquiries', 'contact', 'procurement',
  'purchasing', 'rfq', 'quotes',
];
const BUYER_INTENT_PATTERN = /\b(importer|distributor|stockist|wholesaler|dealer|procurement|purchasing|buyer|sourcing|epc|contractor|industrial supplier|request (?:a )?quote|rfq)\b/i;
const LOW_VALUE_PAGE_PATTERN = /\b(job|career|vacancy|training|course|conference|exhibition|news|article|research paper|definition|what is)\b/i;

const REGION_COUNTRY_QIDS: Record<string, string[]> = {
  'Middle East': ['Q878', 'Q851', 'Q846', 'Q842', 'Q398', 'Q817', 'Q796', 'Q810', 'Q43', 'Q801'],
  'Southeast Asia': ['Q334', 'Q833', 'Q252', 'Q869', 'Q881', 'Q928', 'Q424', 'Q836', 'Q819', 'Q921'],
  'North America': ['Q30', 'Q16', 'Q96'],
  Europe: ['Q145', 'Q183', 'Q55', 'Q38', 'Q142', 'Q29', 'Q31', 'Q36', 'Q20', 'Q34', 'Q35', 'Q27'],
  Oceania: ['Q408', 'Q664'],
  Africa: ['Q258', 'Q1033', 'Q114', 'Q79', 'Q1028', 'Q117', 'Q924', 'Q916'],
  'South America': ['Q298', 'Q419', 'Q155', 'Q414', 'Q739', 'Q736'],
  'South Asia': ['Q668', 'Q843', 'Q902', 'Q854'],
  'East Asia': ['Q17', 'Q884', 'Q148', 'Q865'],
};

const INDUSTRY_QIDS: Array<{ pattern: RegExp; qids: string[] }> = [
  { pattern: /oil|gas|petroleum/i, qids: ['Q862571'] },
  { pattern: /petrochemical/i, qids: ['Q16070574'] },
  { pattern: /chemical/i, qids: ['Q207652'] },
  { pattern: /power|energy|electric/i, qids: ['Q2316331'] },
  { pattern: /water|wastewater/i, qids: ['Q1058719'] },
  { pattern: /ship|marine/i, qids: ['Q474200'] },
  { pattern: /construction|infrastructure/i, qids: ['Q13405640'] },
  { pattern: /mining|metallurgy/i, qids: ['Q1945600'] },
  { pattern: /food|beverage/i, qids: ['Q540912'] },
  { pattern: /pharmaceutical/i, qids: ['Q507443'] },
];

const DISCOVERY_BATCH_SIZE = 12;
const MULTI_SOURCE_CACHE_TTL = 60 * 60_000;
const MAX_DIRECTORY_RESULTS = 120;
const MAX_SITE_PAGES = 4;
const PRIORITY_PAGE_PATTERN = /contact|enquir|inquir|about|company|products?|solutions?|industr(?:y|ies)|markets?|dealer|distributor|stockist|procurement|purchasing|vendor|supplier|rfq|quote|联系我们|关于我们|产品|经销|采购/i;
const EXHIBITOR_PAGE_PATTERN = /exhibitor|exhibition|companies|company-list|brands|suppliers|directory|参展商|展商/i;
const GENERIC_DIRECTORY_LINK_PATTERN = /^(home|about|contact|privacy|terms|login|register|search|advertise|submit|more|next|previous|facebook|linkedin|youtube|instagram)$/i;

const INDUSTRY_DIRECTORY_SOURCES: PublicDirectorySource[] = [
  {
    name: 'Curlie 流体控制行业目录',
    url: 'https://www.curlie.org/en/Business/Industrial_Goods_and_Services/Fluid_Handling/Valves%2C_Hoses%2C_and_Fittings/',
    industry: 'Fluid handling, valves, pipes, fittings and flanges',
    match: /flange|valve|pipe|fitting|fluid|oil|gas|petrochemical|water|marine|industrial supplier/i,
  },
  {
    name: 'Curlie 石油天然气供应商目录',
    url: 'https://curlie.org/Business/Energy/Oil_and_Gas/Tools_and_Equipment/Supplies/',
    industry: 'Oil and gas equipment and supplies',
    match: /flange|valve|pipe|fitting|oil|gas|petroleum|petrochemical|drilling|pipeline|epc/i,
  },
  {
    name: 'Curlie 工业批发与分销目录',
    url: 'https://www.curlie.org/en/Business/Industrial_Goods_and_Services/Industrial_Supply/Wholesale_and_Distribution/',
    industry: 'Industrial wholesale and distribution',
    match: /industrial|supplier|distributor|wholesale|stockist|dealer|flange|valve|bearing|fastener|marine|mro/i,
  },
  {
    name: 'Curlie 工业设备目录',
    url: 'https://www.curlie.org/en/Business/Industrial_Goods_and_Services/Industrial_Supply/',
    industry: 'Industrial equipment and supplies',
    match: /industrial|equipment|machinery|engineering|manufacturing|power|chemical|water|mining|construction/i,
  },
  {
    name: 'Curlie 能源企业目录',
    url: 'https://curlie.org/en/Business/Energy/Directories',
    industry: 'Energy, power, oil and gas',
    match: /energy|power|electric|oil|gas|petroleum|petrochemical|pipeline/i,
  },
  {
    name: 'Curlie 工程企业目录',
    url: 'https://www.curlie.org/en/Business/Industrial_Goods_and_Services/Engineering/Directories',
    industry: 'Engineering, EPC and process industries',
    match: /engineering|epc|contractor|process|chemical|power|water|construction|infrastructure/i,
  },
];

const EXHIBITOR_DIRECTORY_SOURCES: PublicDirectorySource[] = [
  {
    name: 'Valve World Expo 公开展商目录',
    url: 'https://www.valveworldexpo.com/en/Exhibitors_Products/Exhibitor_index_A-Z',
    industry: 'Valves, flanges, pipes and flow control',
    match: /flange|valve|pipe|fitting|flow|oil|gas|petrochemical/i,
  },
  {
    name: 'ADIPEC 公开展商目录',
    url: 'https://www.adipec.com/exhibition/exhibitor-list/',
    industry: 'Oil, gas, petroleum and energy',
    match: /oil|gas|petroleum|petrochemical|energy|pipeline|epc|flange|valve/i,
  },
  {
    name: 'ACHEMA 公开展商目录',
    url: 'https://www.achema.de/en/the-achema/exhibitors-products',
    industry: 'Chemical, pharmaceutical and process industries',
    match: /chemical|pharma|process|industrial|valve|pump|flow|water/i,
  },
  {
    name: 'IFAT 公开展商目录',
    url: 'https://ifat.de/en/trade-fair/exhibitor-directory/',
    industry: 'Water treatment, wastewater and environmental technology',
    match: /water|wastewater|environment|pump|valve|pipe|treatment/i,
  },
  {
    name: 'Middle East Energy 公开展商目录',
    url: 'https://www.middleeast-energy.com/en/exhibit/exhibitor-list.html',
    industry: 'Power generation, electricity and energy',
    match: /power|energy|electric|generation|utility|epc/i,
  },
];

const ASSOCIATIONS: Record<string, { aliases: string[]; industries: string[] }> = {
  flange: {
    aliases: ['forged flanges', 'steel flanges', 'pipe flanges', 'ANSI flanges'],
    industries: ['Oil & Gas', 'Petrochemical', 'Pipeline', 'Marine & Shipbuilding', 'Power Generation', 'EPC'],
  },
  '法兰': {
    aliases: ['flange', 'forged flanges', 'steel flanges', 'pipe flanges'],
    industries: ['Oil & Gas', 'Petrochemical', 'Pipeline', 'Marine & Shipbuilding', 'Power Generation', 'EPC'],
  },
  valve: {
    aliases: ['industrial valves', 'process valves', 'control valves'],
    industries: ['Oil & Gas', 'Chemical Processing', 'Water Treatment', 'Power Generation', 'Marine'],
  },
  '阀门': {
    aliases: ['valves', 'industrial valves', 'process valves'],
    industries: ['Oil & Gas', 'Chemical Processing', 'Water Treatment', 'Power Generation', 'Marine'],
  },
  bearing: {
    aliases: ['industrial bearings', 'roller bearings', 'ball bearings'],
    industries: ['Industrial Machinery', 'Automotive', 'Mining', 'Steel Manufacturing', 'Maintenance'],
  },
};

@Injectable()
export class LeadSearchService {
  private readonly logger = new Logger(LeadSearchService.name);
  private lastPublicSearchAt = 0;
  private readonly multiSourceCache = new Map<string, { expiresAt: number; catalog: MultiSourceCatalog }>();
  private readonly robotsCache = new Map<string, {
    expiresAt: number;
    rules: Array<{ path: string; allow: boolean }>;
  }>();
  private commonCrawlIndexCache: { expiresAt: number; id: string } | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  async associateProduct(productName: string) {
    const canonicalName = productName.trim();
    const known = ASSOCIATIONS[canonicalName.toLowerCase()] || ASSOCIATIONS[canonicalName];
    const fallback = {
      productName: canonicalName,
      canonicalName,
      aliases: [...new Set([canonicalName, ...(known?.aliases || [])])],
      industries: known?.industries || [
        'Industrial Distribution', 'Manufacturing', 'Engineering & EPC',
        'Maintenance & Repair', 'Construction & Infrastructure',
      ],
      companyTypes: [
        'importer', 'distributor', 'wholesaler', 'stockist', 'dealer',
        'industrial supplier', 'OEM manufacturer', 'EPC contractor',
      ],
      source: known ? '行业知识库' : '通用行业规则',
      recommendedSegments: ['importer', 'distributor', 'stockist', 'industrial supplier'],
    };

    try {
      const profile = await this.settingsService.getAiCredentials();
      if (!profile?.enabled || !profile.apiKey) return fallback;
      const response = await this.fetchJson(`${String(profile.baseUrl || profile.endpoint || '').replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${profile.apiKey}` },
        body: JSON.stringify({
          model: profile.model || 'deepseek-chat',
          temperature: 0.2,
          messages: [{
            role: 'user',
            content: `Return JSON only. For B2B product ${JSON.stringify(canonicalName)}, identify purchasable English aliases, downstream buyer industries, and buyer company types. Schema: {"canonicalName":"","aliases":[],"industries":[],"companyTypes":[],"recommendedSegments":[]}. Do not invent companies or contacts.`,
          }],
        }),
      });
      const content = response?.choices?.[0]?.message?.content;
      const parsed = this.parseJsonObject(content);
      if (!parsed) return fallback;
      return {
        ...fallback,
        canonicalName: String(parsed.canonicalName || canonicalName),
        aliases: this.stringArray(parsed.aliases, fallback.aliases),
        industries: this.stringArray(parsed.industries, fallback.industries),
        companyTypes: this.stringArray(parsed.companyTypes, fallback.companyTypes),
        recommendedSegments: this.stringArray(parsed.recommendedSegments, fallback.recommendedSegments),
        source: 'AI 行业联想',
      };
    } catch (error) {
      this.logger.warn(`AI association fallback: ${this.errorMessage(error)}`);
      return { ...fallback, warning: 'AI 联想暂不可用，已改用内置行业规则' };
    }
  }

  async discover(
    query: string,
    productNames: string[],
    segments: string[],
    options: LeadDiscoveryOptions = {},
  ): Promise<LeadDiscoveryResult> {
    let results: SearchResult[] = [];
    let mode: LeadDiscoveryResult['mode'] = 'web-search';
    let sourceExhausted = false;
    let sources: string[] = [];
    let sourceErrors: string[] = [];

    const preferMultiSource = Boolean(options.preferMultiSourceCrawler || options.preferCatalogCrawler);
    if (!preferMultiSource) {
      try {
        results = await this.search(query);
      } catch (searchError) {
        this.logger.warn(`公开网页搜索不可用，切换到多来源企业目录爬虫：${this.errorMessage(searchError)}`);
        mode = 'multi-source-crawler';
      }
    } else {
      mode = 'multi-source-crawler';
    }

    if (mode === 'multi-source-crawler') {
      const catalog = await this.searchMultiSourceCompanyCatalog(
        options.regions || [],
        options.industries || [],
        productNames,
        segments,
      );
      const batch = Math.max(0, Number(options.sourceBatch ?? options.catalogBatch ?? 0));
      const offset = batch * DISCOVERY_BATCH_SIZE;
      results = catalog.results.slice(offset, offset + DISCOVERY_BATCH_SIZE);
      sources = catalog.sources;
      sourceErrors = catalog.errors;
      sourceExhausted = offset + DISCOVERY_BATCH_SIZE >= catalog.results.length;
    }

    const relevant = this.dedupeSearchResults(results)
      .filter((result) => mode === 'multi-source-crawler' || this.isRelevantResult(result, productNames, segments))
      .slice(0, DISCOVERY_BATCH_SIZE);
    const enriched = await this.mapWithConcurrency(relevant, 4, (result) => this.enrich(
      result, productNames, segments, options.industries || [],
    ));
    const candidates = enriched
      .flat()
      .filter((candidate) => candidate.fitScore >= 45);
    return {
      candidates,
      searched: results.length,
      crawled: relevant.length,
      mode,
      sourceExhausted,
      sources,
      sourceErrors,
    };
  }

  private async searchWikidataCatalog(regions: string[], industries: string[]): Promise<SearchResult[]> {
    const countryQids = [...new Set(regions.flatMap((region) => REGION_COUNTRY_QIDS[region] || []))];
    const industryQids = [...new Set(industries.flatMap((industry) =>
      INDUSTRY_QIDS.filter((entry) => entry.pattern.test(industry)).flatMap((entry) => entry.qids),
    ))];
    const countryClause = countryQids.length
      ? `VALUES ?country { ${countryQids.map((qid) => `wd:${qid}`).join(' ')} }`
      : '';
    const industryClause = industryQids.length
      ? `VALUES ?industry { ${industryQids.map((qid) => `wd:${qid}`).join(' ')} }`
      : '';
    const countryPattern = countryQids.length ? '(wdt:P17|wdt:P159/wdt:P17) ?country;' : '';
    const industryPattern = industryQids.length
      ? 'wdt:P452 ?companyIndustry. ?companyIndustry wdt:P279* ?industry.'
      : '';
    const query = `
      SELECT DISTINCT ?company ?companyLabel ?website ?countryLabel ?companyIndustryLabel WHERE {
        ${countryClause}
        ${industryClause}
        ?company ${countryPattern} wdt:P856 ?website.
        ${industryPattern}
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 300
    `;
    const url = new URL('https://query.wikidata.org/sparql');
    url.searchParams.set('format', 'json');
    url.searchParams.set('query', query);
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'HuayuanCRM/1.0 (public company discovery; https://crm.huayuanflange.com)',
      },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Wikidata 企业目录 HTTP ${response.status}`);
    let data: any;
    try { data = JSON.parse(body); } catch { throw new Error('Wikidata 企业目录返回了无法解析的数据'); }
    const results = this.dedupeSearchResults((data?.results?.bindings || []).map((binding: any) => ({
      title: String(binding.companyLabel?.value || binding.company?.value || '未识别公司'),
      url: String(binding.website?.value || ''),
      snippet: [binding.companyIndustryLabel?.value, binding.countryLabel?.value].filter(Boolean).join(' · '),
      sourceName: 'Wikidata 公开企业目录 + 官网爬虫',
      sourceKey: 'wikidata',
      catalogCountry: String(binding.countryLabel?.value || ''),
      catalogIndustry: String(binding.companyIndustryLabel?.value || ''),
    }))).filter((result) => this.isSafePublicUrl(result.url));
    return results;
  }

  private async searchMultiSourceCompanyCatalog(
    regions: string[],
    industries: string[],
    productNames: string[],
    segments: string[],
  ): Promise<MultiSourceCatalog> {
    const cacheKey = JSON.stringify({
      regions: [...regions].sort(),
      industries: [...industries].sort(),
      products: [...productNames].sort(),
      segments: [...segments].sort(),
    });
    const cached = this.multiSourceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.catalog;

    const providers = [
      {
        name: 'Wikidata 公开企业目录',
        load: () => this.searchWikidataCatalog(regions, industries),
      },
      {
        name: 'Curlie 公开行业目录',
        load: () => this.searchIndustryDirectories(productNames, industries, segments),
      },
      {
        name: '公开展商目录',
        load: () => this.searchExhibitorDirectories(productNames, industries, segments),
      },
      {
        name: 'Common Crawl 企业域名索引',
        load: () => this.searchCommonCrawlDomains(productNames, industries, segments),
      },
    ];
    const settled = await Promise.allSettled(providers.map((provider) => provider.load()));
    const groups: SearchResult[][] = [];
    const sources: string[] = [];
    const errors: string[] = [];
    settled.forEach((outcome, index) => {
      const provider = providers[index];
      if (outcome.status === 'fulfilled') {
        if (outcome.value.length) {
          groups.push(outcome.value);
          sources.push(provider.name);
        }
        return;
      }
      const message = this.errorMessage(outcome.reason);
      errors.push(`${provider.name}: ${message}`);
      this.logger.warn(`获客来源不可用，已跳过 ${provider.name}: ${message}`);
    });

    if (!groups.length && errors.length === providers.length) {
      throw new BadRequestException(`所有公开企业来源暂不可用：${errors.join('；')}`);
    }

    const catalog: MultiSourceCatalog = {
      results: this.dedupeSearchResults(this.interleaveResults(groups)),
      sources,
      errors,
    };
    this.multiSourceCache.set(cacheKey, {
      expiresAt: Date.now() + MULTI_SOURCE_CACHE_TTL,
      catalog,
    });
    return catalog;
  }

  private async searchIndustryDirectories(
    productNames: string[],
    industries: string[],
    segments: string[],
  ): Promise<SearchResult[]> {
    const selected = this.selectDirectorySources(
      INDUSTRY_DIRECTORY_SOURCES,
      productNames,
      industries,
      segments,
      3,
    );
    const settled = await Promise.allSettled(selected.map(async (source) => {
      const page = await this.fetchPage(source.url);
      if (!page.html) throw new Error(`HTTP ${page.status || 0}`);
      return this.extractExternalCompanyLinks(page.html, source.url, source, 'industry-directory');
    }));
    const results: SearchResult[] = [];
    let successfulPages = 0;
    settled.forEach((outcome) => {
      if (outcome.status === 'fulfilled') {
        successfulPages++;
        results.push(...outcome.value);
      }
    });
    if (!successfulPages && selected.length) throw new Error('公开行业目录页面暂时无法访问');
    return this.dedupeSearchResults(results).slice(0, MAX_DIRECTORY_RESULTS);
  }

  private async searchExhibitorDirectories(
    productNames: string[],
    industries: string[],
    segments: string[],
  ): Promise<SearchResult[]> {
    const selected = this.selectDirectorySources(
      EXHIBITOR_DIRECTORY_SOURCES,
      productNames,
      industries,
      segments,
      0,
    ).slice(0, 3);
    if (!selected.length) return [];
    const settled = await Promise.allSettled(selected.map(async (source) => {
      const first = await this.fetchPage(source.url);
      if (!first.html) throw new Error(`HTTP ${first.status || 0}`);
      const pageUrls = [
        source.url,
        ...this.extractInternalLinks(first.html, source.url, EXHIBITOR_PAGE_PATTERN).slice(0, 2),
      ];
      const pages = await Promise.all(pageUrls.map(async (url, index) =>
        index === 0 ? first : this.fetchPage(url)));
      return this.dedupeSearchResults(pages.flatMap((page, index) =>
        this.extractExternalCompanyLinks(page.html, pageUrls[index], source, 'exhibitor-directory')));
    }));
    const results: SearchResult[] = [];
    let successfulPages = 0;
    settled.forEach((outcome) => {
      if (outcome.status === 'fulfilled') {
        successfulPages++;
        results.push(...outcome.value);
      }
    });
    if (!successfulPages) throw new Error('公开展商目录页面暂时无法访问');
    return this.dedupeSearchResults(results).slice(0, MAX_DIRECTORY_RESULTS);
  }

  private async searchCommonCrawlDomains(
    productNames: string[],
    industries: string[],
    segments: string[],
  ): Promise<SearchResult[]> {
    // Common Crawl is used only as a bounded URL index for public company/directory pages.
    // Contact details are read from the companies' current public websites, not archived content.
    const selected = this.selectDirectorySources(
      EXHIBITOR_DIRECTORY_SOURCES,
      productNames,
      industries,
      segments,
      0,
    ).slice(0, 3);
    if (!selected.length) return [];
    const indexId = await this.getCommonCrawlIndexId();
    const capturedGroups = await Promise.allSettled(selected.map(async (source) => ({
      source,
      urls: await this.findCommonCrawlDirectoryPages(indexId, source.url),
    })));
    const captures = capturedGroups
      .filter((outcome): outcome is PromiseFulfilledResult<{ source: PublicDirectorySource; urls: string[] }> =>
        outcome.status === 'fulfilled')
      .flatMap((outcome) => outcome.value.urls.slice(0, 3).map((url) => ({ source: outcome.value.source, url })));
    if (!captures.length) return [];

    const pages = await Promise.allSettled(captures.map(async ({ source, url }) => ({
      source,
      url,
      page: await this.fetchPage(url),
    })));
    const results: SearchResult[] = [];
    for (const outcome of pages) {
      if (outcome.status !== 'fulfilled' || !outcome.value.page.html) continue;
      results.push(...this.extractExternalCompanyLinks(
        outcome.value.page.html,
        outcome.value.url,
        outcome.value.source,
        'common-crawl',
      ));
    }
    return this.dedupeSearchResults(results).slice(0, MAX_DIRECTORY_RESULTS);
  }

  private selectDirectorySources(
    sources: PublicDirectorySource[],
    productNames: string[],
    industries: string[],
    segments: string[],
    fallbackCount: number,
  ) {
    const context = [...productNames, ...industries, ...segments].join(' ');
    const matched = sources.filter((source) => source.match.test(context));
    return matched.length ? matched : sources.slice(0, fallbackCount);
  }

  private extractExternalCompanyLinks(
    html: string,
    pageUrl: string,
    source: PublicDirectorySource,
    sourceKey: 'industry-directory' | 'exhibitor-directory' | 'common-crawl',
  ): SearchResult[] {
    if (!html) return [];
    const pageHost = this.hostname(pageUrl);
    const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const results: SearchResult[] = [];
    for (let index = 0; index < anchors.length; index++) {
      const match = anchors[index];
      let resolved = '';
      try { resolved = new URL(this.decodeHtml(match[1]), pageUrl).toString(); } catch { continue; }
      if (!this.isSafePublicUrl(resolved)) continue;
      const host = this.hostname(resolved);
      if (!host || host === pageHost || BLOCKED_HOST_PARTS.some((part) => host.includes(part))) continue;
      const title = this.decodeHtml(match[2]).trim();
      if (!title || title.length > 180 || GENERIC_DIRECTORY_LINK_PATTERN.test(title)) continue;
      const nextIndex = anchors[index + 1]?.index ?? Math.min(html.length, (match.index || 0) + 900);
      const nearby = this.toText(html.slice((match.index || 0) + match[0].length, nextIndex)).slice(0, 420);
      results.push({
        title,
        url: new URL(resolved).origin,
        snippet: [source.industry, nearby].filter(Boolean).join(' · '),
        sourceName: sourceKey === 'common-crawl'
          ? `Common Crawl 企业域名索引（${source.name}）+ 官网爬虫`
          : `${source.name} + 官网爬虫`,
        sourceKey,
        directoryUrl: pageUrl,
        catalogIndustry: source.industry,
      });
    }
    return results;
  }

  private extractInternalLinks(html: string, pageUrl: string, pattern: RegExp) {
    const host = this.hostname(pageUrl);
    const links: string[] = [];
    for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      try {
        const resolved = new URL(this.decodeHtml(match[1]), pageUrl);
        if (this.hostname(resolved.toString()) !== host) continue;
        if (!pattern.test(`${resolved.pathname} ${this.decodeHtml(match[2])}`)) continue;
        if (!this.isSafePublicUrl(resolved.toString())) continue;
        links.push(resolved.toString());
      } catch {
        continue;
      }
    }
    return [...new Set(links)];
  }

  private async getCommonCrawlIndexId() {
    if (this.commonCrawlIndexCache && this.commonCrawlIndexCache.expiresAt > Date.now()) {
      return this.commonCrawlIndexCache.id;
    }
    const response = await fetch('https://index.commoncrawl.org/collinfo.json', {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HuayuanCRM/1.0 (bounded public company domain discovery; https://crm.huayuanflange.com)',
      },
    });
    if (!response.ok) throw new Error(`Common Crawl 索引列表 HTTP ${response.status}`);
    const collections = await response.json() as Array<{ id?: string }>;
    const id = String(collections?.[0]?.id || '');
    if (!id) throw new Error('Common Crawl 未返回可用索引');
    this.commonCrawlIndexCache = { expiresAt: Date.now() + 12 * 60 * 60_000, id };
    return id;
  }

  private async findCommonCrawlDirectoryPages(indexId: string, seedUrl: string) {
    const host = this.hostname(seedUrl);
    if (!host) return [];
    const url = new URL(`https://index.commoncrawl.org/${encodeURIComponent(indexId)}`);
    url.searchParams.set('url', `${host}/*`);
    url.searchParams.set('output', 'json');
    url.searchParams.append('filter', 'status:200');
    url.searchParams.append('filter', 'mime:text/html');
    url.searchParams.append('filter', 'url:.*(exhibitor|exhibition|company|companies|brand|supplier|directory).*');
    url.searchParams.set('collapse', 'urlkey');
    url.searchParams.set('limit', '30');
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/x-ndjson,text/plain',
        'User-Agent': 'HuayuanCRM/1.0 (bounded public company domain discovery; https://crm.huayuanflange.com)',
      },
    });
    if (!response.ok) throw new Error(`Common Crawl URL 索引 HTTP ${response.status}`);
    const body = await response.text();
    const results: string[] = [];
    for (const line of body.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        const capturedUrl = String(record.url || '');
        if (capturedUrl && this.isSafePublicUrl(capturedUrl) && this.hostname(capturedUrl) === host) {
          results.push(capturedUrl);
        }
      } catch {
        continue;
      }
    }
    return [...new Set(results)];
  }

  private interleaveResults(groups: SearchResult[][]) {
    const results: SearchResult[] = [];
    const maxLength = Math.max(0, ...groups.map((group) => group.length));
    for (let index = 0; index < maxLength; index++) {
      for (const group of groups) {
        if (group[index]) results.push(group[index]);
      }
    }
    return results;
  }

  private async search(query: string): Promise<SearchResult[]> {
    const profiles = (await this.settingsService.getSearchProfiles() as Array<Record<string, any>>)
      .filter((profile) => profile.apiKeySet);
    if (!profiles.length) {
      try {
        return await this.searchPublicWeb(query);
      } catch (error) {
        throw new BadRequestException(`公开搜索暂时不可用：${this.errorMessage(error)}`);
      }
    }

    const errors: string[] = [];
    for (const publicProfile of profiles) {
      try {
        const profile = await this.settingsService.getSearchProfileCredentials(publicProfile.id);
        const results = await this.searchWithProfile(profile, query);
        if (results.length) {
          return results.map((result) => ({
            ...result,
            sourceName: `${publicProfile.name || publicProfile.provider || '专业搜索 API'} + 企业官网`,
          }));
        }
      } catch (error) {
        errors.push(`${publicProfile.name || publicProfile.provider}: ${this.errorMessage(error)}`);
      }
    }
    try {
      const fallback = await this.searchPublicWeb(query);
      return fallback;
    } catch (publicError) {
      errors.push(`公开搜索: ${this.errorMessage(publicError)}`);
    }
    if (errors.length) {
      throw new BadRequestException(`专业及公开搜索源均不可用：${errors.join('；')}`);
    }
    return [];
  }

  private async searchPublicWeb(query: string): Promise<SearchResult[]> {
    const errors: string[] = [];
    for (const source of [
      () => this.searchDuckDuckGoHtml(query),
      () => this.searchDuckDuckGoLite(query),
    ]) {
      await this.throttlePublicSearch();
      try {
        const results = await source();
        if (results.length) return results;
      } catch (error) {
        errors.push(this.errorMessage(error));
      }
    }
    if (errors.length) throw new Error(errors.join('；'));
    return [];
  }

  private async searchDuckDuckGoHtml(query: string) {
    const url = new URL('https://html.duckduckgo.com/html/');
    url.searchParams.set('q', query);
    const response = await fetch(url.toString(), this.publicSearchRequestOptions());
    const html = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const results = this.parseDuckDuckGoResults(html);
    if (!results.length && /captcha|anomaly|automated|blocked/i.test(html)) {
      throw new Error('DuckDuckGo HTML 触发访问限制');
    }
    return results;
  }

  private async searchDuckDuckGoLite(query: string) {
    const url = new URL('https://lite.duckduckgo.com/lite/');
    url.searchParams.set('q', query);
    const response = await fetch(url.toString(), this.publicSearchRequestOptions());
    const html = await response.text();
    if (!response.ok) throw new Error(`DuckDuckGo Lite HTTP ${response.status}`);
    const results = this.parseDuckDuckGoLiteResults(html);
    if (!results.length && /captcha|anomaly|automated|blocked/i.test(html)) {
      throw new Error('DuckDuckGo Lite 触发访问限制');
    }
    return results;
  }

  private publicSearchRequestOptions(): RequestInit {
    return {
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HuayuanCRM/1.0; +https://crm.huayuanflange.com)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.8',
      },
    };
  }

  private parseDuckDuckGoResults(html: string): SearchResult[] {
    const blocks = String(html || '').split(/<div\s+class=["']result\s+results_links/gi).slice(1);
    const results: SearchResult[] = [];
    for (const block of blocks) {
      const titleMatch = block.match(/<a\b(?=[^>]*\bclass=["'][^"']*\bresult__a\b[^"']*["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleMatch) continue;
      const resolvedUrl = this.resolveDuckDuckGoUrl(titleMatch[1]);
      if (!resolvedUrl) continue;
      const snippetMatch = block.match(/<a\b[^>]*\bclass=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
      results.push({
        title: this.decodeHtml(titleMatch[2]),
        url: resolvedUrl,
        snippet: this.decodeHtml(snippetMatch?.[1] || ''),
        sourceName: 'DuckDuckGo 公开搜索 + 企业官网',
      });
      if (results.length >= 20) break;
    }
    return results;
  }

  private parseDuckDuckGoLiteResults(html: string): SearchResult[] {
    const blocks = String(html || '').split(/<a\b(?=[^>]*\bclass=["'][^"']*\bresult-link\b[^"']*["'])/gi).slice(1);
    const results: SearchResult[] = [];
    for (const block of blocks) {
      const hrefMatch = block.match(/\bhref=["']([^"']+)["']/i);
      const titleMatch = block.match(/^[^>]*>([\s\S]*?)<\/a>/i);
      if (!hrefMatch || !titleMatch) continue;
      const resolvedUrl = this.resolveDuckDuckGoUrl(hrefMatch[1]);
      if (!resolvedUrl) continue;
      const snippetMatch = block.match(/\bclass=["'][^"']*\bresult-snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
      results.push({
        title: this.decodeHtml(titleMatch[1]),
        url: resolvedUrl,
        snippet: this.decodeHtml(snippetMatch?.[1] || ''),
        sourceName: 'DuckDuckGo Lite 公开搜索 + 企业官网',
      });
      if (results.length >= 20) break;
    }
    return results;
  }

  private resolveDuckDuckGoUrl(value: string) {
    try {
      const decoded = this.decodeHtml(value);
      const redirect = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded, 'https://duckduckgo.com');
      const target = redirect.searchParams.get('uddg');
      const resolved = target ? new URL(target) : redirect;
      if (!['http:', 'https:'].includes(resolved.protocol) || resolved.hostname.endsWith('duckduckgo.com')) return '';
      return resolved.toString();
    } catch {
      return '';
    }
  }

  private async throttlePublicSearch() {
    const waitMs = Math.max(0, 1_500 - (Date.now() - this.lastPublicSearchAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.lastPublicSearchAt = Date.now();
  }

  private async searchWithProfile(profile: Record<string, any>, query: string): Promise<SearchResult[]> {
    const provider = String(profile.provider || '').toLowerCase();
    const apiUrl = String(profile.apiUrl || profile.endpoint || '').trim();
    if (provider === 'serper') {
      const url = apiUrl.includes('serper.dev') ? apiUrl : 'https://google.serper.dev/search';
      const data = await this.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': profile.apiKey },
        body: JSON.stringify({ q: query, num: 20 }),
      });
      return (data.organic || []).map((item: any) => ({ title: item.title || '', url: item.link || '', snippet: item.snippet || '' }));
    }
    if (provider === 'brave-search') {
      const url = new URL(apiUrl || 'https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', '20');
      const data = await this.fetchJson(url.toString(), { headers: { 'X-Subscription-Token': profile.apiKey, Accept: 'application/json' } });
      return (data.web?.results || []).map((item: any) => ({ title: item.title || '', url: item.url || '', snippet: item.description || '' }));
    }
    if (provider === 'serpapi') {
      const url = new URL(apiUrl || 'https://serpapi.com/search.json');
      url.searchParams.set('q', query);
      url.searchParams.set('api_key', profile.apiKey);
      url.searchParams.set('num', '20');
      const data = await this.fetchJson(url.toString());
      return (data.organic_results || []).map((item: any) => ({ title: item.title || '', url: item.link || '', snippet: item.snippet || '' }));
    }
    const url = new URL(apiUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('key', profile.apiKey);
    const data = await this.fetchJson(url.toString());
    const items = data.organic || data.results || data.web?.results || [];
    return items.map((item: any) => ({ title: item.title || '', url: item.link || item.url || '', snippet: item.snippet || item.description || '' }));
  }

  private async enrich(
    result: SearchResult,
    productNames: string[],
    segments: string[],
    industries: string[],
  ): Promise<SearchCandidate[]> {
    const pages = await this.crawlCompanySite(result.url);
    const homepage = pages[0] || { url: result.url, status: 0, html: '' };
    const pageEmails = pages.map((page) => ({ page, emails: this.extractEmails(page.html) }));
    const emails = [...new Set(pageEmails.flatMap((entry) => entry.emails))]
      .sort((a, b) => this.emailRank(a) - this.emailRank(b));
    const emailPage = pageEmails.find((entry) => entry.emails.some((email) => emails.includes(email)))?.page;
    const sourcePage = emailPage || pages.find((page) => page.html) || homepage;
    const phone = pages.map((page) => this.extractPhone(page.html)).find(Boolean) || '';
    const text = pages.map((page) => this.toText(page.html)).join(' ').slice(0, 100000);
    const company = this.companyName(result.title, result.url);
    const combinedText = `${result.title} ${result.snippet} ${text}`;
    const matchedProduct = productNames.find((term) => this.contains(combinedText, term)) || '';
    const matchedIndustry = result.catalogIndustry || industries.find((term) => this.contains(combinedText, term)) || '';
    const targetSegment = segments.find((term) => this.contains(combinedText, term)) ||
      this.segmentForCatalogIndustry(result.catalogIndustry || '', segments);
    const buyerIntent = BUYER_INTENT_PATTERN.test(combinedText);
    const lowValuePage = LOW_VALUE_PAGE_PATTERN.test(`${result.title} ${result.snippet}`);
    const sourceHost = this.hostname(result.url);
    const emailDomainMatch = emails.some((email) => this.domainsMatch(sourceHost, email.split('@')[1] || ''));
    const evidence = [
      matchedProduct && `官网或搜索摘要明确提及 ${matchedProduct}`,
      matchedIndustry && `公开企业目录或官网行业匹配：${matchedIndustry}`,
      targetSegment && `符合目标买家类型 ${targetSegment}`,
      buyerIntent && '存在采购、经销或工程承包意图词',
      homepage.status >= 200 && homepage.status < 400 && '企业官网可访问',
      pages.length > 1 && `已深度核验 ${pages.length} 个官网页面`,
      emailDomainMatch && '公开邮箱域名与企业官网一致',
    ].filter(Boolean) as string[];
    const gaps = [
      !targetSegment && '未明确识别目标买家类型',
      !emails.length && '未发现公开邮箱',
      !emailDomainMatch && emails.length > 0 && '公开邮箱域名与官网不一致，需复核',
      !homepage.html && '官网内容无法读取或被 robots.txt 禁止',
    ].filter(Boolean) as string[];
    let fitScore = 0;
    if (matchedProduct) fitScore += 35;
    if (matchedIndustry) fitScore += 25;
    if (targetSegment) fitScore += 25;
    if (buyerIntent) fitScore += 15;
    if (homepage.status >= 200 && homepage.status < 400) fitScore += 10;
    if (pages.length > 1) fitScore += 5;
    if (emails.length) fitScore += 5;
    if (emailDomainMatch) fitScore += 10;
    if (!targetSegment) fitScore -= 10;
    if (!homepage.html) fitScore -= 10;
    if (lowValuePage) fitScore -= 35;
    fitScore = Math.max(0, Math.min(100, fitScore));
    const confidence: SearchCandidate['confidence'] = fitScore >= 75 ? 'High' : fitScore >= 55 ? 'Medium' : 'Low';
    const base = {
      company,
      phone,
      website: this.origin(result.url),
      sourceUrl: sourcePage.url,
      sourceType: /contact|enquir|inquir|联系我们|聯絡/i.test(sourcePage.url) ? 'Contact Page' : 'Company Website',
      sourceName: result.sourceName || '专业搜索 API + 企业官网',
      sourceHttpStatus: sourcePage.status,
      business: result.snippet || text.slice(0, 500),
      matchedProductKeyword: matchedProduct,
      targetSegment,
      fitNote: [...evidence, ...gaps.map((gap) => `待核验：${gap}`)].join('；'),
      fitScore,
      confidence,
      evidence,
      gaps,
      rawData: {
        searchTitle: result.title,
        searchSnippet: result.snippet,
        discoverySource: result.sourceKey || 'web-search',
        directoryUrl: result.directoryUrl || '',
        crawledPages: pages.map((page) => page.url),
        catalogCountry: result.catalogCountry || '',
        catalogIndustry: result.catalogIndustry || '',
        evidence,
        gaps,
        fitScore,
      },
      country: result.catalogCountry || '',
    };
    if (!emails.length) return [{ ...base, email: '' }];
    return emails.slice(0, 3).map((email) => ({ ...base, email }));
  }

  private async crawlCompanySite(url: string) {
    const homepage = await this.fetchPage(url);
    if (!homepage.html) return [{ ...homepage, url }];
    const pageUrls = this.extractInternalLinks(homepage.html, url, PRIORITY_PAGE_PATTERN);
    const contactUrl = this.findContactUrl(homepage.html, url);
    if (contactUrl) pageUrls.unshift(contactUrl);
    const uniqueUrls = [...new Set(pageUrls)].filter((pageUrl) => pageUrl !== url);

    const currentPathIsContactPage = /contact|enquir|inquir|联系我们|聯絡/i.test(new URL(url).pathname);
    const homepageHasPublicContact = this.extractEmails(homepage.html).length > 0 || Boolean(this.extractPhone(homepage.html));
    if (uniqueUrls.length === 0 && !currentPathIsContactPage && !homepageHasPublicContact) {
      const sitemapUrls = await this.findSitemapPriorityUrls(this.origin(url));
      uniqueUrls.push(...sitemapUrls.filter((pageUrl) => !uniqueUrls.includes(pageUrl)));
    }

    const additional = await Promise.allSettled(
      uniqueUrls.slice(0, MAX_SITE_PAGES - 1).map(async (pageUrl) => ({
        pageUrl,
        response: await this.fetchPage(pageUrl),
      })),
    );
    return [
      { ...homepage, url },
      ...additional
        .filter((outcome): outcome is PromiseFulfilledResult<{
          pageUrl: string;
          response: { status: number; html: string };
        }> =>
          outcome.status === 'fulfilled')
        .map((outcome) => ({
          ...outcome.value.response,
          url: outcome.value.pageUrl,
        }))
        .filter((page) => page.html),
    ];
  }

  private async findSitemapPriorityUrls(origin: string) {
    if (!origin) return [];
    const sitemap = await this.fetchPage(`${origin}/sitemap.xml`);
    if (!sitemap.html) return [];
    const urls: string[] = [];
    for (const match of sitemap.html.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      const value = this.decodeHtml(match[1]);
      if (!PRIORITY_PAGE_PATTERN.test(value) || !this.isSafePublicUrl(value)) continue;
      if (this.hostname(value) !== this.hostname(origin)) continue;
      urls.push(value);
    }
    return [...new Set(urls)].slice(0, MAX_SITE_PAGES - 1);
  }

  private isRelevantResult(result: SearchResult, products: string[], segments: string[]) {
    if (!result.url) return false;
    let url: URL;
    try { url = new URL(result.url); } catch { return false; }
    const host = url.hostname.toLowerCase();
    const path = `${url.pathname}${url.search}`.toLowerCase();
    if (BLOCKED_HOST_PARTS.some((part) => host.includes(part))) return false;
    if (BLOCKED_PATH_PARTS.some((part) => path.includes(part))) return false;
    const haystack = `${result.title} ${result.snippet}`.toLowerCase();
    if (LOW_VALUE_PAGE_PATTERN.test(haystack)) return false;
    const productMatch = products.some((term) => this.contains(haystack, term));
    const buyerMatch = segments.some((term) => this.contains(haystack, term)) || BUYER_INTENT_PATTERN.test(haystack);
    return productMatch && buyerMatch;
  }

  private dedupeSearchResults(results: SearchResult[]) {
    const seen = new Set<string>();
    return results.filter((result) => {
      const key = this.hostname(result.url) || result.url.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async fetchPage(url: string) {
    try {
      let currentUrl = url;
      for (let redirectCount = 0; redirectCount < 4; redirectCount++) {
        if (!this.isSafePublicUrl(currentUrl)) return { status: 0, html: '' };
        if (!await this.robotsAllows(currentUrl)) return { status: 0, html: '' };
        const response = await fetch(currentUrl, {
          signal: AbortSignal.timeout(10_000),
          redirect: 'manual',
          headers: { 'User-Agent': 'HuayuanCRM/1.0 (+public business contact research)', Accept: 'text/html,application/xhtml+xml' },
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) return { status: response.status, html: '' };
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
        const contentType = response.headers.get('content-type') || '';
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > 2_000_000) return { status: response.status, html: '' };
        const readable = /text\/html|application\/xhtml\+xml|application\/xml|text\/xml/i.test(contentType) ||
          currentUrl.toLowerCase().endsWith('.xml');
        const html = readable ? (await response.text()).slice(0, 2_000_000) : '';
        return { status: response.status, html };
      }
      return { status: 0, html: '' };
    } catch {
      return { status: 0, html: '' };
    }
  }

  private async robotsAllows(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { return false; }
    if (url.hostname.endsWith('.example')) return true;
    const origin = url.origin;
    let cached = this.robotsCache.get(origin);
    if (!cached || cached.expiresAt <= Date.now()) {
      const rules: Array<{ path: string; allow: boolean }> = [];
      try {
        const robotsUrl = `${origin}/robots.txt`;
        if (!this.isSafePublicUrl(robotsUrl)) return false;
        const response = await fetch(robotsUrl, {
          signal: AbortSignal.timeout(6_000),
          redirect: 'manual',
          headers: {
            'User-Agent': 'HuayuanCRM/1.0 (+public business contact research)',
            Accept: 'text/plain',
          },
        });
        if (response.ok) {
          const parsed = this.parseRobotsRules((await response.text()).slice(0, 300_000));
          rules.push(...parsed);
        }
      } catch {
        // A missing or unavailable robots.txt does not prohibit public pages.
      }
      cached = { expiresAt: Date.now() + 12 * 60 * 60_000, rules };
      this.robotsCache.set(origin, cached);
    }
    const path = `${url.pathname}${url.search}` || '/';
    const matching = cached.rules
      .filter((rule) => this.robotsRuleMatches(path, rule.path))
      .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
    return matching.length ? matching[0].allow : true;
  }

  private parseRobotsRules(value: string) {
    const groups: Array<{
      agents: string[];
      rules: Array<{ path: string; allow: boolean }>;
    }> = [];
    let current = { agents: [] as string[], rules: [] as Array<{ path: string; allow: boolean }> };
    for (const rawLine of String(value || '').split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const field = line.slice(0, separator).trim().toLowerCase();
      const content = line.slice(separator + 1).trim();
      if (field === 'user-agent') {
        if (current.rules.length) {
          groups.push(current);
          current = { agents: [], rules: [] };
        }
        current.agents.push(content.toLowerCase());
      } else if ((field === 'allow' || field === 'disallow') && current.agents.length && content) {
        current.rules.push({ path: content, allow: field === 'allow' });
      }
    }
    if (current.agents.length || current.rules.length) groups.push(current);
    const specific = groups.filter((group) => group.agents.some((agent) => agent.includes('huayuancrm')));
    const applicable = specific.length
      ? specific
      : groups.filter((group) => group.agents.includes('*'));
    return applicable.flatMap((group) => group.rules);
  }

  private robotsRuleMatches(path: string, rule: string) {
    if (!rule) return false;
    const endAnchored = rule.endsWith('$');
    const normalized = endAnchored ? rule.slice(0, -1) : rule;
    const pattern = normalized
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try { return new RegExp(`^${pattern}${endAnchored ? '$' : ''}`).test(path); } catch { return path.startsWith(normalized); }
  }

  private findContactUrl(html: string, baseUrl: string) {
    const links = [...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    for (const match of links) {
      const href = match[1];
      const label = this.toText(match[2]);
      if (!/contact|enquiry|inquir|about us|联系我们|聯絡/i.test(`${href} ${label}`)) continue;
      try {
        const url = new URL(href, baseUrl);
        if (url.hostname === new URL(baseUrl).hostname) return url.toString();
      } catch {
        continue;
      }
    }
    return '';
  }

  private extractEmails(html: string) {
    const decoded = html
      .replace(/&#64;|\[at\]|\(at\)/gi, '@')
      .replace(/&#46;|\[dot\]|\(dot\)/gi, '.');
    const matches = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    const valid = [...new Set(matches.map((email) => email.toLowerCase()))]
      .filter((email) => !EXCLUDED_EMAIL_PREFIXES.includes(email.split('@')[0]))
      .filter((email) => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(email));
    return valid.sort((a, b) => this.emailRank(a) - this.emailRank(b));
  }

  private extractPhone(html: string) {
    const telLink = String(html || '').match(/href=["']tel:([^"']+)["']/i)?.[1] || '';
    let decoded = telLink;
    try { decoded = decodeURIComponent(telLink); } catch { /* keep the original public value */ }
    decoded = decoded.replace(/[^\d+()\-\s.]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\d{7,}/.test(decoded.replace(/\D/g, ''))) return decoded.slice(0, 100);
    const text = this.toText(html);
    const match = text.match(/(?:phone|tel|telephone|mobile|whatsapp|电话)\s*[:：]?\s*(\+?\d[\d()\-\s.]{6,}\d)/i);
    return String(match?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  private emailRank(email: string) {
    const prefix = email.split('@')[0];
    const preferred = PREFERRED_EMAIL_PREFIXES.indexOf(prefix);
    return preferred >= 0 ? preferred : 100;
  }

  private companyName(title: string, url: string) {
    const hostname = this.hostname(url);
    const brand = hostname.split('.')[0].replace(/[-_]+/g, ' ').trim();
    const generic = /^(home|contact(?: us)?|about(?: us)?|products?|welcome|official (?:site|website))$/i;
    const fragments = this.toText(title)
      .split(/\s+[|–—-]\s+/)
      .map((item) => item.trim())
      .filter((item) => item && item.length <= 160 && !generic.test(item));
    const comparableBrand = brand.toLowerCase().replace(/[^a-z0-9\p{L}]+/gu, '');
    const brandMatch = fragments.find((item) => {
      const comparableItem = item.toLowerCase().replace(/[^a-z0-9\p{L}]+/gu, '');
      return comparableBrand && (comparableItem.includes(comparableBrand) || comparableBrand.includes(comparableItem));
    });
    const cleaned = brandMatch || fragments[0];
    if (cleaned) return cleaned;
    try { return new URL(url).hostname.replace(/^www\./, '').split('.')[0]; } catch { return '未识别公司'; }
  }

  private segmentForCatalogIndustry(industry: string, segments: string[]) {
    const rules: Array<[RegExp, RegExp]> = [
      [/petroleum|oil|gas|petrochemical/i, /oil\s*&?\s*gas company|industrial supplier|epc contractor/i],
      [/electric power|energy/i, /power plant|energy company|epc contractor/i],
      [/shipbuilding|marine/i, /shipyard|marine company/i],
      [/construction/i, /construction|infrastructure contractor|epc contractor/i],
      [/chemical|mining|water/i, /industrial supplier|oem manufacturer|epc contractor/i],
    ];
    const rule = rules.find(([industryPattern]) => industryPattern.test(industry));
    return rule ? segments.find((segment) => rule[1].test(segment)) || '' : '';
  }

  private hostname(value: string) {
    try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  }

  private isSafePublicUrl(value: string) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return false;
      const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
      if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return false;
      const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (ipv4) {
        const parts = ipv4.slice(1).map(Number);
        if (parts.some((part) => part > 255)) return false;
        if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
          (parts[0] === 169 && parts[1] === 254) ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private domainsMatch(first: string, second: string) {
    const left = first.toLowerCase().replace(/^www\./, '');
    const right = second.toLowerCase().replace(/^www\./, '');
    return Boolean(left && right && (left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)));
  }

  private origin(url: string) {
    try { return new URL(url).origin; } catch { return url; }
  }

  private contains(text: string, term: string) {
    return Boolean(term) && text.toLowerCase().includes(term.toLowerCase());
  }

  private toText(value: string) {
    return String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHtml(value: string) {
    return this.toText(String(value || '')
      .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&apos;|&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>'));
  }

  private async fetchJson(url: string, init: RequestInit = {}) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 160)}`);
    return JSON.parse(body);
  }

  private parseJsonObject(value: unknown) {
    const text = String(value || '').replace(/^```(?:json)?|```$/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  }

  private stringArray(value: unknown, fallback: string[]) {
    if (!Array.isArray(value)) return fallback;
    const result = [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
    return result.length ? result.slice(0, 20) : fallback;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    if (!items.length) return [];
    const results = new Array<R>(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    });
    await Promise.all(runners);
    return results;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
