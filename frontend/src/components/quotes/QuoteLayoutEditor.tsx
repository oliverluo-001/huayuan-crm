import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cloneQuoteOutputLayout,
  createQuoteSection,
  DEFAULT_QUOTE_OUTPUT_LAYOUT,
  QUOTE_SECTION_DEFINITIONS,
  type QuoteOutputLayout,
  type QuoteOutputSection,
  type QuoteOutputSectionType,
} from "@/contracts/quote-output-layout";

export function QuoteLayoutEditor({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: QuoteOutputLayout;
  onChange: (layout: QuoteOutputLayout) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const updateSection = (id: string, updates: Partial<QuoteOutputSection>) => {
    onChange({ ...value, sections: value.sections.map((section) => section.id === id ? { ...section, ...updates } : section) });
  };

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= value.sections.length) return;
    const sections = [...value.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    onChange({ ...value, sections });
  };

  const add = (type: QuoteOutputSectionType) => {
    onChange({ ...value, sections: [...value.sections, createQuoteSection(type)] });
  };

  const remove = (section: QuoteOutputSection) => {
    if (!['custom_text', 'page_break'].includes(section.type)) return;
    onChange({ ...value, sections: value.sections.filter((item) => item.id !== section.id) });
  };

  return (
    <div className={`grid gap-4 ${compact ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "xl:grid-cols-[minmax(0,1fr)_380px]"}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="quote-accent">主题色</Label>
            <div className="flex items-center gap-2">
              <Input id="quote-accent" className="h-9 w-16 p-1" type="color" disabled={disabled} value={value.accentColor} onChange={(event) => onChange({ ...value, accentColor: event.target.value })} />
              <Input className="h-9 w-28 font-mono" disabled={disabled} value={value.accentColor} onChange={(event) => /^#[0-9a-fA-F]{0,6}$/.test(event.target.value) && onChange({ ...value, accentColor: event.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => add("custom_text")}><Plus className="mr-1 h-4 w-4" />自定义内容</Button>
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => add("page_break")}><Plus className="mr-1 h-4 w-4" />分页</Button>
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(cloneQuoteOutputLayout(DEFAULT_QUOTE_OUTPUT_LAYOUT))}><RotateCcw className="mr-1 h-4 w-4" />恢复标准版式</Button>
          </div>
        </div>

        {value.sections.map((section, index) => {
          const definition = QUOTE_SECTION_DEFINITIONS[section.type];
          return (
            <div key={section.id} className={`rounded-lg border p-3 ${section.enabled ? "bg-background" : "bg-muted/40 opacity-75"}`}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  disabled={disabled}
                  onClick={() => updateSection(section.id, { enabled: !section.enabled })}
                >
                  {section.enabled ? <Eye className="h-4 w-4 shrink-0" /> : <EyeOff className="h-4 w-4 shrink-0" />}
                  <span className="truncate font-medium">{index + 1}. {definition.label}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{section.enabled ? "显示" : "隐藏"}</span>
                </button>
                <Button type="button" size="icon-sm" variant="ghost" title="上移" disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                <Button type="button" size="icon-sm" variant="ghost" title="下移" disabled={disabled || index === value.sections.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                {['custom_text', 'page_break'].includes(section.type) && <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" title="删除模块" disabled={disabled} onClick={() => remove(section)}><Trash2 /></Button>}
              </div>

              {section.type !== "page_break" && <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>中文标题</Label><Input disabled={disabled} value={section.titleZh} onChange={(event) => updateSection(section.id, { titleZh: event.target.value })} /></div>
                <div className="space-y-1.5"><Label>English title</Label><Input disabled={disabled} value={section.titleEn} onChange={(event) => updateSection(section.id, { titleEn: event.target.value })} /></div>
              </div>}

              {definition.fields?.length ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3">
                {definition.fields.map((field) => {
                  const checked = section.fields?.includes(field.key) ?? false;
                  return <label key={field.key} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => updateSection(section.id, { fields: event.target.checked ? [...(section.fields || []), field.key] : (section.fields || []).filter((item) => item !== field.key) })} />{field.label}</label>;
                })}
              </div> : null}

              {section.type === "custom_text" && <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>中文内容</Label><Textarea rows={4} disabled={disabled} value={section.contentZh || ""} onChange={(event) => updateSection(section.id, { contentZh: event.target.value })} /></div>
                <div className="space-y-1.5"><Label>English content</Label><Textarea rows={4} disabled={disabled} value={section.contentEn || ""} onChange={(event) => updateSection(section.id, { contentEn: event.target.value })} /></div>
              </div>}
              {section.type === "page_break" && <p className="mt-2 text-xs text-muted-foreground">从这里开始新的一页，PDF、Excel 打印和网页打印都会遵循此设置。</p>}
            </div>
          );
        })}
      </div>

      <QuoteLayoutPreview layout={value} />
    </div>
  );
}

function QuoteLayoutPreview({ layout }: { layout: QuoteOutputLayout }) {
  const sections = layout.sections.filter((section) => section.enabled && section.type !== "footer");
  return <aside className="xl:sticky xl:top-4 xl:self-start">
    <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">A4 实时预览</span><span className="text-xs text-muted-foreground">结构预览</span></div>
    <div className="aspect-[210/297] overflow-hidden rounded-sm border bg-white p-5 text-[8px] text-slate-800 shadow-sm">
      {sections.map((section) => <PreviewSection key={section.id} section={section} accent={layout.accentColor} />)}
      {layout.sections.some((section) => section.enabled && section.type === "footer") && <div className="mt-3 border-t pt-1 text-center text-[6px] text-slate-400">HUAYUAN · Page 1 / 1</div>}
    </div>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">实际客户、产品、金额和公司资料会在生成报价时自动填入；预览用于确认模块顺序和显示范围。</p>
  </aside>;
}

function PreviewSection({ section, accent }: { section: QuoteOutputSection; accent: string }) {
  if (section.type === "page_break") return <div className="my-2 border-t border-dashed border-slate-400 pt-1 text-center text-[6px] text-slate-400">分页</div>;
  if (section.type === "header") return <div className="mb-3 flex justify-between border-b pb-2" style={{ borderColor: accent }}><div><strong className="text-[13px]" style={{ color: accent }}>{section.titleZh}</strong><div className="text-slate-400">HUAYUAN FLANGE</div></div><div className="text-right">NO. Q-2026-001<br />2026-08-24</div></div>;
  const fields = QUOTE_SECTION_DEFINITIONS[section.type].fields?.filter((field) => section.fields?.includes(field.key)) || [];
  if (section.type === "items") {
    const examples: Record<string, string> = { description: "Weld Neck Flange", unit: "pcs", quantity: "100", unitPrice: "12.50", discount: "0%", amount: "1,250.00" };
    return <div className="mb-3"><PreviewTitle section={section} accent={accent} /><table className="w-full border-collapse"><thead><tr><th className="border p-1">#</th>{fields.map((field) => <th key={field.key} className="border bg-slate-100 p-1">{field.label}</th>)}</tr></thead><tbody><tr><td className="border p-1">1</td>{fields.map((field) => <td key={field.key} className="border p-1">{examples[field.key]}</td>)}</tr></tbody></table></div>;
  }
  if (section.type === "totals") return <div className="mb-3 ml-auto w-2/3"><PreviewTitle section={section} accent={accent} />{fields.map((field) => <div key={field.key} className="flex justify-between border-b py-0.5"><span>{field.label}</span><span>示例金额</span></div>)}</div>;
  if (section.type === "custom_text") return <div className="mb-3"><PreviewTitle section={section} accent={accent} /><p className="whitespace-pre-line text-slate-500">{section.contentZh || section.contentEn || "自定义说明内容"}</p></div>;
  return <div className="mb-3"><PreviewTitle section={section} accent={accent} /><div className="grid grid-cols-2 gap-x-3 gap-y-1">{fields.map((field) => <div key={field.key} className="flex gap-1 border-b border-slate-100 py-0.5"><span className="text-slate-400">{field.label}</span><span className="ml-auto">示例</span></div>)}</div></div>;
}

function PreviewTitle({ section, accent }: { section: QuoteOutputSection; accent: string }) {
  return <div className="mb-1 border-b pb-0.5 font-semibold" style={{ color: accent, borderColor: `${accent}55` }}>{section.titleZh}{section.titleEn ? ` / ${section.titleEn}` : ""}</div>;
}
