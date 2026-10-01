import { useCallback, useEffect, useRef, useState } from "react";
import { quoteDraftKey, readQuoteDraft, writeQuoteDraft } from "@/contracts/quote-draft";

// Mount a fresh workspace per user/customer. Never reinterpret another
// customer's in-memory form under a different storage key.
export function useCustomerQuoteDraft<T>(userId: string, customerId: string, draft: T, hasWork: boolean, validate: (value: unknown) => value is T) {
  const [pending, setPending] = useState(() => {
    try { return readQuoteDraft(window.sessionStorage, userId, validate, customerId); } catch { return null; }
  });
  const [notice, setNotice] = useState("");
  const enabled = useRef(true);
  const latest = useRef({ draft, canPersist: false });
  latest.current = { draft, canPersist: Boolean(userId && customerId && hasWork && !pending) };
  const persist = useCallback(() => {
    if (!enabled.current || !latest.current.canPersist) return true;
    try { return writeQuoteDraft(window.sessionStorage, userId, latest.current.draft, customerId); } catch { return false; }
  }, [userId, customerId]);
  const json = JSON.stringify(draft);
  useEffect(() => {
    if (!hasWork || pending || !enabled.current || !userId) return;
    const timer = window.setTimeout(() => setNotice(persist() ? "快速报价草稿已保存在当前标签页；退出账号后清除" : "浏览器无法保存草稿，请先保存报价，避免丢失"), 500);
    const beforeUnload = (event: BeforeUnloadEvent) => { persist(); event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.clearTimeout(timer); window.removeEventListener("beforeunload", beforeUnload); };
  }, [json, hasWork, pending, userId, persist]);
  useEffect(() => {
    const clearOnLogout = () => { enabled.current = false; latest.current.canPersist = false; setPending(null); setNotice(""); };
    window.addEventListener("huayuan:clear-drafts", clearOnLogout);
    return () => { window.removeEventListener("huayuan:clear-drafts", clearOnLogout); persist(); };
  }, [persist]);
  const clear = () => {
    latest.current.canPersist = false;
    try { window.sessionStorage.removeItem(quoteDraftKey(userId, customerId)); } catch { /* storage unavailable */ }
    setPending(null); setNotice("");
  };
  const mayLeave = () => {
    if (!enabled.current || !latest.current.canPersist || persist()) return true;
    return confirm("浏览器无法保存快速报价草稿，离开会丢失未保存内容。确定离开？");
  };
  return { pending, notice, clear, mayLeave, restored: () => setPending(null) };
}
