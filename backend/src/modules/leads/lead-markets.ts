export type MarketMode = 'global' | 'regions' | 'countries';
export const MARKET_REGIONS = ['Middle East', 'Southeast Asia', 'North America', 'Europe', 'Oceania', 'Africa', 'South America', 'South Asia', 'East Asia'];
const OTHER_COUNTRIES = ['Norway', 'Sweden', 'Denmark', 'Ireland', 'Belgium', 'Poland', 'Bahrain', 'Iraq', 'Jordan', 'Israel', 'Cambodia', 'Myanmar', 'Laos', 'Brunei', 'Nigeria', 'Kenya', 'Morocco', 'Ghana', 'Tanzania', 'Angola', 'Peru', 'Argentina', 'Colombia', 'Ecuador', 'Sri Lanka', 'Taiwan'];
const aliases: Record<string, string> = {
  global: 'Global', 全球: 'Global', 中东: 'Middle East', 东南亚: 'Southeast Asia', 北美: 'North America', 欧洲: 'Europe', 大洋洲: 'Oceania', 非洲: 'Africa', 南美: 'South America', 南亚: 'South Asia', 东亚: 'East Asia',
  usa: 'United States', us: 'United States', 'united states of america': 'United States', 美国: 'United States',
  uk: 'United Kingdom', gb: 'United Kingdom', 英国: 'United Kingdom', uae: 'United Arab Emirates', ae: 'United Arab Emirates', 阿联酋: 'United Arab Emirates',
  de: 'Germany', 德国: 'Germany', fr: 'France', 法国: 'France', it: 'Italy', 意大利: 'Italy', es: 'Spain', 西班牙: 'Spain', nl: 'Netherlands', 荷兰: 'Netherlands',
  sa: 'Saudi Arabia', 沙特: 'Saudi Arabia', 沙特阿拉伯: 'Saudi Arabia', qa: 'Qatar', 卡塔尔: 'Qatar', om: 'Oman', 阿曼: 'Oman', kw: 'Kuwait', 科威特: 'Kuwait',
  sg: 'Singapore', 新加坡: 'Singapore', my: 'Malaysia', 马来西亚: 'Malaysia', id: 'Indonesia', 印尼: 'Indonesia', 印度尼西亚: 'Indonesia', th: 'Thailand', 泰国: 'Thailand', vn: 'Vietnam', 越南: 'Vietnam', ph: 'Philippines', 菲律宾: 'Philippines',
  ca: 'Canada', 加拿大: 'Canada', mx: 'Mexico', 墨西哥: 'Mexico', au: 'Australia', 澳大利亚: 'Australia', nz: 'New Zealand', 新西兰: 'New Zealand',
  in: 'India', 印度: 'India', pk: 'Pakistan', 巴基斯坦: 'Pakistan', bd: 'Bangladesh', 孟加拉国: 'Bangladesh', cn: 'China', 中国: 'China', jp: 'Japan', 日本: 'Japan', kr: 'South Korea', 韩国: 'South Korea',
  br: 'Brazil', 巴西: 'Brazil', cl: 'Chile', 智利: 'Chile', za: 'South Africa', 南非: 'South Africa', eg: 'Egypt', 埃及: 'Egypt', tr: 'Turkey', 土耳其: 'Turkey',
};
export function normalizeMarket(value: string): string {
  const text = String(value).trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  return aliases[lower] || MARKET_REGIONS.find((region) => region.toLowerCase() === lower) ||
    [...Object.values(aliases), ...OTHER_COUNTRIES].find((country) => country.toLowerCase() === lower) || text;
}
export function uniqueMarkets(values: string[] = []) {
  const result = new Map<string, string>();
  for (const value of values) { const name = normalizeMarket(value); if (name) result.set(name.toLowerCase(), name); }
  return [...result.values()];
}
export function taskMarkets(task: { agentState?: Record<string, any>; targetRegions?: string[]; targetRegion?: string }) {
  const countries = uniqueMarkets(task.agentState?.targetCountries || []);
  if (task.agentState?.marketMode === 'global') return ['Global'];
  if (countries.length && task.agentState?.marketMode !== 'regions') return countries;
  const regions = uniqueMarkets(task.targetRegions?.length ? task.targetRegions : [task.targetRegion || 'Global']);
  return regions.includes('Global') ? ['Global'] : regions.length ? regions : ['Global'];
}
