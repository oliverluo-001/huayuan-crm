import { OutreachDraft, OutreachSegment, OutreachSender, OutreachSource } from './outreach-types';
import { analyzeOutreachSources } from './outreach-insight';

const patterns: Array<[OutreachSegment, RegExp, string]> = [
  ['water', /water treatment|desalination|wastewater|水处理|海水淡化/i, 'water treatment'],
  ['valves', /\bvalves?\b|flow control|阀门/i, 'valves'],
  ['piping', /\bflanges?\b|pipe fittings|piping (?:products|material|solutions)|法兰|管件/i, 'piping products'],
  ['projects', /\bepc\b|engineering|fabrication|construction|工程|制造/i, 'engineering services'],
];

export function classifyOutreach(text: string) {
  return patterns.find(([, pattern]) => pattern.test(text));
}

export function generateOutreachMessage(company: string, business: string, website: string, sender: OutreachSender, productScope: string, sources?: OutreachSource[], notes: string[] = []) {
  const analysis = analyzeOutreachSources(sources || (website ? [{ url: '', title: '官网', kind: 'home', text: website }] : []), business, notes);
  const { insight, segment, supplier, flangeCategory, sector } = analysis;
  let subject = 'Metal flange sourcing enquiry';
  let opening = 'If metal flanges fall within your purchasing scope, we would welcome the opportunity to introduce our range.';
  let question = 'Does your team handle metal flange sourcing, or could you direct me to the relevant purchasing contact?';
  if (flangeCategory) {
    subject = 'Flange supplier qualification';
    opening = 'I noticed that flanges are listed among the supply categories on your supplier registration page.';
    question = 'Are you currently open to evaluating an additional supplier for this category?';
  } else if (supplier && segment !== 'unknown') {
    subject = 'Flange supply — supplier qualification';
    opening = 'I came across the supplier registration information on your website.';
    question = 'Would metal flange supply fall within the categories your procurement team is currently qualifying?';
  } else if (insight.fit !== 'unconfirmed' && sector) {
    const controlValves = segment === 'valves' && (sources || []).some((page) => /control valves?/i.test(page.text));
    const topic = controlValves ? 'control-valve products' : sector.description;
    opening = `I came across your ${topic} while looking for companies with a potential fit for our flange range.`;
    if (insight.role === 'manufacturer' && insight.roleBasis === 'website') {
      subject = segment === 'valves' ? 'Flange sourcing for valve manufacturing' : 'Flange supply for your manufacturing enquiries';
      question = 'Does your manufacturing team source metal flanges externally for assemblies or project packages?';
    } else if (insight.role === 'distributor') {
      subject = 'An additional flange source for your enquiries';
      question = 'Would your purchasing team be open to comparing a quotation for a flange item when a sourcing need arises?';
    } else if (insight.role === 'contractor' || segment === 'projects') {
      subject = 'Flange supply — project vendor qualification';
      question = 'Could you direct me to the team responsible for flange sourcing or project vendor qualification?';
    } else if (segment === 'water') {
      subject = 'Metal flanges for water-treatment enquiries';
      question = 'Does your team source metal flanges for treatment packages, or is this handled by an installation partner?';
    } else {
      subject = 'Flange supply — purchasing enquiry';
      question = 'Would your purchasing team consider an additional source for future metal flange enquiries?';
    }
  }
  return {
    segment, insight, reason: insight.approach, subject,
    body: `Hello ${company.replace(/[<>\r\n{}]/g, ' ')} team,\n\n${opening}\n\nI'm ${sender.name} from ${sender.company} in China. Our product range: ${productScope}\n\n${question}\n\nBest regards,\n${sender.name}\n${sender.company}\n${sender.email}\nWhatsApp: ${sender.whatsapp}\n${sender.website}`,
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
