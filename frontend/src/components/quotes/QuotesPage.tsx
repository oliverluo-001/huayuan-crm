import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Archive, Eye, FileSpreadsheet, FileText, Edit, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createQuote,
  createQuoteTermTemplate,
  deleteQuote,
  deleteQuoteTermTemplate,
  getCustomers,
  getCustomer360,
  getOpportunities,
  getProducts,
  getQuotes,
  getQuoteOutputTemplates,
  getQuoteTermTemplates,
  quoteOutputUrl,
  updateQuote,
  updateQuoteTermTemplate,
  type Customer,
  type Opportunity,
  type Product,
  type Quote,
  type QuoteOutputLanguage,
  type QuoteOutputTemplate,
  type QuoteTermTemplate,
} from "@/api/client";
import { QuoteLayoutEditor } from "@/components/quotes/QuoteLayoutEditor";
import { cloneQuoteOutputLayout, DEFAULT_QUOTE_OUTPUT_LAYOUT, QUOTE_SECTION_DEFINITIONS, type QuoteOutputLayout } from "@/contracts/quote-output-layout";
import { canManageCrmData } from "@/auth/permissions";
import { QUOTE_STATUS_OPTIONS as QUOTE_STATUSES } from "@/contracts/crm-terminology";
import { calculateQuoteTotals, roundMoney } from "@/contracts/quote-calculation";
import { quoteReferencePrice } from "@/contracts/quote-price";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { CurrencyInput } from "./CurrencyInput";
import { useAuth } from "@/contexts/AuthContext";
import { quoteDraftKey, readQuoteDraft, writeQuoteDraft, type DraftEnvelope } from "@/contracts/quote-draft";
import { parseQuoteTable } from "@/contracts/quote-paste";
import { quoteCustomerDefaults } from "@/contracts/quote-customer-defaults";
import { applyBulkSpecs } from "@/contracts/quote-bulk-specs";
import { QuoteBulkSpecifications } from "./QuoteBulkSpecifications";

interface QuoteLineForm {
  key: string;
  selectionId: string;
  productId: string;
  productName: string;
  productCode: string;
  variantId: string;
  sku: string;
  standard: string;
  material: string;
  pressureRating: string;
  nominalSize: string;
  facing: string;
  surfaceTreatment: string;
  weight: string;
  weightUnit: string;
  packaging: string;
  inspectionRequirements: string;
  certificateRequirements: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
}

interface AdditionalChargeForm {
  key: string;
  label: string;
  amount: string;
}

interface QuoteForm {
  customerId: string;
  opportunityId: string;
  quoteNo: string;
  currency: string;
  baseCurrency: string;
  exchangeRate: string;
  status: Quote["status"];
  freight: string;
  taxRate: string;
  validUntil: string;
  incoterm: string;
  originPort: string;
  destinationPort: string;
  deliveryTime: string;
  paymentTerms: string;
  packagingTerms: string;
  warrantyTerms: string;
  notes: string;
  notesEn: string;
  terms: string;
  termsEn: string;
  termTemplateId: string;
  outputTemplateId: string;
}

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const OUTPUT_LANGUAGES: Array<{ value: QuoteOutputLanguage; label: string }> = [
  { value: "bilingual", label: "中英双语" },
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const createKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createLine = (): QuoteLineForm => ({
  key: createKey(),
  selectionId: "manual",
  productId: "",
  productName: "",
  productCode: "",
  variantId: "",
  sku: "",
  standard: "",
  material: "",
  pressureRating: "",
  nominalSize: "",
  facing: "",
  surfaceTreatment: "",
  weight: "",
  weightUnit: "kg",
  packaging: "",
  inspectionRequirements: "",
  certificateRequirements: "",
  description: "",
  quantity: "1",
  unit: "pcs",
  unitPrice: "",
  discount: "0",
});
const createCharge = (): AdditionalChargeForm => ({ key: createKey(), label: "", amount: "0" });
const createForm = (): QuoteForm => ({
  customerId: "",
  opportunityId: "",
  quoteNo: "",
  currency: "USD",
  baseCurrency: "CNY",
  exchangeRate: "",
  status: "draft",
  freight: "0",
  taxRate: "0",
  validUntil: "",
  incoterm: "FOB",
  originPort: "",
  destinationPort: "",
  deliveryTime: "",
  paymentTerms: "",
  packagingTerms: "",
  warrantyTerms: "",
  notes: "",
  notesEn: "",
  terms: "",
  termsEn: "",
  termTemplateId: "",
  outputTemplateId: "",
});

interface QuoteDraft {
  form: QuoteForm;
  lines: QuoteLineForm[];
  charges: AdditionalChargeForm[];
  outputLayout: QuoteOutputLayout;
  editingId: string | null;
  editingVersion: string | null;
  pasteText: string;
  pasteCurrency: string;
}
const stringRecord = (value: unknown, example: object): boolean => Boolean(value && typeof value === "object" && Object.keys(example).every((key) => typeof (value as Record<string, unknown>)[key] === "string"));
function isQuoteDraft(value: unknown): value is QuoteDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as QuoteDraft;
  return stringRecord(draft.form, createForm()) && QUOTE_STATUSES.some((status) => status.value === draft.form.status)
    && typeof draft.pasteText === "string" && typeof draft.pasteCurrency === "string"
    && Array.isArray(draft.lines) && draft.lines.length > 0 && draft.lines.every((line) => stringRecord(line, createLine()))
    && Array.isArray(draft.charges) && draft.charges.every((charge) => stringRecord(charge, createCharge()))
    && (draft.editingId === null || typeof draft.editingId === "string")
    && (draft.editingVersion === null || typeof draft.editingVersion === "string")
    && draft.outputLayout?.version === 1 && typeof draft.outputLayout.accentColor === "string"
    && Array.isArray(draft.outputLayout.sections) && draft.outputLayout.sections.every((section) =>
      section && typeof section.id === "string" && typeof section.type === "string" && typeof section.enabled === "boolean"
      && Object.hasOwn(QUOTE_SECTION_DEFINITIONS, section.type)
      && typeof section.titleZh === "string" && typeof section.titleEn === "string"
      && (section.fields === undefined || (Array.isArray(section.fields) && section.fields.every((field) => typeof field === "string")))
      && (section.contentZh === undefined || typeof section.contentZh === "string")
      && (section.contentEn === undefined || typeof section.contentEn === "string"));
}

