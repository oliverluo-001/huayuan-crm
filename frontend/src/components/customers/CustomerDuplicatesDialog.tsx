import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitMerge, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getDuplicateCustomerGroups,
  mergeDuplicateCustomers,
  previewDuplicateCustomerMerge,
  type DuplicateCustomerGroup,
  type DuplicateCustomerGroupsResult,
  type DuplicateMergePreview,
  type UserDirectoryEntry,
} from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CustomerDuplicatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void | Promise<void>;
  users: UserDirectoryEntry[];
}

const RELATION_LABELS: Record<string, string> = {
  contacts: "联系人",
  activities: "跟进记录",
  todos: "待办任务",
  opportunities: "商机",
  quotes: "报价",
  samples: "样品",
  attachments: "附件",
  emailLogs: "邮件历史",
  emailRecipients: "邮件任务收件人",
  leads: "来源线索",
};

export function CustomerDuplicatesDialog({
  open,
  onOpenChange,
  onMerged,
  users,
}: CustomerDuplicatesDialogProps) {
  const [result, setResult] = useState<DuplicateCustomerGroupsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateCustomerGroup | null>(null);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [duplicateIds, setDuplicateIds] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<DuplicateMergePreview | null>(null);
  const [fieldSelections, setFieldSelections] = useState<Record<string, number>>({});
  const [primaryContactSelection, setPrimaryContactSelection] = useState("none");
  const [acknowledged, setAcknowledged] = useState(false);
  const [merging, setMerging] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getDuplicateCustomerGroups();
      setResult(next);
      setSelectedGroup(null);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadGroups();
  }, [open, loadGroups]);

  const chooseGroup = (group: DuplicateCustomerGroup) => {
    const primary = group.members[0]?.id ?? null;
    setSelectedGroup(group);
    setPrimaryId(primary);
    setDuplicateIds(new Set(group.members.filter((member) => member.id !== primary).map((member) => member.id)));
    setPreview(null);
    setAcknowledged(false);
  };

  const choosePrimary = (id: number) => {
    if (!selectedGroup) return;
    setPrimaryId(id);
    setDuplicateIds(new Set(selectedGroup.members.filter((member) => member.id !== id).map((member) => member.id)));
    setPreview(null);
    setAcknowledged(false);
  };

  const toggleDuplicate = (id: number, checked: boolean) => {
    const next = new Set(duplicateIds);
    if (checked) next.add(id);
    else next.delete(id);
    setDuplicateIds(next);
    setPreview(null);
    setAcknowledged(false);
  };

  const generatePreview = async () => {
    if (!primaryId || duplicateIds.size === 0) {
      toast.error("请选择一个主客户和至少一个需要合并的重复客户");
      return;
    }
    setLoading(true);
    try {
      const next = await previewDuplicateCustomerMerge({
        primaryCustomerId: primaryId,
        duplicateCustomerIds: [...duplicateIds],
      });
      setPreview(next);
      setFieldSelections(next.defaultFieldSelections);
      setPrimaryContactSelection(next.defaultPrimaryContactSelection);
      setAcknowledged(false);
    } finally {
      setLoading(false);
    }
  };

  const conflictCount = preview?.fields.filter((field) => field.conflict).length || 0;
  const selectedOverwrites = useMemo(() => {
    if (!preview) return [];
    return preview.fields.filter((field) => {
      const selectedId = fieldSelections[field.key] ?? preview.primary.id;
      const primaryValue = field.values.find((value) => value.isPrimary)?.value;
      const selectedValue = field.values.find((value) => value.customerId === selectedId)?.value;
      return selectedId !== preview.primary.id && hasValue(primaryValue) && comparable(primaryValue) !== comparable(selectedValue);
    });
  }, [preview, fieldSelections]);

  const executeMerge = async () => {
    if (!preview || !primaryId) return;
    setMerging(true);
    try {
      const merged = await mergeDuplicateCustomers({
        primaryCustomerId: primaryId,
        duplicateCustomerIds: [...duplicateIds],
        previewToken: preview.previewToken,
        fieldSelections,
        primaryContactSelection,
        acknowledgeConflicts: acknowledged,
      });
      const moved = Object.values(merged.movedRelations).reduce((sum, count) => sum + Number(count || 0), 0);
      toast.success(`合并完成：保留 ${merged.customer.company}，迁移 ${moved} 条关联记录`);
      await onMerged();
      await loadGroups();
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[1180px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            重复客户管理
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/25 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              按邮箱、企业域名、电话及规范化公司名称识别。只有确认预览后才会合并，不会静默覆盖主客户资料。
            </p>
            <Button variant="outline" size="sm" onClick={loadGroups} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              重新扫描
            </Button>
          </div>
          {result && (
            <div className="mt-2 flex gap-2">
              <Badge variant="outline">扫描 {result.summary.scannedCustomers} 个客户</Badge>
              <Badge variant="secondary">发现 {result.summary.duplicateGroups} 组</Badge>
              <Badge variant="secondary">涉及 {result.summary.duplicateCustomers} 个客户</Badge>
            </div>
          )}
        </div>

        {!selectedGroup ? (
          <DuplicateGroupList groups={result?.groups || []} loading={loading} onChoose={chooseGroup} users={users} />
        ) : !preview ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">选择主客户和合并范围</h3>
                <p className="text-sm text-muted-foreground">主客户将保留，其他勾选记录及其关联数据会迁移到主客户。</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedGroup(null)}>返回重复组</Button>
            </div>
            <div className="space-y-2">
              {selectedGroup.members.map((member) => (
                <div key={member.id} className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[150px_1fr] ${primaryId === member.id ? "border-primary bg-primary/5" : ""}`}>
                  <label className="flex items-center gap-2 font-medium">
                    <input type="radio" name="primaryCustomer" checked={primaryId === member.id} onChange={() => choosePrimary(member.id)} />
                    设为主客户
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CustomerIdentity member={member} users={users} />
                    {primaryId !== member.id && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={duplicateIds.has(member.id)} onCheckedChange={(checked) => toggleDuplicate(member.id, checked === true)} />
                        合并此客户
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedGroup.matches.map((match) => (
                <Badge key={`${match.type}-${match.value}`} variant="outline">{match.label}：{match.value}</Badge>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={generatePreview} disabled={loading || !primaryId || duplicateIds.size === 0}>
                {loading ? "正在生成预览..." : "生成合并预览"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">合并预览</h3>
                <p className="text-sm text-muted-foreground">主客户：{preview.primary.company}（{preview.primary.customerId}）</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPreview(null)}>重新选择</Button>
            </div>

            {preview.warnings.map((warning) => (
              <div key={warning} className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {warning}
              </div>
            ))}

            <section className="space-y-2">
              <h4 className="font-medium">将迁移的关联数据</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客户</TableHead>
                    {Object.keys(RELATION_LABELS).map((key) => <TableHead key={key}>{RELATION_LABELS[key]}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[preview.primary, ...preview.duplicates].map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.company}{member.id === preview.primary.id ? "（主客户）" : ""}</TableCell>
                      {Object.keys(RELATION_LABELS).map((key) => <TableCell key={key}>{preview.relationCounts[String(member.id)]?.[key] || 0}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section className="space-y-2">
              <h4 className="font-medium">合并后的主联系人</h4>
              <p className="text-sm text-muted-foreground">所有联系人都会保留；这里选择的联系人将用于客户列表中的联系人、邮箱和电话摘要。</p>
              {preview.contactOptions.length ? (
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={primaryContactSelection}
                  onChange={(event) => setPrimaryContactSelection(event.target.value)}
                >
                  {preview.contactOptions.map((contact) => (
                    <option key={contact.key} value={contact.key}>
                      {contact.company}：{contact.name || "未命名联系人"} · {contact.email || "无邮箱"} · {contact.phone || "无电话"}{contact.synthetic ? "（来自客户摘要，将创建联系人）" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">这些客户尚无联系人资料，合并后可在客户 360° 中新增主联系人。</p>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-medium">主客户字段选择</h4>
                <Badge variant={conflictCount ? "destructive" : "outline"}>{conflictCount} 个字段冲突</Badge>
              </div>
              <p className="text-sm text-muted-foreground">每一项都明确显示来源。选择其他客户的值时，才会修改主客户字段。</p>
              <div className="max-h-[360px] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">字段</TableHead>
                      <TableHead>最终保留值及来源</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.fields.map((field) => (
                      <TableRow key={field.key} className={field.conflict ? "bg-amber-50/60" : ""}>
                        <TableCell className="font-medium">
                          {field.label}
                          {field.conflict && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-800">冲突</Badge>}
                        </TableCell>
                        <TableCell>
                          <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={fieldSelections[field.key] ?? preview.primary.id}
                            onChange={(event) => setFieldSelections((current) => ({ ...current, [field.key]: Number(event.target.value) }))}
                          >
                            {field.values.map((value) => (
                              <option key={value.customerId} value={value.customerId}>
                                {value.company}{value.isPrimary ? "（主客户）" : ""}：{formatValue(value.value)}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <div className="rounded-lg border p-3 text-sm">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium">合并安全规则</p>
                  <p className="text-muted-foreground">所有关联数据整体迁移；来源客户、来源渠道、字段选择和迁移数量写入不可丢失的合并历史与系统审计。被合并客户不会出现在回收站，也不能误恢复。</p>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} />
              <span>
                我已核对合并预览，确认保留“{preview.primary.company}”作为主客户
                {selectedOverwrites.length > 0 ? `，并明确同意替换 ${selectedOverwrites.map((field) => field.label).join("、")}` : "，且不覆盖主客户已有重要字段"}。
              </span>
            </label>

            <Separator />
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>返回修改</Button>
              <Button onClick={executeMerge} disabled={merging || !acknowledged || !preview.mergeAllowed}>
                <GitMerge className="mr-1 h-4 w-4" />
                {merging ? "正在合并..." : `确认合并 ${preview.duplicates.length} 个客户`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DuplicateGroupList({ groups, loading, onChoose, users }: { groups: DuplicateCustomerGroup[]; loading: boolean; onChoose: (group: DuplicateCustomerGroup) => void; users: UserDirectoryEntry[] }) {
  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">正在扫描重复客户...</div>;
  if (!groups.length) return <div className="rounded-lg border border-dashed py-16 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-emerald-600" /><p className="font-medium">未发现重复客户</p><p className="text-sm text-muted-foreground">邮箱、企业域名、电话和公司名称均未形成重复组。</p></div>;
  return <div className="space-y-3">{groups.map((group, index) => <button key={group.id} type="button" onClick={() => onChoose(group)} className="w-full rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-muted/30"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">重复组 {index + 1} · {group.members.length} 个客户</div><Badge variant={group.confidence >= 90 ? "destructive" : "secondary"}>最高匹配度 {group.confidence}%</Badge></div><div className="grid gap-2 md:grid-cols-2">{group.members.map((member) => <div key={member.id} className="rounded-md bg-muted/40 p-2"><CustomerIdentity member={member} users={users} /></div>)}</div><div className="mt-3 flex flex-wrap gap-2">{group.matches.map((match) => <Badge key={`${match.type}-${match.value}`} variant="outline">{match.label}：{match.value}</Badge>)}</div></button>)}</div>;
}

function CustomerIdentity({ member, users }: { member: DuplicateCustomerGroup["members"][number]; users: UserDirectoryEntry[] }) {
  const owner = users.find((user) => user.id === member.ownerId)?.displayName || member.ownerId || "未分配";
  return <div><p className="font-medium">{member.company || "未填写公司名称"}</p><p className="text-xs text-muted-foreground">{member.email || "无邮箱"} · {member.phone || "无电话"} · {member.customerId}</p><p className="text-xs text-muted-foreground">来源：{member.source || "未记录"} · 负责人：{owner} · 创建于 {new Date(member.createdAt).toLocaleDateString()}</p></div>;
}

function formatValue(value: unknown) {
  if (!hasValue(value)) return "（空）";
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function hasValue(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function comparable(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  return String(value ?? "").trim().toLowerCase();
}
