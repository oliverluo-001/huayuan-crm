import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BULK_SPEC_FIELDS, previewBulkSpecs, type BulkSpecs, type SpecLine } from "@/contracts/quote-bulk-specs";

export function QuoteBulkSpecifications({ lines, selected, onSelect, onApply }: {
  lines: SpecLine[]; selected: string[]; onSelect: (keys: string[]) => void;
  onApply: (keys: string[], values: BulkSpecs, overwrite: boolean) => void;
}) {
  const [values, setValues] = useState<BulkSpecs>({});
  const [overwrite, setOverwrite] = useState(false);
  const selectedKeys = selected.filter((key) => lines.some((line) => line.key === key));
  const preview = previewBulkSpecs(lines, selectedKeys, values, overwrite);
  return <details className="rounded-xl border border-primary/20 bg-primary/5 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-primary">批量填写共同规格 · 已选 {selectedKeys.length} / {lines.length} 行</summary>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">先选择报价行，再填写共同规格。默认仅补空白；不修改口径、数量、价格和 SKU。已有规格可在预览中核对。</p>
    <div className="my-3 flex flex-wrap items-center gap-4 text-sm">
      <Button type="button" size="sm" variant="outline" onClick={() => onSelect(lines.map((line) => line.key))}>选择全部报价行</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onSelect([])}>清除选择</Button>
      <label className="flex items-center gap-2"><input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />覆盖已填规格（需确认）</label>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{BULK_SPEC_FIELDS.map(({ key, label }) => <label key={key} className="space-y-1.5 text-xs font-medium">{label}<Input aria-label={`批量${label}`} value={values[key] || ""} placeholder="留空不修改" onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
    {preview.length > 0 && <div className="mt-3 max-h-48 overflow-auto rounded-lg border bg-card"><table className="w-full text-left text-xs"><caption className="p-2 text-left font-medium">变更预览 · {preview.length} 项（已有值 → 新值）</caption><thead className="bg-muted"><tr><th className="p-2">行 / 字段</th><th className="p-2">已有值</th><th className="p-2">新值</th></tr></thead><tbody>{preview.map((change) => <tr key={`${change.lineKey}:${change.field}`} className="border-t"><td className="p-2">{change.row} · {change.label}</td><td className="p-2 break-words">{change.before || "空白"}</td><td className="p-2 break-words">{change.after}</td></tr>)}</tbody></table></div>}
    <div className="mt-3 flex flex-wrap items-center gap-3"><Button type="button" size="sm" disabled={!preview.length} onClick={() => {
      if (overwrite && preview.some((change) => change.before.trim()) && !confirm(`将覆盖已有规格，本次共修改 ${preview.length} 项。已核对预览并确定继续？`)) return;
      onApply(selectedKeys, values, overwrite); setValues({});
    }}>应用预览变更</Button><span role="status" className="text-xs text-muted-foreground">{!selectedKeys.length ? "请选择需要修改的报价行" : !preview.length ? "没有可修改项：请填写内容或核对已填规格" : "应用后仍需保存报价单"}</span></div>
  </details>;
}
