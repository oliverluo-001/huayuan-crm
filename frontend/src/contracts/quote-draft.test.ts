import { describe, expect, it } from "vitest";
import { clearQuoteDrafts, quoteDraftKey, readQuoteDraft, writeQuoteDraft } from "./quote-draft";

function storage(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); }, clear: () => data.clear() };
}
const validate = (value: unknown): value is { price: string } => Boolean(value && typeof value === "object" && typeof (value as { price: unknown }).price === "string");
describe("user-scoped session quote drafts", () => {
  it("isolates users and preserves exact unsaved price", () => {
    const session = storage();
    expect(writeQuoteDraft(session, "alice", { price: "12.50" })).toBe(true);
    expect(readQuoteDraft(session, "alice", validate)?.data.price).toBe("12.50");
    expect(readQuoteDraft(session, "bob", validate)).toBeNull();
    expect(writeQuoteDraft(session, "", { price: "12" })).toBe(false);
  });
  it("clears only quote drafts on logout", () => {
    const session = storage();
    session.setItem("theme", "dark");
    writeQuoteDraft(session, "alice", { price: "12" });
    writeQuoteDraft(session, "bob", { price: "22" });
    clearQuoteDrafts(session);
    expect(session.length).toBe(1);
    expect(session.getItem("theme")).toBe("dark");
  });
  it("ignores corrupted or incompatible drafts and tolerates unavailable storage", () => {
    const session = storage();
    for (const raw of ["broken", '{"version":2}', '{"version":1,"savedAt":"bad","data":{"price":"12"}}', '{"version":1,"savedAt":"2026-10-01","data":{"price":12}}']) {
      session.setItem(quoteDraftKey("alice"), raw);
      expect(readQuoteDraft(session, "alice", validate)).toBeNull();
    }
    const blocked = { ...session, setItem: () => { throw new Error("quota"); }, getItem: () => { throw new Error("blocked"); } };
    expect(writeQuoteDraft(blocked, "alice", {})).toBe(false);
    expect(readQuoteDraft(blocked, "alice", validate)).toBeNull();
  });
});
