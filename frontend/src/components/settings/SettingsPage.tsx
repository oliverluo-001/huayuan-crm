import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, KeyRound, Plus, Trash2, TestTube, RefreshCw, Loader2, Download, Database, Ban, Clock, Edit, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  smtpConfigurationHint,
  validateSmtpProfileDraft,
} from "@/contracts/smtp-profile";
import { QuoteOutputSettings } from "./QuoteOutputSettings";
import {
  getSmtpProfile,
  getImapProfile,
  getAiProfile,
  getSearchProfiles,
  saveSmtpProfile,
  testSmtpProfile,
  saveImapProfile,
  testImapProfile,
  checkMailboxBounces,
  changePassword,
  saveAiProfile,
  testAiProfile,
  createSearchProfile,
  testSearchProfile,
  deleteSearchProfile,
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
  approveUser,
  rejectUser,
  getAccount,
  updateAccount,
  getBackupData,
  createBackup,
  saveBackupSettings,
  verifyBackup,
  drillBackup,
  restoreBackup,
  getEmailPolicy,
  saveEmailPolicy,
  getSuppressions,
  addSuppression,
  deleteSuppression,
  getAuditLogs,
  getTrashItems,
  restoreTrashItem,
  deleteTrashItem,
  type SearchProfile,
  type AiProfile,
  type User,
  type EmailPolicy,
  type SuppressionEntry,
  type BackupSettings,
  type Backup,
  type AuditEntry,
} from "@/api/client";

