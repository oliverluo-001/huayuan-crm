import { Fragment, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { LayoutDashboard, Users, Target, FileText, Package, Mail, Settings, LogOut, Sun, Moon, Menu, X, PanelLeftClose, PanelLeftOpen, CircleHelp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ALL_ROLES, hasRole, type UserRole } from "@/auth/permissions";

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
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
  const { resolvedTheme, setTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mobileMenu = useRef<HTMLElement>(null);
  const wasMobileOpen = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const activePage = location.pathname;
  const visibleMainItems = mainNavItems.filter((item) => hasRole(role, item.roles));
  const visibleSalesItems = salesNavItems.filter((item) => hasRole(role, item.roles));
  const visibleBottomItems = bottomNavItems.filter((item) => hasRole(role, item.roles));
  const basePath = "/" + activePage.split("/")[1];
  const pageInfo = pageTitles[basePath] || pageTitles[activePage] || { title: "外贸 CRM", subtitle: "" };

  useEffect(() => {
    if (!mobileOpen) {
      if (wasMobileOpen.current) menuButton.current?.focus();
      wasMobileOpen.current = false;
      return;
    }
    wasMobileOpen.current = true;
    const first = mobileMenu.current?.querySelector<HTMLButtonElement>("button");
    first?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileOpen(false); menuButton.current?.focus(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(mobileMenu.current?.querySelectorAll<HTMLButtonElement>("button") || []);
      const firstButton = buttons[0], lastButton = buttons.at(-1);
      if (event.shiftKey && document.activeElement === firstButton) { event.preventDefault(); lastButton?.focus(); }
      else if (!event.shiftKey && document.activeElement === lastButton) { event.preventDefault(); firstButton?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileOpen]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (media.matches) setMobileOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  const nav = (compact: boolean) => {
  const NavButton = ({ id, label, icon: Icon }: NavItem) => {
    const isActive = id === "" ? activePage === "/" : activePage.startsWith("/" + id);
    return (
    <Button
      variant="ghost"
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      title={compact ? label : undefined}
      className={cn(
        "h-9 w-full justify-start gap-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white",
        isActive && "bg-blue-500/20 text-white ring-1 ring-blue-400/30 hover:bg-blue-500/25",
        compact && "justify-center px-2"
      )}
      onClick={() => { navigate("/" + id); setMobileOpen(false); menuButton.current?.focus(); }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!compact && <span>{label}</span>}
    </Button>
    );
  };
  return <>
    <div className="flex h-20 shrink-0 items-center gap-3 px-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 font-bold text-white shadow-lg shadow-blue-900/30">H</div>
      {!compact && <div className="min-w-0"><span className="whitespace-nowrap text-base font-semibold text-white">华远外贸 CRM</span><p className="mt-1 text-[10px] tracking-wider text-slate-400">HUAYUAN · SALES</p></div>}
    </div>
    <nav aria-label="主导航" className="crm-navigation min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
      {[{ label: "客户开发", items: visibleMainItems }, { label: "销售工作", items: visibleSalesItems }, { label: "协作与设置", items: visibleBottomItems }].map((group) => <div key={group.label} className="space-y-1">
        {!compact && <p className="px-3 pb-2 text-[11px] font-medium tracking-wider text-slate-400">{group.label}</p>}
        {group.items.map((item) => <Fragment key={item.id}>{NavButton(item)}</Fragment>)}
      </div>)}
    </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-blue-400/20 text-blue-200">
                {(displayName || username)?.charAt(0).toUpperCase() || "A"}
              </AvatarFallback>
            </Avatar>
            {!compact && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate text-white">{displayName || username}</span>
                <span className="text-xs text-slate-400">
                  {role === "admin" ? "超级管理员" : role === "sales" ? "销售人员" : "只读成员"}
                </span>
                {username !== displayName && displayName && <span className="truncate text-[11px] text-slate-400" title={username || ""}>{username}</span>}
              </div>
            )}
          </div>
        </div>
  </>;
  };
  return (
    <div className="crm-workspace flex h-dvh overflow-hidden bg-background">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-card focus:p-3">跳转到工作区</a>
      <aside aria-label="桌面导航" className={cn("hidden shrink-0 flex-col bg-slate-950 transition-[width] md:flex", isCollapsed ? "w-20" : "w-60")}>{nav(isCollapsed)}</aside>
      {mobileOpen && <div className="fixed inset-0 z-50 md:hidden">
        <div className="absolute inset-0 bg-slate-950/50" onClick={() => { setMobileOpen(false); menuButton.current?.focus(); }} />
        <aside ref={mobileMenu} role="dialog" aria-modal="true" aria-label="移动导航" className="relative flex h-full w-72 max-w-[85vw] flex-col bg-slate-950">
          <Button variant="ghost" size="icon" aria-label="关闭菜单" className="absolute right-2 top-1 text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => { setMobileOpen(false); menuButton.current?.focus(); }}><X /></Button>
          {nav(false)}
        </aside>
      </div>}
      <div inert={mobileOpen} className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-20 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Button ref={menuButton} variant="ghost" size="icon" className="md:hidden" aria-label="打开菜单" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu /></Button>
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label={isCollapsed ? "展开导航" : "收起导航"} onClick={() => setIsCollapsed((value) => !value)}>{isCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
            <div className="min-w-0"><h1 className="truncate text-lg font-semibold tracking-tight">{pageInfo.title}</h1><p className="mt-1 hidden text-xs text-muted-foreground sm:block">{pageInfo.subtitle}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label={resolvedTheme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Button variant="outline" size="sm" aria-label="退出登录" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">退出</span>
            </Button>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1} className="min-w-0 flex-1 overflow-auto p-3 outline-none md:p-6 xl:p-7">
          <div className="mx-auto w-full max-w-[1600px]"><Outlet /></div>
          <footer className="mx-auto mt-8 flex max-w-[1600px] items-center gap-2 border-t py-4 text-xs text-muted-foreground"><CircleHelp className="size-3.5" />华远外贸 CRM · 客户开发与销售协作</footer>
        </main>
      </div>
    </div>
  );
}
