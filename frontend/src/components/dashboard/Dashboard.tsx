import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Target, Mail, CheckSquare, TrendingUp, AlertCircle } from "lucide-react";
import { getState, type AppState, type DashboardData } from "@/api/client";

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [data, setData] = useState<AppState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchState = async () => {
    setIsLoading(true);
    try {
      const state = await getState();
      setData(state);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 60000);
    return () => clearInterval(interval);
  }, []);

  const dashboard = data?.dashboard;

  const metrics = [
    {
      label: "客户总数",
      value: dashboard?.customerTotal ?? 0,
      subtext: `近 7 天新增 ${dashboard?.newCustomers7d ?? 0}`,
      icon: Users,
      color: "text-blue-600",
    },
    {
      label: "企业线索",
      value: dashboard?.leadTotal ?? 0,
      subtext: `高可信 ${dashboard?.highConfidenceLeads ?? 0}`,
      icon: Target,
      color: "text-green-600",
    },
    {
      label: "可联系客户",
      value: dashboard?.contactableLeads ?? 0,
      subtext: "邮箱与企业质量均达标",
      icon: Mail,
      color: "text-purple-600",
    },
    {
      label: "邮件发送",
      value: dashboard?.sentTotal ?? 0,
      subtext: `失败 ${dashboard?.failedTotal ?? 0}`,
      icon: TrendingUp,
      color: "text-orange-600",
    },
    {
      label: "待跟进",
      value: dashboard?.openTodoCount ?? 0,
      subtext: `逾期 ${dashboard?.overdueTodoCount ?? 0}`,
      icon: CheckSquare,
      color: "text-red-600",
    },
  ];

  const funnel = [
    { label: "企业候选", value: dashboard?.leadTotal ?? 0 },
    { label: "高可信线索", value: dashboard?.highConfidenceLeads ?? 0 },
    { label: "可联系客户", value: dashboard?.contactableLeads ?? 0 },
    { label: "本地客户", value: dashboard?.customerTotal ?? 0 },
  ];

  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="text-2xl font-bold">{metric.value}</p>
                  <p className="text-xs text-muted-foreground">{metric.subtext}</p>
                </div>
                <metric.icon className={`h-8 w-8 ${metric.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Funnel */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              获客转化漏斗
              <Badge variant="secondary">实时</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {funnel.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-medium">{item.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.max(6, Math.round((item.value / funnelMax) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Active Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              运行中的任务
              <Badge variant="secondary">
                {(data?.leadTasks?.filter((t) => ["draft", "running"].includes(t.status)).length ?? 0) +
                  (data?.emailTasks?.filter((t) => ["active", "pending"].includes(t.status)).length ?? 0)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.leadTasks?.filter((t) => ["draft", "running"].includes(t.status)).slice(0, 3).map((task) => (
                <div key={task.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-green-500" />
                  <div className="flex-1">
                    <p className="font-medium">{task.productName || "获客任务"}</p>
                    <p className="text-muted-foreground">
                      获客 · {task.cleanedLeadCount ?? 0}/{task.targetCount ?? 0} 条已清洗线索
                    </p>
                  </div>
                </div>
              ))}
              {data?.emailTasks?.filter((t) => ["active", "pending"].includes(t.status)).slice(0, 3).map((task) => (
                <div key={task.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-blue-500" />
                  <div className="flex-1">
                    <p className="font-medium">{task.name}</p>
                    <p className="text-muted-foreground">
                      邮件 · {task.status === "active" ? "运行中" : "待执行"}
                    </p>
                  </div>
                </div>
              ))}
              {(!data?.leadTasks?.some((t) => ["draft", "running"].includes(t.status)) &&
                !data?.emailTasks?.some((t) => ["active", "pending"].includes(t.status))) && (
                <p className="text-sm text-muted-foreground text-center py-4">暂无运行中的任务</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Todos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              待办提醒
              {onNavigate && (
                <Button variant="link" size="sm" onClick={() => onNavigate("opportunities")}>
                  查看商机
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.crm?.openTodos?.slice(0, 5).map((todo) => (
                <div key={todo.id} className="flex items-start gap-3 text-sm">
                  <div
                    className={`mt-0.5 h-2 w-2 rounded-full ${
                      todo.dueAt && new Date(todo.dueAt) < new Date()
                        ? "bg-red-500"
                        : "bg-yellow-500"
                    }`}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{todo.title}</p>
                    <p className="text-muted-foreground">
                      {todo.customerName || "客户"} · {todo.dueAt ? new Date(todo.dueAt).toLocaleDateString() : "未设截止时间"}
                    </p>
                  </div>
                </div>
              ))}
              {!data?.crm?.openTodos?.length && (
                <p className="text-sm text-muted-foreground text-center py-4">暂无待办提醒</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email Activity Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>邮件活动统计</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div className="space-y-1 p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">近 7 天</p>
              <p className="text-xl font-bold">
                {dashboard?.emailActivity?.days7?.sent ?? 0}/{dashboard?.emailActivity?.days7?.total ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                成功率 {dashboard?.emailActivity?.days7?.rate ?? 0}% · 失败 {dashboard?.emailActivity?.days7?.failed ?? 0}
              </p>
            </div>
            <div className="space-y-1 p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">近 30 天</p>
              <p className="text-xl font-bold">
                {dashboard?.emailActivity?.days30?.sent ?? 0}/{dashboard?.emailActivity?.days30?.total ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                成功率 {dashboard?.emailActivity?.days30?.rate ?? 0}% · 失败 {dashboard?.emailActivity?.days30?.failed ?? 0}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">模板发送表现</p>
            {dashboard?.emailActivity?.byTemplate?.length ? (
              <div className="space-y-2">
                {dashboard.emailActivity.byTemplate.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                    <span className="truncate max-w-[200px]">{item.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="font-medium">{item.sent}/{item.total}</span>
                      <span className="text-muted-foreground">成功率 {item.rate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">暂无模板发送数据</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Send Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            最近发送活动
            {onNavigate && (
              <Button variant="link" size="sm" onClick={() => onNavigate("marketing")}>
                查看邮件营销
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data?.sendLogs?.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <Badge
                  variant={log.status === "sent" ? "default" : "destructive"}
                >
                  {log.status === "sent" ? "已发送" : log.status === "bounced" ? "退信" : "失败"}
                </Badge>
                <div className="flex-1">
                  <p className="font-medium">{log.email}</p>
                  <p className="text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()} · {log.templateName || log.message || "邮件发送"}
                  </p>
                </div>
              </div>
            ))}
            {!data?.sendLogs?.length && (
              <p className="text-sm text-muted-foreground text-center py-4">暂无邮件发送记录</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}