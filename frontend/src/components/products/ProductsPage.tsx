import { useCallback, useEffect, useState } from "react";
import { canManageCrmData } from "@/auth/permissions";
import {
  createProduct,
  deleteProduct,
  deleteProductAsset,
  downloadProductAsset,
  getProducts,
  updateProduct,
  uploadProductAsset,
  type Product,
  type ProductAsset,
  type ProductCurrencyPrice,
  type ProductDescriptionTemplate,
  type ProductSpecification,
  type ProductVariant,
} from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { Download, Edit, FileText, Image, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

interface VariantForm {
  variantId?: string;
  sku: string;
  name: string;
  standard: string;
  material: string;
  pressureRating: string;
  nominalSize: string;
  facing: string;
  surfaceTreatment: string;
  unit: string;
  weight: string;
  weightUnit: string;
  packaging: string;
  packageQuantity: string;
  baseCost: string;
  costCurrency: string;
  pricesText: string;
  specificationsText: string;
  inspectionRequirements: string;
  certificateRequirements: string;
  quoteDescription: string;
  active: boolean;
}

const blankVariant = (): VariantForm => ({
  sku: "", name: "", standard: "", material: "", pressureRating: "",
  nominalSize: "", facing: "", surfaceTreatment: "", unit: "pcs", weight: "",
  weightUnit: "kg", packaging: "", packageQuantity: "", baseCost: "",
  costCurrency: "USD", pricesText: "USD:0", specificationsText: "",
  inspectionRequirements: "", certificateRequirements: "", quoteDescription: "", active: true,
});

const blankForm = () => ({
  sku: "", code: "", name: "", category: "法兰", productType: "flange" as "general" | "flange",
  unit: "pcs", weight: "", weightUnit: "kg", packaging: "", packageQuantity: "",
  baseCost: "", costCurrency: "USD", standardsText: "ASME, EN, DIN, JIS",
  materialsText: "", description: "", active: true,
});

const parsePrices = (value: string): ProductCurrencyPrice[] =>
  value.split(/[,，;；]/).map((item) => item.trim()).filter(Boolean).map((item) => {
    const [currency, amount] = item.split(/[:：]/);
    return { currency: (currency || "USD").trim().toUpperCase(), referencePrice: Number(amount || 0) };
  }).filter((item) => item.currency && Number.isFinite(item.referencePrice) && item.referencePrice >= 0);

const formatPrices = (prices?: ProductCurrencyPrice[]) =>
  (prices || []).map((item) => `${item.currency}:${Number(item.referencePrice)}`).join(", ");

const parseSpecifications = (value: string): ProductSpecification[] =>
  value.split(/[;；\n]/).map((item) => item.trim()).filter(Boolean).map((item) => {
    const [name, rawValue] = item.split(/[=＝]/);
    return { name: (name || "").trim(), value: (rawValue || "").trim() };
  }).filter((item) => item.name && item.value);

const formatSpecifications = (values?: ProductSpecification[]) =>
  (values || []).map((item) => `${item.name}=${item.value}${item.unit ? ` ${item.unit}` : ""}`).join("; ");

const csv = (value: string) => value.split(/[,，;；]/).map((item) => item.trim()).filter(Boolean);

export function ProductsPage() {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [prices, setPrices] = useState<ProductCurrencyPrice[]>([{ currency: "USD", referencePrice: 0 }]);
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([]);
  const [templates, setTemplates] = useState<ProductDescriptionTemplate[]>([]);
  const [variants, setVariants] = useState<VariantForm[]>([]);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetType, setAssetType] = useState<ProductAsset["assetType"]>("technical");
  const [assetNote, setAssetNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try { setProducts(await getProducts()); } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void fetchProducts(); }, [fetchProducts]);

  const resetForm = () => {
    setEditingId(null); setForm(blankForm());
    setPrices([{ currency: "USD", referencePrice: 0 }]);
    setSpecifications([]); setTemplates([]); setVariants([]);
    setAssetFile(null); setAssetNote("");
  };

  const toVariantPayload = (variant: VariantForm): ProductVariant => ({
    ...Object.fromEntries(Object.entries(variant).filter(([key]) => !["pricesText", "specificationsText"].includes(key))) as Omit<VariantForm, "pricesText" | "specificationsText">,
    weight: Number(variant.weight || 0), packageQuantity: Number(variant.packageQuantity || 0),
    baseCost: Number(variant.baseCost || 0), prices: parsePrices(variant.pricesText),
    specifications: parseSpecifications(variant.specificationsText),
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) return toast.error("请填写产品 SKU 和名称");
    if (variants.some((variant) => !variant.sku.trim())) return toast.error("每个产品规格都必须填写独立 SKU");
    const primaryPrice = prices[0] || { currency: "USD", referencePrice: 0 };
    const { standardsText, materialsText, ...master } = form;
    const payload: Partial<Product> = {
      ...master,
      sku: form.sku.trim(), code: form.code.trim() || form.sku.trim(), name: form.name.trim(),
      weight: Number(form.weight || 0), packageQuantity: Number(form.packageQuantity || 0),
      baseCost: Number(form.baseCost || 0), currency: primaryPrice.currency,
      price: Number(primaryPrice.referencePrice), prices,
      standards: csv(standardsText), materials: csv(materialsText),
      specifications, descriptionTemplates: templates, variants: variants.map(toVariantPayload),
    };
    try {
      const saved = editingId ? await updateProduct(editingId, payload) : await createProduct(payload);
      toast.success(editingId ? "产品资料已更新" : "产品资料已创建");
      const savedId = String(saved.id);
      if (assetFile) {
        try { await uploadAsset(savedId); }
        catch { toast.warning("产品已保存，但所选资料上传失败，可在编辑产品时重新上传"); }
      }
      resetForm(); await fetchProducts();
    } catch { /* API client displays errors. */ }
  };

  const handleEdit = (product: Product) => {
    setEditingId(String(product.id));
    setForm({
      sku: product.sku || product.code || "", code: product.code || "", name: product.name,
      category: product.category || "", productType: product.productType || "general", unit: product.unit || "pcs",
      weight: product.weight ? String(product.weight) : "", weightUnit: product.weightUnit || "kg",
      packaging: product.packaging || "", packageQuantity: product.packageQuantity ? String(product.packageQuantity) : "",
      baseCost: product.baseCost ? String(product.baseCost) : "", costCurrency: product.costCurrency || "USD",
      standardsText: (product.standards || []).join(", "), materialsText: (product.materials || []).join(", "),
      description: product.description || "", active: product.active ?? true,
    });
    setPrices(product.prices?.length ? product.prices : [{ currency: product.currency || "USD", referencePrice: Number(product.price || 0) }]);
    setSpecifications(product.specifications || []); setTemplates(product.descriptionTemplates || []);
    setVariants((product.variants || []).map((variant) => ({
      ...blankVariant(), ...variant,
      weight: variant.weight ? String(variant.weight) : "", packageQuantity: variant.packageQuantity ? String(variant.packageQuantity) : "",
      baseCost: variant.baseCost ? String(variant.baseCost) : "", pricesText: formatPrices(variant.prices),
      specificationsText: formatSpecifications(variant.specifications),
    })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadAsset = async (productId = editingId) => {
    if (!productId || !assetFile) return;
    setIsUploading(true);
    try {
      await uploadProductAsset(productId, assetFile, { assetType, note: assetNote });
      toast.success("产品资料已上传"); setAssetFile(null); setAssetNote(""); await fetchProducts();
    } finally { setIsUploading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该产品及其规格吗？")) return;
    await deleteProduct(id); toast.success("产品已删除"); await fetchProducts();
  };

  const currentProduct = products.find((product) => String(product.id) === editingId);

  return <div className="space-y-6">
    {canManage && <Card>
      <CardHeader><CardTitle>{editingId ? "编辑产品与规格" : "新增产品与规格"}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-semibold">产品主数据</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="产品 SKU *"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="WN-FLG" required /></Field>
              <Field label="内部编码"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
              <Field label="产品名称 *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Weld Neck Flange" required /></Field>
              <Field label="产品分类"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
              <Field label="产品类型"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value as "general" | "flange" })}><option value="flange">法兰</option><option value="general">通用产品</option></select></Field>
              <Field label="计量单位"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
              <Field label="单件重量"><Input type="number" min="0" step="0.001" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field>
              <Field label="重量单位"><Input value={form.weightUnit} onChange={(e) => setForm({ ...form, weightUnit: e.target.value })} /></Field>
              <Field label="包装方式"><Input value={form.packaging} onChange={(e) => setForm({ ...form, packaging: e.target.value })} placeholder="熏蒸木箱 / 托盘" /></Field>
              <Field label="每包装数量"><Input type="number" min="0" value={form.packageQuantity} onChange={(e) => setForm({ ...form, packageQuantity: e.target.value })} /></Field>
              <Field label="基础成本（内部）"><Input type="number" min="0" step="0.01" value={form.baseCost} onChange={(e) => setForm({ ...form, baseCost: e.target.value })} /></Field>
              <Field label="成本币种"><Input value={form.costCurrency} onChange={(e) => setForm({ ...form, costCurrency: e.target.value.toUpperCase() })} /></Field>
              <Field label="适用标准"><Input value={form.standardsText} onChange={(e) => setForm({ ...form, standardsText: e.target.value })} placeholder="ASME, EN, DIN, JIS" /></Field>
              <Field label="可选材质"><Input value={form.materialsText} onChange={(e) => setForm({ ...form, materialsText: e.target.value })} placeholder="A105, F304, F316L" /></Field>
              <div className="space-y-2 md:col-span-2"><Label>产品说明</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
          </section>

          <ArraySection title="多币种参考售价" onAdd={() => setPrices([...prices, { currency: "USD", referencePrice: 0 }])}>
            {prices.map((price, index) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={index}>
              <Input value={price.currency} placeholder="USD" onChange={(e) => setPrices(prices.map((item, i) => i === index ? { ...item, currency: e.target.value.toUpperCase() } : item))} />
              <Input type="number" min="0" step="0.01" value={price.referencePrice} onChange={(e) => setPrices(prices.map((item, i) => i === index ? { ...item, referencePrice: Number(e.target.value) } : item))} />
              <Button type="button" variant="ghost" size="icon" disabled={prices.length === 1} onClick={() => setPrices(prices.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
          </ArraySection>

          <ArraySection title="通用规格参数" onAdd={() => setSpecifications([...specifications, { name: "", value: "", unit: "" }])}>
            {specifications.length === 0 && <p className="text-sm text-muted-foreground">可增加外径、壁厚、孔距等参数。</p>}
            {specifications.map((item, index) => <div className="grid grid-cols-[1fr_1fr_0.6fr_auto] gap-2" key={index}>
              <Input placeholder="参数名" value={item.name} onChange={(e) => setSpecifications(specifications.map((value, i) => i === index ? { ...value, name: e.target.value } : value))} />
              <Input placeholder="参数值" value={item.value} onChange={(e) => setSpecifications(specifications.map((value, i) => i === index ? { ...value, value: e.target.value } : value))} />
              <Input placeholder="单位" value={item.unit || ""} onChange={(e) => setSpecifications(specifications.map((value, i) => i === index ? { ...value, unit: e.target.value } : value))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setSpecifications(specifications.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
          </ArraySection>

          <ArraySection title="报价常用描述模板" onAdd={() => setTemplates([...templates, { name: "", content: "" }])}>
            {templates.length === 0 && <p className="text-sm text-muted-foreground">保存英文产品描述、检验及证书条款，报价时可复用。</p>}
            {templates.map((item, index) => <div className="grid gap-2 md:grid-cols-[0.6fr_1.4fr_auto]" key={item.id || index}>
              <Input placeholder="模板名称" value={item.name} onChange={(e) => setTemplates(templates.map((value, i) => i === index ? { ...value, name: e.target.value } : value))} />
              <Textarea rows={2} placeholder="正式报价描述" value={item.content} onChange={(e) => setTemplates(templates.map((value, i) => i === index ? { ...value, content: e.target.value } : value))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setTemplates(templates.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
          </ArraySection>

          <ArraySection title="可报价 SKU 规格" onAdd={() => setVariants([...variants, blankVariant()])}>
            {variants.length === 0 && <p className="text-sm text-muted-foreground">一个产品可增加多个标准、材质、压力等级和口径组合。</p>}
            {variants.map((variant, index) => <div className="space-y-3 rounded-lg border p-4" key={variant.variantId || index}>
              <div className="flex justify-between"><strong>规格 {index + 1}</strong><Button type="button" variant="ghost" size="sm" onClick={() => setVariants(variants.filter((_, i) => i !== index))}><Trash2 className="mr-1 h-4 w-4" />删除规格</Button></div>
              <div className="grid gap-3 md:grid-cols-4">
                {([
                  ["sku", "规格 SKU *"], ["name", "规格名称"], ["standard", "标准"], ["material", "材质"],
                  ["pressureRating", "压力等级"], ["nominalSize", "口径"], ["facing", "密封面"], ["surfaceTreatment", "表面处理"],
                  ["unit", "单位"], ["weight", "重量"], ["weightUnit", "重量单位"], ["packaging", "包装"],
                  ["packageQuantity", "每包装数量"], ["baseCost", "基础成本（内部）"], ["costCurrency", "成本币种"], ["pricesText", "多币种售价"],
                ] as Array<[keyof VariantForm, string]>).map(([key, label]) => <Field key={key} label={label}><Input value={String(variant[key] ?? "")} placeholder={key === "pricesText" ? "USD:25, EUR:23" : ""} onChange={(e) => setVariants(variants.map((value, i) => i === index ? { ...value, [key]: e.target.value } : value))} /></Field>)}
                <Field label="其他规格"><Input value={variant.specificationsText} onChange={(e) => setVariants(variants.map((value, i) => i === index ? { ...value, specificationsText: e.target.value } : value))} placeholder="OD=60.3 mm; Thickness=5 mm" /></Field>
                <Field label="检验要求"><Input value={variant.inspectionRequirements} onChange={(e) => setVariants(variants.map((value, i) => i === index ? { ...value, inspectionRequirements: e.target.value } : value))} /></Field>
                <Field label="证书要求"><Input value={variant.certificateRequirements} onChange={(e) => setVariants(variants.map((value, i) => i === index ? { ...value, certificateRequirements: e.target.value } : value))} placeholder="EN 10204 3.1" /></Field>
                <div className="space-y-2 md:col-span-4"><Label>报价描述（留空自动生成）</Label><Textarea rows={2} value={variant.quoteDescription} onChange={(e) => setVariants(variants.map((value, i) => i === index ? { ...value, quoteDescription: e.target.value } : value))} /></div>
              </div>
            </div>)}
          </ArraySection>

          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">产品图片与技术附件</h3>
            <div className="grid gap-3 md:grid-cols-[0.8fr_1.4fr_1fr_auto]">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={assetType} onChange={(e) => setAssetType(e.target.value as ProductAsset["assetType"])}><option value="image">产品图片</option><option value="technical">技术附件</option></select>
              <Input type="file" onChange={(e) => setAssetFile(e.target.files?.[0] || null)} />
              <Input placeholder="资料说明" value={assetNote} onChange={(e) => setAssetNote(e.target.value)} />
              {editingId && <Button type="button" variant="outline" disabled={!assetFile || isUploading} onClick={() => void uploadAsset()}>{isUploading ? "上传中..." : "立即上传"}</Button>}
            </div>
            {!editingId && assetFile && <p className="text-xs text-muted-foreground">保存产品后将自动上传所选文件。</p>}
            {!!currentProduct?.assets?.length && <div className="space-y-2">{currentProduct.assets.map((asset) => <div key={asset.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm"><span className="flex items-center gap-2">{asset.assetType === "image" ? <img className="h-10 w-10 rounded object-cover" src={`/api/products/assets/${asset.id}/preview`} alt={asset.originalName} /> : <FileText className="h-4 w-4" />}{asset.originalName} <span className="text-muted-foreground">{asset.note}</span></span><span><Button type="button" variant="ghost" size="icon" onClick={() => void downloadProductAsset(asset)}><Download className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" onClick={async () => { await deleteProductAsset(asset.id); await fetchProducts(); }}><Trash2 className="h-4 w-4" /></Button></span></div>)}</div>}
          </section>

          <div className="flex gap-2"><Button type="submit"><Save className="mr-2 h-4 w-4" />{editingId ? "保存修改" : "创建产品"}</Button>{editingId && <Button type="button" variant="outline" onClick={resetForm}><X className="mr-2 h-4 w-4" />取消编辑</Button>}</div>
        </form>
      </CardContent>
    </Card>}

    <Card>
      <CardHeader><CardTitle className="flex items-center justify-between">产品与规格目录 <Badge variant="secondary">{products.length}</Badge></CardTitle></CardHeader>
      <Table><TableHeader><TableRow><TableHead>SKU / 名称</TableHead><TableHead>分类</TableHead><TableHead>标准 / 材质</TableHead><TableHead>参考售价</TableHead><TableHead>规格</TableHead><TableHead>资料</TableHead>{canManage && <TableHead>操作</TableHead>}</TableRow></TableHeader>
        <TableBody>{isLoading ? [...Array(4)].map((_, i) => <TableRow key={i}>{[...Array(canManage ? 7 : 6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>) : products.length === 0 ? <TableRow><TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">暂无产品资料</TableCell></TableRow> : products.map((product) => <TableRow key={product.id}>
          <TableCell><div className="flex items-center gap-3">{product.assets?.find((asset) => asset.assetType === "image") && <img className="h-10 w-10 rounded object-cover" src={`/api/products/assets/${product.assets.find((asset) => asset.assetType === "image")!.id}/preview`} alt={product.name} />}<div><div className="font-mono text-sm">{product.sku || product.code}</div><div className="font-medium">{product.name}</div></div></div></TableCell>
          <TableCell>{product.category || "-"}</TableCell>
          <TableCell><div>{(product.standards || []).join(" / ") || "-"}</div><div className="text-xs text-muted-foreground">{(product.materials || []).join(" / ")}</div></TableCell>
          <TableCell>{product.prices?.length ? product.prices.map((price) => <div key={price.currency}>{price.currency} {Number(price.referencePrice).toFixed(2)}</div>) : `${product.currency || "USD"} ${Number(product.price || 0).toFixed(2)}`}</TableCell>
          <TableCell><Badge variant="outline">{product.variants?.length || 0} 个 SKU</Badge></TableCell>
          <TableCell>{product.assets?.length || 0}</TableCell>
          {canManage && <TableCell><Button variant="ghost" size="icon" onClick={() => handleEdit(product)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void handleDelete(String(product.id))}><Trash2 className="h-4 w-4" /></Button></TableCell>}
        </TableRow>)}</TableBody></Table>
    </Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function ArraySection({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-lg border p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{title}</h3><Button type="button" size="sm" variant="outline" onClick={onAdd}><Plus className="mr-1 h-4 w-4" />添加</Button></div>{children}</section>;
}
