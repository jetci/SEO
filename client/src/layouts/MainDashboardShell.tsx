import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  LayoutDashboard, FolderKanban, Puzzle, Users, ShieldCheck, Settings, FileText,
  LogOut, SunMoon, CheckCircle2, ChevronRight, ChevronDown, Search, PenLine, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar, SidebarProvider, SidebarContent, SidebarGroup,
  SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset
} from "@/components/ui/sidebar";
import useAuth, { isUserAdminOrOwner } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";

type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: ReactNode;
  badge?: string;
  locked?: boolean;
  adminOnly?: boolean;
  group: "plan" | "system";
  core?: boolean; // true = มือใหม่เห็นเสมอ (Progressive Menu)
};

const NAV_ITEMS: NavItem[] = [
  // Group "วางแผนและเขียนบทความ" — SA 7-Step Write Pipeline Blueprint (L30 old 5-step updated)
  { key: "overview", href: "/",               label: "ภาพรวมระบบ",          icon: <LayoutDashboard className="size-4" />, group: "plan", core: true },
  { key: "projects", href: "/projects",      label: "โปรเจกต์บทความ",     icon: <FolderKanban className="size-4" />,  badge: "7", group: "plan", core: true },
  { key: "kcp",      href: "/kcp",           label: "Keyword Cluster Planner", icon: <Puzzle className="size-4" />, group: "plan", core: true },
  { key: "write",    href: "/write",         label: "เขียนบทความ (7 Steps)", icon: <PenLine className="size-4" />, badge: "SA", group: "plan", core: true },
  { key: "articles", href: "/articles",      label: "เก็บคลังบทความ",    icon: <FileText className="size-4" />, group: "plan", core: true },
  { key: "research", href: "/research",      label: "Keyword Research",   icon: <Search className="size-4" />,        badge: "NEW", locked: false, group: "plan", core: false },

  // Group "ระบบ" — มือใหม่เห็นแค่ตั้งค่า
  { key: "settings", href: "/settings",      label: "ตั้งค่าระบบ",         icon: <Settings className="size-4" />,     locked: false, group: "system", core: true, adminOnly: true },
  { key: "members",  href: "/members",       label: "จัดการสมาชิก",        icon: <Users className="size-4" />,        locked: true, group: "system", core: false },
  { key: "teams",    href: "/teams",         label: "จัดการทีม",           icon: <ShieldCheck className="size-4" />,  locked: true, group: "system", core: false },
  { key: "audit",    href: "/audit",         label: "Admin Audit (Phase 3)", icon: <BarChart3 className="size-4" />, badge: "NEW", group: "system", core: false, adminOnly: true },
];

type Props = {
  headerTitle?: string;
  headerSubtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
};

