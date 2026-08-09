import type { CreateEmailTaskInput } from "@/types";

export interface EmailTaskFormDraft {
  name: string;
  taskMode: "once" | "scheduled";
  templateId: string;
  batchSize: string;
  intervalMinutes: string;
  totalRuns: string;
  startAt: string;
}

function positiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildCreateEmailTaskInput(
  form: EmailTaskFormDraft,
  customerIds: string[],
): CreateEmailTaskInput {
  const batchSize = Number.parseInt(form.batchSize, 10);
  const input: CreateEmailTaskInput = {
    name: form.name.trim(),
    taskMode: form.taskMode,
    templateId: form.templateId,
    customerIds,
    batchSize: Number.isFinite(batchSize) && batchSize >= 0 ? batchSize : 0,
  };

  if (form.taskMode === "scheduled") {
    input.intervalMinutes = positiveInteger(form.intervalMinutes, 1440);
    input.totalRuns = positiveInteger(form.totalRuns, 1);
    const startAt = form.startAt.trim();
    if (startAt) input.startAt = startAt;
  }

  return input;
}

export function resolveEmailTaskTemplateName(
  templateId: string,
  templateName: string | undefined,
  templates: Array<{ id: string; templateId?: string; name: string }>,
) {
  if (templateName) return templateName;
  return templates.find(
    (template) =>
      String(template.id) === String(templateId) ||
      Boolean(template.templateId && template.templateId === templateId),
  )?.name || "模板不可用";
}

export function readableEmailTaskMessage(value: unknown) {
  const message = String(value || "");
  if (
    /\b535\b|authentication failed|invalid login|bad credentials|username and password not accepted/i.test(
      message,
    )
  ) {
    return "任务失败：SMTP 认证失败，请到“设置”重新填写邮箱授权码并测试连接";
  }
  return message;
}
