import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

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
  return html.replace(/<(script|style|noscript|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 24000);
}

// Pin the checked DNS result to the socket. Every redirect is validated again.
// No credentials, cookies, JavaScript execution or arbitrary response-size buffering.
export async function readPublicWebsite(raw: string, redirects = 0, deadlineAt = Date.now() + 8000): Promise<{ url: string; text: string }> {
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
    if (destination.hostname.replace(/^www\./, '') !== url.hostname.replace(/^www\./, '')) throw new Error('官网跳转到不同站点，需人工核对');
    return readPublicWebsite(destination.href, redirects + 1, deadlineAt);
  }
  return { url: url.href, text: websiteText(result.html) };
}