export default function MainDashboardShell({
  headerTitle = "ภาพรวมระบบ",
  headerSubtitle,
  headerActions,
  children,
}: Props) {
  const { user, isLoggedIn, loading, me, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const [, params] = useRoute("/:page*");
  const [showAdvancedMenus, setShowAdvancedMenus] = useState(false);
  const activeKey = (() => {
    if (location.startsWith("/projects")) return "projects";
    if (location.startsWith("/research")) return "research";
    if (location.startsWith("/kcp")) return "kcp";
    if (location.startsWith("/write")) return "write";
    if (location.startsWith("/articles")) return "articles";
    if (location.startsWith("/members")) return "members";
    if (location.startsWith("/teams")) return "teams";
    if (location.startsWith("/audit")) return "audit";
    if (location.startsWith("/settings")) return "settings";
    return "overview";
  })();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Redirect decision deferred EXCLUSIVELY to RequireAuth wrapper + auth.me useEffect.
    // No setTimeout guess-time redirect here (UX-01 removed old 500ms guess timer).
  }, [loading, isLoggedIn, me.error?.data?.code]);

  const initials = (() => {
    const name = user?.name || user?.email || "?";
    return name.slice(0, 2).toUpperCase();
  })();

  const emailShort = (user?.email || "—").slice(0, 28);
  const roleLabel = user?.role === "admin" ? "Admin" : (user?.permission === "owner" ? "Owner" : (user?.permission === "admin" ? "Admin" : "Member"));

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full bg-[#fbf8f4] text-stone-900 flex" data-testid="main-dashboard-shell">
        <Sidebar side="left" collapsible="none" className="!bg-stone-50 !border-stone-200">
          <div className="px-3 py-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#b45309] to-[#d97706] text-white grid place-items-center shadow-sm">
                <CheckCircle2 className="size-5" />
              </div>
              <div className="leading-tight">
                <p className="font-semibold text-[15px] text-stone-900">EEAT Studio</p>
                <p className="text-[11px] text-stone-500">V2 · Lean Rebuild</p>
              </div>
            </Link>
          </div>
          <Separator className="bg-stone-200" />
          <SidebarContent className="gap-1 px-1">
            <SidebarGroup>
              <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-stone-500 px-3 py-1">วางแผนและเขียนบทความ</SidebarGroupLabel>
              <SidebarMenu className="gap-1" data-testid="sidebar-group-plan">
                {NAV_ITEMS.filter(i => i.group === "plan" && (i.core || activeKey === i.key || showAdvancedMenus) && (!i.adminOnly || isUserAdminOrOwner(user))).map(item => (
                  <SidebarMenuItem key={item.key} data-testid={`sidebar-menuitem-${item.key}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeKey === item.key}
                      className="!h-9 !rounded-lg text-[13.5px] font-medium data-[active=true]:!bg-amber-100 data-[active=true]:!text-amber-900 data-[active=true]:!border !border-amber-200"
                    >
                      <Link href={item.href} data-testid={`sidebar-item-${item.key}`} className="w-full flex items-center gap-2.5 px-2">
                        <span className="text-stone-600 data-[active=true]:text-amber-700">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-stone-200 text-stone-700">{item.badge}</span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
            <Separator className="bg-stone-200 my-1" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-stone-500 px-3 py-1">ระบบ</SidebarGroupLabel>
              <SidebarMenu className="gap-1" data-testid="sidebar-group-system">
                {NAV_ITEMS.filter(i => i.group === "system" && (i.core || activeKey === i.key || showAdvancedMenus) && (!i.adminOnly || isUserAdminOrOwner(user))).map(item => (
                  <SidebarMenuItem key={item.key} data-testid={`sidebar-menuitem-${item.key}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeKey === item.key}
                      className="!h-9 !rounded-lg text-[13.5px] font-medium data-[active=true]:!bg-stone-200"
                      disabled={item.locked}
                    >
                      {item.locked ? (
                        <div data-testid={`sidebar-item-${item.key}`} className="w-full flex items-center gap-2.5 px-2 opacity-55 cursor-not-allowed">
                          {item.icon}
                          <span className="flex-1">{item.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-300/60 text-stone-600">เร็วๆ นี้</span>
                        </div>
                      ) : (
                        <Link href={item.href} data-testid={`sidebar-item-${item.key}`} className="w-full flex items-center gap-2.5 px-2">
                          {item.icon}
                          <span className="flex-1">{item.label}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
            {(() => {
              const hiddenCount = NAV_ITEMS.filter(i => !i.core && activeKey !== i.key).length;
              if (hiddenCount <= 0) return null;
              return (
                <div className="px-3 py-1.5">
                  <button
                    onClick={() => setShowAdvancedMenus(v => !v)}
                    className="w-full !h-8 rounded-lg text-[12px] text-stone-600 hover:!bg-stone-100 border border-stone-200 hover:border-stone-300 flex items-center justify-center gap-1.5 px-2 transition-colors"
                    title="แสดงเมนูขั้นสูงทั้งหมด"
                  >
                    <ChevronDown className={`size-3.5 transition-transform ${showAdvancedMenus ? 'rotate-180' : ''}`} />
                    {showAdvancedMenus ? `ซ่อนเมนูขั้นสูง (${hiddenCount})` : `เมนูเพิ่มเติม (${hiddenCount})`}
                  </button>
                </div>
              );
            })()}

            <div className="mt-auto" />
            <Separator className="bg-stone-200 my-2" />
            <div className="px-3 py-3">
              <Card className="!rounded-xl !bg-white/70 !border-stone-200 !shadow-sm">
                <div className="flex items-center gap-3 p-3">
                  <Avatar className="!size-9 !border !border-stone-200">
                    <AvatarFallback className="!bg-amber-100 !text-amber-900 !text-xs font-bold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate">{user?.name || "Admin"}</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                      <span>{roleLabel}</span><ChevronRight className="size-3 opacity-60" /><span className="truncate">{emailShort}</span>
                    </div>
                  </div>
                </div>
                <div className="px-3 pb-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleTheme}
                    data-testid="theme-toggle-btn"
                    className="!h-8 !rounded-lg !text-stone-600 hover:!bg-stone-100 flex-1 !px-2"
                  >
                    <SunMoon className="size-3.5 mr-1.5" />
                    {theme === "light" ? "Light" : "Dark"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={logout}
                    data-testid="logout-btn"
                    className="!h-8 !rounded-lg !bg-[#b45309] hover:!bg-[#92400e] flex-1 !px-2 text-[12.5px]"
                  >
                    <LogOut className="size-3.5 mr-1.5" />
                    ออก
                  </Button>
                </div>
              </Card>
            </div>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="!bg-transparent">
          <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#fbf8f4]/85 backdrop-blur-sm shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_4px_16px_-10px_rgba(180,83,9,0.15)]">
            <div className="flex items-center gap-4 px-8 py-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-[22px] font-bold text-stone-900 tracking-tight font-[Playfair_Display,_serif]" data-testid="page-title">{headerTitle}</h1>
                {headerSubtitle && (
                  <p className="text-[13px] text-stone-600 mt-1">{headerSubtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2" data-testid="header-actions">
                {isLoggedIn ? headerActions : null}
              </div>
            </div>
          </header>
          <main className="px-8 py-6" data-testid="page-body">
            {isLoggedIn ? children : (
              <div className="max-w-xl mx-auto text-center py-20">
                <p className="text-stone-600 mb-3">กำลังตรวจสอบสิทธิ์เข้าถึง...</p>
                <Button asChild variant="default" className="!bg-[#b45309] hover:!bg-[#92400e]">
                  <Link href="/login">ไปหน้าเข้าสู่ระบบ</Link>
                </Button>
              </div>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
