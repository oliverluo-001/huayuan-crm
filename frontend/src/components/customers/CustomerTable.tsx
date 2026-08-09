import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  Tag,
  X,
  Upload,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  bulkDeleteCustomers,
  bulkUpdateCustomerTags,
  bulkUpdateCustomerTier,
  createCustomerTag,
  deleteCustomerTag,
  getCustomerTags,
  importCustomers,
  previewImport,
  getCustomerViews,
  createCustomerView,
  deleteCustomerView,
  type Customer,
  type CustomerView,
} from "@/api/client";
import { Customer360Dialog } from "@/components/customers/Customer360Dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { canManageCrmData } from "@/auth/permissions";
import { CUSTOMER_JOURNEY_STAGES as JOURNEY_STAGES } from "@/contracts/crm-stages";
import { ACTIVITY_TYPE_LABELS, CUSTOMER_TIER_OPTIONS as TIERS, statusLabel } from "@/contracts/crm-terminology";

const CUSTOMER_PAGE_SIZE = 50;
const COMMON_TIMEZONES = [
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Ho_Chi_Minh",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];
const emptyCustomerFilters = () => ({
  q: "",
  tag: "",
  tier: "",
  journeyStage: "",
  region: "",
  emailStatus: "",
  health: "",
  ownerId: "",
});

interface CustomerTableProps {
  onPageChange?: (page: string) => void;
}

export function CustomerTable(_props: CustomerTableProps) {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<string[]>([]);

  // Filters
  const [filters, setFilters] = useState(emptyCustomerFilters);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  // Expanded rows for inline detail
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Saved views
  const [savedViews, setSavedViews] = useState<CustomerView[]>([]);

  // New tag input
  const [newTagName, setNewTagName] = useState("");

  // View preset
  const [customerPreset, setCustomerPreset] = useState("all");

  // Bulk tag/tier
  const [bulkTag, setBulkTag] = useState("");
  const [bulkTier, setBulkTier] = useState("");

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const preview = await previewImport(file);
      const duplicateCount = preview.duplicateCount + preview.duplicateUploadCount;
      if (duplicateCount > 0) {
        const confirmed = window.confirm(
          `检测到 ${duplicateCount} 条重复邮箱。继续后将合并资料：新文件中的非空内容优先，空白字段和原有邮件记录会保留。是否继续？`,
        );
        if (!confirmed) return;
      }
      const result = await importCustomers(file);
      toast.success(`导入完成：新增 ${result.created} 条，合并 ${result.updated} 条，跳过 ${result.skipped} 条。`);
      const resetFilters = emptyCustomerFilters();
      setCustomerPreset("all");
      setPage(1);
      setFilters(resetFilters);
      setSelectedIds(new Set());
      await fetchCustomers(1, resetFilters);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fetchCustomers = useCallback(async (targetPage = page, targetFilters = filters) => {
    setIsLoading(true);
    try {
      const offset = (targetPage - 1) * CUSTOMER_PAGE_SIZE;
      const result = await getCustomers(offset, CUSTOMER_PAGE_SIZE, targetFilters);
      setCustomers(result.customers);
      setTotal(result.total);

      const [availableTags, views] = await Promise.allSettled([
        getCustomerTags(),
        getCustomerViews(),
      ]);
      if (availableTags.status === "fulfilled") setTags(availableTags.value);
      if (views.status === "fulfilled") setSavedViews(views.value);
    } finally {
      setIsLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(customers.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedIds(newSet);
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    await createCustomerTag(newTagName.trim());
    setNewTagName("");
    fetchCustomers();
  };

  const handleDeleteTag = async (name: string) => {
    if (!confirm(`删除标签"${name}"后，该标签会从所有客户中移除。是否继续？`)) return;
    await deleteCustomerTag(name);
    fetchCustomers();
  };

  const handleBulkTag = async (action: "add" | "remove") => {
    if (!bulkTag || !selectedIds.size) return;
    const verb = action === "remove" ? "移除" : "添加";
    if (!confirm(`确认对选中的 ${selectedIds.size} 个客户${verb}标签"${bulkTag}"？`)) return;
    await bulkUpdateCustomerTags([...selectedIds], bulkTag, action);
    toast.success(`标签已${verb}`);
    fetchCustomers();
  };

  const handleBulkTier = async () => {
    if (!bulkTier || !selectedIds.size) return;
    if (!confirm(`确认将选中的 ${selectedIds.size} 个客户调整为 ${TIERS.find((t) => t.value === bulkTier)?.label}？`)) return;
    await bulkUpdateCustomerTier([...selectedIds], bulkTier);
    toast.success("客户分层已更新");
    fetchCustomers();
  };

  const handleSaveView = async () => {
    const name = prompt("请输入筛选器名称");
    if (!name?.trim()) return;
    await createCustomerView(name.trim(), filters);
    toast.success("筛选器已保存");
    fetchCustomers();
  };

  const handleApplyView = (viewId: string) => {
    const view = savedViews.find((v) => v.id === viewId);
    if (!view) return;
    setFilters({ ...emptyCustomerFilters(), ...view.filters as any });
    setPage(1);
  };

  const handleDeleteView = async () => {
    const viewSelect = document.getElementById("customerSavedView") as HTMLSelectElement;
    const viewId = viewSelect?.value;
    if (!viewId) return;
    const view = savedViews.find((v) => v.id === viewId);
    if (!view || !confirm(`删除筛选器"${view.name}"？`)) return;
    await deleteCustomerView(viewId);
    toast.success("筛选器已删除");
    fetchCustomers();
  };

  const customerHealthBadge = (customer: Customer) => {
    if (customer.emailStatus === "invalid") return <Badge variant="destructive">邮箱异常</Badge>;
    const health = customer.health || "good";
    if (health === "critical") return <Badge variant="destructive">待办逾期</Badge>;
    if (health === "warning") return <Badge variant="secondary">需跟进</Badge>;
    return <Badge variant="outline">正常</Badge>;
  };

  const customerTagSummary = (customer: Customer) => {
    const tags = customer.tags || [];
    if (!tags.length) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
            {tag}
          </span>
        ))}
      </div>
    );
  };

  const customerSummary = (customer: Customer) => (
    <div className="grid gap-4 md:grid-cols-3 text-sm">
      <div>
        <p className="text-muted-foreground">网站</p>
        <p>{customer.website || "-"}</p>
      </div>
      <div>
        <p className="text-muted-foreground">电话</p>
        <p>{customer.phone || "-"}</p>
      </div>
      <div>
        <p className="text-muted-foreground">地区</p>
        <p>{customer.region || "-"}</p>
      </div>
      <div>
        <p className="text-muted-foreground">联系人</p>
        <p>{customer.contact || "-"}</p>
      </div>
      <div>
        <p className="text-muted-foreground">客户分层</p>
        <p>{TIERS.find((t) => t.value === customer.tier)?.label || customer.tier}</p>
      </div>
      <div>
        <p className="text-muted-foreground">主营业务</p>
        <p className="truncate">{customer.business || "-"}</p>
      </div>
    </div>
  );

  const handleBulkDelete = async () => {
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个客户吗？`)) return;
    await bulkDeleteCustomers([...selectedIds]);
    setSelectedIds(new Set());
    fetchCustomers();
  };

  const totalPages = Math.ceil(total / CUSTOMER_PAGE_SIZE);

  const handlePresetChange = (preset: string) => {
    setCustomerPreset(preset);
    const baseFilters = emptyCustomerFilters();
    switch (preset) {
      case "mine":
        setFilters({ ...baseFilters, ownerId: "me" });
        break;
      case "followup":
        setFilters({ ...baseFilters, health: "warning" });
        break;
      case "email_invalid":
        setFilters({ ...baseFilters, emailStatus: "invalid" });
        break;
      default:
        setFilters({ ...baseFilters });
    }
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* View presets */}
      <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 w-fit" role="tablist" aria-label="客户视图">
        {[
          { id: "all", label: "全部客户" },
          { id: "mine", label: "我的客户" },
          { id: "followup", label: "待跟进" },
          { id: "email_invalid", label: "邮箱异常" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={customerPreset === tab.id}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              customerPreset === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handlePresetChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
            }}
          >
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="space-y-2 min-w-[250px]">
                <Label>搜索客户</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="公司、邮箱、联系人、主营业务"
                    value={filters.q}
                    onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>标签</Label>
                <Select value={filters.tag} onValueChange={(v) => setFilters({ ...filters, tag: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="全部标签" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="(all)">全部标签</SelectItem>
                    <SelectItem value="">未标签</SelectItem>
                    {tags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>客户分层</Label>
                <Select value={filters.tier} onValueChange={(v) => setFilters({ ...filters, tier: v ?? "" })}>
                  <SelectTrigger>
                    {filters.tier ? TIERS.find((tier) => tier.value === filters.tier)?.label : <SelectValue placeholder="全部分层" />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部分层</SelectItem>
                    {TIERS.map((tier) => (
                      <SelectItem key={tier.value} value={tier.value}>
                        {tier.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>客户跟进阶段</Label>
                <Select value={filters.journeyStage} onValueChange={(v) => setFilters({ ...filters, journeyStage: v ?? "" })}>
                  <SelectTrigger>
                    {filters.journeyStage ? JOURNEY_STAGES.find((stage) => stage.value === filters.journeyStage)?.label : <SelectValue placeholder="全部阶段" />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部阶段</SelectItem>
                    {JOURNEY_STAGES.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>地区</Label>
                <Input
                  placeholder="如：United States"
                  value={filters.region}
                  onChange={(e) => setFilters({ ...filters, region: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>邮箱状态</Label>
                <Select value={filters.emailStatus} onValueChange={(v) => setFilters({ ...filters, emailStatus: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="全部邮箱" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部邮箱</SelectItem>
                    <SelectItem value="valid">邮箱有效</SelectItem>
                    <SelectItem value="invalid">邮箱异常（退信）</SelectItem>
                    <SelectItem value="unknown">待验证</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>健康状态</Label>
                <Select value={filters.health} onValueChange={(v) => setFilters({ ...filters, health: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部状态</SelectItem>
                    <SelectItem value="critical">待办逾期</SelectItem>
                    <SelectItem value="warning">需跟进</SelectItem>
                    <SelectItem value="good">正常</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            <div className="flex items-center gap-2">
              <Button type="submit">应用筛选</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFilters(emptyCustomerFilters());
                  setPage(1);
                }}
              >
                清除
              </Button>
              <div className="flex-1" />
              {/* Saved views */}
              {savedViews.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    id="customerSavedView"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(e) => handleApplyView(e.target.value)}
                    defaultValue=""
                  >
                    <option value="">保存的筛选器</option>
                    {savedViews.map((view) => (
                      <option key={view.id} value={view.id}>{view.name}</option>
                    ))}
                  </select>
                  {canManage && <Button variant="ghost" size="sm" onClick={handleDeleteView}>
                    <X className="h-4 w-4" />
                  </Button>}
                </div>
              )}
              {canManage && <Button variant="outline" size="sm" onClick={handleSaveView}>
                保存筛选器
              </Button>}
            </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-1">客户状态根据待办、近期互动和邮件结果自动提示；当地时间用于安排邮件发送。</p>

      {/* Toolbar */}
      {canManage ? <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">批量标签</span>
            <Select value={bulkTag} onValueChange={(v) => v !== null && setBulkTag(v)}>
              <SelectTrigger className="h-7 text-xs w-[130px]">
                <SelectValue placeholder="选择已有标签" />
              </SelectTrigger>
              <SelectContent>
                {tags.map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={selectedIds.size === 0} onClick={() => handleBulkTag("add")}>添加标签</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={selectedIds.size === 0} onClick={() => handleBulkTag("remove")}>移除标签</Button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">客户分层</span>
            <Select value={bulkTier} onValueChange={(v) => v !== null && setBulkTier(v)}>
              <SelectTrigger className="h-7 text-xs w-[130px]">
                {bulkTier ? TIERS.find((tier) => tier.value === bulkTier)?.label : <SelectValue placeholder="选择分层" />}
              </SelectTrigger>
              <SelectContent>
                {TIERS.map((tier) => (
                  <SelectItem key={tier.value} value={tier.value}>{tier.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={selectedIds.size === 0} onClick={handleBulkTier}>更新分层</Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" disabled={selectedIds.size === 0} onClick={handleBulkDelete}>
              <Trash2 className="mr-1 h-3 w-3" />
              批量删除
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={selectedIds.size === 0} onClick={() => setSelectedIds(new Set())}>
              清空选择
            </Button>
          </div>
          {selectedIds.size > 0 && (
            <Badge variant="secondary">已选 {selectedIds.size} 项</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Tags management */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground h-7 gap-1 px-2.5 text-[0.8rem] font-medium whitespace-nowrap select-none [&_svg]:size-3.5">
              <Tag className="mr-1 h-3 w-3" />
              标签管理
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-2 min-w-[250px]">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">已有标签</p>
                <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
                  {tags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">暂无标签</span>
                  ) : (
                    tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(tag)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <Separator />
                <div className="flex gap-1">
                  <Input
                    placeholder="新标签"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateTag(); } }}
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={handleCreateTag}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            <Upload className="mr-1 h-4 w-4" />
            {isImporting ? "导入中..." : "导入 Excel/CSV"}
          </Button>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            新增客户
          </Button>
        </div>
      </div> : <Badge variant="outline">只读查看：当前角色不能导入、创建、编辑或删除客户</Badge>}

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && <TableHead className="w-10">
                <Checkbox
                  checked={customers.length > 0 && selectedIds.size === customers.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>}
              <TableHead className="w-8"></TableHead>
              <TableHead>公司</TableHead>
              <TableHead>阶段</TableHead>
              <TableHead>下一步动作</TableHead>
              <TableHead>活跃商机</TableHead>
              <TableHead>最近互动</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-28">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {canManage && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  暂无客户数据
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  {canManage && <TableCell>
                    <Checkbox
                      checked={selectedIds.has(customer.id)}
                      onCheckedChange={(checked) => handleSelectOne(customer.id, !!checked)}
                    />
                  </TableCell>}
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpanded(customer.id)}>
                      {expandedIds.has(customer.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{customer.company}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {customer.business || "未填写主营业务"}
                      </p>
                      <p className="text-xs text-muted-foreground">{customer.email || "未填写邮箱"}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {customer.emailStatus === "invalid" && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">邮箱异常</Badge>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          customer.tier === "A" ? "bg-yellow-100 text-yellow-800" :
                          customer.tier === "B" ? "bg-blue-100 text-blue-800" :
                          customer.tier === "C" ? "bg-gray-100 text-gray-800" :
                          "bg-gray-50 text-gray-500"
                        }`}>
                          {TIERS.find((t) => t.value === customer.tier)?.label?.slice(0, 2) || customer.tier}
                        </span>
                        {customerTagSummary(customer)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      customer.journeyStage === "won" ? "bg-green-100 text-green-800" :
                      customer.journeyStage === "lost" ? "bg-red-100 text-red-800" :
                      customer.journeyStage === "negotiation" ? "bg-purple-100 text-purple-800" :
                      customer.journeyStage === "proposal" ? "bg-yellow-100 text-yellow-800" :
                      customer.journeyStage === "opportunity" ? "bg-purple-100 text-purple-800" :
                      customer.journeyStage === "qualified" ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {JOURNEY_STAGES.find((s) => s.value === customer.journeyStage)?.label || "未设置阶段"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {customer.nextTodoTitle ? (
                      <div>
                        <p className="font-medium text-xs">{customer.nextTodoTitle}</p>
                        <p className={`text-xs ${customer.health === "critical" ? "text-red-500" : "text-muted-foreground"}`}>
                          {customer.nextTodoAt ? new Date(customer.nextTodoAt).toLocaleDateString() : "未设截止时间"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">暂无待办</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {customer.openOpportunityCount ? (
                      <div>
                        <p className="font-medium text-xs">{customer.openOpportunityCount} 个</p>
                        <p className="text-xs text-muted-foreground">
                          {customer.openOpportunityValue
                            ? `$${customer.openOpportunityValue.toLocaleString()}`
                            : "-"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">暂无商机</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {customer.lastActivityAt ? (
                      <div>
                        <p className="text-xs font-medium">{statusLabel(ACTIVITY_TYPE_LABELS, customer.lastActivityType, "客户互动")}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(customer.lastActivityAt).toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">暂无互动</span>
                    )}
                  </TableCell>
                  <TableCell>{customerHealthBadge(customer)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleExpanded(customer.id)}
                        title="展开">
                        {expandedIds.has(customer.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDetailCustomer(customer)}
                        title="详情">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditCustomer(customer)}
                        title="编辑">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>}
                      {canManage && <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={async () => {
                          if (confirm("确定删除该客户吗？")) {
                            await deleteCustomer(customer.id);
                            fetchCustomers();
                          }
                        }}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
            {/* Expanded rows */}
            {customers.map((customer) =>
              expandedIds.has(customer.id) ? (
                <TableRow key={`exp-${customer.id}`} className="bg-muted/30">
                  {canManage && <TableCell></TableCell>}
                  <TableCell colSpan={canManage ? 8 : 7} className="py-3">
                    {customerSummary(customer)}
                  </TableCell>
                </TableRow>
              ) : null
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            本地客户 {total} 条，当前第 {page}/{totalPages} 页，每页 {CUSTOMER_PAGE_SIZE} 条
            {selectedIds.size > 0 && <span className="ml-1">，已选择 {selectedIds.size} 条</span>}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      {canManage && <CustomerCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          setCreateOpen(false);
          fetchCustomers();
        }}
      />}

      {/* Edit Dialog */}
      {canManage && editCustomer && (
        <CustomerEditDialog
          customer={editCustomer}
          open={!!editCustomer}
          onOpenChange={(open) => !open && setEditCustomer(null)}
          onSuccess={() => {
            setEditCustomer(null);
            fetchCustomers();
          }}
        />
      )}

      {/* Detail Dialog */}
      {detailCustomer && (
        <Customer360Dialog
          customerId={detailCustomer.id}
          open={!!detailCustomer}
          onOpenChange={(open) => !open && setDetailCustomer(null)}
          onCustomerChanged={() => void fetchCustomers()}
        />
      )}
    </div>
  );
}
// Customer Create Dialog
function CustomerCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    company: "",
    business: "",
    contact: "",
    email: "",
    phone: "",
    website: "",
    region: "",
    timezone: "",
    tags: "",
    tier: "C",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await createCustomer({
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        tier: form.tier as "A" | "B" | "C" | "D",
      });
      onSuccess();
      setForm({
        company: "",
        business: "",
        contact: "",
        email: "",
        phone: "",
        website: "",
        region: "",
        timezone: "",
        tags: "",
        tier: "C",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增客户</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>公司 *</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>主营业务</Label>
              <Input
                value={form.business}
                onChange={(e) => setForm({ ...form, business: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>联系人</Label>
              <Input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>电话</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>网站</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>地区</Label>
              <Input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>客户时区</Label>
              <Input
                list="create-customer-timezones"
                placeholder="例如 Asia/Bangkok"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
              <datalist id="create-customer-timezones">
                {COMMON_TIMEZONES.map((timezone) => (
                  <option key={timezone} value={timezone} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>客户分层</Label>
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v as "A" | "B" | "C" | "D" })}>
                <SelectTrigger>
                  {TIERS.find((tier) => tier.value === form.tier)?.label || "选择客户分层"}
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((tier) => (
                    <SelectItem key={tier.value} value={tier.value}>
                      {tier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>客户标签</Label>
              <Input
                placeholder="多个标签用逗号分隔"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "保存中..." : "保存客户"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Customer Edit Dialog
function CustomerEditDialog({
  customer,
  open,
  onOpenChange,
  onSuccess,
}: {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    company: customer.company,
    business: customer.business || "",
    contact: customer.contact || "",
    email: customer.email || "",
    phone: customer.phone || "",
    website: customer.website || "",
    region: customer.region || "",
    timezone: customer.timezone || "",
    tags: customer.tags?.join(", ") || "",
    tier: customer.tier,
    journeyStage: customer.journeyStage,
    notes: customer.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await updateCustomer(customer.id, {
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      onSuccess();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑客户</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>公司 *</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>主营业务</Label>
              <Input
                value={form.business}
                onChange={(e) => setForm({ ...form, business: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>联系人</Label>
              <Input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>电话</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>网站</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>地区</Label>
              <Input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>客户时区</Label>
              <Input
                list="edit-customer-timezones"
                placeholder="例如 Asia/Bangkok"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
              <datalist id="edit-customer-timezones">
                {COMMON_TIMEZONES.map((timezone) => (
                  <option key={timezone} value={timezone} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                用于按客户当地工作时间发送邮件；留空时会尝试根据地区自动识别。
              </p>
            </div>
            <div className="space-y-2">
              <Label>客户分层</Label>
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v as "A" | "B" | "C" | "D" })}>
                <SelectTrigger>
                  {TIERS.find((tier) => tier.value === form.tier)?.label || "选择客户分层"}
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((tier) => (
                    <SelectItem key={tier.value} value={tier.value}>
                      {tier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>客户跟进阶段（与当前商机同步）</Label>
              <Select value={form.journeyStage} onValueChange={(v) => setForm({ ...form, journeyStage: v as Customer["journeyStage"] })}>
                <SelectTrigger>
                  {JOURNEY_STAGES.find((stage) => stage.value === form.journeyStage)?.label || "选择跟进阶段"}
                </SelectTrigger>
                <SelectContent>
                  {JOURNEY_STAGES.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                进入“商机推进”或更后阶段时，会同步当前商机；已有多个商机时只更新最近操作的一条。
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>客户标签</Label>
              <Input
                placeholder="多个标签用逗号分隔"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>备注</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
