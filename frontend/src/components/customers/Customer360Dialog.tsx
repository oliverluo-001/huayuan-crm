import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCustomerActivity,
  createCustomerContact,
  createCustomerOpportunity,
  createCustomerTodo,
  deleteContact,
  deleteTodo,
  getCustomer360,
  updateOpportunity,
  updateTodo,
  type Activity,
  type Customer360,
  type Opportunity,
} from "@/api/client";
import { canManageCrmData } from "@/auth/permissions";
import { useAuth } from "@/contexts/AuthContext";
import { CUSTOMER_JOURNEY_STAGES, OPPORTUNITY_STAGES } from "@/contracts/crm-stages";
import {
  ACTIVITY_TYPE_LABELS,
  CUSTOMER_TIER_OPTIONS,
  EMAIL_SEND_STATUS_LABELS,
  QUOTE_STATUS_OPTIONS,
  SAMPLE_STATUS_OPTIONS,
  optionLabel,
  statusLabel,
} from "@/contracts/crm-terminology";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface Customer360DialogProps {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerChanged?: () => void;
}

const activityTypes = Object.entries(ACTIVITY_TYPE_LABELS) as Array<[Activity["type"], string]>;

export function Customer360Dialog({
  customerId,
  open,
  onOpenChange,
  onCustomerChanged,
}: Customer360DialogProps) {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const navigate = useNavigate();
  const [data, setData] = useState<Customer360 | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [contactForm, setContactForm] = useState({ name: "", title: "", email: "", phone: "" });
  const [activityForm, setActivityForm] = useState({ type: "note" as Activity["type"], subject: "", content: "" });
  const [todoForm, setTodoForm] = useState({ title: "", dueAt: "", description: "" });
  const [opportunityForm, setOpportunityForm] = useState({
    name: "",
    amount: "",
    stage: "prospecting" as Opportunity["stage"],
  });

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      setData(await getCustomer360(customerId));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "客户详情加载失败");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (open) void refresh(true);
  }, [open, refresh]);

  const mutate = async (action: () => Promise<unknown>, successMessage: string) => {
    setIsSaving(true);
    try {
      await action();
      await refresh(false);
      onCustomerChanged?.();
      toast.success(successMessage);
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const submitContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contactForm.name.trim()) return;
    const succeeded = await mutate(
      () => createCustomerContact(customerId, {
        name: contactForm.name.trim(),
        title: contactForm.title.trim() || undefined,
        email: contactForm.email.trim() || undefined,
        phone: contactForm.phone.trim() || undefined,
        isPrimary: (data?.contacts.length || 0) === 0,
      }),
      "联系人已添加",
    );
    if (succeeded) setContactForm({ name: "", title: "", email: "", phone: "" });
  };

  const submitActivity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activityForm.subject.trim() && !activityForm.content.trim()) return;
    const succeeded = await mutate(
      () => createCustomerActivity(customerId, {
        type: activityForm.type,
        subject: activityForm.subject.trim() || undefined,
        content: activityForm.content.trim() || undefined,
      }),
      "跟进记录已添加，客户摘要已刷新",
    );
    if (succeeded) setActivityForm({ type: "note", subject: "", content: "" });
  };

  const submitTodo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!todoForm.title.trim()) return;
    const succeeded = await mutate(
      () => createCustomerTodo(customerId, {
        title: todoForm.title.trim(),
        dueAt: todoForm.dueAt || undefined,
        description: todoForm.description.trim() || undefined,
      }),
      "待办已创建，客户摘要已刷新",
    );
    if (succeeded) setTodoForm({ title: "", dueAt: "", description: "" });
  };

  const submitOpportunity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!opportunityForm.name.trim()) return;
    const succeeded = await mutate(
      () => createCustomerOpportunity(customerId, {
        name: opportunityForm.name.trim(),
        amount: opportunityForm.amount === "" ? 0 : Number(opportunityForm.amount),
        stage: opportunityForm.stage,
      }),
      "商机已创建，客户跟进阶段已同步",
    );
    if (succeeded) setOpportunityForm({ name: "", amount: "", stage: "prospecting" });
  };

  const goTo = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl">
        <DialogHeader>
          <DialogTitle>客户 360°</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-80 w-full" /></div>
        ) : !data ? (
          <div className="py-12 text-center text-sm text-destructive">
            <p>{error || "客户详情加载失败"}</p>
            <Button className="mt-3" variant="outline" onClick={() => void refresh(true)}>重新加载</Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[78vh] pr-3">
            <div className="space-y-5 pb-4">
              <Card>
                <CardHeader><CardTitle>{data.customer.company}</CardTitle></CardHeader>
                <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Summary label="主营业务" value={data.customer.business} />
                  <Summary label="联系人" value={data.customer.contact} />
                  <Summary label="邮箱" value={data.customer.email} />
                  <Summary label="电话" value={data.customer.phone} />
                  <Summary label="地区" value={[data.customer.region, data.customer.country].filter(Boolean).join(" · ")} />
                  <Summary label="客户分层" value={optionLabel(CUSTOMER_TIER_OPTIONS, data.customer.tier)} />
                  <Summary label="客户跟进阶段" value={optionLabel(CUSTOMER_JOURNEY_STAGES, data.customer.journeyStage, "尚未跟进")} />
                  <Summary label="最近活动" value={data.customer.lastActivityAt ? formatDateTime(data.customer.lastActivityAt) : "暂无活动"} />
                </CardContent>
              </Card>

              <div className="grid gap-5 xl:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base">联系人（{data.contacts.length}）</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {canManage && (
                      <form className="grid gap-2 sm:grid-cols-2" onSubmit={submitContact}>
                        <Input placeholder="姓名 *" value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} required />
                        <Input placeholder="职务" value={contactForm.title} onChange={(event) => setContactForm((current) => ({ ...current, title: event.target.value }))} />
                        <Input type="email" placeholder="邮箱" value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} />
                        <div className="flex gap-2"><Input placeholder="电话" value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} /><Button type="submit" size="icon" disabled={isSaving} title="添加联系人"><Plus className="h-4 w-4" /></Button></div>
                      </form>
                    )}
                    <RecordList empty="暂无联系人">
                      {data.contacts.map((contact) => (
                        <RecordRow key={contact.id} actions={canManage && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="删除联系人" disabled={isSaving} onClick={() => void mutate(() => deleteContact(contact.id), "联系人已删除")}><Trash2 className="h-4 w-4" /></Button>}>
                          <p className="font-medium">{contact.name}{contact.isPrimary && <Badge className="ml-2" variant="secondary">主要联系人</Badge>}</p>
                          <p className="text-xs text-muted-foreground">{[contact.title, contact.email, contact.phone].filter(Boolean).join(" · ") || "未填写联系方式"}</p>
                        </RecordRow>
                      ))}
                    </RecordList>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">活动记录（{data.activities.length}）</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {canManage && (
                      <form className="space-y-2" onSubmit={submitActivity}>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Select value={activityForm.type} onValueChange={(value) => value && setActivityForm((current) => ({ ...current, type: value as Activity["type"] }))}>
                            <SelectTrigger>{statusLabel(ACTIVITY_TYPE_LABELS, activityForm.type, "选择活动类型")}</SelectTrigger>
                            <SelectContent>{activityTypes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input className="sm:col-span-2" placeholder="主题" value={activityForm.subject} onChange={(event) => setActivityForm((current) => ({ ...current, subject: event.target.value }))} />
                        </div>
                        <div className="flex gap-2"><Textarea placeholder="记录沟通内容、客户反馈或下一步计划 *" value={activityForm.content} onChange={(event) => setActivityForm((current) => ({ ...current, content: event.target.value }))} rows={2} /><Button type="submit" size="icon" disabled={isSaving} title="添加跟进记录"><Plus className="h-4 w-4" /></Button></div>
                      </form>
                    )}
                    <RecordList empty="暂无活动记录">
                      {data.activities.map((activity) => (
                        <RecordRow key={activity.id}>
                          <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{activity.subject || "跟进记录"}</p><Badge variant="outline">{statusLabel(ACTIVITY_TYPE_LABELS, activity.type, "其他互动")}</Badge></div>
                          {activity.content && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{activity.content}</p>}
                          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(activity.createdAt)}</p>
                        </RecordRow>
                      ))}
                    </RecordList>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">待办事项（{data.todos.length}）</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {canManage && (
                      <form className="space-y-2" onSubmit={submitTodo}>
                        <div className="grid gap-2 sm:grid-cols-2"><Input placeholder="待办内容 *" value={todoForm.title} onChange={(event) => setTodoForm((current) => ({ ...current, title: event.target.value }))} required /><Input type="date" value={todoForm.dueAt} onChange={(event) => setTodoForm((current) => ({ ...current, dueAt: event.target.value }))} /></div>
                        <div className="flex gap-2"><Input placeholder="补充说明" value={todoForm.description} onChange={(event) => setTodoForm((current) => ({ ...current, description: event.target.value }))} /><Button type="submit" size="icon" disabled={isSaving} title="创建待办"><Plus className="h-4 w-4" /></Button></div>
                      </form>
                    )}
                    <RecordList empty="暂无待办">
                      {data.todos.map((todo) => (
                        <RecordRow key={todo.id} actions={canManage && <div className="flex gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" title={todo.status === "done" ? "重新打开" : "标记完成"} disabled={isSaving} onClick={() => void mutate(() => updateTodo(todo.id, { status: todo.status === "done" ? "open" : "done" }), todo.status === "done" ? "待办已重新打开" : "待办已完成")}>{todo.status === "done" ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="删除待办" disabled={isSaving} onClick={() => void mutate(() => deleteTodo(todo.id), "待办已删除")}><Trash2 className="h-4 w-4" /></Button></div>}>
                          <p className={todo.status === "done" ? "font-medium text-muted-foreground line-through" : "font-medium"}>{todo.title}</p>
                          <p className="text-xs text-muted-foreground">{todo.dueAt ? `截止 ${formatDate(todo.dueAt)}` : "未设置截止日期"} · {todo.status === "done" ? "已完成" : "待处理"}</p>
                        </RecordRow>
                      ))}
                    </RecordList>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">销售商机（{data.opportunities.length}）</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {canManage && (
                      <form className="grid gap-2 sm:grid-cols-3" onSubmit={submitOpportunity}>
                        <Input placeholder="商机名称 *" value={opportunityForm.name} onChange={(event) => setOpportunityForm((current) => ({ ...current, name: event.target.value }))} required />
                        <Input type="number" min="0" step="0.01" placeholder="预计金额（USD）" value={opportunityForm.amount} onChange={(event) => setOpportunityForm((current) => ({ ...current, amount: event.target.value }))} />
                        <div className="flex gap-2"><Select value={opportunityForm.stage} onValueChange={(value) => value && setOpportunityForm((current) => ({ ...current, stage: value as Opportunity["stage"] }))}><SelectTrigger>{optionLabel(OPPORTUNITY_STAGES, opportunityForm.stage, "选择阶段")}</SelectTrigger><SelectContent>{OPPORTUNITY_STAGES.map((stage) => <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>)}</SelectContent></Select><Button type="submit" size="icon" disabled={isSaving} title="创建商机"><Plus className="h-4 w-4" /></Button></div>
                      </form>
                    )}
                    <RecordList empty="暂无商机">
                      {data.opportunities.map((opportunity, index) => (
                        <RecordRow key={opportunity.id} actions={canManage && <Select value={opportunity.stage} onValueChange={(value) => value && void mutate(() => updateOpportunity(opportunity.id, { stage: value as Opportunity["stage"] }), "商机阶段与客户跟进阶段已同步")}><SelectTrigger className="h-8 w-32">{optionLabel(OPPORTUNITY_STAGES, opportunity.stage, "选择阶段")}</SelectTrigger><SelectContent>{OPPORTUNITY_STAGES.map((stage) => <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>)}</SelectContent></Select>}>
                          <p className="font-medium">{opportunity.name}{index === 0 && <Badge className="ml-2" variant="secondary">当前商机</Badge>}</p>
                          <p className="text-xs text-muted-foreground">{optionLabel(OPPORTUNITY_STAGES, opportunity.stage)} · USD {Number(opportunity.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} · 成交概率 {opportunity.probability ?? 0}%</p>
                        </RecordRow>
                      ))}
                    </RecordList>
                  </CardContent>
                </Card>

                <RelationCard title={`报价记录（${data.quotes.length}）`} empty="暂无报价记录" actionLabel="报价管理" onAction={() => goTo("/quotes")}>
                  {data.quotes.map((quote) => <RecordRow key={quote.id}><p className="font-medium">{quote.quoteNo || "未编号报价"}<Badge className="ml-2" variant="outline">{optionLabel(QUOTE_STATUS_OPTIONS, quote.status)}</Badge></p><p className="text-xs text-muted-foreground">{quote.currency || "USD"} {Number(quote.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} · {quote.items.map((item) => item.productName).join("、") || "未填写产品"} · {formatDate(quote.updatedAt || quote.createdAt)}</p></RecordRow>)}
                </RelationCard>

                <RelationCard title={`样品记录（${data.samples.length}）`} empty="暂无样品记录" actionLabel="样品跟进" onAction={() => goTo("/samples")}>
                  {data.samples.map((sample) => <RecordRow key={sample.id}><p className="font-medium">{sample.productName || "未填写产品"}<Badge className="ml-2" variant="outline">{optionLabel(SAMPLE_STATUS_OPTIONS, sample.status)}</Badge></p><p className="text-xs text-muted-foreground">{sample.quantity} {sample.unit || "件"}{sample.trackingNo ? ` · 物流单号 ${sample.trackingNo}` : ""}{sample.sentAt ? ` · 寄出 ${formatDate(sample.sentAt)}` : ""}</p></RecordRow>)}
                </RelationCard>

                <RelationCard title={`邮件记录（${data.sendLogs?.length || 0}）`} empty="暂无邮件记录" actionLabel="邮件发送" onAction={() => goTo("/marketing")}>
                  {(data.sendLogs || []).map((log) => <RecordRow key={log.id}><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{log.subject || log.templateName || "邮件"}</p><Badge variant={log.status === "sent" ? "default" : "destructive"}>{statusLabel(EMAIL_SEND_STATUS_LABELS, log.status)}</Badge></div><p className="text-xs text-muted-foreground">收件人 {log.email}{log.taskName ? ` · ${log.taskName}` : ""} · {formatDateTime(log.createdAt)}</p>{log.message && <p className="mt-1 text-xs text-destructive">{log.message}</p>}</RecordRow>)}
                </RelationCard>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value }: { label: string; value?: string | number | null }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value || "-"}</p></div>;
}

function RelationCard({
  title,
  empty,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  empty: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return <Card><CardHeader><CardTitle className="flex items-center justify-between text-base">{title}<Button type="button" variant="link" size="sm" onClick={onAction}>{actionLabel}<ExternalLink className="ml-1 h-3.5 w-3.5" /></Button></CardTitle></CardHeader><CardContent><RecordList empty={empty}>{children}</RecordList></CardContent></Card>;
}

function RecordList({ empty, children }: { empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className="max-h-64 space-y-2 overflow-y-auto">{hasChildren ? children : <p className="py-5 text-center text-sm text-muted-foreground">{empty}</p>}</div>;
}

function RecordRow({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1">{children}</div>{actions}</div>;
}

function formatDate(value?: string | Date) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "-";
}

function formatDateTime(value?: string | Date) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}
