import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function LoginScreen() {
  const { login, register, registrationEnabled, registrationRequiresApproval } = useAuth();
  const [tab, setTab] = useState("login");

  // Login form
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Register form
  const [regUser, setRegUser] = useState("");
  const [regDisplay, setRegDisplay] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");
  const [registrationNotice, setRegistrationNotice] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setRegistrationNotice("");
    setLoginLoading(true);
    try {
      await login(loginUser, loginPass);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");

    if (regPass !== regConfirm) {
      setRegError("两次输入的密码不一致");
      return;
    }
    if (regPass.length < 8) {
      setRegError("密码长度至少为8位");
      return;
    }

    setRegLoading(true);
    try {
      const result = await register(regUser, regPass, regDisplay || regUser, regEmail);
      if (result.requiresApproval) {
        setRegistrationNotice(result.message || "注册申请已提交，请等待管理员审核");
        setRegUser("");
        setRegDisplay("");
        setRegEmail("");
        setRegPass("");
        setRegConfirm("");
        setTab("login");
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xl font-bold">
            W
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold">外贸 CRM</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardDescription>团队安全登录</CardDescription>
            <CardTitle className="text-2xl">外贸 CRM</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab} className="w-full flex flex-col gap-4">
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">登录</TabsTrigger>
                {registrationEnabled && <TabsTrigger value="register" className="flex-1">注册</TabsTrigger>}
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  {registrationNotice && (
                    <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                      {registrationNotice}
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="login-username">账号</Label>
                    <Input
                      id="login-username"
                      type="text"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      placeholder="请输入账号"
                      required
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">密码</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      placeholder="请输入密码"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  {loginError && (
                    <p className="text-sm text-destructive">{loginError}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={loginLoading}>
                    {loginLoading ? "登录中..." : "登录"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">账号 *</Label>
                    <Input
                      id="reg-username"
                      type="text"
                      value={regUser}
                      onChange={(e) => setRegUser(e.target.value)}
                      placeholder="登录用户名"
                      required
                      minLength={3}
                      maxLength={32}
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-display">显示名称</Label>
                    <Input
                      id="reg-display"
                      type="text"
                      value={regDisplay}
                      onChange={(e) => setRegDisplay(e.target.value)}
                      placeholder="选填，默认使用账号名"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">工作邮箱 *</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="name@company.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">密码 *</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      placeholder="至少8位"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-confirm">确认密码 *</Label>
                    <Input
                      id="reg-confirm"
                      type="password"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      placeholder="再次输入密码"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  {regError && (
                    <p className="text-sm text-destructive">{regError}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={regLoading}>
                    {regLoading ? "提交中..." : registrationRequiresApproval ? "提交注册申请" : "创建账号"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SetupScreen() {
  const { setup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (password.length < 8) {
      setError("密码长度至少为8位");
      return;
    }

    setIsLoading(true);
    try {
      await setup(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xl font-bold">
            W
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold">外贸 CRM</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardDescription>首次使用</CardDescription>
            <CardTitle className="text-2xl">创建系统管理员</CardTitle>
            <p className="text-sm text-muted-foreground">
              管理员负责审核团队账号并配置系统。
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">管理员账号</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="如：admin"
                  required
                  minLength={3}
                  maxLength={32}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">登录密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码（至少8位）"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入密码"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "创建中..." : "创建账号并进入系统"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
