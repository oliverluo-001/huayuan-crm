import { afterEach, expect, it, vi } from "vitest";
import { createB2BLeadTask, getB2BLeadTasks } from "./client";

afterEach(() => vi.unstubAllGlobals());

it("normalizes numeric task IDs from the backend for selection and creation", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ tasks: [{ id: 41, status: "draft" }] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ task: { id: 42, status: "draft" }, queries: [] }) });
  vi.stubGlobal("fetch", fetchMock);

  expect((await getB2BLeadTasks())[0].id).toBe("41");
  expect((await createB2BLeadTask({ productName: "flange" })).task.id).toBe("42");
});
