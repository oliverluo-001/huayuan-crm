// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarketingPage } from "./MarketingPage";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "sales", userId: "7" }) }));
vi.mock("@/api/client", () => ({
  getTemplates: async () => [],
  getEmailTasks: async () => [],
  getEmailRecipients: async () => ({ recipients: [], total: 0 }),
  getSendLogs: async () => [],
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<MarketingPage />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("hides the unused round limit for the full-recipient scheduled plan", async () => {
  const tasksTab = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("发信任务"))!;
  await act(async () => tasksTab.click());
  expect(host.textContent).toContain("创建发信任务");
  const scheduleTrigger = host.querySelector<HTMLElement>('[data-slot="select-trigger"]')!;
  await act(async () => scheduleTrigger.click());
  const scheduleChoice = [...document.querySelectorAll<HTMLElement>("[role=option]")].find((item) => item.textContent?.includes("定时任务"))!;
  await act(async () => scheduleChoice.click());
  expect(host.textContent).toContain("总轮数");
  const sendAll = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) => input.parentElement?.textContent?.includes("发送完整名单"))!;
  await act(async () => sendAll.click());
  expect(host.textContent).not.toContain("总轮数");
  expect(host.textContent).toContain("不是立即同时发送");
  expect(host.textContent).toContain("每轮邮件数量");
});
