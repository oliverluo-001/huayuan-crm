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

export function QuotesPage() {
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
    const data = {
      customerId: form.customerId,
      opportunityId: form.opportunityId || undefined,
      quoteNo: form.quoteNo || undefined,
      productId: form.productId,
      quantity: parseFloat(form.quantity),
      unitPrice: parseFloat(form.unitPrice),
      currency: form.currency,
      discount: parseFloat(form.discount),
      freight: parseFloat(form.freight),
      taxRate: parseFloat(form.taxRate),
      validUntil: form.validUntil || undefined,
      notes: form.notes || undefined,
    };
    if (editingId) {
      await updateQuote(editingId, data);
    } else {
      await createQuote(data);
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
      discount: "0",
      freight: "0",
      taxRate: "13",
      validUntil: "",
      notes: "",
    });
    fetchData();
  };

  const handleEdit = (quote: Quote) => {
    setForm({
      customerId: quote.customerId || "",
      opportunityId: "",
      quoteNo: quote.quoteNo || "",
      productId: "",
      quantity: String(quote.quantity || 1),
      unitPrice: String(quote.total || ""),
      currency: quote.currency || "USD",
      discount: "0",
      freight: "0",
      taxRate: "13",
      validUntil: quote.validUntil ? quote.validUntil.split("T")[0] : "",
      notes: quote.notes || "",
    });
    setEditingId(quote.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该报价吗？")) return;
    await deleteQuote(id);
    fetchData();
  };

  // Filter opportunities for selected customer
  const filteredOpportunities = form.customerId
    ? opportunities.filter((o) => o.customerId === form.customerId)
    : opportunities;

  const selectedProduct = products.find((p) => p.id === form.productId);

  return (
    <div className="space-y-6">
      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "编辑报价" : "创建报价"}</CardTitle>
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
                    <SelectValue placeholder="选择客户" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>关联商机</Label>
                <Select
                  value={form.opportunityId}
                  onValueChange={(v) => { if (v !== null) setForm({ ...form, opportunityId: v }) }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="不关联商机" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不关联商机</SelectItem>
                    {filteredOpportunities.map((opp) => (
                      <SelectItem key={opp.id} value={opp.id}>
                        {opp.title}
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
                  onValueChange={(v) => { if (v) setForm({ ...form, productId: v }) }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择产品" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
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
                  step="0.01"
                  placeholder={selectedProduct?.referencePrice?.toString() || "0.00"}
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
                <Label>折扣</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.discount}
                  onChange={(e) => setForm({ ...form, discount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>运费</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.freight}
                  onChange={(e) => setForm({ ...form, freight: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>增值税率 (%)</Label>
                <Input
                  type="number"
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
                {editingId ? "更新报价" : "创建报价"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm({ customerId: "", opportunityId: "", quoteNo: "", productId: "", quantity: "1", unitPrice: "", currency: "USD", discount: "0", freight: "0", taxRate: "13", validUntil: "", notes: "" }); }}>
                  取消编辑
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            报价列表
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
                  暂无报价数据
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-mono text-sm">{quote.quoteNo || "-"}</TableCell>
                  <TableCell>{quote.customerName || "-"}</TableCell>
                  <TableCell>{quote.productName || "-"}</TableCell>
                  <TableCell>{quote.quantity} {quote.unit}</TableCell>
                  <TableCell>
                    {quote.currency} {quote.total.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={quote.status === "accepted" ? "default" : "secondary"}>
                      {quote.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(quote)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/api/quotes/${quote.id}/export`} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(quote.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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