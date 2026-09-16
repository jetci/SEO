import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Pencil, Share2, Trash2, FolderKanban, CheckSquare2, Archive, Plus, Search, Filter, Loader2, X, Copy, CheckCheck, Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/trpc";
import { toast } from "sonner";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import useAuth from "@/hooks/useAuth";

function pickCategoryColor(catId: number | null | undefined) {
  switch (Number(catId)) {
    case 1: return "#d97706"; case 2: return "#2563eb"; case 3: return "#dc2626";
    case 4: return "#7c3aed"; case 5: return "#be185d"; case 6: return "#059669";
    case 7: return "#b45309"; default: return "#475569";
  }
}
function pickCategoryLabel(catId: number | null | undefined): string {
  switch (Number(catId)) {
    case 1: return "ฟุตบอล"; case 2: return "มวย"; case 3: return "สล็อต YMYL";
    case 4: return "หวย YMYL"; case 5: return "คาสิโน YMYL"; case 6: return "ไก่ชน";
    case 7: return "วัวชน"; default: return "หมวดอื่น";
  }
}
function pickCategoryIsYMyl(catId: number | null | undefined): boolean {
  return [3, 4, 5].includes(Number(catId));
}
const FALLBACK_COVER =
  "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Thai%20sports%20news%20desk%20minimal%20cream%20background%20amber%20terracotta%20warm%20light%20flat%20illustration&image_size=landscape_16_9";

