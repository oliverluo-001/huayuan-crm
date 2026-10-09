const FIELDS = {
  company: ['company', 'company name', 'customer company', 'companyname', 'customer name', '企业名称', '公司', '公司名称', '客户名称', '客户公司', '企业名'],
  contact: ['contact', 'contact name', 'contact person', 'person name', '联系人', '联系人姓名', '姓名'],
  email: ['email', 'e-mail', 'email address', 'mail', '邮箱', '电子邮箱', '电子邮件', '邮件地址'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', '联系电话', '手机号', '手机', '电话'],
  website: ['website', 'web site', 'company website', 'url', '官网', '网站', '网址', '公司网站'],
  region: ['region', 'city', 'state', 'province', 'state/province', '城市', '州', '省', '省份', '地区'],
  country: ['country', 'country/region', 'country or region', 'country name', 'nation', '国家', '国家/地区', '所在国家'],
  address: ['address', 'street address', 'company address', '详细地址', '公司地址', '地址'],
  business: ['business', 'industry', 'main business', '主营业务', '行业', '业务'],
  product: ['product', 'main product', 'products', '主营产品', '产品'],
  customerType: ['customertype', 'customer type', 'company type', '公司类型', '客户类型'],
  mainMarkets: ['mainmarkets', 'main markets', 'primary markets', '主要市场'],
  annualPurchaseAmount: ['annualpurchaseamount', 'annual purchase amount', 'annual spend', '年采购金额', '年采购规模'],
  preferredCurrency: ['preferredcurrency', 'preferred currency', 'currency', '首选币种', '币种'],
  preferredIncoterm: ['preferredincoterm', 'preferred incoterm', 'incoterms', '贸易条款', '首选贸易条款'],
  timezone: ['timezone', 'time zone', 'iana timezone', '时区', '客户时区'],
  notes: ['notes', 'note', 'remark', 'remarks', '备注', '说明'],
  source: ['source', 'customer source', 'lead source', '来源', '客户来源'],
} as const;

const LABELS: Record<keyof typeof FIELDS, string> = {
  company: '公司名称', contact: '联系人', email: '邮箱', phone: '电话', website: '网站',
  region: '城市 / 州', country: '国家 / 地区', address: '详细地址', business: '主营业务',
  product: '产品', customerType: '公司类型', mainMarkets: '主要市场',
  annualPurchaseAmount: '年采购金额', preferredCurrency: '首选币种',
  preferredIncoterm: '贸易条款', timezone: '时区', notes: '备注', source: '客户来源',
};

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
const distanceAtMostOne = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (a.length <= b.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

export function mapCustomerImportColumns(columns: string[]) {
  const mapped: Record<string, string> = {};
  const columnMappings: Array<{ column: string; field: string; fieldLabel: string }> = [];
  const unmappedColumns: string[] = [];
  for (const column of columns) {
    const key = normalize(column);
    const matches = (Object.entries(FIELDS) as Array<[keyof typeof FIELDS, readonly string[]]>).map(([field, aliases]) => {
      const score = aliases.some((alias) => normalize(alias) === key) ? 2
        : key.length >= 6 && aliases.some((alias) => normalize(alias).length >= 6 && distanceAtMostOne(key, normalize(alias))) ? 1 : 0;
      return { field, score };
    });
    const best = Math.max(...matches.map((item) => item.score));
    const winners = matches.filter((item) => item.score === best);
    if (!best || winners.length !== 1 || mapped[winners[0].field]) { unmappedColumns.push(column); continue; }
    const field = winners[0].field;
    mapped[field] = column;
    columnMappings.push({ column, field, fieldLabel: LABELS[field] });
  }
  return { mapped, columnMappings, unmappedColumns };
}
