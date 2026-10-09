// Sales-market grouping, not political or administrative boundaries. Keep aliases
// here so old imported country spellings remain searchable without a data rewrite.
export const CUSTOMER_MARKETS = [
  { name: '东南亚', countries: [
    { name: 'Thailand', label: '泰国', aliases: ['泰国'], timezone: 'Asia/Bangkok' },
    { name: 'Vietnam', label: '越南', aliases: ['越南'], timezone: 'Asia/Ho_Chi_Minh' },
    { name: 'Malaysia', label: '马来西亚', aliases: ['马来西亚'], timezone: 'Asia/Kuala_Lumpur' },
    { name: 'Singapore', label: '新加坡', aliases: ['新加坡'], timezone: 'Asia/Singapore' },
    { name: 'Indonesia', label: '印度尼西亚', aliases: ['印尼', '印度尼西亚'], timezone: '' },
    { name: 'Philippines', label: '菲律宾', aliases: ['菲律宾'], timezone: 'Asia/Manila' },
    { name: 'Cambodia', label: '柬埔寨', aliases: ['柬埔寨'], timezone: 'Asia/Phnom_Penh' },
    { name: 'Myanmar', label: '缅甸', aliases: ['缅甸'], timezone: 'Asia/Yangon' },
  ] },
  { name: '南亚', countries: [
    { name: 'India', label: '印度', aliases: ['印度'], timezone: 'Asia/Kolkata' },
    { name: 'Pakistan', label: '巴基斯坦', aliases: ['巴基斯坦'], timezone: 'Asia/Karachi' },
    { name: 'Bangladesh', label: '孟加拉国', aliases: ['孟加拉', '孟加拉国'], timezone: 'Asia/Dhaka' },
    { name: 'Sri Lanka', label: '斯里兰卡', aliases: ['斯里兰卡'], timezone: 'Asia/Colombo' },
  ] },
  { name: '中东', countries: [
    { name: 'United Arab Emirates', label: '阿联酋', aliases: ['UAE', '阿联酋'], timezone: 'Asia/Dubai' },
    { name: 'Saudi Arabia', label: '沙特阿拉伯', aliases: ['沙特', '沙特阿拉伯'], timezone: 'Asia/Riyadh' },
    { name: 'Qatar', label: '卡塔尔', aliases: ['卡塔尔'], timezone: 'Asia/Qatar' },
    { name: 'Oman', label: '阿曼', aliases: ['阿曼'], timezone: 'Asia/Muscat' },
    { name: 'Kuwait', label: '科威特', aliases: ['科威特'], timezone: 'Asia/Kuwait' },
    { name: 'Bahrain', label: '巴林', aliases: ['巴林'], timezone: 'Asia/Bahrain' },
    { name: 'Turkey', label: '土耳其', aliases: ['Türkiye', '土耳其'], timezone: 'Europe/Istanbul' },
  ] },
  { name: '欧洲', countries: [
    { name: 'United Kingdom', label: '英国', aliases: ['UK', 'Great Britain', '英国'], timezone: 'Europe/London' },
    { name: 'Germany', label: '德国', aliases: ['德国'], timezone: 'Europe/Berlin' },
    { name: 'France', label: '法国', aliases: ['法国'], timezone: 'Europe/Paris' },
    { name: 'Italy', label: '意大利', aliases: ['意大利'], timezone: 'Europe/Rome' },
    { name: 'Spain', label: '西班牙', aliases: ['西班牙'], timezone: '' },
    { name: 'Netherlands', label: '荷兰', aliases: ['荷兰'], timezone: 'Europe/Amsterdam' },
    { name: 'Poland', label: '波兰', aliases: ['波兰'], timezone: 'Europe/Warsaw' },
  ] },
  { name: '北美', countries: [
    { name: 'United States', label: '美国', aliases: ['USA', 'US', '美国'], timezone: '' },
    { name: 'Canada', label: '加拿大', aliases: ['加拿大'], timezone: '' },
    { name: 'Mexico', label: '墨西哥', aliases: ['墨西哥'], timezone: '' },
  ] },
  { name: '南美', countries: [
    { name: 'Brazil', label: '巴西', aliases: ['巴西'], timezone: '' },
    { name: 'Argentina', label: '阿根廷', aliases: ['阿根廷'], timezone: '' },
    { name: 'Chile', label: '智利', aliases: ['智利'], timezone: '' },
    { name: 'Colombia', label: '哥伦比亚', aliases: ['哥伦比亚'], timezone: 'America/Bogota' },
  ] },
  { name: '非洲', countries: [
    { name: 'South Africa', label: '南非', aliases: ['南非'], timezone: 'Africa/Johannesburg' },
    { name: 'Nigeria', label: '尼日利亚', aliases: ['尼日利亚'], timezone: 'Africa/Lagos' },
    { name: 'Egypt', label: '埃及', aliases: ['埃及'], timezone: 'Africa/Cairo' },
    { name: 'Kenya', label: '肯尼亚', aliases: ['肯尼亚'], timezone: 'Africa/Nairobi' },
  ] },
  { name: '大洋洲', countries: [
    { name: 'Australia', label: '澳大利亚', aliases: ['澳洲', '澳大利亚'], timezone: '' },
    { name: 'New Zealand', label: '新西兰', aliases: ['新西兰'], timezone: '' },
  ] },
  { name: '东亚', countries: [
    { name: 'China', label: '中国', aliases: ['中国', 'PRC'], timezone: 'Asia/Shanghai' },
    { name: 'Japan', label: '日本', aliases: ['日本'], timezone: 'Asia/Tokyo' },
    { name: 'South Korea', label: '韩国', aliases: ['Korea', '韩国'], timezone: 'Asia/Seoul' },
  ] },
] as const;

export function findCustomerCountry(value?: string | null) {
  const normalized = (part: string) => part.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
  const key = normalized(String(value || ''));
  if (!key) return undefined;
  for (const market of CUSTOMER_MARKETS) {
    for (const country of market.countries) {
      if ([country.name, country.label, ...country.aliases].some((alias) => normalized(alias) === key))
        return { ...country, market: market.name };
    }
  }
  return undefined;
}
