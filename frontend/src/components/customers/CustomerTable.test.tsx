// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomerTable } from "./CustomerTable";

const mocks = vi.hoisted(() => ({ customers: vi.fn(), ids: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("@/components/customers/Customer360Dialog", () => ({ Customer360Dialog: () => null }));
vi.mock("@/components/customers/CustomerDuplicatesDialog", () => ({ CustomerDuplicatesDialog: () => null }));
vi.mock("@/api/client", async (original) => ({
  ...await original<object>(), getCustomers: mocks.customers, getCustomerIds: mocks.ids,
  getCustomerGeography: async () => [{ name: "东南亚", countries: [{ name: "Thailand", label: "泰国", aliases: ["泰国"], timezone: "Asia/Bangkok" }] }],
  getCustomerTags: async () => [], getCustomerViews: async () => [], getUserDirectory: async () => [],
}));
let host: HTMLDivElement;
let root: Root;
const result = (company: string, total = 1) => ({ customers: [{ id: "1", company, tags: [], tier: "A", journeyStage: "new", emailStatus: "unknown" }], total });
async function input(value: string) {
  const element = host.querySelector<HTMLInputElement>('input[placeholder="公司、邮箱、联系人、主营业务"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function button(text: string) {
  const element = Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  expect(element, text).toBeDefined();
  await act(async () => element!.click());
}
beforeEach(async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.customers.mockReset().mockResolvedValue(result("Initial buyer", 100));
  mocks.ids.mockReset().mockResolvedValue(["1"]);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<CustomerTable />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("keeps draft filters separate from the list and select-all, resetting pagination on apply", async () => {
  await button("下一页");
  expect(mocks.customers.mock.lastCall?.[0]).toBe(50);
  const before = mocks.customers.mock.calls.length;
  await input("flange");
  expect(mocks.customers).toHaveBeenCalledTimes(before);
  await button("一键全选筛选结果");
  expect(mocks.ids.mock.lastCall?.[0].q).toBe("");
  await button("应用筛选");
  expect(mocks.customers.mock.lastCall).toEqual([0, 50, expect.objectContaining({ q: "flange" })]);
  await button("一键全选筛选结果");
  expect(mocks.ids.mock.lastCall?.[0].q).toBe("flange");
});

it("does not let an older slow request overwrite the latest filter result", async () => {
  let resolveOld!: (value: ReturnType<typeof result>) => void;
  mocks.customers.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
  await input("old"); await button("应用筛选");
  mocks.customers.mockResolvedValueOnce(result("Latest buyer"));
  await input("new"); await button("应用筛选");
  expect(host.textContent).toContain("Latest buyer");
  await act(async () => resolveOld(result("Stale buyer")));
  expect(host.textContent).toContain("Latest buyer");
  expect(host.textContent).not.toContain("Stale buyer");
});

it("shows load failures instead of silently presenting stale customers", async () => {
  mocks.customers.mockRejectedValueOnce(new Error("connection unavailable"));
  await input("new"); await button("应用筛选");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("connection unavailable");
  expect(host.textContent).not.toContain("Initial buyer");
});

it("shows a customer's country and local time without requiring an explicit timezone for a single-zone country", async () => {
  mocks.customers.mockResolvedValueOnce({ customers: [{ ...result("Thai buyer").customers[0], country: "Thailand" }], total: 1 });
  await input("Thai buyer"); await button("应用筛选");
  expect(host.textContent).toContain("Thailand · 当地");
});
