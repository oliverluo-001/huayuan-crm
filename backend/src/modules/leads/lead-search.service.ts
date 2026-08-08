import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface SearchCandidate {
  company: string;
  email: string;
  website: string;
  sourceUrl: string;
  sourceType: string;
  sourceName: string;
  sourceHttpStatus: number;
  business: string;
  matchedProductKeyword: string;
  targetSegment: string;
  fitNote: string;
  rawData: Record<string, unknown>;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const BLOCKED_HOST_PARTS = [
  'wikipedia.org', 'youtube.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'pinterest.', 'reddit.com', 'quora.com', 'amazon.', 'alibaba.com', 'made-in-china.com',
  'researchgate.net', 'sciencedirect.com', 'springer.com', 'iso.org', 'gov.',
];
const BLOCKED_PATH_PARTS = ['/news/', '/article/', '/blog/', '/wiki/', '/search?', '/video/'];
const EXCLUDED_EMAIL_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'abuse', 'postmaster', 'hostmaster'];
const PREFERRED_EMAIL_PREFIXES = [
  'sales', 'info', 'export', 'enquiry', 'inquiries', 'contact', 'procurement',
  'purchasing', 'rfq', 'quotes',
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

  async discover(query: string, productNames: string[], segments: string[]): Promise<{ candidates: SearchCandidate[]; searched: number; crawled: number }> {
    const results = await this.search(query);
    const relevant = results.filter((result) => this.isRelevantResult(result, productNames, segments)).slice(0, 8);
    const candidates = (await Promise.all(relevant.map((result) => this.enrich(result, productNames, segments))))
      .flat()
      .filter(Boolean);
    return { candidates, searched: results.length, crawled: relevant.length };
  }

  private async search(query: string): Promise<SearchResult[]> {
    const profiles = (await this.settingsService.getSearchProfiles() as Array<Record<string, any>>)
      .filter((profile) => profile.apiKeySet);
    if (!profiles.length) throw new BadRequestException('请先在设置中配置一个可用的搜索 API');

    const errors: string[] = [];
    for (const publicProfile of profiles) {
      try {
        const profile = await this.settingsService.getSearchProfileCredentials(publicProfile.id);
        const results = await this.searchWithProfile(profile, query);
        if (results.length) return results;
      } catch (error) {
        errors.push(`${publicProfile.name || publicProfile.provider}: ${this.errorMessage(error)}`);
      }
    }
    if (errors.length === profiles.length) {
      throw new BadRequestException(`搜索数据源均不可用：${errors.join('；')}`);
    }
    return [];
  }

  private async searchWithProfile(profile: Record<string, any>, query: string): Promise<SearchResult[]> {
    const provider = String(profile.provider || '').toLowerCase();
    const apiUrl = String(profile.apiUrl || profile.endpoint || '').trim();
    if (provider === 'serper') {
      const url = apiUrl.includes('serper.dev') ? apiUrl : 'https://google.serper.dev/search';
      const data = await this.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': profile.apiKey },
        body: JSON.stringify({ q: query, num: 10 }),
      });
      return (data.organic || []).map((item: any) => ({ title: item.title || '', url: item.link || '', snippet: item.snippet || '' }));
    }
    if (provider === 'brave-search') {
      const url = new URL(apiUrl || 'https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', '10');
      const data = await this.fetchJson(url.toString(), { headers: { 'X-Subscription-Token': profile.apiKey, Accept: 'application/json' } });
      return (data.web?.results || []).map((item: any) => ({ title: item.title || '', url: item.url || '', snippet: item.description || '' }));
    }
    if (provider === 'serpapi') {
      const url = new URL(apiUrl || 'https://serpapi.com/search.json');
      url.searchParams.set('q', query);
      url.searchParams.set('api_key', profile.apiKey);
      url.searchParams.set('num', '10');
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

  private async enrich(result: SearchResult, productNames: string[], segments: string[]): Promise<SearchCandidate[]> {
    let pageUrl = result.url;
    let response = await this.fetchPage(pageUrl);
    let html = response.html;
    let emails = this.extractEmails(html);
    if (!emails.length) {
      const contactUrl = this.findContactUrl(html, result.url);
      if (contactUrl && contactUrl !== result.url) {
        const contactResponse = await this.fetchPage(contactUrl);
        const contactEmails = this.extractEmails(contactResponse.html);
        if (contactEmails.length) {
          pageUrl = contactUrl;
          response = contactResponse;
          html = contactResponse.html;
          emails = contactEmails;
        }
      }
    }
    const text = this.toText(html).slice(0, 30000);
    const company = this.companyName(result.title, result.url);
    const matchedProduct = productNames.find((term) => this.contains(text, term)) || productNames[0] || '';
    const targetSegment = segments.find((term) => this.contains(`${result.title} ${result.snippet} ${text}`, term)) || '';
    const base = {
      company,
      website: this.origin(result.url),
      sourceUrl: pageUrl,
      sourceType: pageUrl.toLowerCase().includes('contact') ? 'Contact Page' : 'Company Website',
      sourceName: 'Search API + public website',
      sourceHttpStatus: response.status,
      business: result.snippet || text.slice(0, 500),
      matchedProductKeyword: matchedProduct,
      targetSegment,
      fitNote: [matchedProduct && `产品匹配：${matchedProduct}`, targetSegment && `客户类型：${targetSegment}`].filter(Boolean).join('；'),
      rawData: { searchTitle: result.title, searchSnippet: result.snippet },
    };
    if (!emails.length) return [{ ...base, email: '' }];
    return emails.slice(0, 3).map((email) => ({ ...base, email }));
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
    const productMatch = products.some((term) => this.contains(haystack, term));
    const buyerMatch = segments.some((term) => this.contains(haystack, term)) ||
      /supplier|distributor|stockist|importer|manufacturer|contractor|industrial|company|trading/i.test(haystack);
    return productMatch && buyerMatch;
  }

  private async fetchPage(url: string) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        redirect: 'follow',
        headers: { 'User-Agent': 'HuayuanCRM/1.0 (+public business contact research)', Accept: 'text/html,application/xhtml+xml' },
      });
      const contentType = response.headers.get('content-type') || '';
      const html = contentType.includes('text/html') ? await response.text() : '';
      return { status: response.status, html };
    } catch {
      return { status: 0, html: '' };
    }
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

  private emailRank(email: string) {
    const prefix = email.split('@')[0];
    const preferred = PREFERRED_EMAIL_PREFIXES.indexOf(prefix);
    return preferred >= 0 ? preferred : 100;
  }

  private companyName(title: string, url: string) {
    const cleaned = this.toText(title).split(/\s+[|–—-]\s+/)[0].trim();
    if (cleaned && cleaned.length <= 160) return cleaned;
    try { return new URL(url).hostname.replace(/^www\./, '').split('.')[0]; } catch { return '未识别公司'; }
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

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
