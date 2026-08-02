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
  { id: "", label: "仪表盘", icon: LayoutDashboard, roles: ALL_ROLES },
  { id: "acquisition", label: "获客线索", icon: Target, roles: ALL_ROLES },
  { id: "customers", label: "客户管理", icon: Users, roles: ALL_ROLES },
];

const salesNavItems: NavItem[] = [
  { id: "opportunities", label: "商机", icon: FileText, roles: ALL_ROLES },
  { id: "quotes", label: "报价", icon: FileText, roles: ALL_ROLES },
  { id: "samples", label: "样品", icon: Package, roles: ALL_ROLES },
  { id: "products", label: "产品", icon: Package, roles: ALL_ROLES },
];

const bottomNavItems: NavItem[] = [
  { id: "marketing", label: "邮件营销", icon: Mail, roles: ALL_ROLES },
  { id: "settings", label: "设置", icon: Settings, roles: ALL_ROLES },
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
              <span className="font-semibold">外贸 CRM</span>
              <span className="text-xs text-muted-foreground">本地工作台</span>
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
                  {role === "admin" ? "管理员" : role === "sales" ? "销售" : "只读查看"}
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
