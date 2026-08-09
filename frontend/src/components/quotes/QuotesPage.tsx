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
import { Plus, Trash2, Edit, Download } from "lucide-react";
import { toast } from "sonner";
import {
  getQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
  getCustomers,
  getProducts,
  getOpportunities,
  type Quote,
  type Customer,
  type Product,
  type Opportunity,
} from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { canManageCrmData } from "@/auth/permissions";
import { QUOTE_STATUS_OPTIONS as QUOTE_STATUSES } from "@/contracts/crm-terminology";

export function QuotesPage() {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerId: "",
    opportunityId: "",
    quoteNo: "",
    productId: "",
    quantity: "1",
    unitPrice: "",
    currency: "USD",
    status: "draft" as Quote["status"],
    discount: "0",
    freight: "0",
    taxRate: "13",
    validUntil: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [quotesData, customersData, productsData, opportunitiesData] = await Promise.all([
        getQuotes(),
        getCustomers(0, 1000, {}),
        getProducts(),
        getOpportunities(),
      ]);
      setQuotes(quotesData);
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
    const product = products.find((item) => String(item.id) === form.productId);
    if (!product || !form.customerId) {
      toast.error("请选择客户和产品");
      return;
    }
    const opportunity = opportunities.find((item) => String(item.id) === form.opportunityId);
    const data = {
      customerId: Number(form.customerId),
      opportunityId: opportunity?.opportunityId || (opportunity ? String(opportunity.id) : undefined),
      quoteNo: form.quoteNo || undefined,
      currency: form.currency,
      status: form.status,
      freight: Number(form.freight || 0),
      taxRate: Number(form.taxRate || 0),
      validUntil: form.validUntil || undefined,
      notes: form.notes || undefined,
      items: [{
        productId: product.productId || String(product.id),
        productName: product.name,
        productCode: product.code,
        description: product.description,
        quantity: Number(form.quantity),
        unit: product.unit || "pcs",
        unitPrice: Number(form.unitPrice),
        discount: Number(form.discount || 0),
      }],
    };
    try {
      if (editingId) {
        await updateQuote(editingId, data);
        toast.success("报价单已更新");
      } else {
        await createQuote(data);
        toast.success("报价单已创建");
      }
      setEditingId(null);
      setForm({
        customerId: "",
        opportunityId: "",
        quoteNo: "",
        productId: "",
        quantity: "1",
        unitPrice: "",
        currency: "USD",
        status: "draft",
        discount: "0",
        freight: "0",
        taxRate: "13",
        validUntil: "",
        notes: "",
      });
      await fetchData();
    } catch {
      // Error handled by API client.
    }
  };

  const handleEdit = (quote: Quote) => {
    const item = quote.items?.[0];
    const product = products.find((candidate) =>
      candidate.productId === item?.productId || String(candidate.id) === item?.productId
    );
    const opportunity = opportunities.find((candidate) =>
      candidate.opportunityId === quote.opportunityId || String(candidate.id) === quote.opportunityId
    );
    setForm({
      customerId: String(quote.customerId || ""),
      opportunityId: opportunity ? String(opportunity.id) : "",
      quoteNo: quote.quoteNo || "",
      productId: product ? String(product.id) : "",
      quantity: String(item?.quantity || 1),
      unitPrice: String(item?.unitPrice ?? ""),
      currency: quote.currency || "USD",
      status: quote.status,
      discount: String(item?.discount || 0),
      freight: String(quote.freight || 0),
      taxRate: String(quote.taxRate || 0),
      validUntil: quote.validUntil ? quote.validUntil.split("T")[0] : "",
      notes: quote.notes || "",
    });
    setEditingId(quote.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该报价吗？")) return;
    try {
      await deleteQuote(id);
      toast.success("报价单已删除");
      await fetchData();
    } catch {
      // Error handled by API client.
    }
  };

  // Filter opportunities for selected customer
  const filteredOpportunities = form.customerId
    ? opportunities.filter((o) => String(o.customerId) === form.customerId)
    : opportunities;

  const selectedProduct = products.find((p) => String(p.id) === form.productId);

  return (
    <div className="space-y-6">
      {/* Form */}
      {canManage && <Card>
        <CardHeader>
          <CardTitle>{editingId ? "编辑报价单" : "创建报价单"}</CardTitle>
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
                <Label>报价编号</Label>
                <Input
                  placeholder="留空自动生成"
                  value={form.quoteNo}
                  onChange={(e) => setForm({ ...form, quoteNo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>产品 *</Label>
                <Select
                  value={form.productId}
                  onValueChange={(v) => {
                    if (!v) return;
                    const product = products.find((item) => String(item.id) === v);
                    setForm((current) => ({
                      ...current,
                      productId: v,
                      unitPrice: current.unitPrice || (product?.price !== undefined ? String(product.price) : ""),
                      currency: product?.currency || current.currency,
                    }));
                  }}
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
                <Label>单价 *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={selectedProduct?.price?.toString() || "0.00"}
                  value={form.unitPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, unitPrice: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>币种</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  maxLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => { if (value) setForm({ ...form, status: value as Quote["status"] }) }}
                >
                  <SelectTrigger>{QUOTE_STATUSES.find((status) => status.value === form.status)?.label || "选择状态"}</SelectTrigger>
                  <SelectContent>
                    {QUOTE_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>折扣</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.discount}
                  onChange={(e) => setForm({ ...form, discount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>运费</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.freight}
                  onChange={(e) => setForm({ ...form, freight: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>增值税率 (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>有效期至</Label>
                <Input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>备注</Label>
                <Textarea
                  placeholder="付款条件、交期、报价说明"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" />
                {editingId ? "更新报价单" : "创建报价单"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm({ customerId: "", opportunityId: "", quoteNo: "", productId: "", quantity: "1", unitPrice: "", currency: "USD", status: "draft", discount: "0", freight: "0", taxRate: "13", validUntil: "", notes: "" }); }}>
                  取消编辑
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            报价单列表
            <Badge variant="secondary">{quotes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>报价号</TableHead>
              <TableHead>客户</TableHead>
              <TableHead>产品</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-16">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : quotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  暂无报价单
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-mono text-sm">{quote.quoteNo || "-"}</TableCell>
                  <TableCell>{quote.customer?.company || "-"}</TableCell>
                  <TableCell>{(quote.items || []).map((item) => item.productName).join("、") || "-"}</TableCell>
                  <TableCell>{quote.items?.[0] ? `${quote.items[0].quantity} ${quote.items[0].unit || ""}` : "-"}</TableCell>
                  <TableCell>
                    {quote.currency} {Number(quote.total).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={quote.status === "accepted" ? "default" : "secondary"}>
                      {QUOTE_STATUSES.find((status) => status.value === quote.status)?.label || "未知状态"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {canManage && <Button variant="ghost" size="sm" title="编辑报价单" onClick={() => handleEdit(quote)}>
                        <Edit className="h-4 w-4" />
                      </Button>}
                      <a href={`/api/quotes/${quote.id}/export`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" title="导出报价单">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      {canManage && <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        title="删除报价单"
                        onClick={() => handleDelete(quote.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