export function QuotesPage() {
  const [searchParams] = useSearchParams();
  const contextCustomerId = searchParams.get("customerId");
  const contextOpportunityId = searchParams.get("opportunityId");
  const { role, userId } = useAuth();
  const canManage = canManageCrmData(role);
  const isAdmin = role === "admin";
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [termTemplates, setTermTemplates] = useState<QuoteTermTemplate[]>([]);
  const [outputTemplates, setOutputTemplates] = useState<QuoteOutputTemplate[]>([]);
  const [outputLayout, setOutputLayout] = useState<QuoteOutputLayout>(() => cloneQuoteOutputLayout(DEFAULT_QUOTE_OUTPUT_LAYOUT));
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [form, setForm] = useState<QuoteForm>(createForm);
  const [lines, setLines] = useState<QuoteLineForm[]>([createLine()]);
  const [charges, setCharges] = useState<AdditionalChargeForm[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [outputLanguage, setOutputLanguage] = useState<QuoteOutputLanguage>("bilingual");
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const draftsEnabled = useRef(true);
  const defaultsApplied = useRef(false);
  const customerFieldsEdited = useRef({ currency: false, incoterm: false });
  const contextApplied = useRef(false);
  const [pendingDraft, setPendingDraft] = useState<DraftEnvelope<QuoteDraft> | null>(() => {
    try { return readQuoteDraft(window.sessionStorage, userId, isQuoteDraft); } catch { return null; }
  });
  const [draftNotice, setDraftNotice] = useState("");
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [pasteCurrency, setPasteCurrency] = useState("");
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const pasted = useMemo(() => parseQuoteTable(pasteText), [pasteText]);
  const hasWork = Boolean(editingId || form.customerId || form.quoteNo || form.notes || form.notesEn || pasteText || charges.length || lines.some((line) => line.productName || line.description || line.unitPrice));
  const draft: QuoteDraft = { form, lines, charges, outputLayout, editingId, editingVersion, pasteText, pasteCurrency };
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const mayPersist = useRef(false);
  mayPersist.current = Boolean(userId && !pendingDraft && hasWork);
  const draftJson = JSON.stringify(draft);
  useEffect(() => {
    if (!userId || pendingDraft || !hasWork || !draftsEnabled.current) return;
    const persist = () => {
      if (!draftsEnabled.current) return;
      try {
        const ok = writeQuoteDraft(window.sessionStorage, userId, latestDraft.current);
        setDraftNotice(ok ? "草稿已保存在当前浏览器标签页；退出账号后清除" : "浏览器无法保存草稿，请及时保存报价");
      } catch { setDraftNotice("浏览器无法保存草稿，请及时保存报价"); }
    };
    const timer = window.setTimeout(persist, 500);
    const beforeUnload = (event: BeforeUnloadEvent) => { persist(); event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.clearTimeout(timer); window.removeEventListener("beforeunload", beforeUnload); };
  }, [draftJson, hasWork, pendingDraft, userId]);
  useEffect(() => () => {
    if (mayPersist.current && draftsEnabled.current) {
      try { writeQuoteDraft(window.sessionStorage, userId, latestDraft.current); } catch { /* Optional storage. */ }
    }
  }, [userId]);
  useEffect(() => {
    const clear = () => { draftsEnabled.current = false; setPendingDraft(null); setDraftNotice(""); };
    window.addEventListener("huayuan:clear-drafts", clear);
    return () => window.removeEventListener("huayuan:clear-drafts", clear);
  }, []);
  const clearDraft = () => {
    mayPersist.current = false;
    try { window.sessionStorage.removeItem(quoteDraftKey(userId)); } catch { /* Optional storage. */ }
    setPendingDraft(null);
    setDraftNotice("");
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await Promise.allSettled([
        getQuotes(),
        getCustomers(0, 1000, {}),
        getProducts(),
        getOpportunities(),
        getQuoteTermTemplates(),
        getQuoteOutputTemplates(),
      ]);
      const labels = ["报价列表", "客户列表", "产品库", "商机", "条款模板", "版式模板"];
      setLoadErrors(results.flatMap((result, index) => result.status === "rejected" ? [labels[index]] : []));
      const [quoteResult, customerResult, productResult, opportunityResult, templateResult, outputResult] = results;
      if (quoteResult.status === "fulfilled") setQuotes(quoteResult.value);
      if (customerResult.status === "fulfilled") setCustomers(customerResult.value.customers);
      if (productResult.status === "fulfilled") setProducts(productResult.value);
      if (opportunityResult.status === "fulfilled") setOpportunities(opportunityResult.value);
      if (templateResult.status === "fulfilled") setTermTemplates(templateResult.value);
      if (outputResult.status === "fulfilled") setOutputTemplates(outputResult.value);
      const templatesData = templateResult.status === "fulfilled" ? templateResult.value : [];
      const outputTemplatesData = outputResult.status === "fulfilled" ? outputResult.value : [];
      if (defaultsApplied.current) return;
      defaultsApplied.current = true;
      const defaultTemplate = templatesData.find((template) => template.isDefault);
      if (defaultTemplate) {
        setForm((current) => current.termTemplateId || current.terms || current.termsEn ? current : {
          ...current,
          termTemplateId: String(defaultTemplate.id),
          terms: defaultTemplate.contentZh || "",
          termsEn: defaultTemplate.contentEn || "",
        });
        setTemplateName((current) => current || defaultTemplate.name);
      }
      const defaultOutputTemplate = outputTemplatesData.find((template) => template.isDefault) || outputTemplatesData[0];
      if (defaultOutputTemplate) {
        setForm((current) => current.outputTemplateId ? current : { ...current, outputTemplateId: String(defaultOutputTemplate.id) });
        setOutputLayout(cloneQuoteOutputLayout(defaultOutputTemplate.layout));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!contextCustomerId || pendingDraft || contextApplied.current || hasWork || isLoading) return;
    let ignore = false;
    getCustomer360(contextCustomerId).then((data) => {
      if (ignore || contextApplied.current) return;
      contextApplied.current = true;
      setCustomers((current) => [...current.filter((customer) => customer.id !== data.customer.id), data.customer]);
      const linked = data.opportunities.find((opportunity) => String(opportunity.id) === contextOpportunityId || opportunity.opportunityId === contextOpportunityId);
      if (linked) setOpportunities((current) => [...current.filter((opportunity) => opportunity.id !== linked.id), linked]);
      setForm((current) => quoteCustomerDefaults({ ...current, customerId: String(data.customer.id), opportunityId: linked ? String(linked.id) : "" }, data.customer, customerFieldsEdited.current, false));
    }).catch(() => { if (!ignore) toast.error("来源客户无法加载，请重新选择客户；不会使用未经授权的数据"); });
    return () => { ignore = true; };
  }, [contextCustomerId, contextOpportunityId, pendingDraft, hasWork, isLoading]);

  const resetEditor = () => {
    clearDraft();
    contextApplied.current = true;
    customerFieldsEdited.current = { currency: false, incoterm: false };
    const defaultTemplate = termTemplates.find((template) => template.isDefault);
    const defaultOutputTemplate = outputTemplates.find((template) => template.isDefault) || outputTemplates[0];
    setEditingId(null);
    setEditingVersion(null);
    setPasteText("");
    setPasteCurrency("");
    setForm({
      ...createForm(),
      termTemplateId: defaultTemplate ? String(defaultTemplate.id) : "",
      terms: defaultTemplate?.contentZh || "",
      termsEn: defaultTemplate?.contentEn || "",
      outputTemplateId: defaultOutputTemplate ? String(defaultOutputTemplate.id) : "",
    });
    setTemplateName(defaultTemplate?.name || "");
    setLines([createLine()]);
    setSelectedLines([]);
    setCharges([]);
    setOutputLayout(cloneQuoteOutputLayout(defaultOutputTemplate?.layout || DEFAULT_QUOTE_OUTPUT_LAYOUT));
  };

  const applyOutputTemplate = (value: string) => {
    const template = outputTemplates.find((item) => String(item.id) === value);
    if (!template) return;
    setForm((current) => ({ ...current, outputTemplateId: String(template.id) }));
    setOutputLayout(cloneQuoteOutputLayout(template.layout));
  };

  const updateLine = (key: string, updates: Partial<QuoteLineForm>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...updates } : line));
  };

  const selectProduct = (key: string, selectionId: string) => {
    if (selectionId === "manual") {
      updateLine(key, { selectionId, productId: "", productCode: "", variantId: "" });
      return;
    }
    const [kind, productKey, variantKey] = selectionId.split(":");
    const product = products.find((item) => String(item.id) === productKey);
    if (!product) return;
    const variant = kind === "variant"
      ? product.variants?.find((item) => String(item.variantId || item.id) === variantKey)
      : undefined;
    const availablePrices = variant?.prices?.length ? variant.prices : product.prices || [];
    const referencePrice = quoteReferencePrice(form.currency, availablePrices, product);
    updateLine(key, {
      selectionId,
      productId: product.productId || String(product.id),
      productName: product.name,
      productCode: product.code || "",
      variantId: variant?.variantId || "",
      sku: variant?.sku || product.sku || product.code || "",
      standard: variant?.standard || "",
      material: variant?.material || "",
      pressureRating: variant?.pressureRating || "",
      nominalSize: variant?.nominalSize || "",
      facing: variant?.facing || "",
      surfaceTreatment: variant?.surfaceTreatment || "",
      weight: String(variant?.weight || product.weight || ""),
      weightUnit: variant?.weightUnit || product.weightUnit || "kg",
      packaging: variant?.packaging || product.packaging || "",
      inspectionRequirements: variant?.inspectionRequirements || "",
      certificateRequirements: variant?.certificateRequirements || "",
      description: variant?.quoteDescription || product.description || "",
      unit: variant?.unit || product.unit || "pcs",
      unitPrice: referencePrice,
    });
    if (!referencePrice) toast.info(`该产品没有 ${form.currency} 参考价，请确认并填写单价；报价币种未改变`);
  };

  const applyTermTemplate = (value: string) => {
    if (value === "none") {
      setForm((current) => ({ ...current, termTemplateId: "" }));
      setTemplateName("");
      return;
    }
    const template = termTemplates.find((item) => String(item.id) === value);
    if (!template) return;
    setForm((current) => ({
      ...current,
      termTemplateId: String(template.id),
      terms: template.contentZh || "",
      termsEn: template.contentEn || "",
    }));
    setTemplateName(template.name);
  };

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) return toast.error("请填写模板名称");
    if (!form.terms.trim() && !form.termsEn.trim()) return toast.error("请先填写中文或英文公司条款");
    try {
      const created = await createQuoteTermTemplate({
        name: templateName.trim(),
        contentZh: form.terms.trim() || undefined,
        contentEn: form.termsEn.trim() || undefined,
      });
      setTermTemplates((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((current) => ({ ...current, termTemplateId: String(created.id) }));
      toast.success("公司条款模板已保存");
    } catch {
      // API client displays the error.
    }
  };

  const handleUpdateTemplate = async (setDefault = false) => {
    if (!form.termTemplateId) return toast.error("请先选择需要更新的模板");
    if (!templateName.trim()) return toast.error("请填写模板名称");
    try {
      const updated = await updateQuoteTermTemplate(form.termTemplateId, {
        name: templateName.trim(),
        contentZh: form.terms.trim(),
        contentEn: form.termsEn.trim(),
        ...(setDefault ? { isDefault: true } : {}),
      });
      setTermTemplates((current) => current.map((item) => item.id === updated.id
        ? updated
        : setDefault ? { ...item, isDefault: false } : item));
      toast.success(setDefault ? "已设为默认公司条款" : "公司条款模板已更新");
    } catch {
      // API client displays the error.
    }
  };

  const handleDeleteTemplate = async () => {
    if (!form.termTemplateId) return;
    if (!confirm("确定删除所选公司条款模板吗？已生成的报价内容不会被删除。")) return;
    try {
      await deleteQuoteTermTemplate(form.termTemplateId);
      setTermTemplates((current) => current.filter((item) => String(item.id) !== form.termTemplateId));
      setForm((current) => ({ ...current, termTemplateId: "" }));
      setTemplateName("");
      toast.success("公司条款模板已删除");
    } catch {
      // API client displays the error.
    }
  };

  const calculations = useMemo(() => {
    return calculateQuoteTotals(
      lines,
      form.freight,
      form.taxRate,
      charges,
      form.exchangeRate,
    );
  }, [charges, form.exchangeRate, form.freight, form.taxRate, lines]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving.current || pendingDraft) return;
    if (editingId && (quotes.find((quote) => quote.id === editingId)?.updatedAt || null) !== editingVersion) {
      toast.error("原报价已更新，请重新加载并核对后再编辑；当前草稿仍保留"); return;
    }
    if (!form.customerId || !lines.length || lines.some((line) => !line.productName.trim())) {
      toast.error("请选择客户，并为每一行填写产品名称");
      return;
    }
    if (lines.some((line) => !line.unitPrice.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0 || !Number.isFinite(Number(line.unitPrice)))) {
      toast.error("请检查每一行的数量和单价");
      return;
    }
    if (!form.exchangeRate.trim() || !Number.isFinite(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0) {
      toast.error("汇率必须大于 0");
      return;
    }
    const activeCharges = charges.filter((charge) => charge.label.trim() || Number(charge.amount) !== 0);
    if (activeCharges.some((charge) => !charge.label.trim() || Number(charge.amount) < 0)) {
      toast.error("请填写每项附加费用的名称和有效金额");
      return;
    }
    const opportunity = opportunities.find((item) => String(item.id) === form.opportunityId);
    const data = {
      customerId: Number(form.customerId),
      opportunityId: opportunity?.opportunityId || (opportunity ? String(opportunity.id) : null),
      quoteNo: form.quoteNo.trim() || undefined,
      currency: form.currency.trim().toUpperCase() || "USD",
      baseCurrency: form.baseCurrency.trim().toUpperCase() || "CNY",
      exchangeRate: Number(form.exchangeRate),
      status: form.status,
      freight: Number(form.freight || 0),
      additionalCharges: activeCharges.map((charge) => ({ label: charge.label.trim(), amount: Number(charge.amount || 0) })),
      taxRate: Number(form.taxRate || 0),
      validUntil: form.validUntil || undefined,
      incoterm: form.incoterm.trim() || undefined,
      originPort: form.originPort.trim() || undefined,
      destinationPort: form.destinationPort.trim() || undefined,
      deliveryTime: form.deliveryTime.trim() || undefined,
      paymentTerms: form.paymentTerms.trim() || undefined,
      packagingTerms: form.packagingTerms.trim() || undefined,
      warrantyTerms: form.warrantyTerms.trim() || undefined,
      notes: form.notes.trim() || undefined,
      notesEn: form.notesEn.trim() || undefined,
      terms: form.terms.trim() || undefined,
      termsEn: form.termsEn.trim() || undefined,
      termTemplateId: form.termTemplateId ? Number(form.termTemplateId) : null,
      ...(outputLayoutLocked ? {} : {
        outputTemplateId: form.outputTemplateId ? Number(form.outputTemplateId) : null,
        outputLayout,
      }),
      items: lines.map((line) => ({
        productId: line.productId || undefined,
        productName: line.productName.trim(),
        productCode: line.productCode.trim() || undefined,
        variantId: line.variantId || undefined,
        sku: line.sku.trim() || undefined,
        standard: line.standard.trim() || undefined,
        material: line.material.trim() || undefined,
        pressureRating: line.pressureRating.trim() || undefined,
        nominalSize: line.nominalSize.trim() || undefined,
        facing: line.facing.trim() || undefined,
        surfaceTreatment: line.surfaceTreatment.trim() || undefined,
        weight: Number(line.weight || 0),
        weightUnit: line.weightUnit.trim() || undefined,
        packaging: line.packaging.trim() || undefined,
        inspectionRequirements: line.inspectionRequirements.trim() || undefined,
        certificateRequirements: line.certificateRequirements.trim() || undefined,
        description: line.description.trim() || undefined,
        quantity: Number(line.quantity),
        unit: line.unit.trim() || "pcs",
        unitPrice: Number(line.unitPrice),
        discount: Number(line.discount || 0),
      })),
    };
    saving.current = true;
    setIsSaving(true);
    try {
      if (editingId) {
        await updateQuote(editingId, data);
        toast.success("报价单已更新，所有产品行和商务条款均已保存");
      } else {
        await createQuote(data);
        toast.success("报价单已创建");
      }
      resetEditor();
      await fetchData();
    } catch {
      // API client displays the error.
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  const handleEdit = (quote: Quote, asNew = false) => {
    if (saving.current || pendingDraft) return;
    if (hasWork && !confirm("切换报价会替换当前未保存内容，确定继续？")) return;
    clearDraft();
    contextApplied.current = true;
    customerFieldsEdited.current = { currency: true, incoterm: true };
    const opportunity = opportunities.find((candidate) =>
      candidate.opportunityId === quote.opportunityId || String(candidate.id) === quote.opportunityId,
    );
    const template = termTemplates.find((item) => String(item.id) === String(quote.termTemplateId || ""));
    setForm({
      customerId: String(quote.customerId || ""),
      opportunityId: opportunity ? String(opportunity.id) : "",
      quoteNo: asNew ? "" : quote.quoteNo || "",
      currency: quote.currency || "USD",
      baseCurrency: quote.baseCurrency || "CNY",
      exchangeRate: asNew ? "" : String(quote.exchangeRate || 1),
      status: asNew ? "draft" : quote.status,
      freight: String(quote.freight || 0),
      taxRate: String(quote.taxRate || 0),
      validUntil: asNew ? "" : quote.validUntil?.split("T")[0] || "",
      incoterm: quote.incoterm || "",
      originPort: quote.originPort || "",
      destinationPort: quote.destinationPort || "",
      deliveryTime: quote.deliveryTime || "",
      paymentTerms: quote.paymentTerms || "",
      packagingTerms: quote.packagingTerms || "",
      warrantyTerms: quote.warrantyTerms || "",
      notes: quote.notes || "",
      notesEn: quote.notesEn || "",
      terms: quote.terms || "",
      termsEn: quote.termsEn || "",
      termTemplateId: quote.termTemplateId ? String(quote.termTemplateId) : "",
      outputTemplateId: quote.outputTemplateId ? String(quote.outputTemplateId) : "",
    });
    setTemplateName(template?.name || "");
    setCharges((quote.additionalCharges || []).map((charge) => ({ key: createKey(), label: charge.label, amount: String(charge.amount) })));
    setLines((quote.items?.length ? quote.items : [createLine()]).map((item) => {
      if ("key" in item) return item as QuoteLineForm;
      const product = products.find((candidate) =>
        candidate.productId === item.productId || String(candidate.id) === item.productId,
      );
      return {
        key: createKey(),
        selectionId: item.variantId && product ? `variant:${product.id}:${item.variantId}` : product ? `product:${product.id}` : "manual",
        productId: item.productId || "",
        productName: item.productName || "",
        productCode: item.productCode || "",
        variantId: item.variantId || "",
        sku: item.sku || "",
        standard: item.standard || "",
        material: item.material || "",
        pressureRating: item.pressureRating || "",
        nominalSize: item.nominalSize || "",
        facing: item.facing || "",
        surfaceTreatment: item.surfaceTreatment || "",
        weight: String(item.weight || ""),
        weightUnit: item.weightUnit || "kg",
        packaging: item.packaging || "",
        inspectionRequirements: item.inspectionRequirements || "",
        certificateRequirements: item.certificateRequirements || "",
        description: item.description || "",
        quantity: String(item.quantity ?? 1),
        unit: item.unit || product?.unit || "pcs",
        unitPrice: asNew ? "" : String(item.unitPrice ?? ""),
        discount: String(item.discount || 0),
      };
    }));
    setEditingId(asNew ? null : quote.id);
    setEditingVersion(asNew ? null : quote.updatedAt || null);
    if (asNew) toast.info("已复制为新报价，单价、汇率和有效期需要重新确认；运费及其他商务条款也请核对");
    setOutputLayout(cloneQuoteOutputLayout(quote.outputLayout || DEFAULT_QUOTE_OUTPUT_LAYOUT));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该报价单吗？")) return;
    try {
      await deleteQuote(id);
      toast.success("报价单已删除");
      await fetchData();
    } catch {
      // API client displays the error.
    }
  };

  const filteredOpportunities = form.customerId
    ? opportunities.filter((item) => String(item.customerId) === form.customerId)
    : opportunities;
  const editingQuote = editingId ? quotes.find((quote) => quote.id === editingId) : undefined;
  const outputLayoutLocked = Boolean(editingQuote?.outputLockedAt);

  return (
    <div className="space-y-6">
      {loadErrors.length > 0 && <div role="alert" className="rounded-md border p-3 text-sm">{loadErrors.join("、")}加载失败，已填写的内容会保留。<Button type="button" variant="outline" onClick={() => void fetchData()} disabled={isLoading}>重新加载</Button></div>}
      {pendingDraft && <div className="rounded-md border p-3 space-y-2 text-sm">
        <p>发现 {new Date(pendingDraft.savedAt).toLocaleString()} 的未保存报价草稿。恢复前请核对价格和汇率。</p>
        <Button type="button" disabled={isLoading || loadErrors.includes("报价列表")} onClick={() => {
          const saved = pendingDraft.data;
          const currentQuote = saved.editingId ? quotes.find((quote) => quote.id === saved.editingId) : null;
          if (saved.editingId && (!currentQuote || (currentQuote.updatedAt || null) !== saved.editingVersion)) {
            toast.error("原报价已更新、删除或不再可访问，请先核对原报价；草稿仍保留"); return;
          }
          defaultsApplied.current = true;
          customerFieldsEdited.current = { currency: true, incoterm: true };
          setForm(saved.form); setLines(saved.lines); setCharges(saved.charges); setOutputLayout(saved.outputLayout); setEditingId(saved.editingId); setEditingVersion(saved.editingVersion); setPasteText(saved.pasteText); setPasteCurrency(saved.pasteCurrency); setPendingDraft(null);
        }}>恢复草稿</Button>
        <Button type="button" variant="outline" onClick={() => {
          if (!confirm("恢复为新报价，不覆盖原报价；单价、汇率和有效期将清空，确定继续？")) return;
          const saved = pendingDraft.data;
          defaultsApplied.current = true;
          setForm({ ...saved.form, quoteNo: "", status: "draft", exchangeRate: "", validUntil: "" });
          setLines(saved.lines.map((line) => ({ ...line, unitPrice: "" })));
          setCharges(saved.charges); setOutputLayout(saved.outputLayout); setEditingId(null); setEditingVersion(null); setPasteText(saved.pasteText); setPasteCurrency(""); setPendingDraft(null);
        }}>恢复为新报价</Button>
        <Button type="button" variant="outline" onClick={() => { if (confirm("确定删除此标签页的未保存草稿？")) clearDraft(); }}>放弃草稿</Button>
      </div>}
      {canManage && <Card>
        <CardHeader>
          <CardTitle>{editingId ? "编辑报价单" : "创建报价单"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="quote-editor space-y-6">
            <fieldset disabled={isSaving || Boolean(pendingDraft)} className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">基本信息</h3>
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="客户 *">
                  <CustomerPicker value={form.customerId} customers={customers} onChange={(customer) => {
                    setCustomers((current) => [...current.filter((item) => item.id !== customer.id), customer]);
                    setForm((current) => quoteCustomerDefaults({ ...current, customerId: String(customer.id), opportunityId: "" }, customer, customerFieldsEdited.current, lines.some((line) => Boolean(line.unitPrice.trim()))));
                  }} />
                </Field>
                <Field label="关联商机">
                  <Select value={form.opportunityId || "none"} onValueChange={(value) => value && setForm((current) => ({ ...current, opportunityId: value === "none" ? "" : value }))}>
                    <SelectTrigger>{form.opportunityId ? opportunities.find((item) => String(item.id) === form.opportunityId)?.name || "选择商机" : "不关联商机"}</SelectTrigger>
                    <SelectContent><SelectItem value="none">不关联商机</SelectItem>{filteredOpportunities.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="报价编号"><Input placeholder="留空自动生成" value={form.quoteNo} onChange={(event) => setForm((current) => ({ ...current, quoteNo: event.target.value }))} /></Field>
                <Field label="状态">
                  <Select value={form.status} onValueChange={(value) => value && setForm((current) => ({ ...current, status: value as Quote["status"] }))}>
                    <SelectTrigger>{QUOTE_STATUSES.find((item) => item.value === form.status)?.label || "选择状态"}</SelectTrigger>
                    <SelectContent>{QUOTE_STATUSES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="报价币种"><CurrencyInput label="报价币种" value={form.currency} onCommit={(currency) => {
                  customerFieldsEdited.current.currency = true;
                  if (lines.some((line) => line.unitPrice.trim()) && !confirm("改变币种将清空所有行单价及汇率，避免金额被直接改标。是否继续？")) return false;
                  setLines((current) => current.map((line) => ({ ...line, unitPrice: "" })));
                  setForm((current) => ({ ...current, currency, exchangeRate: "" }));
                  return true;
                }} /></Field>
                <Field label="基准币种"><CurrencyInput label="基准币种" value={form.baseCurrency} onCommit={(baseCurrency) => { setForm((current) => ({ ...current, baseCurrency, exchangeRate: "" })); return true; }} /></Field>
                <Field label={`汇率（1 ${form.currency || "报价币种"} = ? ${form.baseCurrency || "基准币种"}）`}><Input type="number" min="0.000001" step="0.000001" value={form.exchangeRate} onChange={(event) => setForm((current) => ({ ...current, exchangeRate: event.target.value }))} /></Field>
                <Field label="有效期至"><Input type="date" value={form.validUntil} onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))} /></Field>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div><h3 className="text-sm font-semibold">报价产品明细 *</h3><p className="text-xs text-muted-foreground">支持目录产品、规格变体和手工报价行。</p></div>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, createLine()])}><Plus className="mr-1 h-4 w-4" />添加产品行</Button>
              </div>
              <details className="rounded-md border p-3 space-y-3">
                <summary className="cursor-pointer text-sm font-medium">从 Excel / 询价表粘贴产品行</summary>
                <p className="text-sm text-muted-foreground">按“产品名称、数量、单位、单价、描述（可选）”排列，复制表格单元格粘贴。价格不会换算；确认币种后追加，不覆盖已有产品。</p>
                <Textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={"法兰\t10\tpcs\t12.50\tASME B16.5"} aria-label="粘贴询价产品表格" />
                {pasteText && pasted.errors.map((error) => <p key={error} role="alert" className="text-sm text-destructive">{error}</p>)}
                {pasteText && pasted.lines.length > 0 && <div className="max-h-60 overflow-auto"><Table><TableHeader><TableRow><TableHead>产品</TableHead><TableHead>数量</TableHead><TableHead>单位</TableHead><TableHead>单价（{form.currency}）</TableHead><TableHead>描述/规格</TableHead></TableRow></TableHeader><TableBody>{pasted.lines.map((line, index) => <TableRow key={index}><TableCell>{line.productName}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{line.unit}</TableCell><TableCell>{line.unitPrice}</TableCell><TableCell>{line.description}</TableCell></TableRow>)}</TableBody></Table></div>}
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={pasteCurrency === form.currency} onChange={(event) => setPasteCurrency(event.target.checked ? form.currency : "")} />确认粘贴单价为 {form.currency}，已核对规格和价格</label>
                <Button type="button" variant="outline" disabled={!pasteText || pasted.errors.length > 0 || !pasted.lines.length || pasteCurrency !== form.currency} onClick={() => {
                  setLines((current) => [...current, ...pasted.lines.map((line) => ({ ...createLine(), ...line }))]);
                  setPasteText(""); setPasteCurrency("");
                  toast.success(`已追加 ${pasted.lines.length} 行，请核对后保存`);
                }}>确认追加 {pasted.lines.length} 行</Button>
              </details>
              <QuoteBulkSpecifications lines={lines} selected={selectedLines} onSelect={setSelectedLines} onApply={(keys, values, overwrite) => {
                setLines((current) => applyBulkSpecs(current, keys, values, overwrite));
                toast.success("规格已更新，请核对后保存报价单");
              }} />
              {lines.map((line, index) => {
                const discount = Math.min(100, Math.max(0, Number(line.discount) || 0));
                const lineAmount = roundMoney((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * (1 - discount / 100));
                return <div key={line.key} className="space-y-3 rounded-xl border bg-background/30 p-4">
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><input type="checkbox" aria-label={`选择报价行 ${index + 1}`} checked={selectedLines.includes(line.key)} onChange={(event) => setSelectedLines((current) => event.target.checked ? [...current, line.key] : current.filter((key) => key !== line.key))} />第 {index + 1} 行 · 加入批量规格填写</label>
                  <div className="grid gap-3 md:grid-cols-12">
                    <Field label={`产品 ${index + 1}`} className="md:col-span-4">
                      <Select value={line.selectionId} onValueChange={(value) => value && selectProduct(line.key, value)}>
                        <SelectTrigger>{line.selectionId === "manual" ? "手工录入" : line.productName || <SelectValue placeholder="选择产品" />}</SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">手工录入</SelectItem>
                          {products.map((product) => [
                            <SelectItem key={`product-${product.id}`} value={`product:${product.id}`}>{product.name} · {product.sku || product.code || "主产品"}</SelectItem>,
                            ...(product.variants || []).filter((variant) => variant.active !== false).map((variant) => <SelectItem key={`variant-${product.id}-${variant.variantId || variant.id}`} value={`variant:${product.id}:${variant.variantId || variant.id}`}>↳ {variant.sku} · {[variant.standard, variant.material, variant.pressureRating, variant.nominalSize].filter(Boolean).join(" / ")}</SelectItem>),
                          ])}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="产品名称 *" className="md:col-span-3"><Input value={line.productName} onChange={(event) => updateLine(line.key, { productName: event.target.value })} required /></Field>
                    <Field label="数量" className="md:col-span-1"><Input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required /></Field>
                    <Field label="单位" className="md:col-span-1"><Input value={line.unit} onChange={(event) => updateLine(line.key, { unit: event.target.value })} /></Field>
                    <Field label="单价" className="md:col-span-1"><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} required /></Field>
                    <Field label="折扣%" className="md:col-span-1"><Input type="number" min="0" max="100" step="0.01" value={line.discount} onChange={(event) => updateLine(line.key, { discount: event.target.value })} /></Field>
                    <div className="flex items-center justify-end gap-2 border-t pt-2 md:col-span-12"><Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, { ...line, key: createKey() }])}>复制行</Button><Button type="button" variant="ghost" size="icon" className="text-destructive" title="删除产品行" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">行金额（已扣折扣）</span><strong>{form.currency} {lineAmount.toFixed(2)}</strong></div>
                  <details className="rounded-md bg-muted/40 p-3">
                    <summary className="cursor-pointer text-sm font-medium">规格、材质与技术要求</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <Field label="SKU"><Input value={line.sku} onChange={(event) => updateLine(line.key, { sku: event.target.value })} /></Field>
                      <Field label="标准"><Input value={line.standard} onChange={(event) => updateLine(line.key, { standard: event.target.value })} placeholder="ASME / EN / DIN / JIS" /></Field>
                      <Field label="材质"><Input value={line.material} onChange={(event) => updateLine(line.key, { material: event.target.value })} /></Field>
                      <Field label="压力等级"><Input value={line.pressureRating} onChange={(event) => updateLine(line.key, { pressureRating: event.target.value })} /></Field>
                      <Field label="口径"><Input value={line.nominalSize} onChange={(event) => updateLine(line.key, { nominalSize: event.target.value })} /></Field>
                      <Field label="密封面"><Input value={line.facing} onChange={(event) => updateLine(line.key, { facing: event.target.value })} /></Field>
                      <Field label="表面处理"><Input value={line.surfaceTreatment} onChange={(event) => updateLine(line.key, { surfaceTreatment: event.target.value })} /></Field>
                      <Field label="包装"><Input value={line.packaging} onChange={(event) => updateLine(line.key, { packaging: event.target.value })} /></Field>
                      <Field label="检测要求" className="md:col-span-2"><Input value={line.inspectionRequirements} onChange={(event) => updateLine(line.key, { inspectionRequirements: event.target.value })} /></Field>
                      <Field label="证书要求" className="md:col-span-2"><Input value={line.certificateRequirements} onChange={(event) => updateLine(line.key, { certificateRequirements: event.target.value })} /></Field>
                      <Field label="报价描述" className="md:col-span-4">
                        {products.some((product) => product.descriptionTemplates?.length) && <select className="mb-2 h-9 w-full rounded-md border bg-background px-2 text-sm" defaultValue="" onChange={(event) => {
                          const [productId, templateId] = event.target.value.split(":");
                          const template = products.find((product) => String(product.id) === productId)?.descriptionTemplates?.find((item) => String(item.id) === templateId);
                          if (template) updateLine(line.key, { description: template.content });
                          event.currentTarget.value = "";
                        }}><option value="">套用产品报价描述模板</option>{products.flatMap((product) => (product.descriptionTemplates || []).map((template) => <option key={`${product.id}-${template.id || template.name}`} value={`${product.id}:${template.id}`}>{product.name} · {template.name}</option>))}</select>}
                        <Textarea rows={2} value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} placeholder="完整的产品规格、检测和证书说明" />
                      </Field>
                    </div>
                  </details>
                </div>;
              })}
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">费用与税费</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="运费"><Input type="number" min="0" step="0.01" value={form.freight} onChange={(event) => setForm((current) => ({ ...current, freight: event.target.value }))} /></Field>
                  <Field label="税率 (%)"><Input type="number" min="0" step="0.01" value={form.taxRate} onChange={(event) => setForm((current) => ({ ...current, taxRate: event.target.value }))} /><p className="text-xs text-muted-foreground">税额按商品小计计算。</p></Field>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label>附加费用</Label><Button type="button" variant="outline" size="sm" onClick={() => setCharges((current) => [...current, createCharge()])}><Plus className="mr-1 h-3.5 w-3.5" />添加费用</Button></div>
                  {charges.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">暂无附加费用，可添加文件费、银行费、检验费等。</p>}
                  {charges.map((charge) => <div key={charge.key} className="grid grid-cols-[1fr_140px_36px] gap-2"><Input placeholder="费用名称" value={charge.label} onChange={(event) => setCharges((current) => current.map((item) => item.key === charge.key ? { ...item, label: event.target.value } : item))} /><Input type="number" min="0" step="0.01" value={charge.amount} onChange={(event) => setCharges((current) => current.map((item) => item.key === charge.key ? { ...item, amount: event.target.value } : item))} /><Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setCharges((current) => current.filter((item) => item.key !== charge.key))}><Trash2 className="h-4 w-4" /></Button></div>)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <h3 className="mb-3 font-semibold">金额汇总</h3>
                <AmountRow label="商品小计" value={`${form.currency} ${calculations.subtotal.toFixed(2)}`} />
                <AmountRow label="运费" value={`${form.currency} ${calculations.freight.toFixed(2)}`} />
                <AmountRow label="附加费用" value={`${form.currency} ${calculations.additionalFeeTotal.toFixed(2)}`} />
                <AmountRow label={`税费（${Number(form.taxRate || 0)}%）`} value={`${form.currency} ${calculations.taxAmount.toFixed(2)}`} />
                <div className="mt-2 flex justify-between border-t pt-3 text-base font-bold"><span>报价总额</span><span>{form.currency} {calculations.total.toFixed(2)}</span></div>
                <div className="mt-2 flex justify-between text-muted-foreground"><span>参考折算</span><span>{Number(form.exchangeRate) > 0 ? `${form.baseCurrency} ${calculations.convertedTotal.toFixed(2)}` : "待确认汇率"}</span></div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">贸易、交付与保障条款</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Incoterms"><Input list="incoterms-list" value={form.incoterm} onChange={(event) => { customerFieldsEdited.current.incoterm = true; setForm((current) => ({ ...current, incoterm: event.target.value.toUpperCase() })); }} /><datalist id="incoterms-list">{INCOTERMS.map((term) => <option key={term} value={term} />)}</datalist></Field>
                <Field label="起运港"><Input value={form.originPort} onChange={(event) => setForm((current) => ({ ...current, originPort: event.target.value }))} placeholder="Shanghai, China" /></Field>
                <Field label="目的港"><Input value={form.destinationPort} onChange={(event) => setForm((current) => ({ ...current, destinationPort: event.target.value }))} placeholder="Bangkok, Thailand" /></Field>
                <Field label="交期"><Textarea rows={2} value={form.deliveryTime} onChange={(event) => setForm((current) => ({ ...current, deliveryTime: event.target.value }))} placeholder="收到定金后 30 天内" /></Field>
                <Field label="付款条件"><Textarea rows={2} value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="30% 定金，余款发货前付清" /></Field>
                <Field label="包装要求"><Textarea rows={2} value={form.packagingTerms} onChange={(event) => setForm((current) => ({ ...current, packagingTerms: event.target.value }))} placeholder="熏蒸木箱 / 托盘" /></Field>
                <Field label="质保条款" className="md:col-span-3"><Textarea rows={2} value={form.warrantyTerms} onChange={(event) => setForm((current) => ({ ...current, warrantyTerms: event.target.value }))} placeholder="自发货日起 12 个月" /></Field>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">中英文备注</h3>
              <div className="grid gap-4 md:grid-cols-2"><Field label="中文备注"><Textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="报价说明、例外事项等" /></Field><Field label="English Notes"><Textarea rows={3} value={form.notesEn} onChange={(event) => setForm((current) => ({ ...current, notesEn: event.target.value }))} placeholder="Quotation notes and exceptions" /></Field></div>
            </section>

            <section className="space-y-3 rounded-lg border p-4">
              <div><h3 className="text-sm font-semibold">公司条款模板</h3><p className="text-xs text-muted-foreground">选择模板后可继续修改，本次报价会保存条款快照，不受模板后续修改影响。</p></div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="套用模板"><Select value={form.termTemplateId || "none"} onValueChange={(value) => value && applyTermTemplate(value)}><SelectTrigger>{form.termTemplateId ? termTemplates.find((item) => String(item.id) === form.termTemplateId)?.name || "选择公司条款" : "不套用模板"}</SelectTrigger><SelectContent><SelectItem value="none">不套用模板</SelectItem>{termTemplates.map((template) => <SelectItem key={template.id} value={String(template.id)}>{template.isDefault ? "默认 · " : ""}{template.name}</SelectItem>)}</SelectContent></Select></Field>
                {isAdmin && <Field label="模板名称"><Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：标准出口条款" /></Field>}
                <Field label="中文公司条款"><Textarea rows={5} value={form.terms} onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))} /></Field>
                <Field label="English Company Terms"><Textarea rows={5} value={form.termsEn} onChange={(event) => setForm((current) => ({ ...current, termsEn: event.target.value }))} /></Field>
              </div>
              {isAdmin && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={handleCreateTemplate}><Save className="mr-2 h-4 w-4" />另存为新模板</Button><Button type="button" variant="outline" disabled={!form.termTemplateId} onClick={() => handleUpdateTemplate(false)}>更新所选模板</Button><Button type="button" variant="outline" disabled={!form.termTemplateId} onClick={() => handleUpdateTemplate(true)}>设为默认</Button><Button type="button" variant="ghost" className="text-destructive" disabled={!form.termTemplateId} onClick={handleDeleteTemplate}>删除模板</Button></div>}
            </section>

            <section className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">报价版式与模块</h3>
                  <p className="mt-1 text-xs text-muted-foreground">选择公司模板后可为本次报价继续调整；保存的是独立快照，模板后续变化不会改动历史报价。</p>
                </div>
                <Field label="套用版式模板" className="w-full sm:w-72">
                  <Select value={form.outputTemplateId || "none"} disabled={outputLayoutLocked} onValueChange={(value) => {
                    if (!value) return;
                    if (value === "none") {
                      setForm((current) => ({ ...current, outputTemplateId: "" }));
                      setOutputLayout(cloneQuoteOutputLayout(DEFAULT_QUOTE_OUTPUT_LAYOUT));
                    } else applyOutputTemplate(value);
                  }}>
                    <SelectTrigger>{form.outputTemplateId ? outputTemplates.find((item) => String(item.id) === form.outputTemplateId)?.name || "选择报价版式" : "标准版式"}</SelectTrigger>
                    <SelectContent><SelectItem value="none">标准版式</SelectItem>{outputTemplates.filter((template) => template.active).map((template) => <SelectItem key={template.id} value={String(template.id)}>{template.isDefault ? "默认 · " : ""}{template.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              {outputLayoutLocked && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">该报价已发送或已接受，版式快照已锁定，避免正式文件被事后改写。需要新格式时请复制创建新报价。</div>}
              <details className="rounded-lg border bg-muted/20 p-3"><summary className="cursor-pointer text-sm font-medium">展开版式编辑与打印预览</summary><div className="mt-4"><QuoteLayoutEditor value={outputLayout} onChange={setOutputLayout} disabled={outputLayoutLocked} /></div></details>
            </section>

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur-sm"><div className="text-sm"><span className="text-muted-foreground">{lines.length} 行产品 · 报价总额 </span><strong className="text-primary">{form.currency} {calculations.total.toFixed(2)}</strong></div><div className="flex gap-2"><Button type="submit" disabled={isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? "正在保存…" : editingId ? "保存报价修改" : "创建报价单"}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { if (confirm("确定放弃本次未保存的报价编辑？")) resetEditor(); }}>取消编辑</Button>}</div></div>
            {draftNotice && <p role="status" className="text-sm text-muted-foreground">{draftNotice}</p>}
            </fieldset>
          </form>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">报价单列表<Badge variant="secondary">{quotes.length}</Badge></span>
            <label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              输出语言
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={outputLanguage}
                onChange={(event) => setOutputLanguage(event.target.value as QuoteOutputLanguage)}
              >
                {OUTPUT_LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead>报价号</TableHead><TableHead>客户</TableHead><TableHead>产品</TableHead><TableHead>贸易术语</TableHead><TableHead>金额</TableHead><TableHead>参考折算</TableHead><TableHead>状态</TableHead><TableHead className="w-44">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, index) => <TableRow key={index}>{[...Array(8)].map((__, cell) => <TableCell key={cell}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>)
              : quotes.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">暂无报价单</TableCell></TableRow>
                : quotes.map((quote) => <TableRow key={quote.id}>
                  <TableCell className="font-mono text-sm">{quote.quoteNo || "-"}{canManage && <Button variant="outline" size="sm" className="ml-2" disabled={isSaving || Boolean(pendingDraft)} onClick={() => handleEdit(quote, true)}>复制新报价</Button>}</TableCell>
                  <TableCell>{quote.customer?.company || customers.find((item) => String(item.id) === String(quote.customerId))?.company || "-"}</TableCell>
                  <TableCell className="max-w-72 truncate" title={(quote.items || []).map((item) => item.productName).join("、")}>{(quote.items || []).map((item) => item.productName).join("、") || "-"}</TableCell>
                  <TableCell>{quote.incoterm || "-"}</TableCell>
                  <TableCell>{quote.currency} {Number(quote.total).toFixed(2)}</TableCell>
                  <TableCell>{quote.baseCurrency || "CNY"} {roundMoney(Number(quote.total || 0) * Number(quote.exchangeRate || 1)).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={quote.status === "accepted" ? "default" : "secondary"}>{QUOTE_STATUSES.find((item) => item.value === quote.status)?.label || "未知状态"}</Badge></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{canManage && <Button variant="ghost" size="sm" title="编辑报价单" onClick={() => handleEdit(quote)}><Edit className="h-4 w-4" /></Button>}<a href={quoteOutputUrl(quote.id, "preview", outputLanguage)} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="sm" title="打印预览"><Eye className="h-4 w-4" /></Button></a><a href={quoteOutputUrl(quote.id, "pdf", outputLanguage)}><Button variant="ghost" size="sm" title="下载 PDF"><FileText className="h-4 w-4" /></Button></a><a href={quoteOutputUrl(quote.id, "excel", outputLanguage)}><Button variant="ghost" size="sm" title="下载 Excel"><FileSpreadsheet className="h-4 w-4" /></Button></a><a href={quoteOutputUrl(quote.id, "package", outputLanguage)}><Button variant="ghost" size="sm" title="打包报价附件"><Archive className="h-4 w-4" /></Button></a>{canManage && <Button variant="ghost" size="sm" className="text-destructive" title="删除报价单" onClick={() => handleDelete(quote.id)}><Trash2 className="h-4 w-4" /></Button>}</div></TableCell>
                </TableRow>)}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label>{children}</div>;
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-1.5"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
