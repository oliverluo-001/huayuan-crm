import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { LayoutDashboard, Users, Target, FileText, Package, Mail, Database, Settings, LogOut, RefreshCw, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { id: "", label: "仪表盘", icon: LayoutDashboard },
  { id: "acquisition", label: "获客线索", icon: Target },
  { id: "customers", label: "客户管理", icon: Users },
  { id: "opportunities", label: "商机", icon: FileText },
  { id: "quotes", label: "报价", icon: FileText },
  { id: "samples", label: "样品", icon: Package },
  { id: "products", label: "产品", icon: Package },
  { id: "marketing", label: "邮件营销", icon: Mail },
  { id: "settings", label: "设置", icon: Settings },
];

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "仪表盘", subtitle: "概览业务数据" },
  "/acquisition": { title: "获客线索", subtitle: "B2B 线索任务管理" },
  "/customers": { title: "客户管理", subtitle: "客户档案与跟进" },
  "/opportunities": { title: "商机", subtitle: "销售漏斗管理" },
  "/quotes": { title: "报价", subtitle: "报价单管理" },
  "/samples": { title: "样品", subtitle: "样品寄送跟踪" },
  "/products": { title: "产品", subtitle: "产品目录管理" },
  "/marketing": { title: "邮件营销", subtitle: "模板与任务管理" },
  "/settings": { title: "设置", subtitle: "系统配置" },
};

export function Shell() {
  const { username, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const activePage = location.pathname;
  const pageInfo = pageTitles[activePage] || { title: "外贸 CRM", subtitle: "" };

  return (
    <div className="flex h-screen bg-background">
      <aside
        className={cn(
          "flex h-screen flex-col border-r bg-card transition-all duration-300",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            W
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold">外贸 CRM</span>
              <span className="text-xs text-muted-foreground">本地工作台</span>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <Button
              key={item.id + item.label}
              variant={activePage === "/" + item.id ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3",
                isCollapsed && "justify-center px-2"
              )}
              onClick={() => navigate("/" + item.id)}
            >
              <item.icon className="h-4 w-4" />
              {!isCollapsed && <span>{item.label}</span>}
            </Button>
          ))}
        </nav>

        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {username?.charAt(0).toUpperCase() || "A"}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-medium">{username}</span>
                <span className="text-xs text-muted-foreground">本机管理员</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b bg-card px-6">
          <div>
            <h1 className="text-xl font-semibold">{pageInfo.title}</h1>
            <p className="text-sm text-muted-foreground">{pageInfo.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              退出
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}