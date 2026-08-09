import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Download, Edit, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createQuote,
  deleteQuote,
  getCustomers,
  getOpportunities,
  getProducts,
  getQuotes,
  updateQuote,
  type Customer,
  type Opportunity,
  type Product,
  type Quote,
} from "@/api/client";
import { canManageCrmData } from "@/auth/permissions";
import { QUOTE_STATUS_OPTIONS as QUOTE_STATUSES } from "@/contracts/crm-terminology";
import { useAuth } from "@/contexts/AuthContext";

interface QuoteLineForm {
  key: string;
  selectionId: string;
  productId: string;
  productName: string;
  productCode: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
}

const createLine = (): QuoteLineForm => ({
  key: `${Date.now()}-${Math.random()}`,
  selectionId: "",
  productId: "",
  productName: "",
  productCode: "",
  description: "",
  quantity: "1",
  unit: "pcs",
  unitPrice: "",
  discount: "0",
});

const createForm = () => ({
  customerId: "",
  opportunityId: "",
  quoteNo: "",
  currency: "USD",
  status: "draft" as Quote["status"],
  freight: "0",
  taxRate: "13",
  validUntil: "",
  notes: "",
});

export function QuotesPage() {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(createForm);
  const [lines, setLines] = useState<QuoteLineForm[]>([createLine()]);

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

  const resetEditor = () => {
    setEditingId(null);
    setForm(createForm());
    setLines([createLine()]);
  };

  const updateLine = (key: string, updates: Partial<QuoteLineForm>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...updates } : line));
  };

  const selectProduct = (key: string, selectionId: string) => {
    const product = products.find((item) => String(item.id) === selectionId);
    if (!product) return;
    setLines((current) => current.map((line) => line.key === key ? {
      ...line,
      selectionId,
      productId: product.productId || String(product.id),
      productName: product.name,
      productCode: product.code || "",
      description: product.description || "",
      unit: product.unit || line.unit || "pcs",
      unitPrice: product.price === undefined || product.price === null ? line.unitPrice : String(product.price),
    } : line));
    if (product.currency) setForm((current) => ({ ...current, currency: product.currency || current.currency }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.customerId || lines.length === 0 || lines.some((line) => !line.productName.trim())) {
      toast.error("请选择客户，并为每一行选择产品");
      return;
    }
    if (lines.some((line) => Number(line.quantity) <= 0 || Number(line.unitPrice) < 0 || !Number.isFinite(Number(line.unitPrice)))) {
      toast.error("请检查每一行的数量和单价");
      return;
    }
    const opportunity = opportunities.find((item) => String(item.id) === form.opportunityId);
    const data = {
      customerId: Number(form.customerId),
      opportunityId: opportunity?.opportunityId || (opportunity ? String(opportunity.id) : null),
      quoteNo: form.quoteNo || undefined,
      currency: form.currency.trim() || "USD",
      status: form.status,
      freight: Number(form.freight || 0),
      taxRate: Number(form.taxRate || 0),
      validUntil: form.validUntil || undefined,
      notes: form.notes.trim() || undefined,
      items: lines.map((line) => ({
        productId: line.productId || undefined,
        productName: line.productName.trim(),
        productCode: line.productCode.trim() || undefined,
        description: line.description.trim() || undefined,
        quantity: Number(line.quantity),
        unit: line.unit.trim() || "pcs",
        unitPrice: Number(line.unitPrice),
        discount: Number(line.discount || 0),
      })),
    };
    try {
      if (editingId) {
        await updateQuote(editingId, data);
        toast.success("报价单已更新，所有产品行均已保留");
      } else {
        await createQuote(data);
        toast.success("报价单已创建");
      }
      resetEditor();
      await fetchData();
    } catch {
      // Error handled by API client.
    }
  };

  const handleEdit = (quote: Quote) => {
    const opportunity = opportunities.find((candidate) =>
      candidate.opportunityId === quote.opportunityId || String(candidate.id) === quote.opportunityId
    );
    setForm({
      customerId: String(quote.customerId || ""),
      opportunityId: opportunity ? String(opportunity.id) : "",
      quoteNo: quote.quoteNo || "",
      currency: quote.currency || "USD",
      status: quote.status,
      freight: String(quote.freight || 0),
      taxRate: String(quote.taxRate || 0),
      validUntil: quote.validUntil?.split("T")[0] || "",
      notes: quote.notes || "",
    });
    setLines((quote.items?.length ? quote.items : [createLine()]).map((item) => {
      if ("key" in item) return item as QuoteLineForm;
      const product = products.find((candidate) =>
        candidate.productId === item.productId || String(candidate.id) === item.productId
      );
      return {
        key: `${item.id || Date.now()}-${Math.random()}`,
        selectionId: product ? String(product.id) : "snapshot",
        productId: item.productId || "",
        productName: item.productName || "",
        productCode: item.productCode || "",
        description: item.description || "",
        quantity: String(item.quantity ?? 1),
        unit: item.unit || product?.unit || "pcs",
        unitPrice: String(item.unitPrice ?? ""),
        discount: String(item.discount || 0),
      };
    }));
    setEditingId(quote.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const filteredOpportunities = form.customerId
    ? opportunities.filter((item) => String(item.customerId) === form.customerId)
    : opportunities;
  const subtotalPreview = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = Number(line.unitPrice) || 0;
    const discount = Number(line.discount) || 0;
    return sum + quantity * unitPrice * (1 - discount / 100);
  }, 0);
  const totalPreview = subtotalPreview + Number(form.freight || 0) + subtotalPreview * Number(form.taxRate || 0) / 100;

  return (
    <div className="space-y-6">
      {canManage && <Card>
        <CardHeader><CardTitle>{editingId ? "编辑报价单" : "创建报价单"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>客户 *</Label>
                <Select value={form.customerId} onValueChange={(value) => value && setForm((current) => ({ ...current, customerId: value, opportunityId: "" }))} required>
                  <SelectTrigger>{customers.find((customer) => String(customer.id) === form.customerId)?.company || <SelectValue placeholder="选择客户" />}</SelectTrigger>
                  <SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={String(customer.id)}>{customer.company}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>关联商机</Label>
                <Select value={form.opportunityId || "none"} onValueChange={(value) => value && setForm((current) => ({ ...current, opportunityId: value === "none" ? "" : value }))}>
                  <SelectTrigger>{form.opportunityId ? opportunities.find((item) => String(item.id) === form.opportunityId)?.name || "选择商机" : "不关联商机"}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不关联商机</SelectItem>
                    {filteredOpportunities.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>报价编号</Label><Input placeholder="留空自动生成" value={form.quoteNo} onChange={(event) => setForm((current) => ({ ...current, quoteNo: event.target.value }))} /></div>
              <div className="space-y-2"><Label>币种</Label><Input value={form.currency} maxLength={8} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} /></div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(value) => value && setForm((current) => ({ ...current, status: value as Quote["status"] }))}>
                  <SelectTrigger>{QUOTE_STATUSES.find((item) => item.value === form.status)?.label || "选择状态"}</SelectTrigger>
                  <SelectContent>{QUOTE_STATUSES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>有效期至</Label><Input type="date" value={form.validUntil} onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))} /></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>报价产品明细 *</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, createLine()])}><Plus className="mr-1 h-4 w-4" />添加产品行</Button>
              </div>
              {lines.map((line, index) => (
                <div key={line.key} className="grid gap-3 rounded-lg border p-3 md:grid-cols-12">
                  <div className="space-y-2 md:col-span-4">
                    <Label>产品 {index + 1}</Label>
                    <Select value={line.selectionId} onValueChange={(value) => value && value !== "snapshot" && selectProduct(line.key, value)}>
                      <SelectTrigger>{line.productName || <SelectValue placeholder="选择产品" />}</SelectTrigger>
                      <SelectContent>
                        {line.selectionId === "snapshot" && <SelectItem value="snapshot">{line.productName || "历史产品"}</SelectItem>}
                        {products.map((product) => <SelectItem key={product.id} value={String(product.id)}>{product.name}{product.code ? ` (${product.code})` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2"><Label>数量</Label><Input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required /></div>
                  <div className="space-y-2 md:col-span-2"><Label>单位</Label><Input value={line.unit} onChange={(event) => updateLine(line.key, { unit: event.target.value })} /></div>
                  <div className="space-y-2 md:col-span-2"><Label>单价</Label><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} required /></div>
                  <div className="space-y-2 md:col-span-1"><Label>折扣%</Label><Input type="number" min="0" max="100" step="0.01" value={line.discount} onChange={(event) => updateLine(line.key, { discount: event.target.value })} /></div>
                  <div className="flex items-end md:col-span-1">
                    <Button type="button" variant="ghost" size="icon" className="text-destructive" title="删除产品行" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2"><Label>运费</Label><Input type="number" min="0" step="0.01" value={form.freight} onChange={(event) => setForm((current) => ({ ...current, freight: event.target.value }))} /></div>
              <div className="space-y-2"><Label>税率 (%)</Label><Input type="number" min="0" step="0.01" value={form.taxRate} onChange={(event) => setForm((current) => ({ ...current, taxRate: event.target.value }))} /></div>
              <div className="rounded-lg bg-muted p-3 text-sm"><p>明细小计：{form.currency} {subtotalPreview.toFixed(2)}</p><p className="font-semibold">预计总额：{form.currency} {totalPreview.toFixed(2)}</p></div>
              <div className="space-y-2 md:col-span-3"><Label>备注</Label><Textarea placeholder="付款条件、交期、报价说明" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={2} /></div>
            </div>
            <div className="flex gap-2">
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />{editingId ? "更新报价单" : "创建报价单"}</Button>
              {editingId && <Button type="button" variant="outline" onClick={resetEditor}>取消编辑</Button>}
            </div>
          </form>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader><CardTitle className="flex items-center justify-between">报价单列表<Badge variant="secondary">{quotes.length}</Badge></CardTitle></CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead>报价号</TableHead><TableHead>客户</TableHead><TableHead>产品</TableHead><TableHead>数量</TableHead><TableHead>金额</TableHead><TableHead>状态</TableHead><TableHead className="w-16">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, index) => <TableRow key={index}>{[...Array(7)].map((__, cell) => <TableCell key={cell}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>)
              : quotes.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">暂无报价单</TableCell></TableRow>
                : quotes.map((quote) => <TableRow key={quote.id}>
                  <TableCell className="font-mono text-sm">{quote.quoteNo || "-"}</TableCell>
                  <TableCell>{quote.customer?.company || customers.find((item) => String(item.id) === String(quote.customerId))?.company || "-"}</TableCell>
                  <TableCell>{(quote.items || []).map((item) => item.productName).join("、") || "-"}</TableCell>
                  <TableCell>{(quote.items || []).map((item) => `${item.quantity} ${item.unit || ""}`).join("；") || "-"}</TableCell>
                  <TableCell>{quote.currency} {Number(quote.total).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={quote.status === "accepted" ? "default" : "secondary"}>{QUOTE_STATUSES.find((item) => item.value === quote.status)?.label || "未知状态"}</Badge></TableCell>
                  <TableCell><div className="flex gap-1">
                    {canManage && <Button variant="ghost" size="sm" title="编辑报价单" onClick={() => handleEdit(quote)}><Edit className="h-4 w-4" /></Button>}
                    <a href={`/api/quotes/${quote.id}/export`} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="sm" title="导出报价单"><Download className="h-4 w-4" /></Button></a>
                    {canManage && <Button variant="ghost" size="sm" className="text-destructive" title="删除报价单" onClick={() => handleDelete(quote.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </div></TableCell>
                </TableRow>)}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
