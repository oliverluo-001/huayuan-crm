// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LeadsPage } from "./LeadsPage";

const mocks = vi.hoisted(() => ({
  tasks: [] as Array<Record<string, unknown>>,
  create: vi.fn(),
  run: vi.fn(),
  association: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "sales" }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/api/client", () => ({
  getB2BLeadTasks: async () => mocks.tasks,
  getB2BLeads: async () => ({ leads: [], summary: {} }),
  getLeadAssociation: mocks.association,
  createB2BLeadTask: mocks.create,
  runB2BLeadTask: mocks.run,
}));

let host: HTMLDivElement;
let root: Root;
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function prepare() {
  const input = host.querySelector<HTMLInputElement>("#leadProductInput")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "flange");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("智能联想买家");
  await click("确认买家画像");
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasks.length = 0;
  mocks.association.mockReset().mockResolvedValue({
    productName: "flange", canonicalName: "flange", aliases: ["flange"], industries: ["Oil & Gas"],
    companyTypes: ["distributor"], recommendedSegments: ["distributor"], source: "test",
  });
  mocks.create.mockReset().mockImplementation(async () => {
    const task = { id: "41", productName: "flange", status: "draft", targetCount: 100, createdAt: "", updatedAt: "" };
    mocks.tasks.push(task);
    return { task, queries: ["flange distributor"] };
  });
  mocks.run.mockReset().mockResolvedValue(undefined);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<LeadsPage />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("creates and starts a task with recommended buyer types after one click", async () => {
  await prepare();
  await click("确认并开始自动搜索");
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    productName: "flange", targetSegments: ["distributor"], marketMode: "global",
  }));
  expect(mocks.run).toHaveBeenCalledWith("41");
  expect(host.textContent).toContain("自动搜索任务");
});

it("keeps the created task and shows an inline error when starting fails", async () => {
  mocks.run.mockRejectedValueOnce(new Error("搜索服务暂不可用"));
  await prepare();
  await click("确认并开始自动搜索");
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("任务已创建，但搜索未启动");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("搜索服务暂不可用");
});
