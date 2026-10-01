// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("workspace tab orientation", () => {
  it.each(["horizontal", "vertical"] as const)("forwards %s direction and applies matching flex layout", async (orientation) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(<Tabs defaultValue="one" orientation={orientation}><TabsList><TabsTrigger value="one">一</TabsTrigger><TabsTrigger value="two">二</TabsTrigger></TabsList><TabsContent value="one">内容一</TabsContent><TabsContent value="two">内容二</TabsContent></Tabs>));
      const tabs = host.querySelector('[data-slot="tabs"]')!;
      expect(tabs.getAttribute("data-orientation")).toBe(orientation);
      expect(tabs.classList.contains(orientation === "horizontal" ? "flex-col" : "flex-row")).toBe(true);
      // Horizontal is the implicit ARIA default, so Base UI omits the attribute.
      expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-orientation") || "horizontal").toBe(orientation);
    } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
  });
});
