const PREFIX = "huayuan:quote-draft:v1:";
export const quoteDraftKey = (userId: string, customerId?: string) => `${PREFIX}${encodeURIComponent(userId)}${customerId ? `:customer:${encodeURIComponent(customerId)}` : ""}`;

export interface DraftEnvelope<T> { version: 1; savedAt: string; data: T }

export function readQuoteDraft<T>(storage: Storage, userId: string, validate: (data: unknown) => data is T, customerId?: string): DraftEnvelope<T> | null {
  if (!userId) return null;
  try {
    const raw = storage.getItem(quoteDraftKey(userId, customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || typeof parsed.savedAt !== "string" || !Number.isFinite(Date.parse(parsed.savedAt)) || !validate(parsed.data)) return null;
    return parsed;
  } catch { return null; }
}

export function writeQuoteDraft<T>(storage: Storage, userId: string, data: T, customerId?: string): boolean {
  if (!userId) return false;
  try {
    storage.setItem(quoteDraftKey(userId, customerId), JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data }));
    return true;
  } catch { return false; }
}

export function clearQuoteDrafts(storage: Storage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    keys.forEach((key) => { if (key?.startsWith(PREFIX)) storage.removeItem(key); });
  } catch { /* Storage may be unavailable in private browser sessions. */ }
}
