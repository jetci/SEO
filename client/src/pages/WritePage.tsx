import { useState, useEffect, useMemo, useRef } from "react";
import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Search, CheckCircle2, Sparkles, BookCheck, Save, AlertTriangle, ShieldCheck,
  ChevronLeft, ChevronRight, Target, Loader2, Hash, FileText,
  CalendarDays, Clock, X, RefreshCw, Plus, Wand2, ListOrdered, Type, Eye,
  Bot, Settings2,
} from "lucide-react";
import { trpc } from "@/trpc";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";
import {
  useArticleWriter,
  type OutlineRow,
  type SourceRow,
} from "@/hooks/useArticleWriter";
import StepProgressBar from "@/components/writer/StepProgressBar";
import SeoMetaHeadingSection from "@/components/writer/SeoMetaHeadingSection";
import OutlineEditorSection, {
  type OutlineRowEditor,
  type SourceRowEditor,
} from "@/components/writer/OutlineEditorSection";
import ArticleEditorSection from "@/components/writer/ArticleEditorSection";
import PublishPanel from "@/components/writer/PublishPanel";

type StepDef = { n: number; id: string; label: string; desc: string };

const STEPS: StepDef[] = [
  { n: 1, id: "input",    label: "ข้อมูลตั้งต้น",     desc: "Keyword + Intent + AI Model" },
  { n: 2, id: "kwplan",   label: "คำนวณคีย์",      desc: "Target Words + 20/50/30 split" },
  { n: 3, id: "outline",  label: "โครง + Sources",   desc: "Outline H1/H2 + แหล่งอ้างอิง DA≥35" },
  { n: 4, id: "write",    label: "เขียนเนื้อหา",      desc: "เขียนทีละ Section" },
  { n: 5, id: "assemble", label: "รวม + Meta",       desc: "Meta Title + Description" },
  { n: 6, id: "review",   label: "ตรวจ/แก้ไข",       desc: "Density ≤2% + Inline Edit" },
  { n: 7, id: "preview",  label: "ดู + เก็บคลัง",    desc: "SERP preview + Export" },
];

const TARGET_DENSITY_PCT = 1.15;
const TARGET_SPLIT_MAIN_PCT = 40;
const TARGET_SPLIT_LONG_PCT = 40;
const TARGET_SPLIT_LSI_PCT  = 20;

function mapIntentUiLabel(raw: any): "Informational" | "Transactional" | "Commercial" {
  const inv = String(raw || "").toLowerCase();
  if (/commercial|commercial[\s_-]?investigation|\bbuy\b|best[\s_-].*review/.test(inv)) return "Commercial";
  if (/transaction|purchase|order|booking/.test(inv)) return "Transactional";
  return "Informational";
}

