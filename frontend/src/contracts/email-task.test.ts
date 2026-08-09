import { describe, expect, it } from "vitest";
import {
  buildCreateEmailTaskInput,
  readableEmailTaskMessage,
  resolveEmailTaskTemplateName,
} from "./email-task";

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

  it("resolves both historical numeric and stable template identifiers", () => {
    const templates = [
      { id: "1", templateId: "tmpl_welcome", name: "欢迎邮件" },
    ];
    expect(resolveEmailTaskTemplateName("1", undefined, templates)).toBe(
      "欢迎邮件",
    );
    expect(
      resolveEmailTaskTemplateName("tmpl_welcome", undefined, templates),
    ).toBe("欢迎邮件");
    expect(resolveEmailTaskTemplateName("missing", undefined, templates)).toBe(
      "模板不可用",
    );
  });

  it("turns historical SMTP 535 messages into actionable guidance", () => {
    expect(readableEmailTaskMessage("任务失败：535 Authentication Failed"))
      .toContain("邮箱授权码");
  });
});
