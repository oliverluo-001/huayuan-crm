import { useEffect, useMemo, useState } from "react";
import { CopyPlus, Save, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createQuoteOutputTemplate,
  deleteQuoteOutputTemplate,
  getQuoteOutputTemplates,
  updateQuoteOutputTemplate,
} from "@/api/client";
import { QuoteLayoutEditor } from "@/components/quotes/QuoteLayoutEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cloneQuoteOutputLayout,
  DEFAULT_QUOTE_OUTPUT_LAYOUT,
  type QuoteOutputLayout,
  type QuoteOutputTemplate,
} from "@/contracts/quote-output-layout";

export function QuoteTemplateManager() {
  const [templates, setTemplates] = useState<QuoteOutputTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | "new">("new");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [layout, setLayout] = useState<QuoteOutputLayout>(() => cloneQuoteOutputLayout(DEFAULT_QUOTE_OUTPUT_LAYOUT));
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => templates.find((template) => template.id === selectedId), [selectedId, templates]);

  const load = async (preferredId?: number) => {
    const data = await getQuoteOutputTemplates();
    setTemplates(data);
    const target = data.find((template) => template.id === preferredId) || data.find((template) => template.isDefault) || data[0];
    if (target) selectTemplate(target);
  };

  useEffect(() => { void load(); }, []);

  const selectTemplate = (template: QuoteOutputTemplate) => {
    setSelectedId(template.id);
    setName(template.name);
    setDescription(template.description || "");
    setActive(template.active);
    setLayout(cloneQuoteOutputLayout(template.layout));
  };

  const startNew = () => {
    setSelectedId("new");
    setName("");
    setDescription("");
    setActive(true);
    setLayout(cloneQuoteOutputLayout(selected?.layout || DEFAULT_QUOTE_OUTPUT_LAYOUT));
  };

  const save = async () => {
    if (!name.trim()) return toast.error("请输入版式模板名称");
    setBusy(true);
    try {
      const saved = selectedId === "new"
        ? await createQuoteOutputTemplate({ name: name.trim(), description: description.trim(), active, layout })
        : await updateQuoteOutputTemplate(selectedId, { name: name.trim(), description: description.trim(), active, layout });
      await load(saved.id);
      toast.success(selectedId === "new" ? "报价版式模板已创建" : "报价版式模板已更新");
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async () => {
    if (selectedId === "new") return toast.error("请先保存模板");
    setBusy(true);
    try {
      await updateQuoteOutputTemplate(selectedId, { isDefault: true });
      await load(selectedId);
      toast.success("已设为默认报价版式");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (selectedId === "new" || !selected) return;
    if (!confirm(`确定删除报价版式“${selected.name}”吗？历史报价快照不会受影响。`)) return;
    setBusy(true);
    try {
      await deleteQuoteOutputTemplate(selectedId);
      setSelectedId("new");
      startNew();
      await load();
      toast.success("报价版式模板已删除");
    } finally { setBusy(false); }
  };

  return <Card>
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center justify-between gap-2"><span>报价版式模板</span><Badge variant="secondary">{templates.length} 个模板</Badge></CardTitle>
      <CardDescription>统一管理报价单模块、顺序、字段和主题色。模板用于新报价，已保存的历史报价始终保留自己的版式快照。</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <Button type="button" variant={selectedId === "new" ? "default" : "outline"} className="w-full justify-start" onClick={startNew}><CopyPlus className="mr-2 h-4 w-4" />新建模板</Button>
          {templates.map((template) => <button key={template.id} type="button" onClick={() => selectTemplate(template)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === template.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
            <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{template.name}</strong>{template.isDefault && <Badge>默认</Badge>}</div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description || "暂无说明"}</p>
            {!template.active && <span className="mt-2 inline-block text-xs text-amber-700">已停用</span>}
          </button>)}
        </aside>
        <div className="space-y-4 rounded-lg border p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>模板名称 *</Label><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="例如：标准出口报价" /></div>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={active} disabled={selected?.isDefault} onChange={(event) => setActive(event.target.checked)} />允许销售在新报价中使用</label>
            <div className="space-y-2 md:col-span-2"><Label>模板说明</Label><Textarea rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明该版式适用的客户、国家或业务场景" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={save}><Save className="mr-2 h-4 w-4" />{busy ? "保存中..." : selectedId === "new" ? "创建模板" : "保存修改"}</Button>
            <Button type="button" variant="outline" disabled={busy || selectedId === "new" || selected?.isDefault} onClick={makeDefault}><Star className="mr-2 h-4 w-4" />设为默认</Button>
            <Button type="button" variant="ghost" className="text-destructive" disabled={busy || selectedId === "new" || selected?.isDefault} onClick={remove}><Trash2 className="mr-2 h-4 w-4" />删除模板</Button>
          </div>
        </div>
      </div>
      <QuoteLayoutEditor value={layout} onChange={setLayout} compact />
    </CardContent>
  </Card>;
}
