import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, Play, StopCircle, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getEmailTasks,
  createEmailTask,
  runEmailTask,
  cancelEmailTask,
  deleteEmailTask,
  deleteSendLog,
  getSendLogs,
  getEmailRecipients,
  getEmailRecipientIds,
  type EmailTemplate,
  type EmailTask,
  type EmailRecipient,
  type SendLog,
} from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { canManageCrmData } from "@/auth/permissions";
import { CUSTOMER_JOURNEY_STAGES } from "@/contracts/crm-stages";
import {
  buildCreateEmailTaskInput,
  readableEmailTaskMessage,
  resolveEmailTaskTemplateName,
} from "@/contracts/email-task";
import {
  CUSTOMER_TIER_OPTIONS,
  EMAIL_SEND_STATUS_LABELS,
  EMAIL_TASK_STATUS_LABELS,
  statusLabel,
} from "@/contracts/crm-terminology";

export function MarketingPage() {
  const { role, userId } = useAuth();
  const canManage = canManageCrmData(role);
  const [activeTab, setActiveTab] = useState("templates");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="templates" className="flex-1">邮件模板</TabsTrigger>
        <TabsTrigger value="tasks" className="flex-1">发信任务</TabsTrigger>
        <TabsTrigger value="logs" className="flex-1">发信记录</TabsTrigger>
      </TabsList>

      <TabsContent value="templates">
        <TemplatesTab canManage={canManage} role={role} userId={userId || ""} />
      </TabsContent>

      <TabsContent value="tasks">
        <EmailTasksTab canManage={canManage} />
      </TabsContent>

      <TabsContent value="logs">
        <SendLogsTab canManage={canManage} />
      </TabsContent>
    </Tabs>
  );
}

