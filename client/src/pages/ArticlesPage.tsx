import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Pencil, Eye, Trash2, Search, Filter, Calendar, Hash, Award, BookCheck, Clock, Share2, Copy, CheckCheck, X, Loader2 } from "lucide-react";
import { trpc } from "@/trpc";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import useAuth, { isUserAdminOrOwner } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsList, TabsTrigger, TabsContent
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ArticlesPage() {
  const [, setLocation] = useLocation();
  const list = trpc.projects.list.useQuery();
  const projects = Array.isArray(list.data) ? (list.data as any[]) : [];
  const { user } = useAuth();
  const isAdmin = isUserAdminOrOwner(user);
  const [projectId, setProjectId] = useState<number | "all">("all");
  const [fQuery, setFQuery] = useState("");
  const [fStatus, setFStatus] = useState<"" | "draft" | "published">("");
  const [fFilterPrjId, setFFilterPrjId] = useState<string>("");
  const [fMinEeat, setFMinEeat] = useState<string>("");
  const [fOnlyUpdated7d, setFOnlyUpdated7d] = useState(false);
  const [openFilter, setOpenFilter] = useState(false);
  const [openPreview, setOpenPreview] = useState<any>(null); // { id, title, content, metaTitle, metaDescription, status }
  const [openShare, setOpenShare] = useState<any>(null); // { id, title }
  const [copied, setCopied] = useState<boolean>(false);
  const [openDel, setOpenDel] = useState<any>(null); // { id, title }

  const arts = trpc.write.listByProject.useQuery(
    { projectId: Number(projectId), limit: 100, status: undefined as any },
    { enabled: projectId !== "all", staleTime: 1000 * 30, refetchOnWindowFocus: false }
  );
  const allProjectsArticles = trpc.useQueries((t) =>
    projects.map((p: any) => t.write.listByProject({ projectId: Number(p.id), limit: 50, status: undefined as any }))
  );

  // tRPC 3 mutations (publish already)
  const publishMut = trpc.write.publish.useMutation();
  const deleteMut = trpc.write.delete.useMutation();
  const utils = trpc.useContext();

  function invalidateAll() {
    try {
      if (projectId !== "all") arts.refetch();
      else allProjectsArticles.forEach((r: any) => r.refetch?.());
      (utils as any).write.listByProject.invalidate?.();
    } catch { /* ignore */ }
  }

  function togglePublish(row: any, e: any) {
    e.preventDefault(); e.stopPropagation();
    const willPub = row.status !== 'published';
    if (!isAdmin) { toast.error('สิทธิ์ไม่เพียงพอ: ต้องเป็น Admin เท่านั้นที่ตีพิมพ์ได้'); return; }
    publishMut.mutate({ draftId: Number(row.id), unpublish: willPub ? false : true }, {
      onSuccess(r: any) {
        if (r?.ok) {
          toast.success(r.message || (willPub ? '✅ ตีพิมพ์เรียบร้อย step 10' : 'ย้อนกลับเป็นฉบับร่าง'));
          invalidateAll();
        } else {
          toast.error(`Publish fail: ${r?.message ?? 'unknown'}`);
        }
      }, onError(err){ toast.error('Publish error: '+String((err as any)?.message ?? err).slice(0,120)); }
    });
  }

  // Filter pipeline useMemo 6 conditions: query, status, project, minEEAT, 7d updated
  const rows = useMemo(() => {
    let all: any[] = [];
    if (projectId === "all") {
      allProjectsArticles.forEach((res: any) => {
        if (Array.isArray(res?.data?.items)) all = all.concat(res.data.items);
      });
    } else if (Array.isArray(arts?.data?.items)) {
      all = arts.data.items.slice();
    }
    // 1. query: title OR keyword OR content
    const q = fQuery.trim().toLowerCase();
    if (q) {
      all = all.filter(r => {
        const t = String(r?.title ?? '').toLowerCase();
        const kw = String(r?.keyword ?? r?.keywordId ?? '').toLowerCase();
        const mt = String(r?.metaTitle ?? '').toLowerCase();
        const md = String(r?.metaDescription ?? '').toLowerCase();
        return t.includes(q) || kw.includes(q) || mt.includes(q) || md.includes(q);
      });
    }
    // 2. status (Tabs: handled by Tabs trigger filter below separately, allow dialog fine tune here too)
    if (fStatus) all = all.filter(r => r.status === fStatus);
    // 3. project id extra filter (overrides top select if dialog set)
    if (fFilterPrjId && /^\d+$/.test(fFilterPrjId)) {
      const idWant = Number(fFilterPrjId);
      all = all.filter(r => Number(r?.projectId ?? r?.project_id ?? -1) === idWant);
    }
    // 4. min EEAT
    if (fMinEeat && /^\d+$/.test(fMinEeat)) {
      const want = Number(fMinEeat);
      all = all.filter(r => Number(r?.eeatScore ?? r?.eeat_score ?? 0) >= want);
    }
    // 5. only updated within 7 days
    if (fOnlyUpdated7d) {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      all = all.filter(r => r.updatedAt ? new Date(r.updatedAt as any).getTime() >= cutoff : false);
    }
    return all.sort((a,b) => (b.updatedAt ? new Date(b.updatedAt as any).getTime() : 0) - (a.updatedAt ? new Date(a.updatedAt as any).getTime() : 0));
  }, [projectId, arts.data, allProjectsArticles, fQuery, fStatus, fFilterPrjId, fMinEeat, fOnlyUpdated7d]);

  function resetFilter() {
    setFStatus(""); setFFilterPrjId(""); setFMinEeat(""); setFOnlyUpdated7d(false);
    toast.info('ล้างตัวกรองแล้ว แสดงบทความทั้งหมด');
  }
  const hasActiveFilters = Boolean(fStatus || fFilterPrjId || fMinEeat || fOnlyUpdated7d);

  const draftCount = rows.filter(r => r.status === 'draft').length;
  const pubCount = rows.filter(r => r.status === 'published').length;
  const avgWords = rows.length ? Math.round(rows.reduce((n,r)=>n+Number(r.wordCount||0),0)/rows.length) : 0;
  const avgEeat = rows.length ? Math.round(rows.reduce((n,r)=>n+Number(r.eeatScore||0),0)/rows.length) : 0;

  const isLoadingArticles = projectId === 'all'
    ? (list.isLoading || (Array.isArray(allProjectsArticles) && allProjectsArticles.some((r:any)=>r?.isLoading)))
    : (arts.isLoading || list.isLoading);
  const loadingSkeleton = (
    <div className="kcp-skeleton-shimmer rounded-2xl p-4 space-y-3">
      <div className="h-10 bg-stone-200 rounded-lg w-full"></div>
      <div className="h-14 bg-stone-200 rounded-lg w-full"></div>
      <div className="h-14 bg-stone-200 rounded-lg w-11/12"></div>
      <div className="h-14 bg-stone-200 rounded-lg w-10/12"></div>
      <div className="h-14 bg-stone-200 rounded-lg w-full"></div>
      <div className="h-14 bg-stone-200 rounded-lg w-9/12"></div>
    </div>
  );

  // Preview handler
  const previewMut = trpc.write.getDraft.useQuery({ draftId: Number(openPreview?.id || 0) }, { enabled: !!openPreview && !!Number(openPreview?.id) });
  function openPreviewFor(row: any) {
    setOpenPreview({ id: row.id, title: row.title || `บทความ #${row.id}`, eeat: row.eeatScore, words: row.wordCount });
  }

  // Share handler
  function openShareFor(row: any) {
    setOpenShare({ id: row.id, title: row.title || `บทความ #${row.id}` });
    setCopied(false);
  }
  function copyShare() {
    if (!openShare?.id) return;
    const url = `${window.location.origin}/articles/${openShare.id}/edit`;
    try {
      (navigator as any).clipboard.writeText(url);
      setCopied(true);
      toast.success('✅ คัดลอกลิงก์บทความแล้ว');
      setTimeout(() => setCopied(false), 2200);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        setCopied(true); toast.success('✅ คัดลอกลิงก์แล้ว');
        setTimeout(() => setCopied(false), 2200);
      } catch { toast.error('คัดลอกล้มเหลว กรุณา copy manually'); }
    }
  }

  // Delete handler (confirm dialog flow)
  function openDelFor(row: any) { setOpenDel({ id: row.id, title: row.title || `บทความ #${row.id}` }); }
  function confirmDelete() {
    if (!openDel?.id) return;
    deleteMut.mutate({ draftId: Number(openDel.id) }, {
      onSuccess(r: any) {
        if (r?.ok) {
          toast.success(r.message || `ลบบทความ #${openDel.id} แล้ว`);
          setOpenDel(null); invalidateAll();
        } else toast.error(`ลบไม่สำเร็จ: ${r?.message || 'unknown'}`);
      },
      onError(err) { toast.error(`Delete error: ${String((err as any)?.message ?? err).slice(0, 140)}`); }
    });
  }

  const goEdit = (id:number) => setLocation(`/write?draft_id=${id}`);

  const resultBadge = (
    <>
      {fQuery && <Badge variant="secondary" className="!rounded-full !bg-stone-100 !text-stone-700 hover:!bg-stone-200 flex items-center gap-1 px-3 py-1">ค้นหา: {fQuery.slice(0, 32)} <button onClick={() => setFQuery("")} className="text-stone-500 hover:text-rose-500 ml-1"><X className="size-3" /></button></Badge>}
      {fStatus && <Badge variant="secondary" className="!rounded-full !bg-stone-100 !text-stone-700 hover:!bg-stone-200 flex items-center gap-1 px-3 py-1">สถานะ: {fStatus === 'draft' ? 'ร่าง' : 'ตีพิมพ์'} <button onClick={() => setFStatus("")} className="text-stone-500 hover:text-rose-500 ml-1"><X className="size-3" /></button></Badge>}
      {fFilterPrjId && <Badge variant="secondary" className="!rounded-full !bg-stone-100 !text-stone-700 hover:!bg-stone-200 flex items-center gap-1 px-3 py-1">โปรเจกต์: {projects.find((p:any)=>Number(p.id)===Number(fFilterPrjId))?.name?.slice?.(0,24) || `#${fFilterPrjId}`} <button onClick={() => setFFilterPrjId("")} className="text-stone-500 hover:text-rose-500 ml-1"><X className="size-3" /></button></Badge>}
      {fMinEeat && <Badge variant="secondary" className="!rounded-full !bg-stone-100 !text-stone-700 hover:!bg-stone-200 flex items-center gap-1 px-3 py-1">EEAT ≥ {fMinEeat} <button onClick={() => setFMinEeat("")} className="text-stone-500 hover:text-rose-500 ml-1"><X className="size-3" /></button></Badge>}
      {fOnlyUpdated7d && <Badge variant="secondary" className="!rounded-full !bg-stone-100 !text-stone-700 hover:!bg-stone-200 flex items-center gap-1 px-3 py-1">แก้ไข 7 วันล่าสุด <button onClick={() => setFOnlyUpdated7d(false)} className="text-stone-500 hover:text-rose-500 ml-1"><X className="size-3" /></button></Badge>}
      {hasActiveFilters && <button onClick={resetFilter} className="!h-7 text-[12px] text-stone-500 hover:text-rose-600 underline underline-offset-2">ล้างทั้งหมด</button>}
    </>
  );

  return (
    <MainDashboardShell
      headerTitle="บทความ / ตีพิมพ์"
      headerSubtitle={`Phase 2D Write Pipeline · Total ${rows.length} ฉบับ · ร่าง ${draftCount} · ตีพิมพ์ ${pubCount} · ความยาวเฉลี่ย ${avgWords} คำ · EEAT Score เฉลี่ย ${avgEeat}/100`}
      headerActions={
        <>
          <div className="relative mr-2">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <Input className="!h-9 !pl-8 pr-3 w-64 !rounded-lg !text-[13px] !bg-white" placeholder="ค้นหาบทความ (ชื่อ / คำสำคัญ / meta title / meta desc)" value={fQuery} onChange={e=>setFQuery(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" className="!h-9 !rounded-lg relative" onClick={()=>setOpenFilter(true)}>
            <Filter className="size-4 mr-2" />
            ตัวกรอง
            {hasActiveFilters && <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-full !bg-rose-500 ring-2 ring-white"></span>}
          </Button>
          <Button size="sm" className="!h-9 !rounded-lg !bg-[#b45309] hover:!bg-[#92400e]" onClick={() => { toast.success('💡 กำลังไปยัง Keyword Cluster Planner — เลือก Tier = Cluster/Supporting → คลิก เขียนบทความ (สร้าง Draft EEAT 1500+ คำอัตโนมัติ)'); setTimeout(() => setLocation('/kcp'), 350); }}>
            <Plus className="size-4 mr-2" />
            เขียนบทความใหม่
          </Button>
        </>
      }
    >
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white !shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-stone-100 text-stone-700 grid place-items-center"><FileText className="size-6" /></div>
            <div><p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">รวมทั้งหมด</p><p className="text-2xl font-bold text-stone-900">{rows.length}</p></div>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white !shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 grid place-items-center"><Clock className="size-6" /></div>
            <div><p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">ฉบับร่าง</p><p className="text-2xl font-bold text-stone-900">{draftCount}</p></div>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white !shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 grid place-items-center"><BookCheck className="size-6" /></div>
            <div><p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">ตีพิมพ์แล้ว</p><p className="text-2xl font-bold text-stone-900">{pubCount}</p></div>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white !shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-800 grid place-items-center"><Award className="size-6" /></div>
            <div><p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">EEAT Score เฉลี่ย</p><p className="text-2xl font-bold text-stone-900">{avgEeat}<span className="text-sm text-stone-500 ml-1">/ 100</span></p></div>
          </CardContent>
        </Card>
      </section>

      <Card className="!rounded-2xl !border !border-stone-200 !bg-white !shadow-sm mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <Label className="text-[13px] text-stone-600 !mb-0">เลือกโปรเจกต์หลัก</Label>
            <select value={String(projectId)} onChange={e=>setProjectId(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="!h-9 rounded-lg border border-stone-200 bg-white text-[13px] px-3 outline-none focus:ring-2 focus:ring-amber-200 min-w-[260px]">
              <option value="all">ทุกโปรเจกต์</option>
              {projects.map((p:any)=>(<option key={p.id} value={p.id}>{p.name || p.title || `โปรเจกต์ #${p.id}`}</option>))}
            </select>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {resultBadge}
            </div>
          </div>
          <Tabs defaultValue="all">
            <TabsList className="mb-4 bg-stone-100 p-1 rounded-xl">
              <TabsTrigger value="all" className="data-[state=active]:!bg-white data-[state=active]:!shadow-sm !rounded-lg !text-[13px]">ทั้งหมด · {rows.length}</TabsTrigger>
              <TabsTrigger value="draft" className="data-[state=active]:!bg-white data-[state=active]:!shadow-sm !rounded-lg !text-[13px]">ฉบับร่าง · {draftCount}</TabsTrigger>
              <TabsTrigger value="published" className="data-[state=active]:!bg-white data-[state=active]:!shadow-sm !rounded-lg !text-[13px]">ตีพิมพ์แล้ว · {pubCount}</TabsTrigger>
            </TabsList>
            <TabsContent value="all">{isLoadingArticles ? loadingSkeleton : rowsToTable(rows, { isAdmin, onToggle: togglePublish, goEdit, onPreview: openPreviewFor, onShare: openShareFor, onDelete: openDelFor, goKcp: () => setLocation('/kcp'), publishLoading: publishMut.isLoading, deleteLoading: deleteMut.isLoading })}</TabsContent>
            <TabsContent value="draft">{isLoadingArticles ? loadingSkeleton : rowsToTable(rows.filter(r=>r.status==='draft'), { isAdmin, onToggle: togglePublish, goEdit, onPreview: openPreviewFor, onShare: openShareFor, onDelete: openDelFor, goKcp: () => setLocation('/kcp'), publishLoading: publishMut.isLoading, deleteLoading: deleteMut.isLoading })}</TabsContent>
            <TabsContent value="published">{isLoadingArticles ? loadingSkeleton : rowsToTable(rows.filter(r=>r.status==='published'), { isAdmin, onToggle: togglePublish, goEdit, onPreview: openPreviewFor, onShare: openShareFor, onDelete: openDelFor, goKcp: () => setLocation('/kcp'), publishLoading: publishMut.isLoading, deleteLoading: deleteMut.isLoading })}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Filter Dialog */}
      <Dialog open={openFilter} onOpenChange={setOpenFilter}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>ตัวกรองบทความ</DialogTitle>
            <DialogDescription>ปรับแต่งมุมมองบทความตามเงื่อนไขหลายรายการ · ผลลัพธ์ปัจจุบัน {rows.length} รายการ</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div>
              <Label>สถานะบทความ</Label>
              <Select value={fStatus || "all"} onValueChange={v => setFStatus(v === "all" ? "" : (v as any))}>
                <SelectTrigger className="!h-9 !mt-1.5"><SelectValue placeholder="สถานะทั้งหมด" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">สถานะทั้งหมด</SelectItem>
                  <SelectItem value="draft">เฉพาะ ฉบับร่าง</SelectItem>
                  <SelectItem value="published">เฉพาะ ตีพิมพ์แล้ว</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>โปรเจกต์ (กรองเพิ่มเติม)</Label>
              <Select value={fFilterPrjId || "all"} onValueChange={v => setFFilterPrjId(v === "all" ? "" : String(v))}>
                <SelectTrigger className="!h-9 !mt-1.5"><SelectValue placeholder="ทุกโปรเจกต์" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกโปรเจกต์</SelectItem>
                  {projects.map((p:any)=><SelectItem key={p.id} value={String(p.id)}>{String(p.name || p.title || `โปรเจกต์ #${p.id}`).slice(0, 60)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>EEAT Score ขั้นต่ำ (0-100)</Label>
                <Input type="number" min={0} max={100} className="!h-9 !mt-1.5" placeholder="เช่น 80" value={fMinEeat} onChange={e=>setFMinEeat(e.target.value.replace(/\D/g,'').slice(0,3))} />
              </div>
              <div className="grid items-center">
                <Label className="flex items-center gap-2 !mt-1.5 cursor-pointer select-none">
                  <input type="checkbox" className="!rounded !border-stone-300 !w-4 !h-4" checked={fOnlyUpdated7d} onChange={e=>setFOnlyUpdated7d(e.target.checked)} />
                  <span>แก้ไขภายใน 7 วันล่าสุดเท่านั้น</span>
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={resetFilter} className="text-stone-500 hover:text-rose-500">ล้างตัวกรอง</Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={()=>setOpenFilter(false)}>ยกเลิก</Button>
              <Button onClick={()=>setOpenFilter(false)} className="!bg-[#b45309] hover:!bg-[#92400e]">
                {hasActiveFilters ? `นำไปใช้ (${rows.length})` : `นำไปใช้`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog (content) */}
      <Dialog open={!!openPreview && !!Number(openPreview?.id)} onOpenChange={(o)=>{ if(!o) setOpenPreview(null); }}>
        <DialogContent className="sm:max-w-[780px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="pr-10">
              {openPreview?.title || 'ตัวอย่างบทความ'}
              {openPreview?.eeat !== undefined && <Badge variant="outline" className="!ml-3 !bg-amber-50 !text-amber-700 !border-amber-300">EEAT {openPreview.eeat ?? '-'}/100</Badge>}
            </DialogTitle>
            <DialogDescription>
              Preview id={openPreview?.id || '-'} · {openPreview?.words ? `${openPreview.words.toLocaleString()} คำ` : ''}
            </DialogDescription>
          </DialogHeader>
          {previewMut.isLoading && <div className="p-6 text-center text-stone-500"><Loader2 className="size-6 inline animate-spin mr-2" /> กำลังโหลดเนื้อหา...</div>}
          {previewMut.error && <div className="p-4 text-rose-600">โหลดตัวอย่างไม่สำเร็จ: {String((previewMut.error as any)?.message ?? previewMut.error).slice(0,180)}</div>}
          {!previewMut.isLoading && !previewMut.error && previewMut.data?.ok && previewMut.data.draft && (
            <div className="overflow-y-auto pr-2">
              <div className="p-1">
                {previewMut.data.draft.meta_title && <div className="mb-3"><Badge variant="outline" className="!text-[11px] !text-stone-500">Meta Title</Badge> <p className="text-[13px] text-stone-700 mt-1">{previewMut.data.draft.meta_title}</p></div>}
                {previewMut.data.draft.meta_description && <div className="mb-3"><Badge variant="outline" className="!text-[11px] !text-stone-500">Meta Description</Badge> <p className="text-[13px] text-stone-700 mt-1">{previewMut.data.draft.meta_description}</p></div>}
                <div className="border-t border-stone-200 pt-4 mt-4">
                  <article className="prose prose-stone prose-sm max-w-none text-stone-800 leading-relaxed whitespace-pre-wrap">
                    {previewMut.data.draft.content || <span className="text-stone-400">ยังไม่มีเนื้อหาบทความ</span>}
                  </article>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex items-center justify-between pt-4 border-t border-stone-100 mt-3">
            <div></div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={()=>setOpenPreview(null)}>ปิด</Button>
              <Button onClick={()=>{ goEdit(Number(openPreview?.id)); setOpenPreview(null); }} className="!bg-[#b45309] hover:!bg-[#92400e]"><Pencil className="size-4 mr-2" />ไปแก้ไข</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={!!openShare && !!Number(openShare?.id)} onOpenChange={(o)=>{ if(!o) setOpenShare(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>แชร์ลิงก์แก้ไขบทความ</DialogTitle>
            <DialogDescription>ส่งลิงก์ให้ทีมงานเพื่อไปแก้ไขต่อ (จำเป็นต้อง login ด้วยบัญชีที่มีสิทธิ์โปรเจกต์เดียวกัน)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>บทความ</Label>
              <div className="mt-1 p-3 rounded-xl bg-stone-50 text-[13px] text-stone-800 border border-stone-200">
                {String(openShare?.title ?? '').slice(0, 180) || <span className="text-stone-400">ไม่มีชื่อ</span>}
              </div>
            </div>
            <div>
              <Label>ลิงก์ URL</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input readOnly className="!h-9 !bg-stone-50" value={openShare?.id ? `${window.location.origin}/articles/${openShare.id}/edit` : ''} />
                <Button variant={copied ? "default" : "outline"} className={`!h-9 ${copied ? '!bg-emerald-700 hover:!bg-emerald-800' : ''}`} onClick={copyShare}>
                  {copied ? <CheckCheck className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpenShare(null)}>ปิด</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm AlertDialog */}
      <AlertDialog open={!!openDel && !!Number(openDel?.id)} onOpenChange={(o)=>{ if(!o) setOpenDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันลบบทความ # {openDel?.id}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2">
              <p className="text-stone-700">{String(openDel?.title ?? '').slice(0, 200) || ''}</p>
              <ul className="list-disc pl-5 text-[13px] space-y-1 text-stone-600">
                <li><strong className="text-stone-700">จะลบถาวร</strong> ทั้งเนื้อหา + workflow step tracking (write_articles) คู่กัน (SA AC-6: DELETE row data only NO ALTER)</li>
                <li>ไม่สามารถกู้คืนกลับมาได้</li>
                <li>บทความลบแล้วจะไม่นับรวมในรายงาน EEAT / Admin Audit อีกต่อไป</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleteMut.isLoading}
              className="!h-9 !bg-rose-600 hover:!bg-rose-700 text-white"
            >
              {deleteMut.isLoading ? <Loader2 className="size-4 mr-2 inline animate-spin" /> : <Trash2 className="size-4 mr-2 inline" />}
              {deleteMut.isLoading ? 'กำลังลบ...' : 'ยืนยันลบถาวร'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainDashboardShell>
  );
}

function eeatBadgeInline(v: any) {
  const n = Number(v||0);
  if (n >= 80) return <Badge className="!bg-emerald-100 !text-emerald-800 !border !border-emerald-200 !align-middle">ดีมาก · {n}</Badge>;
  if (n >= 60) return <Badge className="!bg-amber-100 !text-amber-800 !border !border-amber-200 !align-middle">ดี · {n}</Badge>;
  if (n >= 40) return <Badge className="!bg-orange-100 !text-orange-800 !border !border-orange-200 !align-middle">พอใช้ · {n}</Badge>;
  return <Badge className="!bg-stone-100 !text-stone-600 !border !border-stone-200 !align-middle">ยังไม่ประเมิน · {n||0}</Badge>;
}

function eeatBadge(v: any) { return eeatBadgeInline(v); }

function rowsToTable(rows: any[], ctx: { isAdmin: boolean; onToggle:(row:any,e:any)=>void; goEdit:(id:number)=>void; onPreview:(row:any)=>void; onShare:(row:any)=>void; onDelete:(row:any)=>void; goKcp?:()=>void; publishLoading?: boolean; deleteLoading?: boolean; }) {
  if (!rows.length) return <div className="p-10 text-center text-stone-500 text-[14px]">
    <Hash className="size-12 text-stone-300 mx-auto mb-3" />
    <p className="font-medium text-stone-700 mb-1">ยังไม่มีบทความในมุมมองนี้</p>
    <p className="text-[12px] mt-1 text-stone-400 mb-4">ไปที่ Keyword Cluster Planner → เลือกคำสำคัญ Tier=Cluster/Supporting → คลิก เขียนบทความ</p>
    <Button className="!bg-amber-700 hover:!bg-amber-800" onClick={() => { if (ctx.goKcp) ctx.goKcp(); else { window.location.pathname = '/kcp'; window.dispatchEvent(new PopStateEvent('popstate')); } }}>
      <Plus className="size-4 mr-2" />
      ไปสร้าง Draft จาก Keyword KCP
    </Button>
  </div>;
  return <div className="overflow-x-auto">
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-stone-200 text-stone-500 text-left">
          <th className="py-3 px-3 text-[11px] uppercase tracking-wider">ชื่อบทความ</th>
          <th className="py-3 px-3 text-[11px] uppercase tracking-wider">สถานะ</th>
          <th className="py-3 px-3 text-[11px] uppercase tracking-wider text-right">คำ</th>
          <th className="py-3 px-3 text-[11px] uppercase tracking-wider text-center">EEAT</th>
          <th className="py-3 px-3 text-[11px] uppercase tracking-wider text-right">อ้างอิง</th>
          <th className="py-3 px-3 text-[11px] uppercase tracking-wider"><Calendar className="inline size-3.5 mr-1 opacity-60" />แก้ไขล่าสุด</th>
          <th className="py-3 px-3 text-right text-[11px] uppercase tracking-wider">ดำเนินการ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50/60 transition">
          <td className="py-3 px-3">
            <button type="button" className="text-left group" onClick={()=>ctx.goEdit(Number(r.id))} title="คลิกเพื่อไปแก้ไข">
              <span className="font-medium text-stone-800 group-hover:text-amber-700 transition">{String(r.title ?? '').slice(0, 120) || <span className="text-stone-400">ไม่มีชื่อ</span>}</span>
              <Pencil className="size-3 inline ml-1 text-stone-300 group-hover:text-amber-600 opacity-0 group-hover:opacity-100 transition" />
            </button>
          </td>
          <td className="py-3 px-3 flex items-center gap-2 flex-wrap">{r.status === 'published' ? <Badge className="!bg-emerald-100 !text-emerald-800 !border !border-emerald-200">ตีพิมพ์</Badge> : (<><Badge className="!bg-amber-100 !text-amber-800 !border !border-amber-200">ร่าง</Badge>{String(r.stepStatus || '') === 'fail' && <Badge className="!bg-rose-100 !text-rose-700 !border !border-rose-200" title={String(r.errorMsg || '')}>⚠️ มี Placeholder ห้าม Publish</Badge>}</>)}</td>
          <td className="py-3 px-3 text-right text-stone-700 tabular-nums">{Number(r.wordCount||0).toLocaleString()}</td>
          <td className="py-3 px-3 text-center">{eeatBadge(r.eeatScore)}</td>
          <td className="py-3 px-3 text-right tabular-nums text-stone-700">{Number(r.citationsCount||0)}</td>
          <td className="py-3 px-3 text-stone-500 text-[12px]">{r.updatedAt ? new Date(r.updatedAt as any).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
          <td className="py-3 px-3">
            <div className="flex items-center justify-end gap-1.5">
              <Button variant="ghost" size="sm" className="!h-8 !px-2 !rounded-lg text-stone-600 hover:!bg-stone-100" onClick={()=>ctx.goEdit(Number(r.id))} title="แก้ไข"><Pencil className="size-4" /></Button>
              <Button variant="ghost" size="sm" className="!h-8 !px-2 !rounded-lg text-stone-600 hover:!bg-stone-100" onClick={()=>ctx.onPreview(r)} title="แสดงตัวอย่าง"><Eye className="size-4" /></Button>
              <Button variant="ghost" size="sm" className="!h-8 !px-2 !rounded-lg text-stone-600 hover:!bg-stone-100" onClick={()=>ctx.onShare(r)} title="แชร์ลิงก์แก้ไข"><Share2 className="size-4" /></Button>
              <Button
                size="sm"
                variant={r.status === 'published' ? 'outline' : 'default'}
                className={'!h-8 !px-3 !rounded-lg text-[12px] ' + (r.status !== 'published' ? '!bg-emerald-700 hover:!bg-emerald-800' : '')}
                onClick={(e)=>ctx.onToggle(r, e)}
                disabled={!ctx.isAdmin || !!ctx.publishLoading || (r.status !== 'published' && String(r.stepStatus || '') === 'fail')}
                title={ctx.isAdmin ? (r.status === 'published' ? 'ยกเลิกตีพิมพ์' : (String(r.stepStatus || '') === 'fail' ? '⚠️ มี Placeholder ต้องเขียนทับเองก่อนตีพิมพ์' : 'ตีพิมพ์ step 10')) : 'เฉพาะ Admin / Owner เท่านั้น'}
              >
                {r.status === 'published' ? 'ย้อนกลับร่าง' : (String(r.stepStatus || '') === 'fail' ? '⚠️ Placeholder' : 'ตีพิมพ์')}
              </Button>
              <Button variant="ghost" size="sm" className="!h-8 !px-2 !rounded-lg text-rose-600 hover:!bg-rose-50" onClick={()=>ctx.onDelete(r)} title="ลบบทความถาวร" disabled={!!ctx.deleteLoading}><Trash2 className="size-4" /></Button>
            </div>
          </td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
