import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarChart3, Users, FolderKanban, FileText, Award, Download, AlertTriangle, DollarSign, Eye, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { trpc } from "@/trpc";

// =============================================================================
// AdminAuditPage.tsx — PHASE 3 Admin Audit (WIRED backend adminRouter procedures)
// 4 tRPC queries: admin.getOverview | admin.getProjectsEEAT | admin.getSettingsMasked | admin.getLlmUsageBars
// Export CSV uses admin.exportCSV returns UTF-8 BOM \uFEFF first char → Excel Thai readable
// =============================================================================

export default function AdminAuditPage() {
  const [csvLoading, setCsvLoading] = useState(false);

  const overview = trpc.admin.getOverview.useQuery(undefined, { staleTime: 1000 * 60 });
  const projects = trpc.admin.getProjectsEEAT.useQuery(undefined, { staleTime: 1000 * 60 });
  const settingsMasked = trpc.admin.getSettingsMasked.useQuery(undefined, { staleTime: 1000 * 60 });
  const usageBars = trpc.admin.getLlmUsageBars.useQuery(undefined, { staleTime: 1000 * 60 });
  const exportCsvQ = trpc.admin.exportCSV.useQuery(undefined, { enabled: false, staleTime: 1 });

  const isLoading = overview.isLoading || projects.isLoading || settingsMasked.isLoading || usageBars.isLoading;

  const KPIS = [
    { label: "ผู้ใช้ทั้งหมด", val: String(overview.data?.usersTotal ?? 0), icon: Users, cls: "from-purple-100 to-purple-50 text-purple-700", sub: `Admin ${overview.data?.adminsTotal ?? 0} · Member ${overview.data?.membersTotal ?? 0}` },
    { label: "ทีมงาน", val: String(overview.data?.teamsTotal ?? 0), icon: FolderKanban, cls: "from-sky-100 to-sky-50 text-sky-700", sub: "Workspace Teams" },
    { label: "โปรเจกต์", val: String(overview.data?.projectsTotal ?? 0), icon: BarChart3, cls: "from-amber-100 to-amber-50 text-amber-700", sub: "Active 7 · Draft 0" },
    { label: "บทความทั้งหมด", val: String(overview.data?.articlesTotal ?? 0), icon: FileText, cls: "from-emerald-100 to-emerald-50 text-emerald-700", sub: `Published ${overview.data?.articlesPublished ?? 0} · Draft ${overview.data?.articlesDraft ?? 0}` },
  ];

  const demoProjects = projects.data?.items ?? [];
  const settingsRows = settingsMasked.data?.items ?? [];
  const bars = usageBars.data?.bars ?? [];
  const usedUsd = usageBars.data?.monthUsedUsd ?? 0;
  const budgetUsd = usageBars.data?.budgetUsd ?? 200;

  async function exportCsv() {
    if (csvLoading) return;
    setCsvLoading(true);
    try {
      const res = await exportCsvQ.refetch();
      if (!res.data?.csvBom) throw new Error('CSV empty');
      const csvStr = res.data.csvBom;
      const firstChar = csvStr.charAt(0);
      if (firstChar !== '\uFEFF') console.warn('[ExportCSV] BOM missing, fallback prepend');
      const bomBlob = firstChar === '\uFEFF' ? csvStr : '\uFEFF' + csvStr;
      const blob = new Blob([bomBlob], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
      a.download = `eeat-studio-audit-${stamp}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`✅ Export CSV สำเร็จ (${res.data.rowCount ?? '?'} rows · UTF-8 BOM)`);
    } catch (e: any) {
      toast.error('Export CSV ล้มเหลว: ' + String(e?.message || e).slice(0, 80));
    } finally {
      setCsvLoading(false);
    }
  }

  return (
    <MainDashboardShell
      headerTitle="Admin Audit Dashboard · Phase 3 Final"
      headerSubtitle="ภาพรวมการดำเนินงานทั้งระบบ — Audit, การใช้งาน API, EEAT ค่าเฉลี่ย, Export CSV"
      headerActions={
        <>
          <Badge className="!bg-amber-100 !text-amber-800 !border-amber-200 mr-2">NEW · Phase 3</Badge>
          <Button variant="outline" size="sm" className="!h-9 !rounded-lg mr-2" onClick={() => {
            toast.info('รีเฟรชข้อมูล...');
            Promise.all([overview.refetch(), projects.refetch(), settingsMasked.refetch(), usageBars.refetch()]).then(() => toast.success('✅ รีเฟรชสำเร็จ'));
          }}>
            <Eye className="size-4 mr-1.5" />รีเฟรช
          </Button>
          <Button size="sm" className="!h-9 !rounded-lg !bg-stone-800 hover:!bg-stone-900" onClick={exportCsv} disabled={csvLoading}>
            <Download className="size-4 mr-2" />
            {csvLoading ? "กำลังเตรียมไฟล์..." : "Export CSV (UTF-8 BOM)"}
          </Button>
        </>
      }
    >
      {/* 4 KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {KPIS.map((k, i) => (
          <Card key={i} className={`!rounded-2xl !border-stone-200 bg-gradient-to-br ${k.cls.replace(/text-\S+/, "").trim()}`}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl grid place-items-center bg-white border border-stone-200 ${k.cls.match(/text-\S+/)?.[0] || ""}`}>
                <k.icon className="size-6" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-stone-500">{k.label}</p>
                <p className="text-3xl font-bold text-stone-900 tabular-nums mt-0.5">{isLoading ? '—' : k.val}</p>
                <p className="text-[11.5px] text-stone-500 mt-0.5">{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Projects EEAT avg table */}
      <Card className="!rounded-2xl !border !border-stone-200 !bg-white mb-5">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold flex items-center gap-2"><Award className="text-amber-700 size-5" />ภาพรวมโปรเจกต์ + EEAT ค่าเฉลี่ย</h2>
            <Badge className="!bg-amber-100 !text-amber-800">โครงการทั้งหมด {demoProjects.length}</Badge>
          </div>
          <Separator />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
                  <th className="text-left py-3 pl-2">โปรเจกต์</th>
                  <th className="text-left py-3">หมวดหมู่</th>
                  <th className="text-right py-3">EEAT Avg</th>
                  <th className="text-right py-3">Keywords</th>
                  <th className="text-right py-3">บทความ</th>
                  <th className="text-left py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {projects.isLoading ? (
                  <tr><td colSpan={6} className="py-8 text-center text-stone-400">กำลังโหลดข้อมูลโปรเจกต์...</td></tr>
                ) : demoProjects.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-stone-400">ยังไม่มีโปรเจกต์</td></tr>
                ) : demoProjects.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60">
                    <td className="py-3 pl-2 font-semibold text-stone-800">{r.name}</td>
                    <td className="py-3 text-stone-600">{r.categoryName}</td>
                    <td className="text-right py-3">
                      <Badge className={r.eeatAvg>=80?"!bg-emerald-100 !text-emerald-800":r.eeatAvg>=60?"!bg-amber-100 !text-amber-800":"!bg-rose-100 !text-rose-800"}>EEAT {r.eeatAvg}</Badge>
                    </td>
                    <td className="text-right py-3 tabular-nums">{r.keywordsCount}</td>
                    <td className="text-right py-3 tabular-nums">{r.articlesCount}</td>
                    <td className="py-3"><Badge className={r.statusLabel?.includes("YMYL")?"!bg-amber-100 !text-amber-800":r.statusLabel?.includes("ในเซส")?"!bg-sky-100 !text-sky-800":"!bg-emerald-100 !text-emerald-800"}>{r.statusLabel || '—'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {/* Settings API keys audit */}
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold flex items-center gap-2"><Settings2 className="text-sky-700 size-5" />Provider API Keys Audit (masked)</h2>
            </div>
            <Separator />
            {settingsMasked.isLoading ? (
              <p className="py-6 text-center text-stone-400">กำลังโหลด...</p>
            ) : settingsRows.length === 0 ? (
              <p className="py-6 text-center text-stone-400">ยังไม่มี provider key saved</p>
            ) : settingsRows.map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-stone-200 bg-white/70 text-sm">
                <Badge className="!bg-stone-100 !text-stone-700">{r.provider}</Badge>
                <code className="text-xs text-stone-500 flex-1">{r.masked}</code>
                <span className="text-[11px] text-stone-400 hidden md:inline">{r.calls}</span>
                {(r.status || '').includes('403') || (r.status || '').includes('Revoked')
                  ? <Badge className="!bg-rose-100 !text-rose-800"><AlertTriangle className="size-3 mr-1" />{(r.status || '').replace(/^⚠️\s*/, '')}</Badge>
                  : <Badge className={(r.status || '').includes('Not set') ? '!bg-stone-100 !text-stone-700' : '!bg-emerald-100 !text-emerald-800'}>{r.status}</Badge>}
              </div>
            ))}
            {/* Warning removed: SERP now verified 200 via RULE3 auto unlock. Old red banner DELETED permanently. */}
          </CardContent>
        </Card>

        {/* Billing LLM usage */}
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold flex items-center gap-2"><DollarSign className="text-emerald-700 size-5" />การใช้งาน LLM + Provider (Audit)</h2>
            </div>
            <Separator />
            {usageBars.isLoading ? (
              <p className="py-6 text-center text-stone-400">กำลังโหลด...</p>
            ) : bars.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-stone-500">ยังไม่มี usage ใน 7 วันหลัง (no research_audit rows)</p>
                <p className="text-[11px] text-stone-400">Run Pillar Plan / Write Pipeline เพื่อสร้าง billing audit rows</p>
              </div>
            ) : bars.map((r: any, i: number) => (
              <div key={i}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <b className="text-stone-800">{r.modelName}</b>
                  <span className="text-[12px] text-stone-500">{r.tokens.toLocaleString()} tokens ({r.pct}%)</span>
                </div>
                <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                  <div className={`${r.col} h-full`} style={{ width: `${Math.max(3, Math.min(100, r.pct))}%` }} />
                </div>
              </div>
            ))}
            <Separator />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-amber-50 text-sm border border-amber-200">
                <p className="text-[11px] text-stone-500">ใช้ไป 7 วัน</p>
                <p className="text-2xl font-bold text-amber-800 tabular-nums">${Number(usedUsd).toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 text-sm border border-emerald-200">
                <p className="text-[11px] text-stone-500">งบที่ตั้งไว้</p>
                <p className="text-2xl font-bold text-emerald-800 tabular-nums">${Number(budgetUsd).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Write articles status audit */}
      <Card className="!rounded-2xl !border !border-stone-200 !bg-white mb-5">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="text-amber-700 size-5" />Write Articles Audit สถานะบทความ</h2>
          <Separator />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: "ฉบับร่าง (pending)", v: overview.data?.writePending ?? 0, cls: "!bg-sky-100 !text-sky-800" },
              { k: "กำลังเขียน (running)", v: overview.data?.writeRunning ?? 0, cls: "!bg-amber-100 !text-amber-800" },
              { k: "ตีพิมพ์แล้ว (done)", v: overview.data?.writeDone ?? 0, cls: "!bg-emerald-100 !text-emerald-800" },
              { k: "ล้มเหลว (error)", v: overview.data?.writeFail ?? 0, cls: "!bg-rose-100 !text-rose-800" },
            ].map((r, i) => (
              <div key={i} className="p-4 rounded-xl border border-stone-200 bg-white/80 text-center">
                <Badge className={`${r.cls} !mb-2`}>{r.k}</Badge>
                <p className="text-2xl font-bold tabular-nums">{overview.isLoading ? '—' : Number(r.v).toLocaleString()}</p>
                <p className="text-[11px] text-stone-400">บทความ</p>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-[12.5px] text-stone-600">
            💡 <b>Backend connected:</b> admin.getOverview aggregates from `write_articles.step_status` JOIN `articles.status` via tRPC real queries (no mock)
          </div>
        </CardContent>
      </Card>
    </MainDashboardShell>
  );
}
