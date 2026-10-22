import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { OutreachPageKind, OutreachSource } from './outreach-types';

export interface ResearchLink { url: string; label: string; kind: OutreachPageKind }
export interface ResearchPage { url: string; text: string; title?: string; links?: ResearchLink[] }

// Keep IPv4/IPv6 lists separate: Node also compares mapped IPv4 addresses
// against IPv6 subnets, so blocking ::ffff:0:0/96 in a shared list blocks all IPv4.
const blocked4 = new BlockList(); const blocked6 = new BlockList();
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blocked6.addSubnet(network, prefix, 'ipv6');

export function isPublicResearchAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked4.check(address, 'ipv4') : family === 6 && globalV6.check(address, 'ipv6') && !blocked6.check(address, 'ipv6');
}

export function publicResearchUrl(raw: string) {
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)) throw new Error('仅支持公开官网的标准HTTP/HTTPS地址');
  url.hash = '';
  return url;
}

export function websiteText(html: string) {
  return html.replace(/<(script|style|noscript|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 24000);
}

const sameSite = (a: URL, b: URL) => a.hostname.toLowerCase().replace(/^www\./, '') === b.hostname.toLowerCase().replace(/^www\./, '');

export function researchLinks(html: string, base: string): ResearchLink[] {
  const origin = publicResearchUrl(base); const links: ResearchLink[] = []; const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[1]);
    if (!href) continue;
    try {
      const url = publicResearchUrl(new URL((href[1] || href[2] || href[3]).replace(/&amp;/gi, '&'), origin).href);
      if (!sameSite(origin, url) || url.search || /\.(?:pdf|zip|png|jpg|jpeg|svg|docx?|xlsx?)$/i.test(url.pathname)
        || /(?:^|\/)(?:login|logout|account|admin|wp-admin|cart|checkout|unsubscribe)(?:\/|$)/i.test(url.pathname)) continue;
      const label = websiteText(match[2]).slice(0, 160); const clue = `${url.pathname} ${label}`;
      const kind = /supplier|vendor|procurement|pre.?qualif|供应商|采购/i.test(clue) ? 'suppliers'
        : /about|who.?we.?are|company.profile|关于|公司简介/i.test(clue) ? 'about'
          : /product|catalog|flange|valve|产品/i.test(clue) ? 'products' : undefined;
      if (!kind || seen.has(url.href) || url.href === origin.href) continue;
      seen.add(url.href); links.push({ url: url.href, label, kind });
      if (links.length >= 40) break;
    } catch { /* Ignore malformed or non-public links. */ }
  }
  return links;
}

// Pin the checked DNS result to the socket. Every redirect is validated again.
// No credentials, cookies, JavaScript execution or arbitrary response-size buffering.
export async function readPublicWebsite(raw: string, redirects = 0, deadlineAt = Date.now() + 8000): Promise<ResearchPage> {
  if (Date.now() >= deadlineAt) throw new Error('官网读取超时');
  const url = publicResearchUrl(raw);
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('官网解析超时')), Math.max(1, Math.min(4000, deadlineAt - Date.now()))); timer.unref(); }),
  ]);
  if (!addresses.length || addresses.some(({ address }) => !isPublicResearchAddress(address))) throw new Error('官网地址不属于公开网络');
  const pinned = addresses[0];
  const result = await new Promise<{ html: string; redirect?: string }>((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET',
      family: pinned.family,
      headers: { 'User-Agent': 'HuayuanCRM/1.0 (company research)', Accept: 'text/html' },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) { res.resume(); resolve({ html: '', redirect: res.headers.location }); return; }
      if (res.statusCode !== 200 || !String(res.headers['content-type']).includes('text/html')) { res.resume(); reject(new Error('官网未返回可读取的HTML页面')); return; }
      let length = 0; const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { length += chunk.length; if (length > 300_000) { req.destroy(new Error('官网页面过大')); return; } chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
    });
    const deadline = setTimeout(() => req.destroy(new Error('官网读取超时')), Math.max(1, Math.min(6000, deadlineAt - Date.now())));
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end();
  });
  if (result.redirect) {
    if (redirects >= 3) throw new Error('官网重定向次数过多');
    const destination = new URL(result.redirect, url);
    if (!sameSite(destination, url)) throw new Error('官网跳转到不同站点，需人工核对');
    return readPublicWebsite(destination.href, redirects + 1, deadlineAt);
  }
  return { url: url.href, text: websiteText(result.html), title: websiteText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(result.html)?.[1] || '').slice(0, 160), links: researchLinks(result.html, url.href) };
}

export async function readCompanyWebsite(raw: string, reader: typeof readPublicWebsite = readPublicWebsite) {
  const deadlineAt = Date.now() + 10_000;
  const home = await reader(raw, 0, deadlineAt);
  const pages: OutreachSource[] = [{ url: home.url, text: home.text, title: home.title || '官网首页', kind: 'home' }];
  const notes: string[] = [];
  const candidates = (['suppliers', 'products', 'about'] as const).flatMap((kind) => {
    const link = home.links?.find((item) => item.kind === kind);
    return link ? [link] : [];
  });
  const results = await Promise.all(candidates.map(async (link) => {
    try {
      if (Date.now() >= deadlineAt) throw new Error('读取超时');
      // Also enforce boundaries for injected readers and any future link discovery.
      if (!sameSite(publicResearchUrl(home.url), publicResearchUrl(link.url))) throw new Error('跨站链接');
      const page = await reader(link.url, 0, deadlineAt);
      if (!sameSite(publicResearchUrl(home.url), publicResearchUrl(page.url))) throw new Error('跨站跳转');
      if (page.text.length < 80) throw new Error('正文不足');
      return { url: page.url, text: page.text, title: page.title || link.label, kind: link.kind };
    } catch { notes.push(`${link.label || link.kind}页面未完成读取，相关信息待核实`); return null; }
  }));
  for (const page of results) if (page && !pages.some((existing) => existing.url === page.url)) pages.push(page);
  if (!pages.some((page) => page.kind === 'suppliers')) notes.push('未核实供应商准入要求，不代表该企业没有准入渠道');
  return { pages, notes };
}
