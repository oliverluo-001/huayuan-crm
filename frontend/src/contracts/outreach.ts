export interface OutreachSender { name: string; company: string; email: string; whatsapp: string; website: string }
export interface OutreachDraft {
  recipientKey: string; customerId: number; email: string; company: string; timezone: string;
  segment: 'piping' | 'valves' | 'projects' | 'water' | 'unknown';
  evidence: { url: string; checkedAt: string; excerpt: string; status: 'verified' | 'unavailable' | 'not_requested' };
  reason: string; warnings: string[]; eligible: boolean; selected: boolean; subject: string; body: string;
}
export interface OutreachDetail {
  id: string; name: string; status: string;
  data: { version: 1; revision: number; targetCountry: string; productScope: string; sender: OutreachSender; drafts: OutreachDraft[]; approvedAt?: string };
  summary: { total: number; eligible: number; selected: number };
  schedule: { startAt: string | null; batchSize: number | null; intervalMinutes: number | null; totalRuns: number | null };
  delivery: { sent: number; failed: number; skipped: number; message: string };
  senderAccount: { from: string; configured: boolean };
}
export interface OutreachListItem { id: string; name: string; status: string; approvedAt?: string; total: number; eligible: number; selected: number }
export interface CreateOutreachInput { requestId: string; name: string; targetCountry: string; productScope: string; recipientKeys: string[]; sender: OutreachSender; researchWebsites: boolean }
export interface OutreachSchedule { startAt: string; batchSize: number; intervalMinutes: number; totalRuns: number; revision: number }

function wallParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

// Resolve the selected customer's wall clock, never the browser's implicit timezone.
// Reject DST gaps and repeated wall-clock times instead of guessing an offset.
export function outreachStartIso(local: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('请填写完整的开始日期和时间');
  const naive = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 16) !== local) throw new Error('开始日期无效');
  const candidates = new Set<number>();
  for (const delta of [-36, 0, 36]) {
    const probe = naive + delta * 3600_000;
    const offset = Date.parse(`${wallParts(new Date(probe), timeZone)}:00Z`) - probe;
    const candidate = naive - offset;
    if (wallParts(new Date(candidate), timeZone) === local) candidates.add(candidate);
  }
  if (candidates.size !== 1) throw new Error('所选当地时间不存在或因夏令时重复，请选择其他时刻');
  return new Date([...candidates][0]).toISOString();
}

export function defaultOutreachStart(timeZone: string) {
  const localDate = wallParts(new Date(), timeZone).slice(0, 10);
  const day = new Date(`${localDate}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1);
  while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  return `${day.toISOString().slice(0, 10)}T10:00`;
}

export const OUTREACH_SEGMENTS = { piping: '管道／管件', valves: '阀门配套', projects: '项目准入', water: '水处理', unknown: '需求待确认' };
