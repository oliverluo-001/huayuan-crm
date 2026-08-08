import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { LayoutDashboard, Users, Target, FileText, Package, Mail, Settings, LogOut, Sun, Moon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ALL_ROLES, hasRole, type UserRole } from "@/auth/permissions";

type NavItem = {
  id: string;
  label: string;
  icon: any;
  roles: readonly UserRole[];
};

const mainNavItems: NavItem[] = [
  { id: "", label: "业务概览", icon: LayoutDashboard, roles: ALL_ROLES },
  { id: "acquisition", label: "智能获客", icon: Target, roles: ALL_ROLES },
  { id: "customers", label: "客户管理", icon: Users, roles: ALL_ROLES },
];

const salesNavItems: NavItem[] = [
  { id: "opportunities", label: "销售商机", icon: FileText, roles: ALL_ROLES },
  { id: "quotes", label: "报价管理", icon: FileText, roles: ALL_ROLES },
  { id: "samples", label: "样品跟进", icon: Package, roles: ALL_ROLES },
  { id: "products", label: "产品资料", icon: Package, roles: ALL_ROLES },
];

const bottomNavItems: NavItem[] = [
  { id: "marketing", label: "邮件发送", icon: Mail, roles: ALL_ROLES },
  { id: "settings", label: "系统设置", icon: Settings, roles: ALL_ROLES },
];

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "业务概览", subtitle: "查看获客、客户、商机与发信进展" },
  "/acquisition": { title: "智能获客", subtitle: "搜索、核验并转入潜在客户" },
  "/customers": { title: "客户管理", subtitle: "维护客户档案与跟进进度" },
  "/opportunities": { title: "销售商机", subtitle: "推进客户需求与成交进度" },
  "/quotes": { title: "报价管理", subtitle: "创建、发送并跟踪报价单" },
  "/samples": { title: "样品跟进", subtitle: "记录样品寄出与签收情况" },
  "/products": { title: "产品资料", subtitle: "维护产品与报价基础资料" },
  "/marketing": { title: "邮件发送", subtitle: "管理邮件模板、发信任务与记录" },
  "/settings": { title: "系统设置", subtitle: "配置账号、邮件、获客与数据安全" },
};

export function Shell() {
  const { username, displayName, role, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const activePage = location.pathname;
  const visibleMainItems = mainNavItems.filter((item) => hasRole(role, item.roles));
  const visibleSalesItems = salesNavItems.filter((item) => hasRole(role, item.roles));
  const visibleBottomItems = bottomNavItems.filter((item) => hasRole(role, item.roles));
  const isSalesActive = visibleSalesItems.some((item) => activePage.startsWith("/" + item.id));
  const [salesOpen, setSalesOpen] = useState(isSalesActive);
  const basePath = "/" + activePage.split("/")[1];
  const pageInfo = pageTitles[basePath] || pageTitles[activePage] || { title: "外贸 CRM", subtitle: "" };

  const NavButton = ({ id, label, icon: Icon }: { id: string; label: string; icon: any }) => {
    const isActive = id === "" ? activePage === "/" : activePage.startsWith("/" + id);
    return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      className={cn(
        "w-full justify-start gap-3",
        isCollapsed && "justify-center px-2"
      )}
      onClick={() => navigate("/" + id)}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span>{label}</span>}
    </Button>
    );
  };

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
              <span className="font-semibold">华远外贸 CRM</span>
              <span className="text-xs text-muted-foreground">客户开发与销售工作台</span>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {visibleMainItems.map((item) => (
            <NavButton key={item.id} {...item} />
          ))}

          {/* Sales submenu group */}
          {isCollapsed ? (
            visibleSalesItems.map((item) => <NavButton key={item.id} {...item} />)
          ) : (
            <div>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground text-xs font-medium"
                onClick={() => setSalesOpen(!salesOpen)}
              >
                <span className="flex-1 text-left">销售</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", salesOpen && "rotate-180")} />
              </Button>
              {salesOpen && (
                <div className="ml-2 space-y-0.5 border-l pl-2">
                  {visibleSalesItems.map((item) => (
                    <NavButton key={item.id} {...item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {visibleBottomItems.map((item) => (
            <NavButton key={item.id} {...item} />
          ))}
        </nav>

        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {(displayName || username)?.charAt(0).toUpperCase() || "A"}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{displayName || username}</span>
                <span className="text-xs text-muted-foreground">
                  {role === "admin" ? "超级管理员" : role === "sales" ? "销售人员" : "只读成员"}
                  {username !== displayName && displayName ? ` · ${username}` : ""}
                </span>
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
