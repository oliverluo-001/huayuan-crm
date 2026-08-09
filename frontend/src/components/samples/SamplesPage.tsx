import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getSamples,
  createSample,
  updateSample,
  deleteSample,
  getCustomers,
  getProducts,
  getOpportunities,
  type Sample,
  type Customer,
  type Product,
  type Opportunity,
} from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { canManageCrmData } from "@/auth/permissions";
import { SAMPLE_STATUS_OPTIONS as SAMPLE_STATUSES } from "@/contracts/crm-terminology";

export function SamplesPage() {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({
    customerId: "",
    opportunityId: "",
    productId: "",
    quantity: "1",
    unit: "pcs",
    status: "pending" as Sample["status"],
    sentAt: "",
    deliveredAt: "",
    trackingNo: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [samplesData, customersData, productsData, opportunitiesData] = await Promise.all([
        getSamples(),
        getCustomers(0, 1000, {}),
        getProducts(),
        getOpportunities(),
      ]);
      setSamples(samplesData);
      setCustomers(customersData.customers);
      setProducts(productsData);
      setOpportunities(opportunitiesData);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const product = products.find((item) => String(item.id) === form.productId);
      if (!product || !form.customerId) {
        toast.error("请选择客户和样品产品");
        return;
      }
      const opportunity = opportunities.find((item) => String(item.id) === form.opportunityId);
      await createSample({
        customerId: Number(form.customerId),
        opportunityId: opportunity?.opportunityId || (opportunity ? String(opportunity.id) : undefined),
        productId: product.productId || String(product.id),
        productName: product.name,
        quantity: Number(form.quantity),
        unit: form.unit,
        status: form.status,
        sentAt: form.sentAt || undefined,
        deliveredAt: form.deliveredAt || undefined,
        trackingNo: form.trackingNo || undefined,
        notes: form.notes || undefined,
      });
      toast.success("样品记录已创建");
      setForm({
        customerId: "",
        opportunityId: "",
        productId: "",
        quantity: "1",
        unit: "pcs",
        status: "pending",
        sentAt: "",
        deliveredAt: "",
        trackingNo: "",
        notes: "",
      });
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该样品记录吗？")) return;
    try {
      await deleteSample(id);
      toast.success("样品记录已删除");
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleStatusChange = async (id: string, status: Sample["status"]) => {
    try {
      await updateSample(id, { status });
      toast.success("样品状态已更新");
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  // Filter opportunities for selected customer
  const filteredOpportunities = form.customerId
    ? opportunities.filter((o) => String(o.customerId) === form.customerId)
    : opportunities;

  return (
    <div className="space-y-6">
      {/* Form */}
      {canManage && <Card>
        <CardHeader>
          <CardTitle>登记样品寄送</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>客户 *</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(v) => { if (v) setForm({ ...form, customerId: v, opportunityId: "" }) }}
                  required
                >
                  <SelectTrigger>
                    {customers.find((customer) => String(customer.id) === form.customerId)?.company || <SelectValue placeholder="选择客户" />}
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {customer.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>关联商机</Label>
                <Select
                  value={form.opportunityId || "none"}
                  onValueChange={(v) => { if (v) setForm({ ...form, opportunityId: v === "none" ? "" : v }) }}
                >
                  <SelectTrigger>
                    {form.opportunityId
                      ? opportunities.find((opportunity) => String(opportunity.id) === form.opportunityId)?.name || "选择商机"
                      : "不关联商机"}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不关联商机</SelectItem>
                    {filteredOpportunities.map((opp) => (
                      <SelectItem key={opp.id} value={String(opp.id)}>
                        {opp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>样品产品 *</Label>
                <Select
                  value={form.productId}
                  onValueChange={(v) => { if (v) setForm({ ...form, productId: v }) }}
                  required
                >
                  <SelectTrigger>
                    {products.find((product) => String(product.id) === form.productId)?.name || <SelectValue placeholder="选择产品" />}
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={String(product.id)}>
                        {product.name} {product.code ? `(${product.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>数量 *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>单位</Label>
                <Input
                  value={form.unit}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => { if (v) setForm({ ...form, status: v as Sample["status"] }) }}
                >
                  <SelectTrigger>
                    {SAMPLE_STATUSES.find((status) => status.value === form.status)?.label || "选择状态"}
                  </SelectTrigger>
                  <SelectContent>
                    {SAMPLE_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>寄出日期</Label>
                <Input
                  type="date"
                  value={form.sentAt}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, sentAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>签收日期</Label>
                <Input
                  type="date"
                  value={form.deliveredAt}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, deliveredAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>物流单号</Label>
                <Input
                  value={form.trackingNo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, trackingNo: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>备注</Label>
                <Textarea
                  placeholder="样品规格、寄送地址或客户反馈"
                  value={form.notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              登记样品寄送
            </Button>
          </form>
        </CardContent>
      </Card>}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            样品跟进记录
            <Badge variant="secondary">{samples.length}</Badge>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>客户</TableHead>
              <TableHead>产品</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>寄出日期</TableHead>
              <TableHead>物流单号</TableHead>
              {canManage && <TableHead className="w-16">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(canManage ? 7 : 6)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : samples.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 7 : 6} className="text-center py-8 text-muted-foreground">
                  暂无样品寄送记录
                </TableCell>
              </TableRow>
            ) : (
              samples.map((sample) => (
                <TableRow key={sample.id}>
                  <TableCell>{sample.customer?.company || customers.find((customer) => String(customer.id) === String(sample.customerId))?.company || "-"}</TableCell>
                  <TableCell>{sample.productName || "-"}</TableCell>
                  <TableCell>{sample.quantity} {sample.unit}</TableCell>
                  <TableCell>
                    {canManage ? <Select
                      value={sample.status}
                      onValueChange={(v) => { if (v) handleStatusChange(sample.id, v as Sample["status"]) }}
                    >
                      <SelectTrigger className="h-7 w-auto">
                        <Badge variant={
                          sample.status === "delivered" ? "default" :
                          sample.status === "returned" ? "destructive" : "secondary"
                        }>
                          {SAMPLE_STATUSES.find((s) => s.value === sample.status)?.label || "未知状态"}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {SAMPLE_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select> : (
                      <Badge variant={
                        sample.status === "delivered" ? "default" :
                        sample.status === "returned" ? "destructive" : "secondary"
                      }>
                        {SAMPLE_STATUSES.find((s) => s.value === sample.status)?.label || "未知状态"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{sample.sentAt ? new Date(sample.sentAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="font-mono text-sm">{sample.trackingNo || "-"}</TableCell>
                  {canManage && <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="text-destructive"
                      onClick={() => handleDelete(sample.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
