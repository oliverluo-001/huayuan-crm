import { useCallback, useEffect, useState } from "react";
import { AlertCircle, BarChart3, CheckSquare, DollarSign, Mail, RefreshCw, Target, TrendingUp, Users } from "lucide-react";
import { getDashboard, type DashboardSnapshot } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OPPORTUNITY_STAGES } from "@/contracts/crm-stages";
import {
  B2B_TASK_STATUS_LABELS,
  EMAIL_SEND_STATUS_LABELS,
  EMAIL_TASK_STATUS_LABELS,
  statusLabel,
} from "@/contracts/crm-terminology";

interface DashboardProps { onNavigate?: (page: string) => void }

export function Dashboard({ onNavigate }: DashboardProps) {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      setData(await getDashboard());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "仪表盘加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (loading) return <DashboardSkeleton />;
  if (!data) return (
    <Card><CardContent className="flex items-center gap-3 py-8 text-sm text-destructive">
      <AlertCircle className="h-5 w-5" />{error || "暂无仪表盘数据"}
      <Button variant="outline" size="sm" onClick={() => void refresh(true)}>重试</Button>
    </CardContent></Card>
  );

  const d = data.metrics;
  const metrics = [
    { label: "客户总数", value: d.customerTotal, note: `近 7 天新增 ${d.newCustomers7d}`, icon: Users },
    { label: "潜在客户线索", value: d.leadTotal, note: `高可信线索 ${d.highConfidenceLeads}`, icon: Target },
    { label: "可联系线索", value: d.contactableLeads, note: data.scope === "owned" ? "仅显示本人负责客户" : "已通过清洗与评分", icon: Mail },
    { label: "发送成功", value: d.sentTotal, note: `失败或退信 ${d.failedTotal}`, icon: TrendingUp },
    { label: "待办事项", value: d.openTodoCount, note: `逾期 ${d.overdueTodoCount}`, icon: CheckSquare },
  ];
  const funnel = [
    ["企业候选", d.leadTotal], ["高可信线索", d.highConfidenceLeads],
    ["可联系线索", d.contactableLeads], ["客户", d.customerTotal],
  ] as const;
  const funnelMax = Math.max(1, ...funnel.map((item) => item[1]));

  return <div className="space-y-5">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-semibold">业务概览</h2>
        <p className="text-sm text-muted-foreground">{data.scope === "owned" ? "本人负责范围" : "全公司范围"}</p>
      </div>
      <Button variant="outline" size="icon" title="刷新仪表盘" onClick={() => void refresh(false)}>
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map(({ label, value, note, icon: Icon }) => <Card key={label}>
        <CardContent className="flex items-center justify-between p-4">
          <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>
          <Icon className="h-7 w-7 text-primary" />
        </CardContent>
      </Card>)}
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" />近 30 天业务趋势</CardTitle>
      </CardHeader>
      <CardContent>
        <TrendChart days={data.trends.days30} />
      </CardContent>
    </Card>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><DollarSign className="h-4 w-4" />销售漏斗</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <SummaryValue label="未结商机金额" value={formatMoney(data.salesFunnel.openValue)} />
          <SummaryValue label="加权预计金额" value={formatMoney(data.salesFunnel.weightedValue)} />
          <SummaryValue label="赢单率" value={`${data.salesFunnel.winRate}%`} />
        </div>
        <div className="space-y-2">
          {data.salesFunnel.stages.map((item) => {
            const maxValue = Math.max(1, ...data.salesFunnel.stages.map((stage) => stage.value));
            return <div key={item.stage}>
              <div className="mb-1 flex justify-between text-xs"><span>{OPPORTUNITY_STAGES.find((stage) => stage.value === item.stage)?.label || "未知阶段"} · {item.count} 个</span><strong>{formatMoney(item.value)}</strong></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(item.value ? 4 : 0, item.value / maxValue * 100)}%` }} /></div>
            </div>;
          })}
        </div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">发信效果（近 30 天）</CardTitle></CardHeader><CardContent className="space-y-5">
        <div className="grid grid-cols-4 gap-2">
          <SummaryValue label="总计" value={String(data.emailPerformance.total)} />
          <SummaryValue label="发送成功" value={String(data.emailPerformance.sent)} />
          <SummaryValue label="失败" value={String(data.emailPerformance.failed)} />
          <SummaryValue label="退信" value={String(data.emailPerformance.bounced)} />
        </div>
        <RateBar label="发送成功率" value={data.emailPerformance.deliveryRate} className="bg-primary" />
        <RateBar label="退信率" value={data.emailPerformance.bounceRate} className="bg-destructive" />
      </CardContent></Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-base">获客转化漏斗</CardTitle></CardHeader><CardContent className="space-y-4">
        {funnel.map(([label, value]) => <div key={label}>
          <div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{value}</strong></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(value ? 5 : 0, value / funnelMax * 100)}%` }} /></div>
        </div>)}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">进行中的任务</CardTitle></CardHeader><CardContent className="space-y-3">
        {[...data.activeTasks.leads.map((task) => ({ ...task, kind: "获客" as const })), ...data.activeTasks.emails.map((task) => ({ ...task, kind: "发信" as const }))].slice(0, 6).map((task) =>
          <div key={`${task.kind}-${task.id}`} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
            <div><p className="font-medium">{task.name}</p><p className="text-xs text-muted-foreground">{task.kind}任务 · {statusLabel(task.kind === "获客" ? B2B_TASK_STATUS_LABELS : EMAIL_TASK_STATUS_LABELS, task.status)}</p></div>
            <Badge variant="secondary">{task.current}/{task.target}</Badge>
          </div>)}
        {!data.activeTasks.leads.length && !data.activeTasks.emails.length && <Empty text={data.scope === "owned" ? "销售账号不展示全局任务" : "暂无进行中的任务"} />}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center justify-between text-base">待办提醒<Button variant="link" size="sm" onClick={() => onNavigate?.("opportunities")}>查看商机</Button></CardTitle></CardHeader><CardContent className="space-y-3">
        {data.openTodos.slice(0, 6).map((todo) => <div key={todo.id} className="flex gap-2 text-sm">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${todo.dueAt && new Date(todo.dueAt) < new Date() ? "bg-destructive" : "bg-amber-500"}`} />
          <div><p className="font-medium">{todo.title}</p><p className="text-xs text-muted-foreground">{todo.customerName || "未关联客户"}{todo.dueAt ? ` · ${new Date(todo.dueAt).toLocaleDateString()}` : ""}</p></div>
        </div>)}
        {!data.openTodos.length && <Empty text="暂无待办" />}
      </CardContent></Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">发信统计</CardTitle></CardHeader><CardContent>
        <div className="grid grid-cols-2 gap-3">
          <ActivityBox title="近 7 天" data={data.emailActivity.days7} />
          <ActivityBox title="近 30 天" data={data.emailActivity.days30} />
        </div>
        <div className="mt-4 space-y-2">{data.emailActivity.byTemplate.slice(0, 5).map((item) =>
          <div key={item.name} className="flex justify-between text-sm"><span className="truncate">{item.name}</span><span>{item.sent}/{item.total} · {item.rate}%</span></div>)}
          {!data.emailActivity.byTemplate.length && <Empty text="暂无模板发送数据" />}
        </div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center justify-between text-base">最近发信记录<Button variant="link" size="sm" onClick={() => onNavigate?.("marketing")}>邮件发送</Button></CardTitle></CardHeader><CardContent className="space-y-3">
        {data.recentSendLogs.slice(0, 6).map((log) => <div key={log.id} className="flex items-center gap-3 text-sm">
          <Badge variant={log.status === "sent" ? "default" : "destructive"}>{statusLabel(EMAIL_SEND_STATUS_LABELS, log.status)}</Badge>
          <div className="min-w-0"><p className="truncate font-medium">{log.email}</p><p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()} · {log.templateName || log.message || "邮件"}</p></div>
        </div>)}
        {!data.recentSendLogs.length && <Empty text="暂无发信记录" />}
      </CardContent></Card>
    </div>
  </div>;
}

function ActivityBox({ title, data }: { title: string; data: { total: number; sent: number; failed: number; rate: number } }) {
  return <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{title}</p><p className="text-xl font-semibold">{data.sent}/{data.total}</p><p className="text-xs text-muted-foreground">成功率 {data.rate}% · 失败 {data.failed}</p></div>;
}

function TrendChart({ days }: { days: DashboardSnapshot["trends"]["days30"] }) {
  const max = Math.max(1, ...days.flatMap((day) => [day.customers, day.sent, day.failed + day.bounced]));
  return <div>
    <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
      <Legend color="bg-blue-500" label="新增客户" />
      <Legend color="bg-emerald-500" label="发送成功" />
      <Legend color="bg-red-500" label="失败/退信" />
    </div>
    <div className="flex h-44 items-end gap-1 border-b border-l px-2 pt-3">
      {days.map((day, index) => <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px" title={`${day.date}：新增客户 ${day.customers}，发送成功 ${day.sent}，失败/退信 ${day.failed + day.bounced}`}>
        <TrendBar value={day.customers} max={max} className="bg-blue-500" />
        <TrendBar value={day.sent} max={max} className="bg-emerald-500" />
        <TrendBar value={day.failed + day.bounced} max={max} className="bg-red-500" />
        {(index === 0 || index === 14 || index === days.length - 1) && <span className="absolute -bottom-5 whitespace-nowrap text-[10px] text-muted-foreground">{day.date.slice(5)}</span>}
      </div>)}
    </div>
    <div className="h-5" />
  </div>;
}

function TrendBar({ value, max, className }: { value: number; max: number; className: string }) {
  return <div className={`w-1/3 max-w-2 rounded-t-sm ${className}`} style={{ height: `${Math.max(value ? 3 : 0, value / max * 100)}%` }} />;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>;
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3 text-center"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function RateBar({ label, value, className }: { label: string; value: number; className: string }) {
  return <div><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{value}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div></div>;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function Empty({ text }: { text: string }) { return <p className="py-4 text-center text-sm text-muted-foreground">{text}</p> }

function DashboardSkeleton() {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-72" /></div>;
}
