export interface EmailPolicyLike {
  workdayStart?: number;
  workdayEnd?: number;
  enforceTimezone?: boolean;
  allowWeekends?: boolean;
}

export interface SendWindowResult {
  allowed: boolean;
  reason?: string;
}

export function checkSendWindow(
  timezone: string,
  now: Date,
  policy: EmailPolicyLike,
): SendWindowResult {
  if (!policy.enforceTimezone) return { allowed: true };
  if (!timezone) return { allowed: false, reason: '客户时区缺失，已阻止发送' };

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return { allowed: false, reason: `客户时区无效：${timezone}` };
  }

  const weekday = parts.find((part) => part.type === 'weekday')?.value || '';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || -1);
  if (!policy.allowWeekends && ['Sat', 'Sun'].includes(weekday)) {
    return { allowed: false, reason: '客户当地为周末，已延后发送' };
  }

  const start = Number.isFinite(policy.workdayStart) ? Number(policy.workdayStart) : 8;
  const end = Number.isFinite(policy.workdayEnd) ? Number(policy.workdayEnd) : 18;
  if (hour < start || hour >= end) {
    return { allowed: false, reason: `客户当地不在允许发送时段 ${start}:00-${end}:00` };
  }
  return { allowed: true };
}

export function renderTemplate(value: string, variables: Record<string, string>) {
  return String(value || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) =>
    variables[key] ?? '',
  );
}

export function normalizeEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(value));
}

export function bodyToHtml(value: string) {
  return String(value || '').replace(/\r?\n/g, '<br>');
}

export function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
