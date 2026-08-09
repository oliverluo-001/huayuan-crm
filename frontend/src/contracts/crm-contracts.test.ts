import { describe, expect, it } from "vitest";
import { CUSTOMER_JOURNEY_STAGES, OPPORTUNITY_STAGES } from "./crm-stages";
import {
  ACTIVITY_TYPE_LABELS,
  EMAIL_TASK_STATUS_LABELS,
  QUOTE_STATUS_OPTIONS,
  optionLabel,
  statusLabel,
} from "./crm-terminology";

describe("CRM frontend/backend contracts", () => {
  it("covers every opportunity stage returned by the backend", () => {
    expect(OPPORTUNITY_STAGES.map((stage) => stage.value)).toEqual([
      "prospecting",
      "qualification",
      "proposal",
      "negotiation",
      "won",
      "lost",
    ]);
    expect(OPPORTUNITY_STAGES.every((stage) => Boolean(stage.label) && Boolean(stage.color))).toBe(true);
  });

  it("keeps the customer journey labels in the expected sales order", () => {
    expect(CUSTOMER_JOURNEY_STAGES.map((stage) => stage.value)).toEqual([
      "new",
      "contacted",
      "replied",
      "qualified",
      "opportunity",
      "proposal",
      "negotiation",
      "won",
      "lost",
    ]);
    expect(CUSTOMER_JOURNEY_STAGES.find((stage) => stage.value === "proposal")?.label).toBe("已提交报价");
  });

  it("renders stable Chinese labels for quote, activity, and email task statuses", () => {
    expect(optionLabel(QUOTE_STATUS_OPTIONS, "accepted")).toBe("客户已接受");
    expect(statusLabel(ACTIVITY_TYPE_LABELS, "call")).toBe("电话沟通");
    expect(statusLabel(EMAIL_TASK_STATUS_LABELS, "completed")).toBe("已完成");
    expect(statusLabel(EMAIL_TASK_STATUS_LABELS, "unexpected")).toBe("未知状态");
  });
});
