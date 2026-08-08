import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, TestTube } from "lucide-react";
import { toast } from "sonner";
import {
  createSearchProfile,
  testSearchProfile,
  deleteSearchProfile,
  saveAiProfile,
  testAiProfile,
  getSearchProfiles,
  getAiProfile,
  type SearchProfile,
  type AiProfile,
} from "@/api/client";

export function SourcesPage() {
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [aiTesting, setAiTesting] = useState(false);

  const [searchForm, setSearchForm] = useState({
    name: "",
    provider: "brave-search" as SearchProfile["provider"],
    apiUrl: "https://api.search.brave.com/res/v1/web/search",
    apiKey: "",
  });

  const [aiForm, setAiForm] = useState({
    provider: "deepseek" as AiProfile["provider"],
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-v4-flash",
    apiKey: "",
    enabled: false,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [profiles, aiProfile] = await Promise.all([getSearchProfiles(), getAiProfile()]);
      setSearchProfiles(profiles);
      if (aiProfile) {
        setAiForm({
          provider: aiProfile.provider || "deepseek",
          baseUrl: aiProfile.baseUrl || "https://api.deepseek.com/v1",
          model: aiProfile.model || "deepseek-v4-flash",
          apiKey: "",
          enabled: aiProfile.enabled || false,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSearchProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSearchProfile({
        name: searchForm.name,
        provider: searchForm.provider,
        apiUrl: searchForm.apiUrl,
        apiKey: searchForm.apiKey,
      });
      toast.success("搜索源已保存");
      setSearchForm({
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
    setTestingId(id);
    try {
      const result = await testSearchProfile(id);
      if (result.ok) {
        toast.success("连接成功");
      } else {
        toast.error(`连接失败: ${result.message || "未知错误"}`);
      }
    } catch {
      // Error handled by API client
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteSearchProfile = async (id: string) => {
    if (!confirm("确定删除该搜索源吗？")) return;
    try {
      await deleteSearchProfile(id);
      toast.success("搜索源已删除");
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleSaveAiProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveAiProfile(aiForm);
      toast.success("AI 辅助获客配置已保存");
      fetchData();
    } catch {
      // Error handled by API client
    }
  };

  const handleTestAiProfile = async () => {
    setAiTesting(true);
    try {
      const result = await testAiProfile();
      if (result.ok) {
        toast.success("连接成功");
      } else {
        toast.error(`连接失败: ${result.message || "未知错误"}`);
      }
    } catch {
      // Error handled by API client
    } finally {
      setAiTesting(false);
    }
  };

  const providerPresets: Record<string, { apiUrl: string }> = {
    "brave-search": { apiUrl: "https://api.search.brave.com/res/v1/web/search" },
    "serper": { apiUrl: "https://google.serper.dev/search" },
    "serpapi": { apiUrl: "https://serpapi.com/search.json" },
    "generic-json": { apiUrl: "" },
  };

  return (
    <div className="space-y-6">
      {/* Search Profiles */}
      <Card>
        <CardHeader>
          <CardTitle>搜索数据源</CardTitle>
          <CardDescription>
            配置稳定的专业搜索接口。密钥会加密保存，页面只显示是否已配置。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSearchProfile} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>配置名称 *</Label>
                <Input
                  placeholder="如：Google 主搜索源"
                  value={searchForm.name}
                  onChange={(e) => setSearchForm({ ...searchForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>服务商 *</Label>
                <Select
                  value={searchForm.provider}
                  onValueChange={(v) => {
                    if (!v) return;
                    setSearchForm({
                      ...searchForm,
                      provider: v as SearchProfile["provider"],
                      apiUrl: providerPresets[v]?.apiUrl || searchForm.apiUrl,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brave-search">Brave Search（推荐）</SelectItem>
                    <SelectItem value="serper">Serper（Google）</SelectItem>
                    <SelectItem value="serpapi">SerpApi（多引擎）</SelectItem>
                    <SelectItem value="generic-json">通用 JSON API</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>API 地址 *</Label>
                <Input
                  type="url"
                  value={searchForm.apiUrl}
                  onChange={(e) => setSearchForm({ ...searchForm, apiUrl: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>API 密钥</Label>
                <Input
                  type="password"
                  placeholder="留空则沿用已保存密钥"
                  value={searchForm.apiKey}
                  onChange={(e) => setSearchForm({ ...searchForm, apiKey: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              保存搜索源
            </Button>
          </form>

          <Separator className="my-6" />

          <div className="space-y-3">
            {isLoading ? (
              [...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            ) : searchProfiles.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground">暂无搜索源配置</p>
            ) : (
              searchProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between gap-4 p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{profile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {profile.provider} · {profile.apiUrl}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={profile.apiKeySet ? "default" : "secondary"}>
                      {profile.apiKeySet ? "已配置密钥" : "未配置密钥"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => handleTestSearchProfile(profile.id)}
                      disabled={testingId === profile.id}
                    >
                      <TestTube className="h-4 w-4 mr-1" />
                      测试
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="text-destructive"
                      onClick={() => handleDeleteSearchProfile(profile.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Profile */}
      <Card>
        <CardHeader>
          <CardTitle>AI 获客搜索规划</CardTitle>
          <CardDescription>
            用于扩展目标行业与检索词，不直接代替搜索 API。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveAiProfile} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>模型服务</Label>
                <Select
                  value={aiForm.provider}
                  onValueChange={(v) => setAiForm({ ...aiForm, provider: v as AiProfile["provider"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deepseek">DeepSeek</SelectItem>
                    <SelectItem value="openai-compatible">OpenAI 兼容接口</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>接口地址</Label>
                <Input
                  type="url"
                  value={aiForm.baseUrl}
                  onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>模型名称</Label>
                <Input
                  value={aiForm.model}
                  onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>API 密钥</Label>
                <Input
                  type="password"
                  placeholder="留空则继续使用已保存密钥"
                  value={aiForm.apiKey}
                  onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="aiEnabled"
                checked={aiForm.enabled}
                onChange={(e) => setAiForm({ ...aiForm, enabled: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="aiEnabled" className="cursor-pointer">启用 AI 获客搜索规划</Label>
            </div>
            <div className="flex gap-2">
              <Button type="submit">保存 AI 获客配置</Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTestAiProfile}
                disabled={aiTesting}
              >
                <TestTube className="h-4 w-4 mr-1" />
                测试连接
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              未配置密钥时，获客任务将使用内置的行业和买家类型规则。
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
