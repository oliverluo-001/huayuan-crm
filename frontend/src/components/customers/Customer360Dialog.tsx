import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  createCustomerActivity,
  createCustomerContact,
  createCustomerOpportunity,
  createCustomerTodo,
  createQuote,
  createSample,
  deleteContact,
  deleteCustomerAttachment,
  deleteTodo,
  downloadCustomerAttachment,
  getCustomer360,
  getCustomerAttachments,
  getProducts,
  updateContact,
  updateOpportunity,
  updateTodo,
  uploadCustomerAttachment,
  type Activity,
  type Contact,
  type Customer360,
  type CustomerAttachment,
  type Opportunity,
  type Product,
  type Sample,
} from "@/api/client";
import { canManageCrmData } from "@/auth/permissions";
import { useAuth } from "@/contexts/AuthContext";
import {
  CUSTOMER_JOURNEY_STAGES,
  OPPORTUNITY_STAGES,
} from "@/contracts/crm-stages";
import {
  ACTIVITY_TYPE_LABELS,
  ATTACHMENT_CATEGORY_OPTIONS,
  CUSTOMER_TIER_OPTIONS,
  EMAIL_SEND_STATUS_LABELS,
  QUOTE_STATUS_OPTIONS,
  SAMPLE_STATUS_OPTIONS,
  optionLabel,
  statusLabel,
} from "@/contracts/crm-terminology";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface Customer360DialogProps {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerChanged?: () => void;
}

type Workspace =
  | "overview"
  | "contacts"
  | "activities"
  | "todos"
  | "opportunities"
  | "quotes"
  | "samples"
  | "emails"
  | "attachments";

interface QuoteLineForm {
  key: string;
  productId: string;
  productName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
}

const activityTypes = Object.entries(ACTIVITY_TYPE_LABELS) as Array<
  [Activity["type"], string]
>;
const createQuoteLine = (): QuoteLineForm => ({
  key: `${Date.now()}-${Math.random()}`,
  productId: "",
  productName: "",
  quantity: "1",
  unit: "pcs",
  unitPrice: "",
  discount: "0",
});