export default function ProjectsPage() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const list = trpc.projects.list.useQuery();
  const [, setLocation] = useLocation();
  const rawItems = (Array.isArray(list.data) ? list.data : []) as any[];
  const total = rawItems.length;
  const active = rawItems.filter(p => p.status !== "archived" && p.is_active !== false).length;
  const archived = total - active;
  const ymylCount = rawItems.filter(p => pickCategoryIsYMyl(p.category_id || p.categoryId)).length;

  // ---------- CREATE ----------
  const [openCreate, setOpenCreate] = useState(false);
  const [fName, setFName] = useState('');
  const [fCatId, setFCatId] = useState<string>('');
  const [fKeyword, setFKeyword] = useState('');
  const [fDesc, setFDesc] = useState('');

  // ---------- SEARCH ----------
  const [openSearch, setOpenSearch] = useState(false);
  const [fQuery, setFQuery] = useState('');

  // ---------- FILTER ----------
  const [openFilter, setOpenFilter] = useState(false);
  const [fStatus, setFStatus] = useState<'all' | 'active' | 'archived'>('all');
  const [fFilterCatId, setFFilterCatId] = useState<string>('');
  const [fOnlyYmyl, setFOnlyYmyl] = useState(false);

  // ---------- EDIT ----------
  const [openEdit, setOpenEdit] = useState(false);
  const [editP, setEditP] = useState<any>(null);
  const [eName, setEName] = useState('');
  const [eCatId, setECatId] = useState('');
  const [eKeyword, setEKeyword] = useState('');
  const [eDesc, setEDesc] = useState('');

  // ---------- EDIT · BRAND VOICE (Tab #2) ----------
  const [editTab, setEditTab] = useState<'general' | 'brand'>('general');
  const [bvUrl, setBvUrl] = useState('');
  const [bvFormal, setBvFormal] = useState<number[]>([50]);
  const [bvCasual, setBvCasual] = useState<number[]>([30]);
  const [bvTechnical, setBvTechnical] = useState<number[]>([30]);
  const [bvPersuasive, setBvPersuasive] = useState<number[]>([40]);
  const [bvDo, setBvDo] = useState<string[]>(['ใช้ภาษาไทยอ่านง่าย', 'ยกตัวอย่างชัดเจน']);
  const [bvDont, setBvDont] = useState<string[]>(['ใช้ภาษาแสลงหยาบ', 'โกหกข้อมูล']);
  const [bvBrandTone, setBvBrandTone] = useState('มืออาชีพ เชื่อถือได้ friendly');
  const [bvContentType, setBvContentType] = useState('บทความแนะนำ + How-to + Review เชิงลึก');
  const bvScrapeM = trpc.projects.scrapeBrandVoice.useMutation();
  const bvSaveM = trpc.projects.saveBrandVoice.useMutation();
  const bvGetQ = trpc.projects.getBrandVoice.useQuery(
    editP && Number(editP.id) ? { projectId: Number(editP.id) } : { projectId: -1 },
    { enabled: !!(editP && Number(editP.id)), staleTime: 30_000 }
  );
  // Auto-fill brand voice on get result
  useEffect(() => {
    if (!bvGetQ.data) return;
    const v = (bvGetQ.data as any)?.voice as any;
    if (!v) return;
    if (typeof v.tone_formal === 'number') setBvFormal([v.tone_formal]);
    if (typeof v.tone_casual === 'number') setBvCasual([v.tone_casual]);
    if (typeof v.tone_technical === 'number') setBvTechnical([v.tone_technical]);
    if (typeof v.tone_persuasive === 'number') setBvPersuasive([v.tone_persuasive]);
    if (Array.isArray(v.contentDo) && v.contentDo.length > 0) setBvDo(v.contentDo);
    if (Array.isArray(v.contentDont) && v.contentDont.length > 0) setBvDont(v.contentDont);
    if (typeof v.brandTone === 'string') setBvBrandTone(v.brandTone);
    if (typeof v.contentType === 'string') setBvContentType(v.contentType);
    if (typeof (bvGetQ.data as any)?.scrapedUrl === 'string') setBvUrl((bvGetQ.data as any).scrapedUrl);
  }, [bvGetQ.data]);

  // ---------- SHARE ----------
  const [openShare, setOpenShare] = useState(false);
  const [shareP, setShareP] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // ---------- DELETE ----------
  const [openDel, setOpenDel] = useState(false);
  const [delP, setDelP] = useState<any>(null);

  const myTeams = trpc.teams.list.useQuery(undefined, { staleTime: 60_000 });
  const cats = trpc.categories.list.useQuery(undefined, { staleTime: 60_000 });
  const utils = trpc.useContext();

  const firstTeamId =
    myTeams.data?.teams && Array.isArray(myTeams.data.teams) && myTeams.data.teams.length > 0
      ? Number(myTeams.data.teams[0].id)
      : 0;

  const createM = trpc.projects.create.useMutation({
    onSuccess: (r: any) => {
      toast.success(`✅ สร้างโปรเจกต์สำเร็จ: ${r?.project?.name ?? fName}`);
      setOpenCreate(false);
      setFName(''); setFCatId(''); setFKeyword(''); setFDesc('');
      utils.projects.list.invalidate();
    },
    onError: (err: any) => {
      toast.error(`สร้างโปรเจกต์ล้มเหลว: ${String(err?.message ?? err).slice(0, 120)}`);
    }
  });

  const updateM = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success('✅ แก้ไขโปรเจกต์สำเร็จ');
      setOpenEdit(false); setEditP(null);
      utils.projects.list.invalidate();
    },
    onError: (err: any) => {
      toast.error(`แก้ไขล้มเหลว: ${String(err?.message ?? err).slice(0, 120)}`);
    }
  });

  const deleteM = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success('🗑️ ลบโปรเจกต์สำเร็จ (เก็บถาวร soft-delete)');
      setOpenDel(false); setDelP(null);
      utils.projects.list.invalidate();
    },
    onError: (err: any) => {
      const m = String(err?.message ?? err);
      const show = /article/i.test(m) || /ผูก/.test(m)
        ? `❌ ไม่สามารถลบได้: โปรเจกต์นี้มีบทความผูกอยู่ (${m.slice(0, 90)})`
        : `ลบล้มเหลว: ${m.slice(0, 120)}`;
      toast.error(show);
      setOpenDel(false); setDelP(null);
    }
  });

  const openNew = () => {
    if (authLoading || !isLoggedIn) {
      toast.error(authLoading ? 'กำลังตรวจสอบสิทธิ์เข้าถึง... รอสักครู่ แล้วลองอีกครั้ง' : 'กรุณาเข้าสู่ระบบก่อนสร้างโปรเจกต์');
      return;
    }
    setFName(''); setFCatId(''); setFKeyword(''); setFDesc('');
    if (!firstTeamId || !myTeams.data?.teams || myTeams.data.teams.length === 0) {
      toast.error('ไม่พบทีมที่คุณเป็นสมาชิก กรุณาสร้างทีมก่อน (เมนู Teams)');
      return;
    }
    setOpenCreate(true);
  };

  const submitCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (authLoading || !isLoggedIn) {
      toast.error(authLoading ? 'กำลังตรวจสอบสิทธิ์เข้าถึง... รอสักครู่ แล้วลองอีกครั้ง' : 'กรุณาเข้าสู่ระบบก่อน');
      return;
    }
    const name = fName.trim();
    if (!name) { toast.error('กรุณากรอกชื่อโปรเจกต์'); return; }
    if (!firstTeamId) { toast.error('ไม่มีทีมในระบบ กรุณาสร้างทีมก่อน'); return; }
    const categoryId = fCatId && /^\d+$/.test(fCatId) ? Number(fCatId) : undefined;
    try {
      await createM.mutateAsync({
        teamId: firstTeamId,
        name,
        categoryId,
        mainKeyword: fKeyword.trim() || undefined,
        description: fDesc.trim() || undefined,
      });
    } catch (err: any) {
      toast.error(`สร้างโปรเจกต์ล้มเหลว: ${String(err?.message ?? err).slice(0, 160)}`);
    }
  };

  function openEditFor(p: any) {
    setEditP(p);
    const catId = p.category_id ?? p.categoryId;
    setEName(p.name ?? '');
    setECatId(catId ? String(catId) : '');
    setEKeyword(p.main_keyword ?? p.mainKeyword ?? '');
    setEDesc(p.description ?? '');
    setEditTab('general');
    setBvUrl('');
    setBvFormal([50]); setBvCasual([30]); setBvTechnical([30]); setBvPersuasive([40]);
    setBvDo(['ใช้ภาษาไทยอ่านง่าย', 'ยกตัวอย่างชัดเจน']);
    setBvDont(['ใช้ภาษาแสลงหยาบ', 'โกหกข้อมูล']);
    setBvBrandTone('มืออาชีพ เชื่อถือได้ friendly');
    setBvContentType('บทความแนะนำ + How-to + Review เชิงลึก');
    setOpenEdit(true);
  }
  async function handleScrapeBv() {
    if (!editP || !Number(editP.id)) return;
    const url = bvUrl.trim();
    if (!url) { toast.error('กรุณาใส่ URL หน้าแรกของเว็บไซต์'); return; }
    if (!/^https?:\/\//i.test(url)) { toast.error('URL ต้องขึ้นต้นด้วย http:// หรือ https://'); return; }
    const loadingToast = toast.loading(`🧠 สแกน + สกัดเสียงแบรนด์จาก ${url.slice(0, 60)}...`);
    try {
      const res = await bvScrapeM.mutateAsync({ projectId: Number(editP.id), url });
      toast.dismiss(loadingToast);
      const v = (res as any)?.voice as any;
      if (v) {
        setBvFormal([typeof v.tone_formal === 'number' ? v.tone_formal : 50]);
        setBvCasual([typeof v.tone_casual === 'number' ? v.tone_casual : 30]);
        setBvTechnical([typeof v.tone_technical === 'number' ? v.tone_technical : 30]);
        setBvPersuasive([typeof v.tone_persuasive === 'number' ? v.tone_persuasive : 40]);
        if (Array.isArray(v.contentDo) && v.contentDo.length > 0) setBvDo(v.contentDo);
        if (Array.isArray(v.contentDont) && v.contentDont.length > 0) setBvDont(v.contentDont);
        if (typeof v.brandTone === 'string') setBvBrandTone(v.brandTone);
        if (typeof v.contentType === 'string') setBvContentType(v.contentType);
      }
      toast.success(`✅ สกัดเสียงแบรนด์สำเร็จ! voiceJson ${(res as any)?.voiceJsonLen ?? 0} chars`);
    } catch (e: any) {
      toast.dismiss(loadingToast);
      const emsg = String(e?.message ?? e ?? '').slice(0, 140);
      if (/LLM_API_KEY_REQUIRED|LLM_AUTH_INVALID/.test(emsg)) {
        toast.error(`🔑 [LLM_KEY_LOCKED] ${emsg.slice(0, 90)}`);
      } else {
        toast.error(`สกัดเสียงแบรนด์ล้มเหลว: ${emsg}`);
      }
    }
  }
  async function submitEdit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!editP || !Number(editP.id)) return;
    const name = eName.trim();
    if (!name) { toast.error('ชื่อโปรเจกต์ห้ามว่าง'); return; }
    const patch: any = { name };
    if (eCatId && /^\d+$/.test(eCatId)) patch.categoryId = Number(eCatId);
    else patch.categoryId = null;
    patch.mainKeyword = eKeyword.trim() || null;
    patch.description = eDesc.trim() || null;
    // Save Brand Voice tab voiceJson (separate parallel)
    const voicePayload: any = {
      tone_formal: Number(bvFormal[0] ?? 50),
      tone_casual: Number(bvCasual[0] ?? 30),
      tone_technical: Number(bvTechnical[0] ?? 30),
      tone_persuasive: Number(bvPersuasive[0] ?? 40),
      contentDo: bvDo,
      contentDont: bvDont,
      brandTone: bvBrandTone.trim(),
      contentType: bvContentType.trim(),
    };
    const pid = Number(editP.id);
    const [_r1, _r2] = await Promise.allSettled([
      updateM.mutateAsync({ id: pid, patch }),
      bvSaveM.mutateAsync({ projectId: pid, voice: voicePayload, scrapedUrl: bvUrl.trim() }),
    ]);
    if (_r1.status === 'rejected') {
      toast.error(`แก้ไขโปรเจกต์ล้มเหลว: ${String((_r1 as any).reason?.message ?? _r1).slice(0, 120)}`);
    }
    if (_r2.status === 'rejected') {
      toast.error(`บันทึกเสียงแบรนด์ล้มเหลว: ${String((_r2 as any).reason?.message ?? _r2).slice(0, 120)}`);
    }
    if (_r1.status === 'fulfilled' && _r2.status === 'fulfilled') {
      toast.success(`✅ บันทึกทั้งหมดสำเร็จ: ข้อมูลโปรเจกต์ + เสียงแบรนด์ (${voicePayload.tone_formal}/${voicePayload.tone_casual}/${voicePayload.tone_technical}/${voicePayload.tone_persuasive})`);
      setOpenEdit(false); setEditP(null);
      utils.projects.list.invalidate();
      utils.projects.getBrandVoice.invalidate({ projectId: pid });
    }
  }

  function openShareFor(p: any) {
    setShareP(p); setCopied(false); setOpenShare(true);
  }
  async function copyShare() {
    if (!shareP) return;
    const url = `https://thaiaeo.manus.host/projects/${Number(shareP.id)}/articles`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true); toast.success('✅ คัดลอกลิงก์แชร์สำเร็จ');
    setTimeout(() => setCopied(false), 2200);
  }

  function openDelFor(p: any) { setDelP(p); setOpenDel(true); }
  async function confirmDelete() {
    if (!delP || !Number(delP.id)) return;
    await deleteM.mutateAsync({ id: Number(delP.id) });
  }

  const catOptions = (cats.data || []) as any[];

  // ---------- FILTERED ITEMS (client-side for Phase 1 CRUD) ----------
  const items = useMemo(() => {
    let arr = rawItems.slice();
    const q = fQuery.trim().toLowerCase();
    if (q) {
      arr = arr.filter(p => {
        const n = String(p.name || p.title || '').toLowerCase();
        const k = String(p.main_keyword || p.mainKeyword || '').toLowerCase();
        const d = String(p.description || '').toLowerCase();
        return n.includes(q) || k.includes(q) || d.includes(q);
      });
    }
    if (fStatus === 'active') arr = arr.filter(p => p.status !== 'archived' && p.is_active !== false);
    else if (fStatus === 'archived') arr = arr.filter(p => p.status === 'archived' || p.is_active === false);
    if (fFilterCatId && /^\d+$/.test(fFilterCatId)) {
      const cid = Number(fFilterCatId);
      arr = arr.filter(p => Number(p.category_id || p.categoryId) === cid);
    }
    if (fOnlyYmyl) arr = arr.filter(p => pickCategoryIsYMyl(p.category_id || p.categoryId));
    return arr;
  }, [rawItems, fQuery, fStatus, fFilterCatId, fOnlyYmyl]);

  function resetFilter() {
    setFStatus('all'); setFFilterCatId(''); setFOnlyYmyl(false); setOpenFilter(false);
    toast.info('ล้างตัวกรองแล้ว แสดงผลทั้งหมด');
  }

  const shareUrl = shareP ? `https://thaiaeo.manus.host/projects/${Number(shareP.id)}/articles` : '';

  return (
    <MainDashboardShell
      headerTitle="โปรเจกต์บทความ"
      headerSubtitle={`คลังโปรเจกต์ทั้งหมด ${total} โปรเจกต์ · YMYL ${ymylCount} หมวด · ${rawItems.length !== items.length ? `แสดง ${items.length} จากทั้งหมด ${rawItems.length}` : 'Phase 1 CRUD เท่านั้น'}`}
      headerActions={
        <>
          <Button variant="ghost" size="sm" className="!h-9 !rounded-lg text-stone-600 hover:!bg-stone-100" onClick={() => { setOpenSearch(s => !s); if (openSearch) setFQuery(''); }} disabled={authLoading || !isLoggedIn}>
            <Search className="size-4 mr-2" />
            {openSearch ? 'ปิดค้นหา' : 'ค้นหา'}
          </Button>
          <Button variant="outline" size="sm" className="!h-9 !rounded-lg" onClick={() => setOpenFilter(true)} disabled={authLoading || !isLoggedIn}>
            <Filter className="size-4 mr-2" />
            ตัวกรอง{(fStatus !== 'all' || fFilterCatId || fOnlyYmyl) ? <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-600" /> : null}
          </Button>
          <Button size="sm" className="!h-9 !rounded-lg !bg-[#b45309] hover:!bg-[#92400e]" onClick={openNew} disabled={authLoading || !isLoggedIn}>
            <Plus className="size-4 mr-2" />
            สร้างโปรเจกต์
          </Button>
        </>
      }
    >
      {/* ---------- INLINE SEARCH INPUT ---------- */}
      {openSearch && (
        <div className="mb-5 flex items-center gap-2 p-3 rounded-2xl border border-stone-200 bg-white shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <Search className="size-4 text-stone-400 ml-1" />
          <Input
            autoFocus
            placeholder="ค้นหาชื่อโปรเจกต์, Keyword หลัก, หรือคำอธิบาย... (พิมพ์ แล้วเห็นผล filter ทันที)"
            value={fQuery}
            onChange={(e) => setFQuery(e.target.value)}
            className="flex-1 !h-10"
          />
          {fQuery && (
            <Button variant="ghost" size="sm" className="!h-8 !px-2 text-stone-500" onClick={() => setFQuery('')} title="ล้างคำค้นหา">
              <X className="size-4" />
            </Button>
          )}
          <span className="text-[12px] text-stone-500 pr-2 whitespace-nowrap">
            {rawItems.length !== items.length ? `เจอ ${items.length} จาก ${rawItems.length}` : `${items.length} รายการ`}
          </span>
        </div>
      )}

      {/* ---------- CREATE DIALOG ---------- */}
      <Dialog open={openCreate} onOpenChange={(v) => { if (!createM.isLoading) setOpenCreate(v); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-stone-900">สร้างโปรเจกต์ใหม่</DialogTitle>
            <DialogDescription className="text-[13px] text-stone-500">
              กรอกข้อมูลพื้นฐานเพื่อสร้างโปรเจกต์บทความใหม่ โดยจะถูกสร้างภายใต้ทีม <b>{myTeams.data?.teams?.[0]?.name || ('ทีม #' + firstTeamId)}</b>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="pj-name">ชื่อโปรเจกต์ <span className="text-rose-600">*</span></Label>
              <Input id="pj-name" autoFocus placeholder="เช่น ข่าวสล็อตอัปเดต 2569" value={fName} onChange={(e) => setFName(e.target.value)} disabled={createM.isLoading} maxLength={255} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pj-cat">หมวดหมู่</Label>
                <Select value={fCatId} onValueChange={setFCatId} disabled={createM.isLoading}>
                  <SelectTrigger id="pj-cat" className="w-full">
                    <SelectValue placeholder="เลือกหมวดหมู่ (ไม่บังคับ)" />
                  </SelectTrigger>
                  <SelectContent>
                    {catOptions.map((c: any) => (
                      <SelectItem key={String(c.id)} value={String(c.id)}>
                        {c.icon ? c.icon + '  ' : ''}{c.name}{Number(c.isYmyl || c.is_ymyl) === 1 ? '  (YMYL ⚠️)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pj-kw">Keyword หลัก</Label>
                <Input id="pj-kw" placeholder="เช่น สล็อตออนไลน์" value={fKeyword} onChange={(e) => setFKeyword(e.target.value)} disabled={createM.isLoading} maxLength={255} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pj-desc">คำอธิบายโปรเจกต์</Label>
              <Textarea id="pj-desc" rows={4} placeholder="อธิบายเป้าหมาย ความต้องการ Scope ของโปรเจกต์นี้..." value={fDesc} onChange={(e) => setFDesc(e.target.value)} disabled={createM.isLoading} maxLength={10000} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <Button type="button" variant="ghost" size="sm" className="!h-9" onClick={() => setOpenCreate(false)} disabled={createM.isLoading}>ยกเลิก</Button>
              <Button type="submit" size="sm" className="!h-9 !bg-[#b45309] hover:!bg-[#92400e]" disabled={createM.isLoading || !fName.trim()}>
                {createM.isLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
                {createM.isLoading ? 'กำลังสร้าง...' : 'สร้างโปรเจกต์'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- FILTER DIALOG ---------- */}
      <Dialog open={openFilter} onOpenChange={(v) => { if (!updateM.isLoading && !deleteM.isLoading) setOpenFilter(v); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-stone-900">ตัวกรองโปรเจกต์</DialogTitle>
            <DialogDescription className="text-[13px] text-stone-500">
              เลือกเงื่อนไขตัวกรอง ผลการกรองจะแสดงบนหน้านี้ทันที (phase 1 client-side filter)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="filter-status">สถานะโปรเจกต์</Label>
              <Select value={fStatus} onValueChange={(v: any) => setFStatus(v as any)}>
                <SelectTrigger id="filter-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด ({rawItems.length})</SelectItem>
                  <SelectItem value="active">กำลังใช้งาน ({active})</SelectItem>
                  <SelectItem value="archived">เก็บถาวร ({archived})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-cat">หมวดหมู่</Label>
              <Select value={fFilterCatId} onValueChange={setFFilterCatId}>
                <SelectTrigger id="filter-cat" className="w-full"><SelectValue placeholder="ทุกหมวดหมู่" /></SelectTrigger>
                <SelectContent>
                  {catOptions.map((c: any) => (
                    <SelectItem key={String(c.id)} value={String(c.id)}>
                      {c.icon ? c.icon + '  ' : ''}{c.name}{Number(c.isYmyl || c.is_ymyl) === 1 ? '  (YMYL ⚠️)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 select-none cursor-pointer p-3 rounded-xl border border-stone-200 hover:bg-stone-50">
              <input type="checkbox" checked={fOnlyYmyl} onChange={(e) => setFOnlyYmyl(e.target.checked)} className="size-4 accent-amber-600" />
              <div>
                <p className="text-[14px] font-semibold text-stone-800">แสดงเฉพาะโปรเจกต์ YMYL ⚠️</p>
                <p className="text-[12px] text-stone-500">3 หมวด: สล็อต / หวย / คาสิโน (ความเสี่ยงสูง EEAT/SA)</p>
              </div>
            </label>
            <div className="text-[12px] text-stone-500 px-1">
              ผลการกรอง: จะแสดง <b className="text-stone-800">{items.length}</b> จากทั้งหมด {rawItems.length} โปรเจกต์
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-stone-100">
            <Button variant="ghost" size="sm" className="!h-9 text-stone-600" onClick={resetFilter}>ล้างตัวกรอง</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="!h-9" onClick={() => setOpenFilter(false)}>ปิด</Button>
              <Button size="sm" className="!h-9 !bg-[#b45309] hover:!bg-[#92400e]" onClick={() => setOpenFilter(false)}>
                <CheckCheck className="size-4 mr-1.5" /> ใช้ตัวกรอง
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- EDIT DIALOG ---------- */}
      <Dialog open={openEdit} onOpenChange={(v) => { if (!updateM.isLoading && !bvSaveM.isLoading && !bvScrapeM.isLoading) setOpenEdit(v); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-stone-900">แก้ไขโปรเจกต์</DialogTitle>
            <DialogDescription className="text-[13px] text-stone-500">
              แก้ไขข้อมูลโปรเจกต์ <b>#{Number(editP?.id) || 0}</b> บันทึกทันทีเมื่อกดปุ่มด้านล่าง
            </DialogDescription>
          </DialogHeader>
          <Tabs value={editTab} onValueChange={(v) => setEditTab(v as any)} className="pt-2">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="general" disabled={bvSaveM.isLoading || bvScrapeM.isLoading || updateM.isLoading}>💼 ข้อมูลทั่วไป</TabsTrigger>
              <TabsTrigger value="brand" disabled={bvSaveM.isLoading || bvScrapeM.isLoading || updateM.isLoading}>🎚️ เสียงแบรนด์ (Brand Voice)</TabsTrigger>
            </TabsList>
            <form onSubmit={submitEdit} className="space-y-4">
              <TabsContent value="general" className="space-y-4 mt-0">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">ชื่อโปรเจกต์ <span className="text-rose-600">*</span></Label>
                  <Input id="edit-name" autoFocus value={eName} onChange={(e) => setEName(e.target.value)} disabled={updateM.isLoading} maxLength={255} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-cat">หมวดหมู่</Label>
                    <Select value={eCatId} onValueChange={setECatId} disabled={updateM.isLoading}>
                      <SelectTrigger id="edit-cat" className="w-full"><SelectValue placeholder="เลือกหมวดหมู่ (หรือไม่ระบุ)" /></SelectTrigger>
                      <SelectContent>
                        {catOptions.map((c: any) => (
                          <SelectItem key={String(c.id)} value={String(c.id)}>
                            {c.icon ? c.icon + '  ' : ''}{c.name}{Number(c.isYmyl || c.is_ymyl) === 1 ? '  (YMYL ⚠️)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-kw">Keyword หลัก</Label>
                    <Input id="edit-kw" value={eKeyword} onChange={(e) => setEKeyword(e.target.value)} disabled={updateM.isLoading} maxLength={255} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-desc">คำอธิบายโปรเจกต์</Label>
                  <Textarea id="edit-desc" rows={4} value={eDesc} onChange={(e) => setEDesc(e.target.value)} disabled={updateM.isLoading} maxLength={10000} />
                </div>
              </TabsContent>
              <TabsContent value="brand" className="space-y-4 mt-0">
                {bvGetQ.isFetching && (
                  <div className="text-xs text-stone-500 flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200">
                    <Loader2 className="size-3.5 animate-spin" /> กำลังโหลดข้อมูลเสียงแบรนด์จากฐานข้อมูล...
                  </div>
                )}
                <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-1 mb-2">
                  <p className="text-[12px] uppercase tracking-wide text-purple-700 font-semibold flex items-center gap-1.5">💡 EEAT Score / Brand Voice GOLD IDEA #1</p>
                  <p className="text-[13px] text-stone-700">กำหนดค่าเสียงแบรนด์ให้กับโปรเจกต์นี้ — ทุกบทความในโปรเจกต์จะถูกเขียนด้วยเสียง, โทน, ภาษาเดียวกันหมด เพิ่มคะแนน EEAT consistency</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bv-url">หน้าแรกของเว็บไซต์ (URL)</Label>
                  <div className="flex gap-2">
                    <Input id="bv-url" placeholder="https://example.com" value={bvUrl} onChange={(e) => setBvUrl(e.target.value)} disabled={bvScrapeM.isLoading || bvSaveM.isLoading || updateM.isLoading} />
                    <Button type="button" variant="outline" size="sm" className="!h-10 whitespace-nowrap !px-3" onClick={handleScrapeBv} disabled={bvScrapeM.isLoading || updateM.isLoading || bvSaveM.isLoading}>
                      {bvScrapeM.isLoading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Sparkles className="size-4 mr-1.5" />}
                      {bvScrapeM.isLoading ? 'กำลังสแกน...' : 'สแกน + สกัด'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-3 p-3 rounded-xl bg-amber-50/40 border border-amber-100">
                  <p className="text-[12px] uppercase tracking-wide text-amber-700 font-semibold">🎚️ โทนเสียง (4 Sliders) — ลากค่า 0-100</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[13px]"><Label className="!mb-0 font-semibold text-stone-700">🤝 Formal (เป็นทางการ)</Label><span className="text-amber-700 font-bold tabular-nums">{bvFormal[0] ?? 50} / 100</span></div>
                      <Slider value={bvFormal} onValueChange={setBvFormal as any} min={0} max={100} step={1} disabled={bvSaveM.isLoading || updateM.isLoading} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[13px]"><Label className="!mb-0 font-semibold text-stone-700">😊 Casual (เป็นกันเอง)</Label><span className="text-sky-700 font-bold tabular-nums">{bvCasual[0] ?? 30} / 100</span></div>
                      <Slider value={bvCasual} onValueChange={setBvCasual as any} min={0} max={100} step={1} disabled={bvSaveM.isLoading || updateM.isLoading} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[13px]"><Label className="!mb-0 font-semibold text-stone-700">🔬 Technical (เชิงเทคนิค)</Label><span className="text-indigo-700 font-bold tabular-nums">{bvTechnical[0] ?? 30} / 100</span></div>
                      <Slider value={bvTechnical} onValueChange={setBvTechnical as any} min={0} max={100} step={1} disabled={bvSaveM.isLoading || updateM.isLoading} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[13px]"><Label className="!mb-0 font-semibold text-stone-700">💼 Persuasive (โน้มน้าว)</Label><span className="text-rose-700 font-bold tabular-nums">{bvPersuasive[0] ?? 40} / 100</span></div>
                      <Slider value={bvPersuasive} onValueChange={setBvPersuasive as any} min={0} max={100} step={1} disabled={bvSaveM.isLoading || updateM.isLoading} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Brand Tone (คำบรรยายโทนเสียง)</Label>
                  <Input value={bvBrandTone} onChange={(e) => setBvBrandTone(e.target.value)} disabled={bvSaveM.isLoading || updateM.isLoading} placeholder="เช่น มืออาชีพ เชื่อถือได้ friendly" maxLength={400} />
                </div>
                <div className="space-y-1.5">
                  <Label>Content Type (รูปแบบเนื้อหา)</Label>
                  <Input value={bvContentType} onChange={(e) => setBvContentType(e.target.value)} disabled={bvSaveM.isLoading || updateM.isLoading} placeholder="เช่น บทความแนะนำ + How-to + Review เชิงลึก" maxLength={400} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="!text-emerald-700">✅ สิ่งที่ควรทำ (Do) — 1 บรรทัดต่อ 1 ข้อ</Label>
                    <Textarea rows={5} value={bvDo.join('\n')} onChange={(e) => setBvDo(e.target.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean))} disabled={bvSaveM.isLoading || updateM.isLoading} placeholder="1 ต่อ 1 บรรทัด เช่น&#10;ใช้ภาษาไทยอ่านง่าย&#10;ยกตัวอย่างชัดเจน" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="!text-rose-700">❌ สิ่งที่ห้ามทำ (Don't) — 1 บรรทัดต่อ 1 ข้อ</Label>
                    <Textarea rows={5} value={bvDont.join('\n')} onChange={(e) => setBvDont(e.target.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean))} disabled={bvSaveM.isLoading || updateM.isLoading} placeholder="1 ต่อ 1 บรรทัด เช่น&#10;ใช้ภาษาแสลงหยาบ&#10;โกหกข้อมูล" />
                  </div>
                </div>
              </TabsContent>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <Button type="button" variant="ghost" size="sm" className="!h-9" onClick={() => setOpenEdit(false)} disabled={updateM.isLoading || bvSaveM.isLoading || bvScrapeM.isLoading}>ยกเลิก</Button>
                <Button type="submit" size="sm" className="!h-9 !bg-[#b45309] hover:!bg-[#92400e]" disabled={updateM.isLoading || bvSaveM.isLoading || bvScrapeM.isLoading || !eName.trim()}>
                  {(updateM.isLoading || bvSaveM.isLoading) ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Pencil className="size-4 mr-2" />}
                  {(updateM.isLoading || bvSaveM.isLoading) ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </Button>
              </div>
            </form>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ---------- SHARE DIALOG ---------- */}
      <Dialog open={openShare} onOpenChange={(v) => setOpenShare(v)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-stone-900">แชร์โปรเจกต์นี้</DialogTitle>
            <DialogDescription className="text-[13px] text-stone-500">
              ส่งลิงก์ให้ผู้ที่มีสิทธิ์เข้าถึงทีมเดียวกัน เพื่อเปิดดูรายการบทความภายในโปรเจกต์นี้
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-[12px] uppercase tracking-wide text-amber-700 font-semibold">ชื่อโปรเจกต์</p>
              <p className="text-[15px] font-bold text-stone-900 line-clamp-2">{shareP?.name || '—'}</p>
              <p className="text-[12px] text-stone-500 mt-1">ID #{Number(shareP?.id) || 0} · หมวด: {pickCategoryLabel(shareP?.category_id || shareP?.categoryId)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-url">ลิงก์เข้าถึงโปรเจกต์</Label>
              <div className="flex gap-2">
                <Input id="share-url" readOnly value={shareUrl} className="flex-1 font-mono text-[12.5px] !pr-2" />
                <Button type="button" size="sm" className={`!h-10 ${copied ? '!bg-emerald-700 hover:!bg-emerald-700' : '!bg-[#b45309] hover:!bg-[#92400e]'}`} onClick={copyShare}>
                  {copied ? <CheckCheck className="size-4 mr-1.5" /> : <Copy className="size-4 mr-1.5" />}
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                </Button>
              </div>
              <p className="text-[12px] text-stone-500">ลิงก์นี้จะพาไปหน้ารายการบทความของโปรเจกต์นี้โดยตรง</p>
            </div>
          </div>
          <div className="flex items-center justify-end pt-2 mt-3 border-t border-stone-100">
            <Button variant="outline" size="sm" className="!h-9" onClick={() => setOpenShare(false)}>ปิด</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- DELETE CONFIRM ALERT DIALOG ---------- */}
      <AlertDialog open={openDel} onOpenChange={(v) => { if (!deleteM.isLoading) setOpenDel(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-900">คุณแน่ใจจะลบโปรเจกต์นี้ใช่หรือไม่ ?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] text-stone-600 leading-relaxed">
              <div className="space-y-2 mt-1">
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <p className="text-[13px] font-bold text-rose-800">โปรเจกต์: {delP?.name || '—'} <span className="font-normal text-rose-600">(ID #{Number(delP?.id) || 0})</span></p>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-stone-700 text-[13px]">
                  <li>ระบบจะ <b className="text-amber-700">เก็บถาวร (soft-delete)</b> ไม่ลบข้อมูลจริงในฐานข้อมูล</li>
                  <li>หากโปรเจกต์นี้ <b className="text-rose-700">มีบทความผูกอยู่</b> → จะลบไม่สำเร็จ ต้องลบบทความที่ผูกให้หมดก่อน</li>
                  <li>จะไม่แสดงผลในหน้าโปรเจกต์อีกต่อไป ยกเว้นหน้า Admin Audit (หากเปิด mode ดูข้อมูลเก็บถาวร)</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteM.isLoading} className="!h-9">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteM.isLoading}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              className="!h-9 !bg-rose-600 hover:!bg-rose-700 text-white"
            >
              {deleteM.isLoading ? <Loader2 className="size-4 mr-2 inline animate-spin" /> : <Trash2 className="size-4 mr-2 inline" />}
              {deleteM.isLoading ? 'กำลังลบ...' : 'ยืนยันลบ (เก็บถาวร)'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- KPI ---------- */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" data-testid="projects-kpi">
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white !shadow-sm !transition-all !duration-200 hover:!shadow-md hover:-translate-y-0.5">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 grid place-items-center"><FolderKanban className="size-6" /></div>
            <div className="flex-1">
              <p className="text-[12px] uppercase tracking-wider text-stone-500 mb-0.5">ทั้งหมด</p>
              <p className="text-2xl font-bold text-stone-900" data-testid="kpi-total">{total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white !shadow-sm !transition-all !duration-200 hover:!shadow-md hover:-translate-y-0.5">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 grid place-items-center"><CheckSquare2 className="size-6" /></div>
            <div className="flex-1">
              <p className="text-[12px] uppercase tracking-wider text-stone-500 mb-0.5">กำลังใช้งาน</p>
              <p className="text-2xl font-bold text-stone-900" data-testid="kpi-active">{active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white !shadow-sm !transition-all !duration-200 hover:!shadow-md hover:-translate-y-0.5">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-stone-100 text-stone-700 grid place-items-center"><Archive className="size-6" /></div>
            <div className="flex-1">
              <p className="text-[12px] uppercase tracking-wider text-stone-500 mb-0.5">เก็บถาวร</p>
              <p className="text-2xl font-bold text-stone-900" data-testid="kpi-archived">{archived}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---------- FILTER HINT PILLS ---------- */}
      {(fQuery || fStatus !== 'all' || fFilterCatId || fOnlyYmyl) && (
        <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="active-filter-pills">
          <span className="text-[12px] text-stone-500 font-semibold uppercase tracking-wide px-1">กำลังกรอง:</span>
          {fQuery && <Badge variant="outline" className="!rounded-full !bg-amber-50 !border-amber-200 !text-amber-800 !font-medium">🔎 {fQuery.slice(0, 24)}{fQuery.length > 24 ? '…' : ''} <button className="ml-1.5 opacity-70 hover:opacity-100" onClick={() => setFQuery('')}>×</button></Badge>}
          {fStatus !== 'all' && <Badge variant="outline" className="!rounded-full !bg-stone-100 !text-stone-700 !font-medium">สถานะ: {fStatus === 'active' ? 'ใช้งาน' : 'เก็บถาวร'} <button className="ml-1.5 opacity-70 hover:opacity-100" onClick={() => setFStatus('all')}>×</button></Badge>}
          {fFilterCatId && <Badge variant="outline" className="!rounded-full !font-medium" style={{ backgroundColor: pickCategoryColor(Number(fFilterCatId)) + '1A', color: pickCategoryColor(Number(fFilterCatId)) }}>หมวด: {pickCategoryLabel(Number(fFilterCatId))} <button className="ml-1.5 opacity-70 hover:opacity-100" onClick={() => setFFilterCatId('')}>×</button></Badge>}
          {fOnlyYmyl && <Badge className="!rounded-full !bg-rose-100 !text-rose-700 !border-transparent">YMYL ⚠️ เท่านั้น <button className="ml-1.5 opacity-80 hover:opacity-100" onClick={() => setFOnlyYmyl(false)}>×</button></Badge>}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" className="!h-8 !text-[12.5px] !text-stone-600" onClick={resetFilter}>ล้างทั้งหมด</Button>
        </div>
      )}

      {/* ---------- GRID ---------- */}
      {list.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="projects-grid-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="!rounded-2xl !border-stone-200 animate-pulse">
              <div className="h-36 bg-stone-100 rounded-t-2xl" />
              <CardContent className="p-5 space-y-2">
                <div className="h-4 w-2/3 bg-stone-100 rounded" />
                <div className="h-3 w-full bg-stone-100 rounded" />
                <div className="h-3 w-5/6 bg-stone-100 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-stone-300 bg-stone-50" data-testid="projects-empty-state">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-stone-100 text-stone-400 grid place-items-center"><FolderKanban className="size-8" /></div>
          <h3 className="text-[18px] font-bold text-stone-800 mb-1.5">
            {fQuery || fStatus !== 'all' || fFilterCatId || fOnlyYmyl ? 'ไม่พบโปรเจกต์ที่ตรงกับตัวกรอง' : 'ยังไม่มีโปรเจกต์'}
          </h3>
          <p className="text-[13px] text-stone-500 mb-5 max-w-md mx-auto leading-relaxed">
            {fQuery || fStatus !== 'all' || fFilterCatId || fOnlyYmyl
              ? 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองบางส่วน เพื่อเห็นโปรเจกต์อื่นๆ'
              : 'เริ่มต้นสร้างโปรเจกต์แรกของคุณ เพื่อวางแผนผลิตบทความ EEAT ได้ทันที'}
          </p>
          {fQuery || fStatus !== 'all' || fFilterCatId || fOnlyYmyl
            ? <Button size="sm" className="!h-9" onClick={resetFilter}>ล้างตัวกรองทั้งหมด</Button>
            : <Button size="sm" className="!h-9 !bg-[#b45309] hover:!bg-[#92400e]" onClick={openNew}><Plus className="size-4 mr-2" /> สร้างโปรเจกต์แรก</Button>}
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="projects-grid">
          {items.map((p: any) => {
            const catId = Number(p.category_id || p.categoryId);
            const color = pickCategoryColor(catId);
            const label = pickCategoryLabel(catId);
            const ymyl = pickCategoryIsYMyl(catId);
            const title = p.name || p.title || "ไม่มีชื่อโปรเจกต์";
            const desc = p.description || "ยังไม่ได้ใส่คำอธิบายโปรเจกต์";
            const cover = p.cover_image || p.coverImage || FALLBACK_COVER;
            const statusBadge = p.status === "archived" ? "เก็บถาวร" : "ใช้งาน";
            const articlesRoute = `/projects/${Number(p.id)}/articles`;
            return (
              <Card
                key={p.id}
                className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm hover:!shadow-md transition-all overflow-hidden"
                data-testid={`project-card-${p.id}`}
              >
                <div
                  className="h-36 w-full bg-cover bg-center border-b border-stone-100 cursor-pointer group"
                  onClick={() => setLocation(articlesRoute)}
                  title="เปิดดูรายการบทความในโปรเจกต์นี้"
                  style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.16) 70%), url(${cover})`, borderTop: `3px solid ${color}` }}
                >
                  <div className="h-full w-full flex items-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Badge className="!rounded-full !bg-white/95 !text-stone-800 !border-white/80 backdrop-blur !text-[11px] !font-semibold">
                      <Eye className="size-3.5 mr-1" /> เปิดดูรายการบทความ →
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Badge
                      variant="outline"
                      className="!rounded-full !text-[11px] !font-medium !border-transparent"
                      style={{ backgroundColor: `${color}18`, color }}
                      data-testid={`project-${p.id}-category`}
                    >
                      {label}
                    </Badge>
                    {ymyl && (
                      <Badge className="!rounded-full !text-[11px] !bg-rose-100 !text-rose-700 !border-transparent">YMYL ⚠️</Badge>
                    )}
                    <span className="flex-1" />
                    <Badge variant="secondary" className="!rounded-full !text-[10.5px]">{statusBadge}</Badge>
                  </div>
                  <h3
                    className="font-semibold text-[16px] text-stone-900 mb-1.5 leading-snug line-clamp-2 cursor-pointer hover:text-amber-700 transition-colors"
                    onClick={() => setLocation(articlesRoute)}
                    title="เปิดดูรายการบทความ"
                  >{title}</h3>
                  <p className="text-[13px] text-stone-600 leading-relaxed line-clamp-2 mb-4">{desc}</p>
                  <div className="flex items-center gap-1.5" data-testid={`project-${p.id}-actions`}>
                    <Button
                      size="sm" variant="ghost"
                      className="!h-8 !rounded-lg !px-2 text-stone-600 hover:!bg-amber-50 hover:!text-amber-700"
                      onClick={() => setLocation(articlesRoute)}
                      title="ดูรายการบทความภายในโปรเจกต์"
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="!h-8 !rounded-lg !px-2 text-stone-600 hover:!bg-sky-50 hover:!text-sky-700"
                      onClick={() => openEditFor(p)}
                      title="แก้ไขข้อมูลโปรเจกต์"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="!h-8 !rounded-lg !px-2 text-stone-600 hover:!bg-purple-50 hover:!text-purple-700"
                      onClick={() => openShareFor(p)}
                      title="แชร์ลิงก์โปรเจกต์นี้"
                    >
                      <Share2 className="size-4" />
                    </Button>
                    <span className="flex-1" />
                    <Button
                      size="sm" variant="ghost"
                      className="!h-8 !rounded-lg !px-2 text-rose-600 hover:!bg-rose-50"
                      onClick={() => openDelFor(p)}
                      title="ลบ / เก็บถาวรโปรเจกต์นี้ (ต้องไม่มีบทความผูก)"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {list.isError && (
        <div className="p-8 text-center rounded-2xl bg-rose-50 border border-rose-200 text-rose-800">
          โหลดข้อมูลโปรเจกต์ไม่สำเร็จ: {(list.error as any)?.message || "ไม่ทราบสาเหตุ"}
        </div>
      )}
    </MainDashboardShell>
  );
}
