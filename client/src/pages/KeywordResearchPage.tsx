import { useState, useRef, useMemo } from "react";
import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Search, Loader2, ArrowRight, Target, Globe, ListOrdered, BarChart2, Upload, Layers } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function KeywordResearchPage() {
  const projectsQ = trpc.projects.list.useQuery();
  const projects = Array.isArray(projectsQ.data) ? (projectsQ.data as any[]) : [];
  const firstProjectId = useMemo(() => projects[0]?.id ?? projects[0]?.project_id ?? 90001, [projects]);
  const [projectId, setProjectId] = useState<number>(Number(firstProjectId));

  const [kw, setKw] = useState("สล็อตออนไลน์");
  const [loading, setLoading] = useState(false);
  const [gl, setGl] = useState<"th" | "us" | "jp">("th");
  const [hl, setHl] = useState<"th" | "en" | "ja">("th");
  const fileRef = useRef<HTMLInputElement>(null);

  const enrichSerpMut = trpc.keywords.enrichSerp.useMutation();
  const importCsvMut = trpc.keywords.importCsv.useMutation();
  const clusterMut = trpc.keywords.aiClusterize.useMutation();

  const enriching = enrichSerpMut.isPending || clusterMut.isPending || importCsvMut.isPending;

  async function runResearch() {
    const pid = Number(projectId);
    if (!pid || isNaN(pid) || pid <= 0) { toast.error("กรุณาเลือกโปรเจกต์ก่อนวิจัย"); return; }
    const seed = kw.trim();
    if (!seed || seed.length < 2) { toast.error("กรุณาใส่ Seed Keyword อย่างน้อย 2 ตัวอักษร"); return; }
    const loading = toast.loading(`🔍 เริ่มวิจัย "${seed.slice(0,30)}" — SERP enrich...`);
    try {
      const res = await enrichSerpMut.mutateAsync({ projectId: pid, keywordsTexts: [seed] });
      toast.dismiss(loading);
      const count = (res as any)?.enriched_count ?? 0;
      toast.success(`✅ SERP Enrich สำเร็จ: ${count} คำหลัก. avg SV: ${(res as any)?.avg_search_volume ?? 0}`);
    } catch (e: any) {
      toast.dismiss(loading);
      const emsg = String(e?.message ?? e ?? '').slice(0, 140);
      if (/SERP_AUTH_INVALID|403|Unauthorized|SERP_API_KEY/.test(emsg)) {
        toast.error(`🔑 [SERP_KEY_LOCKED] ไม่สามารถเข้าถึง SERP API ได้: ${emsg.slice(0,80)}`);
      } else if (/LLM_API_KEY_REQUIRED|LLM_AUTH_INVALID/.test(emsg)) {
        toast.error(`🔑 [LLM_KEY_LOCKED] ไม่สามารถเข้าถึง LLM ได้: ${emsg.slice(0,80)}`);
      } else {
        toast.error(`SERP Research ล้มเหลว: ${emsg}`);
      }
    }
  }

  function handlePickCsvClick() {
    fileRef.current?.click();
  }

  function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const pid = Number(projectId);
    if (!pid || isNaN(pid) || pid <= 0) { toast.error("กรุณาเลือกโปรเจกต์ก่อน Import CSV"); return; }
    const loadingToast = toast.loading(`📥 กำลังอ่านและส่ง CSV: ${file.name}`);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length === 0) { toast.dismiss(loadingToast); toast.error("CSV เปล่า"); return; }
      const first = parseCsvLine(lines[0].toLowerCase());
      let startIdx = 0;
      let kwCol = 0, volCol = -1, diffCol = -1;
      if (first.some(h => /keyword|keyword_text|คำหลัก|query/.test(h))) {
        startIdx = 1;
        first.forEach((h, i) => {
          if (/keyword|keyword_text|คำหลัก|query|คีย์|^kw$/.test(h)) kwCol = i;
          if (/volume|search[_ ]?volume|sv|จำนวน|ค้นหา/.test(h)) volCol = i;
          if (/difficulty|kd|keyword[_ ]?difficulty|ความยาก/.test(h)) diffCol = i;
        });
      }
      const rows: { keyword: string; volume?: number; difficulty?: number }[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length === 0) continue;
        const kword = (cols[kwCol] ?? '').trim();
        if (!kword || kword.length < 2) continue;
        const row: { keyword: string; volume?: number; difficulty?: number } = { keyword: kword };
        if (volCol >= 0 && cols[volCol] !== undefined) {
          const v = Number(String(cols[volCol] ?? '').replace(/[^0-9.-]/g, ''));
          if (!isNaN(v) && v >= 0) row.volume = v;
        }
        if (diffCol >= 0 && cols[diffCol] !== undefined) {
          const d = Number(String(cols[diffCol] ?? '').replace(/[^0-9.-]/g, ''));
          if (!isNaN(d) && d >= 0 && d <= 100) row.difficulty = d;
        }
        rows.push(row);
      }
      if (rows.length === 0) { toast.dismiss(loadingToast); toast.error("ไม่พบแถว keyword ที่ถูกต้องใน CSV"); return; }
      if (rows.length > 500) { toast.dismiss(loadingToast); toast.error(`เกิน 500 แถว (มี ${rows.length}) — แบ่งไฟล์น้อยกว่านี้`); return; }
      const res = await importCsvMut.mutateAsync({ projectId: pid, rows });
      toast.dismiss(loadingToast);
      const R = res as any;
      toast.success(`✅ Import CSV เสร็จ: ${R?.inserted ?? 0} ใหม่ · ${R?.updated ?? 0} อัปเดต · ${R?.skipped ?? 0} ข้าม (ทั้งหมด ${rows.length} แถว, unique ${R?.unique_count ?? rows.length})`);
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error(`Import CSV ล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleClusterClick() {
    const pid = Number(projectId);
    if (!pid || isNaN(pid) || pid <= 0) { toast.error("กรุณาเลือกโปรเจกต์ก่อน AI จัดกลุ่ม"); return; }
    const loadingToast = toast.loading(`🧠 เรียก AI จัดกลุ่ม keywords project #${pid} (3-tier tree: pillar/cluster/supporting)...`);
    try {
      const res = await clusterMut.mutateAsync({ projectId: pid });
      toast.dismiss(loadingToast);
      const R = res as any;
      toast.success(`✅ AI จัดกลุ่มสำเร็จ: ${R?.pillar_count ?? 0} Pillar · ${R?.cluster_count ?? 0} Cluster · ${R?.supporting_count ?? 0} Supporting · assigned ${R?.assigned_keywords ?? 0}/${R?.total_input_keywords ?? 0} คำหลัก`);
    } catch (e: any) {
      toast.dismiss(loadingToast);
      const emsg = String(e?.message ?? e ?? '').slice(0, 140);
      if (/NOT_ASSIGNED_KEYS/.test(emsg)) {
        toast.warning(`⚠️ ยังไม่มี keyword ที่ยังไม่ได้จัดกลุ่ม — Import CSV หรือ Run Research เพิ่มก่อน`);
      } else if (/LLM_API_KEY_REQUIRED|LLM_AUTH_INVALID/.test(emsg)) {
        toast.error(`🔑 [LLM_KEY_LOCKED] ไม่สามารถเข้าถึง LLM ได้: ${emsg.slice(0,80)}`);
      } else {
        toast.error(`AI Cluster ล้มเหลว: ${emsg}`);
      }
    }
  }

  const demoKws = [
    { kw: "สล็อตออนไลน์", kd: 68, vol: 14800, diff: "Hard", col: "rose-600" },
    { kw: "สล็อตแตกง่าย 2025", kd: 34, vol: 8400, diff: "Medium", col: "amber-600" },
    { kw: "สล็อตเว็บตรง ไม่ผ่านเอเยนต์", kd: 22, vol: 5200, diff: "Easy", col: "emerald-700" },
    { kw: "ค่ายสล็อตดีๆ 2025", kd: 17, vol: 3300, diff: "Easy", col: "emerald-700" },
    { kw: "สล็อต PG SLOT", kd: 58, vol: 12100, diff: "Hard", col: "rose-600" },
  ];

  return (
    <MainDashboardShell
      headerTitle="Keyword Research"
      headerSubtitle="ค้นหาคำหลักที่มี Search Volume สูง แต่ Keyword Difficulty ต่ำ — เทียบ OpenSEO 17.7k ⭐"
      headerActions={
        <>
          <Badge className="!bg-purple-100 !text-purple-700 !border-purple-200 mr-2">💜 OpenSEO Reference</Badge>
          <Button size="sm" variant="outline" className="!h-9 !rounded-lg mr-2" onClick={handlePickCsvClick} disabled={enriching}>
            {importCsvMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}
            {importCsvMut.isPending ? "กำลังนำเข้า..." : "นำเข้า CSV"}
          </Button>
          <Button size="sm" variant="outline" className="!h-9 !rounded-lg mr-2" onClick={handleClusterClick} disabled={enriching}>
            {clusterMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Layers className="size-4 mr-2" />}
            {clusterMut.isPending ? "จัดกลุ่ม..." : "AI จัดกลุ่ม (Tier)"}
          </Button>
          <Button size="sm" className="!h-9 !rounded-lg !bg-amber-700 hover:!bg-amber-800" onClick={runResearch} disabled={loading || enriching}>
            {loading || enrichSerpMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Search className="size-4 mr-2" />}
            {loading || enrichSerpMut.isPending ? "กำลังวิเคราะห์..." : "เริ่มวิจัยคำหลัก"}
          </Button>
        </>
      }
    >
      <input type="file" ref={fileRef} accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />

      <Card className="!rounded-2xl !border !border-stone-200 !bg-white mb-5">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1"><Target className="text-amber-700 size-5" /><h2 className="text-lg font-bold">ข้อมูล Input การวิจัย</h2></div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3">
              <label className="text-xs font-semibold block mb-1.5">โปรเจกต์เป้าหมาย</label>
              <Select value={String(projectId || '90001')} onValueChange={v => setProjectId(Number(v))}>
                <SelectTrigger className="!h-11">
                  <SelectValue placeholder="เลือกโปรเจกต์" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 && <SelectItem value="90001">Default Team Project</SelectItem>}
                  {projects.map((p: any) => (
                    <SelectItem key={String(p.id ?? p.project_id)} value={String(p.id ?? p.project_id)}>
                      {String(p.name ?? `Project #${p.id ?? p.project_id}`).slice(0, 40)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-5">
              <label className="text-xs font-semibold block mb-1.5">Keyword seed / Seed Keyword</label>
              <input value={kw} onChange={e => setKw(e.target.value)} className="w-full !h-11 rounded-lg border border-stone-200 px-4 outline-none focus:ring-2 focus:ring-amber-200" placeholder="คีย์หลักที่ต้องการวิจัย" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold block mb-1.5">GL (ประเทศ)</label>
              <select value={gl} onChange={e => setGl(e.target.value as any)} className="w-full !h-11 rounded-lg border border-stone-200 px-3 outline-none bg-white">
                <option value="th">🇹🇭 Thailand</option>
                <option value="us">🇺🇸 USA</option>
                <option value="jp">🇯🇵 Japan</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold block mb-1.5">HL (ภาษา)</label>
              <select value={hl} onChange={e => setHl(e.target.value as any)} className="w-full !h-11 rounded-lg border border-stone-200 px-3 outline-none bg-white">
                <option value="th">🇹🇭 ไทย</option>
                <option value="en">🇬🇧 English</option>
                <option value="ja">🇯🇵 日本語</option>
              </select>
            </div>
            <div className="md:col-span-3 md:col-start-10 flex items-end gap-2">
              <Button variant="outline" className="w-1/2 !h-11" onClick={handlePickCsvClick} disabled={enriching}>
                {importCsvMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}
                Import CSV
              </Button>
              <Button className="w-1/2 !bg-amber-700 hover:!bg-amber-800 !h-11" onClick={runResearch} disabled={loading || enriching}>
                {loading || enrichSerpMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <ArrowRight className="size-4 mr-2" />}วิจัยเลย
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="!rounded-2xl !border !border-stone-200 !bg-white mb-5">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2"><ListOrdered className="text-amber-700 size-5" /><h2 className="text-lg font-bold">ผลลัพธ์ Keyword Suggestions</h2></div>
            <div className="flex items-center gap-2">
              <Badge className="!bg-stone-100 !text-stone-700 mr-2">Demo Data</Badge>
              <Button size="sm" variant="outline" className="!h-8 !rounded-lg" onClick={handleClusterClick} disabled={enriching}>
                {clusterMut.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Layers className="size-3.5 mr-1.5" />}
                AI จัดกลุ่ม
              </Button>
            </div>
          </div>
          <Separator />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
                  <th className="text-left py-3 pl-2">Keyword</th>
                  <th className="text-right py-3">Search Vol / เดือน</th>
                  <th className="text-right py-3">Keyword Difficulty</th>
                  <th className="text-left py-3">ระดับความยาก</th>
                </tr>
              </thead>
              <tbody>
                {demoKws.map((r, i) => (
                  <tr key={i} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60">
                    <td className="py-3 pl-2 font-semibold text-stone-800">{r.kw}</td>
                    <td className="text-right py-3 tabular-nums">{r.vol.toLocaleString()}</td>
                    <td className="text-right py-3 tabular-nums"><span className={`font-bold text-${r.col}`}>{r.kd}</span> / 100</td>
                    <td className="py-3"><Badge className={r.diff === "Hard" ? "!bg-rose-100 !text-rose-700" : r.diff === "Medium" ? "!bg-amber-100 !text-amber-800" : "!bg-emerald-100 !text-emerald-800"}>{r.diff}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[13px]">
            🛠️ <b>Pipeline ครบแล้ว:</b> Import CSV (keywords) → Enrich SERP (searchVolume + difficulty via DataForSEO) → AI Cluster (3-tier tree pillar/cluster/supporting via LLM) → ส่งต่อไป Keyword Cluster Planner เขียนบทความ
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <Card className="!rounded-2xl !border !border-sky-200 !bg-sky-50/40">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2"><Globe className="text-sky-700 size-5" /><h2 className="font-bold">SERP Organic Top 10 (ตัวอย่าง)</h2></div>
            <Separator />
            {["1. maxbet.club — สล็อตออนไลน์ เว็บตรง ไม่ผ่านเอเยนต์ 2025", "2. sgaming99.com — รีวิวค่ายสล็อตดีที่สุด ปี 2568", "3. onlinecasino.ac — สล็อตแตกง่าย 10 อันดับแรก"].map((t, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-sky-100 text-sm">{t}</div>
            ))}
          </CardContent>
        </Card>
        <Card className="!rounded-2xl !border !border-purple-200 !bg-purple-50/40">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2"><BarChart2 className="text-purple-700 size-5" /><h2 className="font-bold">People Also Ask (PAA) คำถามที่คนมักถาม</h2></div>
            <Separator />
            {["สล็อตออนไลน์ คืออะไร?", "วิธีเล่นสล็อตให้ได้เงินจริง?", "สล็อตแตกง่าย มีเทคนิคหรือไม่?", "ค่าย PG SLOT ดีไหม?"].map((q, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-purple-100 text-sm">❓ {q}</div>
            ))}
          </CardContent>
        </Card>
      </div>
    </MainDashboardShell>
  );
}