export function Customer360Dialog({
  customerId,
  open,
  onOpenChange,
  onCustomerChanged,
}: Customer360DialogProps) {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const navigate = useNavigate();
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>("overview");
  const [data, setData] = useState<Customer360 | null>(null);
  const [attachments, setAttachments] = useState<CustomerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    isPrimary: false,
  });
  const [activityForm, setActivityForm] = useState({
    type: "note" as Activity["type"],
    subject: "",
    content: "",
  });
  const [todoForm, setTodoForm] = useState({
    title: "",
    dueAt: "",
    description: "",
  });
  const [opportunityForm, setOpportunityForm] = useState({
    name: "",
    amount: "",
    stage: "prospecting" as Opportunity["stage"],
    expectedCloseDate: "",
    description: "",
  });
  const [quoteForm, setQuoteForm] = useState({
    opportunityId: "",
    currency: "USD",
    freight: "0",
    taxRate: "0",
    validUntil: "",
    notes: "",
  });
  const [quoteLines, setQuoteLines] = useState<QuoteLineForm[]>([
    createQuoteLine(),
  ]);
  const [sampleForm, setSampleForm] = useState({
    opportunityId: "",
    productId: "",
    productName: "",
    quantity: "1",
    unit: "pcs",
    status: "pending" as Sample["status"],
    trackingNo: "",
    notes: "",
  });
  const [attachmentForm, setAttachmentForm] = useState({
    file: null as File | null,
    category: "inquiry" as CustomerAttachment["category"],
    note: "",
  });

  const refresh = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        const [customerResult, attachmentResult, productResult] =
          await Promise.allSettled([
          getCustomer360(customerId),
          getCustomerAttachments(customerId),
          getProducts(),
        ]);
        if (customerResult.status === "rejected") throw customerResult.reason;
        setData(customerResult.value);
        if (attachmentResult.status === "fulfilled") {
          setAttachments(attachmentResult.value);
          setAttachmentError("");
        } else {
          setAttachments([]);
          setAttachmentError(
            attachmentResult.reason instanceof Error
              ? attachmentResult.reason.message
              : "附件服务暂时不可用",
          );
        }
        setProducts(productResult.status === "fulfilled" ? productResult.value : []);
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "客户详情加载失败");
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [customerId],
  );

  useEffect(() => {
    if (open) {
      setActiveWorkspace("overview");
      void refresh(true);
    }
  }, [open, refresh]);

  const mutate = async (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setIsSaving(true);
    try {
      await action();
      await refresh(false);
      onCustomerChanged?.();
      toast.success(successMessage);
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const resetContactForm = () => {
    setEditingContactId(null);
    setContactForm({
      name: "",
      title: "",
      email: "",
      phone: "",
      isPrimary: false,
    });
  };

  const submitContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contactForm.name.trim()) return;
    const payload = {
      name: contactForm.name.trim(),
      title: contactForm.title.trim() || undefined,
      email: contactForm.email.trim() || undefined,
      phone: contactForm.phone.trim() || undefined,
      isPrimary:
        contactForm.isPrimary ||
        (!editingContactId && (data?.contacts.length || 0) === 0),
    };
    const succeeded = await mutate(
      () =>
        editingContactId
          ? updateContact(editingContactId, payload)
          : createCustomerContact(customerId, payload),
      editingContactId
        ? "联系人已更新，客户摘要已同步"
        : "联系人已添加，客户摘要已同步",
    );
    if (succeeded) resetContactForm();
  };

  const editContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name,
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || "",
      isPrimary: Boolean(contact.isPrimary),
    });
  };

  const submitActivity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activityForm.subject.trim() && !activityForm.content.trim()) return;
    const succeeded = await mutate(
      () =>
        createCustomerActivity(customerId, {
          type: activityForm.type,
          subject: activityForm.subject.trim() || undefined,
          content: activityForm.content.trim() || undefined,
        }),
      "跟进记录已添加，客户摘要已刷新",
    );
    if (succeeded) setActivityForm({ type: "note", subject: "", content: "" });
  };

  const submitTodo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!todoForm.title.trim()) return;
    const succeeded = await mutate(
      () =>
        createCustomerTodo(customerId, {
          title: todoForm.title.trim(),
          dueAt: todoForm.dueAt || undefined,
          description: todoForm.description.trim() || undefined,
        }),
      "下一次跟进任务已创建，客户摘要已刷新",
    );
    if (succeeded) setTodoForm({ title: "", dueAt: "", description: "" });
  };

  const submitOpportunity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!opportunityForm.name.trim()) return;
    const succeeded = await mutate(
      () =>
        createCustomerOpportunity(customerId, {
          name: opportunityForm.name.trim(),
          amount: Number(opportunityForm.amount || 0),
          stage: opportunityForm.stage,
          expectedCloseDate: opportunityForm.expectedCloseDate || undefined,
          description: opportunityForm.description.trim() || undefined,
        }),
      "商机已创建，客户跟进阶段已同步",
    );
    if (succeeded)
      setOpportunityForm({
        name: "",
        amount: "",
        stage: "prospecting",
        expectedCloseDate: "",
        description: "",
      });
  };

  const updateQuoteLine = (key: string, update: Partial<QuoteLineForm>) => {
    setQuoteLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...update } : line)),
    );
  };

  const chooseQuoteProduct = (key: string, value: string) => {
    const product = products.find((item) => String(item.id) === value);
    if (!product) return;
    updateQuoteLine(key, {
      productId: product.productId || String(product.id),
      productName: product.name,
      unit: product.unit || "pcs",
      unitPrice: product.price === undefined ? "" : String(product.price),
    });
    if (product.currency)
      setQuoteForm((current) => ({
        ...current,
        currency: product.currency || current.currency,
      }));
  };

  const submitQuote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !quoteLines.length ||
      quoteLines.some((line) => !line.productName.trim())
    ) {
      toast.error("请为每一行选择或填写产品");
      return;
    }
    if (
      quoteLines.some(
        (line) =>
          Number(line.quantity) <= 0 ||
          Number(line.unitPrice) < 0 ||
          !Number.isFinite(Number(line.unitPrice)),
      )
    ) {
      toast.error("请检查报价数量和单价");
      return;
    }
    const opportunity = data?.opportunities.find(
      (item) => String(item.id) === quoteForm.opportunityId,
    );
    const succeeded = await mutate(
      () =>
        createQuote({
          customerId: Number(customerId),
          opportunityId:
            opportunity?.opportunityId ||
            (opportunity ? String(opportunity.id) : null),
          currency: quoteForm.currency.trim() || "USD",
          freight: Number(quoteForm.freight || 0),
          taxRate: Number(quoteForm.taxRate || 0),
          validUntil: quoteForm.validUntil || undefined,
          notes: quoteForm.notes.trim() || undefined,
          items: quoteLines.map((line) => ({
            productId: line.productId || undefined,
            productName: line.productName.trim(),
            quantity: Number(line.quantity),
            unit: line.unit.trim() || "pcs",
            unitPrice: Number(line.unitPrice),
            discount: Number(line.discount || 0),
          })),
        }),
      "报价单已在当前客户下创建",
    );
    if (succeeded) {
      setQuoteForm({
        opportunityId: "",
        currency: "USD",
        freight: "0",
        taxRate: "0",
        validUntil: "",
        notes: "",
      });
      setQuoteLines([createQuoteLine()]);
    }
  };

  const chooseSampleProduct = (value: string) => {
    const product = products.find((item) => String(item.id) === value);
    if (!product) return;
    setSampleForm((current) => ({
      ...current,
      productId: product.productId || String(product.id),
      productName: product.name,
      unit: product.unit || "pcs",
    }));
  };

  const submitSample = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sampleForm.productName.trim()) return;
    const opportunity = data?.opportunities.find(
      (item) => String(item.id) === sampleForm.opportunityId,
    );
    const succeeded = await mutate(
      () =>
        createSample({
          customerId: Number(customerId),
          opportunityId:
            opportunity?.opportunityId ||
            (opportunity ? String(opportunity.id) : null),
          productId: sampleForm.productId || undefined,
          productName: sampleForm.productName.trim(),
          quantity: Number(sampleForm.quantity || 1),
          unit: sampleForm.unit.trim() || "pcs",
          status: sampleForm.status,
          trackingNo: sampleForm.trackingNo.trim() || undefined,
          notes: sampleForm.notes.trim() || undefined,
        }),
      "样品记录已在当前客户下创建",
    );
    if (succeeded)
      setSampleForm({
        opportunityId: "",
        productId: "",
        productName: "",
        quantity: "1",
        unit: "pcs",
        status: "pending",
        trackingNo: "",
        notes: "",
      });
  };

  const submitAttachment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!attachmentForm.file) {
      toast.error("请选择需要上传的文件");
      return;
    }
    const succeeded = await mutate(
      () =>
        uploadCustomerAttachment(customerId, attachmentForm.file!, {
          category: attachmentForm.category,
          note: attachmentForm.note.trim() || undefined,
        }),
      "附件已上传并关联到当前客户",
    );
    if (succeeded) {
      setAttachmentForm({ file: null, category: "inquiry", note: "" });
      if (attachmentInput.current) attachmentInput.current.value = "";
    }
  };

  const goTo = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] max-w-[calc(100%-1rem)] p-0 sm:max-w-7xl">
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <DialogTitle>
            客户 360°
            {data?.customer.company ? ` · ${data.customer.company}` : ""}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-[60vh] w-full" />
          </div>
        ) : !data ? (
          <div className="py-16 text-center text-sm text-destructive">
            <p>{error || "客户详情加载失败"}</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => void refresh(true)}
            >
              重新加载
            </Button>
          </div>
        ) : (
          <Tabs
            value={activeWorkspace}
            onValueChange={(value) =>
              value && setActiveWorkspace(value as Workspace)
            }
            className="min-h-0 gap-0"
          >
            <div className="border-b px-3 py-2">
              <TabsList
                variant="line"
                className="h-auto w-full justify-start overflow-x-auto"
              >
                <TabsTrigger value="overview" className="px-3 py-2">
                  概览
                </TabsTrigger>
                <TabsTrigger value="contacts" className="px-3 py-2">
                  联系人 {data.contacts.length}
                </TabsTrigger>
                <TabsTrigger value="activities" className="px-3 py-2">
                  跟进时间线 {data.activities.length}
                </TabsTrigger>
                <TabsTrigger value="todos" className="px-3 py-2">
                  待办任务{" "}
                  {data.todos.filter((item) => item.status !== "done").length}
                </TabsTrigger>
                <TabsTrigger value="opportunities" className="px-3 py-2">
                  商机 {data.opportunities.length}
                </TabsTrigger>
                <TabsTrigger value="quotes" className="px-3 py-2">
                  报价 {data.quotes.length}
                </TabsTrigger>
                <TabsTrigger value="samples" className="px-3 py-2">
                  样品 {data.samples.length}
                </TabsTrigger>
                <TabsTrigger value="emails" className="px-3 py-2">
                  邮件 {data.sendLogs?.length || 0}
                </TabsTrigger>
                <TabsTrigger value="attachments" className="px-3 py-2">
                  附件 {attachments.length}
                </TabsTrigger>
              </TabsList>
            </div>
            <ScrollArea className="max-h-[76vh]">
              <div className="p-5">
                <TabsContent value="overview">
                  <OverviewWorkspace
                    data={data}
                    attachments={attachments}
                    onOpenWorkspace={setActiveWorkspace}
                  />
                </TabsContent>

                <TabsContent value="contacts">
                  <Workspace
                    title="联系人"
                    description="维护联系人资料；主联系人会同步到客户列表和概览摘要。"
                  >
                    {attachmentError && (
                      <div className="flex flex-col justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center">
                        <div>
                          <p className="font-medium text-destructive">
                            附件服务暂时不可用
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {attachmentError}。联系人、跟进、待办、商机等其他工作区仍可正常使用。
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void refresh(false)}
                        >
                          重试附件服务
                        </Button>
                      </div>
                    )}
                    {canManage && (
                      <form
                        className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2"
                        onSubmit={submitContact}
                      >
                        <Input
                          placeholder="姓名 *"
                          value={contactForm.name}
                          onChange={(event) =>
                            setContactForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          required
                        />
                        <Input
                          placeholder="职务"
                          value={contactForm.title}
                          onChange={(event) =>
                            setContactForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                        <Input
                          type="email"
                          placeholder="邮箱"
                          value={contactForm.email}
                          onChange={(event) =>
                            setContactForm((current) => ({
                              ...current,
                              email: event.target.value,
                            }))
                          }
                        />
                        <Input
                          placeholder="电话 / WhatsApp"
                          value={contactForm.phone}
                          onChange={(event) =>
                            setContactForm((current) => ({
                              ...current,
                              phone: event.target.value,
                            }))
                          }
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={contactForm.isPrimary}
                            onChange={(event) =>
                              setContactForm((current) => ({
                                ...current,
                                isPrimary: event.target.checked,
                              }))
                            }
                          />
                          设为主联系人
                        </label>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={resetContactForm}
                          >
                            {editingContactId ? "取消编辑" : "清空"}
                          </Button>
                          <Button type="submit" disabled={isSaving}>
                            {editingContactId ? "保存联系人" : "新增联系人"}
                          </Button>
                        </div>
                      </form>
                    )}
                    <RecordList empty="暂无联系人">
                      {data.contacts.map((contact) => (
                        <RecordRow
                          key={contact.id}
                          actions={
                            canManage && (
                              <div className="flex shrink-0 gap-1">
                                {!contact.isPrimary && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title="设为主联系人"
                                    disabled={isSaving}
                                    onClick={() =>
                                      void mutate(
                                        () =>
                                          updateContact(contact.id, {
                                            isPrimary: true,
                                          }),
                                        "主联系人已更新，客户摘要已同步",
                                      )
                                    }
                                  >
                                    <Star className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="编辑联系人"
                                  onClick={() => editContact(contact)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive"
                                  title="删除联系人"
                                  disabled={isSaving}
                                  onClick={() =>
                                    confirm("确定删除该联系人吗？") &&
                                    void mutate(
                                      () => deleteContact(contact.id),
                                      "联系人已删除，客户摘要已同步",
                                    )
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )
                          }
                        >
                          <p className="font-medium">
                            {contact.name}
                            {contact.isPrimary && (
                              <Badge className="ml-2" variant="secondary">
                                主联系人
                              </Badge>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[contact.title, contact.email, contact.phone]
                              .filter(Boolean)
                              .join(" · ") || "未填写联系方式"}
                          </p>
                        </RecordRow>
                      ))}
                    </RecordList>
                  </Workspace>
                </TabsContent>

                <TabsContent value="activities">
                  <Workspace
                    title="跟进时间线"
                    description="统一记录电话、会议、邮件、WhatsApp 和销售备注。"
                  >
                    {canManage && (
                      <form
                        className="space-y-3 rounded-xl border bg-muted/20 p-4"
                        onSubmit={submitActivity}
                      >
                        <div className="grid gap-3 md:grid-cols-3">
                          <Select
                            value={activityForm.type}
                            onValueChange={(value) =>
                              value &&
                              setActivityForm((current) => ({
                                ...current,
                                type: value as Activity["type"],
                              }))
                            }
                          >
                            <SelectTrigger>
                              {statusLabel(
                                ACTIVITY_TYPE_LABELS,
                                activityForm.type,
                                "选择跟进方式",
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              {activityTypes.map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="md:col-span-2"
                            placeholder="跟进主题"
                            value={activityForm.subject}
                            onChange={(event) =>
                              setActivityForm((current) => ({
                                ...current,
                                subject: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <Textarea
                          placeholder="沟通内容、客户反馈和下一步计划 *"
                          rows={3}
                          value={activityForm.content}
                          onChange={(event) =>
                            setActivityForm((current) => ({
                              ...current,
                              content: event.target.value,
                            }))
                          }
                        />
                        <div className="flex justify-end">
                          <Button type="submit" disabled={isSaving}>
                            记录本次跟进
                          </Button>
                        </div>
                      </form>
                    )}
                    <RecordList empty="暂无跟进记录">
                      {data.activities.map((activity) => (
                        <RecordRow key={activity.id}>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {activity.subject || "跟进记录"}
                            </p>
                            <Badge variant="outline">
                              {statusLabel(
                                ACTIVITY_TYPE_LABELS,
                                activity.type,
                                "其他互动",
                              )}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(activity.createdAt)}
                            </span>
                          </div>
                          {activity.content && (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                              {activity.content}
                            </p>
                          )}
                        </RecordRow>
                      ))}
                    </RecordList>
                  </Workspace>
                </TabsContent>

                <TabsContent value="todos">
                  <Workspace
                    title="待办任务"
                    description="创建下一次跟进任务，并在完成后及时关闭。"
                  >
                    {canManage && (
                      <form
                        className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2"
                        onSubmit={submitTodo}
                      >
                        <Input
                          placeholder="下一次跟进内容 *"
                          value={todoForm.title}
                          onChange={(event) =>
                            setTodoForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          required
                        />
                        <Input
                          type="date"
                          value={todoForm.dueAt}
                          onChange={(event) =>
                            setTodoForm((current) => ({
                              ...current,
                              dueAt: event.target.value,
                            }))
                          }
                        />
                        <Input
                          className="md:col-span-2"
                          placeholder="补充说明"
                          value={todoForm.description}
                          onChange={(event) =>
                            setTodoForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                        <div className="flex justify-end md:col-span-2">
                          <Button type="submit" disabled={isSaving}>
                            创建下一次跟进
                          </Button>
                        </div>
                      </form>
                    )}
                    <RecordList empty="暂无待办任务">
                      {data.todos.map((todo) => (
                        <RecordRow
                          key={todo.id}
                          actions={
                            canManage && (
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title={
                                    todo.status === "done"
                                      ? "重新打开"
                                      : "标记完成"
                                  }
                                  disabled={isSaving}
                                  onClick={() =>
                                    void mutate(
                                      () =>
                                        updateTodo(todo.id, {
                                          status:
                                            todo.status === "done"
                                              ? "open"
                                              : "done",
                                        }),
                                      todo.status === "done"
                                        ? "待办已重新打开"
                                        : "待办已完成",
                                    )
                                  }
                                >
                                  {todo.status === "done" ? (
                                    <RotateCcw className="h-4 w-4" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive"
                                  title="删除待办"
                                  disabled={isSaving}
                                  onClick={() =>
                                    confirm("确定删除该待办吗？") &&
                                    void mutate(
                                      () => deleteTodo(todo.id),
                                      "待办已删除",
                                    )
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )
                          }
                        >
                          <p
                            className={
                              todo.status === "done"
                                ? "font-medium text-muted-foreground line-through"
                                : "font-medium"
                            }
                          >
                            {todo.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {todo.dueAt
                              ? `截止 ${formatDate(todo.dueAt)}`
                              : "未设置截止日期"}{" "}
                            · {todo.status === "done" ? "已完成" : "待处理"}
                          </p>
                          {todo.description && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {todo.description}
                            </p>
                          )}
                        </RecordRow>
                      ))}
                    </RecordList>
                  </Workspace>
                </TabsContent>

                <TabsContent value="opportunities">
                  <Workspace
                    title="销售商机"
                    description="从客户需求创建商机，并让客户阶段随当前商机同步。"
                  >
                    {canManage && (
                      <form
                        className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2"
                        onSubmit={submitOpportunity}
                      >
                        <Input
                          placeholder="商机名称 *"
                          value={opportunityForm.name}
                          onChange={(event) =>
                            setOpportunityForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          required
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="预计金额（USD）"
                          value={opportunityForm.amount}
                          onChange={(event) =>
                            setOpportunityForm((current) => ({
                              ...current,
                              amount: event.target.value,
                            }))
                          }
                        />
                        <Select
                          value={opportunityForm.stage}
                          onValueChange={(value) =>
                            value &&
                            setOpportunityForm((current) => ({
                              ...current,
                              stage: value as Opportunity["stage"],
                            }))
                          }
                        >
                          <SelectTrigger>
                            {optionLabel(
                              OPPORTUNITY_STAGES,
                              opportunityForm.stage,
                              "选择阶段",
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {OPPORTUNITY_STAGES.map((stage) => (
                              <SelectItem key={stage.value} value={stage.value}>
                                {stage.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="date"
                          value={opportunityForm.expectedCloseDate}
                          onChange={(event) =>
                            setOpportunityForm((current) => ({
                              ...current,
                              expectedCloseDate: event.target.value,
                            }))
                          }
                        />
                        <Textarea
                          className="md:col-span-2"
                          placeholder="需求、竞争情况和下一步"
                          value={opportunityForm.description}
                          onChange={(event) =>
                            setOpportunityForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                        <div className="flex justify-end md:col-span-2">
                          <Button type="submit" disabled={isSaving}>
                            创建商机
                          </Button>
                        </div>
                      </form>
                    )}
                    <RecordList empty="暂无商机">
                      {data.opportunities.map((opportunity, index) => (
                        <RecordRow
                          key={opportunity.id}
                          actions={
                            canManage && (
                              <Select
                                value={opportunity.stage}
                                onValueChange={(value) =>
                                  value &&
                                  void mutate(
                                    () =>
                                      updateOpportunity(opportunity.id, {
                                        stage: value as Opportunity["stage"],
                                      }),
                                    "商机阶段与客户跟进阶段已同步",
                                  )
                                }
                              >
                                <SelectTrigger className="w-32">
                                  {optionLabel(
                                    OPPORTUNITY_STAGES,
                                    opportunity.stage,
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  {OPPORTUNITY_STAGES.map((stage) => (
                                    <SelectItem
                                      key={stage.value}
                                      value={stage.value}
                                    >
                                      {stage.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          }
                        >
                          <p className="font-medium">
                            {opportunity.name}
                            {index === 0 && (
                              <Badge className="ml-2" variant="secondary">
                                当前商机
                              </Badge>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            USD{" "}
                            {Number(opportunity.amount || 0).toLocaleString(
                              "en-US",
                              { minimumFractionDigits: 2 },
                            )}{" "}
                            · 成交概率 {opportunity.probability ?? 0}%
                            {opportunity.expectedCloseDate
                              ? ` · 预计 ${formatDate(opportunity.expectedCloseDate)}`
                              : ""}
                          </p>
                        </RecordRow>
                      ))}
                    </RecordList>
                  </Workspace>
                </TabsContent>

                <TabsContent value="quotes">
                  <Workspace
                    title="报价"
                    description="在当前客户上下文中创建多行报价，无需重新选择客户。"
                    action={
                      <Button variant="outline" onClick={() => goTo("/quotes")}>
                        完整报价管理
                        <ExternalLink className="ml-1 h-4 w-4" />
                      </Button>
                    }
                  >
                    {canManage && (
                      <form
                        className="space-y-4 rounded-xl border bg-muted/20 p-4"
                        onSubmit={submitQuote}
                      >
                        <div className="grid gap-3 md:grid-cols-3">
                          <Select
                            value={quoteForm.opportunityId || "none"}
                            onValueChange={(value) =>
                              value &&
                              setQuoteForm((current) => ({
                                ...current,
                                opportunityId: value === "none" ? "" : value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              {quoteForm.opportunityId
                                ? data.opportunities.find(
                                    (item) =>
                                      String(item.id) ===
                                      quoteForm.opportunityId,
                                  )?.name || "关联商机"
                                : "不关联商机"}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">不关联商机</SelectItem>
                              {data.opportunities.map((item) => (
                                <SelectItem
                                  key={item.id}
                                  value={String(item.id)}
                                >
                                  {item.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="币种"
                            value={quoteForm.currency}
                            onChange={(event) =>
                              setQuoteForm((current) => ({
                                ...current,
                                currency: event.target.value,
                              }))
                            }
                          />
                          <Input
                            type="date"
                            value={quoteForm.validUntil}
                            onChange={(event) =>
                              setQuoteForm((current) => ({
                                ...current,
                                validUntil: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          {quoteLines.map((line, index) => (
                            <div
                              key={line.key}
                              className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-6"
                            >
                              <Select
                                value=""
                                onValueChange={(value) =>
                                  value && chooseQuoteProduct(line.key, value)
                                }
                              >
                                <SelectTrigger className="md:col-span-2">
                                  {line.productName || "从产品库选择"}
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((product) => (
                                    <SelectItem
                                      key={product.id}
                                      value={String(product.id)}
                                    >
                                      {product.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min="0.01"
                                step="0.01"
                                placeholder="数量"
                                value={line.quantity}
                                onChange={(event) =>
                                  updateQuoteLine(line.key, {
                                    quantity: event.target.value,
                                  })
                                }
                              />
                              <Input
                                placeholder="单位"
                                value={line.unit}
                                onChange={(event) =>
                                  updateQuoteLine(line.key, {
                                    unit: event.target.value,
                                  })
                                }
                              />
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="单价"
                                value={line.unitPrice}
                                onChange={(event) =>
                                  updateQuoteLine(line.key, {
                                    unitPrice: event.target.value,
                                  })
                                }
                              />
                              <div className="flex gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  placeholder="折扣%"
                                  value={line.discount}
                                  onChange={(event) =>
                                    updateQuoteLine(line.key, {
                                      discount: event.target.value,
                                    })
                                  }
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="shrink-0 text-destructive"
                                  disabled={quoteLines.length === 1}
                                  title={`删除第 ${index + 1} 行`}
                                  onClick={() =>
                                    setQuoteLines((current) =>
                                      current.filter(
                                        (item) => item.key !== line.key,
                                      ),
                                    )
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setQuoteLines((current) => [
                              ...current,
                              createQuoteLine(),
                            ])
                          }
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          增加产品行
                        </Button>
                        <div className="grid gap-3 md:grid-cols-3">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="运费"
                            value={quoteForm.freight}
                            onChange={(event) =>
                              setQuoteForm((current) => ({
                                ...current,
                                freight: event.target.value,
                              }))
                            }
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="税率 %"
                            value={quoteForm.taxRate}
                            onChange={(event) =>
                              setQuoteForm((current) => ({
                                ...current,
                                taxRate: event.target.value,
                              }))
                            }
                          />
                          <Input
                            placeholder="报价备注"
                            value={quoteForm.notes}
                            onChange={(event) =>
                              setQuoteForm((current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button type="submit" disabled={isSaving}>
                            创建报价单
                          </Button>
                        </div>
                      </form>
                    )}
                    <RecordList empty="暂无报价记录">
                      {data.quotes.map((quote) => (
                        <RecordRow key={quote.id}>
                          <p className="font-medium">
                            {quote.quoteNo || "未编号报价"}
                            <Badge className="ml-2" variant="outline">
                              {optionLabel(QUOTE_STATUS_OPTIONS, quote.status)}
                            </Badge>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {quote.currency || "USD"}{" "}
                            {Number(quote.total || 0).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}{" "}
                            ·{" "}
                            {quote.items
                              .map((item) => item.productName)
                              .join("、") || "未填写产品"}{" "}
                            · {formatDate(quote.updatedAt || quote.createdAt)}
                          </p>
                        </RecordRow>
                      ))}
                    </RecordList>
                  </Workspace>
                </TabsContent>

                <TabsContent value="samples">
                  <Workspace
                    title="样品"
                    description="直接登记样品申请、寄送状态和物流单号。"
                    action={
                      <Button
                        variant="outline"
                        onClick={() => goTo("/samples")}
                      >
                        完整样品管理
                        <ExternalLink className="ml-1 h-4 w-4" />
                      </Button>
                    }
                  >
                    {canManage && (
                      <form
                        className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-3"
                        onSubmit={submitSample}
                      >
                        <Select
                          value={sampleForm.opportunityId || "none"}
                          onValueChange={(value) =>
                            value &&
                            setSampleForm((current) => ({
                              ...current,
                              opportunityId: value === "none" ? "" : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            {sampleForm.opportunityId
                              ? data.opportunities.find(
                                  (item) =>
                                    String(item.id) ===
                                    sampleForm.opportunityId,
                                )?.name || "关联商机"
                              : "不关联商机"}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不关联商机</SelectItem>
                            {data.opportunities.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value=""
                          onValueChange={(value) =>
                            value && chooseSampleProduct(value)
                          }
                        >
                          <SelectTrigger>
                            {sampleForm.productName || "从产品库选择 *"}
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((product) => (
                              <SelectItem
                                key={product.id}
                                value={String(product.id)}
                              >
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={sampleForm.status}
                          onValueChange={(value) =>
                            value &&
                            setSampleForm((current) => ({
                              ...current,
                              status: value as Sample["status"],
                            }))
                          }
                        >
                          <SelectTrigger>
                            {optionLabel(
                              SAMPLE_STATUS_OPTIONS,
                              sampleForm.status,
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {SAMPLE_STATUS_OPTIONS.map((status) => (
                              <SelectItem
                                key={status.value}
                                value={status.value}
                              >
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="数量"
                          value={sampleForm.quantity}
                          onChange={(event) =>
                            setSampleForm((current) => ({
                              ...current,
                              quantity: event.target.value,
                            }))
                          }
                        />
                        <Input
                          placeholder="单位"
                          value={sampleForm.unit}
                          onChange={(event) =>
                            setSampleForm((current) => ({
                              ...current,
                              unit: event.target.value,
                            }))
                          }
                        />
                        <Input
                          placeholder="物流单号"
                          value={sampleForm.trackingNo}
                          onChange={(event) =>
                            setSampleForm((current) => ({
                              ...current,
                              trackingNo: event.target.value,
                            }))
                          }
                        />
                        <Input
                          className="md:col-span-2"
                          placeholder="样品备注"
                          value={sampleForm.notes}
                          onChange={(event) =>
                            setSampleForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={isSaving || !sampleForm.productName}
                          >
                            创建样品记录
                          </Button>
                        </div>
                      </form>
                    )}
                    <RecordList empty="暂无样品记录">
                      {data.samples.map((sample) => (
                        <RecordRow key={sample.id}>
                          <p className="font-medium">
                            {sample.productName || "未填写产品"}
                            <Badge className="ml-2" variant="outline">
                              {optionLabel(
                                SAMPLE_STATUS_OPTIONS,
                                sample.status,
                              )}
                            </Badge>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {sample.quantity} {sample.unit || "件"}
                            {sample.trackingNo
                              ? ` · 物流单号 ${sample.trackingNo}`
                              : ""}
                            {sample.sentAt
                              ? ` · 寄出 ${formatDate(sample.sentAt)}`
                              : ""}
                          </p>
                        </RecordRow>
                      ))}
                    </RecordList>
                  </Workspace>
                </TabsContent>

                <TabsContent value="emails">
                  <Workspace
                    title="邮件"
                    description="集中查看该客户的发送记录和投递结果。"
                    action={
                      <Button onClick={() => goTo("/marketing")}>
                        发送邮件
                        <Mail className="ml-1 h-4 w-4" />
                      </Button>
                    }
                  >
                    <RecordList empty="暂无邮件记录">
                      {(data.sendLogs || []).map((log) => (
                        <RecordRow key={log.id}>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {log.subject || log.templateName || "邮件"}
                            </p>
                            <Badge
                              variant={
                                log.status === "sent"
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {statusLabel(
                                EMAIL_SEND_STATUS_LABELS,
                                log.status,
                              )}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            收件人 {log.email}
                            {log.taskName ? ` · ${log.taskName}` : ""} ·{" "}
                            {formatDateTime(log.createdAt)}
                          </p>
                          {log.message && (
                            <p className="mt-1 text-xs text-destructive">
                              {log.message}
                            </p>
                          )}
                        </RecordRow>
                      ))}
                    </RecordList>
                  </Workspace>
                </TabsContent>

                <TabsContent value="attachments">
                  <Workspace
                    title="附件"
                    description="上传询价文件、产品图纸、合同和其他客户资料。单个文件不超过 20MB。"
                  >
                    {canManage && (
                      <form
                        className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-3"
                        onSubmit={submitAttachment}
                      >
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="customer-attachment">
                            选择文件 *
                          </Label>
                          <Input
                            ref={attachmentInput}
                            id="customer-attachment"
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.dwg,.dxf,.step,.stp,.iges,.igs,.zip"
                            onChange={(event) =>
                              setAttachmentForm((current) => ({
                                ...current,
                                file: event.target.files?.[0] || null,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>资料类型</Label>
                          <Select
                            value={attachmentForm.category}
                            onValueChange={(value) =>
                              value &&
                              setAttachmentForm((current) => ({
                                ...current,
                                category:
                                  value as CustomerAttachment["category"],
                              }))
                            }
                          >
                            <SelectTrigger>
                              {optionLabel(
                                ATTACHMENT_CATEGORY_OPTIONS,
                                attachmentForm.category,
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              {ATTACHMENT_CATEGORY_OPTIONS.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input
                          className="md:col-span-2"
                          placeholder="文件说明"
                          value={attachmentForm.note}
                          onChange={(event) =>
                            setAttachmentForm((current) => ({
                              ...current,
                              note: event.target.value,
                            }))
                          }
                        />
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={isSaving || !attachmentForm.file}
                          >
                            <Upload className="mr-1 h-4 w-4" />
                            上传附件
                          </Button>
                        </div>
                      </form>
                    )}
                    <RecordList empty="暂无附件">
                      {attachments.map((attachment) => (
                        <RecordRow
                          key={attachment.id}
                          actions={
                            <div className="flex shrink-0 gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                title="下载附件"
                                onClick={() =>
                                  void downloadCustomerAttachment(attachment)
                                }
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {canManage && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive"
                                  title="删除附件"
                                  disabled={isSaving}
                                  onClick={() =>
                                    confirm(
                                      "确定删除该附件吗？删除后无法恢复。",
                                    ) &&
                                    void mutate(
                                      () =>
                                        deleteCustomerAttachment(attachment.id),
                                      "附件已删除",
                                    )
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          }
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <p className="truncate font-medium">
                              {attachment.originalName}
                            </p>
                            <Badge variant="outline">
                              {optionLabel(
                                ATTACHMENT_CATEGORY_OPTIONS,
                                attachment.category,
                              )}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatBytes(attachment.size)} ·{" "}
                            {formatDateTime(attachment.createdAt)}
                          </p>
                          {attachment.note && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {attachment.note}
                            </p>
                          )}
                        </RecordRow>
                      ))}
                    </RecordList>
                  </Workspace>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OverviewWorkspace({
  data,
  attachments,
  onOpenWorkspace,
}: {
  data: Customer360;
  attachments: CustomerAttachment[];
  onOpenWorkspace: (workspace: Workspace) => void;
}) {
  const openTodos = data.todos.filter((todo) => todo.status !== "done");
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{data.customer.company}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="主营业务" value={data.customer.business} />
          <Summary label="主联系人" value={data.customer.contact} />
          <Summary label="邮箱" value={data.customer.email} />
          <Summary label="电话" value={data.customer.phone} />
          <Summary
            label="地区"
            value={[data.customer.region, data.customer.country]
              .filter(Boolean)
              .join(" · ")}
          />
          <Summary
            label="客户分层"
            value={optionLabel(CUSTOMER_TIER_OPTIONS, data.customer.tier)}
          />
          <Summary
            label="客户跟进阶段"
            value={optionLabel(
              CUSTOMER_JOURNEY_STAGES,
              data.customer.journeyStage,
              "尚未跟进",
            )}
          />
          <Summary
            label="最近活动"
            value={
              data.customer.lastActivityAt
                ? formatDateTime(data.customer.lastActivityAt)
                : "暂无活动"
            }
          />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewLink
          title="联系人"
          value={data.contacts.length}
          detail={
            data.contacts.find((item) => item.isPrimary)?.name ||
            "未设置主联系人"
          }
          onClick={() => onOpenWorkspace("contacts")}
        />
        <OverviewLink
          title="待办任务"
          value={openTodos.length}
          detail={data.customer.nextTodoTitle || "暂无下一步任务"}
          onClick={() => onOpenWorkspace("todos")}
        />
        <OverviewLink
          title="活跃商机"
          value={
            data.customer.openOpportunityCount ??
            data.opportunities.filter(
              (item) => !["won", "lost"].includes(item.stage),
            ).length
          }
          detail={`USD ${Number(data.customer.openOpportunityValue || 0).toLocaleString("en-US")}`}
          onClick={() => onOpenWorkspace("opportunities")}
        />
        <OverviewLink
          title="客户资料"
          value={attachments.length}
          detail="询价、图纸与合同附件"
          onClick={() => onOpenWorkspace("attachments")}
        />
      </div>
    </div>
  );
}

function OverviewLink({
  title,
  value,
  detail,
  onClick,
}: {
  title: string;
  value: number;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </button>
  );
}

function Workspace({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value || "-"}</p>
    </div>
  );
}

function RecordList({
  empty,
  children,
}: {
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className="space-y-2">
      {hasChildren ? (
        children
      ) : (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </div>
  );
}

function RecordRow({
  children,
  actions,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </div>
  );
}

function formatDate(value?: string | Date) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "-";
}

function formatDateTime(value?: string | Date) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
