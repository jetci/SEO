import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import {
  LayoutDashboard, FolderKanban, Puzzle, Users, ShieldCheck,
  BookOpen, AlertTriangle, CheckCircle2, XCircle, TrendingUp, Sparkles,
  DollarSign, Loader2
} from "lucide-react";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardOverviewPage() {
  const projects = trpc.projects.list.useQuery();
  const cats = trpc.categories.list.useQuery();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin" || user?.permission === "owner" || user?.permission === "admin";
  const now = new Date();
  const billingWindow = trpc.settings.getBillingWindow.useQuery(
    { month: now.getMonth() + 1, year: now.getFullYear() },
    { enabled: isAdmin, staleTime: 1000 * 60 * 5 }
  );
  const [billingOpen, setBillingOpen] = useState(false);

  const projArr = Array.isArray(projects.data) ? (projects.data as any[]) : [];
  const catArr = Array.isArray(cats.data) ? (cats.data as any[]) : [];

  const totalProjects = projArr.length;
  const activeProjects = projArr.filter(p => p.status !== "archived" && p.is_active !== false).length;
  const ymylCount = projArr.filter(p => [3, 4, 5].includes(Number(p.category_id || p.categoryId))).length;
  const clustersDemo = 0;
  const keywordsDemo = 0;

  const billingUsd = Number((billingWindow.data as any)?.grand_total_usd ?? 0).toFixed(2);
  const billingCalls = Number((billingWindow.data as any)?.total_calls ?? 0);
  const showBilling = isAdmin;

  const kpis = [
    { label: "โปรเจกต์ทั้งหมด", val: totalProjects, Icon: FolderKanban, color: "amber" },
    { label: "โปรเจกต์ใช้งาน", val: activeProjects, Icon: CheckCircle2, color: "emerald" },
    { label: "Cluster (3 ชั้น)", val: clustersDemo, Icon: Puzzle, color: "blue" },
    { label: "Keyword Library", val: keywordsDemo, Icon: BookOpen, color: "violet" },
    { label: "สมาชิกในทีม", val: 1, Icon: Users, color: "stone" },
    { label: "YMYL Projects", val: ymylCount, Icon: ShieldCheck, color: "rose" },
  ];

  const colorMap: Record<string, string> = {
    amber: "#fff7ed · #92400e",
    emerald: "#ecfdf5 · #047857",
    blue: "#eff6ff · #1d4ed8",
    violet: "#f5f3ff · #6d28d9",
    stone: "#f5f5f4 · #44403c",
    rose: "#fff1f2 · #9f1239",
  };

  return (
    <MainDashboardShell
      headerTitle="ภาพรวมระบบ"
      headerSubtitle={`EEAT Studio V2 · Phase 2 Roadmap · ${activeProjects} / ${totalProjects} โปรเจกต์ใช้งาน`}
      headerActions={
        <>
          {showBilling && (
            <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
              <button
                type="button"
                onClick={() => setBillingOpen(true)}
                data-testid="dashboard-billing-badge"
                className="!h-9 !px-3 !rounded-lg !text-[12px] !bg-emerald-50 !text-emerald-800 border !border-emerald-200 inline-flex items-center gap-2 hover:!bg-emerald-100 transition-colors cursor-pointer"
              >
                {billingWindow.isLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <DollarSign className="size-3.5" />
                )}
                <span className="font-semibold">LLM/SERP Usage เดือนนี้</span>
                <span className="font-bold font-mono">${billingUsd}</span>
                <span className="text-emerald-600/80 text-[11px]">{billingCalls} calls</span>
              </button>
              <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <DollarSign className="size-5 text-emerald-700" />
                    Usage Report — เดือน {billingWindow.data?.month ?? now.getMonth() + 1} / {billingWindow.data?.year ?? now.getFullYear()}
                  </DialogTitle>
                  <DialogDescription>
                    สรุปค่าใช้จ่าย LLM + SERP ประจำเดือน (ข้อมูลจากฐานข้อมูล research_audit)
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 border border-emerald-200">
                    <p className="text-[11px] uppercase tracking-wider text-emerald-700 mb-1">Total Cost</p>
                    <p className="text-2xl font-bold font-mono text-emerald-900">${billingUsd}</p>
                    <p className="text-[12px] text-emerald-700/80 mt-1">{billingCalls} API calls</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-4 border border-stone-200">
                    <p className="text-[11px] uppercase tracking-wider text-stone-600 mb-1">LLM Usage</p>
                    <p className="text-xl font-bold font-mono text-stone-900">${Number((billingWindow.data as any)?.llm_usd_total ?? 0).toFixed(4)}</p>
                    <p className="text-[12px] text-stone-600 mt-1">{Number((billingWindow.data as any)?.llm_calls_count ?? 0).toLocaleString()} calls</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-4 border border-stone-200">
                    <p className="text-[11px] uppercase tracking-wider text-stone-600 mb-1">SERP Usage</p>
                    <p className="text-xl font-bold font-mono text-stone-900">${Number((billingWindow.data as any)?.serp_usd_total ?? 0).toFixed(4)}</p>
                    <p className="text-[12px] text-stone-600 mt-1">{Number((billingWindow.data as any)?.serp_calls_count ?? 0).toLocaleString()} calls</p>
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-stone-50 text-stone-600 uppercase text-[11px] tracking-wider">
                        <th className="text-left p-3 font-semibold">Provider</th>
                        <th className="text-right p-3 font-semibold">Calls</th>
                        <th className="text-right p-3 font-semibold">Tokens / Rows</th>
                        <th className="text-right p-3 font-semibold">Cost (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {Number((billingWindow.data as any)?.llm_calls_count ?? 0) > 0 && (
                        <tr className="hover:bg-stone-50">
                          <td className="p-3 font-medium text-stone-800">🤖 LLM (OpenRouter / GPT / Claude)</td>
                          <td className="p-3 text-right font-mono">{Number((billingWindow.data as any)?.llm_calls_count ?? 0).toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-stone-600">
                            {(Number((billingWindow.data as any)?.llm_tokens_in ?? 0) + Number((billingWindow.data as any)?.llm_tokens_out ?? 0)).toLocaleString()} tokens
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-stone-900">${Number((billingWindow.data as any)?.llm_usd_total ?? 0).toFixed(4)}</td>
                        </tr>
                      )}
                      {Number((billingWindow.data as any)?.serp_calls_count ?? 0) > 0 && (
                        <tr className="hover:bg-stone-50">
                          <td className="p-3 font-medium text-stone-800">🔎 SERP (Serper / DataForSEO)</td>
                          <td className="p-3 text-right font-mono">{Number((billingWindow.data as any)?.serp_calls_count ?? 0).toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-stone-600">
                            {Number((billingWindow.data as any)?.serp_rows_returned ?? 0).toLocaleString()} rows
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-stone-900">${Number((billingWindow.data as any)?.serp_usd_total ?? 0).toFixed(4)}</td>
                        </tr>
                      )}
                      {Number((billingWindow.data as any)?.llm_calls_count ?? 0) === 0 && Number((billingWindow.data as any)?.serp_calls_count ?? 0) === 0 && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-stone-500 text-[13px]">
                            {billingWindow.isLoading ? (
                              <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> กำลังโหลดข้อมูล Usage...</span>
                            ) : (
                              "ยังไม่มี LLM / SERP usage สำหรับเดือนนี้ (จะปรากฏเมื่อเริ่มใช้งาน Phase 2c Research Layer)"
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="outline" size="sm" className="!h-9 !rounded-lg">
            <TrendingUp className="size-4 mr-2" />
            สถิติเชิงลึก (เร็วๆ นี้)
          </Button>
          <Button size="sm" className="!h-9 !rounded-lg !bg-[#b45309] hover:!bg-[#92400e]">
            <Sparkles className="size-4 mr-2" />
            สร้างโปรเจกต์ใหม่
          </Button>
        </>
      }
    >
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8" data-testid="dashboard-kpis">
        {kpis.map(({ label, val, Icon, color }) => {
          const [bg, text] = colorMap[color].split(" · ");
          return (
            <Card key={label} className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm !transition-all !duration-200 hover:!shadow-md hover:-translate-y-0.5">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl grid place-items-center" style={{ backgroundColor: bg, color: text }}>
                  <Icon className="size-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">{label}</p>
                  <p className="text-2xl font-bold text-stone-900">{val}</p>
                </div>
                {val === 0 && label !== "สมาชิกในทีม" && (
                  <Badge variant="outline" className="!rounded-full !text-[10.5px] !bg-stone-50 !border-stone-200 text-stone-500">
                    Phase 2
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-8">
        <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm !transition-all !duration-200 hover:!shadow-md hover:-translate-y-0.5 lg:col-span-3">
          <CardHeader className="!p-5 !pb-0 flex-row items-center gap-3 !space-y-0">
            <LayoutDashboard className="size-5 text-amber-700" />
            <CardTitle className="text-[16px] font-semibold text-stone-900 flex-1">หมวดหมู่ Demo (7 Categories)</CardTitle>
            <Badge className="!rounded-full !text-[11px] !bg-emerald-100 !text-emerald-800 !border-transparent">{catArr.length} หมวด</Badge>
          </CardHeader>
          <CardContent className="!p-5 space-y-2" data-testid="dashboard-categories">
            {catArr.length === 0 ? (
              <p className="text-stone-500 text-center py-6 text-[13px]">ยังไม่มีหมวดหมู่</p>
            ) : (
              catArr.map((c: any) => {
                const ymyl = !!c.is_ymyl;
                const projCount = projArr.filter(p => Number(p.category_id || p.categoryId) === Number(c.id)).length;
                return (
                  <div
                    key={c.id}
                    data-testid={`cat-row-${c.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 hover:bg-amber-50/60 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg grid place-items-center bg-white border border-stone-200 text-lg">
                      {c.icon || "📁"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-[14px] text-stone-900 truncate">{c.name}</p>
                        {ymyl && (
                          <Badge className="!rounded-full !text-[10px] !bg-rose-100 !text-rose-700 !border-transparent inline-flex items-center gap-1">
                            <AlertTriangle className="size-2.5" /> YMYL
                          </Badge>
                        )}
                      </div>
                      <p className="text-[12px] text-stone-500">/{c.slug} · ID {c.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="!rounded-full !text-[11px]">{projCount} โปรเจกต์</Badge>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.is_active === false ? "#a8a29e" : projCount > 0 ? "#059669" : "#fbbf24" }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm !transition-all !duration-200 hover:!shadow-md hover:-translate-y-0.5 lg:col-span-2">
          <CardHeader className="!p-5 !pb-0 flex-row items-center gap-3 !space-y-0">
            <FolderKanban className="size-5 text-amber-700" />
            <CardTitle className="text-[16px] font-semibold text-stone-900 flex-1">โปรเจกต์ล่าสุด</CardTitle>
            <Badge className="!rounded-full !text-[11px] !bg-amber-100 !text-amber-900 !border-transparent">{projArr.length} รายการ</Badge>
          </CardHeader>
          <CardContent className="!p-5 space-y-3" data-testid="dashboard-recent-projects">
            {projArr.slice(0, 5).map((p: any) => {
              const catId = Number(p.category_id || p.categoryId);
              const ymyl = [3, 4, 5].includes(catId);
              const catName = ["ฟุตบอล", "มวย", "สล็อต", "หวย", "คาสิโน", "ไก่ชน", "วัวชน"][catId - 1] || "หมวดอื่น";
              return (
                <div key={p.id} data-testid={`proj-row-${p.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-stone-50 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-100 to-rose-100 grid place-items-center text-[15px]">
                    {["⚽", "🥊", "🎰", "🎲", "🎴", "🐓", "🐂"][catId - 1] || "📁"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13.5px] text-stone-900 truncate">{p.name || `โปรเจกต์ #${p.id}`}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="!rounded-full !text-[10.5px] !border-stone-200 text-stone-600">{catName}</Badge>
                      {ymyl && <span className="text-[10px] text-rose-600 font-semibold">⚠️ YMYL</span>}
                    </div>
                  </div>
                  {p.status === "archived"
                    ? <XCircle className="size-4 text-stone-400" />
                    : <CheckCircle2 className="size-4 text-emerald-600" />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <Card className="!rounded-2xl !border !border-dashed !border-amber-300 !bg-amber-50/40">
        <CardContent className="p-6 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-white border border-amber-200 grid place-items-center text-amber-700 shrink-0">
            <AlertTriangle className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[15px] text-stone-900 mb-1">Phase 1: Least Privilege Mode</h3>
            <p className="text-[13px] text-stone-600 leading-relaxed">
              ระบบปิดใช้งาน AI / LLM / SERP API ทั้งหมดตามขอบเขตใบงาน Phase 1 — KPI Cluster / Keyword Library จะมีค่าเป็น 0 จนกว่า Phase 2 (DataForSEO + Research Layer) จะเปิดใช้งาน
            </p>
          </div>
        </CardContent>
      </Card>
    </MainDashboardShell>
  );
}
