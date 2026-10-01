// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "./Shell";

const mocks = vi.hoisted(() => ({ setTheme: vi.fn(), logout: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ username: "sales", displayName: "测试销售", role: "sales", logout: mocks.logout }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme: mocks.setTheme }) }));
let host: HTMLDivElement; let root: Root;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.setTheme.mockClear(); mocks.logout.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={["/quotes"]}><Routes><Route element={<Shell />}><Route path="quotes" element={<p>报价内容</p>} /><Route path="customers" element={<p>客户内容</p>} /></Route></Routes></MemoryRouter>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
describe("workspace navigation", () => {
  it("shows all sales routes without expanding a hidden group and preserves labels when collapsed", async () => {
    expect(button("报价管理").getAttribute("aria-current")).toBe("page");
    expect(button("样品跟进")).not.toBeNull();
    await act(async () => button("收起导航").click());
    expect(button("报价管理").title).toBe("报价管理");
    await act(async () => button("客户管理").click());
    expect(host.textContent).toContain("客户内容");
  });
  it("opens accessible mobile navigation, handles Escape and restores focus", async () => {
    await act(async () => button("打开菜单").click());
    expect(host.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(host.querySelector("main")?.parentElement?.getAttribute("inert")).not.toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button("打开菜单"));
  });
  it("uses resolved system theme and keeps logout functional", async () => {
    await act(async () => button("切换到亮色模式").click()); expect(mocks.setTheme).toHaveBeenCalledWith("light");
    await act(async () => button("退出登录").click()); expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});
