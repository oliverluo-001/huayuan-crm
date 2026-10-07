import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { canManageCrmData } from "@/auth/permissions";
import {
  B2B_TASK_STATUS_LABELS,
  LEAD_ACTION_LABELS,
  LEAD_BUYER_TYPE_OPTIONS,
  LEAD_CONFIDENCE_LABELS,
  LEAD_REGION_OPTIONS,
  LEAD_SOURCE_TYPE_LABELS,
  optionLabel,
  statusLabel,
} from "@/contracts/crm-terminology";
import "./LeadsPage.css";
import { isLeadImportable } from "@/contracts/lead-quality";
import { effectiveMarkets, marketPayload, type MarketMode } from "@/contracts/lead-market";
import {
  getB2BLeadTasks,
  createB2BLeadTask,
  getB2BLeads,
  runB2BLeadTask,
  cancelB2BLeadTask,
  deleteB2BLeadTask,
  importB2BLeads,
  cleanB2BLeads,
  getLeadAssociation,
  saveLeadQueries,
  importB2BLeadsToCustomers,
  type B2BLeadTask,
  type B2BLead,
  type LeadAssociation,
  type B2BAutomationProgress,
} from "@/api/client";

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTOMATION_STAGE_LABELS: Record<string, string> = {
  starting: "连接搜索源",
  searching: "搜索企业",
  crawling: "访问官网并提取公开联系方式",
  cleaning: "准备清洗",
  validating: "去重、验证与评分",
  completed: "已完成",
  cancelled: "已停止",
  paused: "等待继续",
  failed: "执行失败",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function automationProgressPercent(task: B2BLeadTask): number {
  const progress = task.automationProgress || ({} as B2BAutomationProgress);
  const queryTotal = Math.max(0, Number(progress.totalQueries || task.searchQueries?.length) || 0);
  const queryIndex = Math.max(0, Number(progress.searchedQueries ?? task.automationCursor) || 0);
  if (!task || ["completed", "exhausted", "cancelled", "failed"].includes(task.status) && !queryTotal) return 100;
  if (progress.stage === "validating" || progress.stage === "cleaning") return 96;
  if (progress.stage === "completed") return 100;
  if (task.status === "completed" && queryIndex >= queryTotal && queryTotal > 0) return 100;
  return queryTotal ? Math.min(95, Math.round((queryIndex / queryTotal) * 100)) : task.status === "running" ? 3 : 0;
}

function automationStageText(task: B2BLeadTask): string {
  const progress = task.automationProgress || ({} as B2BAutomationProgress);
  if (progress.stage && AUTOMATION_STAGE_LABELS[progress.stage]) {
    return AUTOMATION_STAGE_LABELS[progress.stage];
  }
  return statusLabel(B2B_TASK_STATUS_LABELS, task.status, "待启动");
}

function gradeForConfidence(confidence?: number | string): string {
  if (confidence === "High") return "A";
  if (confidence === "Medium") return "B";
  return "C";
}

function actionCssClass(action?: string): string {
  return String(action || "").toLowerCase().replace(/\s+/g, "-");
}

function parseLeadImport(textValue: string): Record<string, string>[] {
  const text = String(textValue || "").replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  if (text.startsWith("[") || text.startsWith("{")) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.leads) ? parsed.leads : [];
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') { quoted = !quoted; }
    else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else { cell += ch; }
  }
  row.push(cell);
  if (row.some(v => v !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(v => v.trim());
  return rows.slice(1).filter(r => r.some(Boolean))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LeadsPage() {
  const { role } = useAuth();
  const canManage = canManageCrmData(role);

  // Wizard state
  const [currentStage, setCurrentStage] = useState(1);
  const [productName, setProductName] = useState("");
  const [association, setAssociation] = useState<LeadAssociation | null>(null);
  const [associationLoading, setAssociationLoading] = useState(false);
  const [associationDraft, setAssociationDraft] = useState<LeadAssociation | null>(null);

  // Market selection state
  const [marketMode, setMarketMode] = useState<MarketMode>("global");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [targetCount, setTargetCount] = useState("100");
  const [targetCountries, setTargetCountries] = useState("");

  // Task state
  const [tasks, setTasks] = useState<B2BLeadTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string>("");
  const [leads, setLeads] = useState<B2BLead[]>([]);
  const [leadSummary, setLeadSummary] = useState<Record<string, any>>({});
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [creatingTask, setCreatingTask] = useState(false);

  // Filters
  const [filterRegion, setFilterRegion] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterSegment, setFilterSegment] = useState("");
  const [filterRecommendedAction, setFilterRecommendedAction] = useState("Ready to Email");
  const [filterConfidence, setFilterConfidence] = useState("");

  // Query editor
  const [queryText, setQueryText] = useState("");
  const [savingQueries, setSavingQueries] = useState(false);

  // Manual import
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [converting, setConverting] = useState(false);
  const convertingRef = useRef(false);

  // Refs
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingRef = useRef(false);
  const queryEditorRef = useRef<HTMLTextAreaElement>(null);

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    try {
      const data = await getB2BLeadTasks();
      setTasks(data);
      if (data.length > 0 && !activeTaskId) {
        const running = data.find((t) => t.status === "running");
        setActiveTaskId(running ? running.id : data[0].id);
      }
    } catch {
      // handled by api client
    } finally {
      setTasksLoading(false);
    }
  }, [activeTaskId]);

  const fetchLeadsForTask = useCallback(async (taskId: string) => {
    setLeadsLoading(true);
    try {
      const filters: Record<string, string> = {};
      if (filterRegion) filters.largeRegion = filterRegion;
      if (filterCountry) filters.country = filterCountry;
      if (filterSegment) filters.targetSegment = filterSegment;
      if (filterRecommendedAction) filters.recommendedAction = filterRecommendedAction;
      if (filterConfidence) filters.confidence = filterConfidence;
      const result = await getB2BLeads(taskId, filters);
      setLeads(result.leads || []);
      setLeadSummary((result.summary || {}) as Record<string, any>);
      setSelectedLeadIds((prev) => {
        const next = new Set(prev);
        for (const id of next) {
          if (!result.leads?.find((l) => l.id === id)) next.delete(id);
        }
        return next;
      });
    } catch {
      // handled
    } finally {
      setLeadsLoading(false);
    }
  }, [filterRegion, filterCountry, filterSegment, filterRecommendedAction, filterConfidence]);

  // Initial load
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Load leads when active task changes
  useEffect(() => {
    if (activeTaskId) {
      fetchLeadsForTask(activeTaskId);
      const task = tasks.find((t) => t.id === activeTaskId);
      if (task?.searchQueries && document.activeElement !== queryEditorRef.current) {
        setQueryText(task.searchQueries.join("\n"));
      }
    }
  }, [activeTaskId, fetchLeadsForTask, tasks]);

  // ─── Polling ────────────────────────────────────────────────────────────

  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const hasRunning = tasks.some((t) => t.status === "running");
    if (!isPollingRef.current) {
      isPollingRef.current = true;
      pollTimerRef.current = setTimeout(async () => {
        isPollingRef.current = false;
        try {
          const data = await getB2BLeadTasks();
          const previousActive = tasks.find((t) => t.id === activeTaskId);
          const refreshedActive = data.find((t) => t.id === activeTaskId);
          setTasks(data);
          if (
            activeTaskId &&
            (
              previousActive?.status !== refreshedActive?.status ||
              Number(previousActive?.rawLeadCount || 0) !== Number(refreshedActive?.rawLeadCount || 0)
            )
          ) {
            fetchLeadsForTask(activeTaskId);
          }
          schedulePoll();
        } catch {
          schedulePoll();
        }
      }, hasRunning ? 1800 : 10000);
    }
  }, [tasks, activeTaskId, fetchLeadsForTask]);

  useEffect(() => {
    schedulePoll();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [schedulePoll]);

  // ─── Stage 1: Product Association ───────────────────────────────────────

  const handleRequestAssociation = async () => {
    if (!productName.trim()) {
      toast.error("请输入产品名称");
      return;
    }
    setAssociationLoading(true);
    try {
      const result = await getLeadAssociation(productName.trim());
      setAssociationDraft(result);
      setAssociation(result);
    } catch {
      // handled
    } finally {
      setAssociationLoading(false);
    }
  };

  const handleAddAssociationTerm = (group: "aliases" | "industries" | "companyTypes") => {
    if (!associationDraft) return;
    const current = [...(associationDraft[group] || [])];
    const placeholder =
      group === "aliases" ? "输入别名" :
      group === "industries" ? "输入行业" : "输入公司类型";
    const value = prompt(placeholder);
    if (!value?.trim()) return;
    if (!current.some((item) => item.toLowerCase() === value.trim().toLowerCase())) {
      const updated = { ...associationDraft, [group]: [...current, value.trim()] };
      setAssociationDraft(updated);
      setAssociation(updated);
    }
  };

  const handleToggleAssociationTerm = (group: "aliases" | "industries" | "companyTypes", value: string, checked: boolean) => {
    if (!associationDraft) return;
    const current = [...(associationDraft[group] || [])];
    const updated = checked
      ? (current.includes(value) ? current : [...current, value])
      : current.filter((v) => v !== value);
    const newDraft = { ...associationDraft, [group]: updated };
    setAssociationDraft(newDraft);
    setAssociation(newDraft);
  };

  const handleConfirmAssociation = () => {
    if (!associationDraft) return;
    const industries = associationDraft.industries || [];
    const companyTypes = associationDraft.companyTypes || [];
    if (!industries.length || !companyTypes.length) {
      toast.error("请至少保留一个下游行业和一种买家公司类型");
      return;
    }
    setAssociation(associationDraft);
    setCurrentStage(2);
  };

  // ─── Stage 2: Market Selection ──────────────────────────────────────────

  const handleRegionToggle = (region: string) => {
    setSelectedRegions((prev) => {
      if (region === "Global") {
        return ["Global"];
      }
      const withoutGlobal = prev.filter((r) => r !== "Global");
      if (withoutGlobal.includes(region)) {
        const next = withoutGlobal.filter((r) => r !== region);
        return next;
      }
      return [...withoutGlobal, region];
    });
  };

  const handleSegmentToggle = (segment: string) => {
    setSelectedSegments((prev) =>
      prev.includes(segment) ? prev.filter((s) => s !== segment) : [...prev, segment]
    );
  };

  const handleCreateTask = async () => {
    if (!associationDraft) {
      toast.error("请先完成产品联想并确认买家画像");
      return;
    }
    if (!selectedSegments.length) {
      toast.error("请至少选择一种买家类型");
      return;
    }
    const market = marketPayload(marketMode, selectedRegions, targetCountries);
    if (marketMode === 'countries' && !market.targetCountries.length) { toast.error('请填写至少一个目标国家'); return; }
    if (marketMode === 'regions' && !market.targetRegions.length) { toast.error('请至少选择一个目标大区'); return; }
    setCreatingTask(true);
    try {
      const body: Record<string, any> = {
        productName: associationDraft.productName,
        targetCount: parseInt(targetCount) || 100,
        searchLanguage: 'en',
        ...market,
        targetSegments: selectedSegments,
        productAliases: associationDraft.aliases || [],
        buyerIndustries: associationDraft.industries || [],
        buyerCompanyTypes: associationDraft.companyTypes || [],
        associationSource: associationDraft.source || "fallback",
      };
      const result = await createB2BLeadTask(body);
      const taskId = result.task.id;
      setActiveTaskId(taskId);
      await runB2BLeadTask(taskId);
      setSelectedLeadIds(new Set());
      setCurrentStage(3);
      toast(`已确认买家画像并生成 ${(result.queries || []).length} 条搜索策略，任务已启动。`);
      await fetchTasks();
    } catch {
      // handled
    } finally {
      setCreatingTask(false);
    }
  };

  // ─── Stage 3: Automation Actions ────────────────────────────────────────

  const activeTask = tasks.find((t) => t.id === activeTaskId) || null;
  const running = activeTask?.status === "running";

  const handleStartAutomation = async () => {
    if (!activeTaskId) return;
    await runB2BLeadTask(activeTaskId);
    toast("自动搜索已启动");
    await fetchTasks();
  };

  const handleCancelAutomation = async () => {
    if (!activeTaskId) return;
    await cancelB2BLeadTask(activeTaskId);
    toast("正在停止搜索，已发现的线索会保留并自动清洗");
    await fetchTasks();
  };

  const handleDeleteTask = async () => {
    if (!activeTaskId) return;
    if (!confirm("删除任务会同时删除该任务的原始线索、清洗结果和重复项，是否继续？")) return;
    await deleteB2BLeadTask(activeTaskId);
    setActiveTaskId("");
    setSelectedLeadIds(new Set());
    toast("获客任务已删除");
    await fetchTasks();
  };

  const handleImportB2BLeads = async () => {
    if (!activeTaskId) return;
    if (importing) return;
    setImporting(true);
    try {
      const file = importFile;
      const text = file ? await file.text() : importText;
      let leads: Record<string, string>[];
      try {
        leads = parseLeadImport(text);
      } catch (err: any) {
        toast.error(`导入内容解析失败：${err.message || String(err)}`);
        return;
      }
      if (!leads.length) {
        toast.error("未识别到可导入的 CSV 或 JSON 线索");
        return;
      }
      const result = await importB2BLeads(activeTaskId, leads);
      setImportText("");
      setImportFile(null);
      toast(`已导入 ${result.imported} 条原始线索`);
      await fetchLeadsForTask(activeTaskId);
    } catch {
      // handled
    } finally {
      setImporting(false);
    }
  };

  const handleCleanLeads = async () => {
    if (!activeTaskId) return;
    setCleaning(true);
    try {
      const result = await cleanB2BLeads(activeTaskId);
      toast(`核验完成：通过联系前检查 ${result.summary.readyToEmail} 条，待核验 ${result.summary.needsReview} 条`);
      await fetchLeadsForTask(activeTaskId);
    } catch {
      // handled
    } finally {
      setCleaning(false);
    }
  };

  const handleSaveQueries = async (regenerate: boolean) => {
    if (!activeTaskId) return;
    setSavingQueries(true);
    try {
      const body: any = regenerate ? {} : {
        queries: queryText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      };
      const result = await saveLeadQueries(activeTaskId, regenerate, body.queries);
      if (result.task?.searchQueries) {
        setQueryText(result.task.searchQueries.join("\n"));
      }
      toast(regenerate ? "搜索策略已重新生成" : "搜索策略已保存");
      await fetchTasks();
    } catch {
      // handled
    } finally {
      setSavingQueries(false);
    }
  };

  const handleExport = (type: string) => {
    if (!activeTaskId) return;
    window.open(`/api/lead-tasks/${encodeURIComponent(activeTaskId)}/export?type=${encodeURIComponent(type)}`, "_blank", "noopener");
  };

  const handleImportToCustomers = async (importAll: boolean) => {
    if (!activeTaskId || convertingRef.current) return;
    if (!importAll && leads.some((lead) => selectedLeadIds.has(lead.id) && !isLeadImportable(lead))) {
      toast.error("选择中包含未通过质量检查或核验已过期的线索，请先重新验证。"); return;
    }
    convertingRef.current = true; setConverting(true);
    try {
    const body = importAll ? { importAll: true } : { ids: [...selectedLeadIds] };
    const result = await importB2BLeadsToCustomers(activeTaskId, body);
    setSelectedLeadIds(new Set());
    toast(`新增 ${result.imported} 家客户，归入已有客户 ${result.merged} 条，保留待核验或跳过 ${result.skipped || 0} 条。`);
    await fetchTasks();
    await fetchLeadsForTask(activeTaskId);
    } finally { convertingRef.current = false; setConverting(false); }
  };

  const handleSelectAll = (checked: boolean) => {
    const importable = leads.filter(isLeadImportable);
    setSelectedLeadIds(new Set(checked ? importable.map((l) => l.id) : []));
  };

  const handleSelectLead = (id: string, checked: boolean) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // ─── Dynamic filter options from lead data ──────────────────────────────

  const filterRegionOptions = [...new Set(leads.map((l) => l.largeRegion).filter(Boolean))].sort();
  const filterCountryOptions = [...new Set(leads.map((l) => l.country).filter(Boolean))].sort();
  const filterSegmentOptions = [...new Set(leads.map((l) => l.targetSegment).filter(Boolean))].sort();

  // ─── Render helpers ─────────────────────────────────────────────────────

  const renderStageBar = () => (
    <div className="lead-stagebar" aria-label="获客流程">
      <div className={currentStage >= 1 ? "active" : ""} data-lead-stage="1">
        <span>1</span><strong>确认产品方向</strong>
      </div>
      <i></i>
      <div className={currentStage >= 2 ? (currentStage > 2 ? "done" : "active") : ""} data-lead-stage="2">
        <span>2</span><strong>选择目标市场</strong>
      </div>
      <i></i>
      <div className={currentStage >= 3 ? (currentStage > 3 ? "done" : "active") : ""} data-lead-stage="3">
        <span>3</span><strong>自动搜索与入库</strong>
      </div>
    </div>
  );

  const renderAssociationPreview = () => {
    if (!associationDraft) return null;
    return (
      <div className="lead-association-preview">
        <div className="lead-association-title">
          <div>
            <strong>{associationDraft.canonicalName || associationDraft.productName}</strong>
            <span className="status-pill">{associationDraft.source || "行业联想"}</span>
          </div>
          {associationDraft.warning && <small>{associationDraft.warning}</small>}
        </div>
        <div className="lead-association-groups">
          <section>
            <h4>产品搜索词</h4>
            <div className="lead-chip-list">
              {(associationDraft.aliases || []).map((alias) => (
                <label key={alias} className="lead-choice-chip">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={(e) => handleToggleAssociationTerm("aliases", alias, e.target.checked)}
                  />
                  <span>{alias}</span>
                </label>
              ))}
            </div>
            <div className="lead-chip-add">
              <Button type="button" variant="outline" size="sm" onClick={() => handleAddAssociationTerm("aliases")}>
                + 添加
              </Button>
            </div>
          </section>
          <section>
            <h4>下游采购行业</h4>
            <div className="lead-chip-list">
              {(associationDraft.industries || []).map((ind) => (
                <label key={ind} className="lead-choice-chip">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={(e) => handleToggleAssociationTerm("industries", ind, e.target.checked)}
                  />
                  <span>{ind}</span>
                </label>
              ))}
            </div>
            <div className="lead-chip-add">
              <Button type="button" variant="outline" size="sm" onClick={() => handleAddAssociationTerm("industries")}>
                + 添加
              </Button>
            </div>
          </section>
          <section>
            <h4>买家公司类型</h4>
            <div className="lead-chip-list">
              {(associationDraft.companyTypes || []).map((ct) => (
                <label key={ct} className="lead-choice-chip">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={(e) => handleToggleAssociationTerm("companyTypes", ct, e.target.checked)}
                  />
                    <span>{ct}</span>
                </label>
              ))}
            </div>
            <div className="lead-chip-add">
              <Button type="button" variant="outline" size="sm" onClick={() => handleAddAssociationTerm("companyTypes")}>
                + 添加
              </Button>
            </div>
          </section>
        </div>
        <div className="lead-step-footer">
          <span>取消勾选不相关的词，再确认。</span>
          <Button onClick={handleConfirmAssociation}>确认买家画像</Button>
        </div>
      </div>
    );
  };

  const renderRegionOptions = () => (
    <fieldset className="full">
      <legend>选择大区（可多选）</legend>
      <div className="lead-option-grid">
        {LEAD_REGION_OPTIONS.filter((region) => region.value !== 'Global').map((region) => (
          <label key={region.value} className="lead-choice-chip">
            <input
              type="checkbox"
              name="targetRegions"
              checked={selectedRegions.includes(region.value)}
              onChange={() => handleRegionToggle(region.value)}
            />
            <span>{region.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const renderSegmentOptions = () => {
    return (
      <fieldset className="full">
        <legend>买家类型</legend>
        <div className="lead-option-grid lead-segment-options">
          {LEAD_BUYER_TYPE_OPTIONS.map((segment) => (
            <label key={segment.value} className="lead-choice-chip">
              <input
                type="checkbox"
                name="targetSegments"
                checked={selectedSegments.includes(segment.value)}
                onChange={() => handleSegmentToggle(segment.value)}
              />
              <span>{segment.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  };

  const renderTaskSummary = () => {
    if (!activeTask) return <div className="empty-state">先创建一个获客任务。</div>;
    const progress = activeTask.automationProgress || ({} as B2BAutomationProgress);
    const queryTotal = Math.max(0, Number(progress.totalQueries || activeTask.searchQueries?.length) || 0);
    const queryIndex = Math.max(0, Number(progress.searchedQueries ?? activeTask.automationCursor) || 0);
    const percent = automationProgressPercent(activeTask);

    return (
      <div className="lead-task-summary">
        <div className="lead-task-summary-head">
          <strong>{activeTask.productName || "未命名产品"}</strong>
          <span className={`status-pill ${running ? "running" : ""}`}>
            {statusLabel(B2B_TASK_STATUS_LABELS, activeTask.status)}
          </span>
        </div>
        <span>
          {effectiveMarkets(activeTask).map((region) => optionLabel(LEAD_REGION_OPTIONS, region, region)).join("、")} · 合格线索目标 {activeTask.targetCount} 条 · 原始 {activeTask.rawLeadCount || 0} · 上次核验通过 {Number(progress.verifiedLeads ?? activeTask.cleanedLeadCount ?? 0)} · 重复 {activeTask.duplicateCount || 0} · 已转客户 {activeTask.importedCustomerCount || 0}
        </span>
        {(activeTask.buyerIndustries || []).length > 0 && (
          <div className="lead-task-profile">
            <span>下游行业</span>
            {(activeTask.buyerIndustries || []).slice(0, 6).map((item, i) => (
              <b key={i}>{item}</b>
            ))}
          </div>
        )}
        <div className="lead-automation-progress">
          <div className="lead-progress-track">
            <span style={{ width: `${percent}%` }}></span>
          </div>
          <div className="lead-progress-stats">
            <span>{automationStageText(activeTask)} {percent}%</span>
            <span>查询 {Math.min(queryIndex, queryTotal)}/{queryTotal}</span>
            <span>搜索结果 {Number(progress.searchedResults || 0)}</span>
            <span>官网访问 {Number(progress.websitesCrawled || 0)}</span>
            <span>公开邮箱 {Number(progress.publicEmailsFound || activeTask.rawLeadCount || 0)}</span>
            <span>高匹配候选 {Number(progress.qualifiedCandidates || 0)}</span>
          </div>
          {progress.currentQuery && (
            <div className="lead-current-query" title={progress.currentQuery}>
              当前：{progress.currentQuery}
            </div>
          )}
          {(progress.sourceNames || []).length > 0 && (
            <div className="lead-current-query" title={(progress.sourceNames || []).join("、")}>
              本批来源：{(progress.sourceNames || []).join("、")}
            </div>
          )}
        </div>
        <small>
          {activeTask.lastMessage || ""}
          {progress.lastError ? ` · 最近错误：${progress.lastError}` : ""}
          {(progress.sourceErrors || []).length > 0
            ? ` · 已跳过不可用来源：${(progress.sourceErrors || []).join("；")}`
            : ""}
        </small>
      </div>
    );
  };

  const renderLeadSummaryCards = () => {
    const summary = leadSummary;
    const metrics = [
      ["总线索", summary.total || 0],
      ["已去重", summary.duplicatesRemoved || 0],
      ["通过联系前检查", summary.readyToEmail || 0],
      ["待人工核验", summary.needsReview || 0],
      ["建议剔除", (summary.remove || 0) + (summary.hardBounce || 0)],
    ];
    const byRegion = (summary.byLargeRegion || {}) as Record<string, number>;
    const bySegment = (summary.byTargetSegment || {}) as Record<string, number>;
    const regionEntries = Object.entries(byRegion);
    const segmentEntries = Object.entries(bySegment);

    return (
      <>
        <div className="metric-grid lead-summary-grid">
          {metrics.map(([label, value]) => (
            <article key={label} className="metric-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <div className="lead-distribution">
          <div>
            <h3>大区域分布</h3>
            {regionEntries.length ? regionEntries.map(([name, count]) => (
              <span key={name}><strong>{optionLabel(LEAD_REGION_OPTIONS, name, name)}</strong> {count}</span>
            )) : <span>暂无数据</span>}
          </div>
          <div>
            <h3>客户类型分布</h3>
            {segmentEntries.length ? segmentEntries.map(([name, count]) => (
              <span key={name}><strong>{optionLabel(LEAD_BUYER_TYPE_OPTIONS, name, name)}</strong> {count}</span>
            )) : <span>暂无数据</span>}
          </div>
        </div>
      </>
    );
  };

  const renderLeadTable = () => {
    const importableLeads = leads.filter(isLeadImportable);
    const allSelected = importableLeads.length > 0 && importableLeads.every((l) => selectedLeadIds.has(l.id));

    return (
      <div className="table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && (
                <TableHead className="check-col" style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={importableLeads.length === 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="全选当前可用结果"
                  />
                </TableHead>
              )}
              <TableHead>公司与官网</TableHead>
              <TableHead>公开邮箱</TableHead>
              <TableHead>区域</TableHead>
              <TableHead>匹配依据</TableHead>
              <TableHead>评分</TableHead>
              <TableHead>建议动作</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 8}>
                  {running
                    ? "自动搜索进行中，发现公开邮箱后将自动去重、验证并在这里显示。"
                    : "暂无搜索结果，请从上方输入产品开始。"}
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => {
                const importable = isLeadImportable(lead);
                const grade = gradeForConfidence(lead.confidence);
                return (
                  <TableRow key={lead.id}>
                    {canManage && (
                      <TableCell className="check-col">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          disabled={!importable}
                          onChange={(e) => handleSelectLead(lead.id, e.target.checked)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <strong>{lead.company || "未识别公司"}</strong>
                      <div className="meta clipped">
                        {lead.website ? (
                          <a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a>
                        ) : "未提供官网"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <strong>{lead.email || "-"}</strong>
                      <div className="meta">{lead.emailSourceDomainMatch ? "邮箱域名与官网一致" : "域名待核验"}</div>
                      <div className="meta">{lead.rawData?.contactQuality?.published ? "来源页已核对该邮箱" : "未通过来源页复核"} · 实际投递仍待确认</div>
                      {lead.rawData?.contactQuality?.checkedAt && <div className="meta">核验时间：{new Date(lead.rawData.contactQuality.checkedAt).toLocaleString()}</div>}
                    </TableCell>
                    <TableCell>
                      {lead.country || "-"}
                      <div className="meta">{optionLabel(LEAD_REGION_OPTIONS, lead.largeRegion, "未识别区域")}</div>
                    </TableCell>
                    <TableCell>
                      {optionLabel(LEAD_BUYER_TYPE_OPTIONS, lead.targetSegment, "-")}
                      <div className="meta clipped">{lead.matchedProductKeyword || lead.business || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`lead-grade grade-${grade}`}>
                        {Number(lead.leadScore) || 0} · {statusLabel(LEAD_CONFIDENCE_LABELS, lead.confidence, "待评分")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`lead-action action-${actionCssClass(lead.recommendedAction)}`}>
                        {statusLabel(LEAD_ACTION_LABELS, lead.recommendedAction, "待评估")}
                      </span>
                    </TableCell>
                    <TableCell>
                      {(lead.sourceUrl || lead.source) ? (
                        <a href={lead.sourceUrl || lead.source} target="_blank" rel="noreferrer">{statusLabel(LEAD_SOURCE_TYPE_LABELS, lead.sourceType, "公开网页")}</a>
                      ) : statusLabel(LEAD_SOURCE_TYPE_LABELS, lead.sourceType, "来源未标注")}
                      <div className="meta">HTTP {lead.sourceHttpStatus || "-"}</div>
                    </TableCell>
                    <TableCell>
                      {lead.crmCustomerId ? (
                        <span className="status-pill success">已入客户库</span>
                      ) : (
                        <div className="cleaning-notes">{lead.reviewReason || (isLeadImportable(lead) ? "来源、域名及业务匹配检查通过；实际投递待确认" : lead.cleaningNotes || "待处理")}</div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderFilters = () => (
    <form
      className="lead-filter-bar"
      onSubmit={(e) => {
        e.preventDefault();
        if (activeTaskId) fetchLeadsForTask(activeTaskId);
      }}
    >
      <select
        name="largeRegion"
        value={filterRegion}
        onChange={(e) => setFilterRegion(e.target.value)}
      >
        <option value="">全部大区域</option>
        {filterRegionOptions.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <select
        name="country"
        value={filterCountry}
        onChange={(e) => setFilterCountry(e.target.value)}
      >
        <option value="">全部国家</option>
        {filterCountryOptions.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select
        name="targetSegment"
        value={filterSegment}
        onChange={(e) => setFilterSegment(e.target.value)}
      >
        <option value="">全部客户类型</option>
        {filterSegmentOptions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select
        name="recommendedAction"
        value={filterRecommendedAction}
        onChange={(e) => setFilterRecommendedAction(e.target.value)}
      >
        <option value="">全部处理建议</option>
        {Object.entries(LEAD_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select
        name="confidence"
        value={filterConfidence}
        onChange={(e) => setFilterConfidence(e.target.value)}
      >
        <option value="">全部置信度</option>
        {Object.entries(LEAD_CONFIDENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Button type="submit" variant="outline" size="sm">应用筛选</Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setFilterRegion("");
          setFilterCountry("");
          setFilterSegment("");
          setFilterRecommendedAction("");
          setFilterConfidence("");
        }}
      >
        清除
      </Button>
    </form>
  );

  // ─── Main Render ───────────────────────────────────────────────────────

  return (
    <div className="leads-page">
      <div className="panel-title">
        <div>
          <h2>B2B 客户开发</h2>
          <p className="section-description">从产品需求出发，自动定位潜在买家并沉淀到客户库。</p>
        </div>
        {!canManage && <span className="status-pill">只读权限</span>}
      </div>

      {canManage && renderStageBar()}

      {canManage && <section className="lead-wizard">
        {/* Step 1: Product Association */}
        <article className={`lead-step-card ${currentStage >= 1 ? "active" : ""}`} id="leadAssociationStep">
          <div className="lead-step-heading">
            <span>1</span>
            <div>
              <h3>卖什么产品？</h3>
              <p>系统会先找出真正可能采购该产品的行业和公司类型。</p>
            </div>
          </div>
          <form
            className="lead-product-search"
            onSubmit={(e) => { e.preventDefault(); handleRequestAssociation(); }}
          >
            <Input
              id="leadProductInput"
              name="productName"
              required
              autoComplete="off"
              placeholder="输入产品，如：法兰、工业泵、轴承"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <Button type="submit" disabled={associationLoading}>
              {associationLoading ? "正在分析采购场景…" : "智能联想买家"}
            </Button>
          </form>
          {renderAssociationPreview()}
        </article>

        {/* Step 2: Market Selection */}
        <article className={`lead-step-card ${currentStage < 2 ? "locked" : "active"}`} id="leadMarketStep">
          <div className="lead-step-heading">
            <span>2</span>
            <div>
              <h3>去哪里找客户？</h3>
              <p id="leadMarketProductSummary">
                {currentStage < 2 ? "请先完成产品联想。" :
                  `${association?.canonicalName || association?.productName} · ${(association?.industries || []).length} 个下游行业 · ${(association?.companyTypes || []).length} 种买家公司`}
              </p>
            </div>
          </div>
          {currentStage >= 2 && (
            <form
              className="lead-market-form"
              onSubmit={(e) => { e.preventDefault(); handleCreateTask(); }}
            >
              <div className="form-field">
                <label>当前产品</label>
                <Input name="productName" readOnly value={association?.canonicalName || association?.productName || ""} />
              </div>
              <fieldset className="full">
                <legend>搜索范围</legend>
                <div className="lead-option-grid">
                  {([['global', '全球'], ['regions', '按大区'], ['countries', '按国家']] as const).map(([value, label]) => <label key={value} className="lead-choice-chip"><input type="radio" name="marketMode" value={value} checked={marketMode === value} onChange={() => setMarketMode(value)} /><span>{label}</span></label>)}
                </div>
                <small>三种范围互斥；切换模式后，只使用当前模式的条件。不会自动扩大到全球。</small>
              </fieldset>
              {marketMode === 'countries' && <div className="form-field full">
                <label htmlFor="lead-target-countries">目标国家（必填）</label>
                <Input
                  id="lead-target-countries"
                  name="targetCountries"
                  placeholder="如：阿联酋、德国、美国（用逗号分隔）；也支持 UAE, Germany, USA"
                  value={targetCountries}
                  onChange={(e) => setTargetCountries(e.target.value)}
                />
                <small>最多 20 个国家；支持常用中文名和缩写，其他国家请使用英文全称。</small>
              </div>}
              {marketMode === 'regions' && renderRegionOptions()}
              <p className="full" role="status">最终搜索范围：{marketMode === 'global' ? '全球' : marketMode === 'countries' ? marketPayload(marketMode, selectedRegions, targetCountries).targetCountries.join('、') || '请填写国家' : selectedRegions.map((region) => optionLabel(LEAD_REGION_OPTIONS, region, region)).join('、') || '请选择大区'}。企业发现、重新生成查询及质量核验均使用此范围。</p>
              <div className="form-field">
                <label>合格邮件线索目标</label>
                <Input
                  name="targetCount"
                  type="number"
                  min={1}
                  max={500}
                  value={targetCount}
                  onChange={(e) => setTargetCount(e.target.value)}
                />
                <small>按通过业务匹配和联系方式检查的数量计算目标，待核验和无效线索不凑数；实际投递能力仍待确认。</small>
              </div>
              <p className="full meta">检索方式：优先使用英文产品词；按市场轮流查询，先寻找企业与联系页面，再补充采购及行业场景。同义词用于扩展，不重复占用查询预算。</p>
              {renderSegmentOptions()}
              <Button type="submit" className="full" disabled={creatingTask}>
                {creatingTask ? "正在创建并启动…" : "确认并开始自动搜索"}
              </Button>
            </form>
          )}
        </article>
      </section>}

      {/* Run Panel: Task list, info, controls, query editor */}
      <section className="lead-run-panel">
        <div className="lead-run-head">
          <div>
            <h3>自动搜索任务</h3>
            <p>搜索、官网访问、公开邮箱提取和清洗会在后台连续完成。</p>
          </div>
          <label>
            当前任务
            <select
              id="b2bTaskSelect"
              value={activeTaskId}
              onChange={(e) => {
                setActiveTaskId(e.target.value);
                setSelectedLeadIds(new Set());
              }}
            >
              {tasks.length === 0 && <option value="">暂无任务</option>}
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.productName || "未命名"} · {statusLabel(B2B_TASK_STATUS_LABELS, task.status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {tasksLoading ? (
          <div className="lead-task-summary"><Skeleton className="h-24 w-full" /></div>
        ) : (
          renderTaskSummary()
        )}

        {canManage && <div className="actions lead-run-actions">
          <Button
            id="startB2BAutomationBtn"
            onClick={handleStartAutomation}
            disabled={!activeTask || running}
          >
            {activeTask && Number(activeTask.automationCursor || 0) > 0 ? "继续自动搜索" : "开始自动搜索"}
          </Button>
          <Button
            id="cancelB2BAutomationBtn"
            variant="destructive"
            onClick={handleCancelAutomation}
            disabled={!running || Boolean(activeTask?.cancelRequested)}
          >
            停止搜索
          </Button>
          <Button
            id="deleteB2BTaskBtn"
            variant="ghost"
            onClick={handleDeleteTask}
            disabled={!activeTask || running}
          >
            删除任务
          </Button>
        </div>}

        <details className="lead-advanced">
          <summary>高级：查看或调整搜索策略</summary>
          <div className="lead-query-editor">
            <label>搜索关键词（每行一条）</label>
            <textarea
              ref={queryEditorRef}
              id="leadQueryEditor"
              rows={10}
              value={queryText}
              readOnly={!canManage}
              onChange={canManage ? (e) => setQueryText(e.target.value) : undefined}
            />
          </div>
          {canManage && <div className="actions">
            <Button
              variant="outline"
              id="saveLeadQueriesBtn"
              onClick={() => handleSaveQueries(false)}
              disabled={!activeTask || running || savingQueries}
            >
              {savingQueries ? "保存中…" : "保存策略"}
            </Button>
            <Button
              variant="outline"
              id="regenerateLeadQueriesBtn"
              onClick={() => handleSaveQueries(true)}
              disabled={!activeTask || running || savingQueries}
            >
              重新生成
            </Button>
          </div>}
        </details>
      </section>

      {/* Manual Import Section */}
      {canManage && <details className="lead-capture">
        <summary>可选：手动补充公开线索</summary>
        <form
          className="lead-import-form"
          onSubmit={(e) => { e.preventDefault(); handleImportB2BLeads(); }}
        >
          <label>
            选择 CSV / JSON 文件
            <input
              id="leadImportFile"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
          </label>
          <label>
            或粘贴 CSV / JSON
            <textarea
              id="leadImportText"
              rows={6}
              placeholder="CSV 表头建议：company,email,website,country,targetSegment,source,sourceType,fitNote"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
          </label>
          <p className="form-note">
            自动流程是默认入口。此处仅用于补充已人工核实的公开线索；不得填写猜测邮箱，每条线索应包含公开 source URL。
          </p>
          <div className="actions">
            <Button type="submit" disabled={importing || !activeTask}>
              {importing ? "导入中…" : "导入原始线索"}
            </Button>
            <Button
              type="button"
              id="cleanLeadTaskBtn"
              variant="outline"
              onClick={handleCleanLeads}
              disabled={cleaning || !activeTask}
            >
              {cleaning ? "验证中…" : "执行去重、验证与评分"}
            </Button>
          </div>
        </form>
      </details>}

      {/* Results Section */}
      <section className="lead-pool-section">
        <div className="lead-results-head">
          <div>
            <h2>搜索结果</h2>
            <p id="leadPoolInfo" className="meta">
              {activeTask
                ? `当前显示 ${leads.length} 条结果；默认仅展示通过业务匹配、来源邮箱复核和域名检查的线索。`
                : "完成产品联想并启动任务后，结果会显示在这里。"}
            </p>
          </div>
          {canManage && <div className="actions">
            <Button
              id="importSelectedB2BLeadsBtn"
              onClick={() => handleImportToCustomers(false)}
              disabled={converting || selectedLeadIds.size === 0}
            >
              {selectedLeadIds.size ? `导入选中客户（${selectedLeadIds.size}）` : "导入选中客户"}
            </Button>
            <Button
              id="importAllB2BLeadsBtn"
              variant="outline"
              onClick={() => handleImportToCustomers(true)}
              disabled={converting || !activeTask}
            >
              {converting ? "正在转入客户…" : "转入本任务全部高匹配线索"}
            </Button>
          </div>}
        </div>

        {renderLeadSummaryCards()}
        <p className="meta" role="note">质量门槛：官网公开邮箱、域名收信检查、无已知退信/退订禁发记录、产品及买家身份匹配、目标国家匹配。无联系方式和待核验记录不会进入合格结果，也不能转入客户。历史或超过 6 小时的核验需重新执行验证与评分；上述检查不等于实际投递成功。</p>
        {canManage && <Button variant="outline" disabled={cleaning || converting || !activeTask} onClick={handleCleanLeads}>{cleaning ? "正在核验联系方式…" : "重新验证本任务联系方式"}</Button>}

        {leadsLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            {renderFilters()}
            {renderLeadTable()}
          </>
        )}

        {/* Export Panel */}
        <details className="lead-advanced lead-export-panel">
          <summary>导出与审计文件</summary>
          <div className="actions lead-export-actions">
            {["all", "ready", "review", "removed", "duplicates"].map((type) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => handleExport(type)}
                disabled={!activeTask}
              >
                {type === "all" ? "全部线索" :
                 type === "ready" ? "通过联系前检查" :
                 type === "review" ? "待人工核验" :
                 type === "removed" ? "建议剔除" : "重复线索"} CSV
              </Button>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
