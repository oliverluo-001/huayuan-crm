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