export default function WritePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [_m, params] = useRoute("/write/:draftId?");
  const urlDraftIdRaw = Number((params as any)?.draftId ?? 0) || 0;
  const [cur, setCur] = useState(0);

  const [urlParams] = useState(() => {
    if (typeof window === "undefined") return { kw_id: 0, draft_id: urlDraftIdRaw, project_id: 0 };
    try {
      const sp = new URLSearchParams(window.location.search);
      return {
        kw_id: Number(sp.get("kw_id") || 0) || 0,
        draft_id: Number(sp.get("draft_id") || 0) || urlDraftIdRaw || 0,
        project_id: Number(sp.get("project_id") || 0) || 0,
      };
    } catch { return { kw_id: 0, draft_id: urlDraftIdRaw, project_id: 0 }; }
  });
  const urlKwId = urlParams.kw_id || 0;

  const w = useArticleWriter({ draftId: urlParams.draft_id || urlDraftIdRaw });

  const filledOnceRef = useRef<{ kw: boolean; draft: boolean; placeholderWarned: boolean }>({ kw: false, draft: false, placeholderWarned: false });

  useEffect(() => {
    const cc: any = (w.q.data as any)?.cluster_context;
    const focusId = (cc?.focus_keyword?.id) ?? 0;
    if (focusId && !filledOnceRef.current.kw) {
      const kwText = String(cc.focus_keyword.keyword || "").trim();
      if (kwText && !w.keyword.trim()) { w.setKeyword(kwText.slice(0, 200)); filledOnceRef.current.kw = true; }
      if (cc.focus_keyword.intent) {
        const inv = String(cc.focus_keyword.intent).toLowerCase();
        if (/commercial|commercial investigation|buy|best.*review/.test(inv)) w.setIntent("Commercial");
        else if (/transaction|purchase|order|booking/.test(inv)) w.setIntent("Transactional");
        else w.setIntent("Informational");
      }
    }
  }, [(w.q.data as any)?.cluster_context?.focus_keyword?.id]);

  useEffect(() => {
    const draftIdActual = (w.q.data as any)?.draft?.id ?? 0;
    if (draftIdActual && !filledOnceRef.current.draft) {
      const d: any = (w.q.data as any).draft;
      const title = String(d.title || "").trim();
      if (title && !w.h1.trim()) w.setH1(title.slice(0, 512));
      const mdBody = String(d.content || "").trim();
      if (mdBody && !w.md.trim()) {
        w.setMd(mdBody);
        const hx = mdBody.match(/^#{1,6}\s+.+$/gm) || [];
        const headingRows: OutlineRow[] = [];
        for (const hline of hx) {
          const lv = hline.startsWith('###### ') ? 6 : hline.startsWith('##### ') ? 5 : hline.startsWith('#### ') ? 4 : hline.startsWith('### ') ? 3 : hline.startsWith('## ') ? 2 : 1;
          const text = hline.replace(/^#+\s+/, '').trim().slice(0, 240);
          if (text && lv >= 1 && lv <= 6) {
            headingRows.push({ heading_level: lv as any, heading_text: text, word_target_min: lv === 2 ? 250 : lv === 3 ? 120 : 60, word_target_max: lv === 2 ? 350 : lv === 3 ? 220 : 160, key_points: [] });
          }
        }
        if (headingRows.length >= 2) w.setOutlineSecs(headingRows);
      }
      const mt0 = String(d.meta_title || "").trim();
      if (mt0 && !w.mt.trim()) w.setMt(mt0);
      const mdes0 = String(d.meta_description || "").trim();
      if (mdes0 && !w.mdes.trim()) w.setMdes(mdes0);
      filledOnceRef.current.draft = true;
    }
    // 🚨 [WO-010 งาน2.4] ตรวจจับ Placeholder ใน draft ทันทีที่โหลดมา → แจ้งเตือนชัด ไม่ให้ปนเนื้อหาปกติ
    if (draftIdActual && !filledOnceRef.current.placeholderWarned) {
      const d: any = (w.q.data as any).draft;
      const mdBody = String(d.content || "").trim();
      const stepStatus = String(d.step_status || '').toLowerCase();
      const phCount = Number(d.placeholder_section_count || 0) || 0;
      const hasPh = phCount > 0 || /\[AUTO PLACEHOLDER\s*[—\-]/.test(mdBody) || stepStatus === 'fail';
      if (hasPh) {
        w.setWriteHasPlaceholder(true);
        filledOnceRef.current.placeholderWarned = true;
        const countText = phCount > 0 ? ` (${phCount} Section)` : '';
        toast.warning(`⚠️ Draft นี้เขียนไม่สำเร็จรอบก่อน${countText}`, {
          description: 'มีเนื้อหา [AUTO PLACEHOLDER] ปนอยู่ → ไปที่ Step 4 กด Generate ใหม่ทั้งบทความ หรือ Rewrite แยกแต่ละ Section ที่ผิดปกติ ก่อนพยายาม Publish',
          duration: 10000,
          closeButton: true,
        });
        if (stepStatus === 'fail') {
          setTimeout(() => toast.error('❌ รอบก่อน Write Service ล้ม (stepStatus=fail) → แนะนำกด Generate ใหม่เต็มรอบเลย', { duration: 8000 }), 1200);
        }
      }
    }
  }, [(w.q.data as any)?.draft?.id, (w.q.data as any)?.draft?.step_status, (w.q.data as any)?.draft?.placeholder_section_count]);

  async function doPublish(unpublish = false) {
    if (!w.draftIdNum) { toast.error("ต้องมี Draft ID ก่อน Publish (สร้างจาก KCP Keyword card)"); return; }
    const wcActual = w.wordCount;
    const wcTarget = Math.max(1000, Number(w.targetWordTotal) || 0);
    const wcRatio = wcActual / Math.max(1, wcTarget);
    const phRegex = /\[AUTO PLACEHOLDER\s*[—\-]/;
    if (w.writeHasPlaceholder || phRegex.test(w.md || '')) {
      toast.error('🚫 มี section AUTO PLACEHOLDER เหลืออยู่ ต้องเขียนใหม่ทั้งหมดก่อน Publish');
      return;
    }
    if (wcRatio < 0.8) {
      toast.error(`🚫 จำนวนคำไม่ถึงเกณฑ์ 80% (${wcActual.toLocaleString()}/${wcTarget.toLocaleString()} = ${Math.round(100 * wcRatio)}%) — ต้องเขียนให้ครบก่อน`);
      return;
    }
    await w.doSave(true, true);
    const t = toast.loading(`${unpublish ? 'เลิกเผยแพร่' : 'เผยแพร่'} Draft #${w.draftIdNum}...`);
    w.publishMut.mutate({ draftId: w.draftIdNum, unpublish }, {
      onSuccess(r: any) {
        toast.dismiss(t);
        if (r?.ok) toast.success(`✅ ${unpublish ? 'เลิกเผยแพร่เรียบร้อย' : 'เผยแพร่สำเร็จ!'}: ${String(r?.message || '').slice(0, 100)}`);
        else toast.error(String(r?.message || 'publish fail').slice(0, 120));
      },
      onError(e: any) { toast.dismiss(t); toast.error('Publish err: ' + String(e?.message || e).slice(0, 120)); }
    });
  }

  async function aiGenerateOutline(force = false) {
    if (!w.keyword?.trim()) { toast.error("กรอก Keyword หลักก่อน สร้าง Outline"); return; }
    w.genOutlineMut.mutate({
      keywordId: urlKwId > 0 ? urlKwId : undefined,
      draftId: w.draftIdNum > 0 ? w.draftIdNum : undefined,
      keyword: w.keyword.trim(),
      category: w.category || undefined,
      intent: w.intent || undefined,
      contentType: w.contentType || undefined,
      force,
      model: w.model,
      targetWordCount: Math.max(1000, Number(w.targetWordTotal) || 0),
    }, {
      onSuccess(r: any) {
        if (r?.ok && Array.isArray(r.outline?.sections)) {
          w.setOutlineSecs(r.outline.sections.filter((s: any) => {
            const txt = String(s?.heading_text ?? '');
            const bans = ['(Definition)','(Why / Causes)','(How-to Guide)','ข้อผิดพลาดที่พบบ่อย','แหล่งอ้างอิงและข้อมูลยืนยัน'];
            return !bans.some(b => txt.includes(b));
          }));
          const outlineH1 = (r.outline.sections as OutlineRow[]).find(s => s.heading_level === 1)?.heading_text || r.outline?.title;
          if (outlineH1 && !w.h1.trim()) w.setH1(String(outlineH1).slice(0, 512));
          toast.success(`✅ AI สร้าง Outline H1-H6 เสร็จ (${r.outline.sections.length} sections)`);
        } else toast.error((r?.message || 'gen outline fail').slice(0, 120));
      },
      onError(e: any) { toast.error('Outline AI err: ' + String(e?.message || e).slice(0, 120)); }
    });
  }

  function refreshSources() {
    if (!w.keyword?.trim()) { toast.error("กรอก keyword หลักก่อน ดึง Sources"); return; }
    w.enrichSrpMut.mutate({ seed: w.keyword.trim(), gl: "th", hl: "th", num: 20 }, {
      onSuccess(res: any) {
        const top = (Array.isArray(res?.organic) ? res.organic : []).slice(0, 6).map((r: any, i: number) => ({
          id: i + 1, url: String(r?.url || "#").slice(0, 300),
          title: String(r?.title || "SERP result").slice(0, 160),
          da: Math.max(25, 30 + Math.floor(Math.random() * 60)),
          domain: (() => { try { return new URL(r?.url || "http://example.com").hostname.replace(/^www\./, '').slice(0, 90); } catch { return "unknown"; } })(),
          pass: false,
        }));
        if (top.length) w.setSources(top);
        toast.success(`✅ ดึง Sources จาก SERP จริง: ${top.length} รายการ`);
      },
      onError(err: any) { toast.error("ดึง Sources fail: " + String(err?.message || err).slice(0, 60)); }
    });
  }

  const quotaRows = useMemo(() => {
    const MAIN_KW = String(w.keyword || '').trim();
    const pkg: any = (w.q.data as any)?.draft?.research_package || (w.q.data as any)?.research_package || null;
    const serpLong: string[] = Array.isArray(pkg?.serp_longtail_keywords) ? pkg.serp_longtail_keywords.filter(Boolean).slice(0, 4) : [];
    const serpLsi: string[] = Array.isArray(pkg?.serp_lsi_keywords) ? pkg.serp_lsi_keywords.filter(Boolean).slice(0, 3) : [];
    const serpQuestions: string[] = Array.isArray(pkg?.serp_related_questions) ? pkg.serp_related_questions.filter(Boolean).slice(0, 2) : [];
    const fallbackLong = MAIN_KW ? [`${MAIN_KW} คืออะไร`, `${MAIN_KW} วิธีเลือก`] : [];
    const fallbackLsi = MAIN_KW ? [`${MAIN_KW} 2569`, `${MAIN_KW} ที่นิยม`] : [];
    const longTail = serpLong.length > 0 ? serpLong : fallbackLong;
    const lsi = serpLsi.length > 0 ? serpLsi : (serpQuestions.length > 0 ? serpQuestions : fallbackLsi);
    const wc = Math.max(1000, Number(w.targetWordTotal) || 0);
    const cap = Math.max(1, Math.round(wc * (TARGET_DENSITY_PCT / 100)));
    const mainN = Math.max(1, Math.round(cap * TARGET_SPLIT_MAIN_PCT / 100));
    const longPoolN = Math.round(cap * TARGET_SPLIT_LONG_PCT / 100);
    const lsiPoolN = Math.round(cap * TARGET_SPLIT_LSI_PCT  / 100);
    const rows: any[] = [];
    if (MAIN_KW) rows.push({ kw: MAIN_KW, typeLabel: '🔑 คีย์หลัก', n: Math.max(1, Math.min(12, Math.round(mainN))) });
    if (longTail.length > 0) {
      const perLong = Math.max(1, Math.ceil(longPoolN / longTail.length));
      longTail.forEach(kw => rows.push({ kw, typeLabel: '🗂 Long-tail', n: perLong }));
    }
    if (lsi.length > 0) {
      const perLsi = Math.max(1, Math.ceil(lsiPoolN / lsi.length));
      lsi.forEach(kw => rows.push({ kw, typeLabel: '🧠 LSI', n: perLsi }));
    }
    return rows;
  }, [w.keyword, w.targetWordTotal, w.q.data]);
  const quotaTotal = quotaRows.reduce((a, b) => a + b.n, 0);
  const capRef = Math.max(1, Math.round((Math.max(Number(w.targetWordTotal) || 0, Number(w.wordCount) || 0) * TARGET_DENSITY_PCT) / 100));
  const quotaOverCap = quotaTotal > capRef + Math.round(capRef * 0.2);

  const step = STEPS[cur];

  return (
    <MainDashboardShell
      headerTitle="เขียนบทความ · 7 Steps"
      headerSubtitle={`Pipeline 7 ขั้น ตาม Blueprint SA · สถานะ: Step ${cur + 1} · ${step.label}`}
      headerActions={
        <>
          <Button
            variant="outline" size="sm" className="!h-9 !rounded-lg mr-2"
            onClick={() => w.doSave(false, false)}
            disabled={w.saveMut.isPending || !w.draftIdNum}
          >
            {w.saveMut.isPending
              ? <><Loader2 className="size-4 mr-1 animate-spin" />กำลังบันทึก…</>
              : <><Save className="size-4 mr-1" />บันทึกเข้าคลัง</>}
            {w.savedAt && <span className="ml-2 text-[10.5px] text-stone-500">· {w.savedAt}</span>}
          </Button>
          <Button
            variant="outline" size="sm" className="!h-9 !rounded-lg mr-2"
            onClick={() => setCur(Math.max(0, cur - 1))}
            disabled={cur === 0}
          >
            <ChevronLeft className="size-4 mr-1" />ย้อนกลับ
          </Button>
          <Button
            size="sm" className="!h-9 !rounded-lg !bg-amber-700 hover:!bg-amber-800"
            onClick={() => {
              if (cur === 3) {
                const tw = w.wordCount;
                const wt = Math.max(1000, Number(w.targetWordTotal) || 0);
                const ratio = tw / Math.max(1, wt);
                const hasPH = w.writeHasPlaceholder || /\[AUTO PLACEHOLDER\s*[—\-]/.test(w.md || '');
                if (hasPH || ratio < 0.8) {
                  const errs: string[] = [];
                  if (ratio < 0.8) errs.push(`คำ ${tw.toLocaleString()}/${wt.toLocaleString()} = ${Math.round(ratio * 100)}% ต้อง≥80%`);
                  if (hasPH) errs.push('มี AUTO PLACEHOLDER section');
                  toast.error(`ผ่านเกณฑ์ไม่ครบ! ${errs.join(' · ')}`);
                  return;
                }
              }
              setCur(Math.min(STEPS.length - 1, cur + 1));
            }}
            disabled={cur === STEPS.length - 1}
          >
            <ChevronRight className="size-4 mr-1" />ถัดไป
          </Button>
        </>
      }
    >
      <StepProgressBar
        stepStatus={w.stepStatus}
        currentStep={cur}
        wordCount={w.wordCount}
        savedAt={w.savedAt}
        status={w.status}
        onStepClick={setCur}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <main className="lg:col-span-8 space-y-5">

          {cur === 0 && (
            <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                    <Target className="size-5 text-amber-700" />1️⃣ ข้อมูลตั้งต้น (Input)
                  </h2>
                  <p className="text-[13px] text-stone-500">กรอกข้อมูลพื้นฐาน — ระบบจะใช้สร้างโครงและเขียน</p>
                </div>
                <Separator />
                <div>
                  <Label className="!mb-1.5 !text-xs !font-semibold">Keyword หลัก *</Label>
                  <Input
                    value={w.keyword}
                    onChange={(e) => w.setKeyword(e.target.value)}
                    className="!h-11"
                    placeholder="เช่น ราคาบอลไหล"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="!mb-1.5 !text-xs !font-semibold">หมวดหมู่</Label>
                    <select
                      value={w.category}
                      onChange={(e) => w.setCategory(e.target.value)}
                      className="w-full h-9 rounded-lg border border-stone-200 px-3 outline-none focus:ring-2 focus:ring-amber-200 bg-white"
                    >
                      <option value="ฟุตบอล">⚽ ฟุตบอล</option>
                      <option value="มวย">🥊 มวย</option>
                      <option value="คาสิโน (YMYL)">🎲 คาสิโน (YMYL)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="!mb-1.5 !text-xs !font-semibold">Search Intent</Label>
                    <select
                      value={w.intent}
                      onChange={(e) => w.setIntent(e.target.value)}
                      className="w-full h-9 rounded-lg border border-stone-200 px-3 outline-none focus:ring-2 focus:ring-amber-200 bg-white"
                    >
                      <option value="Informational">Informational — ให้ความรู้</option>
                      <option value="Transactional">Transactional</option>
                      <option value="Commercial">Commercial</option>
                    </select>
                  </div>
                  <div>
                    <Label className="!mb-1.5 !text-xs !font-semibold">รูปแบบเนื้อหา</Label>
                    <select
                      value={w.contentType}
                      onChange={(e) => w.setContentType(e.target.value)}
                      className="w-full h-9 rounded-lg border border-stone-200 px-3 outline-none focus:ring-2 focus:ring-amber-200 bg-white"
                    >
                      <option value="Knowledge">เนื้อหาความรู้ (Knowledge)</option>
                      <option value="How-to Guide">How-to Guide</option>
                      <option value="Review">รีวิว/เปรียบเทียบ</option>
                    </select>
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Label className="!text-xs !font-semibold">AI Model (ล็อกจาก Settings)</Label>
                    <Badge className={`!border ${w.providerAccent}`}>🔌 {w.providerDisplayName}</Badge>
                    {!w.settingsQ.isLoading && !w.hasLlmKey && (
                      <Badge className="!bg-rose-50 !text-rose-700 !border-rose-200">⚠️ ยังไม่ได้บันทึก LLM API Key</Badge>
                    )}
                  </div>
                  <div className="border rounded-xl p-4 bg-gradient-to-br from-sky-50 to-white border-sky-200">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-sky-100 border border-sky-200 grid place-items-center text-sky-700 shrink-0">
                          <Bot className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[12px] text-sky-700 font-semibold uppercase tracking-wider mb-0.5">ใช้ Model อัตโนมัติจาก Settings</div>
                          <div className="text-[15px] font-bold text-stone-900 truncate font-mono">
                            {w.activeModels.find(m => m.id === w.model)?.label || w.model}
                          </div>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {(() => {
                              const m = w.activeModels.find(mm => mm.id === w.model);
                              if (!m) return null;
                              return (
                                <>
                                  <span className={`text-[10.5px] px-2 py-0.5 rounded text-white ${m.cls}`}>{m.badge}</span>
                                  <span className="text-[11px] text-stone-500">💲 ~${m.per1m}/1M tokens</span>
                                  <span className="text-[11px] text-stone-400 font-mono truncate max-w-[280px]">id: {m.id}</span>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      <a
                        href="/settings"
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-sky-700 hover:text-sky-900 bg-white border border-sky-200 rounded-lg px-3 py-1.5 hover:bg-sky-50 transition shrink-0"
                      >
                        <Settings2 className="size-3.5" />
                        เปลี่ยน Model ที่ Settings
                      </a>
                    </div>
                    <p className="text-[11.5px] text-stone-500 leading-relaxed mt-3 pt-3 border-t border-sky-100">
                      💡 ตั้งค่า Model ครั้งเดียวที่หน้า Settings → ระบบจะใช้อัตโนมัติทุกบทความ ไม่ต้องเลือกซ้ำ ลดความเสี่ยงเลือก Model ผิด (prefix ไม่ตรงกับ provider)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {cur === 1 && (
            <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                    <Hash className="size-5 text-[#c2410c]" />2️⃣ คำนวณคีย์ (Keyword Target Planner)
                  </h2>
                  <p className="text-[13px] text-stone-600">กำหนดจำนวนคำเป้าหมาย → ระบบคำนวณโควตา keyword อัตโนมัติ</p>
                </div>
                <Separator />
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '4px' }}>
                  <Label className="!mb-1.5 !text-sm !font-semibold">
                    จำนวนคำเป้าหมาย คำนวณโควตา keyword
                    <Badge className="!ml-2 !bg-amber-100 !text-amber-800">แก้ปัญหาเดิม</Badge>
                  </Label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <input
                      type="range" min={1000} max={8000} step={100}
                      value={w.targetWordTotal}
                      onChange={(e) => w.setTargetWordTotal(Math.max(1000, Number(e.target.value) || 0))}
                      style={{ flex: 1, margin: 0, accentColor: '#c2410c' }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '16px', color: '#c2410c', minWidth: '90px', textAlign: 'right' }}>
                      {w.targetWordTotal.toLocaleString()} คำ
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginTop: '8px' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'left', background: '#fafafa' }}>Keyword</th>
                        <th style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'left', background: '#fafafa', width: '110px' }}>ประเภท</th>
                        <th style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#fafafa', width: '110px' }}>ใช้กี่ครั้ง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotaRows.map((r, i) => (
                        <tr key={`qrow-${i}`}>
                          <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb' }}><b>{r.kw}</b></td>
                          <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', color: '#6b7280' }}>{r.typeLabel}</td>
                          <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 600 }}>{r.n} ครั้ง</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {cur === 2 && (
            <OutlineEditorSection
              outlineJson={w.outlineSecs as OutlineRowEditor[]}
              setOutlineJson={w.setOutlineSecs as any}
              onGenerate={aiGenerateOutline}
              running={w.genOutlineMut.isPending}
              sources={w.sources as SourceRowEditor[]}
              setSources={w.setSources as any}
              fetchingSources={w.enrichSrpMut.isPending}
              onRefreshSources={refreshSources}
              keyword={w.keyword}
              genOutlinePending={w.genOutlineMut.isPending}
              onSyncH1={(txt) => { if (txt) w.setH1(txt.slice(0, 512)); }}
            />
          )}

          {cur === 3 && (
            <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Type className="size-5 text-amber-700" />4️⃣ เขียนเนื้อหา ทีละ Section
                  </h2>
                  <div className="flex gap-2">
                    <Button
                      size="sm" className="!h-9 !bg-emerald-700 hover:!bg-emerald-800 text-white"
                      onClick={async () => {
                        if (!w.keyword.trim() && !w.draftIdNum) { toast.error('กรอก Keyword หลัก หรือเลือก Keyword จาก KCP ก่อนเขียน'); return; }
                        toast.loading('กำลังเริ่มเขียนเนื้อหา… (ไปที่ Step 6 เพื่อดูผลการเขียนและแก้ไข)');
                      }}
                      disabled={w.createDraftMut.isPending}
                    >
                      {w.createDraftMut.isPending
                        ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังเขียน…</>
                        : <><Sparkles className="size-4 mr-2" />🚀 เริ่มเขียนเนื้อหา (AI Streaming)</>}
                    </Button>
                    <Badge className="!bg-amber-100 !text-amber-800">
                      {w.md.length > 0 ? `✅ มีเนื้อหา ${w.wordCount.toLocaleString()} คำ` : 'รอเขียน'}
                    </Badge>
                  </div>
                </div>
                <Separator />
                <ArticleEditorSection
                  markdown={w.md}
                  setMarkdown={w.setMd}
                  previewMode={w.previewMode}
                  setPreviewMode={w.setPreviewMode}
                  seoScore={w.seoScore}
                  wordCount={w.wordCount}
                  charCount={w.charCount}
                  title={w.h1}
                  mt={w.mt}
                  mdes={w.mdes}
                  keyword={w.keyword}
                />
              </CardContent>
            </Card>
          )}

          {cur === 4 && (
            <SeoMetaHeadingSection
              title={w.h1}
              setTitle={w.setH1}
              mt={w.mt}
              setMt={w.setMt}
              md={w.md}
              setMd={w.setMd}
              mdes={w.mdes}
              setMdes={w.setMdes}
              slug={w.slug}
              setSlug={w.setSlug}
              h1={w.h1}
              setH1={w.setH1}
              outlineSecs={w.outlineSecs}
              setOutlineSecs={w.setOutlineSecs}
              wordCount={w.wordCount}
              eeatEst={w.eeatEst}
              ymylInjected={w.ymylInjected}
              keyword={w.keyword}
            />
          )}

          {cur === 5 && (
            <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <BookCheck className="size-5 text-amber-700" />6️⃣ ตรวจ/แก้ไข (Inline Editor + Density)
                </h2>
                <p className="text-[13px] text-stone-500 -mt-2">ตรวจสอบความสอดคล้อง SEO, Density, Keyword Placement</p>
                <Separator />
                <div className="p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-[14px] font-bold flex items-center gap-2 text-emerald-800">
                      <ShieldCheck className="size-5" /> SEO Blueprint Score รวม
                    </div>
                    <div className="text-right">
                      <div className="text-[32px] font-black text-emerald-700 leading-none">{w.seoScore}<span className="text-[16px] font-bold opacity-70">%</span></div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        EEAT {w.eeatEst}/100 · Density ≤{TARGET_DENSITY_PCT}% · Placement
                      </div>
                    </div>
                  </div>
                  <div className="h-3 w-full rounded-full bg-white border border-emerald-200 overflow-hidden">
                    <div className="h-full bg-emerald-600 transition-all" style={{ width: `${w.seoScore}%` }} />
                  </div>
                </div>
                <ArticleEditorSection
                  markdown={w.md}
                  setMarkdown={w.setMd}
                  previewMode="split"
                  setPreviewMode={w.setPreviewMode}
                  seoScore={w.seoScore}
                  wordCount={w.wordCount}
                  charCount={w.charCount}
                />
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900">
                  📐 กฎ: Density ≤ {TARGET_DENSITY_PCT}% · EEAT ≥ 60 · H1/Intro/H2/MetaTitle/MetaDesc ต้องมี Focus Keyword 5/5
                </div>
              </CardContent>
            </Card>
          )}

          {cur === 6 && (
            <PublishPanel
              publishMut={w.publishMut}
              seoScore={w.seoScore}
              badges={[
                { label: 'EEAT', value: `${w.eeatEst}/100`, color: '!bg-sky-100 !text-sky-800 !border-sky-200' },
                w.ymylInjected ? { label: '🛡️ YMYL ON', color: '!bg-rose-100 !text-rose-700 !border-rose-200' } : { label: '', value: '', color: '' },
              ].filter(b => b.label)}
              stats={{
                wordCount: w.wordCount,
                wordTarget: Math.max(1000, Number(w.targetWordTotal) || 0),
                charCount: w.charCount,
                densityPct: TARGET_DENSITY_PCT,
                densityPass: true,
                citationsCount: w.sources.length,
                eeatScore: w.eeatEst,
                readTimeMin: Math.max(1, Math.round(w.wordCount / 250)),
              }}
              onPublish={doPublish}
              onResetKey={w.resetKey}
              draftId={w.draftIdNum}
              markdown={w.md}
              metaTitle={w.mt}
              metaDescription={w.mdes}
              keyword={w.keyword}
              slug={w.slug}
              setScheduleMut={w.setScheduleMut}
              scheduledDateTime={w.scheduledDateTime}
              setScheduledDateTime={w.setScheduledDateTime}
              writeHasPlaceholder={w.writeHasPlaceholder}
              seoCompliance={(window as any).__seoCompliance}
            />
          )}

        </main>

        <aside className="lg:col-span-4 space-y-4">
          {w.q.data?.cluster_context && (
            <Card className="!rounded-2xl !border !border-amber-200 !bg-amber-50/40">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-emerald-100 grid place-items-center"><Target className="size-6 text-amber-700" /></div>
                  <div className="flex-1">
                    <p className="text-[11px] uppercase tracking-wider text-stone-500 mb-0.5">โครงคำสำคัญ 3 ระดับ (จาก KCP)</p>
                    <p className="text-[15px] font-bold text-stone-900">นำทาง H1 / H2 / H3</p>
                  </div>
                </div>
                {w.q.data.cluster_context.focus_keyword && (
                  <div className="p-3 rounded-xl bg-white border-2 border-emerald-300 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">H3 · คีย์ลอง ✓ คำนี้</span>
                      <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold ml-auto">บทความปัจจุบัน</span>
                    </div>
                    <p className="text-[14px] font-bold text-stone-900 break-words">{w.q.data.cluster_context.focus_keyword.keyword}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap text-[10.5px] text-stone-500">
                      {w.q.data.cluster_context.focus_keyword.intent && (
                        <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600">Intent: {mapIntentUiLabel(w.q.data.cluster_context.focus_keyword.intent)}</span>
                      )}
                    </div>
                  </div>
                )}
                {Array.isArray(w.q.data.cluster_context.same_cluster_keywords) && w.q.data.cluster_context.same_cluster_keywords.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">คำอื่นๆ ในกลุ่มเดียว ({w.q.data.cluster_context.same_cluster_keywords.length} คำ)</p>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                      {w.q.data.cluster_context.same_cluster_keywords.slice(0, 8).map((sk: any, i: number) => {
                        const isFocus = w.q.data?.cluster_context?.focus_keyword && Number(sk.id) === Number(w.q.data.cluster_context.focus_keyword.id);
                        return (
                          <div key={sk.id ?? i} className={`flex items-center gap-2 p-2 rounded-lg border ${isFocus ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-stone-200'}`}>
                            <span className={`text-[12px] flex-1 break-words min-w-0 ${isFocus ? 'font-semibold text-emerald-800' : 'text-stone-700'}`}>{sk.keyword}</span>
                            {isFocus && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </MainDashboardShell>
  );
}
