import { useState, useEffect, useMemo, useRef } from "react";
import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Upload, Eye, AlertTriangle, Award, Hash, BookCheck, Calendar, FileEdit, Clock, Loader2, Target, CheckCircle2 } from "lucide-react";
import { trpc } from "@/trpc";
import { Link, useRoute, useLocation } from "wouter";
import { toast } from "sonner";
import useAuth, { isUserAdminOrOwner } from "@/hooks/useAuth";

function renderMarkdownSafe(md: string): string {
  // 1) Escape HTML first
  let s = String(md ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  // 2) code blocks before inline (preserve)
  s = s.replace(/```([a-zA-Z_0-9]*)\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre class="bg-stone-900 text-stone-100 p-4 rounded-xl overflow-x-auto text-[12.5px] my-4">${String(code).replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>`);
  // 3) headings 1..6
  s = s.replace(/^###### (.*)$/gm, (_m, t) => `<h6 class="font-bold text-[14.5px] text-stone-800 mt-5 mb-2">${t}</h6>`);
  s = s.replace(/^##### (.*)$/gm, (_m, t) => `<h5 class="font-bold text-[15.5px] text-stone-800 mt-5 mb-2">${t}</h5>`);
  s = s.replace(/^#### (.*)$/gm, (_m, t) => `<h4 class="font-bold text-[16.5px] text-stone-800 mt-5 mb-2">${t}</h4>`);
  s = s.replace(/^### (.*)$/gm, (_m, t) => `<h3 class="font-bold text-[18px] text-stone-800 mt-5 mb-2">${t}</h3>`);
  s = s.replace(/^## (.*)$/gm, (_m, t) => `<h2 class="font-bold text-[20px] text-stone-900 mt-6 mb-3 pb-2 border-b border-stone-200">${t}</h2>`);
  s = s.replace(/^# (.*)$/gm, (_m, t) => `<h1 class="font-bold text-[28px] font-serif text-stone-900 mt-6 mb-4">${t}</h1>`);
  // 4) blockquotes (YMYL disclaimer -> red amber warning)
  s = s.replace(/^&gt;\s*(.*)$/gm, (_m, body) => `<blockquote class="border-l-4 ${body?.toLowerCase?.().includes('disclaimer') || body?.includes('พนัน') || body?.includes('ความเสี่ยง') ? 'border-rose-400 bg-rose-50 text-rose-900' : 'border-amber-400 bg-amber-50 text-stone-800'} p-4 rounded-r-xl my-4 text-[13.5px]">${body}</blockquote>`);
  // 5) lists
  s = s.replace(/^\s*[-*+]\s+(.*)$/gm, (_m, t) => `<li class="ml-5 list-disc marker:text-amber-700 text-stone-700 my-1">${t}</li>`);
  s = s.replace(/^\s*\d+\.\s+(.*)$/gm, (_m, t) => `<li class="ml-5 list-decimal marker:text-amber-700 text-stone-700 my-1">${t}</li>`);
  // 6) paragraph wrap (wrap lines not starting with tags). Use <br/> for line breaks first:
  s = s.replace(/\n{2,}/g, '\n\n__PARA_SPLIT__\n\n');
  const parts = s.split(/__PARA_SPLIT__/);
  s = parts.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return p;
    if (/^<(h[1-6]|pre|blockquote|ol|ul|li|table|p|hr)\b/.test(trimmed)) return p;
    return `<p class="text-stone-700 leading-8 my-3 text-[15px]">${trimmed.replace(/\n/g, '<br/>')}</p>`;
  }).join('');
  // 7) bold + italic inline. Order: **, *
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong class="text-stone-900 font-semibold">$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em class="text-stone-800">$1</em>');
  s = s.replace(/`([^`\n]+)`/g, '<code class="bg-stone-100 text-rose-700 text-[12.5px] px-1.5 py-0.5 rounded border border-stone-200 font-mono">$1</code>');
  // 8) links <a> safe: keep http(s) only
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label, href) => `<a href="${href.replace(/"/g,'&quot;')}" target="_blank" rel="noopener noreferrer nofollow ugc" class="text-amber-700 underline underline-offset-2 hover:text-amber-900 break-all">${label}</a>`);
  // HR
  s = s.replace(/^---*$/gm, '<hr class="border-stone-200 my-6" />');
  return s;
}

export default function ArticleEditorPage() {
  const [m, params] = useRoute("/articles/:id/edit");
  const draftId = Number(params?.id ?? 0);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = isUserAdminOrOwner(user);
  const q = trpc.write.getDraft.useQuery({ draftId }, { enabled: !!draftId, staleTime: 1000 * 30, refetchOnWindowFocus: false });
  const [title, setTitle] = useState("");
  const [mt, setMt] = useState("");
  const [md, setMd] = useState("");
  const [mdes, setMdes] = useState("");
  const [previewMode, setPreviewMode] = useState<"split" | "edit" | "preview">("split");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saveMut = trpc.write.saveDraft.useMutation();
  const saveTimerRef = useRef<any>(null);
  const dirtyRef = useRef(false);

  // debounce auto-save: 30s after last change
  function scheduleAutoSave() {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!dirtyRef.current) return;
      void doSave(true);
    }, 1000 * 30);
  }

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  async function doSave(silent=false, force=false) {
    if (!draftId || !q.data?.draft) { if (!silent) toast.error("ไม่พบบทความ ID"); return; }
    if (!force && saveMut.isPending) return;
    saveMut.mutate({
      draftId,
      title: title || undefined,
      content: md || undefined,
      metaTitle: mt || null,
      metaDescription: mdes || null,
      wordCount,
      eeatScore: eeatEst,
      citationsCount: Math.min(99, Math.max(0, (md.match(/\[CITE\d+\]|\(https?:\/\//g)?.length ?? 0))),
    }, {
      onSuccess(r: any){
        if (r?.ok) {
          dirtyRef.current = false;
          setSavedAt(new Date());
          if (!silent) toast.success(r.message || "บันทึกสำเร็จ DB");
          q.refetch();
        } else if (!silent) toast.error(String(r?.message || "save fail").slice(0, 140));
      },
      onError(err: any){
        const s = String(err?.message || err).slice(0, 140);
        if (!silent) toast.error("Save err: " + s);
        else console.warn("[auto-save fail]", s);
      }
    });
  }

  // dirty tracking: wire title/mt/mdes/md setters via onChange proxy
  const setTitleDirty = (v: string) => { setTitle(v); scheduleAutoSave(); };
  const setMtDirty = (v: string) => { setMt(v); scheduleAutoSave(); };
  const setMdesDirty = (v: string) => { setMdes(v); scheduleAutoSave(); };
  const setMdDirty = (v: string) => { setMd(v); scheduleAutoSave(); };

  useEffect(() => {
    if (q.data?.draft) {
      setTitle(q.data.draft.title || "");
      setMt(q.data.draft.meta_title || "");
      setMdes(q.data.draft.meta_description || "");
      setMd(q.data.draft.content || "");
    }
  }, [q.data?.draft?.id]);

  const wordCount = useMemo(() => {
    const txt = md + " " + title;
    const en = (txt.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0);
    const thai = (txt.match(/[\u0E00-\u0E7F]/g)?.length ?? 0);
    return en + Math.ceil(thai / 3);
  }, [md, title]);

  const ymylInjected = md.slice(0, 1200).includes("คำเตือนความเสี่ยงด้านการพนัน") || md.includes("Disclaimer") || md.includes("ความเสี่ยงทางการเงิน");
  const eeatEst = Math.max(0, Math.min(100,
    20
    + (wordCount >= 1500 ? 20 : Math.floor((wordCount/1500)*20))
    + (ymylInjected ? 15 : 0)
    + (md.split(/อ้างอิง|\[CITE\d+\]|source_url|\(.*\)$/m).length >= 3 ? 15 : 0)
    + (mt.length >= 30 && mt.length <= 120 ? 15 : 0)
    + (mdes.length >= 80 && mdes.length <= 320 ? 15 : 0)
  ));

  const densityInfo = useMemo(() => {
    const total = Math.max(1, wordCount);
    const kwTexts: { word: string; count: number; kind: 'main'|'longtail'|'lsi'; percent: number; status: 'green'|'amber'|'rose' }[] = [];
    const combined = (title + ' ' + md).toLowerCase();
    const strip = (s:string) => s.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
    const titleCleaned = strip(title).toLowerCase();
    const mainKw = titleCleaned.split(/\s+/).filter((w: string) => w.length >= 2).slice(0, 4).join(' ');
    const seen = new Set<string>();
    function add(w: string, kind: 'main'|'longtail'|'lsi') {
      if (!w || w.length < 2 || seen.has(w)) return;
      seen.add(w);
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = combined.match(re);
      const c = matches?.length ?? 0;
      if (c <= 0) return;
      const pct = (c / total) * 100;
      let status: 'green'|'amber'|'rose' = 'green';
      if (pct > 2) status = 'rose'; else if (pct >= 1.3) status = 'amber';
      kwTexts.push({ word: w, count: c, kind, percent: pct, status });
    }
    if (mainKw) { add(mainKw, 'main'); titleCleaned.split(/\s+/).filter((w: string) => w.length >= 3).forEach((w: string) => add(w, 'lsi')); }
    const mdText = md.toLowerCase();
    const thWords = Array.from(mdText.match(/[\u0E00-\u0E7F]{3,}/g) ?? []);
    const freqTh = new Map<string, number>();
    thWords.forEach(w => freqTh.set(w, (freqTh.get(w) || 0) + 1));
    Array.from(freqTh.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([w, c]) => { if (c >= 2) add(w, c > titleCleaned.split(/\s+/).length ? 'longtail' : 'lsi'); });
    const biEn = Array.from(mdText.match(/[a-zA-Z0-9'-]{3,}\s+[a-zA-Z0-9'-]{3,}/g) ?? []);
    const freqEn = new Map<string, number>(); biEn.forEach(p => freqEn.set(p, (freqEn.get(p) || 0) + 1));
    Array.from(freqEn.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([w, c]) => { if (c >= 2) add(w, 'longtail'); });
    const sorted = kwTexts.slice().sort((a, b) => b.count - a.count).slice(0, 6);
    const totalCount = sorted.reduce((acc, k) => acc + k.count, 0);
    const totalPercent = (totalCount / total) * 100;
    let overallStatus: 'green'|'amber'|'rose' = 'green';
    if (totalPercent > 2) overallStatus = 'rose'; else if (totalPercent >= 1.5) overallStatus = 'amber';
    return { topKeywords: sorted, totalCount, totalPercent, overallStatus };
  }, [title, md, wordCount]);

  const publishMut = trpc.write.publish.useMutation();
  function doPublish(e: any, unpublish=false) {
    e.preventDefault();
    if (!isAdmin) { toast.error("สิทธิ์ไม่เพียงพอ: ต้องเป็น Admin เท่านั้นที่ตีพิมพ์ได้"); return; }
    publishMut.mutate({ draftId, unpublish }, {
      onSuccess(r: any){
        if (r?.ok) { toast.success(r.message || (unpublish ? "ย้อนกลับเป็นฉบับร่างแล้ว step 9" : "✅ ตีพิมพ์สำเร็จ step 10 (EEAT Verified)")); q.refetch(); }
        else toast.error((r?.message || "Publish fail"));
      }, onError(err: any){ toast.error("Publish err: "+String(err?.message||err).slice(0,120)); }
    });
  }

  const stat = q.data?.draft?.status as 'draft'|'published'|undefined;
  const wf = q.data?.workflow;
  const isStepFail = String(wf?.step_status || '') === 'fail';
  const publishDisabled = !isAdmin || wordCount<1500 || publishMut.isPending || (stat !== 'published' && isStepFail);

  return (
    <MainDashboardShell
      headerTitle="แก้ไขบทความ / ตีพิมพ์"
      headerSubtitle={q.data?.draft?.id ? `ID #${q.data.draft.id} · สถานะ ${stat === 'published' ? 'ตีพิมพ์แล้ว' : 'ฉบับร่าง'} · ${wordCount.toLocaleString()} คำ · EEAT ประมาณ ${eeatEst}/100` : 'โหลดบทความ...'}
      headerActions={
        <>
          <Link href="/articles">
            <Button variant="outline" size="sm" className="!h-9 !rounded-lg mr-2"><ArrowLeft className="size-4 mr-2" />กลับรายการ</Button>
          </Link>
          <div className="mr-1 inline-flex rounded-lg border border-stone-200 bg-stone-100 p-1 overflow-hidden">
            <button onClick={()=>setPreviewMode('edit')} className={'!h-7 !px-3 text-[12px] rounded-md font-medium '+ (previewMode==='edit'?'bg-white text-stone-900 shadow-sm':'')} >แก้ไข</button>
            <button onClick={()=>setPreviewMode('split')} className={'!h-7 !px-3 text-[12px] rounded-md font-medium '+ (previewMode==='split'?'bg-white text-stone-900 shadow-sm':'')}>แบ่งหน้าจอ</button>
            <button onClick={()=>setPreviewMode('preview')} className={'!h-7 !px-3 text-[12px] rounded-md font-medium '+ (previewMode==='preview'?'bg-white text-stone-900 shadow-sm':'')}>ตัวอย่าง</button>
          </div>
          <Button variant="ghost" size="sm" className="!h-9 !rounded-lg text-stone-600 hover:!bg-stone-100" onClick={() => { setPreviewMode('preview'); window.scrollTo({ top: 0, behavior: 'smooth' }); toast.success('✅ เปิดพรีวิวเต็มหน้า (ปิด Sidebar แสดงผลเต็ม)'); }}><Eye className="size-4 mr-1.5" />พรีวิวเต็มหน้า</Button>
          <Button size="sm" className="!h-9 !rounded-lg !bg-stone-800 hover:!bg-stone-900" onClick={()=>doSave(false, false)} disabled={saveMut.isPending || !draftId}>
            {saveMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
            {saveMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
          {stat !== 'published' ? (
            <Button size="sm" className="!h-9 !rounded-lg !bg-emerald-700 hover:!bg-emerald-800" onClick={e=>doPublish(e, false)} disabled={publishDisabled} title={isStepFail ? '⚠️ บทความยังมี Placeholder section ต้องเขียนทับเองก่อนตีพิมพ์' : undefined}>
              <Upload className="size-4 mr-2" />ตีพิมพ์ step 10
              {wordCount<1500 && <span className="ml-1 text-[10px] opacity-80">(need ≥1500)</span>}
              {isStepFail && <span className="ml-1 text-[10px] opacity-80 text-amber-200">⚠️ Placeholder</span>}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="!h-9 !rounded-lg" onClick={e=>doPublish(e,true)} disabled={!isAdmin}>
              ย้อนกลับร่าง (step 9)
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
        <div className="lg:col-span-8 space-y-4">
          {q.isLoading ? (
            <Card className="!rounded-2xl !border !border-stone-200 animate-pulse">
              <CardContent className="p-5 space-y-3">
                <div className="h-8 bg-stone-100 rounded w-2/3"/>
                <div className="h-4 bg-stone-100 rounded w-1/2"/><div className="h-4 bg-stone-100 rounded w-full"/><div className="h-4 bg-stone-100 rounded w-5/6"/>
              </CardContent>
            </Card>
          ) : q.error ? (
            <Card className="!rounded-2xl !border-rose-200 bg-rose-50"><CardContent className="p-5 text-rose-700">โหลดบทความล้มเหลว: {String((q.error as any)?.message ?? q.error).slice(0, 200)}</CardContent></Card>
          ) : (
            <>
              <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
                <CardContent className="p-5 space-y-4">
                  <div>
                    <label className="text-[12px] uppercase tracking-wider text-stone-500 mb-1.5 block">ชื่อบทความ (H1 Title)</label>
                    <input value={title} onChange={e=>setTitleDirty(e.target.value)} className="w-full !h-11 text-[18px] font-bold rounded-xl border border-stone-200 px-4 outline-none focus:ring-2 focus:ring-amber-200 bg-white" placeholder="เช่น คู่มือสล็อตออนไลน์ปี 2569 — ข้อมูลทันสมัย 10 ข้อควรรู้" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[12px] uppercase tracking-wider text-stone-500 mb-1.5 block">Meta Title (≤120 อักขระ) <span className="text-stone-400 ml-1">{mt.length}/120</span></label>
                      <input value={mt} onChange={e=>setMtDirty(e.target.value.slice(0,120))} className="w-full !h-9 rounded-lg border border-stone-200 px-3 text-[13px] outline-none focus:ring-2 focus:ring-amber-200 bg-white" placeholder="SEO title tag SERP result" />
                    </div>
                    <div>
                      <label className="text-[12px] uppercase tracking-wider text-stone-500 mb-1.5 block">Meta Description (≤320 อักขระ) <span className="text-stone-400 ml-1">{mdes.length}/320</span></label>
                      <input value={mdes} onChange={e=>setMdesDirty(e.target.value.slice(0,320))} className="w-full !h-9 rounded-lg border border-stone-200 px-3 text-[13px] outline-none focus:ring-2 focus:ring-amber-200 bg-white" placeholder="SERP snippet description 160-320 chars recommended" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
                <CardContent className="p-0 overflow-hidden">
                  {previewMode !== "preview" && (
                    <div className={"p-0 " + (previewMode === "split" ? "md:grid md:grid-cols-2 md:divide-x md:divide-stone-200" : "")}>
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-[12px] uppercase tracking-wider text-stone-500 font-semibold">Markdown Editor (Body)</label>
                          <Badge variant="outline" className="!bg-stone-50 !text-stone-600 !border-stone-200"><FileEdit className="size-3.5 mr-1 text-stone-500" />Markdown</Badge>
                        </div>
                        <textarea
                          value={md}
                          onChange={(e) => setMdDirty(e.target.value)}
                          spellCheck={false}
                          className="w-full min-h-[620px] font-mono text-[13.5px] leading-6 resize-y rounded-xl border border-stone-200 p-4 outline-none focus:ring-2 focus:ring-amber-200 bg-stone-50/60 text-stone-800"
                          placeholder={"# H1 หัวข้อหลัก\n\nเนื้อหาบทความ markdown (รองรับ H1..H6, รายการ bullet, blockquote คำเตือน YMYL, citation links 3+ ตัว)..."}
                        />
                      </div>
                      {previewMode === "split" && (
                        <div className="p-5 bg-[#fbfaf7]">
                          <div className="flex items-center justify-between mb-3"><label className="text-[12px] uppercase tracking-wider text-stone-500 font-semibold">Live Preview</label><div className="h-5" /></div>
                          <article className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(md || "# หัวข้อหลัก\n\nเนื้อหาบทความจะแสดงที่นี่เมื่อคุณพิมพ์...") }} />
                        </div>
                      )}
                    </div>
                  )}
                  {previewMode === "preview" && (
                    <div className="p-6 bg-[#fbfaf7]">
                      <article className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(md || "# ยังไม่มีเนื้อหา\n\nเขียนเนื้อหาในหน้าแก้ไขก่อน") }} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <aside className="lg:col-span-4 space-y-4">
          {/* ── 3-TIER CONTEXT CARD (KCP → Editor PASS-THRU) ──
               Shows Pillar / Cluster name / Focus keyword / Sibling keywords in same cluster.
               Answer P0 user question: "คลิกเขียน ระบบต้องดึงข้อมูลชุดนั้นไปที่หน้าเขียน เพื่อเตรียมเริ่มเขียน" */}
          {q.data?.cluster_context && (
            <Card className="!rounded-2xl !border !border-amber-200 !bg-amber-50/40 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-emerald-100 grid place-items-center"><Target className="size-6 text-amber-700" /></div>
                  <div className="flex-1">
                    <p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">โครงคำสำคัญ 3 ระดับ (จาก KCP)</p>
                    <p className="text-[15px] font-bold text-stone-900">นำทาง H1 / H2 / H3</p>
                  </div>
                </div>

                {/* Pillar (H1) */}
                {q.data.cluster_context.pillar_keyword && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: '#fff7ed', color: '#92400e', border: '1px solid #b45309' }} title="บทความ Focus · Meta Title/Desc">H1 · Pillar</span>
                      <b className="text-[13px] text-stone-800 flex-1 break-words min-w-0">{q.data.cluster_context.pillar_keyword.keyword}</b>
                      <span className="text-[10px] text-stone-400 tabular-nums">#{q.data.cluster_context.pillar_keyword.id}</span>
                    </div>
                  </div>
                )}

                {/* Cluster Name */}
                {q.data.cluster_context.cluster?.name && (
                  <div className="px-3 py-2 rounded-lg bg-white border border-amber-200/60">
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">กลุ่ม Cluster</p>
                    <p className="text-[13px] font-semibold text-stone-800 break-words">{q.data.cluster_context.cluster.name}</p>
                  </div>
                )}

                {/* Focus Keyword (Current Article) */}
                {q.data.cluster_context.focus_keyword && (
                  <div className="p-3 rounded-xl bg-white border-2 border-emerald-300 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {(() => {
                        const t = String(q.data.cluster_context.focus_keyword.tier ?? 'supporting');
                        const st: any =
                          t === 'pillar' ? { bg: '#fff7ed', color: '#92400e', border: '#b45309', heading: 'H1', desc: 'บทความ Focus' }
                          : t === 'cluster' ? { bg: '#eff6ff', color: '#1d4ed8', border: '#2563eb', heading: 'H2', desc: 'หัวข้อหลัก / Intro' }
                          : { bg: '#ecfdf5', color: '#047857', border: '#059669', heading: 'H3', desc: 'Body · Img · FAQ' };
                        return (
                          <>
                            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: st.bg, color: st.color, border: `1px solid ${st.border}` }} title={st.desc}>{st.heading} · {t === 'pillar' ? 'Pillar' : t === 'cluster' ? 'Cluster' : 'คีย์ลอง'} ✓ คำนี้</span>
                            <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold ml-auto">บทความปัจจุบัน</span>
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-[14px] font-bold text-stone-900 break-words">{q.data.cluster_context.focus_keyword.keyword}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap text-[10.5px] text-stone-500">
                      {q.data.cluster_context.focus_keyword.intent && (
                        <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600">Intent: {String(q.data.cluster_context.focus_keyword.intent)}</span>
                      )}
                      {(typeof q.data.cluster_context.focus_keyword.kd === 'number' && Number.isFinite(q.data.cluster_context.focus_keyword.kd)) && (
                        <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700">KD {Math.round(Number(q.data.cluster_context.focus_keyword.kd))}%</span>
                      )}
                      {(typeof q.data.cluster_context.focus_keyword.sv === 'number' && Number.isFinite(q.data.cluster_context.focus_keyword.sv)) && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">Vol {Number(q.data.cluster_context.focus_keyword.sv).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Siblings in same cluster → H2/H3 checklist */}
                {Array.isArray(q.data.cluster_context.same_cluster_keywords) && q.data.cluster_context.same_cluster_keywords.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">คำอื่นๆ ในกลุ่มเดียว ({q.data.cluster_context.same_cluster_keywords.length} คำ)</p>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                      {q.data.cluster_context.same_cluster_keywords.map((sk: any, i: number) => {
                        const t = String(sk.tier ?? 'supporting');
                        const st: any =
                          t === 'pillar' ? { bg: '#fff7ed', color: '#92400e', border: '#b45309', heading: 'H1' }
                          : t === 'cluster' ? { bg: '#eff6ff', color: '#1d4ed8', border: '#2563eb', heading: 'H2' }
                          : { bg: '#ecfdf5', color: '#047857', border: '#059669', heading: 'H3' };
                        const isFocus = q.data?.cluster_context?.focus_keyword && Number(sk.id) === Number(q.data.cluster_context.focus_keyword.id);
                        return (
                          <div key={sk.id ?? i} className={`flex items-center gap-2 p-2 rounded-lg border ${isFocus ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-stone-200'}`}>
                            <span className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ backgroundColor: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.heading}</span>
                            <span className={`text-[12px] flex-1 break-words min-w-0 ${isFocus ? 'font-semibold text-emerald-800' : 'text-stone-700'}`}>{sk.keyword}</span>
                            {isFocus && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10.5px] leading-5 text-stone-500 mt-1">
                      💡 <b>กฎการวางคำ:</b> Pillar (H1) = บทความหลัก / Cluster (H2) = หัวข้อ Section / Supporting (H3) = ย่อย + ภาพ + FAQ · เขียน H1 1 ครั้ง / H2 1-2 ครั้งต่อคำ / H3 2-4 ครั้งต่อคำ
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-amber-100 grid place-items-center"><Award className="size-6 text-purple-700" /></div>
                <div className="flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">EEAT Score (Estimate)</p>
                  <p className="text-3xl font-bold text-stone-900">{eeatEst}<span className="text-sm text-stone-500 ml-1 font-medium">/ 100</span></p>
                </div>
              </div>
              <div className="space-y-2">
                <ScoreBar label="≥ 1500 คำ" ok={wordCount>=1500} hint={`${wordCount.toLocaleString()} / 1,500 คำ ขั้นต่ำ`} />
                <ScoreBar label="Meta Title (30-120 อักขระ)" ok={mt.length>=30 && mt.length<=120} hint={`${mt.length} อักขระ`} />
                <ScoreBar label="Meta Desc (80-320 อักขระ)" ok={mdes.length>=80 && mdes.length<=320} hint={`${mdes.length} อักขระ`} />
                <ScoreBar label="อ้างอิง ≥ 3 แหล่ง (citations)" ok={(wf?.citations_count ?? 0)>=3 || (md.match(/\)\]|\([^)]+\)$|\[CITE\d+\]/gm)?.length ?? 0)>=3 || md.split(/https?:\/\//).length - 1 >=3 || false} hint={`${wf?.citations_count ?? 'ไม่ทราบ'} citation records`} />
                {wf?.disclaimer_added || ymylInjected ? (
                  <ScoreBar label="YMYL Disclaimer Banner (หมวดพนัน)" ok={ymylInjected || !!wf?.disclaimer_added} hint={ymylInjected ? "✅ Banner อยู่ที่ด้านบนเนื้อหาแล้ว" : "⚠️ เพิ่มคำเตือน YMYL Banner"} warn={!ymylInjected && !wf?.disclaimer_added} />
                ) : null}
                <ScoreBar label="สถานะการตีพิมพ์ step 10/10" ok={stat === 'published'} hint={wf ? `Workflow Step ${wf.write_step}/10 ${wf.step_status}` : (stat === 'published' ? 'ตีพิมพ์แล้ว step 10' : 'ยังเป็นฉบับร่าง (step 8)')} />
              </div>
            </CardContent>
          </Card>

          <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-rose-100 grid place-items-center"><Hash className="size-6 text-amber-700" /></div>
                <div className="flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">Keyword Density (เพดาน ≤ 2%)</p>
                  <p className="text-[15px] font-bold text-stone-900">
                    {wordCount >= 1 ? (Math.min(100, densityInfo.totalPercent * 50).toFixed(1)).toString() : '0.0'}<span className="text-sm text-stone-500 ml-1 font-medium">/ 2.00%</span>
                  </p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12.5px] font-medium text-stone-700">รวม Keyword ทั้งหมด (หลัก+รอง+LSI)</span>
                  <span className={'text-[11.5px] font-medium ' + (densityInfo.overallStatus === 'green' ? 'text-emerald-700' : densityInfo.overallStatus === 'amber' ? 'text-amber-700' : 'text-rose-700')}>
                    {densityInfo.overallStatus === 'green' ? '✅ ไม่เกิน' : densityInfo.overallStatus === 'amber' ? '⚠️ ใกล้เพดาน' : '❌ เกินเพดาน'}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden border border-stone-200">
                  <div className={'h-full transition-all duration-300 ' + (densityInfo.overallStatus === 'green' ? 'bg-emerald-500' : densityInfo.overallStatus === 'amber' ? 'bg-amber-500' : 'bg-rose-500')}
                    style={{ width: `${Math.min(100, (densityInfo.totalPercent / 2.0) * 100)}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 mb-3">
                  <span className="text-[11px] text-stone-500">ใช้จริง {densityInfo.totalCount} ครั้ง ({densityInfo.totalPercent.toFixed(2)}%)</span>
                  <span className="text-[11px] text-stone-500">เหลืออีก {Math.max(0, Math.floor(wordCount * 0.02) - densityInfo.totalCount)} ครั้ง</span>
                </div>
              </div>
              <div className="space-y-2.5 pt-2 border-t border-stone-100">
                {densityInfo.topKeywords.length === 0 && (
                  <div className="text-[12px] text-stone-500 py-2 text-center">ยังไม่พบ Keyword ในเนื้อหา — เขียนเนื้อหาเพิ่ม หรือพิมพ์เริ่มต้น</div>
                )}
                {densityInfo.topKeywords.map((k, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12.5px] font-medium text-stone-700 truncate max-w-[70%]">
                        <span className={k.status === 'green' ? 'text-emerald-700' : k.status === 'amber' ? 'text-amber-700' : 'text-rose-700'}>● </span>
                        <b>{k.word}</b>
                        <span className="text-stone-400 ml-1 text-[11px]">
                          {k.kind === 'main' ? '(หลัก)' : k.kind === 'longtail' ? '(long-tail)' : '(LSI)'}
                        </span>
                      </span>
                      <span className="text-[11.5px] text-stone-500 tabular-nums">{k.count} ครั้ง · {k.percent.toFixed(2)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                      <div className={'h-full ' + (k.status === 'green' ? 'bg-emerald-400' : k.status === 'amber' ? 'bg-amber-400' : 'bg-rose-500')}
                        style={{ width: `${Math.min(100, (k.percent / 1.2) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100 leading-5">
                📐 <b>กฎ:</b> keyword ทั้งหมด (หลัก+รอง+LSI) รวมกัน <b>ไม่เกิน 2%</b> ของจำนวนคำ — เป็น "เพดานกันยัด" ไม่ใช่เป้าที่ต้องถึง (ใช้น้อยกว่าแต่อ่านลื่น = ดีกว่า) · เกิน 2% → เตือนสีแดงให้ลด
              </p>
            </CardContent>
          </Card>

          {wf && (
            <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
              <CardContent className="p-5 space-y-3">
                <p className="text-[12px] uppercase tracking-wider text-stone-500 font-semibold">Write Workflow</p>
                <div className="space-y-2 text-[13px]">
                  <RowInfo icon={<Clock className="size-4 text-stone-500" />} label="Word Count" value={`${Number(wf.word_count||0).toLocaleString()} คำ`} />
                  <RowInfo icon={<BookCheck className="size-4 text-stone-500" />} label="Citations Count" value={`${wf.citations_count ?? 0} แหล่ง`} />
                  <RowInfo icon={<AlertTriangle className={"size-4 " + (wf.disclaimer_added ? 'text-emerald-600' : 'text-rose-600')} />} label="Disclaimer Added (YMYL)" value={wf.disclaimer_added ? '✅ Yes' : '❌ No'} />
                  <RowInfo icon={<Calendar className="size-4 text-stone-500" />} label="Step / Status" value={`Step ${wf.write_step}/10 · ${wf.step_status}`} />
                  {wf.error_msg && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-[12px]">⚠ {wf.error_msg}</div>}
                </div>
              </CardContent>
            </Card>
          )}

          {savedAt && (
            <Card className="!rounded-2xl !border-emerald-200 bg-emerald-50">
              <CardContent className="p-4 text-emerald-800 text-[13px]">บันทึกเมื่อ {savedAt.toLocaleString('th-TH',{ dateStyle:'short', timeStyle:'short' })}</CardContent>
            </Card>
          )}
          <Separator />
          <div className="text-[11.5px] text-stone-400 px-2">Editor frontend safe markdown render (XSS sanitize). Save to backend will be wired in 2E follow-up.</div>
        </aside>
      </div>
    </MainDashboardShell>
  );
}

function ScoreBar({ label, ok, hint, warn }: { label: string; ok: boolean; hint?: string; warn?: boolean; }) {
  const color = ok ? "bg-emerald-500" : (warn ? "bg-amber-500" : "bg-stone-300");
  const textOk = ok ? "text-emerald-700" : (warn ? "text-amber-700" : "text-stone-600");
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12.5px] font-medium text-stone-700">{label}</span>
        <span className={`text-[11.5px] font-medium ${textOk}`}>{ok ? 'ผ่าน' : (warn ? 'ควรปรับ' : 'ไม่ครบ')}</span>
      </div>
      <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} ${ok? 'w-full': warn?'w-2/3':'w-1/3'} transition-all duration-300`} />
      </div>
      {hint && <p className="text-[11px] text-stone-500 mt-1">{hint}</p>}
    </div>
  );
}
function RowInfo({ icon, label, value }: { icon: any; label: string; value: any; }) {
  return <div className="flex items-center gap-3"><span className="opacity-80">{icon}</span><span className="flex-1 text-stone-600">{label}</span><span className="font-medium text-stone-900 tabular-nums">{value}</span></div>;
}
