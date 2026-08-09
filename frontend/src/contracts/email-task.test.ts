import { describe, expect, it } from "vitest";
import { buildCreateEmailTaskInput } from "./email-task";

describe("email task creation contract", () => {
  it("does not send server-managed delivery counters", () => {
    const input = buildCreateEmailTaskInput({
      name: "  东南亚客户跟进  ",
      taskMode: "once",
      templateId: "template-1",
      batchSize: "50",
      intervalMinutes: "1440",
      totalRuns: "1",
      startAt: "",
    }, ["12", "18"]);

    expect(input).toEqual({
      name: "东南亚客户跟进",
      taskMode: "once",
      templateId: "template-1",
      customerIds: ["12", "18"],
      batchSize: 50,
    });
    expect(input).not.toHaveProperty("successfulSendCount");
  });

  it("omits a blank scheduled date so backend date validation succeeds", () => {
    const input = buildCreateEmailTaskInput({
      name: "定时开发信",
      taskMode: "scheduled",
      templateId: "template-2",
      batchSize: "",
      intervalMinutes: "",
      totalRuns: "0",
      startAt: "  ",
    }, ["21"]);

    expect(input).toMatchObject({
      batchSize: 0,
      intervalMinutes: 1440,
      totalRuns: 1,
    });
    expect(input).not.toHaveProperty("startAt");
  });
});
