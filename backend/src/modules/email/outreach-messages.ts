import { OutreachDraft, OutreachSegment, OutreachSender } from './outreach-types';

const patterns: Array<[OutreachSegment, RegExp, string]> = [
  ['water', /water treatment|desalination|wastewater|水处理|海水淡化/i, 'water treatment'],
  ['valves', /\bvalves?\b|flow control|阀门/i, 'valves'],
  ['piping', /\bflanges?\b|pipe fittings|piping (?:products|material|solutions)|法兰|管件/i, 'piping products'],
  ['projects', /\bepc\b|engineering|fabrication|construction|工程|制造/i, 'engineering services'],
];

export function classifyOutreach(text: string) {
  return patterns.find(([, pattern]) => pattern.test(text));
}

export function generateOutreachMessage(company: string, business: string, website: string, sender: OutreachSender, productScope: string) {
  const verifiedMatch = classifyOutreach(website);
  const match = verifiedMatch || classifyOutreach(business);
  const segment = match?.[0] || 'unknown';
  const questions: Record<OutreachSegment, string> = {
    piping: 'Would you be open to comparing a quotation on one or two flange items you regularly source?',
    valves: 'Does your team purchase companion flanges alongside valve orders, or do your customers source these separately?',
    projects: 'Could you point me to the person or registration process responsible for flange supplier qualification?',
    water: 'Does your team purchase metal flanges directly for treatment packages, or are they supplied by your installation contractor?',
    unknown: 'Is metal flange sourcing within your team\'s purchasing scope?',
  };
  const subjects: Record<OutreachSegment, string> = {
    piping: 'An additional source for flange enquiries', valves: 'Companion flanges for valve enquiries',
    projects: 'Flange supplier qualification', water: 'Metal flanges for water-treatment packages', unknown: 'Who handles metal flange sourcing?',
  };
  const opening = verifiedMatch
    ? `I noticed your website mentions ${verifiedMatch[2]}.`
    : 'If your team sources metal flanges, we would welcome the opportunity to be considered for a future enquiry.';
  return {
    segment,
    reason: verifiedMatch ? `官网文字包含相关业务关键词：${verifiedMatch[2]}；采购需求仍待确认` : match ? '根据CRM业务资料推断，官网尚未验证该方向' : '未发现明确产品适配证据，先询问采购范围',
    subject: subjects[segment],
    body: `Hello ${company.replace(/[<>\r\n{}]/g, ' ')} team,\n\n${opening}\n\nI'm ${sender.name} from ${sender.company}, China.\n\nOur product scope: ${productScope}\n\n${questions[segment]}\n\nBest regards,\n${sender.name}\n${sender.company}\n${sender.email}\nWhatsApp: ${sender.whatsapp}\n${sender.website}`,
  };
}

export function evidenceExcerpt(text: string) {
  const match = patterns.map(([, p]) => p.exec(text)).find(Boolean);
  const start = Math.max(0, (match?.index || 0) - 70);
  return text.slice(start, start + 300);
}

export function outreachSummary(drafts: OutreachDraft[]) {
  return { total: drafts.length, eligible: drafts.filter((d) => d.eligible).length, selected: drafts.filter((d) => d.eligible && d.selected).length };
}
