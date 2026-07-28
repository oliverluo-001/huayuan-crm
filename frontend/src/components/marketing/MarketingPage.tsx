import { useState, useEffect, useCallback, useRef } from "react";
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
import { Plus, Edit, Trash2, Play, StopCircle, Mail, ImageIcon } from "lucide-react";
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
  getCustomers,
  getState,
  type EmailTemplate,
  type EmailTask,
  type Customer,
  type SendLog,
} from "@/api/client";

export function MarketingPage() {
  const [activeTab, setActiveTab] = useState("templates");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="templates" className="flex-1">邮件模板</TabsTrigger>
        <TabsTrigger value="tasks" className="flex-1">定时邮件任务</TabsTrigger>
        <TabsTrigger value="logs" className="flex-1">发送记录</TabsTrigger>
      </TabsList>

      <TabsContent value="templates">
        <TemplatesTab />
      </TabsContent>

      <TabsContent value="tasks">
        <EmailTasksTab />
      </TabsContent>

      <TabsContent value="logs">
        <SendLogsTab />
      </TabsContent>
    </Tabs>
  );
}

function TemplatesTab() {
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
    } catch (err) {
      toast.error("图片处理失败");
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <Card>
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
      </Card>

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
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                </TableRow>
              ))
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  暂无模板
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">{template.name}</TableCell>
                  <TableCell className="text-muted-foreground">{template.subject}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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

function EmailTasksTab() {
  const [tasks, setTasks] = useState<EmailTask[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    taskMode: "once" as "once" | "scheduled",
    templateId: "",
    batchSize: "0",
    region: "",
    business: "",
    intervalMinutes: "1440",
    totalRuns: "1",
    startAt: "",
    successfulSendCount: "0",
  });
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tasksData, templatesData, customersData] = await Promise.all([
        getEmailTasks(),
        getTemplates(),
        getCustomers(0, 200, {}),
      ]);
      setTasks(tasksData);
      setTemplates(templatesData);
      setCustomers(customersData.customers);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.templateId) {
      alert("请选择一个邮件模板");
      return;
    }
    if (selectedCustomerIds.size === 0) {
      alert("请先选择收件客户");
      return;
    }

    const isScheduled = form.taskMode === "scheduled";
    await createEmailTask({
      name: form.name,
      taskMode: form.taskMode,
      customerIds: [...selectedCustomerIds],
      templateId: form.templateId,
      region: isScheduled ? form.region : "",
      business: isScheduled ? form.business : "",
      successfulSendCount: isScheduled ? parseInt(form.successfulSendCount) || 0 : 0,
      intervalMinutes: isScheduled ? parseInt(form.intervalMinutes) : undefined,
      totalRuns: isScheduled ? parseInt(form.totalRuns) : undefined,
      startAt: isScheduled ? form.startAt : undefined,
      batchSize: parseInt(form.batchSize),
    });

    setForm({
      name: "",
      taskMode: "once",
      templateId: "",
      batchSize: "0",
      region: "",
      business: "",
      intervalMinutes: "1440",
      totalRuns: "1",
      startAt: "",
      successfulSendCount: "0",
    });
    setSelectedCustomerIds(new Set());
    fetchData();
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

  const toggleCustomer = (id: string, checked: boolean) => {
    const newSet = new Set(selectedCustomerIds);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedCustomerIds(newSet);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>创建邮件任务</CardTitle>
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
                  onValueChange={(v) => setForm({ ...form, taskMode: v as "once" | "scheduled" })}
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
                <Label>每批封数</Label>
                <Input
                  type="number"
                  min="0"
                  max="200"
                  value={form.batchSize}
                  onChange={(e) => setForm({ ...form, batchSize: e.target.value })}
                />
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
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Recipient selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>收件客户（已选择 {selectedCustomerIds.size} 个）</Label>
              </div>
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {customers.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground text-sm">暂无客户</p>
                ) : (
                  customers.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex items-center gap-3 p-2 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.has(customer.id)}
                        onChange={(e) => toggleCustomer(customer.id, e.target.checked)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1 text-sm">
                        <span className="font-medium">{customer.company}</span>
                        <span className="text-muted-foreground ml-2">{customer.email}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              新增邮件任务
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            邮件任务列表
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
              <TableHead className="w-28">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  暂无邮件任务
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const templateName = templates.find((t) => t.id === task.templateId)?.name || "模板已删除";
                const modeText = task.taskMode === "scheduled" ? "定时" : "单批";
                const scheduledInfo = task.taskMode === "once"
                  ? `指定客户 ${task.customerIds?.length || 0} 人`
                  : `成功发送 ${Number((task as any).successfulSendCount || (task as any).maxSuccessfulSends || 0)} 次 / ${(task as any).region || "全部区域"} | 轮次 ${Number((task as any).completedRuns || 0)}/${Number((task as any).totalRuns || 1)}`;
                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="font-medium">{task.name}</div>
                      {(task as any).lastMessage && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{(task as any).lastMessage}</div>
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
                        {task.status === "active" ? "运行中" :
                         task.status === "completed" ? "已完成" :
                         task.status === "pending" ? "待执行" :
                         task.status === "failed" ? "失败" : task.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {task.customerIds?.length || 0}
                      {(task as any).batchSize ? ` / 每批 ${(task as any).batchSize} 封` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {scheduledInfo}
                      {(task as any).startAt ? ` | 开始 ${new Date((task as any).startAt).toLocaleDateString()}` : ""}
                      {task.lastRunAt ? ` | 上次 ${new Date(task.lastRunAt).toLocaleDateString()}` : ""}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {task.status === "pending" && (
                          <Button variant="ghost" size="sm" onClick={() => handleRun(task.id)} title="运行">
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
                    </TableCell>
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

function SendLogsTab() {
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const state = await getState();
      setLogs(state.sendLogs as any);
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
            发送记录
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
              <TableHead className="w-16">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(5)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  暂无发送记录
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
                      {log.status === "sent" ? "已发送" :
                       log.status === "bounced" ? "退信" : "失败"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {log.templateName || log.message || "-"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(log.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
  );
}