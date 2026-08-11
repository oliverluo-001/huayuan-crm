import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Edit,
  History,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  createCustomerOpportunity,
  deleteOpportunity,
  getCustomers,
  getOpportunities,
  getOpportunityStageHistory,
  getUserDirectory,
  updateOpportunity,
  type Customer,
  type Opportunity,
  type OpportunityStageHistory,
  type UserDirectoryEntry,
} from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { canManageCrmData, isAdministrator } from "@/auth/permissions";
import {
  OPPORTUNITY_FORECAST_CATEGORIES,
  OPPORTUNITY_STAGES,
} from "@/contracts/crm-stages";

type OpportunityForm = {
  customerId: string;
  name: string;
  amount: string;
  stage: Opportunity["stage"];
  probability: string;
  ownerId: string;
  collaboratorIds: string[];
  productName: string;
  productSpecification: string;
  expectedQuantity: string;
  quantityUnit: string;
  targetPrice: string;
  currency: string;
  budget: string;
  purchaseTime: string;
  decisionProcess: string;
  nextStepAction: string;
  nextStepDueDate: string;
  expectedCloseDate: string;
  forecastCategory: NonNullable<Opportunity["forecastCategory"]>;
  winReason: string;
  lossReason: string;
  competitors: string;
  description: string;
};

const initialForm = (userId = ""): OpportunityForm => ({
  customerId: "",
  name: "",
  amount: "",
  stage: "prospecting",
  probability: "10",
  ownerId: userId,
  collaboratorIds: [],
  productName: "",
  productSpecification: "",
  expectedQuantity: "",
  quantityUnit: "件",
  targetPrice: "",
  currency: "USD",
  budget: "",
  purchaseTime: "",
  decisionProcess: "",
  nextStepAction: "",
  nextStepDueDate: "",
  expectedCloseDate: "",
  forecastCategory: "pipeline",
  winReason: "",
  lossReason: "",
  competitors: "",
  description: "",
});

const stageLabel = (stage: Opportunity["stage"] | null | undefined) =>
  stage
    ? OPPORTUNITY_STAGES.find((item) => item.value === stage)?.label || stage
    : "创建商机";

const forecastLabel = (value: Opportunity["forecastCategory"]) =>
  OPPORTUNITY_FORECAST_CATEGORIES.find((item) => item.value === value)?.label ||
  "销售管道";

const dateInputValue = (value?: string) => (value ? value.split("T")[0] : "");
const numberValue = (value: string) => (value === "" ? 0 : Number(value));

