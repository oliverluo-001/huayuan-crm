// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotesPage } from "./QuotesPage";
import { quoteDraftKey, clearQuoteDrafts } from "@/contracts/quote-draft";
import { DEFAULT_QUOTE_OUTPUT_LAYOUT } from "@/contracts/quote-output-layout";

const mocks = vi.hoisted(() => ({ products: vi.fn(), update: vi.fn(), auth: { role: "admin", userId: "seller-a" } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("@/api/client", () => ({
  getQuotes: async () => [{ id: "1", customerId: "1", quoteNo: "Q-1", status: "draft", currency: "USD", baseCurrency: "CNY", exchangeRate: 7, total: 10, updatedAt: "2026-10-01T00:00:00Z", items: [{ productName: "Flange", quantity: 1, unitPrice: 10 }] }],
  getCustomers: async () => ({ customers: [{ id: "1", company: "CI Buyer" }], total: 1 }),
  getProducts: mocks.products,
  getOpportunities: async () => [],
  getQuoteTermTemplates: async () => [],
  getQuoteOutputTemplates: async () => [{ id: 1, name: "Default", active: true, isDefault: true, layout: DEFAULT_QUOTE_OUTPUT_LAYOUT }],
  updateQuote: mocks.update,
  createQuote: vi.fn(), deleteQuote: vi.fn(), createQuoteTermTemplate: vi.fn(), deleteQuoteTermTemplate: vi.fn(), updateQuoteTermTemplate: vi.fn(),
  getCustomer360: vi.fn(), quoteOutputUrl: () => "/test-output",
}));

let host: HTMLDivElement;
let root: Root;
async function mount() {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter><QuotesPage /></MemoryRouter>); });
}
async function unmount() { await act(async () => root.unmount()); host.remove(); }
async function input(selector: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(selector)!;
  expect(element).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function button(text: string) {
  const found = Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
  expect(found, text).toBeDefined();
  await act(async () => found!.click());
}
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = vi.fn(); window.confirm = vi.fn(() => true);
  sessionStorage.clear(); mocks.auth.userId = "seller-a";
  mocks.products.mockReset().mockResolvedValue([]); mocks.update.mockReset().mockResolvedValue({});
});
afterEach(async () => { if (host?.isConnected) await unmount(); });

describe("quote editor interaction protection", () => {
  it("persists on page leave and requires explicit restore after remount", async () => {
    await mount(); await input('input[placeholder="留空自动生成"]', "UNSAVED-QUOTE");
    await unmount();
    expect(JSON.parse(sessionStorage.getItem(quoteDraftKey("seller-a"))!).data.form.quoteNo).toBe("UNSAVED-QUOTE");
    await mount();
    expect(host.textContent).toContain("未保存报价草稿");
    expect(host.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true);
    await button("恢复草稿");
    expect(host.querySelector<HTMLInputElement>('input[placeholder="留空自动生成"]')!.value).toBe("UNSAVED-QUOTE");
    expect(host.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(false);
  });
  it("does not expose another user's draft or recreate a cleared draft on logout", async () => {
    await mount(); await input('input[placeholder="留空自动生成"]', "PRIVATE-QUOTE"); await unmount();
    mocks.auth.userId = "seller-b"; await mount();
    expect(host.textContent).not.toContain("未保存报价草稿"); await unmount();
    mocks.auth.userId = "seller-a"; await mount(); await button("恢复草稿");
    await act(async () => { clearQuoteDrafts(sessionStorage); window.dispatchEvent(new Event("huayuan:clear-drafts")); });
    await unmount();
    expect(sessionStorage.getItem(quoteDraftKey("seller-a"))).toBeNull();
  });
  it("keeps input and custom layout when a failed auxiliary module is retried", async () => {
    mocks.products.mockRejectedValueOnce(new Error("catalog unavailable"));
    await mount(); expect(host.textContent).toContain("产品库加载失败");
    await input('input[placeholder="留空自动生成"]', "KEEP-ME");
    await input('input[type="color"]', "#ff0000");
    await button("重新加载");
    expect(host.querySelector<HTMLInputElement>('input[placeholder="留空自动生成"]')!.value).toBe("KEEP-ME");
    expect(host.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe("#ff0000");
    expect(host.textContent).not.toContain("产品库加载失败");
  });
  it("submits only once and clears the successful draft without resurrecting it", async () => {
    let resolve!: (value: object) => void;
    mocks.update.mockReturnValue(new Promise((done) => { resolve = done; }));
    await mount();
    await act(async () => host.querySelector<HTMLButtonElement>('button[title="编辑报价单"]')!.click());
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true);
    await act(async () => { resolve({}); });
    await unmount();
    expect(sessionStorage.getItem(quoteDraftKey("seller-a"))).toBeNull();
  });
});
