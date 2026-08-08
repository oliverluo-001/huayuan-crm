import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, Trash2, Save, X } from "lucide-react";
import { getProducts, createProduct, updateProduct, deleteProduct, type Product } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { canManageCrmData } from "@/auth/permissions";

export function ProductsPage() {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "",
    unit: "pcs",
    price: "",
    currency: "USD",
    description: "",
  });

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getProducts();
      setProducts(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const resetForm = () => {
    setForm({
      code: "",
      name: "",
      category: "",
      unit: "pcs",
      price: "",
      currency: "USD",
      description: "",
    });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const productData = { ...form, price: form.price ? parseFloat(form.price) : undefined };

    if (editingId) {
      await updateProduct(editingId, productData);
    } else {
      await createProduct(productData);
    }
    resetForm();
    fetchProducts();
  };

  const handleEdit = (product: Product) => {
    setForm({
      code: product.code || "",
      name: product.name,
      category: product.category || "",
      unit: product.unit || "pcs",
      price: product.price?.toString() || "",
      currency: product.currency || "USD",
      description: product.description || "",
    });
    setEditingId(product.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该产品吗？")) return;
    await deleteProduct(id);
    fetchProducts();
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      {canManage && <Card>
        <CardHeader>
          <CardTitle>{editingId ? "编辑产品资料" : "新增产品资料"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>产品编码</Label>
                <Input
                  placeholder="如：WN-FLG-DN300"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>产品名称 *</Label>
                <Input
                  placeholder="如：Weld Neck Flange"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>产品分类</Label>
                <Input
                  placeholder="如：法兰"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>单位</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>参考单价</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
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
              <div className="space-y-2 md:col-span-3">
                <Label>产品说明</Label>
                <Textarea
                  placeholder="材质、标准、规格范围或其他报价参考信息"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">
                <Save className="mr-2 h-4 w-4" />
                {editingId ? "更新产品" : "保存产品"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="mr-2 h-4 w-4" />
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
            产品资料
            <Badge variant="secondary">{products.length}</Badge>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>单位</TableHead>
              <TableHead>参考价</TableHead>
              {canManage && <TableHead className="w-24">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  {canManage && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                </TableRow>
              ))
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">
                  暂无产品资料
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm">{product.code || "-"}</TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.category || "-"}</TableCell>
                  <TableCell>{product.unit || "pcs"}</TableCell>
                  <TableCell>
                    {product.price
                      ? `${product.currency || "USD"} ${Number(product.price).toFixed(2)}`
                      : "-"}
                  </TableCell>
                  {canManage && <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