export function OpportunitiesPage() {
  const { role, userId } = useAuth();
  const canManage = canManageCrmData(role);
  const canAssignOwner = isAdministrator(role);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<UserDirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OpportunityForm>(() => initialForm(userId));
  const [historyOpportunity, setHistoryOpportunity] =
    useState<Opportunity | null>(null);
  const [history, setHistory] = useState<OpportunityStageHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchOpportunities = useCallback(async () => {
    setIsLoading(true);
    try {
      const [opportunityData, customerData, userData] = await Promise.all([
        getOpportunities(),
        getCustomers(0, 1000, {}),
        getUserDirectory(),
      ]);
      setOpportunities(opportunityData);
      setCustomers(customerData.customers);
      setUsers(userData);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOpportunities();
  }, [fetchOpportunities]);

  const userName = useCallback(
    (id?: string) =>
      users.find((item) => item.id === id)?.displayName || "未指定",
    [users],
  );

  const resetForm = () => {
    setEditingId(null);
    setForm(initialForm(userId));
  };

  const handleEdit = (
    opportunity: Opportunity,
    stage?: Opportunity["stage"],
  ) => {
    setEditingId(opportunity.id);
    setForm({
      customerId: String(opportunity.customerId),
      name: opportunity.name || "",
      amount: opportunity.amount == null ? "" : String(opportunity.amount),
      stage: stage || opportunity.stage,
      probability:
        opportunity.probability == null ? "" : String(opportunity.probability),
      ownerId: opportunity.ownerId || "",
      collaboratorIds: opportunity.collaboratorIds || [],
      productName: opportunity.productName || "",
      productSpecification: opportunity.productSpecification || "",
      expectedQuantity:
        opportunity.expectedQuantity == null
          ? ""
          : String(opportunity.expectedQuantity),
      quantityUnit: opportunity.quantityUnit || "件",
      targetPrice:
        opportunity.targetPrice == null ? "" : String(opportunity.targetPrice),
      currency: opportunity.currency || "USD",
      budget: opportunity.budget == null ? "" : String(opportunity.budget),
      purchaseTime: opportunity.purchaseTime || "",
      decisionProcess: opportunity.decisionProcess || "",
      nextStepAction: opportunity.nextStepAction || "",
      nextStepDueDate: dateInputValue(opportunity.nextStepDueDate),
      expectedCloseDate: dateInputValue(opportunity.expectedCloseDate),
      forecastCategory:
        stage === "won" || stage === "lost"
          ? "closed"
          : opportunity.forecastCategory || "pipeline",
      winReason: opportunity.winReason || "",
      lossReason: opportunity.lossReason || "",
      competitors: opportunity.competitors || "",
      description: opportunity.description || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStageChange = async (
    opportunity: Opportunity,
    stage: Opportunity["stage"],
  ) => {
    if (stage === "won" || stage === "lost") {
      handleEdit(opportunity, stage);
      toast.info(
        stage === "won" ? "请填写赢单原因后保存" : "请填写输单原因后保存",
      );
      return;
    }
    try {
      await updateOpportunity(opportunity.id, { stage });
      toast.success("商机阶段已更新，客户状态已同步");
      await fetchOpportunities();
    } catch {
      // API 客户端已显示错误。
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.customerId || !form.name.trim()) {
      toast.error("请选择客户并填写商机名称");
      return;
    }
    if (form.stage === "won" && !form.winReason.trim()) {
      toast.error("商机关闭为赢单前必须填写赢单原因");
      return;
    }
    if (form.stage === "lost" && !form.lossReason.trim()) {
      toast.error("商机关闭为输单前必须填写输单原因");
      return;
    }
    try {
      const data = {
        name: form.name.trim(),
        amount: numberValue(form.amount),
        stage: form.stage,
        probability: numberValue(form.probability),
        ownerId: form.ownerId || undefined,
        collaboratorIds: form.collaboratorIds,
        productName: form.productName.trim(),
        productSpecification: form.productSpecification.trim(),
        expectedQuantity: numberValue(form.expectedQuantity),
        quantityUnit: form.quantityUnit.trim(),
        targetPrice: numberValue(form.targetPrice),
        currency: form.currency.trim().toUpperCase() || "USD",
        budget: numberValue(form.budget),
        purchaseTime: form.purchaseTime.trim(),
        decisionProcess: form.decisionProcess.trim(),
        nextStepAction: form.nextStepAction.trim(),
        nextStepDueDate: form.nextStepDueDate || undefined,
        expectedCloseDate: form.expectedCloseDate || undefined,
        forecastCategory: form.forecastCategory,
        winReason: form.winReason.trim(),
        lossReason: form.lossReason.trim(),
        competitors: form.competitors.trim(),
        description: form.description.trim(),
      };
      if (editingId) {
        await updateOpportunity(editingId, {
          customerId: Number(form.customerId),
          ...data,
        });
        toast.success("商机已更新");
      } else {
        await createCustomerOpportunity(form.customerId, data);
        toast.success("商机已创建");
      }
      resetForm();
      await fetchOpportunities();
    } catch {
      // API 客户端已显示错误。
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该商机吗？客户状态将根据剩余商机自动刷新。")) return;
    try {
      await deleteOpportunity(id);
      toast.success("商机已删除");
      await fetchOpportunities();
    } catch {
      // API 客户端已显示错误。
    }
  };

  const openHistory = async (opportunity: Opportunity) => {
    setHistoryOpportunity(opportunity);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await getOpportunityStageHistory(opportunity.id));
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleCollaborator = (id: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      collaboratorIds: checked
        ? [...new Set([...current.collaboratorIds, id])]
        : current.collaboratorIds.filter((item) => item !== id),
    }));
  };

  const activeOpportunities = useMemo(
    () => opportunities.filter((item) => !["won", "lost"].includes(item.stage)),
    [opportunities],
  );
  const overdueCount = activeOpportunities.filter(
    (item) => item.isOverdue,
  ).length;
  const missingNextStepCount = activeOpportunities.filter(
    (item) => item.missingNextStep,
  ).length;
  const weightedAmount = activeOpportunities.reduce(
    (total, item) =>
      total + (Number(item.amount || 0) * Number(item.probability || 0)) / 100,
    0,
  );
  const opportunitiesByStage = OPPORTUNITY_STAGES.map((stage) => ({
    ...stage,
    opportunities: opportunities.filter((item) => item.stage === stage.value),
  }));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          title="活跃商机"
          value={activeOpportunities.length}
          detail={`全部 ${opportunities.length} 个`}
        />
        <SummaryCard
          title="加权预测金额"
          value={`${Math.round(weightedAmount).toLocaleString()} USD`}
          detail="预计金额 × 成交概率"
        />
        <SummaryCard
          title="超期商机"
          value={overdueCount}
          detail="预计成交日期已过"
          alert={overdueCount > 0}
        />
        <SummaryCard
          title="缺少下一步"
          value={missingNextStepCount}
          detail="没有明确后续行动"
          alert={missingNextStepCount > 0}
        />
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "编辑商机" : "创建商机"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <FormSection title="基本信息">
                <Field label="客户 *">
                  <Select
                    value={form.customerId}
                    onValueChange={(value) => {
                      const customer = customers.find(
                        (item) => String(item.id) === value,
                      );
                      setForm((current) => ({
                        ...current,
                        customerId: value || "",
                        ownerId: current.ownerId || customer?.ownerId || userId,
                        currency:
                          current.currency ||
                          customer?.preferredCurrency ||
                          "USD",
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择客户" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem
                          key={customer.id}
                          value={String(customer.id)}
                        >
                          {customer.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="商机名称 *">
                  <Input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="例如：年度法兰采购项目"
                  />
                </Field>
                <Field label="销售阶段">
                  <Select
                    value={form.stage}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        stage: value as Opportunity["stage"],
                        forecastCategory:
                          value === "won" || value === "lost"
                            ? "closed"
                            : current.forecastCategory === "closed"
                              ? "pipeline"
                              : current.forecastCategory,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPPORTUNITY_STAGES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="成交概率（%）">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.probability}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        probability: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="预计金额">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="预算">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.budget}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        budget: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="币种">
                  <Input
                    maxLength={3}
                    value={form.currency}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </Field>
                <Field label="预测分类">
                  <Select
                    value={form.forecastCategory}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        forecastCategory:
                          value as OpportunityForm["forecastCategory"],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPPORTUNITY_FORECAST_CATEGORIES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormSection>

              <FormSection title="产品与采购计划">
                <Field label="产品">
                  <Input
                    value={form.productName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        productName: event.target.value,
                      }))
                    }
                    placeholder="产品名称"
                  />
                </Field>
                <Field label="产品规格">
                  <Input
                    value={form.productSpecification}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        productSpecification: event.target.value,
                      }))
                    }
                    placeholder="材质、口径、压力等级等"
                  />
                </Field>
                <Field label="预计数量">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.expectedQuantity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        expectedQuantity: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="数量单位">
                  <Input
                    value={form.quantityUnit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        quantityUnit: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="目标单价">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.targetPrice}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        targetPrice: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="采购时间">
                  <Input
                    value={form.purchaseTime}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        purchaseTime: event.target.value,
                      }))
                    }
                    placeholder="例如：2026 年第四季度"
                  />
                </Field>
                <Field label="预计成交日期">
                  <Input
                    type="date"
                    value={form.expectedCloseDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        expectedCloseDate: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="下一步行动日期">
                  <Input
                    type="date"
                    value={form.nextStepDueDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        nextStepDueDate: event.target.value,
                      }))
                    }
                  />
                </Field>
              </FormSection>

              <FormSection title="成交路径与行动">
                <Field label="下一步行动" wide>
                  <Textarea
                    value={form.nextStepAction}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        nextStepAction: event.target.value,
                      }))
                    }
                    placeholder="明确行动、责任人和预期结果"
                  />
                </Field>
                <Field label="决策流程" wide>
                  <Textarea
                    value={form.decisionProcess}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        decisionProcess: event.target.value,
                      }))
                    }
                    placeholder="决策人、技术确认、采购审批和付款流程"
                  />
                </Field>
                <Field label="竞争对手">
                  <Input
                    value={form.competitors}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        competitors: event.target.value,
                      }))
                    }
                    placeholder="多个竞争对手可用逗号分隔"
                  />
                </Field>
                <Field label="商机说明">
                  <Textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </Field>
              </FormSection>

              {canAssignOwner && (
                <FormSection title="负责人和协作者">
                  <Field label="负责人">
                    <Select
                      value={form.ownerId || "__none__"}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          ownerId: value === "__none__" ? "" : value || "",
                          collaboratorIds: current.collaboratorIds.filter(
                            (item) => item !== value,
                          ),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">未指定</SelectItem>
                        {users
                          .filter((item) => item.role !== "viewer")
                          .map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.displayName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="md:col-span-3 space-y-2">
                    <Label>协作者</Label>
                    <div className="flex flex-wrap gap-3 rounded-md border p-3">
                      {users
                        .filter(
                          (item) =>
                            item.role !== "viewer" && item.id !== form.ownerId,
                        )
                        .map((item) => (
                          <label
                            key={item.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={form.collaboratorIds.includes(item.id)}
                              onCheckedChange={(checked) =>
                                toggleCollaborator(item.id, checked === true)
                              }
                            />
                            {item.displayName}
                          </label>
                        ))}
                    </div>
                  </div>
                </FormSection>
              )}

              {(form.stage === "won" || form.stage === "lost") && (
                <div className="grid gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4 md:grid-cols-2 dark:bg-amber-950/20">
                  {form.stage === "won" ? (
                    <Field label="赢单原因 *" wide>
                      <Textarea
                        value={form.winReason}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            winReason: event.target.value,
                          }))
                        }
                        placeholder="例如：价格、交期和技术方案均获得客户认可"
                      />
                    </Field>
                  ) : (
                    <Field label="输单原因 *" wide>
                      <Textarea
                        value={form.lossReason}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            lossReason: event.target.value,
                          }))
                        }
                        placeholder="例如：价格差距、交期、认证或竞争对手关系"
                      />
                    </Field>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit">
                  <Plus className="mr-2 h-4 w-4" />
                  {editingId ? "保存修改" : "创建商机"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    取消编辑
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {opportunitiesByStage.map((stage) => (
          <Card key={stage.value} className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                {stage.label}
                <Badge variant="secondary">{stage.opportunities.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[72vh] space-y-3 overflow-y-auto">
              {stage.opportunities.map((opportunity) => (
                <div
                  key={opportunity.id}
                  className="space-y-2 rounded-lg border bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold">
                      {opportunity.name}
                    </p>
                    {opportunity.isOverdue && (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                    )}
                  </div>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {opportunity.customer?.company ||
                      opportunity.customerName ||
                      "未知客户"}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">
                      {forecastLabel(opportunity.forecastCategory)}
                    </Badge>
                    {opportunity.isOverdue && (
                      <Badge variant="destructive">已超期</Badge>
                    )}
                    {opportunity.missingNextStep && (
                      <Badge className="bg-amber-100 text-amber-800">
                        缺少下一步
                      </Badge>
                    )}
                  </div>
                  {opportunity.productName && (
                    <p className="text-xs">
                      <Target className="mr-1 inline h-3 w-3" />
                      {opportunity.productName}
                      {opportunity.productSpecification
                        ? ` · ${opportunity.productSpecification}`
                        : ""}
                    </p>
                  )}
                  <p className="text-sm font-medium">
                    {opportunity.currency || "USD"}{" "}
                    {Number(opportunity.amount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    负责人：{userName(opportunity.ownerId)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Clock3 className="mr-1 inline h-3 w-3" />
                    本阶段 {opportunity.stageDurationDays || 0} 天 · 概率{" "}
                    {opportunity.probability ?? 0}%
                  </p>
                  {opportunity.expectedCloseDate && (
                    <p className="text-xs text-muted-foreground">
                      预计成交：
                      {new Date(
                        opportunity.expectedCloseDate,
                      ).toLocaleDateString()}
                    </p>
                  )}
                  {opportunity.nextStepAction && (
                    <p className="line-clamp-2 rounded bg-muted p-2 text-xs">
                      下一步：{opportunity.nextStepAction}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => void openHistory(opportunity)}
                  >
                    <History className="mr-1 h-3.5 w-3.5" />
                    阶段历史
                  </Button>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Select
                        value={opportunity.stage}
                        onValueChange={(value) =>
                          value &&
                          void handleStageChange(
                            opportunity,
                            value as Opportunity["stage"],
                          )
                        }
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPPORTUNITY_STAGES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="编辑商机"
                        onClick={() => handleEdit(opportunity)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        title="删除商机"
                        onClick={() => void handleDelete(opportunity.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {stage.opportunities.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  暂无商机
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={Boolean(historyOpportunity)}
        onOpenChange={(open) => !open && setHistoryOpportunity(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>商机阶段历史</DialogTitle>
            <DialogDescription>{historyOpportunity?.name}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {historyLoading && <Skeleton className="h-24" />}
            {!historyLoading &&
              history.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {stageLabel(item.fromStage)} → {stageLabel(item.toStage)}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.changedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    上一阶段停留{" "}
                    {item.durationHours < 24
                      ? `${item.durationHours} 小时`
                      : `${Math.floor(item.durationHours / 24)} 天`}
                  </p>
                  <p className="text-sm">
                    操作人：{item.changedByName || "系统"}
                  </p>
                  {item.changeNote && (
                    <p className="mt-2 rounded bg-muted p-2 text-sm">
                      {item.changeNote}
                    </p>
                  )}
                </div>
              ))}
            {!historyLoading && history.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无阶段历史
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  alert = false,
}: {
  title: string;
  value: string | number;
  detail: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-amber-400" : ""}>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="border-b pb-2 text-sm font-semibold">{title}</h3>
      <div className="grid gap-4 md:grid-cols-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`space-y-2 ${wide ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