export function SettingsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [isLoading, setIsLoading] = useState(true);

  const [smtpForm, setSmtpForm] = useState<{
    smtpProvider: "qq" | "163" | "126" | "gmail" | "outlook" | "custom";
    smtpHost: string;
    smtpPort: string;
    smtpSecure: boolean;
    smtpUser: string;
    smtpFrom: string;
    smtpPass: string;
    credentialStatus?: "saved" | "reentry_required" | "not_set";
  }>({
    smtpProvider: "custom",
    smtpHost: "",
    smtpPort: "465",
    smtpSecure: true,
    smtpUser: "",
    smtpFrom: "",
    smtpPass: "",
  });

  const [imapForm, setImapForm] = useState({
    imapEnabled: false,
    imapHost: "",
    imapPort: "993",
    imapSecure: true,
    imapUser: "",
    imapPass: "",
    imapMailbox: "INBOX",
    imapScanLimit: "50",
    imapUseSmtpCredentials: false,
    credentialStatus: undefined as "saved" | "reentry_required" | "not_set" | undefined,
    imapLastCheckedAt: "",
    imapLastCheckStatus: undefined as "ok" | "error" | undefined,
    imapLastCheckMessage: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [aiProfileForm, setAiProfileForm] = useState({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-v4-flash",
    apiKey: "",
    enabled: true,
  });
  const [aiProfileHint, setAiProfileHint] = useState("");
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [searchForm, setSearchForm] = useState({
    id: "",
    name: "",
    provider: "brave-search" as SearchProfile["provider"],
    apiUrl: "https://api.search.brave.com/res/v1/web/search",
    apiKey: "",
  });
  const [aiTesting, setAiTesting] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestFeedback, setSmtpTestFeedback] = useState<{
    type: "testing" | "success" | "error";
    message: string;
  } | null>(null);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapChecking, setImapChecking] = useState(false);
  const [imapFeedback, setImapFeedback] = useState<{
    type: "testing" | "success" | "error";
    message: string;
  } | null>(null);
  const [searchTestingId, setSearchTestingId] = useState<string | null>(null);

  // Email policy
  const [emailPolicy, setEmailPolicy] = useState<EmailPolicy>({
    maxPerHour: 40, maxPerDay: 200, minDelaySeconds: 20,
    workdayStart: 8, workdayEnd: 18, enforceTimezone: true, allowWeekends: false,
  });

  // Suppression list
  const [suppressions, setSuppressions] = useState<SuppressionEntry[]>([]);
  const [suppressionForm, setSuppressionForm] = useState({ email: "", reason: "" });

  // Backup
  const [backupSettings, setBackupSettings] = useState<BackupSettings>({ enabled: true, intervalHours: 24, retentionDays: 30 });
  const [backups, setBackups] = useState<Backup[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);

  // Team users
  const [users, setUsers] = useState<User[]>([]);
  const [userForm, setUserForm] = useState({ username: "", displayName: "", email: "", role: "sales", password: "" });
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userEditForm, setUserEditForm] = useState({ displayName: "", email: "", role: "sales", active: true });

  // Audit & Trash
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [trashItems, setTrashItems] = useState<any[]>([]);

  const [accountInfo, setAccountInfo] = useState<User | null>(null);
  const [accountForm, setAccountForm] = useState({ displayName: "", email: "" });

  const applySmtpProfile = (smtpProfile: Awaited<ReturnType<typeof getSmtpProfile>> | null) => {
    if (!smtpProfile) return;
    setSmtpForm({
      smtpProvider: smtpProfile.smtpProvider || "custom",
      smtpHost: smtpProfile.smtpHost || "",
      smtpPort: smtpProfile.smtpPort?.toString() || "465",
      smtpSecure: smtpProfile.smtpSecure ?? true,
      smtpUser: smtpProfile.smtpUser || "",
      smtpFrom: smtpProfile.smtpFrom || "",
      smtpPass: "",
      credentialStatus: smtpProfile.credentialStatus || "not_set",
    });
  };

  const applyImapProfile = (imapProfile: Awaited<ReturnType<typeof getImapProfile>> | null) => {
    if (!imapProfile) return;
    setImapForm({
      imapEnabled: imapProfile.imapEnabled ?? false,
      imapHost: imapProfile.imapHost || "",
      imapPort: imapProfile.imapPort?.toString() || "993",
      imapSecure: imapProfile.imapSecure ?? true,
      imapUser: imapProfile.imapUser || "",
      imapPass: "",
      imapMailbox: imapProfile.imapMailbox || "INBOX",
      imapScanLimit: imapProfile.imapScanLimit?.toString() || "50",
      imapUseSmtpCredentials: imapProfile.imapUseSmtpCredentials ?? false,
      credentialStatus: imapProfile.credentialStatus || "not_set",
      imapLastCheckedAt: imapProfile.imapLastCheckedAt || "",
      imapLastCheckStatus: imapProfile.imapLastCheckStatus,
      imapLastCheckMessage: imapProfile.imapLastCheckMessage || "",
    });
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [smtpProfile, imapProfile] = await Promise.all([
        getSmtpProfile(), getImapProfile(),
      ]);
      applySmtpProfile(smtpProfile);
      applyImapProfile(imapProfile);
      if (!isAdmin) return;
      const [aiProfile, profiles] = await Promise.all([getAiProfile(), getSearchProfiles()]);
      // AI Profile
      if (aiProfile) {
        setAiProfileForm({
          provider: aiProfile.provider || "deepseek",
          baseUrl: aiProfile.baseUrl || "https://api.deepseek.com/v1",
          model: aiProfile.model || "deepseek-v4-flash",
          apiKey: "",
          enabled: aiProfile.enabled ?? true,
        });
        setAiProfileHint(
          aiProfile.credentialStatus === "reentry_required"
            ? "当前部署环境无法读取原有加密密钥，请重新输入并保存。"
            : aiProfile.credentialStatus === "saved"
              ? "密钥已安全保存。留空保存时会继续使用该密钥。"
              : "未配置密钥时，获客任务将使用内置的行业和买家类型规则。"
        );
      }
      // Search profiles
      setSearchProfiles(profiles);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);


  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSmtpProfile({
        smtpProvider: smtpForm.smtpProvider,
        smtpHost: smtpForm.smtpHost,
        smtpPort: parseInt(smtpForm.smtpPort),
        smtpSecure: smtpForm.smtpSecure,
        smtpUser: smtpForm.smtpUser,
        smtpFrom: smtpForm.smtpFrom,
        pass: smtpForm.smtpPass || undefined,
      } as any);
      toast.success("SMTP 配置已保存");
      setSmtpTestFeedback({
        type: "success",
        message: "配置已保存，但尚未验证连接。请点击“保存并测试连接”。",
      });
      setSmtpForm((current) => ({
        ...current,
        smtpPass: "",
        credentialStatus: "saved",
      }));
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleTestSmtp = async () => {
    const validationError = validateSmtpProfileDraft(smtpForm);
    if (validationError) {
      setSmtpTestFeedback({ type: "error", message: validationError });
      toast.error(validationError);
      return;
    }
    setSmtpTesting(true);
    setSmtpTestFeedback({
      type: "testing",
      message: "正在保存配置并连接 SMTP 服务器，请稍候（最长约 15 秒）...",
    });
    try {
      await saveSmtpProfile({
        smtpProvider: smtpForm.smtpProvider,
        smtpHost: smtpForm.smtpHost,
        smtpPort: parseInt(smtpForm.smtpPort),
        smtpSecure: smtpForm.smtpSecure,
        smtpUser: smtpForm.smtpUser,
        smtpFrom: smtpForm.smtpFrom,
        pass: smtpForm.smtpPass || undefined,
      } as any);
      const result = await testSmtpProfile();
      const successMessage = result.message || "SMTP 连接测试成功";
      toast.success(successMessage);
      setSmtpTestFeedback({ type: "success", message: successMessage });
      setSmtpForm((current) => ({
        ...current,
        smtpPass: "",
        credentialStatus: "saved",
      }));
    } catch (error) {
      setSmtpTestFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "SMTP 连接测试失败，请核对服务器、端口和授权码",
      });
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleSaveImap = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveImapProfile({
        imapEnabled: imapForm.imapEnabled,
        imapHost: imapForm.imapHost,
        imapPort: parseInt(imapForm.imapPort),
        imapSecure: imapForm.imapSecure,
        imapUser: imapForm.imapUser,
        pass: imapForm.imapPass || undefined,
        imapMailbox: imapForm.imapMailbox,
        imapScanLimit: parseInt(imapForm.imapScanLimit),
        imapUseSmtpCredentials: imapForm.imapUseSmtpCredentials,
      });
      toast.success("IMAP 配置已保存");
      setImapForm((current) => ({
        ...current,
        imapPass: "",
        credentialStatus: current.imapUseSmtpCredentials ? current.credentialStatus : "saved",
      }));
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleTestImap = async () => {
    if (!imapForm.imapEnabled) {
      toast.error("请先启用 IMAP 收信");
      return;
    }
    setImapTesting(true);
    setImapFeedback({ type: "testing", message: "正在保存配置并连接 IMAP 服务器，请稍候（最长约 15 秒）..." });
    try {
      await saveImapProfile({
        imapEnabled: imapForm.imapEnabled,
        imapHost: imapForm.imapHost,
        imapPort: parseInt(imapForm.imapPort),
        imapSecure: imapForm.imapSecure,
        imapUser: imapForm.imapUser,
        pass: imapForm.imapPass || undefined,
        imapMailbox: imapForm.imapMailbox,
        imapScanLimit: parseInt(imapForm.imapScanLimit),
        imapUseSmtpCredentials: imapForm.imapUseSmtpCredentials,
      });
      const result = await testImapProfile();
      const message = result.message || "IMAP 连接测试成功";
      toast.success(message);
      setImapFeedback({ type: "success", message });
      setImapForm((current) => ({ ...current, imapPass: "", credentialStatus: "saved" }));
      fetchData();
    } catch (error) {
      setImapFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "IMAP 连接测试失败，请核对服务器、端口和授权码",
      });
    } finally {
      setImapTesting(false);
    }
  };

  const handleCheckBounces = async () => {
    setImapChecking(true);
    setImapFeedback({ type: "testing", message: "正在检查收件箱退信..." });
    try {
      const result = await checkMailboxBounces();
      const message = result.message || `已检查 ${result.checked} 封邮件，识别退信 ${result.bounced} 封`;
      toast.success(message);
      setImapFeedback({ type: "success", message });
      fetchData();
    } catch (error) {
      setImapFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "退信检查失败，请先测试 IMAP 连接",
      });
    } finally {
      setImapChecking(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("新密码长度至少为8位");
      return;
    }
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      toast.success("密码修改成功");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      // Error handled by API client
    }
  };

  const handleSaveAiProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveAiProfile({
        provider: aiProfileForm.provider as AiProfile["provider"],
        baseUrl: aiProfileForm.baseUrl,
        model: aiProfileForm.model,
        apiKey: aiProfileForm.apiKey,
        enabled: aiProfileForm.enabled,
      });
      toast.success("AI 辅助获客配置已安全保存");
      setAiProfileForm((prev) => ({ ...prev, apiKey: "" }));
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleTestAiProfile = async () => {
    if (aiProfileForm.apiKey.trim()) {
      await saveAiProfile({
        provider: aiProfileForm.provider as AiProfile["provider"],
        baseUrl: aiProfileForm.baseUrl,
        model: aiProfileForm.model,
        apiKey: aiProfileForm.apiKey,
        enabled: aiProfileForm.enabled,
      });
      setAiProfileForm((prev) => ({ ...prev, apiKey: "" }));
    }
    setAiTesting(true);
    try {
      await testAiProfile();
      toast.success("AI 连接测试成功");
    } catch {
      // Error handled by API client
    } finally {
      setAiTesting(false);
    }
  };

  const handleSaveSearchProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSearchProfile({
        id: searchForm.id || undefined,
        name: searchForm.name,
        provider: searchForm.provider,
        apiUrl: searchForm.apiUrl,
        apiKey: searchForm.apiKey,
      });
      toast.success("搜索数据源及密钥已安全保存");
      setSearchForm({
        id: "",
        name: "",
        provider: "brave-search",
        apiUrl: "https://api.search.brave.com/res/v1/web/search",
        apiKey: "",
      });
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleTestSearchProfile = async (id: string) => {
    setSearchTestingId(id);
    try {
      const result = await testSearchProfile(id);
      toast.success(`搜索源连接成功，测试返回 ${(result as any).count || 0} 条结果`);
    } catch {
      // Error handled by API client
    } finally {
      setSearchTestingId(null);
    }
  };

  const handleDeleteSearchProfile = async (id: string) => {
    if (!confirm("确认删除这个搜索数据源？")) return;
    try {
      await deleteSearchProfile(id);
      toast.success("搜索数据源已删除");
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleEditSearchProfile = (profile: SearchProfile) => {
    setSearchForm({
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
      apiUrl: profile.apiUrl,
      apiKey: "",
    });
  };

  // Email policy handlers
  const fetchEmailPolicy = useCallback(async () => {
    try { const data = await getEmailPolicy(); if (data) setEmailPolicy(data); } catch {}
  }, []);
  const handleSaveEmailPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await saveEmailPolicy(emailPolicy); toast.success("发送策略已保存"); } catch {}
  };

  // Suppression handlers
  const fetchSuppressions = useCallback(async () => {
    try { setSuppressions(await getSuppressions()); } catch {}
  }, []);
  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addSuppression(suppressionForm);
      setSuppressionForm({ email: "", reason: "" });
      toast.success("已加入禁止名单");
      fetchSuppressions();
    } catch {}
  };
  const handleDeleteSuppression = async (id: string) => {
    if (!confirm("确认从名单中移除此邮箱？")) return;
    try { await deleteSuppression(id); fetchSuppressions(); } catch {}
  };

  // Backup handlers
  const fetchBackups = useCallback(async () => {
    try {
      const data = await getBackupData();
      setBackupSettings(data.settings);
      setBackups(data.backups);
    } catch {}
  }, []);
  const handleSaveBackupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await saveBackupSettings(backupSettings); toast.success("备份策略已保存"); } catch {}
  };
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try { await createBackup(); toast.success("备份已创建"); fetchBackups(); } finally { setCreatingBackup(false); }
  };

  // Team user handlers
  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      setUsers([]);
      return;
    }
    try { setUsers(await getUsers()); } catch {}
  }, [isAdmin]);

  const fetchAccount = useCallback(async () => {
    try {
      const account = await getAccount();
      setAccountInfo(account);
      setAccountForm({
        displayName: account.displayName || "",
        email: account.email || "",
      });
    } catch {}
  }, []);
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(userForm);
      setUserForm({ username: "", displayName: "", email: "", role: "sales", password: "" });
      toast.success("团队账号已创建");
      fetchUsers();
    } catch {}
  };
  const handleResetPassword = async (userId: string) => {
    if (!resetPasswordValue || !confirm("确认重置此账号密码？")) return;
    try { await resetUserPassword(userId, resetPasswordValue); toast.success("密码已重置"); setResetPasswordFor(null); setResetPasswordValue(""); } catch {}
  };

  const handleEditUser = async (userId: string) => {
    try {
      await updateUser(userId, userEditForm as Partial<User>);
      toast.success("账号信息已更新");
      setEditingUserId(null);
      fetchUsers();
    } catch {}
  };
  const handleVerifyBackup = async (id: string) => {
    const result = await verifyBackup(id);
    toast.success(`备份校验通过：${result.tableCount} 个数据表，${result.rowCount} 条记录`);
  };
  const handleDrillBackup = async (id: string) => {
    const result = await drillBackup(id);
    toast.success(`恢复演练通过：临时恢复 ${result.restoredRows} 条记录，生产数据未修改`);
  };
  const handleRestoreBackup = async (id: string) => {
    const confirmation = prompt("恢复会用备份覆盖当前业务数据。系统将先自动创建回滚备份。请输入 RESTORE 继续：");
    if (confirmation !== "RESTORE") return;
    setRestoringBackupId(id);
    try {
      const result = await restoreBackup(id);
      toast.success(`数据库恢复完成；回滚备份：${result.rollbackBackupId}`);
      fetchBackups();
    } finally {
      setRestoringBackupId(null);
    }
  };

  const handleApproveUser = async (userId: string) => {
    try {
      await approveUser(userId);
      toast.success("注册申请已批准");
      fetchUsers();
    } catch {}
  };

  const handleRejectUser = async (userId: string) => {
    if (!confirm("确认拒绝此注册申请？")) return;
    try {
      await rejectUser(userId);
      toast.success("注册申请已拒绝");
      fetchUsers();
    } catch {}
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const account = await updateAccount(accountForm);
      setAccountInfo(account);
      toast.success("个人资料已更新");
    } catch {}
  };

  // Audit & Trash handlers
  const fetchAuditLogs = useCallback(async () => {
    try { setAuditLogs((await getAuditLogs()).items); } catch {}
  }, []);
  const fetchTrash = useCallback(async () => {
    try { setTrashItems(await getTrashItems()); } catch {}
  }, []);
  const handleRestoreTrash = async (id: string) => {
    try { await restoreTrashItem(id); toast.success("已恢复"); fetchTrash(); } catch {}
  };
  const handleDeleteTrash = async (id: string) => {
    if (!confirm("确认永久删除？")) return;
    try { await deleteTrashItem(id); fetchTrash(); } catch {}
  };

  const applySearchProviderPreset = (provider: SearchProfile["provider"]) => {
    const presets: Record<string, string> = {
      serper: "https://google.serper.dev/search",
      "brave-search": "https://api.search.brave.com/res/v1/web/search",
      serpapi: "https://serpapi.com/search.json",
      "generic-json": "",
    };
    const url = presets[provider] || "";
    setSearchForm((prev) => ({ ...prev, provider, apiUrl: url || prev.apiUrl }));
  };

  useEffect(() => {
    const accountRequest = fetchAccount();
    if (isAdmin) {
      fetchData();
      fetchEmailPolicy();
      fetchSuppressions();
      fetchBackups();
      fetchUsers();
      fetchAuditLogs();
      fetchTrash();
    } else if (role === "sales") {
      void Promise.all([
        accountRequest,
        fetchData(),
      ]).finally(() => setIsLoading(false));
    } else {
      void accountRequest.finally(() => setIsLoading(false));
    }
  }, [role, isAdmin, fetchData, fetchEmailPolicy, fetchSuppressions, fetchBackups, fetchAccount, fetchUsers, fetchAuditLogs, fetchTrash]);

  return (
    <div className="space-y-8">

      {/* ===== 数据与接口 ===== */}
      <div hidden={!isAdmin}>
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-semibold">数据与接口</h2>
          <div className="flex-1 h-px bg-border" />
        </div>
        <div className="space-y-6">
          {/* AI Profile */}
          <Card>
            <CardHeader>
              <CardTitle>AI 辅助获客</CardTitle>
              <CardDescription>
                配置 AI 接口用于产品联想和买家识别。密钥会加密保存。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveAiProfile} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>AI 服务商</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={aiProfileForm.provider}
                      onChange={(e) => setAiProfileForm({ ...aiProfileForm, provider: e.target.value })}
                    >
                      <option value="deepseek">DeepSeek</option>
                      <option value="openai-compatible">OpenAI 兼容</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>API 地址 *</Label>
                    <Input
                      type="text"
                      placeholder="https://api.deepseek.com/v1"
                      value={aiProfileForm.baseUrl}
                      onChange={(e) => setAiProfileForm({ ...aiProfileForm, baseUrl: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>模型 *</Label>
                    <Input
                      type="text"
                      placeholder="deepseek-v4-flash"
                      value={aiProfileForm.model}
                      onChange={(e) => setAiProfileForm({ ...aiProfileForm, model: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>API 密钥</Label>
                    <Input
                      type="password"
                      placeholder="留空则保留已有密钥"
                      value={aiProfileForm.apiKey}
                      onChange={(e) => setAiProfileForm({ ...aiProfileForm, apiKey: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 pt-6">
                      <input
                        type="checkbox"
                        id="aiEnabled"
                        checked={aiProfileForm.enabled}
                        onChange={(e) => setAiProfileForm({ ...aiProfileForm, enabled: e.target.checked })}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="aiEnabled" className="cursor-pointer">启用 AI</Label>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{aiProfileHint}</p>
                <div className="flex gap-2">
                  <Button type="submit">
                    <Save className="mr-2 h-4 w-4" />
                    保存 AI 获客配置
                  </Button>
                  <Button type="button" variant="outline" onClick={handleTestAiProfile} disabled={aiTesting}>
                    {aiTesting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="mr-2 h-4 w-4" />
                    )}
                    测试连接
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Search Profiles */}
          <Card>
            <CardHeader>
              <CardTitle>搜索数据源</CardTitle>
              <CardDescription>
                配置专业搜索接口，供自动获客任务查找潜在客户企业。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Search status */}
              <div className="rounded-lg border p-4 text-sm space-y-1">
                {searchProfiles.filter((p) => p.apiKeySet !== false).length > 0 ? (
                  <>
                    <strong>自动获客搜索：已连接专业搜索接口</strong>
                    <p className="text-muted-foreground">
                      已配置搜索 API。任务优先使用配置的数据源，失败时降级到其他来源。
                    </p>
                  </>
                ) : searchProfiles.length > 0 ? (
                  <>
                    <strong>自动获客搜索：请重新保存 API 密钥</strong>
                    <p className="text-muted-foreground">
                      当前部署环境无法读取原有加密密钥。请编辑对应数据源，重新输入并保存。
                    </p>
                  </>
                ) : (
                  <>
                    <strong>自动获客搜索：使用多来源企业发现与官网深度爬取</strong>
                    <p className="text-muted-foreground">
                      无需密钥也可按地区和下游行业发现企业官网、提取公开联系方式并验证邮箱；专业接口仅用于扩大覆盖。
                    </p>
                  </>
                )}
              </div>

              {/* Search profile form */}
              <form onSubmit={handleSaveSearchProfile} className="space-y-4 border rounded-lg p-4">
                <h4 className="font-medium text-sm">{searchForm.id ? "编辑数据源" : "新增数据源"}</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>名称 *</Label>
                    <Input
                      placeholder="我的搜索源"
                      value={searchForm.name}
                      onChange={(e) => setSearchForm({ ...searchForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>提供商</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={searchForm.provider}
                      onChange={(e) => applySearchProviderPreset(e.target.value as SearchProfile["provider"])}
                    >
                      <option value="brave-search">Brave Search</option>
                      <option value="serper">Serper</option>
                      <option value="serpapi">SerpApi</option>
                      <option value="generic-json">通用 JSON</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>API 地址 *</Label>
                    <Input
                      placeholder="https://api.search.brave.com/res/v1/web/search"
                      value={searchForm.apiUrl}
                      onChange={(e) => setSearchForm({ ...searchForm, apiUrl: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>API 密钥</Label>
                    <Input
                      type="password"
                      placeholder="留空则保留已有密钥"
                      value={searchForm.apiKey}
                      onChange={(e) => setSearchForm({ ...searchForm, apiKey: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="submit">
                  <Plus className="mr-2 h-4 w-4" />
                  {searchForm.id ? "保存修改" : "新增数据源"}
                </Button>
                {searchForm.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setSearchForm({
                        id: "",
                        name: "",
                        provider: "brave-search",
                        apiUrl: "https://api.search.brave.com/res/v1/web/search",
                        apiKey: "",
                      })
                    }
                  >
                    取消编辑
                  </Button>
                )}
              </form>

              {/* Search profile list */}
              {searchProfiles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  尚未配置专业搜索接口。系统将自动组合 Wikidata、公开行业/展商目录、Common Crawl 企业域名索引和官网深度爬取；单一来源不可用时会跳过并继续其他来源。
                </p>
              ) : (
                <div className="space-y-2">
                  {searchProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{profile.name || "搜索数据源"}</span>
                          <Badge variant="outline" className="text-xs">
                            {({ serper: "Serper", "brave-search": "Brave Search", serpapi: "SerpApi", "generic-json": "通用 JSON" } as Record<string, string>)[profile.provider] || profile.provider}
                          </Badge>
                          <span className={`h-2 w-2 rounded-full ${profile.apiKeySet !== false ? "bg-green-500" : "bg-yellow-500"}`} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-md">{profile.apiUrl}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-4">
                        <span className="text-xs text-muted-foreground mr-2">
                          {profile.apiKeySet !== false ? "密钥已保存" : "密钥失效"}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => handleEditSearchProfile(profile)}>
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestSearchProfile(profile.id)}
                          disabled={searchTestingId === profile.id}
                        >
                          {searchTestingId === profile.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "测试"
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleDeleteSearchProfile(profile.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== 系统与安全 ===== */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-semibold">系统与安全</h2>
          <div className="flex-1 h-px bg-border" />
        </div>
        <div className="space-y-6">
          {/* 账户信息 */}
          <Card>
            <CardHeader>
              <CardTitle>账户信息</CardTitle>
              <CardDescription>维护当前登录账户的个人资料</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ) : accountInfo ? (
                <form onSubmit={handleSaveAccount} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>用户名</Label>
                      <Input value={accountInfo.username} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>角色</Label>
                      <Input
                        value={({ admin: "超级管理员", sales: "销售", viewer: "只读" } as Record<string, string>)[accountInfo.role] || accountInfo.role}
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>显示名称</Label>
                      <Input
                        value={accountForm.displayName}
                        onChange={(e) => setAccountForm({ ...accountForm, displayName: e.target.value })}
                        maxLength={80}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>工作邮箱</Label>
                      <Input
                        type="email"
                        value={accountForm.email}
                        onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                        maxLength={190}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-muted-foreground">
                      创建时间：{accountInfo.createdAt ? new Date(accountInfo.createdAt).toLocaleString() : "-"}
                    </p>
                    <Button type="submit">
                      <Save className="mr-2 h-4 w-4" />
                      保存个人资料
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-muted-foreground">无法获取账户信息</p>
              )}
            </CardContent>
          </Card>

          {/* SMTP Settings */}
          <Card hidden={role === "viewer"}>
            <CardHeader>
              <CardTitle>个人邮箱 SMTP 发信配置</CardTitle>
              <CardDescription>
                当前账号独立使用此邮箱发送邮件。授权码会加密保存，其他销售账号无法查看或使用。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSmtp} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>SMTP 服务器 *</Label>
                    <Input
                      type="text"
                      placeholder="smtp.example.com"
                      value={smtpForm.smtpHost}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpHost: e.target.value })}
                      required
                    />
                    {smtpConfigurationHint(smtpForm) && (
                      <p className="text-xs text-amber-700">
                        {smtpConfigurationHint(smtpForm)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>端口 *</Label>
                    <Input
                      type="number"
                      value={smtpForm.smtpPort}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpPort: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>安全连接</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={smtpForm.smtpSecure ? "true" : "false"}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpSecure: e.target.value === "true" })}
                    >
                      <option value="true">SSL/TLS（通常端口 465）</option>
                      <option value="false">STARTTLS（通常端口 587）</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>用户名 *</Label>
                    <Input
                      type="text"
                      value={smtpForm.smtpUser}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpUser: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>密码 / SMTP 授权码</Label>
                    <Input
                      type="password"
                      placeholder={smtpForm.credentialStatus === "saved" ? "已保存，留空则不修改" : "输入邮箱密码"}
                      value={smtpForm.smtpPass}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpPass: e.target.value })}
                    />
                    {smtpForm.credentialStatus === "saved" && (
                      <p className="text-xs text-muted-foreground">密码已加密保存。留空保存时继续使用已有密码。</p>
                    )}
                    {smtpForm.credentialStatus === "reentry_required" && (
                      <p className="text-xs text-amber-500">当前部署环境无法读取原有加密密码，请重新输入并保存。</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      QQ、163、126、Gmail 和部分企业邮箱通常需要填写 SMTP 授权码或应用专用密码，不是网页登录密码。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>发件人地址 *</Label>
                    <Input
                      type="email"
                      placeholder="noreply@example.com"
                      value={smtpForm.smtpFrom}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpFrom: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">
                    <Save className="mr-2 h-4 w-4" />
                    保存 SMTP 配置
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestSmtp}
                    disabled={smtpTesting}
                  >
                    {smtpTesting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="mr-2 h-4 w-4" />
                    )}
                    {smtpTesting ? "正在连接..." : "保存并测试连接"}
                  </Button>
                </div>
                {smtpTestFeedback && (
                  <div
                    role="status"
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      smtpTestFeedback.type === "success"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : smtpTestFeedback.type === "error"
                          ? "border-red-300 bg-red-50 text-red-800"
                          : "border-blue-300 bg-blue-50 text-blue-800"
                    }`}
                  >
                    {smtpTestFeedback.message}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* IMAP Settings */}
          <Card hidden={role === "viewer"}>
            <CardHeader>
              <CardTitle>个人邮箱 IMAP 收信监控</CardTitle>
              <CardDescription>
                当前账号独立监控自己的收件箱，用于识别退信和发送失败回执。授权码会加密保存。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveImap} className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="imapEnabled"
                    checked={imapForm.imapEnabled}
                    onChange={(e) => setImapForm({ ...imapForm, imapEnabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="imapEnabled" className="cursor-pointer">启用 IMAP 收信</Label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>IMAP 服务器 *</Label>
                    <Input
                      type="text"
                      placeholder="imap.example.com"
                      value={imapForm.imapHost}
                      onChange={(e) => setImapForm({ ...imapForm, imapHost: e.target.value })}
                      disabled={!imapForm.imapEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>端口 *</Label>
                    <Input
                      type="number"
                      value={imapForm.imapPort}
                      onChange={(e) => setImapForm({ ...imapForm, imapPort: e.target.value })}
                      disabled={!imapForm.imapEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>安全连接</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={imapForm.imapSecure ? "true" : "false"}
                      onChange={(e) => setImapForm({ ...imapForm, imapSecure: e.target.value === "true" })}
                      disabled={!imapForm.imapEnabled}
                    >
                      <option value="true">TLS</option>
                      <option value="false">无加密</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>用户名 *</Label>
                    <Input
                      type="text"
                      value={imapForm.imapUser}
                      onChange={(e) => setImapForm({ ...imapForm, imapUser: e.target.value })}
                      disabled={!imapForm.imapEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>密码 / IMAP 授权码</Label>
                    <Input
                      type="password"
                      placeholder={imapForm.credentialStatus === "saved" ? "已保存，留空则不修改" : "输入邮箱密码"}
                      value={imapForm.imapPass}
                      onChange={(e) => setImapForm({ ...imapForm, imapPass: e.target.value })}
                      disabled={!imapForm.imapEnabled || imapForm.imapUseSmtpCredentials}
                    />
                    {imapForm.imapUseSmtpCredentials ? (
                      <p className="text-xs text-muted-foreground">当前使用已保存的 SMTP 授权码。</p>
                    ) : imapForm.credentialStatus === "saved" ? (
                      <p className="text-xs text-muted-foreground">密码已加密保存。留空保存时继续使用已有密码。</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>邮箱目录</Label>
                    <Input
                      type="text"
                      value={imapForm.imapMailbox}
                      onChange={(e) => setImapForm({ ...imapForm, imapMailbox: e.target.value })}
                      disabled={!imapForm.imapEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>扫描数量</Label>
                    <Input
                      type="number"
                      value={imapForm.imapScanLimit}
                      onChange={(e) => setImapForm({ ...imapForm, imapScanLimit: e.target.value })}
                      disabled={!imapForm.imapEnabled}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="imapUseSmtpCredentials"
                    checked={imapForm.imapUseSmtpCredentials}
                    onChange={(e) => setImapForm({ ...imapForm, imapUseSmtpCredentials: e.target.checked })}
                    className="h-4 w-4"
                    disabled={!imapForm.imapEnabled}
                  />
                  <Label htmlFor="imapUseSmtpCredentials" className="cursor-pointer">使用 SMTP 凭证</Label>
                </div>
                {imapForm.imapLastCheckedAt && (
                  <p className={`text-xs ${imapForm.imapLastCheckStatus === "error" ? "text-red-600" : "text-muted-foreground"}`}>
                    最近检查：{new Date(imapForm.imapLastCheckedAt).toLocaleString()}；{imapForm.imapLastCheckMessage || "无结果"}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!imapForm.imapEnabled}>
                    <Save className="mr-2 h-4 w-4" />
                    保存 IMAP 配置
                  </Button>
                  <Button type="button" variant="outline" onClick={handleTestImap} disabled={!imapForm.imapEnabled || imapTesting}>
                    {imapTesting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="mr-2 h-4 w-4" />
                    )}
                    {imapTesting ? "正在连接..." : "保存并测试连接"}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCheckBounces} disabled={!imapForm.imapEnabled || imapChecking}>
                    {imapChecking ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {imapChecking ? "正在检查..." : "立即检查退信"}
                  </Button>
                </div>
                {imapFeedback && (
                  <div
                    role="status"
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      imapFeedback.type === "success"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : imapFeedback.type === "error"
                          ? "border-red-300 bg-red-50 text-red-800"
                          : "border-blue-300 bg-blue-50 text-blue-800"
                    }`}
                  >
                    {imapFeedback.message}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <QuoteOutputSettings isAdmin={isAdmin} />

          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle>修改密码</CardTitle>
              <CardDescription>修改当前账户登录密码</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>当前密码 *</Label>
                    <Input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>新密码 *</Label>
                    <Input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>确认新密码 *</Label>
                    <Input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <Button type="submit">
                  <KeyRound className="mr-2 h-4 w-4" />
                  修改密码
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Email Policy */}
          <Card hidden={!isAdmin}>
            <CardHeader>
              <CardTitle>邮件发送策略</CardTitle>
              <CardDescription>配置邮件发送频率限制和工作时间，避免触发反垃圾策略</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveEmailPolicy} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>每小时上限</Label>
                    <Input
                      type="number"
                      value={emailPolicy.maxPerHour}
                      onChange={(e) => setEmailPolicy({ ...emailPolicy, maxPerHour: parseInt(e.target.value) || 0 })}
                      min={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>每日上限</Label>
                    <Input
                      type="number"
                      value={emailPolicy.maxPerDay}
                      onChange={(e) => setEmailPolicy({ ...emailPolicy, maxPerDay: parseInt(e.target.value) || 0 })}
                      min={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>最小间隔（秒）</Label>
                    <Input
                      type="number"
                      value={emailPolicy.minDelaySeconds}
                      onChange={(e) => setEmailPolicy({ ...emailPolicy, minDelaySeconds: parseInt(e.target.value) || 0 })}
                      min={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>工作日开始（时）</Label>
                    <Input
                      type="number"
                      value={emailPolicy.workdayStart}
                      onChange={(e) => setEmailPolicy({ ...emailPolicy, workdayStart: parseInt(e.target.value) || 0 })}
                      min={0}
                      max={23}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>工作日结束（时）</Label>
                    <Input
                      type="number"
                      value={emailPolicy.workdayEnd}
                      onChange={(e) => setEmailPolicy({ ...emailPolicy, workdayEnd: parseInt(e.target.value) || 0 })}
                      min={0}
                      max={23}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enforceTimezone"
                      checked={emailPolicy.enforceTimezone}
                      onChange={(e) => setEmailPolicy({ ...emailPolicy, enforceTimezone: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="enforceTimezone" className="cursor-pointer">强制时区限制</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="allowWeekends"
                      checked={emailPolicy.allowWeekends}
                      onChange={(e) => setEmailPolicy({ ...emailPolicy, allowWeekends: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="allowWeekends" className="cursor-pointer">允许周末发送</Label>
                  </div>
                </div>
                <Button type="submit">
                  <Save className="mr-2 h-4 w-4" />
                  保存发送策略
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Suppression List */}
          <Card hidden={!isAdmin}>
            <CardHeader>
              <CardTitle>禁止名单</CardTitle>
              <CardDescription>管理不接收邮件的邮箱地址</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAddSuppression} className="flex items-end gap-3">
                <div className="space-y-2 flex-1">
                  <Label>邮箱地址 *</Label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={suppressionForm.email}
                    onChange={(e) => setSuppressionForm({ ...suppressionForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2 flex-1">
                  <Label>原因</Label>
                  <Input
                    type="text"
                    placeholder="退信/投诉"
                    value={suppressionForm.reason}
                    onChange={(e) => setSuppressionForm({ ...suppressionForm, reason: e.target.value })}
                  />
                </div>
                <Button type="submit">
                  <Ban className="mr-2 h-4 w-4" />
                  加入名单
                </Button>
              </form>
              {suppressions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无禁止记录</p>
              ) : (
                <div className="space-y-2">
                  {suppressions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex-1">
                        <span className="font-medium text-sm">{s.email}</span>
                        {s.reason && <span className="text-xs text-muted-foreground ml-2">({s.reason})</span>}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDeleteSuppression(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Backup & Restore */}
          <Card hidden={!isAdmin}>
            <CardHeader>
              <CardTitle>数据备份</CardTitle>
              <CardDescription>配置自动备份策略或手动创建备份</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSaveBackupSettings} className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="backupEnabled"
                    checked={backupSettings.enabled}
                    onChange={(e) => setBackupSettings({ ...backupSettings, enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="backupEnabled" className="cursor-pointer">启用自动备份</Label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>备份间隔（小时）</Label>
                    <Input
                      type="number"
                      value={backupSettings.intervalHours}
                      onChange={(e) => setBackupSettings({ ...backupSettings, intervalHours: parseInt(e.target.value) || 0 })}
                      min={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>保留天数</Label>
                    <Input
                      type="number"
                      value={backupSettings.retentionDays}
                      onChange={(e) => setBackupSettings({ ...backupSettings, retentionDays: parseInt(e.target.value) || 0 })}
                      min={1}
                    />
                  </div>
                </div>
                <Button type="submit" variant="outline">
                  <Save className="mr-2 h-4 w-4" />
                  保存备份策略
                </Button>
              </form>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">手动备份</h4>
                  <p className="text-xs text-muted-foreground">立即创建一次完整数据备份</p>
                </div>
                <Button onClick={handleCreateBackup} disabled={creatingBackup}>
                  {creatingBackup ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  创建备份
                </Button>
              </div>
              {backups.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">备份历史</h4>
                  {backups.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <span className="text-sm">{b.filename || `备份 #${b.id}`}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {b.createdAt ? new Date(b.createdAt).toLocaleString() : ""}
                        </span>
                        <Badge variant="outline" className="ml-2 text-xs">
                          {b.size ? `${(b.size / 1024).toFixed(1)} KB` : ""}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleVerifyBackup(b.id)} title="校验备份完整性">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDrillBackup(b.id)} title="在临时表中执行恢复演练">
                          <TestTube className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { window.location.href = `/api/backup/${encodeURIComponent(b.id)}/download`; }} title="下载备份">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={restoringBackupId !== null}
                          onClick={() => handleRestoreBackup(b.id)}
                          title="用此备份恢复数据库"
                        >
                          {restoringBackupId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Accounts */}
          {isAdmin && <Card>
            <CardHeader>
              <CardTitle>团队账号</CardTitle>
              <CardDescription>管理多用户账号和权限</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleCreateUser} className="space-y-4 border rounded-lg p-4">
                <div>
                  <h4 className="font-medium text-sm">新建账号</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    所有自主注册账号一律先进入待审批状态，只有超级管理员批准后才能登录。
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>用户名 *</Label>
                    <Input
                      placeholder="登录用户名"
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>显示名称</Label>
                    <Input
                      placeholder="显示名称"
                      value={userForm.displayName}
                      onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>邮箱</Label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>角色</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={userForm.role}
                      onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    >
                      <option value="sales">销售</option>
                      <option value="viewer">只读</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>密码 *</Label>
                    <Input
                      type="password"
                      placeholder="初始密码"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                </div>
                <Button type="submit">
                  <Plus className="mr-2 h-4 w-4" />
                  创建账号
                </Button>
              </form>
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无其他账号</p>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{u.displayName || u.username}</span>
                          <Badge variant="outline" className="text-xs">
                            {({ admin: "超级管理员", sales: "销售", viewer: "只读" } as Record<string, string>)[u.role] || u.role}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              u.status === "active"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : u.status === "pending"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-red-200 bg-red-50 text-red-700"
                            }
                          >
                            {u.status === "active" ? (u.active ? "已启用" : "已停用") : u.status === "pending" ? "待审批" : "已拒绝"}
                          </Badge>
                        </div>
                        {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                        <p className="text-xs text-muted-foreground">
                          {u.registrationSource === "self" ? "自主注册" : u.registrationSource === "setup" ? "初始管理员" : "管理员创建"}
                          {u.lastLoginAt ? ` · 最近登录 ${new Date(u.lastLoginAt).toLocaleString()}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingUserId === u.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="显示名称"
                              className="w-28 h-8 text-sm"
                              value={userEditForm.displayName}
                              onChange={(e) => setUserEditForm({ ...userEditForm, displayName: e.target.value })}
                            />
                            <select
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                              value={userEditForm.role}
                              onChange={(e) => setUserEditForm({ ...userEditForm, role: e.target.value })}
                            >
                              <option value="sales">销售</option>
                              <option value="viewer">只读</option>
                            </select>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={userEditForm.active}
                                onChange={(e) => setUserEditForm({ ...userEditForm, active: e.target.checked })}
                              />
                              启用
                            </label>
                            <Button size="sm" onClick={() => handleEditUser(u.id)}>保存</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingUserId(null)}>取消</Button>
                          </div>
                        ) : resetPasswordFor === u.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="password"
                              placeholder="新密码"
                              className="w-36 h-8 text-sm"
                              value={resetPasswordValue}
                              onChange={(e) => setResetPasswordValue(e.target.value)}
                              minLength={8}
                            />
                            <Button size="sm" onClick={() => handleResetPassword(u.id)}>确认</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setResetPasswordFor(null); setResetPasswordValue(""); }}>取消</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {u.status === "pending" && (
                              <>
                                <Button size="sm" onClick={() => handleApproveUser(u.id)}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                  批准
                                </Button>
                                <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleRejectUser(u.id)}>
                                  <XCircle className="h-3.5 w-3.5 mr-1" />
                                  拒绝
                                </Button>
                              </>
                            )}
                            {u.role === "admin" ? (
                              <Badge variant="outline">唯一超级管理员 · 受保护</Badge>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => { setEditingUserId(u.id); setUserEditForm({ displayName: u.displayName || "", email: u.email || "", role: u.role, active: u.active }); }}>
                                  <Edit className="h-3.5 w-3.5 mr-1" />
                                  编辑
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setResetPasswordFor(u.id)}>
                                  <KeyRound className="h-3.5 w-3.5 mr-1" />
                                  重置密码
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>}

          {/* Recycle Bin & Audit Logs */}
          <Card hidden={!isAdmin}>
            <CardHeader>
              <CardTitle>回收站</CardTitle>
              <CardDescription>查看和恢复已删除的数据</CardDescription>
            </CardHeader>
            <CardContent>
              {trashItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">回收站为空</p>
              ) : (
                <div className="space-y-2">
                  {trashItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex-1">
                        <span className="text-sm font-medium">{item.name || item.id}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {item.type && <Badge variant="outline" className="mr-1 text-xs">{item.type}</Badge>}
                          {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleRestoreTrash(item.id)}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          恢复
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDeleteTrash(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audit Logs */}
          <Card hidden={!isAdmin}>
            <CardHeader>
              <CardTitle>审计日志</CardTitle>
              <CardDescription>系统操作记录</CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无操作记录</p>
              ) : (
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-2 rounded text-sm">
                      <Clock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p>
                          <span className="font-medium">{log.username || "系统"}</span>
                          <span className="text-muted-foreground ml-1">{log.action}</span>
                        </p>
                        {log.details && <p className="text-xs text-muted-foreground truncate">{log.details}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
