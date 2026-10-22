import { OutreachInsight, OutreachSegment, OutreachSource } from './outreach-types';

const sectors: Array<{ segment: OutreachSegment; pattern: RegExp; description: string }> = [
  { segment: 'valves', pattern: /\bcontrol valves?\b|\bvalves?\b|flow control|阀门/gi, description: 'valve products' },
  { segment: 'piping', pattern: /\bflanges?\b|pipe fittings|piping (?:products|material|solutions)|法兰|管件/gi, description: 'piping products' },
  { segment: 'water', pattern: /water treatment|desalination|wastewater|水处理|海水淡化/gi, description: 'water-treatment solutions' },
  { segment: 'projects', pattern: /\bepc\b|fabrication|pressure vessels?|construction|工程|制造/gi, description: 'engineering and fabrication projects' },
];
const roles: Array<[OutreachInsight['role'], RegExp, string]> = [
  ['manufacturer', /\b(?:manufacturers?\s+of|speciali[sz]\w*\b.{0,110}\bmanufactur\w*|we\s+(?:design\s+and\s+)?(?:manufacture|produce)|our\s+(?:manufacturing|factory)|manufacturing\s+(?:facilit(?:y|ies)|company))\b|生产制造|生产厂家|制造商/i, '制造业务'],
  ['distributor', /\b(?:distributors?|stockists?|wholesalers?|trading company|distribution of)\b|经销商|库存商|分销商/i, '经销／库存业务'],
  ['contractor', /\b(?:epc contractor|engineering.{0,40}construction|contracting company|construction company)\b|工程承包|工程总包/i, '工程承包业务'],
  ['end_user', /\b(?:we operate|operator of|owns? and operates?).{0,90}(?:plant|refiner|water|utilit)\w*|运营水厂|运营炼油/i, '设施运营业务'],
];

export function excerptAt(text: string, pattern: RegExp) {
  const match = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(text);
  const start = Math.max(0, (match?.index || 0) - 65);
  return text.slice(start, start + 340).trim();
}

export function analyzeOutreachSources(pages: OutreachSource[], business: string, notes: string[] = []) {
  const sources = pages.filter((page) => page.text.length >= 80);
  const overview = [...sources.filter((page) => page.kind === 'about'), ...sources.filter((page) => page.kind === 'home')];
  let role: OutreachInsight['role'] = 'unknown'; let roleBasis: OutreachInsight['roleBasis'] = 'unknown';
  const facts: OutreachInsight['facts'] = [];
  for (const page of overview) {
    const found = roles.find(([, pattern]) => pattern.test(page.text));
    if (found) { role = found[0]; roleBasis = 'website'; facts.push({ label: found[2], excerpt: excerptAt(page.text, found[1]), url: page.url }); break; }
  }
  if (role === 'unknown') {
    const found = roles.find(([, pattern]) => pattern.test(business));
    if (found) { role = found[0]; roleBasis = 'crm'; }
  }
  const scores = sectors.map((sector) => ({ ...sector, score: sources.filter((page) => page.kind !== 'suppliers').reduce((sum, page) => sum + Math.min(4, [...page.text.matchAll(new RegExp(sector.pattern))].length) * (page.kind === 'products' ? 3 : page.kind === 'about' ? 2 : 1), 0) })).sort((a, b) => b.score - a.score);
  const sector = scores[0].score > 0 ? scores[0] : undefined;
  const crmSector = sectors.find((item) => new RegExp(item.pattern.source, 'i').test(business));
  const segment = sector?.segment || crmSector?.segment || 'unknown';
  const productPage = sector && sources.find((page) => page.kind !== 'suppliers' && new RegExp(sector.pattern.source, 'i').test(page.text));
  if (productPage && sector) facts.push({ label: '官网业务／产品', excerpt: excerptAt(productPage.text, sector.pattern), url: productPage.url });
  const supplier = sources.find((page) => page.kind === 'suppliers' && /new supplier|supplier registration|vendor registration|supplier qualification|potential suppliers|procurement representative|供应商注册|供应商准入/i.test(page.text));
  const category = supplier && /scope of supply|supply categories|supplier categories|commodity categories|供货范围|供应类别/i.exec(supplier.text);
  const flangeCategory = Boolean(supplier && category && /\bflanges?\b|法兰/i.test(supplier.text.slice(category.index, category.index + 2200)));
  if (supplier) facts.push({ label: flangeCategory ? '供应商供货类别包含法兰' : '公开供应商准入入口', excerpt: excerptAt(supplier.text, flangeCategory ? /\bflanges?\b|法兰/i : /new supplier|supplier registration|vendor registration|supplier qualification|potential suppliers|procurement representative|供应商注册|供应商准入/i), url: supplier.url });
  const metalFlange = /\b(?:steel|stainless|metal|asme|ansi)\b[^.!?。]{0,100}\bflanges?\b|\bflanges?\b[^.!?。]{0,100}\b(?:steel|stainless|metal|asme|ansi)\b|(?:钢制|不锈钢|金属).{0,30}法兰|法兰.{0,30}(?:钢制|不锈钢|金属)/i;
  const flangeProduct = sources.find((page) => page.kind !== 'suppliers' && metalFlange.test(page.text));
  if (flangeProduct && !facts.some((fact) => fact.url === flangeProduct.url && /flange|法兰/i.test(fact.excerpt))) facts.push({ label: '钢制／金属法兰相关产品', excerpt: excerptAt(flangeProduct.text, /\bflanges?\b|法兰/i), url: flangeProduct.url });
  const combined = sources.filter((page) => page.kind !== 'suppliers').map((page) => page.text).join(' ');
  const nonMetalOnly = /\b(?:hdpe|pvc|plastic|polypropylene)\b|塑料/i.test(combined) && !/\b(?:steel|stainless|metal)\b|钢制|不锈钢|金属/i.test(combined);
  const fit: OutreachInsight['fit'] = flangeCategory || flangeProduct ? 'direct' : sector && !nonMetalOnly ? 'related' : 'unconfirmed';
  const gaps = ['尚未确认当前采购计划、规格材质及数量'];
  if (roleBasis !== 'website') gaps.push(roleBasis === 'crm' ? '客户类型仅依据CRM资料推断' : '客户类型尚未核实');
  if (!sources.length) gaps.push('未取得可用官网正文，请先核实客户业务');
  if (!supplier) gaps.push('未核实供应商注册或采购负责人');
  if (nonMetalOnly && !flangeCategory) gaps.push('官网主要出现非金属管道产品，钢制法兰适配性待确认');
  if (fit !== 'direct') gaps.push('未发现明确的钢制法兰供货类别或产品依据，建议人工复核后再选择');
  const approach = flangeCategory ? '供应商供货类别已列法兰，先确认是否接受新增供应商评审'
    : supplier && segment !== 'unknown' ? '已有准入入口，先确认法兰是否属于其评审范围'
      : fit === 'unconfirmed' ? '先核实钢制法兰采购范围，避免预设需求'
        : role === 'distributor' ? '结合其产品目录询问法兰补充货源评估'
          : role === 'manufacturer' ? '结合制造业务确认外采钢制法兰或组装配套范围'
            : role === 'contractor' ? '围绕项目材料采购和供应商准入联系采购团队'
              : '基于相关业务确认法兰采购范围及负责团队';
  const insight: OutreachInsight = { version: 2, role, roleBasis, fit, approach, facts, gaps, sources: sources.map(({ text: _text, ...source }) => source), researchNotes: notes, recommended: fit === 'direct' };
  return { insight, segment, supplier, flangeCategory, sector, productPage, flangeProduct };
}
