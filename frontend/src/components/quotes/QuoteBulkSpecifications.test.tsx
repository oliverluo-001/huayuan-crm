// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteBulkSpecifications } from "./QuoteBulkSpecifications";

let host: HTMLDivElement; let root: Root;
const apply = vi.fn(), select = vi.fn();
const lines = [{ key: "a", material: "316L", standard: "", pressureRating: "", facing: "", surfaceTreatment: "", packaging: "", inspectionRequirements: "", certificateRequirements: "" }];
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); apply.mockClear(); select.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<QuoteBulkSpecifications lines={lines} selected={["a"]} onSelect={select} onApply={apply} />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === text)!;
async function input(value: string) {
  const element = host.querySelector<HTMLInputElement>('input[aria-label="批量材质"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("bulk specification editor", () => {
  it("does not overwrite existing specs by default and requires confirmation for replacement", async () => {
    await input("304"); expect(button("应用预览变更").disabled).toBe(true);
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(host.textContent).toContain("316L"); expect(host.textContent).toContain("304");
    const confirm = vi.fn(() => false); vi.stubGlobal("confirm", confirm);
    await act(async () => button("应用预览变更").click()); expect(apply).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => button("应用预览变更").click());
    expect(apply).toHaveBeenCalledWith(["a"], { material: "304" }, true);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="批量材质"]')!.value).toBe("");
  });
  it("selects all lines explicitly and can clear selection", async () => {
    await act(async () => button("选择全部报价行").click()); expect(select).toHaveBeenLastCalledWith(["a"]);
    await act(async () => button("清除选择").click()); expect(select).toHaveBeenLastCalledWith([]);
  });
});
