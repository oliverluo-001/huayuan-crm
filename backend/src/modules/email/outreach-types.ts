export type OutreachSegment = 'piping' | 'valves' | 'projects' | 'water' | 'unknown';

export interface OutreachSender {
  name: string;
  company: string;
  email: string;
  whatsapp: string;
  website: string;
}

export interface OutreachDraft {
  recipientKey: string;
  customerId: number;
  contactId: number | null;
  email: string;
  company: string;
  name: string;
  timezone: string;
  segment: OutreachSegment;
  evidence: { url: string; checkedAt: string; excerpt: string; status: 'verified' | 'unavailable' | 'not_requested' };
  reason: string;
  warnings: string[];
  eligible: boolean;
  selected: boolean;
  subject: string;
  body: string;
}

export interface OutreachData {
  version: 1;
  revision: number;
  targetCountry: string;
  productScope: string;
  sender: OutreachSender;
  drafts: OutreachDraft[];
  approvedAt?: string;
  smtpFrom?: string;
}

export const NEW_CUSTOMER_STAGES = ['', 'new', 'prospect', 'lead'];

export function assertOutreachMessage(subject: string, body: string) {
  if (!subject?.trim() || subject.length > 500 || /[\r\n]/.test(subject)) return false;
  if (!body?.trim() || body.length > 6000) return false;
  // Outreach is plain text. Reject unresolved variables and signature placeholders.
  return !/[<>]|\{\{|\[(?:Your|Company|Name|Email|WhatsApp)[^\]]*\]/i.test(subject + body);
}
