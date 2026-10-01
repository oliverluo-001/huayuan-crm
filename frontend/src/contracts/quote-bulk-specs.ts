export const BULK_SPEC_FIELDS = [
  { key: "standard", label: "标准" }, { key: "material", label: "材质" },
  { key: "pressureRating", label: "压力等级" }, { key: "facing", label: "密封面" },
  { key: "surfaceTreatment", label: "表面处理" }, { key: "packaging", label: "包装" },
  { key: "inspectionRequirements", label: "检测要求" }, { key: "certificateRequirements", label: "证书要求" },
] as const;
export type BulkSpecField = typeof BULK_SPEC_FIELDS[number]["key"];
export type SpecLine = { key: string } & Record<BulkSpecField, string>;
export type BulkSpecs = Partial<Record<BulkSpecField, string>>;
export type SpecChange = { lineKey: string; row: number; field: BulkSpecField; label: string; before: string; after: string };

// Explicit whitelist excludes prices, quantities, SKU and nominal size: shared
// specs must not silently change the identity or commercial value of a line.
export function previewBulkSpecs<T extends SpecLine>(lines: readonly T[], selected: readonly string[], values: BulkSpecs, overwrite: boolean): SpecChange[] {
  const keys = new Set(selected);
  return lines.flatMap((line, index) => !keys.has(line.key) ? [] : BULK_SPEC_FIELDS.flatMap(({ key, label }) => {
    const after = values[key]?.trim();
    const before = line[key];
    return !after || after === before || (!overwrite && before.trim()) ? [] : [{ lineKey: line.key, row: index + 1, field: key, label, before, after }];
  }));
}
export function applyBulkSpecs<T extends SpecLine>(lines: readonly T[], selected: readonly string[], values: BulkSpecs, overwrite: boolean): T[] {
  const changes = previewBulkSpecs(lines, selected, values, overwrite);
  return lines.map((line) => {
    const patches = changes.filter((change) => change.lineKey === line.key);
    return patches.length ? { ...line, ...Object.fromEntries(patches.map((change) => [change.field, change.after])) } : line;
  });
}