function TemplatesTab({ canManage, role, userId }: { canManage: boolean; role: string; userId: string }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateImages, setTemplateImages] = useState<Map<string, { id: string; name: string; dataUrl: string }>>(new Map());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    body: `Hi {{contact}},\n\nWe are contacting you about {{product}}. Please let us know if your company {{company}} has related purchasing plans.\n\nBest regards`,
  });

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getTemplates();
      setTemplates(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const images = [...templateImages.values()].filter((img) =>
      form.body.includes(`template-image:${img.id}`)
    );
    if (editingId) {
      await updateTemplate(editingId, { ...form, images });
    } else {
      await createTemplate({ ...form, images });
    }
    setForm({
      name: "",
      subject: "",
      body: `Hi {{contact}},\n\nWe are contacting you about {{product}}. Please let us know if your company {{company}} has related purchasing plans.\n\nBest regards`,
    });
    setEditingId(null);
    setTemplateImages(new Map());
    fetchTemplates();
  };

  const handleEdit = (template: EmailTemplate) => {
    setForm({
      name: template.name,
      subject: template.subject,
      body: template.body,
    });
    const images = new Map<string, { id: string; name: string; dataUrl: string }>();
    if (template.images) {
      for (const img of template.images) {
        const imgAny = img as { id: string; name?: string; dataUrl: string };
        images.set(img.id, { id: img.id, name: imgAny.name || "", dataUrl: img.dataUrl });
      }
    }
    setTemplateImages(images);
    setEditingId(template.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该模板吗？")) return;
    await deleteTemplate(id);
    fetchTemplates();
  };

  const compressTemplateImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.type === "image/gif" && file.size <= 2 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / img.naturalWidth, 900 / img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        let output = canvas.toDataURL(mime, 0.84);
        if (output.length > 2_800_000) {
          output = canvas.toDataURL("image/jpeg", 0.72);
        }
        resolve(output);
      };
      img.onerror = () => reject(new Error("无法解析图片"));
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result as string; };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleInsertImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp)$/i.test(file.type)) {
      toast.error("仅支持 PNG、JPEG、GIF、WebP 格式");
      return;
    }
    try {
      const dataUrl = await compressTemplateImage(file);
      const imageId = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      setTemplateImages((prev) => {
        const next = new Map(prev);
        next.set(imageId, { id: imageId, name: file.name, dataUrl });
        return next;
      });
      const imageHtml = `\n<img src="template-image:${imageId}" alt="${file.name}" style="display:block;max-width:100%;height:auto;">\n`;
      const ta = bodyTextareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newBody = form.body.slice(0, start) + imageHtml + form.body.slice(end);
        setForm({ ...form, body: newBody });
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + imageHtml.length;
          ta.focus();
        });
      } else {
        setForm({ ...form, body: form.body + imageHtml });
      }
    } catch {
      toast.error("图片处理失败");
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {canManage && <Card>
        <CardHeader>
          <CardTitle>{editingId ? "编辑模板" : "新增模板"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>模板名称 *</Label>
                <Input
                  placeholder="首次开发信"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>邮件标题 *</Label>
                <Input
                  placeholder="{{company}} 产品合作咨询"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>邮件正文 *</Label>
              <Textarea
                ref={bodyTextareaRef}
                rows={7}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                    <ImageIcon className="h-4 w-4 mr-1" />
                    插入图片
                  </Button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    hidden
                    onChange={handleInsertImage}
                  />
                  {templateImages.size > 0 && (
                    <span className="text-xs text-muted-foreground">
                      已上传 {templateImages.size} 张图片
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  可使用变量：{"{{company}}"}, {"{{contact}}"}, {"{{product}}"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">
                {editingId ? "更新模板" : "保存模板"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setForm({
                      name: "",
                      subject: "",
                      body: `Hi {{contact}},\n\nWe are contacting you about {{product}}. Please let us know if your company {{company}} has related purchasing plans.\n\nBest regards`,
                    });
                  }}
                >
                  取消编辑
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            模板列表
            <Badge variant="secondary">{templates.length}</Badge>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>更新时间</TableHead>
              {canManage && <TableHead className="w-24">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  {canManage && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                </TableRow>
              ))
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="text-center py-8 text-muted-foreground">
                  暂无模板
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">
                    {template.name}
                    {!template.ownerId && <Badge variant="outline" className="ml-2">系统共享</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{template.subject}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : "-"}
                  </TableCell>
                  {canManage && <TableCell>
                    {(role === "admin" || template.ownerId === userId) && <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>}
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

function EmailTasksTab({ canManage }: { canManage: boolean }) {
  const [tasks, setTasks] = useState<EmailTask[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  const [form, setForm] = useState({
    name: "",
    taskMode: "once" as "once" | "scheduled",
    templateId: "",
    batchSize: "0",
    intervalMinutes: "1440",
    totalRuns: "1",
    startAt: "",
  });
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());
  const [recipientFilters, setRecipientFilters] = useState({
    q: "",
    region: "",
    tier: "",
    journeyStage: "",
    business: "",
    emailState: "sendable",
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tasksData, templatesData, recipientsData] = await Promise.all([
        getEmailTasks(),
        getTemplates(),
        getEmailRecipients({ limit: "500", emailState: "all" }),
      ]);
      setTasks(tasksData);
      setTemplates(templatesData);
      setRecipients(recipientsData.recipients);
      setRecipientTotal(recipientsData.total);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("请输入任务名称");
      return;
    }
    if (!form.templateId) {
      toast.error("请选择一个邮件模板");
      return;
    }
    if (selectedRecipientIds.size === 0) {
      toast.error("请先选择收件联系人");
      return;
    }
    if (form.taskMode === "scheduled") {
      const batchSize = Number.parseInt(form.batchSize, 10);
      const intervalMinutes = Number.parseInt(form.intervalMinutes, 10);
      const totalRuns = Number.parseInt(form.totalRuns, 10);
      if (!form.startAt) return void toast.error("请指定定时任务的开始时间");
      if (!Number.isInteger(batchSize) || batchSize < 1) return void toast.error("每轮邮件数量必须大于 0");
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) return void toast.error("轮次间隔必须大于 0 分钟");
      if (!Number.isInteger(totalRuns) || totalRuns < 1) return void toast.error("总轮数必须大于 0");
      if (selectedRecipientIds.size > batchSize * totalRuns) {
        return void toast.error(`当前计划最多发送 ${batchSize * totalRuns} 封，少于已选的 ${selectedRecipientIds.size} 个收件人`);
      }
    }

    setIsCreating(true);
    try {
      await createEmailTask(buildCreateEmailTaskInput(form, [...selectedRecipientIds]));
      toast.success(form.taskMode === "scheduled" ? "定时分批任务已创建并启用" : "发信任务已创建");
      setForm({
        name: "",
        taskMode: "once",
        templateId: "",
        batchSize: "0",
        intervalMinutes: "1440",
        totalRuns: "1",
        startAt: "",
      });
      setSelectedRecipientIds(new Set());
      await fetchData();
    } catch {
      // API 客户端已经展示具体错误，保留表单和已选客户以便重试。
    } finally {
      setIsCreating(false);
    }
  };

  const handleRun = async (id: string) => {
    await runEmailTask(id);
    fetchData();
  };

  const handleCancel = async (id: string) => {
    await cancelEmailTask(id);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该邮件任务吗？")) return;
    await deleteEmailTask(id);
    fetchData();
  };

  const toggleRecipient = (id: string, checked: boolean) => {
    const newSet = new Set(selectedRecipientIds);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedRecipientIds(newSet);
  };

  const recipientRegions = useMemo(() => (
    [...new Set(recipients
      .map((recipient) => recipient.region)
      .filter((region): region is string => Boolean(region)))]
      .sort((a, b) => a.localeCompare(b))
  ), [recipients]);

  const filteredRecipients = useMemo(() => {
    const q = recipientFilters.q.trim().toLowerCase();
    const business = recipientFilters.business.trim().toLowerCase();
    return recipients.filter((recipient) => {
      const searchText = [
        recipient.customerName,
        recipient.name,
        recipient.email,
        recipient.business,
        recipient.region,
      ].join(" ").toLowerCase();
      if (q && !searchText.includes(q)) return false;
      if (recipientFilters.region && recipient.region !== recipientFilters.region) return false;
      if (recipientFilters.tier && recipient.tier !== recipientFilters.tier) return false;
      if (recipientFilters.journeyStage && recipient.journeyStage !== recipientFilters.journeyStage) return false;
      if (business && !String(recipient.business || "").toLowerCase().includes(business)) return false;
      const sendable = Boolean(recipient.email) && recipient.emailStatus !== "invalid" && !recipient.suppressed;
      if (recipientFilters.emailState === "sendable" && !sendable) return false;
      if (recipientFilters.emailState === "invalid" && recipient.emailStatus !== "invalid") return false;
      if (recipientFilters.emailState === "missing" && recipient.email) return false;
      return true;
    });
  }, [recipients, recipientFilters]);

  const recipientQuery = () => Object.fromEntries(
    Object.entries(recipientFilters).filter(([, value]) => Boolean(value)),
  );

  const selectAllFilteredRecipients = async () => {
    setIsSelectingAll(true);
    try {
      const { ids } = await getEmailRecipientIds(recipientQuery());
      setSelectedRecipientIds(new Set(ids));
      toast.success(`已一键选择 ${ids.length} 个可发送联系人`);
    } finally {
      setIsSelectingAll(false);
    }
  };

  const scheduledCapacity = Math.max(0, Number.parseInt(form.batchSize, 10) || 0)
    * Math.max(0, Number.parseInt(form.totalRuns, 10) || 0);

  return (
    <div className="space-y-6">
      {canManage && <Card>
        <CardHeader>
          <CardTitle>创建发信任务</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>任务名称 *</Label>
                <Input
                  placeholder="德国太阳能客户开发"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>执行方式 *</Label>
                <Select
                  value={form.taskMode}
                  onValueChange={(v) => setForm({
                    ...form,
                    taskMode: v as "once" | "scheduled",
                    batchSize: v === "scheduled" && form.batchSize === "0" ? "20" : form.batchSize,
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">单批次任务</SelectItem>
                    <SelectItem value="scheduled">定时任务</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>选择模板 *</Label>
                <Select
                  value={form.templateId}
                  onValueChange={(v) => { if (v) setForm({ ...form, templateId: v }) }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem
                        key={template.id}
                        value={template.templateId || String(template.id)}
                      >
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.taskMode === "scheduled" && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div>
                  <div className="font-medium">定时分批计划</div>
                  <p className="text-sm text-muted-foreground">创建后自动启用，系统会按指定时间和轮次逐批发送。</p>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>开始时间 *</Label>
                    <Input
                      type="datetime-local"
                      value={form.startAt}
                      onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>每轮邮件数量 *</Label>
                    <Input
                      type="number"
                      min="1"
                      max="200"
                      value={form.batchSize}
                      onChange={(e) => setForm({ ...form, batchSize: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>轮次间隔（分钟）*</Label>
                    <Input
                      type="number"
                      min="1"
                      max="43200"
                      value={form.intervalMinutes}
                      onChange={(e) => setForm({ ...form, intervalMinutes: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>总轮数 *</Label>
                    <Input
                      type="number"
                      min="1"
                      max="1000"
                      value={form.totalRuns}
                      onChange={(e) => setForm({ ...form, totalRuns: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  计划最多处理 <span className="font-medium text-foreground">{scheduledCapacity}</span> 封；
                  已选 <span className="font-medium text-foreground">{selectedRecipientIds.size}</span> 个收件人。
                </p>
              </div>
            )}

            {/* Recipient selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label>收件联系人（当前显示 {filteredRecipients.length} / 共 {recipientTotal}，已选 {selectedRecipientIds.size} 个）</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectAllFilteredRecipients} disabled={isSelectingAll || recipientTotal === 0}>
                    {isSelectingAll ? "正在选择..." : "一键选择全部可用联系人"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedRecipientIds(new Set())} disabled={selectedRecipientIds.size === 0}>
                    清空已选
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-3 lg:grid-cols-6">
                <Input
                  placeholder="搜索公司、联系人、邮箱、标签"
                  value={recipientFilters.q}
                  onChange={(e) => setRecipientFilters({ ...recipientFilters, q: e.target.value })}
                  className="lg:col-span-2"
                />
                <select
                  aria-label="按地区筛选收件客户"
                  className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  value={recipientFilters.region}
                  onChange={(e) => setRecipientFilters({ ...recipientFilters, region: e.target.value })}
                >
                  <option value="">全部地区</option>
                  {recipientRegions.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
                <select
                  aria-label="按客户分层筛选收件客户"
                  className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  value={recipientFilters.tier}
                  onChange={(e) => setRecipientFilters({ ...recipientFilters, tier: e.target.value })}
                >
                  <option value="">全部客户分层</option>
                  {CUSTOMER_TIER_OPTIONS.map((tier) => <option key={tier.value} value={tier.value}>{tier.label}</option>)}
                </select>
                <select
                  aria-label="按客户跟进阶段筛选收件客户"
                  className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  value={recipientFilters.journeyStage}
                  onChange={(e) => setRecipientFilters({ ...recipientFilters, journeyStage: e.target.value })}
                >
                  <option value="">全部跟进阶段</option>
                  {CUSTOMER_JOURNEY_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                </select>
                <select
                  aria-label="按邮箱状态筛选收件客户"
                  className="flex h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  value={recipientFilters.emailState}
                  onChange={(e) => setRecipientFilters({ ...recipientFilters, emailState: e.target.value })}
                >
                  <option value="sendable">仅可发送邮箱</option>
                  <option value="all">全部邮箱状态</option>
                  <option value="invalid">邮箱异常</option>
                  <option value="missing">缺少邮箱</option>
                </select>
                <Input
                  placeholder="主营业务或产品"
                  value={recipientFilters.business}
                  onChange={(e) => setRecipientFilters({ ...recipientFilters, business: e.target.value })}
                  className="lg:col-span-2"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRecipientFilters({ q: "", region: "", tier: "", journeyStage: "", business: "", emailState: "sendable" })}
                >
                  清除筛选
                </Button>
              </div>
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {filteredRecipients.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground text-sm">没有符合筛选条件的联系人</p>
                ) : (
                  filteredRecipients.map((recipient) => {
                    const sendable = Boolean(recipient.email) && recipient.emailStatus !== "invalid" && !recipient.suppressed;
                    return (
                    <div
                      key={recipient.recipientKey}
                      className="flex items-center gap-3 p-2 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRecipientIds.has(recipient.recipientKey)}
                        onChange={(e) => toggleRecipient(recipient.recipientKey, e.target.checked)}
                        disabled={!sendable}
                        className="h-4 w-4"
                      />
                      <div className="flex-1 text-sm">
                        <span className="font-medium">{recipient.name || recipient.customerName}</span>
                        <span className="text-muted-foreground ml-2">{recipient.email}</span>
                        <span className="text-muted-foreground ml-2">{recipient.customerName}</span>
                        <Badge variant="outline" className="ml-2">{recipient.type === "contact" ? "联系人" : "客户主邮箱"}</Badge>
                        {recipient.region && <Badge variant="outline" className="ml-1">{recipient.region}</Badge>}
                        {!sendable && <Badge variant="destructive" className="ml-1">{recipient.suppressionReason || (recipient.email ? "邮箱异常" : "缺少邮箱")}</Badge>}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>

            <Button type="submit" disabled={isCreating}>
              <Plus className="mr-2 h-4 w-4" />
              {isCreating ? "正在创建..." : form.taskMode === "scheduled" ? "创建并启用定时任务" : "创建发信任务"}
            </Button>
          </form>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            发信任务
            <Badge variant="secondary">{tasks.length}</Badge>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>任务名称</TableHead>
              <TableHead>模板</TableHead>
              <TableHead>模式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>收件 / 批次</TableHead>
              <TableHead>执行信息</TableHead>
              {canManage && <TableHead className="w-28">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(canManage ? 7 : 6)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 7 : 6} className="text-center py-8 text-muted-foreground">
                  暂无发信任务
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const templateName = resolveEmailTaskTemplateName(
                  task.templateId,
                  task.templateName,
                  templates,
                );
                const modeText = task.taskMode === "scheduled" ? "定时" : "单批";
                const scheduledInfo = task.taskMode === "once"
                  ? `指定收件人 ${task.customerIds?.length || 0} 人`
                  : `成功 ${Number(task.successfulSendCount || 0)} 封 | 轮次 ${Number(task.runsCompleted || 0)}/${Number(task.totalRuns || 1)} | 间隔 ${Number(task.intervalMinutes || 0)} 分钟`;
                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="font-medium">{task.name}</div>
                      {(task as any).lastMessage && (
                        <div className="text-xs text-muted-foreground max-w-[320px]">
                          {readableEmailTaskMessage((task as any).lastMessage)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{templateName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{modeText}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        task.status === "active" ? "default" :
                        task.status === "completed" ? "secondary" :
                        task.status === "failed" ? "destructive" : "outline"
                      }>
                        {statusLabel(EMAIL_TASK_STATUS_LABELS, task.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {task.customerIds?.length || 0}
                      {task.batchSize ? ` / 每轮 ${task.batchSize} 封` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {scheduledInfo}
                      {task.startAt ? ` | 开始 ${new Date(task.startAt).toLocaleString()}` : ""}
                      {task.nextRunAt ? ` | 下次 ${new Date(task.nextRunAt).toLocaleString()}` : ""}
                      {task.lastRunAt ? ` | 上次 ${new Date(task.lastRunAt).toLocaleString()}` : ""}
                    </TableCell>
                    {canManage && <TableCell>
                      <div className="flex gap-1">
                        {(task.status === "pending" ||
                          task.status === "failed" ||
                          (task.status === "completed" &&
                            Number(task.failedSendCount || task.skippedSendCount || 0) > 0)) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRun(task.id)}
                            title={task.status === "pending" ? "运行" : "重新运行未成功的收件人"}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {task.status === "active" && (
                          <Button variant="ghost" size="sm" onClick={() => handleCancel(task.id)} title="取消">
                            <StopCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleDelete(task.id)}
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function SendLogsTab({ canManage }: { canManage: boolean }) {
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      setLogs(await getSendLogs());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleDelete = async (id: string) => {
    await deleteSendLog(id);
    fetchLogs();
  };

  return (
    <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            发信记录
            <Badge variant="secondary">{logs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>消息</TableHead>
              {canManage && <TableHead className="w-16">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(canManage ? 5 : 4)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="text-center py-8 text-muted-foreground">
                  暂无发信记录
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{log.email}</TableCell>
                  <TableCell>
                    <Badge variant={
                      log.status === "sent" ? "default" :
                      log.status === "bounced" ? "destructive" : "outline"
                    }>
                      {statusLabel(EMAIL_SEND_STATUS_LABELS, log.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {log.templateName || log.message || "-"}
                  </TableCell>
                  {canManage && <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(log.id)}
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
  );
}
