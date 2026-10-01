// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCustomerQuoteDraft } from "./useCustomerQuoteDraft";
import { clearQuoteDrafts, quoteDraftKey, writeQuoteDraft } from "@/contracts/quote-draft";
const validate = (value: unknown): value is { text: string } => Boolean(value && typeof value === "object" && typeof (value as { text: unknown }).text === "string");
function Editor({ user = "alice", customer = "1" }: { user?: string; customer?: string }) {
  const [text, setText] = useState("");
  const draft = useCustomerQuoteDraft(user, customer, { text }, Boolean(text), validate);
  return <><input value={text} onChange={(event) => setText(event.target.value)} /><p>{draft.pending ? "恢复待确认" : draft.notice}</p><button onClick={() => { setText(draft.pending!.data.text); draft.restored(); }}>恢复</button><button onClick={() => { draft.clear(); setText(""); }}>保存成功</button><button onClick={() => draft.mayLeave()}>离开</button></>;
}
let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); sessionStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount(user = "alice", customer = "1") { await act(async () => root.render(<Editor key={`${user}:${customer}`} user={user} customer={customer} />)); }
async function input(text: string) { const element = host.querySelector("input")!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, text); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function click(text: string) { await act(async () => Array.from(host.querySelectorAll("button")).find((button) => button.textContent === text)!.click()); }
describe("customer quick quote draft", () => {
  it("persists on unmount, restores explicitly and never leaks to another customer or user", async () => {
    await mount(); await input("原始报价"); await mount("alice", "2");
    expect(sessionStorage.getItem(quoteDraftKey("alice", "1"))).toContain("原始报价");
    expect(host.querySelector("input")!.value).toBe("");
    await mount("bob", "1"); expect(host.textContent).not.toContain("恢复待确认");
    await mount(); expect(host.querySelector("input")!.value).toBe(""); expect(host.textContent).toContain("恢复待确认");
    await click("恢复"); expect(host.querySelector("input")!.value).toBe("原始报价");
  });
  it("does not resurrect drafts after success or logout", async () => {
    await mount(); await input("待保存"); await click("保存成功"); await mount("alice", "2");
    expect(sessionStorage.getItem(quoteDraftKey("alice", "1"))).toBeNull();
    await input("不应复活");
    await act(async () => { clearQuoteDrafts(sessionStorage); window.dispatchEvent(new Event("huayuan:clear-drafts")); });
    await mount("bob", "2"); expect(sessionStorage.length).toBe(0);
  });
  it("does not overwrite a pending draft before the user restores it", async () => {
    writeQuoteDraft(sessionStorage, "alice", { text: "历史草稿" }, "1"); await mount(); await input("未恢复的新输入"); await mount("alice", "2");
    expect(sessionStorage.getItem(quoteDraftKey("alice", "1"))).toContain("历史草稿");
    expect(sessionStorage.getItem(quoteDraftKey("alice", "1"))).not.toContain("未恢复的新输入");
  });
});
