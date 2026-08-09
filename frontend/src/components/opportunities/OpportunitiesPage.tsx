import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCustomerOpportunity,
  deleteOpportunity,
  getCustomers,
  getOpportunities,
  updateOpportunity,
  type Customer,
  type Opportunity,
} from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { canManageCrmData } from "@/auth/permissions";
import { OPPORTUNITY_STAGES as STAGES } from "@/contracts/crm-stages";

export function OpportunitiesPage() {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({
    customerId: "",
    name: "",
    amount: "",
    stage: "prospecting" as Opportunity["stage"],
    expectedCloseDate: "",
    description: "",
  });

  const fetchOpportunities = useCallback(async () => {
    setIsLoading(true);
    try {
      const [opportunityData, customerData] = await Promise.all([
        getOpportunities(),
        getCustomers(0, 1000, {}),
      ]);
      setOpportunities(opportunityData);
      setCustomers(customerData.customers);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleStageChange = async (id: string, newStage: string) => {
    try {
      await updateOpportunity(id, { stage: newStage as Opportunity["stage"] });
      toast.success("商机阶段已更新，客户跟进阶段已同步");
      await fetchOpportunities();
    } catch {
      // Error handled by API client.
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.customerId || !form.name.trim()) {
      toast.error("请选择客户并填写商机名称");
      return;
    }
    try {
      await createCustomerOpportunity(form.customerId, {
        name: form.name.trim(),
        amount: form.amount === "" ? 0 : Number(form.amount),
        stage: form.stage,
        expectedCloseDate: form.expectedCloseDate || undefined,
        description: form.description.trim() || undefined,
      });
      toast.success("商机已创建，客户跟进阶段已同步");
      setForm({ customerId: "", name: "", amount: "", stage: "prospecting", expectedCloseDate: "", description: "" });
      await fetchOpportunities();
    } catch {
      // Error handled by API client.
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该商机吗？客户跟进阶段将根据剩余商机自动刷新。")) return;
    try {
      await deleteOpportunity(id);
      toast.success("商机已删除");
      await fetchOpportunities();
    } catch {
      // Error handled by API client.
    }
  };

  // Group opportunities by stage
  const opportunitiesByStage = STAGES.map((stage) => ({
    ...stage,
    opportunities: opportunities.filter((o) => o.stage === stage.value),
  }));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <Skeleton key={j} className="h-24 w-full" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader><CardTitle className="text-base">创建商机</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-3" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label>客户 *</Label>
                <Select value={form.customerId} onValueChange={(value) => value && setForm((current) => ({ ...current, customerId: value }))} required>
                  <SelectTrigger>{customers.find((customer) => String(customer.id) === form.customerId)?.company || <SelectValue placeholder="选择客户" />}</SelectTrigger>
                  <SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={String(customer.id)}>{customer.company}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>商机名称 *</Label>
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="如：年度法兰采购项目" required />
              </div>
              <div className="space-y-2">
                <Label>预计金额（USD）</Label>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>销售阶段</Label>
                <Select value={form.stage} onValueChange={(value) => value && setForm((current) => ({ ...current, stage: value as Opportunity["stage"] }))}>
                  <SelectTrigger>{STAGES.find((stage) => stage.value === form.stage)?.label || "选择阶段"}</SelectTrigger>
                  <SelectContent>{STAGES.map((stage) => <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>预计成交日期</Label>
                <Input type="date" value={form.expectedCloseDate} onChange={(event) => setForm((current) => ({ ...current, expectedCloseDate: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>商机说明</Label>
                <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="客户需求、关键规格或下一步计划" rows={1} />
              </div>
              <div className="md:col-span-3">
                <Button type="submit"><Plus className="mr-2 h-4 w-4" />创建商机</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          在此创建商机或更新阶段后，客户 360° 的跟进阶段与商机摘要会同步刷新。
        </p>
        <Badge variant="secondary">共 {opportunities.length} 个商机</Badge>
      </div>

      {/* Pipeline Board */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6 overflow-x-auto">
        {opportunitiesByStage.map((stage) => (
          <Card key={stage.value} className="min-w-[200px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                {stage.label}
                <Badge variant="secondary">{stage.opportunities.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
              {stage.opportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="rounded-lg border p-3 space-y-2 bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm line-clamp-2">{opp.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {opp.customer?.company || opp.customerName || "未知客户"}
                  </p>
                  {opp.amount && (
                    <p className="text-sm font-medium">
                      USD {Number(opp.amount).toLocaleString()}
                    </p>
                  )}
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">
                      {opp.expectedCloseDate
                        ? `预计 ${new Date(opp.expectedCloseDate).toLocaleDateString()}`
                        : ""}
                      {opp.probability !== undefined && opp.probability !== null
                        ? ` · 概率 ${opp.probability}%`
                        : ""}
                    </span>
                    {canManage && <div className="flex items-center gap-1">
                      <Select
                        value={opp.stage}
                        onValueChange={(v) => { if (v) handleStageChange(opp.id, v) }}
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">{STAGES.find((stage) => stage.value === opp.stage)?.label || "选择阶段"}</SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="删除商机" onClick={() => handleDelete(opp.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>}
                  </div>
                </div>
              ))}
              {stage.opportunities.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  暂无商机
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
