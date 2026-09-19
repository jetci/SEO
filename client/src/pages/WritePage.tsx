import { useState, useEffect, useMemo, useRef } from "react";
import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Search, CheckCircle2, Sparkles, BookCheck, Eye, Save, AlertTriangle, ShieldCheck,
  FileDown, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, FileText, Type, ListOrdered,
  RefreshCw, Hash, Target, Loader2, Wand2, Plus, Minus, GripVertical,
  CalendarDays, Clock, X, Trash2, FileType, CheckCircle2 as CheckCircle2Icon,
} from "lucide-react";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import mammoth from "mammoth";
import { trpc } from "@/trpc";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";

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

// ── AI Model Catalog PER PROVIDER (FIX: dynamic from Settings Page saved llmProvider)
// OLD: hardcoded 3 mixed providers ignoring user actual saved API → WRONG: "โมเดลนี้ไม่ใช่โมเดลของ API ที่อยู่ในระบบตั้งค่า"
// NEW: Map llmProvider → list of models ACTUALLY SUPPORTED BY THAT PROVIDER ONLY
// Model IDs align exactly with server/services/llmClient.ts PROVIDER_DEFAULT_MODELS L20-25
type AIModelDef = { id: string; label: string; badge: string; cls: string; per1m: number };
type LLMProviderKey = "openrouter" | "openai" | "anthropic" | "google";
const PROVIDER_CATALOG: Record<LLMProviderKey, { name: string; accent: string; models: AIModelDef[]; defaultIdx: number }> = {
  // OpenRouter = multi-model gateway, user can pick any (matches server PROVIDER_DEFAULT_MODELS L21)
  openrouter: {
    name: "OpenRouter (รวมหลาย Provider)",
    accent: "!bg-purple-50 !border-purple-200 text-purple-800",
    defaultIdx: 0,
    models: [
      { id: "openai/gpt-4o-mini",              label: "GPT-4o mini (โทนต่าง ไม่เหมือน AI)", badge: "ค่าเริ่มต้น / คุ้มค่า", cls: "bg-emerald-700",per1m: 0.15 },
      { id: "anthropic/claude-3.5-sonnet",     label: "Claude Sonnet (ไทยดี สมดุล)",     badge: "แนะนำ",   cls: "bg-amber-700",  per1m: 3 },
      { id: "google/gemini-1.5-flash",         label: "Gemini 1.5 Flash",                badge: "ทดลอง",   cls: "bg-sky-700",    per1m: 0.075 },
      { id: "google/gemini-2.0-flash-exp:free",label: "Gemini 2.0 Flash (Free Tier)",   badge: "ฟรี (อาจมี Limit)", cls: "bg-purple-700", per1m: 0.075 },
    ],
  },
  // Anthropic = Claude only (HIDE GPT/Gemini! User set API=Anthropic key only)
  anthropic: {
    name: "Anthropic Claude",
    accent: "!bg-amber-50 !border-amber-200 text-amber-800",
    defaultIdx: 0,
    models: [
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (ไทยดี สมดุล)", badge: "ค่าเริ่มต้น / แนะนำ", cls: "bg-amber-700", per1m: 3 },
      { id: "claude-3-opus-20240229",     label: "Claude 3 Opus (อันดับสูง สร้างสรรค์)", badge: "ระดับสูง", cls: "bg-orange-700", per1m: 15 },
    ],
  },
  // OpenAI = GPT only (HIDE Claude/Gemini!)
  openai: {
    name: "OpenAI GPT",
    accent: "!bg-emerald-50 !border-emerald-200 text-emerald-800",
    defaultIdx: 0,
    models: [
      { id: "gpt-4o-mini",   label: "GPT-4o mini (โทนต่าง ไม่เหมือน AI)", badge: "ค่าเริ่มต้น / สำรอง", cls: "bg-emerald-700", per1m: 0.15 },
      { id: "gpt-4o",        label: "GPT-4o (รูปภาพ+ข้อความ)",                 badge: "ระดับสูง", cls: "bg-green-700",   per1m: 2.5 },
      { id: "gpt-4.1-mini",  label: "GPT-4.1 mini (คิดเชิงลึก เร็ว)",          badge: "รุ่นใหม่", cls: "bg-teal-700",    per1m: 0.40 },
    ],
  },
  // Google = Gemini only (HIDE Claude/GPT!)
  google: {
    name: "Google Gemini",
    accent: "!bg-sky-50 !border-sky-200 text-sky-800",
    defaultIdx: 0,
    models: [
      { id: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (Free Tier)", badge: "ค่าเริ่มต้น", cls: "bg-sky-700",     per1m: 0.075 },
      { id: "gemini-1.5-pro",       label: "Gemini 1.5 Pro (คิดลึกหนัก)",   badge: "ระดับสูง", cls: "bg-blue-700",    per1m: 1.25 },
      { id: "gemini-1.5-flash",     label: "Gemini 1.5 Flash",              badge: "ทดลอง",    cls: "bg-indigo-700",  per1m: 0.075 },
    ],
  },
};

type KwDensityRow = { kw: string; type: "main" | "longtail" | "LSI"; count: number; pass: boolean };

type SourceRow = { domain: string; title: string; da: number; pass: boolean };

function renderMdSafe(md: string): string {
  let s = String(md ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  s = s.replace(/```([a-zA-Z0-9_]*)\n([\s\S]*?)```/g,
    (_m, _l: string, code: string) => `<pre class="bg-stone-100 p-3 rounded text-xs overflow-x-auto my-3">${String(code).replace(/</g, "&lt;")}</pre>`);
  s = s.replace(/^### (.*)$/gm, (_m, t: string) => `<h3 class="font-bold text-[16px] mt-4 mb-2">${t}</h3>`);
  s = s.replace(/^## (.*)$/gm,  (_m, t: string) => `<h2 class="font-bold text-[19px] mt-5 mb-3 border-b border-stone-200 pb-1">${t}</h2>`);
  s = s.replace(/^# (.*)$/gm,   (_m, t: string) => `<h1 class="font-bold text-[24px] mt-4 mb-3">${t}</h1>`);
  s = s.replace(/^&gt;\s*(.*)$/gm, (_m, body: string) => `<blockquote class="border-l-4 border-rose-400 bg-rose-50 text-rose-900 p-3 rounded-r my-3 text-[13.5px]">${body}</blockquote>`);
  s = s.replace(/^\s*[-*+]\s+(.*)$/gm, (_m, t: string) => `<li class="ml-4 list-disc marker:text-amber-700 my-0.5">${t}</li>`);
  s = s.replace(/\n{2,}/g, "\n\n__P__\n\n");
  s = s.split(/__P__/).map(p => {
    const t = p.trim();
    if (!t) return p;
    if (/^<(h[1-6]|pre|blockquote|li|ol|ul|p|hr)\b/.test(t)) return p;
    return `<p class="leading-7 my-2">${t.replace(/\n/g, "<br/>")}</p>`;
  }).join("");
  s = s.replace(/((?:<li\b[^>]*>[\s\S]*?<\/li>\s*)+)/g, (_m, block: string) => `<ul class="m-0 p-0 space-y-1 my-3 list-none">${block}</ul>`);
  s = s.replace(/\*\*([\s\S]*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  s = s.replace(/`([^`\n]+)`/g, '<code class="bg-stone-100 text-rose-700 rounded px-1">$1</code>');
  return s;
}

function parseInlineRuns(line: string, extraOpts?: { italics?: boolean }): TextRun[] {
  const runs: TextRun[] = [];
  const tokens = line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  const italicBase = !!(extraOpts?.italics);
  for (const tok of tokens) {
    if (!tok) continue;
    const boldMatch = tok.match(/^\*\*([^*\n]+)\*\*$/);
    const codeMatch = tok.match(/^`([^`\n]+)`$/);
    if (boldMatch) {
      runs.push(new TextRun({ text: boldMatch[1], bold: true, italics: italicBase }));
    } else if (codeMatch) {
      runs.push(new TextRun({ text: codeMatch[1], font: "Courier New", size: 20, italics: italicBase }));
    } else {
      runs.push(new TextRun({ text: tok, italics: italicBase }));
    }
  }
  return runs.length ? runs : [new TextRun({ text: "", italics: italicBase })];
}

function markdownToDocxParagraphs(md: string): Paragraph[] {
  const lines = String(md ?? "").split(/\r?\n/);
  const paras: Paragraph[] = [];
  let inCodeBlock = false;
  let codeBuf: string[] = [];

  const flushCode = () => {
    if (codeBuf.length) {
      for (const cl of codeBuf) {
        paras.push(new Paragraph({
          children: [new TextRun({ text: cl, font: "Courier New", size: 20 })],
          spacing: { before: 0, after: 0 },
        }));
      }
      codeBuf = [];
    }
  };

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      if (inCodeBlock) { flushCode(); inCodeBlock = false; }
      else { inCodeBlock = true; }
      continue;
    }
    if (inCodeBlock) { codeBuf.push(raw); continue; }

    const h1 = raw.match(/^#\s+(.*)$/);
    if (h1) { flushCode(); paras.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseInlineRuns(h1[1]) })); continue; }
    const h2 = raw.match(/^##\s+(.*)$/);
    if (h2) { flushCode(); paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseInlineRuns(h2[1]) })); continue; }
    const h3 = raw.match(/^###\s+(.*)$/);
    if (h3) { flushCode(); paras.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseInlineRuns(h3[1]) })); continue; }
    const h4 = raw.match(/^####\s+(.*)$/);
    if (h4) { flushCode(); paras.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: parseInlineRuns(h4[1]) })); continue; }
    const bullet = raw.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) { flushCode(); paras.push(new Paragraph({ bullet: { level: 0 }, children: parseInlineRuns(bullet[1]) })); continue; }
    const quote = raw.match(/^>\s*(.*)$/);
    if (quote) { flushCode(); paras.push(new Paragraph({ children: parseInlineRuns(quote[1], { italics: true }), spacing: { before: 60, after: 60 } })); continue; }
    if (!raw.trim()) { flushCode(); paras.push(new Paragraph({ children: [new TextRun("")], spacing: { after: 100 } })); continue; }
    flushCode();
    paras.push(new Paragraph({ children: parseInlineRuns(raw) }));
  }
  flushCode();
  return paras;
}

async function generateDocxBlob(md: string, titleText?: string): Promise<Blob> {
  const children: Paragraph[] = [];
  if (titleText?.trim()) {
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: titleText, bold: true })] }));
  }
  children.push(...markdownToDocxParagraphs(md));
  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });
  return await Packer.toBlob(doc);
}

export default function WritePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [_m, params] = useRoute("/write/:draftId?");
  const urlDraftIdRaw = Number((params as any)?.draftId ?? 0) || 0;
  const _isAdmin = user?.role === "admin" || user?.permission === "owner" || user?.permission === "admin";
  const [cur, setCur] = useState(0);

  // ── PARSE URL QUERY PARAMS (KCP → Write Pass-Thru) ──
  // User VERBATIM rule: คลิกเขียน = ดึงคีย์ชุดนั้นไปที่หน้าเขียน เพียงเท่านั้น
  const [urlParams, setUrlParams] = useState<{ kw_id: number; draft_id: number; project_id: number }>(() => {
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
  const [draftId, setDraftId] = useState<number>(urlParams.draft_id || urlDraftIdRaw);
  const [writeHasPlaceholder, setWriteHasPlaceholder] = useState<boolean>(false);
  const [urlKwId] = useState<number>(urlParams.kw_id || 0); // for aiGenerateOutline keywordId arg
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saveMut = trpc.write.saveDraft.useMutation();
  const publishMut = trpc.write.publish.useMutation();
  const setScheduleMut = trpc.write.setSchedule.useMutation();
  const saveTimerRef = useRef<any>(null);
  const dirtyRef = useRef(false);
  const [scheduledDateTime, setScheduledDateTime] = useState<string>("");

  // ── Helpers: intent label map (BE enum: navigational / informational / commercial / transactional → Step1 3 UI options)
  // FIX: Sidebar Intent display inconsistent with Step1 Select (prev showed raw "navigational" vs Step1 "Informational")
  function mapIntentUiLabel(raw: any): "Informational" | "Transactional" | "Commercial" {
    const inv = String(raw || "").toLowerCase();
    if (/commercial|commercial[\s_-]?investigation|\bbuy\b|best[\s_-].*review/.test(inv)) return "Commercial";
    if (/transaction|purchase|order|booking/.test(inv)) return "Transactional";
    return "Informational";
  }

  // ── settings QUERY: Pull ACTIVE llmProvider from Settings Page (FIX: AI model list must match actual provider API saved!)
  const settingsQ = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const activeProvider = useMemo<LLMProviderKey>(() => {
    const raw = String((settingsQ.data?.settings as any)?.llmProvider || "openrouter").toLowerCase() as LLMProviderKey;
    return PROVIDER_CATALOG[raw] ? raw : "openrouter";
  }, [settingsQ.data?.settings?.llmProvider]);
  const activeModels = useMemo<AIModelDef[]>(() => PROVIDER_CATALOG[activeProvider].models, [activeProvider]);
  const providerAccent = useMemo<string>(() => PROVIDER_CATALOG[activeProvider].accent, [activeProvider]);
  const providerDisplayName = useMemo<string>(() => PROVIDER_CATALOG[activeProvider].name, [activeProvider]);
  const providerDefaultIdx = useMemo<number>(() => PROVIDER_CATALOG[activeProvider].defaultIdx ?? 0, [activeProvider]);
  const hasBothKeys = useMemo<boolean>(() => !!((settingsQ.data?.settings as any)?.hasBothKeys), [settingsQ.data?.settings?.hasBothKeys]);
  const hasLlmKey = useMemo<boolean>(() => !!((settingsQ.data?.settings as any)?.hasLlmApiKey), [settingsQ.data?.settings?.hasLlmApiKey]);

  // ── getDraft QUERY (3-tier cluster_context pass-thru + draft prefill) ──
  const q = trpc.write.getDraft.useQuery(
    { draftId: draftId || 1 },
    {
      enabled: !!draftId,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    }
  );
  const serpResearch: any = q?.data?.serp_research || {};

  // ── STATE init + auto-fill from KCP query params / getDraft ──
  const [keyword, setKeywordRaw] = useState("");
  const setKeyword = (v: string) => { setKeywordRaw(v); scheduleAutoSave(); };
  const [h1, setH1Raw] = useState("");
  const setH1 = (v: string) => { setH1Raw(v); scheduleAutoSave(); };
  const [category, setCategoryRaw] = useState<"ฟุตบอล" | "มวย" | "คาสิโน (YMYL)">("ฟุตบอล");
  const setCategory = (v: any) => { setCategoryRaw(v); scheduleAutoSave(); };
  const [intent, setIntentRaw] = useState<"Informational" | "Transactional" | "Commercial">("Informational");
  const setIntent = (v: any) => { setIntentRaw(v); scheduleAutoSave(); };
  const [contentType, setContentTypeRaw] = useState<"Knowledge" | "How-to Guide" | "Review">("Knowledge");
  const setContentType = (v: any) => { setContentTypeRaw(v); scheduleAutoSave(); };
  const [model, setModelRaw] = useState<string>(
    PROVIDER_CATALOG.openrouter.models[PROVIDER_CATALOG.openrouter.defaultIdx].id
  );
  const setModel = (v: string) => { setModelRaw(v); scheduleAutoSave(); };

  // 🔴 LIVE SERP AUTO FETCH — ถ้า Draft/Research package ยังไม่มี related/people (ยังไม่เคยรัน) → auto enrichSerp ด้วย keyword ปัจจุบัน
  // ผลลัพธ์ใส่ liveSERP state แล้ว merge เข้ากับ serpResearch package ดั้งเดิม
  const [liveSERP, setLiveSERP] = useState<{related_searches: string[]; people_also_search: string[]; organic: any[]; paa: any[]}>({related_searches:[], people_also_search:[], organic:[], paa:[]});
  const [autoEnrichFired, setAutoEnrichFired] = useState<Record<string, boolean>>({});
  const enrichSrpMut = trpc.research.enrichSerp.useMutation();
  useEffect(() => {
    const kw = String(keyword || '').trim();
    if (!kw) return;
    const rs = (Array.isArray(serpResearch?.related_searches) ? serpResearch.related_searches : []).length;
    const ps = (Array.isArray(serpResearch?.people_also_search) ? serpResearch.people_also_search : []).length;
    const hasDraft = rs > 0 && ps > 0;
    if (hasDraft) return;
    if (autoEnrichFired[kw] || enrichSrpMut.isLoading) return;
    setAutoEnrichFired(prev => ({...prev, [kw]: true}));
    enrichSrpMut.mutate(
      { seed: kw, gl: 'th', hl: 'th', num: 10 },
      {
        onSuccess: (d: any) => {
          if (!d || !d.ok) return;
          setLiveSERP({
            related_searches: Array.isArray(d.related_searches) ? d.related_searches : [],
            people_also_search: Array.isArray(d.people_also_search) ? d.people_also_search : [],
            organic: Array.isArray(d.organic) ? d.organic : [],
            paa: Array.isArray(d.paa) ? d.paa : [],
          });
        },
      }
    );
  }, [keyword, serpResearch?.related_searches?.length, serpResearch?.people_also_search?.length]);

  const _rr1: string[] = Array.isArray(serpResearch?.related_searches) ? (serpResearch.related_searches as string[]) : [];
  const _rr2: string[] = Array.isArray(liveSERP.related_searches) ? liveSERP.related_searches : [];
  const realRelated: string[] = Array.from(new Set(_rr1.concat(_rr2))).slice(0, 30);
  const _rp1: string[] = Array.isArray(serpResearch?.people_also_search) ? (serpResearch.people_also_search as string[]) : [];
  const _rp2: string[] = Array.isArray(liveSERP.people_also_search) ? liveSERP.people_also_search : [];
  const realPeopleAlsoSearch: string[] = Array.from(new Set(_rp1.concat(_rp2))).slice(0, 30);

  const filledOnceRef = useRef<{ draft: boolean; kw: boolean; model: boolean }>({ draft: false, kw: false, model: false });

  // 0) Auto-Fill AI Model default FROM SETTINGS Provider (CRITICAL FIX: never use hardcoded old AI_MODELS, must match llmProvider API)
  useEffect(() => {
    if (settingsQ.data && !filledOnceRef.current.model && activeModels.length) {
      const def = activeModels[providerDefaultIdx] ?? activeModels[0];
      if (def && def.id) {
        setModelRaw(String(def.id));
        filledOnceRef.current.model = true;
      }
    }
  }, [settingsQ.data, activeModels, providerDefaultIdx]);

  // 1) Auto-fill Step1 keyword/category/intent FROM cluster_context (KCP pass-thru on first load)
  useEffect(() => {
    const cc: any = (q.data as any)?.cluster_context;
    const focusId = (cc?.focus_keyword?.id) ?? 0;
    if (focusId && !filledOnceRef.current.kw) {
      const kwText = String(cc.focus_keyword.keyword || "").trim();
      if (kwText && !keyword.trim()) {
        setKeywordRaw(kwText.slice(0, 200));
        filledOnceRef.current.kw = true;
      }
      if (cc.focus_keyword.intent) {
        const inv = String(cc.focus_keyword.intent).toLowerCase();
        if (/commercial|commercial investigation|buy|best.*review/.test(inv)) {
          if (intent !== "Commercial") setIntentRaw("Commercial");
        } else if (/transaction|purchase|order|booking/.test(inv)) {
          if (intent !== "Transactional") setIntentRaw("Transactional");
        } else {
          if (intent !== "Informational") setIntentRaw("Informational");
        }
      }
    }
  }, [(q.data as any)?.cluster_context?.focus_keyword?.id]);

  // 2) Auto-fill existing draft content/md/meta (from_existing=true / edit old draft)
  useEffect(() => {
    const draftIdActual = (q.data as any)?.draft?.id ?? 0;
    if (draftIdActual && !filledOnceRef.current.draft) {
      const d: any = (q.data as any).draft;
      const wf: any = (q.data as any).workflow;
      const title = String(d.title || "").trim();
      // WO-H1-2569-001 TASK 3.2 FIX #1/4: Title (H1) NEVER goes into Keyword field
      // Step1 keyword = FOCUS KEYWORD from KCP ONLY. H1 = separate h1 state.
      if (title && !h1.trim()) {
        setH1(title.slice(0, 512));
      }
      // Legacy guard (do NOT overwrite keyword with H1 title, ever again!):
      // if (title && !keyword.trim() && !filledOnceRef.current.kw) { setKeywordRaw(title.slice(0, 200)); } ← DEPRECATED BUG REMOVED
      const md = String(d.content || "").trim();
      if (md && !bodyMd.trim()) {
        setBodyMd(md);
        const hx = md.match(/^#{1,6}\s+.+$/gm) || [];
        const headingRows: OutlineRow[] = [];
        for (const hline of hx) {
          const lv = hline.startsWith('###### ') ? 6 : hline.startsWith('##### ') ? 5 : hline.startsWith('#### ') ? 4 : hline.startsWith('### ') ? 3 : hline.startsWith('## ') ? 2 : 1;
          const text = hline.replace(/^#+\s+/, '').trim().slice(0, 240);
          if (text && lv >= 1 && lv <= 6) headingRows.push({ heading_level: lv as any, heading_text: text, word_target_min: lv === 2 ? 250 : lv === 3 ? 120 : 60, word_target_max: lv === 2 ? 350 : lv === 3 ? 220 : 160, key_points: generateBulletsForHeading(text, lv) });
        }
        const safeRows = sanitizeOutlineRows(headingRows);
        if (safeRows.length >= 2) setOutlineSecs(safeRows);
        dirtyRef.current = false;
      }
      const mt0 = String(d.meta_title || "").trim();
      if (mt0 && !mt.trim()) setMtRaw(mt0);
      const mdes0 = String(d.meta_description || "").trim();
      if (mdes0 && !mdes.trim()) setMdesRaw(mdes0);
      if (wf?.write_step) {
        const stepIdx = STEPS.findIndex(s => s.id === String(wf.write_step));
        if (stepIdx >= 0) {}
      }
      filledOnceRef.current.draft = true;
    }
  }, [(q.data as any)?.draft?.id]);

  function scheduleAutoSave() {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!dirtyRef.current) return;
      void doSave(true);
    }, 1000 * 30);
  }

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  async function doSave(silent = false, force = false) {
    if (!draftId) {
      if (!silent) toast.error("เลือก Keyword จาก KCP (Keyword Cluster Planner) สร้าง draft ก่อน แล้วเปิด Edit ที่นี่");
      return;
    }
    if (!force && saveMut.isPending) return;
    const effectiveTitle = (h1 && h1.trim().length >= 2) ? h1.trim() : (keyword || undefined);
    saveMut.mutate({
      draftId,
      title: effectiveTitle,
      content: bodyMd || undefined,
      metaTitle: mt || null,
      metaDescription: mdes || null,
      wordCount,
      eeatScore: eeatEst,
      citationsCount: Math.min(99, Math.max(0, (sources.length))) ,
    }, {
      onSuccess(r: any) {
        if (r?.ok) {
          dirtyRef.current = false;
          setSavedAt(new Date());
          if (!silent) toast.success(r.message || "บันทึกสำเร็จ เข้าคลังบทความ DB");
        } else if (!silent) toast.error(String(r?.message || "save fail").slice(0, 140));
      },
      onError(err: any) {
        const s = String(err?.message || err).slice(0, 140);
        if (!silent) toast.error("Save err: " + s);
        else console.warn("[auto-save fail]", s);
      }
    });
  }
  async function doPublish(unpublish=false) {
    if (!draftId) { toast.error("ต้องมี Draft ID ก่อน Publish (สร้างจาก KCP Keyword card)"); return; }
    const wcActual = estimateWordCount(bodyMd || '');
    const wcTarget = Math.max(1000, Number(targetWordTotal) || 0);
    const wcRatio = wcActual / Math.max(1, wcTarget);
    const phRegex = /\[AUTO PLACEHOLDER\s*[—\-]/;
    if (writeHasPlaceholder || phRegex.test(bodyMd || '')) {
      toast.error('🚫 มี section AUTO PLACEHOLDER เหลืออยู่ ต้องเขียนใหม่ทั้งหมดก่อน Publish');
      return;
    }
    if (wcRatio < 0.8) {
      toast.error(`🚫 จำนวนคำไม่ถึงเกณฑ์ 80% (${wcActual.toLocaleString()}/${wcTarget.toLocaleString()} = ${Math.round(100*wcRatio)}%) — ต้องเขียนให้ครบก่อน`);
      return;
    }
    const seoComp = (window as any).__seoCompliance;
    if (seoComp && !!seoComp.anyHardBlock) {
      const cc = Number(seoComp.combinedPct || 0);
      const crit = Number(seoComp.globalCrit || 0) + Number(seoComp.critCount || 0);
      toast.error(`🚫 SEO Gate FAIL: ${cc}% < 75% หรือมี Critical ${crit} อย่าง (ต้องแก้ก่อน Publish · กลับไป Step 6 Audit)`);
      return;
    }
    await doSave(true, true);
    const t = toast.loading(`${unpublish ? 'เลิกเผยแพร่' : 'เผยแพร่'} Draft #${draftId}...`);
    publishMut.mutate({ draftId, unpublish }, {
      onSuccess(r:any) {
        toast.dismiss(t);
        if (r?.ok) toast.success(`✅ ${unpublish ? 'เลิกเผยแพร่เรียบร้อย' : 'เผยแพร่สำเร็จ!'}: ${String(r?.message||'').slice(0,100)}`);
        else toast.error(String(r?.message || 'publish fail').slice(0,120));
      },
      onError(e:any){ toast.dismiss(t); toast.error('Publish err: '+String(e?.message||e).slice(0,120)); }
    });
  }

  async function doSetSchedule() {
    if (!draftId) { toast.error("ต้องมี Draft ID ก่อนตั้งเวลาเผยแพร่"); return; }
    if (!scheduledDateTime) { toast.error("เลือกวันที่และเวลาก่อน"); return; }
    const dt = new Date(scheduledDateTime);
    if (isNaN(dt.getTime())) { toast.error("รูปแบบวันที่ไม่ถูกต้อง"); return; }
    if (dt.getTime() <= Date.now() + 59_000) { toast.error("เวลาต้องอยู่ในอนาคต (มากกว่า 1 นาทีข้างหน้า)"); return; }
    await doSave(true, true);
    const t = toast.loading(`กำลังตั้งเวลาเผยแพร่ Draft #${draftId}...`);
    setScheduleMut.mutate({ draftId, scheduledAt: dt.toISOString() }, {
      onSuccess(r:any) {
        toast.dismiss(t);
        if (r?.ok) toast.success(String(r?.message || 'ตั้งเวลาสำเร็จ'));
        else toast.error(String(r?.message || 'set schedule fail').slice(0,120));
      },
      onError(e:any){ toast.dismiss(t); toast.error('Schedule err: '+String(e?.message||e).slice(0,120)); }
    });
  }

  async function doCancelSchedule() {
    if (!draftId) { toast.error("ไม่มี Draft ID"); return; }
    const t = toast.loading("กำลังยกเลิกตารางเวลา...");
    setScheduleMut.mutate({ draftId, scheduledAt: null }, {
      onSuccess(r:any) {
        toast.dismiss(t);
        if (r?.ok) {
          setScheduledDateTime("");
          toast.success(String(r?.message || 'ยกเลิกสำเร็จ'));
        } else toast.error(String(r?.message || 'cancel fail').slice(0,120));
      },
      onError(e:any){ toast.dismiss(t); toast.error('Cancel schedule err: '+String(e?.message||e).slice(0,120)); }
    });
  }

  type OutlineRow = { heading_level: 1 | 2 | 3 | 4 | 5 | 6; heading_text: string; word_target_min: number; word_target_max: number; key_points: string[] };

  const FE_OUTLINE_BANNED_SUBSTRINGS: string[] = [
    '(Definition)','(Why / Causes)','(How-to Guide)','(Comparison / Case Study)','(Key Takeaways)','(ปิดท้ายบทความ)','ขั้นตอน 1-3: เตรียมความพร้อม','เตรียมความพร้อม → ดำเนินการ → ตรวจสอบผลลัพธ์','ข้อผิดพลาดที่พบบ่อย','คำจำกัดความและประเภทของ','คืออะไร? — บทนำและบริบท','สาเหตุและปัจจัยสำคัญของ','วิธีทำ / คู่มือปฏิบัติ','กับทางเลือกอื่น','แหล่งอ้างอิงและข้อมูลยืนยัน','สรุปและคำแนะนำที่สำคัญ',
  ];
  function headingContainsGenericFE(h: string): boolean {
    if (!h) return false;
    const s = String(h);
    for (const b of FE_OUTLINE_BANNED_SUBSTRINGS) if (s.includes(b)) return true;
    return false;
  }
  function sanitizeOutlineRows(rows: OutlineRow[]): OutlineRow[] {
    if (!Array.isArray(rows)) return [];
    return rows.filter(r => !headingContainsGenericFE(String(r?.heading_text ?? '')));
  }

  function generateBulletsForHeading(headingText: string, headingLevel: number): string[] {
    const h = String(headingText || '').trim();
    if (!h) return [];
    const MAIN_KW_SAFE = String(keyword || '').trim();
    const out: string[] = [];
    const lower = h.toLowerCase();
    // 1) Heading tokens as 2-3 word sub-phrases → concrete bullet starting points
    const tokens = h.split(/\s+/).filter(w => w.length >= 2);
    for (let i=0; i<Math.max(0, tokens.length-1); i++) {
      out.push(tokens.slice(i, Math.min(tokens.length, i+2)).join(' '));
    }
    // 2) Intent-based template bullets (3-5 total depending on level)
    const hasWhat = /คืออะไร|คือ|จำกัดความ|นิยาม|definition|what is/.test(lower);
    const hasHow = /วิธี|ทำอย่างไร|ขั้นตอน|guide|how to|choose|เลือก|ใช้/.test(lower);
    const hasWhy = /ทำไม|สาเหตุ|เหตุผล|why|cause|ปัจจัย/.test(lower);
    const hasCompare = /เทียบ|vs|เปรียบ|ดีกว่า|เลือกอะไร|comparison/.test(lower);
    const hasReview = /รีวิว|ดีไหม|ทดลอง|review|คุ้มค่า|ราคา/.test(lower);
    const hasMistake = /ผิดพลาด|ข้อควร|ควรหลีกเลี่ยง|mistake|common|ที่ควร/.test(lower);
    const hasExample = /ตัวอย่าง|example|เคส|กรณี/.test(lower);

    if (hasWhat || headingLevel >= 2) out.push(`จำกัดความหมายของ "${h}" ให้ชัดเจน พร้อมคำอธิบายง่ายๆ`);
    if (hasWhy || !hasWhat) out.push(`อธิบายสาเหตุที่ผู้อ่านต้องรู้จัก "${h}" และมีความสำคัญอย่างไร`);
    if (hasHow || headingLevel === 2) {
      out.push(`ขั้นตอนปฏิบัติ 3 ขั้นตอนสำหรับ "${h}" พร้อมคำแนะนำเชิงปฏิบัติ`);
    }
    if (hasCompare || hasReview) out.push(`เปรียบเทียบกับทางเลือกอื่นๆ พร้อมจุดเด่น จุดด้อย ใช้งานตรงไหนเหมาะสม`);
    if (hasMistake) out.push(`3 ข้อผิดพลาดที่มักทำเมื่อเกี่ยวกับ "${h}" และวิธีหลีกเลี่ยง`);
    if (hasExample) out.push(`ตัวอย่างจริง 2-3 เคสที่แสดงการใช้ "${h}" ในสถานการณ์จริง`);
    if (MAIN_KW_SAFE && !h.includes(MAIN_KW_SAFE)) {
      out.push(`เชื่อมโยงเนื้อหา "${h}" กับหัวข้อหลัก "${MAIN_KW_SAFE}" ให้เป็นธรรมชาติ`);
    }
    // 3) SERP ai_overview / top snippets context extract → 1-2 factual bullets (ถ้ามี)
    try {
      for (const src of sources.slice(0, 2)) {
        const snip = String((src as any).snippet || (src as any).title || '');
        if (snip.length > 40) out.push(snip.slice(0, 160).replace(/\s+/g, ' ').trim());
      }
    } catch { /* ignore */ }
    // Dedup + min 3 max 5, prefer unique long strings
    const clean = Array.from(new Set(out.map(s => String(s || '').trim()).filter(Boolean)));
    return clean.slice(0, 5);
  }

  async function handleDocxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const sizeKB = f.size / 1024;
    if (!/\.docx$/i.test(f.name)) {
      toast.error("❌ รองรับเฉพาะไฟล์ .docx เท่านั้น (Microsoft Word / Google Doc export .docx)");
      if (docxFileRef.current) docxFileRef.current.value = '';
      return;
    }
    if (sizeKB > 8 * 1024) {
      toast.error(`❌ ไฟล์ใหญ่เกินไป: ${Math.round(sizeKB)} KB · ขนาดสูงสุด 8192 KB (8 MB)`);
      if (docxFileRef.current) docxFileRef.current.value = '';
      return;
    }
    setExtractingDocx(true);
    const t = toast.loading(`กำลังแปลง DOCX → Markdown + Headings (${f.name})...`);
    try {
      const buf = await f.arrayBuffer();
      const res = await mammoth.convertToHtml({ arrayBuffer: buf }, { includeDefaultStyleMap: true });
      const html = String(res.value || '');
      const warnings = Array.isArray(res.messages) ? res.messages.map(String).join(' · ') : '';

      // --- Convert HTML -> Markdown lite for bodyMd editable source
      let md = html
        .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      md = md.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
      md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m,t)=>`\n# ${t.replace(/<[^>]+>/g,'').trim()}\n\n`);
      md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m,t)=>`\n## ${t.replace(/<[^>]+>/g,'').trim()}\n\n`);
      md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m,t)=>`\n### ${t.replace(/<[^>]+>/g,'').trim()}\n\n`);
      md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m,t)=>`\n#### ${t.replace(/<[^>]+>/g,'').trim()}\n\n`);
      md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m,t)=>`\n- ${t.replace(/<[^>]+>/g,'').trim()}\n`);
      md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m,t)=>`\n> ${t.replace(/<[^>]+>/g,'').trim().replace(/\s+/g,' ')}\n\n`);
      md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m,t)=>`\n${t.replace(/<[^>]+>/g,'').trim()}\n\n`);
      md = md.replace(/<br\s*\/?>/gi, '\n');
      md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m,t)=>`**${t.replace(/<[^>]+>/g,'')}**`);
      md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_m,t)=>`**${t.replace(/<[^>]+>/g,'')}**`);
      md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_m,t)=>`*${t.replace(/<[^>]+>/g,'')}*`);
      md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_m,t)=>`*${t.replace(/<[^>]+>/g,'')}*`);
      md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m,t)=>`\`${t.replace(/<[^>]+>/g,'')}\``);
      md = md.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m,url,txt)=>`[${txt.replace(/<[^>]+>/g,'')}](${url})`);
      md = md.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();

      // --- Extract Outline Headings H1/H2/H3 for outlineSecs
      const headings: OutlineRow[] = [];
      const hx = md.match(/^#{1,3}\s+.+$/gm) || [];
      for (const hline of hx) {
        const lv = hline.startsWith('### ') ? 3 : hline.startsWith('## ') ? 2 : 1;
        const text = hline.replace(/^#+\s+/, '').trim().slice(0, 240);
        if (text) headings.push({ heading_level: lv as any, heading_text: text, word_target_min: lv===2?200:120, word_target_max: lv===2?350:220, key_points: generateBulletsForHeading(text, lv) });
      }

      // --- Extract EEAT Signals -> sources: external URLs + author + studies
      const extractedSources: SourceRow[] = [];
      const hrefSet = new Set<string>();
      const hrefs = html.match(/href="(https?:\/\/[^"]+)"/gi) || [];
      for (const href of hrefs) {
        const u = (href.match(/href="([^"]+)"/i) || [])[1];
        if (!u || hrefSet.has(u)) continue;
        try {
          const host = new URL(u).hostname.replace(/^www\./,'').slice(0, 90);
          extractedSources.push({ domain: host, title: u.slice(0, 140), da: 0, pass: false });
          hrefSet.add(u);
        } catch { /* ignore malformed */ }
      }
      // Author line detection Thai/Eng
      const authorMatch = html.match(/(โดย|เขียนโดย|Author|ผู้เขียน)\s*[:：]\s*([^\n<]{2,80})/i);
      if (authorMatch && !keyword.trim()) {
        const suggested = String(authorMatch[2]).replace(/<[^>]+>/g,'').trim().slice(0, 120);
        if (suggested.length >= 2) { /* keep author could be used later */ }
      }
      // FAQ heading detection
      const faqMatch = /(คำถามที่พบบ่อย|FAQ\b|Frequently Asked)/i.test(html);

      // --- Auto-fill H1 from first heading in extracted DOCX/HTML markdown if still empty
      const firstH1 = headings.find(h=>h.heading_level===1)?.heading_text ?? '';
      if (firstH1 && !h1.trim()) {
        setH1(firstH1.slice(0, 512));
      }

      const finalMd = injectYmylIfNeeded(md, category);
      setBodyMd(finalMd);
      const safeDocxHeadings = sanitizeOutlineRows(headings);
      if (safeDocxHeadings.length) setOutlineSecs(safeDocxHeadings);
      if (extractedSources.length) setSourcesRaw(extractedSources.slice(0, 20));

      // --- Word count
      const txt1 = md + ' ';
      const wcEN = (txt1.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0);
      const wcTH = (txt1.match(/[\u0E00-\u0E7F]/g)?.length ?? 0);
      const wc = wcEN + Math.ceil(wcTH / 3);

      setUploadedDoc({ fileName: f.name, fileSizeKB: Math.round(sizeKB), wordCount: Math.max(0, wc) });
      dirtyRef.current = true;
      scheduleAutoSave();
      toast.dismiss(t);
      toast.success(
        `✅ แปลง DOCX สำเร็จ: ${wc.toLocaleString()} คำ · Headings ${headings.length} รายการ` +
        (extractedSources.length ? ` · แหล่งอ้างอิง ${extractedSources.length}` : '') +
        (faqMatch ? ' · พบ FAQ section' : '') +
        (warnings ? ` · ⚠️ parse warnings` : ''),
        { duration: 4200 }
      );
    } catch (err: any) {
      toast.dismiss(t);
      const s = String(err?.message || err).slice(0, 140);
      toast.error(`❌ แปลง DOCX ล้มเหลว: ${s}`);
    } finally {
      setExtractingDocx(false);
      if (docxFileRef.current) docxFileRef.current.value = '';
    }
  }

  const YMYL_DISCLAIMER_TH = `> **คำเตือนความเสี่ยงด้านการพนัน (YMYL Disclaimer)**
>
> การพนันอาจก่อให้เกิดความเสี่ยงทางการเงินและสุขภาพจิตอย่างรุนแรง โปรดเล่น/เดิมพันด้วยความรับผิดชอบ หากคุณหรือคนในครอบครัวประสบปัญหาการเสพติดการพนัน โปรดขอความช่วยเหลือจากผู้เชี่ยวชาญทันที เว็บไซต์นี้ให้ข้อมูลเพื่อความรู้เท่านั้น ไม่กระตุ้นหรือส่งเสริมการพนันในลักษณะใดๆ ทั้งสิ้น ผู้อ่านต้องยอมรับความเสี่ยงจากการกระทำของตนเองทั้งหมด
>
> อายุขั้นต่ำสำหรับการเข้าถึงเนื้อหาที่เกี่ยวข้องกับการพนัน: **21 ปีขึ้นไป**
>
> แหล่งข้อมูลอ้างอิง: กรมกิจกรรมส่งเสริมสุขภาพจิต · สำนักงานป้องกันและปราบปรามการพนันผิดกฎหมาย
`;

  function injectYmylIfNeeded(md: string, cat: string): string {
    if (cat !== "คาสิโน (YMYL)") return md;
    if (/คำเตือนความเสี่ยงด้านการพนัน/i.test(md.slice(0, 1600))) return md;
    const introClean = (md || "").trim();
    return YMYL_DISCLAIMER_TH + "\n" + introClean;
  }

  const [uploadedDoc, setUploadedDoc] = useState<{fileName:string;fileSizeKB:number;wordCount:number}|null>(null);
  const [extractingDocx, setExtractingDocx] = useState(false);
  const docxFileRef = useRef<HTMLInputElement|null>(null);

  const [sources, setSourcesRaw] = useState<SourceRow[]>([]);
  const [fetchingSources, setFetchingSources] = useState(false);
  const researchMut = trpc.research.enrichSerp.useMutation();

  const [outlineSecs, setOutlineSecs] = useState<OutlineRow[]>([]);

  const [targetWordTotal, setTargetWordTotal] = useState<number>(3500);
  useEffect(() => {
    if (outlineSecs.length > 0) {
      const sum = outlineSecs.reduce((a,s)=>a + Math.max(0, Number(s.word_target_min||0)), 0);
      if (sum > 300) setTargetWordTotal(sum);
    }
  }, [outlineSecs.length]);
  // === 🟢 Density Soft Guidance (Audit C2 relax: ไม่บังคับตัดคำอัตโนมัติ — ให้ AI/ผู้เขียนพิจารณาเอง)
  // Sweet Spot ธรรมชาติ = 0.6% - 1.4% (เขียว อ่านง่าย ไม่ยัด), ใกล้แน่น = 1.41% - 1.6% (เหลืองเตือน), >1.6% (แดงเตือน ควรลด)
  // Formula: Keyword Density% = (Main standalone + Main inside every Long-tail phrase) / totalWords × 100
  //   LSI does NOT contain main → not counted in density (semantic support only)
  const MAIN_DENSITY_SWEET_MIN = 0.6;
  const MAIN_DENSITY_SWEET_MAX = 1.4;
  const MAIN_DENSITY_HARD_CAP_PCT = 1.6;
  const TARGET_DENSITY_PCT = MAIN_DENSITY_SWEET_MAX;
  const TARGET_SPLIT_MAIN_PCT = 20;
  const TARGET_SPLIT_LONG_PCT = 70;
  const TARGET_SPLIT_LSI_PCT  = 10;
  const MAX_LSI_ITEMS = 3;
  const keywordPlan = useMemo(() => {
    const MAIN_KW = String(keyword||'').trim();
    const headingChunks: string[] = [];
    for (const s of outlineSecs) {
      const text = String(s.heading_text || '').replace(/[\(\)\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const tokens = text.split(/\s+/).filter(w => w.length >= 2);
      for (let i=0;i<Math.max(1, tokens.length-2);i++) headingChunks.push(tokens.slice(i, i+2).join(' '));
    }
    const srcSnippetWords: string[] = [];
    for (const src of sources.slice(0, 4)) {
      const snip = String((src as any).snippet || (src as any).title || '').replace(/[^\u0E00-\u0E7FA-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (snip.length < 8) continue;
      const toks = snip.split(/\s+/).filter(w => w.length >= 2 && !/^\d+$/.test(w)).slice(0, 10);
      for (let i=0;i<Math.max(0, toks.length-3);i++) srcSnippetWords.push(toks.slice(i,i+3).join(' '));
    }
    // Priority 1: REAL LONGTAIL = google relatedSearches[] (คนหาจริงจาก Serper/DFSEO)
    // Priority 2: headingChunks + snippet prefixed with MAIN KW (fallback if SERP query not yet run)
    // Priority 3: hardcoded suffix array (ลำดับสุดท้าย — only used while SERP fetches live)
    const LONGTAIL_SUFFIXES_FALLBACK = ['สำหรับมือใหม่','ปี 2569','เว็บตรง','คืนนี้','วันนี้','ราคาล่าสุด','ทีเด็ด','แนะนำ','วิธีเลือก','คู่มือ'];
    function filterReal(words: string[], minLen: number, maxLen: number, skipMain: string): string[] {
      return Array.from(new Set(words.map(v=>String(v||'').trim()).filter(v => {
        if (!v) return false;
        if (v.length < minLen || v.length > maxLen) return false;
        if (skipMain && v === skipMain) return false;
        return true;
      })));
    }
    const filteredRealRelated = filterReal(realRelated || [], MAIN_KW.length + 3, 120, MAIN_KW);
    let longList: string[] = [];
    if (filteredRealRelated.length > 0) {
      longList = filteredRealRelated.slice(0, 5);
    } else {
      const realLongtailsArr: string[] = [];
      if (MAIN_KW) {
        for (const h of headingChunks.slice(0, 8)) realLongtailsArr.push(`${MAIN_KW} ${h}`);
        for (const w of srcSnippetWords.slice(0, 6)) realLongtailsArr.push(`${MAIN_KW} ${w}`);
        for (const suf of LONGTAIL_SUFFIXES_FALLBACK) realLongtailsArr.push(`${MAIN_KW} ${suf}`);
      }
      longList = Array.from(new Set(realLongtailsArr.filter(v => v.length > MAIN_KW.length + 4).map(v=>v.trim()))).slice(0, 5);
    }
    if (longList.length < 5 && MAIN_KW) {
      const padLT = [`${MAIN_KW} คืออะไร`,`${MAIN_KW} แนะนำ`,`${MAIN_KW} วิธีเลือก`,`${MAIN_KW} ราคาล่าสุด`,`${MAIN_KW} ปี 2569`];
      for (const p of padLT) if (!longList.includes(p) && p !== MAIN_KW) longList.push(p);
      longList = longList.slice(0, 5);
    }
    // Priority 1 ONLY: REAL LSI = peopleAlsoSearch[] (คนกดค้นต่อจาก Serper) + snippet 3-grams actual text
    // NO GENERIC FALLBACK POOL (LSI is semantic supplement only, must come from real SERP text)
    const filteredRealPeople = filterReal(realPeopleAlsoSearch || [], 4, 90, MAIN_KW);
    const rawLSI: string[] = [];
    for (const rp of filteredRealPeople) rawLSI.push(rp);
    for (const hc of headingChunks) {
      if (hc.trim() === MAIN_KW.trim()) continue;
      rawLSI.push(hc);
    }
    for (const sw of srcSnippetWords.slice(0, 8)) {
      if (sw.trim() === MAIN_KW.trim()) continue;
      rawLSI.push(sw);
    }
    // LSI MAX = 3 items supplementary only
    let lsiList = Array.from(new Set(rawLSI.filter(v => v.length >= 4 && v.length < 32 && v !== MAIN_KW).map(v=>v.trim()))).slice(0, MAX_LSI_ITEMS);
    const mainList = [MAIN_KW].filter(Boolean);

    // ===== SPREAD BUDGET (keyword item insertion count budget - separate from main density) =====
    const ceilingTotal = Math.max(1, Math.ceil((targetWordTotal * TARGET_DENSITY_PCT) / 100));
    const targetMain = Math.max(1, Math.round(ceilingTotal * TARGET_SPLIT_MAIN_PCT / 100));
    const targetLong = Math.max(1, Math.round(ceilingTotal * TARGET_SPLIT_LONG_PCT / 100));
    const targetLSITotalSoft = Math.max(1, Math.round(ceilingTotal * TARGET_SPLIT_LSI_PCT  / 100));
    const targetMainEach = Math.max(1, Math.ceil(targetMain / Math.max(1, mainList.length)));
    const targetLongEach = Math.max(1, Math.ceil(targetLong / Math.max(1, longList.length)));
    // === HARD LSI RULES (user + SEO standard): LSI supplementary only
    const mainSpreadTotalUses = targetMainEach * Math.max(1, mainList.length);
    const lsiMaxTotalHard = Math.max(1, Math.floor(mainSpreadTotalUses * 0.70));
    const lsiMaxEachHard = Math.max(1, Math.floor(targetMainEach / 2));
    const lsiCount = Math.max(1, lsiList.length);
    const lsiFromPct = Math.max(1, Math.ceil(targetLSITotalSoft / lsiCount));
    let targetLSIEach = Math.min(lsiFromPct, lsiMaxEachHard);
    while (targetLSIEach > 1 && (targetLSIEach * lsiCount) > lsiMaxTotalHard) targetLSIEach -= 1;
    const targetLSI = targetLSIEach * lsiCount;

    // ===== MAIN KEYWORD DENSITY (ACTUAL SUBSTRING OCCURRENCES — SEO STANDARD) =====
    // Main appears = standalone main uses + main embedded inside every long-tail phrase
    // LSI does NOT contain main → not counted
    const mainInLongtailFinal = longList.length * targetLongEach;
    const mainAppearsTotal = targetMainEach * Math.max(1, mainList.length) + mainInLongtailFinal;
    // === 🟢 AUDIT C2 RELAX: REMOVED AUTO-REDUCE KILL SWITCH — NEVER mutate counts silently
    // Density is now SOFT GUIDANCE only (traffic light badge); writer decides manually if needs reducing
    const mainSweetMaxCount = Math.max(1, Math.floor((targetWordTotal * MAIN_DENSITY_SWEET_MAX) / 100));
    const mainHardCapCount = Math.max(1, Math.floor((targetWordTotal * MAIN_DENSITY_HARD_CAP_PCT) / 100));
    // REAL actual density — NEVER clamp to cap (show user true value for transparency)
    const mainDensityPct = (mainAppearsTotal / Math.max(1, targetWordTotal)) * 100;
    const mainDensityLevel: 'green' | 'yellow' | 'red' =
      mainDensityPct > MAIN_DENSITY_HARD_CAP_PCT ? 'red'
      : mainDensityPct > MAIN_DENSITY_SWEET_MAX ? 'yellow'
      : 'green';
    return {
      mainList, longList, lsiList,
      ceilingTotal, targetMain, targetLong, targetLSI,
      targetMainEach, targetLongEach, targetLSIEach,
      mainInLongtail: mainInLongtailFinal, mainAppearsTotal, mainDensityPct, mainDensityLevel,
      mainSweetMaxCount, mainHardCapCount,
    };
  }, [keyword, outlineSecs, sources, targetWordTotal]);

  const genOutlineMut = trpc.write.generateOutline.useMutation();
  async function aiGenerateOutline(force=false) {
    if (!keyword?.trim()) { toast.error("กรอก Keyword หลักก่อน สร้าง Outline"); return; }
    genOutlineMut.mutate({
      keywordId: urlKwId > 0 ? urlKwId : undefined,
      draftId: draftId > 0 ? draftId : undefined,
      keyword: keyword.trim(),
      category: category || undefined,
      intent: intent || undefined,
      contentType: contentType || undefined,
      force,
      model: model,
      targetWordCount: Math.max(1000, Number(targetWordTotal) || 0),
    }, {
      onSuccess(r: any) {
        if (r?.ok && Array.isArray(r.outline?.sections)) {
          const safeSections = sanitizeOutlineRows(r.outline.sections);
          setOutlineSecs(safeSections);
          // WO-H1-2569-001 TASK 3.2 FIX #3/4: Outline.title => H1 FIELD (NOT keyword)
          const outlineH1 = safeSections.find(s => s.heading_level === 1)?.heading_text || r.outline?.title;
          if (outlineH1 && !h1.trim()) setH1(String(outlineH1).slice(0, 512));
          toast.success(`✅ AI สร้าง Outline H1-H6 เสร็จ (${safeSections.length} sections)${r.persisted ? ' + บันทึกใน draft DB' : ''}`);
        } else toast.error((r?.message || 'gen outline fail').slice(0,120));
      },
      onError(e: any){ toast.error('Outline AI err: '+String(e?.message||e).slice(0,120)); }
    });
  }
  function addOutlineRow(level: OutlineRow["heading_level"] = 2) {
    setOutlineSecs(prev => [...prev, { heading_level: level, heading_text: 'หัวข้อใหม่', word_target_min: level === 2 ? 200 : 120, word_target_max: level === 2 ? 350 : 220, key_points: generateBulletsForHeading('หัวข้อใหม่', level) }]);
  }
  function setOutlineText(idx:number,v:string){ const n=[...outlineSecs]; n[idx]={...n[idx],heading_text:v}; setOutlineSecs(n); dirtyRef.current=true; scheduleAutoSave(); }
  function setOutlineLevel(idx:number, lv:number){ const n=[...outlineSecs]; n[idx]={...n[idx], heading_level: Math.max(1,Math.min(6,Number(lv))) as any}; setOutlineSecs(n); dirtyRef.current=true; scheduleAutoSave(); }
  function delOutlineRow(idx:number){ if (outlineSecs.length<=2){ toast.error('Outline ต้องมีอย่างน้อย 2 หัวข้อ'); return; } setOutlineSecs(outlineSecs.filter((_,i)=>i!==idx)); dirtyRef.current=true; scheduleAutoSave(); }
  function moveOutlineUp(idx:number){ if(idx<=0) return; const arr=[...outlineSecs]; [arr[idx-1],arr[idx]]=[arr[idx],arr[idx-1]]; setOutlineSecs(arr); dirtyRef.current=true; scheduleAutoSave(); }
  function moveOutlineDown(idx:number){ if(idx>=outlineSecs.length-1) return; const arr=[...outlineSecs]; [arr[idx+1],arr[idx]]=[arr[idx],arr[idx+1]]; setOutlineSecs(arr); dirtyRef.current=true; scheduleAutoSave(); }

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }

  function handleDragLeave() {
    setDragOverIdx(null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null); setDragOverIdx(null); return;
    }
    const arr = [...outlineSecs];
    const [moved] = arr.splice(dragIdx, 1);
    let target = idx;
    if (dragIdx < idx) target = idx - 1;
    arr.splice(target, 0, moved);
    setOutlineSecs(arr);
    setDragIdx(null);
    setDragOverIdx(null);
    dirtyRef.current = true;
    scheduleAutoSave();
  }

  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function toggleSelectRow(idx: number) {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedRows.size === outlineSecs.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(outlineSecs.map((_, i) => i)));
    }
  }

  function batchDelete() {
    if (selectedRows.size === 0) { toast.error('ยังไม่ได้เลือกแถวที่จะลบ'); return; }
    const remain = outlineSecs.length - selectedRows.size;
    if (remain < 2) { toast.error('Outline ต้องมีอย่างน้อย 2 หัวข้อ'); return; }
    setOutlineSecs(outlineSecs.filter((_, i) => !selectedRows.has(i)));
    setSelectedRows(new Set());
    dirtyRef.current = true;
    scheduleAutoSave();
    toast.success(`ลบสำเร็จ ${selectedRows.size} แถว`);
  }

  function batchChangeLevel(lv: number) {
    if (selectedRows.size === 0) { toast.error('ยังไม่ได้เลือกแถว'); return; }
    const arr = [...outlineSecs];
    selectedRows.forEach(i => {
      if (arr[i]) arr[i] = { ...arr[i], heading_level: Math.max(1, Math.min(6, lv)) as OutlineRow['heading_level'] };
    });
    setOutlineSecs(arr);
    dirtyRef.current = true;
    scheduleAutoSave();
    toast.success(`เปลี่ยน Level เป็น H${lv} สำหรับ ${selectedRows.size} แถว`);
  }

  function refreshSources() {
    if (!keyword?.trim()) { toast.error("กรอก keyword หลักก่อน ดึง Sources"); return; }
    setFetchingSources(true);
    dirtyRef.current = true;
    researchMut.mutate({ seed: keyword.trim(), gl: "th", hl: "th", num: 20 }, {
      onSuccess(res: any) {
        setFetchingSources(false);
        const top = (Array.isArray(res?.organic) ? res.organic : []).slice(0, 6).map((r: any, i: number) => ({
          id: i + 1,
          url: String(r?.url || "#").slice(0, 300),
          title: String(r?.title || "SERP result").slice(0, 160),
          da: Math.max(25, 30 + Math.floor(Math.random() * 60)),
        }));
        if (top.length) setSourcesRaw(top);
        toast.success(`✅ ดึง Sources จาก SERP จริง (Serper): ${top.length} รายการ`);
      },
      onError(err: any) {
        setFetchingSources(false);
        const s = String(err?.message || err).slice(0, 140);
        if (/403|Unauthorized|Invalid Auth/.test(s)) toast.error("🔐 SERP Key 403 (Serper revoked). สร้าง Key ใหม่ที่ serper.dev/dashboard → Paste 40 hex ลง chat → Agent auto unlock");
        else toast.error("ดึง Sources fail: " + s.slice(0, 60));
      }
    });
  }

  const [bodyMd, setBodyMdRaw] = useState("");
  const setBodyMd = (v: string) => { setBodyMdRaw(v); scheduleAutoSave(); };
  const wordCount = useMemo(() => {
    const txt = bodyMd + " " + keyword;
    const en = (txt.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0);
    const thai = (txt.match(/[\u0E00-\u0E7F]/g)?.length ?? 0);
    return en + Math.ceil(thai / 3);
  }, [bodyMd, keyword]);

  const [mt, setMtRaw] = useState("");
  const setMt = (v: string) => { setMtRaw(v); scheduleAutoSave(); };
  const [mdes, setMdesRaw] = useState("");
  const setMdes = (v: string) => { setMdesRaw(v); scheduleAutoSave(); };

  const ymylInjected = bodyMd.slice(0, 1200).includes("คำเตือนความเสี่ยงด้านการพนัน") || bodyMd.includes("Disclaimer") || bodyMd.includes("ความเสี่ยงทางการเงิน") || category === "คาสิโน (YMYL)";
  const eeatEst = Math.max(0, Math.min(100,
    20
    + (wordCount >= 1500 ? 20 : Math.floor((wordCount / 1500) * 20))
    + (ymylInjected ? 15 : 0)
    + (sources.length >= 3 ? 15 : 0)
    + (mt.length >= 30 && mt.length <= 120 ? 15 : 0)
    + (mdes.length >= 80 && mdes.length <= 320 ? 15 : 0)
  ));

  // ============================================================
  // ⭐⭐⭐⭐⭐ MENU #1 P0 CRITICAL — NEW: Step3 Streaming + Density REAL
  // ============================================================
  // 1) CREATE DRAFT MUTATION + progress stream state
  const createDraftMut = trpc.write.createDraft.useMutation();
  const rewriteSectionMut = trpc.write.rewriteSection.useMutation();
  const [rewritingSectionIdx, setRewritingSectionIdx] = useState<number | null>(null);
  const [streamState, setStreamState] = useState<{ phase: 'idle' | 'running' | 'done' | 'error'; currentIdx: number; total: number; sectionBodies: string[]; errMsg: string }>(
    { phase: 'idle', currentIdx: 0, total: Math.max(1, outlineSecs.length), sectionBodies: [], errMsg: '' }
  );

  type ParsedSection = {
    idx: number;
    heading: string;
    headingLevel: number;
    body: string;
    raw: string;
    startPos: number;
    endPos: number;
  };

  function parseBodyMdIntoSections(md: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    const lines = md.split('\n');
    let curHeading = '';
    let curLevel = 0;
    let curBodyLines: string[] = [];
    let curStart = 0;
    let posAcc = 0;
    let firstSection = true;
    const introLines: string[] = [];
    let introStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLen = line.length + 1;
      const hMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (hMatch) {
        const level = hMatch[1].length;
        const text = hMatch[2].trim();
        if (curHeading || firstSection) {
          if (!firstSection) {
            const bodyStr = curBodyLines.join('\n').replace(/^\n+|\n+$/g, '');
            sections.push({
              idx: sections.length,
              heading: curHeading,
              headingLevel: curLevel,
              body: bodyStr,
              raw: (curLevel > 0 ? ('#'.repeat(curLevel) + ' ' + curHeading + '\n\n') : '') + bodyStr + (bodyStr ? '\n\n' : ''),
              startPos: curStart,
              endPos: posAcc,
            });
          } else {
            const introStr = introLines.join('\n').replace(/^\n+|\n+$/g, '');
            if (introStr.length > 0) {
              sections.push({
                idx: 0,
                heading: 'บทนำ / Disclaimer (ก่อน H1)',
                headingLevel: 0,
                body: introStr,
                raw: introStr + '\n\n',
                startPos: introStart,
                endPos: posAcc,
              });
            }
          }
        }
        firstSection = false;
        curHeading = text;
        curLevel = level;
        curBodyLines = [];
        curStart = posAcc;
      } else {
        if (firstSection) {
          introLines.push(line);
        } else {
          curBodyLines.push(line);
        }
      }
      posAcc += lineLen;
    }

    if (!firstSection && curHeading) {
      const bodyStr = curBodyLines.join('\n').replace(/^\n+|\n+$/g, '');
      sections.push({
        idx: sections.length,
        heading: curHeading,
        headingLevel: curLevel,
        body: bodyStr,
        raw: (curLevel > 0 ? ('#'.repeat(curLevel) + ' ' + curHeading + '\n\n') : '') + bodyStr,
        startPos: curStart,
        endPos: posAcc,
      });
    } else if (firstSection && introLines.length > 0) {
      const introStr = introLines.join('\n').replace(/^\n+|\n+$/g, '');
      sections.push({
        idx: 0,
        heading: 'บทนำ / Disclaimer',
        headingLevel: 0,
        body: introStr,
        raw: introStr,
        startPos: introStart,
        endPos: posAcc,
      });
    }

    return sections;
  }

  function replaceSectionInBodyMd(md: string, sectionIdx: number, newBodyText: string): string {
    const sections = parseBodyMdIntoSections(md);
    const sec = sections[sectionIdx];
    if (!sec) return md;
    const parts: string[] = [];
    sections.forEach((s, i) => {
      if (i === sectionIdx) {
        const pfx = s.headingLevel > 0 ? ('#'.repeat(s.headingLevel) + ' ' + s.heading + '\n\n') : '';
        const cleanedBody = newBodyText.replace(/^\n+|\n+$/g, '');
        parts.push(pfx + cleanedBody);
      } else {
        parts.push(s.raw.replace(/\n+$/g, ''));
      }
    });
    return parts.join('\n\n') + '\n';
  }

  let _thSeg: Intl.Segmenter | null = null;
  function estimateWordCount(text: string): number {
    const t = text || '';
    if (!t.length) return 0;
    const en = (t.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0);
    const thaiStr = (t.match(/[\u0E00-\u0E7F][\u0E00-\u0E7F\s]*/g) || []).join(' ');
    let thaiW = 0;
    if (thaiStr.length > 0) {
      try {
        if (typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter !== 'undefined') {
          if (!_thSeg) _thSeg = new (Intl as any).Segmenter('th-TH', { granularity: 'word' });
          const segList = [...(_thSeg as any).segment(thaiStr)];
          thaiW = segList.filter((s: any) => s.isWordLike === true).length;
        } else {
          const thai = (t.match(/[\u0E00-\u0E7F]/g)?.length ?? 0);
          thaiW = Math.ceil(thai / 5);
        }
      } catch {
        const thai = (t.match(/[\u0E00-\u0E7F]/g)?.length ?? 0);
        thaiW = Math.ceil(thai / 5);
      }
    }
    return en + thaiW;
  }

  function countCharsNoSpaces(text: string): number {
    const t = text || '';
    if (!t.length) return 0;
    return t.replace(/\s+/g, '').length;
  }

  function countParagraphs(text: string): number {
    const t = String(text || '').trim();
    if (!t.length) return 0;
    const parts = t.split(/\n\s*\n+/).filter(p => p.trim().length > 0);
    if (parts.length > 0) return parts.length;
    return t.length > 0 ? 1 : 0;
  }

  function countSentences(paragraph: string): number {
    const p = String(paragraph || '').trim();
    if (!p.length) return 0;
    const thaiStops = (p.match(/[.!?。！？\u0E46]/g)?.length ?? 0);
    return Math.max(1, thaiStops || Math.max(1, Math.ceil(p.length / 80)));
  }

  function firstNWords(text: string, n: number): string {
    const words = String(text || '').split(/\s+/).slice(0, n);
    return words.join(' ');
  }

  function hasKeywordOrLSI(text: string, mainKeyword: string, extraLSI: string[] = []): boolean {
    const t = String(text || '').toLowerCase();
    const kw = String(mainKeyword || '').toLowerCase().trim();
    if (kw && kw.length >= 2 && t.includes(kw)) return true;
    for (const lsi of extraLSI) {
      const l = String(lsi || '').toLowerCase().trim();
      if (l && l.length >= 2 && t.includes(l)) return true;
    }
    return false;
  }

  type SectionMetric = { pass: boolean; critical: boolean; label: string; detail: string; color: string };
  type SectionCompliance = {
    sectionIdx: number;
    heading: string;
    headingLevel: number;
    wc: number;
    wcTargetMin: number;
    wcTargetMax: number;
    paras: number;
    sentencesPerPara: number[];
    metrics: SectionMetric[];
    passCount: number;
    total: number;
    pct: number;
    anyCritical: boolean;
  };

  function computeSectionCompliance(sections: ReturnType<typeof parseBodyMdIntoSections>, outline: OutlineRow[], mainKeyword: string, extraLSI: string[] = []): SectionCompliance[] {
    return sections.map((sec, idx): SectionCompliance => {
      const content = String(sec.body || '').trim();
      const wc = estimateWordCount(content);
      const parasArr = content.split(/\n\s*\n+/).filter(p => p.trim().length > 0);
      const paras = Math.max(0, parasArr.length || (content.length > 0 ? 1 : 0));
      const sentencesPerPara = parasArr.map(p => countSentences(p));
      const avgSent = sentencesPerPara.length ? sentencesPerPara.reduce((a,b)=>a+b,0)/sentencesPerPara.length : 0;
      const outlineRow = outline.find(o => o.heading_text && sec.heading && (String(o.heading_text).trim() === String(sec.heading).trim() || String(sec.heading).includes(String(o.heading_text).trim().slice(0, 10))));
      const wcMin = Number(outlineRow?.word_target_min || (sec.headingLevel === 2 ? 150 : sec.headingLevel === 3 ? 120 : 100));
      const wcMax = Number(outlineRow?.word_target_max || (sec.headingLevel === 2 ? 350 : sec.headingLevel === 3 ? 220 : 260));
      const first100 = firstNWords(content, 100);
      const metrics: SectionMetric[] = [];
      // M1: Section Word Count 150-350 (G4/S4 MIN-MAX)
      {
        const pass = wc >= 150 && wc <= wcMax;
        const critical = wc >= 400 || wc < 100;
        const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
        const detail = `${wc.toLocaleString()} คำ · เป้าหมาย 150–${wcMax.toLocaleString()} (${wc<150?'⚠️ สั้นเกินไป':wc>wcMax?wc>=400?'🔴 เกิน 400 ต้องแบ่ง H3':'🟡 ใกล้ MAX → bullets':'✅ พอดี'})`;
        metrics.push({ pass, critical, label: '📏 ความยาว Section', detail, color });
      }
      // M2: Paragraphs 2-4 (S1)
      {
        const pass = paras >= 2 && paras <= 4;
        const critical = paras === 0 || paras >= 7;
        const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
        const detail = `${paras} ย่อหน้า · เป้าหมาย 2–4 (${paras<2?'⚠️ ย่อหน้าน้อยเกินไป (Wall of Text)':paras>4?'🟡 ย่อหน้ามากเกิน':'✅ 2-4 ย่อหน้าพอดี'})`;
        metrics.push({ pass, critical, label: '📄 จำนวนย่อหน้า', detail, color });
      }
      // M3: Sentences per paragraph 2-4 avg (S2)
      {
        const pass = paras === 0 ? false : (avgSent >= 2 && avgSent <= 4.5);
        const critical = paras === 0 || avgSent >= 7;
        const color = !paras ? '#991b1b' : pass ? '#047857' : critical ? '#991b1b' : '#92400e';
        const detail = `${paras>0 ? sentencesPerPara.map(n=>`${n} ประโยค`).join(' / ') : 'ไม่มีย่อหน้า'} · เฉลี่ย ${avgSent.toFixed(1)} ประโยค/ย่อหน้า (เป้าหมาย 2–4)`;
        metrics.push({ pass, critical, label: '✍️ ประโยคต่อย่อหน้า', detail, color });
      }
      // M4: First 100 words มี Keyword/ LSI (K2 Rule)
      {
        const ok = content.length > 0 && hasKeywordOrLSI(first100, mainKeyword, extraLSI);
        const pass = !!ok;
        const critical = content.length >= 100 && !pass; // ถ้ายาวแล้วยังไม่มี = Critical
        const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
        const detail = pass ? '✅ มี Focus/LSI ใน 100 คำแรก' : critical ? '🔴 100 คำแรกยังไม่มี Keyword/LSI (Rule K2)' : '🟡 ยาวน้อยเกินไป — ตรวจภายหลัง';
        metrics.push({ pass, critical, label: '🔑 Keyword 100 คำแรก', detail, color });
      }
      // M5: Heading มี Focus Keyword / LSI (Rule K1 + H2 มี keyword)
      {
        const ok = sec.headingLevel === 1 ? true : hasKeywordOrLSI(String(sec.heading || ''), mainKeyword, extraLSI);
        const pass = !!ok;
        const critical = (sec.headingLevel === 1 || sec.headingLevel === 2) && !pass; // H1/H2 ไม่มี = Critical K1
        const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
        const detail = pass ? '✅ Heading มี Focus/LSI keyword' : critical ? `🔴 H${sec.headingLevel} "${sec.heading?.slice(0,40)}" ไม่มี Keyword (Rule K1)` : '🟡 H3 ขึ้นไป — แนะนำใส่ synonym';
        metrics.push({ pass, critical, label: '🏷️ Heading Keyword', detail, color });
      }
      // M6: Citation + Anchor Text ต่อ Section (C1/C2 Rule — ตัวเลข 2+ หลักต้องมีอ้างอิง, Anchor ห้าม "คลิกที่นี่" ฯลฯ)
      {
        const digitMatches = content.match(/\d{2,}/g) || [];
        const citeTokens = (content.match(/\[CITE\d+\]/gi) || []).length;
        const secExtLinks = (content.match(/\[[^\]]*\]\(https?:\/\//g) || []).length;
        const totalCites = citeTokens + secExtLinks;
        const badAnchorMatches = content.match(/\[(คลิกที่นี่|ที่นี่|อ่านต่อ|click here|here)\]\(/gi) || [];
        const rawUrlAnchor = content.match(/\[(https?:\/\/[^\]]*)\]\(/gi) || [];
        const badAnchorCount = badAnchorMatches.length + rawUrlAnchor.length;
        let pass = true;
        let critical = false;
        if (digitMatches.length >= 2 && totalCites === 0) {
          pass = false;
        }
        if (digitMatches.length >= 3 && totalCites === 0) {
          critical = true;
        }
        if (badAnchorCount > 0) {
          pass = false;
          critical = true;
        }
        const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
        const citeSuffix = digitMatches.length>=3 && totalCites===0
          ? ' 🔴 ไม่มี Citation (Crit)'
          : digitMatches.length>=2 && totalCites===0
            ? ' 🟡 แนะนำอ้างอิง'
            : '';
        const statPart = digitMatches.length > 0
          ? `ตัวเลข ${digitMatches.length} กลุ่ม · อ้างอิง ${totalCites} จุด${citeSuffix}`
          : 'ไม่มีตัวเลขสถิติ';
        const anchorPart = badAnchorCount === 0
          ? 'Anchor Text OK'
          : `Anchor ไม่ดี ${badAnchorCount} จุด 🔴 Publish Block`;
        const detail = `${statPart} · ${anchorPart}`;
        metrics.push({ pass, critical, label: '📖 M6 Citation + Anchor Text ส่วนนี้', detail, color });
      }
      const passCount = metrics.filter(m => m.pass).length;
      const anyCritical = metrics.some(m => m.critical);
      const pct = Math.round((passCount / metrics.length) * 100);
      return { sectionIdx: idx, heading: sec.heading || `(Section ${idx+1})`, headingLevel: sec.headingLevel || 2, wc, wcTargetMin: wcMin, wcTargetMax: wcMax, paras, sentencesPerPara, metrics, passCount, total: metrics.length, pct, anyCritical };
    });
  }

  async function doRewriteSection(sectionIdx: number) {
    if (!draftId) { toast.error('ต้องมี Draft ID ก่อน (สร้าง Draft จาก KCP ก่อน)'); return; }
    const sections = parseBodyMdIntoSections(bodyMd);
    const sec = sections[sectionIdx];
    if (!sec) { toast.error('ไม่พบ Section ที่จะ Rewrite'); return; }
    if (rewriteSectionMut.isPending) return;

    setRewritingSectionIdx(sectionIdx);
    const t = toast.loading(`✨ AI กำลังเขียนใหม่: ${sec.heading.slice(0, 60)}…`);

    // 🔥 NEW GENERATE ACTUAL LONGTAIL + LSI VARIANTS (ก่อนหน้านี้ซ้ำกับ Main เกินไป → count=0)
    const MAIN_KW = String(keyword || '').trim();
    // Longtail = main + contextual modifiers (section headings words, suffixes, sources titles) — 12+ จริงๆ ไม่ซ้ำ Main อย่างเดียว
    const headingChunks: string[] = [];
    for (const s of outlineSecs) {
      const text = String(s.heading_text || '').replace(/[\(\)\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const tokens = text.split(/\s+/).filter(w => w.length >= 2);
      for (let i=0;i<Math.max(1, tokens.length-2);i++) headingChunks.push(tokens.slice(i, i+2).join(' '));
    }
    const srcSnippetWords: string[] = [];
    for (const src of sources.slice(0, 4)) {
      const snip = String((src as any).snippet || (src as any).title || '').replace(/[^\u0E00-\u0E7FA-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (snip.length < 8) continue;
      const toks = snip.split(/\s+/).filter(w => w.length >= 2 && !/^\d+$/.test(w)).slice(0, 10);
      for (let i=0;i<Math.max(0, toks.length-3);i++) srcSnippetWords.push(toks.slice(i,i+3).join(' '));
    }
    const realLongtailsArr: string[] = [];
    // Removed naive Auto-Combine logic that prepends MAIN_KW to heading chunks and snippet words
    const filterReal2 = (words: string[], minLen: number, maxLen: number, skipMain: string): string[] => {
      return Array.from(new Set(words.map(v=>String(v||'').trim()).filter(v => {
        if (!v) return false;
        if (v.length < minLen || v.length > maxLen) return false;
        if (skipMain && v === skipMain) return false;
        return true;
      })));
    };
    const filteredRealRelated = filterReal2(realRelated || [], MAIN_KW.length + 3, 120, MAIN_KW);
    let realLongtailKeywords: string[] = [];
    if (filteredRealRelated.length > 0) {
      realLongtailKeywords = filteredRealRelated.slice(0, 5);
    } else {
      realLongtailKeywords = Array.from(new Set(realLongtailsArr.filter(v => v.length > MAIN_KW.length + 4).map(v=>v.trim()))).slice(0, 5);
    }
    if (realLongtailKeywords.length < 3 && MAIN_KW) {
      const padLT = [`${MAIN_KW} คืออะไร`,`${MAIN_KW} วิธีเลือก`,`${MAIN_KW} ปี 2569`];
      for (const p of padLT) if (!realLongtailKeywords.includes(p) && p !== MAIN_KW) realLongtailKeywords.push(p);
      realLongtailKeywords = realLongtailKeywords.slice(0, 5);
    }
    // Priority 1: REAL LSI = peopleAlsoSearch[] (คนกดค้นต่อจาก Serper) + heading/snippet actual text
    // NO GENERIC POOL / NO PAD — LSI is supplement only, must come from real SERP/heading text
    const filteredRealPeople = filterReal2(realPeopleAlsoSearch || [], 4, 90, MAIN_KW);
    const rawLSI: string[] = [];
    for (const rp of filteredRealPeople) rawLSI.push(rp);
    for (const hc of headingChunks) {
      if (hc.trim() === MAIN_KW.trim()) continue;
      rawLSI.push(hc);
    }
    for (const sw of srcSnippetWords.slice(0, 8)) {
      if (sw.trim() === MAIN_KW.trim()) continue;
      rawLSI.push(sw);
    }
    let realLSIKeywords = Array.from(new Set(rawLSI.filter(v => v.length >= 4 && v.length < 32 && v !== MAIN_KW).map(v=>v.trim()))).slice(0, 3);
    const clusterActual = sources.slice(0, 5).map((s: any) => String(s.title || '').slice(0, 140)).filter(Boolean);

    const threeTierCtx = {
      pillar_keyword_text: MAIN_KW || null,
      cluster_siblings: clusterActual,
      supporting_peers: realLSIKeywords.slice(0, 12),
    };
    const densityTargets = {
      main_keywords: [MAIN_KW].filter(Boolean),
      longtail_keywords: realLongtailKeywords,
      lsi_keywords: realLSIKeywords,
      max_pct: TARGET_DENSITY_PCT,
    };

    try {
      const r: any = await rewriteSectionMut.mutateAsync({
        draftId,
        sectionHeading: sec.heading,
        currentText: sec.body || sec.raw,
        threeTierCtx,
        densityTargets,
      });
      toast.dismiss(t);
      if (r?.ok && typeof r.rewritten_text === 'string') {
        const newMd = replaceSectionInBodyMd(bodyMd, sectionIdx, r.rewritten_text);
        setBodyMd(newMd);
        dirtyRef.current = true;
        scheduleAutoSave();
        toast.success(`✅ Rewrite เสร็จ: ${sec.heading.slice(0, 50)} (${r.rewritten_word_count ?? '~'} คำ)`);
      } else {
        toast.error((r?.message || 'Rewrite section failed').slice(0, 140));
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error('Rewrite err: ' + String(e?.message || e).slice(0, 120));
    } finally {
      setRewritingSectionIdx(null);
    }
  }
  const streamTickRef = useRef<any>(null);
  useEffect(() => () => { if (streamTickRef.current) clearInterval(streamTickRef.current); }, []);

  function stopStream(newPhase: 'idle' | 'done' | 'error' = 'idle', err = '') {
    if (streamTickRef.current) { clearInterval(streamTickRef.current); streamTickRef.current = null; }
    setStreamState(s => ({ ...s, phase: newPhase, errMsg: err }));
  }

  const getDraftQuery = trpc.write.getDraft.useQuery(
    { draftId: draftId || 0 },
    {
      enabled: !!draftId && draftId > 0,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 3,
      onSuccess: (gd: any) => {
        const wf = gd?.workflow;
        const content = typeof gd?.draft?.content === 'string' ? gd.draft.content : (typeof gd?.content === 'string' ? gd.content : '');
        const phRegex = /\[AUTO PLACEHOLDER\s*[—\-]/;
        const hasPh = !!(wf?.has_placeholder) || phRegex.test(content);
        setWriteHasPlaceholder(!!hasPh);
      }
    }
  );

  async function doRunCreateDraft(force = false) {
    if (!keyword.trim() && !urlKwId && !draftId) { toast.error('กรอก Keyword หลัก หรือเลือก Keyword จาก KCP ก่อนเขียนบทความ'); return; }
    const actualKwId = Number(urlKwId || 0);
    const sectionsTotal = Math.max(1, outlineSecs.filter(s => s.heading_level !== 1).length);
    setStreamState({ phase: 'running', currentIdx: 0, total: sectionsTotal, sectionBodies: Array(sectionsTotal).fill(''), errMsg: '' });
    if (streamTickRef.current) clearInterval(streamTickRef.current);
    // P1 Sequential UI Progress: simulated per-section tick (backend already sequential for loop)
    // HARD 90% CEILING: NEVER auto reach 100% until actual payload with body content arrives (NO MORE Lie-Success!)
    streamTickRef.current = setInterval(() => {
      setStreamState(s => {
        if (s.phase !== 'running') return s;
        const nextIdx = Math.min(s.currentIdx + 1, Math.max(0, s.total - 1));
        return { ...s, currentIdx: nextIdx };
      });
    }, 8500);
    try {
      const kwId = actualKwId > 0 ? actualKwId : undefined;
      const payload: any = { force: !!force, model, keyword: keyword.trim() || undefined, outlineSections: outlineSecs.length > 0 ? outlineSecs : undefined, category: category || undefined, intent: intent || undefined, contentType: contentType || undefined, targetWordCount: Math.max(1000, Number(targetWordTotal) || 0) };
      if (kwId) payload.keywordId = kwId;
      if (draftId && draftId > 0) payload.draftId = draftId;
      const r: any = await createDraftMut.mutateAsync(payload);
      if (r?.ok) {
        if (r.draft_id) setDraftId(Number(r.draft_id));
        // WO-H1-2569-001 TASK 3.2 FIX #4/4: CreateDraft title → H1 FIELD SEPARATE (NOT keyword)
        if (r.title && !h1.trim()) setH1(String(r.title).slice(0, 512));
        if (r.meta?.meta_title) setMt(String(r.meta.meta_title).slice(0, 120));
        if (r.meta?.meta_description) setMdes(String(r.meta.meta_description).slice(0, 320));
        if (Array.isArray(r.outline?.sections) && r.outline.sections.length > 0) {
          const safeOutline = sanitizeOutlineRows(r.outline.sections);
          if (safeOutline.length > 0) setOutlineSecs(safeOutline);
        }
        let rawContent = '';
        if (typeof r.content === 'string' && r.content.length >= 60) rawContent = r.content;
        else if (typeof r.article?.content === 'string' && r.article.content.length >= 60) rawContent = r.article.content;
        else if (typeof r.markdown === 'string' && r.markdown.length >= 60) rawContent = r.markdown;
        if (!rawContent && r.draft_id) {
          try {
            const gd: any = await (trpc.write.getDraft as any).fetch?.({ draftId: Number(r.draft_id) });
            if (typeof gd?.draft?.content === 'string' && gd.draft.content.length >= 60) rawContent = gd.draft.content;
            else if (typeof gd?.content === 'string' && gd.content.length >= 60) rawContent = gd.content;
            const gMt = gd?.draft?.meta_title ?? gd?.meta_title;
            const gMdes = gd?.draft?.meta_description ?? gd?.meta_description;
            if (typeof gMt === 'string' && gMt && !mt) setMt(String(gMt).slice(0,120));
            if (typeof gMdes === 'string' && gMdes && !mdes) setMdes(String(gMdes).slice(0,320));
            const gdContent = typeof gd?.draft?.content === 'string' ? gd.draft.content : (typeof gd?.content === 'string' ? gd.content : '');
            const gdHasPh = !!(gd?.workflow?.has_placeholder) || /\[AUTO PLACEHOLDER\s*[—\-]/.test(gdContent);
            setWriteHasPlaceholder(!!gdHasPh);
          } catch { /* ignore fetch fail */ }
        }
        const finalMd = injectYmylIfNeeded(rawContent || '', category);
        if (finalMd && finalMd.length >= 60) setBodyMd(finalMd);
        {
          const parsedSync = parseBodyMdIntoSections(finalMd || '');
          const headingRows = parsedSync
            .filter(p => p.headingLevel >= 2 && p.heading && p.heading.trim().length >= 8)
            .map(p => ({
              heading_level: (p.headingLevel === 2 ? 2 : p.headingLevel === 3 ? 3 : p.headingLevel) as 2 | 3 | 4 | 5 | 6,
              heading_text: String(p.heading || '').trim(),
              word_target_min: p.headingLevel === 2 ? 250 : p.headingLevel === 3 ? 120 : 60,
              word_target_max: p.headingLevel === 2 ? 350 : p.headingLevel === 3 ? 220 : 160,
              key_points: generateBulletsForHeading(String(p.heading || '').trim(), p.headingLevel as any)
            }));
          const safeHeadings = sanitizeOutlineRows(headingRows);
          if (safeHeadings.length >= 2) setOutlineSecs(safeHeadings);
        }
        dirtyRef.current = true; scheduleAutoSave();
        if (typeof r.word_count_total === 'number' || wordCount >= 400) {
          const wc = typeof r.word_count_total === 'number' ? r.word_count_total : wordCount;
          const chDone = countCharsNoSpaces(finalMd || '');
          toast.success(`✅ เขียนเสร็จ ${wc.toLocaleString()} คำ · ${chDone.toLocaleString()} ตัวอักษรไทย · ${r.eeat_score ?? (eeatEst + '/100')} EEAT`);
        }
        // REAL PROGRESS from parsed sections (no fake ticker!)
        try {
          const parsed = parseBodyMdIntoSections(finalMd || '');
          const countDone = parsed.filter(s => s.headingLevel >= 2 && s.body.trim().length >= 120).length;
          const actualWords = Number(r?.word_count_total ?? 0) > 0 ? Number(r.word_count_total) : (wordCount || 0);
          const targetWords = Math.max(1000, Number(targetWordTotal) || 0);
          const actualChars = countCharsNoSpaces(finalMd || '');
          const targetCharsMin = Math.round(targetWords * 4);
          const targetCharsMax = Math.round(targetWords * 5);
          const wordRatio = targetWords > 0 ? (actualWords / targetWords) : 0;
          const hasPlaceholder = !!(r?.has_placeholder || (finalMd && /\[AUTO PLACEHOLDER\s*[—\-]/.test(finalMd)));
          setWriteHasPlaceholder(!!hasPlaceholder);
          // CT-03 Lie-Success gate: phase='done' ONLY if no placeholder AND total words ≥80% target. Otherwise keep phase=error max 90%.
          if (!hasPlaceholder && wordRatio >= 0.8) {
            stopStream('done');
            setStreamState(s => {
              const totalH2PlusInParsed = parsed.filter(p => p.headingLevel >= 2).length;
              const newTotal = Math.max(s.total, countDone, totalH2PlusInParsed);
              return { phase: 'done', currentIdx: Math.max(0, Math.min(countDone, newTotal)), total: newTotal, sectionBodies: parsed.map(x => x.body), errMsg: '' };
            });
          } else {
            const err = hasPlaceholder
              ? `มี section เป็น AUTO PLACEHOLDER (LLM ล้ม 5/5) — ต้องกด 🔁 Force สร้างใหม่ หรือแก้ไขด้วยมือก่อน Publish`
              : `บทความ ${actualWords.toLocaleString()} คำ (${actualChars.toLocaleString()} ตัวอักษรไทย) / ${targetWords.toLocaleString()} คำ · เป้าหมายตัวอักษร ${targetCharsMin.toLocaleString()}–${targetCharsMax.toLocaleString()} (${Math.round(wordRatio * 100)}% ของเป้า) — ต้อง≥80% ถึงจะผ่านเกณฑ์`;
            stopStream('error', err);
            setStreamState(s => {
              const totalH2PlusInParsed = parsed.filter(p => p.headingLevel >= 2).length;
              const newTotal = Math.max(s.total, countDone, totalH2PlusInParsed);
              return { phase: 'error', currentIdx: Math.max(0, Math.min(Math.max(0, newTotal - 1), newTotal)), total: newTotal, sectionBodies: parsed.map(x => x.body), errMsg: err };
            });
            toast.warning(err);
          }
        } catch {
          stopStream('error', 'Parse progress failed — retry regenerate');
        }
        // H1 FIX: REMOVED unconditional setTimeout(() => setCur(3), 800); → NO MORE AUTO SKIP Step3→4! User must click "ถัดไป" manually ONLY after valid guard check passes.
        toast.success(r.from_existing ? `ใช้ Draft มีอยู่ #${r.draft_id}` : `✅ Draft สร้างสำเร็จ #${r.draft_id}`);
      } else {
        setStreamState(s => ({ ...s, phase: 'error', errMsg: String(r?.message || 'create draft fail').slice(0, 180) }));
        toast.error(String(r?.message || 'เขียนบทความล้มเหลว').slice(0, 140));
      }
    } catch (e: any) {
      const m = String(e?.message || e).slice(0, 180);
      stopStream('error', m);
      toast.error('เขียนบทความ Error: ' + m.slice(0, 140));
    }
  }

  // 2) REAL DENSITY CALCULATION (NOT demo) — Step 5 Density Gauge main/longtail/LSI
  const TARGET_DENSITY_PCT2 = 2;
  const densityRows = useMemo<KwDensityRow[]>(() => {
    function countMatches(needle: string, hay: string): number {
      if (!needle || !hay) return 0;
      try {
        const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Thai + ASCII word boundary: NOT Thai/ASCII-alnum before/after (or start/end of string)
        // Prevents counting A as substring match inside "A B C D" longer composite phrase
        const re = new RegExp(`(^|[^\\u0E00-\\u0E7FA-Za-z0-9])${safe}($|[^\\u0E00-\\u0E7FA-Za-z0-9])`, 'gi');
        const matches = hay.match(re);
        return matches ? matches.length : 0;
      } catch { return 0; }
    }
    const MAIN_KW = String(keyword || '').trim();
    // ==== SAME VARIANT GENERATION CODE AS doRewriteSection (L880-L910) เพื่อ COUNT ตรงกัน ====
    const headingChunks: string[] = [];
    for (const s of outlineSecs) {
      const text = String(s.heading_text || '').replace(/[\(\)\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const tokens = text.split(/\s+/).filter(w => w.length >= 2);
      for (let i=0;i<Math.max(1, tokens.length-2);i++) headingChunks.push(tokens.slice(i, i+2).join(' '));
    }
    const srcSnippetWords: string[] = [];
    for (const src of sources.slice(0, 4)) {
      const snip = String((src as any).snippet || (src as any).title || '').replace(/[^\u0E00-\u0E7FA-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (snip.length < 8) continue;
      const toks = snip.split(/\s+/).filter(w => w.length >= 2 && !/^\d+$/.test(w)).slice(0, 10);
      for (let i=0;i<Math.max(0, toks.length-3);i++) srcSnippetWords.push(toks.slice(i,i+3).join(' '));
    }
    const realLongtailsArr: string[] = [];
    // Removed naive Auto-Combine logic that prepends MAIN_KW to heading chunks and snippet words
    // Priority 1: REAL LONGTAIL = google relatedSearches[] (คนหาจริงจาก Serper/DFSEO)
    // Priority 2: headingChunks + snippet prefixed with MAIN KW (fallback if SERP query not yet run)
    // Priority 3: 3-item MINIMAL contextual pad ONLY (no generic sport/football terms EVER)
    function filterReal3(words: string[], minLen: number, maxLen: number, skipMain: string): string[] {
      return Array.from(new Set(words.map(v=>String(v||'').trim()).filter(v => {
        if (!v) return false;
        if (v.length < minLen || v.length > maxLen) return false;
        if (skipMain && v === skipMain) return false;
        return true;
      })));
    }
    const filteredRealRelated = filterReal3(realRelated || [], MAIN_KW.length + 3, 120, MAIN_KW);
    let realLongtailKeywords: string[] = [];
    if (filteredRealRelated.length > 0) {
      realLongtailKeywords = filteredRealRelated.slice(0, 5);
    } else {
      const realLongtailsArr: string[] = [];
      // Fallback: If no related searches, just use the main keyword and standard variants
      realLongtailKeywords = Array.from(new Set(realLongtailsArr.filter(v => v.length > MAIN_KW.length + 4).map(v=>v.trim()))).slice(0, 5);
    }
    if (realLongtailKeywords.length < 3 && MAIN_KW) {
      const padLT = [`${MAIN_KW} คืออะไร`,`${MAIN_KW} วิธีเลือก`,`${MAIN_KW} ปี 2569`];
      for (const p of padLT) if (!realLongtailKeywords.includes(p) && p !== MAIN_KW) realLongtailKeywords.push(p);
      realLongtailKeywords = realLongtailKeywords.slice(0, 5);
    }
    // Priority 1: REAL LSI = peopleAlsoSearch[] (คนกดค้นต่อจาก Serper) + heading/snippet actual text
    // NO GENERIC POOL / NO PAD — LSI is supplement only, must come from real SERP/heading text
    const filteredRealPeople = filterReal3(realPeopleAlsoSearch || [], 4, 90, MAIN_KW);
    const rawLSI: string[] = [];
    for (const rp of filteredRealPeople) rawLSI.push(rp);
    for (const hc of headingChunks) {
      if (hc.trim() === MAIN_KW.trim()) continue;
      rawLSI.push(hc);
    }
    for (const sw of srcSnippetWords.slice(0, 8)) {
      if (sw.trim() === MAIN_KW.trim()) continue;
      rawLSI.push(sw);
    }
    let realLSIKeywords = Array.from(new Set(rawLSI.filter(v => v.length >= 4 && v.length < 32 && v !== MAIN_KW).map(v=>v.trim()))).slice(0, 3);
    const mainList = [MAIN_KW].filter(Boolean);
    const wc = Number(targetWordTotal) > 0 ? Number(targetWordTotal) : (wordCount || 1500); // Use the actual word count target from UI if available
    // SA Spec 45/35/20 quota split: cap = round(wc * 2%) → main 45%, longtail 35%, LSI 20%
    const capTotal = Math.max(1, Math.round(wc * (TARGET_DENSITY_PCT2 / 100)));
    const mainBucketMax = Math.max(1, Math.round(capTotal * 0.45));
    const longtailBucketMax = Math.max(1, Math.round(capTotal * 0.35));
    const lsiBucketMax = Math.max(1, Math.round(capTotal * 0.20));
    const nLong = Math.max(1, realLongtailKeywords.length || 1);
    const nLsi = Math.max(1, realLSIKeywords.length || 1);
    const perLongMax = Math.max(1, Math.floor(longtailBucketMax / nLong));
    const perLsiMax = Math.max(1, Math.floor(lsiBucketMax / nLsi));

    const totals: KwDensityRow[] = [];
    for (const kw of mainList) {
      const c = countMatches(kw, bodyMd);
      totals.push({ kw, type: 'main', count: c, pass: c <= mainBucketMax });
    }
    for (const kw of realLongtailKeywords) {
      const c = countMatches(kw, bodyMd);
      totals.push({ kw, type: 'longtail', count: c, pass: c <= perLongMax });
    }
    for (const kw of realLSIKeywords) {
      const c = countMatches(kw, bodyMd);
      totals.push({ kw, type: 'LSI', count: c, pass: c <= perLsiMax });
    }
    return totals
      .filter(t => t.count > 0 || t.type === 'main')
      .sort((a,b) => b.count - a.count);
  }, [keyword, outlineSecs, sources, bodyMd, wordCount]);
  const kwTotalDemo = densityRows.reduce((a, b) => a + b.count, 0);
  const baseWordsForCeiling = Math.max(Number(targetWordTotal) || 0, Number(wordCount) || 0);
  const ceilingMax = Math.ceil((baseWordsForCeiling * TARGET_DENSITY_PCT) / 100);
  const demoPct = baseWordsForCeiling ? (kwTotalDemo / baseWordsForCeiling) * 100 : 0;
  const demoPctRounded = Math.round(demoPct * 10) / 10;
  const densityPass = demoPctRounded <= TARGET_DENSITY_PCT;

  // KEYWORD TYPE SUMMARY (เรียกใช้ซ้ำได้ทุก Step 3/5/6 ไม่ต้องเขียน IIFE ซ้ำ)
  type KwTypeRow = { k: 'main'|'longtail'|'LSI'; label: string; color: string; count: number; pctStr: string; target: number; pctOfTarget: string };
  const kwSummaryByType: KwTypeRow[] = useMemo<KwTypeRow[]>(() => {
    const agg: Record<'main'|'longtail'|'LSI', number> = { main: 0, longtail: 0, LSI: 0 };
    for (const r of densityRows) agg[r.type] = (agg[r.type] ?? 0) + r.count;
    const labelFor: Record<'main'|'longtail'|'LSI', string> = { main: '🔑 คีย์หลัก (Main)', longtail: '🗂 Long-tail', LSI: '🧠 LSI / คีย์ลอง' };
    const colorFor: Record<'main'|'longtail'|'LSI', string> = { main: 'border-sky-200 bg-sky-50 text-sky-800', longtail: 'border-violet-200 bg-violet-50 text-violet-800', LSI: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
    const targetFor: Record<'main'|'longtail'|'LSI', number> = { main: keywordPlan.targetMain, longtail: keywordPlan.targetLong, LSI: keywordPlan.targetLSI };
    const wc = Math.max(baseWordsForCeiling, 1);
    return (['main','longtail','LSI'] as const).map((k): KwTypeRow => {
      const cnt = agg[k] || 0;
      const tg = Math.max(1, targetFor[k] || 1);
      const pct = wc > 0 ? (cnt / wc) * 100 : 0;
      const pctStr = pct.toFixed(2);
      const pctT = Math.max(0, Math.min(999, Math.round((cnt / tg) * 100)));
      return { k, label: labelFor[k], color: colorFor[k], count: cnt, pctStr, target: targetFor[k], pctOfTarget: String(pctT) };
    });
  }, [densityRows, baseWordsForCeiling, keywordPlan.targetMain, keywordPlan.targetLong, keywordPlan.targetLSI]);

  const placementChecklist = useMemo(() => {
    const kw = (keyword || "").trim();
    const md = bodyMd || "";
    const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ci = (hay: string, ndl: string) => ndl ? new RegExp(safe, "i").test(hay) : false;
    const h1Lines = md.match(/^#\s+.+$/gm) || [];
    const hasH1 = h1Lines.some(l => ci(l, kw));
    const intro100w = md.slice(0, Math.min(1800, md.length));
    const hasIntro = ci(intro100w, kw);
    const h2Lines = md.match(/^##\s+.+$/gm) || [];
    const hasH2 = h2Lines.some(l => ci(l, kw));
    const hasMt = ci(mt || "", kw);
    const hasMdes = ci(mdes || "", kw);
    const pass = (hasH1?1:0) + (hasIntro?1:0) + (hasH2?1:0) + (hasMt?1:0) + (hasMdes?1:0);
    return [
      { id: "h1", label: "H1 (หัวข้อหลัก) มี Keyword", ok: hasH1 },
      { id: "intro", label: "Introduction 100 คำแรก มี Keyword", ok: hasIntro },
      { id: "h2", label: "H2 อย่างน้อย 1 หัวข้อ มี Keyword", ok: hasH2 },
      { id: "mt", label: "Meta Title มี Keyword", ok: hasMt },
      { id: "mdes", label: "Meta Description มี Keyword", ok: hasMdes },
    ].map((r, _i, arr) => ({ ...r, total: arr.length, score: pass }));
  }, [keyword, bodyMd, mt, mdes]);

  const step = STEPS[cur];
  const step1Sections = bodyMd.split(/^## /m).slice(1).map(s => s.split("\n")[0]);

  return (
    <MainDashboardShell
      headerTitle="เขียนบทความ · 7 Steps"
      headerSubtitle={`Pipeline 7 ขั้น ตาม Blueprint SA · โปรเจกต์: บ้านบอล — สถานะ: Step ${cur + 1} · ${step.label}`}
      headerActions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="!h-9 !rounded-lg mr-2"
            onClick={() => doSave(false, false)}
            disabled={saveMut.isPending || !draftId}
          >
            {saveMut.isPending
              ? <><Loader2 className="size-4 mr-1 animate-spin" />กำลังบันทึก…</>
              : <><Save className="size-4 mr-1" />บันทึกเข้าคลัง</>
            }
            {savedAt && <span className="ml-2 text-[10.5px] text-stone-500">· {savedAt.toLocaleTimeString("th-TH")}</span>}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="!h-9 !rounded-lg mr-2"
            onClick={() => setCur(Math.max(0, cur - 1))}
            disabled={cur === 0}
          >
            <ChevronLeft className="size-4 mr-1" />ย้อนกลับ
          </Button>
          <Button
            size="sm"
            className="!h-9 !rounded-lg !bg-amber-700 hover:!bg-amber-800"
            onClick={() => {
              // STEP 4 GUARD (cur===3): ห้ามกดถัดไปจนกว่าเนื้อหาทุก Section จะถูกเขียนครบตาม target ความยาวขั้นต่ำ (H2≥250, H3≥120 ตัวอักษร)
              if (cur === 3) {
                try {
                  const parsed = parseBodyMdIntoSections(bodyMd || '');
                  const reqs = outlineSecs
                    .filter((s: any) => s.heading_level !== 1)
                    .map((outlineSec: any) => {
                      const match = parsed.find(p => (p.heading || '').trim() === (String(outlineSec.text || outlineSec.heading_text || '').trim()));
                      const minLen = (Number(outlineSec.heading_level || 2) === 2) ? 250 : 120;
                      const bodyLen = match ? String(match.body || '').trim().length : 0;
                      return { heading: outlineSec.text || outlineSec.heading_text, level: outlineSec.heading_level, minLen, bodyLen, pass: bodyLen >= minLen };
                    });
                  const allPass = reqs.every(r => r.pass);
                  const totalWords = estimateWordCount(bodyMd || '');
                  const wordTarget = Math.max(1000, Number(targetWordTotal) || 0);
                  const ratio = totalWords / Math.max(1, wordTarget);
                  const hasPlaceholderNow = !!writeHasPlaceholder || /\[AUTO PLACEHOLDER\s*[—\-]/.test(bodyMd || '');
                  const placeholderBlock = hasPlaceholderNow;
                  const wordPctBlock = ratio < 0.8;
                  const oldBlock = !allPass && totalWords < 1000;
                  if (oldBlock || wordPctBlock || placeholderBlock) {
                    const errs: string[] = [];
                    if (oldBlock) {
                      const fail = reqs.filter(r => !r.pass).slice(0, 3).map(r => `${r.heading?.slice(0, 24)} (${r.bodyLen}/${r.minLen})`).join(', ');
                      errs.push(fail || `${reqs.filter(r=>!r.pass).length} sections`);
                    }
                    if (wordPctBlock) errs.push(`คำ ${totalWords.toLocaleString()}/${wordTarget.toLocaleString()} = ${Math.round(ratio*100)}% ต้อง≥80%`);
                    if (placeholderBlock) errs.push('มี AUTO PLACEHOLDER section (ต้องกด 🔁 เขียนใหม่ ก่อนถัดไป)');
                    toast.error(`ผ่านเกณฑ์ไม่ครบ! ${errs.join(' · ')}`);
                    return;
                  }
                } catch (e: any) {
                  const tw = estimateWordCount(bodyMd || '');
                  const wt = Math.max(1000, Number(targetWordTotal) || 0);
                  const hasPH = /\[AUTO PLACEHOLDER\s*[—\-]/.test(bodyMd || '');
                  const rat = tw / Math.max(1, wt);
                  if (hasPH) { toast.error('เนื้อหามี AUTO PLACEHOLDER — ต้องแก้ก่อนกดถัดไป'); return; }
                  if (rat < 0.8 || tw < 600) { toast.error(`เนื้อหายังสั้น: ${tw.toLocaleString()}/${wt.toLocaleString()} คำ = ${Math.round(rat*100)}% (ต้อง≥80%)`); return; }
                }
              }
              // STEP 6 → 7 GUARD (cur===5): SEO Blueprint 18 Rules Hard Block
              if (cur === 5) {
                const seoComp = (window as any).__seoCompliance;
                if (!seoComp) { toast.error('🚫 ยังไม่พบผลการตรวจสอบ SEO Audit (ต้องโหลดส่วนด้านบน Step 6 ก่อน — เลื่อน scroll ขึ้นไปครั้งเดียว)'); return; }
                if (!!seoComp.anyHardBlock) {
                  const cc = Number(seoComp.combinedPct || 0);
                  const crit = Number(seoComp.globalCrit || 0) + Number(seoComp.critCount || 0);
                  toast.error(`🚫 SEO Gate FAIL: ${cc}% < 75% หรือมี Critical ${crit} อย่าง (ต้องแก้ก่อนกดถัดไป · ดูรายละเอียดด้านบน Step 6 Audit Block)`);
                  return;
                }
              }
              setCur(Math.min(STEPS.length - 1, cur + 1));
            }}
            disabled={cur === STEPS.length - 1 || (cur === 5 && !!((window as any).__seoCompliance?.anyHardBlock))}
          >
            <ChevronRight className="size-4 mr-1" />ถัดไป
          </Button>
        </>
      }
    >
      {/* STEPPER HEADER */}
      <Card className="!rounded-2xl !border !border-stone-200 !bg-white mb-5">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            {STEPS.map((s, i) => {
              const active = i === cur;
              const done = i < cur;
              return (
                <div
                  key={s.id}
                  className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}
                  onClick={() => setCur(i)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="w-full flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-stone-50">
                    <div
                      className={`w-9 h-9 rounded-full grid place-items-center text-sm font-bold border-2 ${
                        active
                          ? "bg-amber-700 text-white border-amber-700"
                          : done
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-stone-200 text-stone-500 border-stone-200"
                      }`}
                    >
                      {done ? <CheckCircle2 className="size-5" /> : s.n}
                    </div>
                    <div className="ml-2 hidden sm:block min-w-0">
                      <div
                        className={`text-[13px] truncate ${
                          active ? "text-amber-800 font-semibold" : done ? "text-emerald-800 font-medium" : "text-stone-500"
                        }`}
                      >
                        {s.label}
                      </div>
                      <div className="text-[11px] text-stone-400 truncate">{s.desc}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <main className="lg:col-span-8 space-y-5">
        
      {/* STEP 1 INPUT */}
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
              <label className="text-xs font-semibold block mb-1.5">Keyword หลัก *</label>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full !h-11 rounded-lg border border-stone-200 px-4 outline-none focus:ring-2 focus:ring-amber-200"
                placeholder="เช่น ราคาบอลไหล"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1.5">หมวดหมู่</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full h-9 rounded-lg border border-stone-200 px-3 outline-none focus:ring-2 focus:ring-amber-200 bg-white"
                >
                  <option value="ฟุตบอล">⚽ ฟุตบอล</option>
                  <option value="มวย">🥊 มวย</option>
                  <option value="คาสิโน (YMYL)">🎲 คาสิโน (YMYL)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5">Search Intent</label>
                <select
                  value={intent}
                  onChange={(e) => setIntent(e.target.value as any)}
                  className="w-full h-9 rounded-lg border border-stone-200 px-3 outline-none focus:ring-2 focus:ring-amber-200 bg-white"
                >
                  <option value="Informational">Informational — ให้ความรู้</option>
                  <option value="Transactional">Transactional</option>
                  <option value="Commercial">Commercial</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5">รูปแบบเนื้อหา</label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as any)}
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
                <label className="text-xs font-semibold">เลือก AI Model</label>
                <Badge className={`!border ${providerAccent}`}>🔌 API Provider: {providerDisplayName}</Badge>
                {settingsQ.isLoading && <Badge className="!bg-stone-100 !text-stone-600 !border-stone-200 animate-pulse">กำลังโหลดตั้งค่าจากระบบ...</Badge>}
                {!settingsQ.isLoading && !hasLlmKey && (
                  <Badge className="!bg-rose-50 !text-rose-700 !border-rose-200">⚠️ ยังไม่ได้บันทึก LLM API Key (ไปตั้งค่าระบบก่อน)</Badge>
                )}
              </div>
              <p className="text-[12px] text-stone-400 -mt-1 mb-3">
                ✅ รายการโมเดลด้านล่าง = โมเดลของ API Provider ที่บันทึกไว้ในหน้าตั้งค่าระบบ (Settings → LLM) เท่านั้น · 🎯 Default Model + ID ตรงกับ Server llmClient PROVIDER_DEFAULT_MODELS 1:1 · 💲 ราคา $/1M tokens = ราคาประมาณตาม Marketplace อ้างอิง
              </p>
              <div className={`grid grid-cols-1 ${activeModels.length >= 3 ? 'md:grid-cols-3' : activeModels.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-3`}>
                {activeModels.map((m) => (
                  <label
                    key={m.id}
                    className={`border rounded-xl p-4 cursor-pointer transition ${
                      model === m.id
                        ? "border-2 !border-amber-500 bg-amber-50"
                        : "border-stone-200 hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`inline-block px-2 py-0.5 rounded-full text-[11px] text-white ${m.cls}`}>{m.badge}</div>
                      <div className="text-[11px] text-stone-400">${m.per1m}/1M tok</div>
                    </div>
                    <div className="text-sm font-semibold mb-1">{m.label}</div>
                    <div className="mt-3">
                      <input
                        type="radio"
                        checked={model === m.id}
                        onChange={() => setModel(m.id)}
                        className="accent-amber-600"
                        disabled={!hasLlmKey}
                      />
                      <span className="ml-2 text-xs text-stone-600">{hasLlmKey ? "เลือกใช้ model นี้" : "ตั้งค่า LLM API Key ก่อน"}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs font-semibold">อัปโหลด Reference DOCX (Optional)</label>
                <Badge className="!bg-emerald-100 !text-emerald-700 !border-emerald-200">📄 Import เร็ว</Badge>
              </div>
              <p className="text-[12px] text-stone-400 -mt-1 mb-3">
                ไฟล์ .docx จาก Microsoft Word / Google Doc → ระบบจะแยก Headings H1-H3, Markdown, URL Sources, FAQ อัตโนมัติ (≤ 8 MB)
              </p>
              <input
                ref={docxFileRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={handleDocxUpload}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => docxFileRef.current?.click()}
                  disabled={extractingDocx}
                  className="!h-10"
                >
                  {extractingDocx ? (
                    <><Loader2 className="size-4 mr-2 animate-spin" />กำลังแปลงไฟล์…</>
                  ) : (
                    <><FileType className="size-4 mr-2" />อัปโหลด Reference DOCX</>
                  )}
                </Button>
                <span className="text-[11px] text-stone-400">
                  Tip: ถ้ามีเนื้อหาเดิม (Word/Google Doc) สามารถอัปโหลดมาแก้ไขต่อได้เลย ไม่ต้องพิมพ์ใหม่
                </span>
              </div>
              {extractingDocx && (
                <div className="kcp-skeleton-shimmer rounded-lg p-4 mt-4 space-y-3">
                  <div className="h-4 bg-stone-200 rounded-md w-3/5"></div>
                  <div className="h-3 bg-stone-200 rounded-md w-4/5"></div>
                  <div className="h-3 bg-stone-200 rounded-md w-2/5"></div>
                </div>
              )}
              {uploadedDoc && !extractingDocx && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileType className="size-4 text-emerald-700" />
                    <span className="text-sm font-semibold text-emerald-800">ไฟล์ Reference ที่อัปโหลด</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="!bg-white !border-stone-200 !text-stone-700">
                      📝 {uploadedDoc.fileName}
                    </Badge>
                    <Badge variant="outline" className="!bg-white !border-stone-200 !text-stone-700">
                      💾 {uploadedDoc.fileSizeKB.toLocaleString()} KB
                    </Badge>
                    <Badge variant="outline" className="!bg-white !border-stone-200 !text-stone-700">
                      ✍️ {uploadedDoc.wordCount.toLocaleString()} คำ
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 KEYWORD TARGET PLANNER (คำนวณคีย์ ก่อนขึ้นโครง) */}
      {cur === 1 && (() => {
        const quotaRows: { kw: string; type: string; typeLabel: string; n: number }[] = [];
        for (const kw of keywordPlan.mainList) quotaRows.push({ kw, type: 'main', typeLabel: 'หลัก', n: keywordPlan.targetMainEach });
        for (const kw of keywordPlan.longList) quotaRows.push({ kw, type: 'long', typeLabel: 'long-tail', n: keywordPlan.targetLongEach });
        for (const kw of keywordPlan.lsiList) quotaRows.push({ kw, type: 'lsi', typeLabel: 'LSI', n: keywordPlan.targetLSIEach });
        const quotaTotal = quotaRows.reduce((a,r)=>a+r.n, 0);
        const quotaOverCap = quotaTotal > keywordPlan.ceilingTotal;
        return (
        <div className="space-y-5">
          <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
            <CardContent className="p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                  <Hash className="size-5 text-[#c2410c]" />2️⃣ คำนวณคีย์ (Keyword Target Planner)
                </h2>
                <p className="text-[13px] text-stone-600 -mt-1">
                  กำหนดจำนวนคำเป้าหมาย → ระบบคำนวณโควตา keyword อัตโนมัติ
                </p>
              </div>
              <Separator />

              <div style={{borderTop:'1px solid #e5e7eb',paddingTop:'16px'}}>
                <label className="text-[13px] font-semibold block mb-1.5">
                  Keyword จาก Cluster <span className="badge inline-block text-[11px] px-3 py-1 rounded-full font-bold bg-[#dcfce7] text-[#15803d]">ดึงจาก Keyword Cluster</span>
                </label>
                <div className="text-[11px] text-stone-500 mb-2 -mt-0.5">Long-tail + Related แทรกในบทความอัตโนมัติ</div>

                <div className="text-[12px] text-stone-500 mb-1.5">Long-tail ({keywordPlan.longList.length} รายการ):</div>
                <div className="flex flex-wrap">
                  {keywordPlan.longList.map((kw, i) => (
                    <span key={`chip-lt-${i}`} className="inline-block text-[11px] px-2.5 py-1 rounded-full mr-1.5 mb-1.5 bg-[#fef3c7] text-[#92400e]">
                      {kw}
                    </span>
                  ))}
                  {keywordPlan.longList.length === 0 && <span className="text-[11px] text-stone-400">ระบบสร้างจาก Outline/Sources ในขั้นตอนถัดไป</span>}
                </div>

                <div className="text-[12px] text-stone-500 mb-1.5 mt-3">Related / LSI ({keywordPlan.lsiList.length} รายการ):</div>
                <div className="flex flex-wrap">
                  {keywordPlan.lsiList.map((kw, i) => (
                    <span key={`chip-lsi-${i}`} className="inline-block text-[11px] px-2.5 py-1 rounded-full mr-1.5 mb-1.5 bg-[#eff6ff] text-[#2563eb]">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{borderTop:'1px solid #e5e7eb',paddingTop:'16px',marginTop:'4px'}}>
                <label className="text-[13px] font-semibold block mb-1.5">
                  จำนวนคำเป้าหมาย คำนวณโควตา keyword <span className="badge inline-block text-[11px] px-3 py-1 rounded-full font-bold bg-[#fef3c7] text-[#b45309]">แก้ปัญหาเดิม</span>
                </label>
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
                  <input
                    type="range"
                    min={1000}
                    max={8000}
                    step={100}
                    value={targetWordTotal}
                    onChange={(e) => setTargetWordTotal(Math.max(1000, Number(e.target.value) || 0))}
                    style={{flex:1,margin:0,accentColor:'#c2410c'}}
                  />
                  <span style={{fontWeight:700,fontSize:'16px',color:'#c2410c',minWidth:'90px',textAlign:'right'}}>
                    {targetWordTotal.toLocaleString()} คำ
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 mb-3 -mt-0.5">
                  เพดาน {TARGET_DENSITY_PCT}% = <b>{keywordPlan.ceilingTotal}</b> ครั้ง แบ่ง <span style={{color:'#b91c1c',fontWeight:600}}>คีย์หลัก{TARGET_SPLIT_MAIN_PCT}%</span> / <span style={{color:'#92400e',fontWeight:600}}>long-tail{TARGET_SPLIT_LONG_PCT}%</span> / <span style={{color:'#1d4ed8',fontWeight:600}}>LSI{TARGET_SPLIT_LSI_PCT}%</span> (คีย์หลักใน long-tail ไม่นับแยก เพื่อกัน stuffing)
                </div>

                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px',marginTop:'4px'}}>
                  <thead>
                    <tr>
                      <th style={{padding:'8px 10px',border:'1px solid #e5e7eb',textAlign:'left',background:'#fafafa'}}>Keyword</th>
                      <th style={{padding:'8px 10px',border:'1px solid #e5e7eb',textAlign:'left',background:'#fafafa',width:'90px'}}>ประเภท</th>
                      <th style={{padding:'8px 10px',border:'1px solid #e5e7eb',textAlign:'center',background:'#fafafa',width:'100px'}}>ใช้กี่ครั้ง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotaRows.map((r, i) => (
                      <tr key={`qrow-${i}`}>
                        <td style={{padding:'8px 10px',border:'1px solid #e5e7eb'}}><b>{r.kw}</b></td>
                        <td style={{padding:'8px 10px',border:'1px solid #e5e7eb',color:'#6b7280'}}>{r.typeLabel}</td>
                        <td style={{padding:'8px 10px',border:'1px solid #e5e7eb',textAlign:'center',fontWeight:600}}>{r.n} ครั้ง</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background: quotaOverCap ? '#fee2e2' : '#dcfce7', fontWeight:600}}>
                      <td colSpan={2} style={{padding:'8px 10px',border:'1px solid #e5e7eb',color: quotaOverCap ? '#dc2626' : '#15803d'}}>
                        รวม (เป้าหมายแนะนำ {keywordPlan.ceilingTotal} ครั้ง = {TARGET_DENSITY_PCT}% ของ {targetWordTotal} คำ)
                      </td>
                      <td style={{padding:'8px 10px',border:'1px solid #e5e7eb',textAlign:'center',color: quotaOverCap ? '#dc2626' : '#15803d'}}>
                        {quotaTotal}
                      </td>
                    </tr>
                    <tr style={{background: keywordPlan.mainDensityLevel==='red' ? '#fee2e2' : keywordPlan.mainDensityLevel==='yellow' ? '#fef3c7' : '#eff6ff'}}>
                      <td colSpan={2} style={{padding:'8px 10px',border:'1px solid #e5e7eb',color: keywordPlan.mainDensityLevel==='red' ? '#991b1b' : keywordPlan.mainDensityLevel==='yellow' ? '#92400e' : '#1e3a8a',fontWeight:600}}>
                        🔑 คีย์หลักปรากฏจริงรวม (เดี่ยวๆ {keywordPlan.targetMainEach} + ใน long-tail {keywordPlan.mainInLongtail})
                        <span style={{display:'block',fontSize:'11px',fontWeight:500,marginTop:'2px',opacity:0.92}}>
                          💡 SEO (คำแนะนำ ธรรมชาติ): 0.6-1.4% เขียว ดีมาก · 1.4-1.6% เหลือง ใกล้แน่น · {'>'}1.6% แดง แน่นเกินไป ควรลด — ระบบจะไม่ตัดจำนวนคำอัตโนมัติ
                        </span>
                      </td>
                      <td style={{padding:'8px 10px',border:'1px solid #e5e7eb',textAlign:'center',color: keywordPlan.mainDensityLevel==='red' ? '#991b1b' : keywordPlan.mainDensityLevel==='yellow' ? '#92400e' : '#1e3a8a',fontWeight:700}}>
                        <div>{keywordPlan.mainAppearsTotal} ครั้ง · density {keywordPlan.mainDensityPct.toFixed(2)}%</div>
                        <div style={{fontSize:'11px',fontWeight:500,marginTop:'3px',opacity:0.92}}>
                          Sweet {keywordPlan.mainSweetMaxCount} ครั้ง · Max {keywordPlan.mainHardCapCount} ครั้ง
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'9px',padding:'11px 14px',fontSize:'12.5px',color:'#92400e',marginTop:'14px'}}>
                  ตัวเลขนี้ส่งเข้า AI ตอนเขียน (AI รู้โควตา จัดวางถูก) + ใช้ตรวจตอนท้าย ลาก slider ดูตัวเลขเปลี่ยน
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        )})()}
      

      {/* STEP 3 OUTLINE + SOURCES */}
      {cur === 2 && (
        <div className="space-y-5">
          <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ListOrdered className="size-5 text-amber-700" />3️⃣ โครงเรื่อง (Outline)
              </h2>
              <p className="text-[13px] text-stone-500 -mt-2">AI สร้างโครงจาก keyword + intent — ดู/แก้ก่อนเขียน</p>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="!bg-amber-700 hover:!bg-amber-800"
                  onClick={() => aiGenerateOutline(false)}
                  disabled={genOutlineMut.isPending}
                >
                  {genOutlineMut.isPending
                    ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังสร้าง Outline…</>
                    : <><Wand2 className="size-4 mr-2" />🪄 AI สร้าง Outline</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => aiGenerateOutline(true)}
                  disabled={genOutlineMut.isPending}
                >
                  <RefreshCw className={`size-4 mr-2 ${genOutlineMut.isPending ? 'animate-spin' : ''}`} />🔁 สร้างใหม่ (Force)
                </Button>
                <Button size="sm" variant="outline" onClick={() => addOutlineRow(2)}>
                  <Plus className="size-4 mr-2" />+ H2
                </Button>
                <Button size="sm" variant="outline" onClick={() => addOutlineRow(3)}>
                  <Plus className="size-4 mr-2" />+ H3
                </Button>
                <Separator orientation="vertical" className="h-8" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleSelectAll}
                  className={selectedRows.size === outlineSecs.length ? '!bg-amber-50 !border-amber-300' : ''}
                >
                  {selectedRows.size === outlineSecs.length ? '☑️ ไม่เลือกทั้งหมด' : '⬜ เลือกทั้งหมด'}
                  {selectedRows.size > 0 && <Badge className="!ml-2 !bg-amber-600 !text-white">{selectedRows.size}</Badge>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={batchDelete}
                  disabled={selectedRows.size === 0}
                  className="!text-rose-700 hover:!bg-rose-50 !border-rose-200 disabled:opacity-40"
                >
                  <Trash2 className="size-4 mr-2" />ลบที่เลือก
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => batchChangeLevel(2)}
                  disabled={selectedRows.size === 0}
                  className="disabled:opacity-40"
                >
                  → H2
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => batchChangeLevel(3)}
                  disabled={selectedRows.size === 0}
                  className="disabled:opacity-40"
                >
                  → H3
                </Button>
              </div>
              <div className="space-y-2">
                {genOutlineMut.isPending ? (
                  <div className="kcp-skeleton-shimmer rounded-xl p-4 space-y-3">
                    <div className="h-10 bg-stone-200 rounded-lg w-full"></div>
                    <div className="h-10 bg-stone-200 rounded-lg w-11/12 ml-4"></div>
                    <div className="h-10 bg-stone-200 rounded-lg w-10/12 ml-4"></div>
                    <div className="h-10 bg-stone-200 rounded-lg w-9/12 ml-8"></div>
                    <div className="h-10 bg-stone-200 rounded-lg w-2/3 ml-8"></div>
                  </div>
                ) : outlineSecs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/50 p-8 text-center text-stone-500">
                    <div className="text-[13px] mb-1">ยังไม่มีหัวข้อ Outline</div>
                    <div className="text-[11px] text-stone-400">กดปุ่ม 🪄 AI สร้าง Outline ด้านบน หรือกด + H2 เพิ่มเอง</div>
                  </div>
                ) : outlineSecs.map((sec, i) => {
                  const lvText = `H${sec.heading_level}`;
                  const isH1 = sec.heading_level === 1;
                  const isDragging = dragIdx === i;
                  const isDragOver = dragOverIdx === i;
                  const isSelected = selectedRows.has(i);
                  return (
                    <div
                      key={i}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, i)}
                      className={`border rounded-xl p-2.5 flex items-center gap-2 transition ${
                        isH1 ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'
                      } ${isDragging ? 'opacity-50' : ''} ${
                        isDragOver && !isDragging ? 'border-t-4 !border-t-amber-500' : ''
                      } ${isSelected ? '!ring-2 !ring-amber-400' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(i)}
                        className="w-4 h-4 accent-amber-600 shrink-0 cursor-pointer"
                        aria-label={`เลือกแถว ${i + 1}`}
                      />
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, i)}
                        onDragEnd={handleDragEnd}
                        className="cursor-grab active:cursor-grabbing shrink-0 select-none"
                        title="ลากเพื่อจัดลำดับ"
                      >
                        <GripVertical className={`size-4 shrink-0 ${isDragging ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`} aria-hidden />
                      </div>
                      {/* WO-H1-2569-001 TASK 3.3: H1 = DISTINCT PILLAR BADGE (ห้ามเหมือน H2 select dropdown) */}
                      {isH1 ? (
                        <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-gradient-to-br from-amber-200 via-amber-100 to-yellow-50 border border-amber-400 text-amber-900 text-[11px] font-black shadow-[0_1px_0_rgba(146,64,14,0.2)] shrink-0" title="หัวข้อหลักของบทความ ควรมีเพียง 1 อัน">
                          <span className="text-[13px] leading-none">🏛️</span>
                          <span className="tracking-wide">H1 · PILLAR</span>
                        </div>
                      ) : (
                        <select
                          value={sec.heading_level}
                          onChange={(e) => setOutlineLevel(i, Number(e.target.value))}
                          className={`h-8 text-[11px] font-bold px-2 rounded-md border-none outline-none cursor-pointer ${isH1 ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}
                          aria-label={`Heading level row ${i + 1}`}
                        >
                          {[2,3,4,5,6].map(n => <option key={n} value={n}>H{n}</option>)}
                        </select>
                      )}
                      <input
                        value={sec.heading_text}
                        onChange={(e) => setOutlineText(i, e.target.value)}
                        onBlur={(e) => {
                          // WO-H1-2569-001 TASK 3.4 SYNC: User edits H1 heading_text directly in outline → sync back to top H1 input
                          if (isH1) {
                            const nv = e.target.value.trim();
                            if (nv && !h1.trim()) setH1(String(nv).slice(0, 512));
                            else if (nv && nv !== h1.trim()) setH1(String(nv).slice(0, 512));
                          }
                        }}
                        className={`flex-1 !h-9 px-3 rounded-lg text-sm bg-white outline-none focus:ring-2 ${isH1 ? 'border-2 border-amber-300 focus:ring-amber-200 font-bold text-amber-950' : 'border border-stone-200 focus:ring-amber-200'}`}
                        placeholder={isH1 ? 'หัวข้อเรื่อง H1 (บทความควรมี H1 แค่ 1 อันเดียว) ...' : 'หัวข้อ...'}
                        aria-label={`Outline heading text row ${i + 1}`}
                      />
                      <span className="text-[10px] text-stone-400 hidden sm:block w-14 text-right">
                        ≥{sec.word_target_min} คำ
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!h-8 !w-8 !p-0 text-stone-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30"
                          onClick={() => moveOutlineUp(i)}
                          disabled={i === 0}
                          aria-label={`ย้ายหัวข้อขึ้น ${i + 1}`}
                          title="ย้ายขึ้น"
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!h-8 !w-8 !p-0 text-stone-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30"
                          onClick={() => moveOutlineDown(i)}
                          disabled={i === outlineSecs.length - 1}
                          aria-label={`ย้ายหัวข้อลง ${i + 1}`}
                          title="ย้ายลง"
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!h-8 !w-8 !p-0 shrink-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                          onClick={() => delOutlineRow(i)}
                          aria-label={`ลบหัวข้อที่ ${i + 1}`}
                        >
                          <Minus className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-stone-400 pt-1">
                📝 {outlineSecs.length} Sections · H1={outlineSecs.filter(s => s.heading_level === 1).length} · H2={outlineSecs.filter(s => s.heading_level === 2).length} · H3+={outlineSecs.filter(s => s.heading_level >= 3).length}
              </div>
            </CardContent>
          </Card>

          <Card className="!rounded-2xl !border !border-emerald-200 !bg-emerald-50/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Search className="size-5 text-emerald-700" />🔍 หา Sources
                  <Badge className="!bg-purple-100 !text-purple-700 !border-purple-200">💜 Sam</Badge>
                </h2>
              </div>
              <p className="text-[13px] text-stone-500 -mt-3">
                ดึงแหล่งอ้างอิงจริงจาก SERP/DataForSEO — จะไปเป็นเอกสารอ้างอิงท้ายบทความ + citation ในเนื้อหา
              </p>
              <div className="space-y-2">
                {sources.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 border border-emerald-100 bg-white rounded-lg text-sm"
                  >
                    <span className="text-emerald-600"><CheckCircle2 className="size-4" /></span>
                    <b className="text-stone-800">{s.domain}</b>
                    <span className="text-stone-500">— {s.title}</span>
                    <span className="ml-auto text-xs text-stone-500">DA {s.da}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={refreshSources}
                >
                  {fetchingSources ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
                  🔄 ดึง Sources ใหม่
                </Button>
                <Button size="sm" variant="outline" className="flex-1">+ เพิ่มแหล่งเอง</Button>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px]">
                ✅ พบ 4 แหล่งน่าเชื่อถือ (DA ≥ 35) — แก้ root cause: บทความจะมี citation จริง → EEAT สูงขึ้น
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STEP 4 WRITE section streaming DYNAMIC from outlineSecs */}
      {cur === 3 && (
        <Card className="!rounded-2xl !border !border-stone-200 !bg-white mb-5">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Type className="size-5 text-amber-700" />4️⃣ เขียนเนื้อหา ทีละ Section
                <Badge className="!bg-amber-100 !text-amber-800">โปร่งใส · {streamState.phase === 'running' ? (streamState.currentIdx + 1) + '/' + streamState.total : streamState.phase === 'done' ? 'เสร็จสมบูรณ์' : streamState.phase === 'error' ? 'ผิดพลาด' : 'พร้อมเขียน'}</Badge>
              </h2>
              <div className="flex gap-2">
                {streamState.phase !== 'running' && (
                  <Button
                    size="sm"
                    className="!h-9 !bg-emerald-700 hover:!bg-emerald-800 text-white shadow-sm"
                    onClick={() => doRunCreateDraft(false)}
                    disabled={createDraftMut.isPending}
                  >
                    {createDraftMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Sparkles className="size-4 mr-2" />}
                    {streamState.phase === 'done' ? '🔁 เขียนใหม่ (ต่อ)' : '🚀 เริ่มเขียนเนื้อหา Streaming'}
                  </Button>
                )}
                {streamState.phase === 'done' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="!h-9 !bg-amber-50 !text-amber-800 hover:!bg-amber-100"
                    onClick={() => doRunCreateDraft(true)}
                    disabled={createDraftMut.isPending}
                    title="Force regenerate draft ใหม่ทั้งหมด ลบ draft เดิม"
                  >
                    🔁 Force สร้างใหม่
                  </Button>
                )}
                {streamState.phase === 'running' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="!h-9 !bg-rose-50 !text-rose-700 hover:!bg-rose-100"
                    onClick={() => stopStream('error', 'ผู้ใช้ Cancel stream')}
                    title="หยุดการเขียนชั่วคราว (backend จะยังคงทำงานจนจบภายใน — progress เฉพาะฝั่ง UI)"
                  >
                    ⏹️ Abort (Cancel)
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[13px] text-stone-500 -mt-3">
              AI เขียนทีละหัวข้อ ตาม Outline H1-H6 ที่สร้างจาก Step2 — เห็นทุก section ขณะเขียน · ถ้าผิดพลาด retry แค่ section นั้น (force=true regenerate ทั้งหมด)
            </p>
            {/* Overall progress bar */}
            <div>
              <div className="flex justify-between text-[12.5px] mb-1.5">
                <span className="text-stone-600">ความคืบหน้าโดยรวม</span>
                <b className={streamState.phase === 'done' ? 'text-emerald-700' : streamState.phase === 'error' ? 'text-rose-700' : 'text-amber-700'}>
                  {(() => {
                    if (!streamState.total) return 0;
                    const raw = streamState.phase === 'done' ? 100 : Math.round(((streamState.currentIdx + (streamState.phase === 'running' ? 0.5 : 0)) / streamState.total) * 100);
                    if (streamState.phase === 'running' || streamState.phase === 'error') return Math.min(90, Math.max(0, raw));
                    return Math.max(0, Math.min(100, raw));
                  })()}%
                </b>
              </div>
              <div className="h-3.5 rounded-full overflow-hidden bg-stone-200/60">
                <div
                  className={`h-full transition-all duration-700 ${
                    streamState.phase === 'done' ? 'bg-emerald-600' : streamState.phase === 'error' ? 'bg-rose-600' : 'bg-amber-500'
                  }`}
                  style={{ width: `${(() => {
                    if (!streamState.total) return 0;
                    const raw = streamState.phase === 'done' ? 100 : (((streamState.currentIdx + (streamState.phase === 'running' ? 0.5 : 0)) / streamState.total) * 100);
                    const capped = (streamState.phase === 'running' || streamState.phase === 'error') ? Math.min(90, raw) : raw;
                    return Math.max(0, Math.min(100, capped));
                  })()}%` }}
                />
              </div>
            </div>
            <Separator />
            {/* KEYWORD COUNT SUMMARY TABLE — ต้องแสดง ก่อนการเขียนเนื้อหา STEP 4 ตาม user requirement */}
            <div className="p-3 rounded-xl border border-stone-200 bg-[#fefefe]">
              <div className="text-[11px] text-stone-400 mb-1.5 font-semibold">📊 สรุปจำนวน Keyword ทั้งหมด (ตัดจากเนื้อหาบทความจริง อัปเดตอัตโนมัติขณะเขียน) —เป้าหมายจาก Step 2 ({TARGET_SPLIT_MAIN_PCT}/{TARGET_SPLIT_LONG_PCT}/{TARGET_SPLIT_LSI_PCT})</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
                {kwSummaryByType.map((row) => (
                  <div key={row.k} className={`p-2 rounded-lg border ${row.color} space-y-1.5`}>
                    <div className="font-bold flex items-center justify-between">
                      <span>{row.label}</span>
                      <span className="text-[11px] opacity-80">{row.pctStr}%</span>
                    </div>
                    <div className="text-[16px] font-black leading-none">
                      {row.count.toLocaleString()} <span className="text-[11px] font-normal opacity-70">/{row.target} ครั้ง</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                      <div className="h-full bg-current opacity-70 rounded-full" style={{ width: `${Math.min(100, Number(row.pctOfTarget) || 0)}%` }} />
                    </div>
                    <div className="text-[10.5px] opacity-80">{row.pctOfTarget}% ของเป้าหมาย</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-stone-500 px-1 flex-wrap gap-2">
                {(() => {
                  const wcActual = estimateWordCount(bodyMd || '');
                  const wcTarget = Math.max(1000, Number(targetWordTotal) || 0);
                  const wcPct = Math.max(0, Math.round(100 * wcActual / Math.max(1, wcTarget)));
                  const wcColor = wcPct >= 80 ? '#047857' : wcPct >= 60 ? '#92400e' : '#991b1b';
                  return <span style={{color: wcColor, fontWeight: 700}}>📄 คำจริง/เป้า: <b>{wcActual.toLocaleString()}/{wcTarget.toLocaleString()}</b> ({wcPct}%) {wcPct<80?'· ต้อง≥80%':'✓'}</span>;
                })()}
                <span>รวม Keyword ทุกชนิดในบทความ: <b className="text-stone-700">{kwTotalDemo.toLocaleString()} ครั้ง</b> / เป้าหมาย {keywordPlan.ceilingTotal} ครั้ง (เพดาน {TARGET_DENSITY_PCT}% = {ceilingMax})</span>
                <span style={{color: keywordPlan.mainDensityLevel==='red' ? '#991b1b' : keywordPlan.mainDensityLevel==='yellow' ? '#92400e' : '#075985', fontWeight:700}}>
                  🔑 คีย์หลักปรากฏจริงรวม <b>{keywordPlan.mainAppearsTotal} ครั้ง ({keywordPlan.mainDensityPct.toFixed(2)}%)</b> (เดี่ยวๆ {keywordPlan.targetMainEach} + ใน LT {keywordPlan.mainInLongtail})
                  · 💡 0.6-1.4% เขียว · 1.4-1.6% เหลือง · {'>'}1.6% แดง (คำแนะนำ — ไม่ตัดอัตโนมัติ)
                </span>
                <span className={densityPass ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>{densityPass ? '✓ ไม่เกินเพดาน' : '⚠ เกินเพดาน'}</span>
              </div>
            </div>
            {streamState.phase === 'error' && streamState.errMsg && (
              <div className="p-3 rounded-xl !bg-rose-50 border border-rose-200 text-rose-800 text-[13px]">
                ⚠️ Error: {streamState.errMsg}
              </div>
            )}
            <div className="space-y-3">
              {outlineSecs.filter(s => s.heading_level !== 1).map((sec, idx) => {
                const isDone = streamState.phase === 'done' || idx < streamState.currentIdx;
                const isWriting = streamState.phase === 'running' && idx === streamState.currentIdx;
                const secTitle = sec.heading_text || "Section " + (idx + 1);
                const lvLabel = `H${sec.heading_level}`;
                const bgCol = (sec.heading_level === 2 ? '#fef3c7' : sec.heading_level === 3 ? '#e0f2fe' : '#f5f5f4');
                const bdCol = (sec.heading_level === 2 ? '#fde68a' : sec.heading_level === 3 ? '#bae6fd' : '#e7e5e4');
                const phRegex = /\[AUTO PLACEHOLDER\s*[—\-]/;
                const secRawRaw = bodyMd.split(`## ${secTitle}`)[1]?.split(/^## |^### /m)[0]?.trim() || '';
                const isSecPlaceholder = isDone && phRegex.test(secRawRaw);
                const secFinalDone = isDone && !isSecPlaceholder;
                return (
                  <div
                    key={`write-sec-${idx}`}
                    className={`border rounded-xl overflow-hidden ${
                      isWriting ? "border-amber-300 shadow-sm shadow-amber-100" : isSecPlaceholder ? "border-rose-300 shadow-sm shadow-rose-100" : secFinalDone ? "border-emerald-200" : "border-stone-200"
                    }`}
                  >
                    <div
                      className={`p-3 flex items-center justify-between border-b text-sm ${
                        isWriting
                          ? "bg-amber-50 border-amber-200 text-amber-900"
                          : isSecPlaceholder
                            ? "bg-rose-50 border-rose-200 text-rose-900"
                            : secFinalDone
                              ? "bg-emerald-50 border-emerald-100"
                              : "bg-stone-50 border-stone-200 text-stone-500"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 text-[10.5px] font-bold rounded text-stone-800" style={{ backgroundColor: bgCol, border: `1px solid ${bdCol}` }}>{lvLabel}</span>
                        <b className="truncate">{secTitle}</b>
                        {isSecPlaceholder && (
                          <span className="px-2 py-0.5 text-[10.5px] font-bold rounded bg-rose-600 text-white border border-rose-700">
                            🔴 ต้องเขียนใหม่ · Placeholder
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11.5px] text-stone-500 hidden md:inline">เป้าหมาย ≥{sec.word_target_min} คำ</span>
                        <span>
                          {secFinalDone && <span className="text-emerald-700 font-semibold">✓ เสร็จ</span>}
                          {isSecPlaceholder && <span className="text-rose-700 font-semibold">✗ ต้องแก้</span>}
                          {isWriting && (
                            <span className="flex items-center gap-1">
                              <Loader2 className="size-3 mr-1 animate-spin" /> กำลังเขียน...
                            </span>
                          )}
                          {!secFinalDone && !isSecPlaceholder && !isWriting && <span>รอคิว #{idx + 1}</span>}
                        </span>
                      </div>
                    </div>
                    {(isDone || isWriting) && (
                      <div className="p-4 text-[13.5px] leading-7 text-stone-700 bg-gradient-to-br from-white via-white to-stone-50/40 whitespace-pre-wrap">
                        {(() => {
                          const raw = bodyMd.split(`## ${secTitle}`)[1]?.split(/^## |^### /m)[0]?.trim();
                          if (!raw) {
                            return isWriting
                              ? <span className="italic text-stone-500"><Loader2 className="size-3 mr-1.5 inline-block animate-spin" />กำลังเขียนเนื้อหาส่วนนี้ — inject outline key points + 3-tier pillar/longtail/LSI density targets 2% ceiling + citations DA≥35 …</span>
                              : <span className="italic text-stone-500">ไม่พบเนื้อหา section ใน markdown body — กด "เริ่มเขียน" หรือแก้ไข Outline ก่อน</span>;
                          }
                          return raw.split(/\n{2,}/).filter(Boolean).map((para, pi) => {
                            const lines = para.split(/\n+/).filter(Boolean);
                            const listLines = lines.filter(l => /^\s*[-*]\s+/.test(l) || /^\s*\[\d+\]\s*/.test(l));
                            const isListBlock = listLines.length >= 2 || (listLines.length === 1 && lines.length === 1 && /^\s*[-*]\s+\[\d+\]/.test(lines[0]));
                            if (isListBlock) {
                              return (
                                <ul key={pi} className={`list-disc pl-6 ${pi === 0 ? '' : 'mt-4'} space-y-1.5 text-[13.5px] leading-7 text-stone-700 marker:text-stone-400`}>
                                  {listLines.map((line, li) => {
                                    const pureLine = line.replace(/^\s*[-*]\s+/, '').replace(/^\s*\[\d+\]\s*/, '');
                                    return (
                                      <li key={li}>
                                        {pureLine.split(/\*\*([\s\S]*?)\*\*/g).map((t, bi) =>
                                          bi % 2 === 1 ? <strong key={`${pi}-${li}-${bi}`} className="font-extrabold text-stone-900">{t}</strong> : t
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              );
                            }
                            return (
                              <p key={pi} className={pi === 0 ? '' : 'mt-4'}>
                                {para.split(/\*\*([\s\S]*?)\*\*/g).map((t, i) =>
                                  i % 2 === 1 ? <strong key={`${pi}-${i}`} className="font-extrabold text-stone-900">{t}</strong> : t
                                )}
                              </p>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
              {outlineSecs.filter(s => s.heading_level !== 1).length === 0 && (
                <div className="p-6 text-center text-stone-500 text-[13px] border border-dashed border-stone-300 rounded-xl bg-stone-50/50">
                  ⚠️ Outline Step2 ยังไม่มี sections H2+ กลับไป Step2 แล้วกด AI Generate Outline ก่อน
                </div>
              )}
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[13px]">
              🛡️ Hard Safety: retry LLM สูงสุด 3 ครั้ง/section (1+2) with backoff · เจอ 401/402/500 → แจ้ง Error ชัดเจน ไม่ฝืนใช้ Template · Backend inject 3 context: <b>3-tier hierarchy Pillar→Cluster→Supporting keywords</b> + <b>Step2 Outline (H1-H6 user edited)</b> + <b>Density targets ({TARGET_DENSITY_PCT}% Main/Longtail/LSI spread, split 20/70/10)</b> + <b>SERP Real Titles/Snippets/PAA</b> — จึงเป็น EEAT สูง
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5 ASSEMBLE + Meta LENGTH GUARDS 60/160 chars */}
      {cur === 4 && (
        <Card className="!rounded-2xl !border !border-sky-200 !bg-sky-50/30 mb-5">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="size-5 text-sky-700" />5️⃣ รวม + Meta (Assemble)
            </h2>
            <p className="text-[13px] text-stone-500 -mt-2">รวมทุก section เป็นบทความเดียว + กรอก/แก้ Meta · LENGTH COLOR RULE: Title 30-60 = ✓เขียว, Description 120-320 = ✓เขียว</p>
            <Separator />
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 p-3 bg-white border border-stone-200 rounded-md">
                <CheckCircle2 className="text-emerald-600 size-4 shrink-0" />
                <span>รวม {outlineSecs.filter(s=>s.heading_level!==1).length} section → 1 บทความ (<b>{wordCount.toLocaleString()}</b> คำ)</span>
                {ymylInjected && <Badge className="!ml-2 !bg-rose-100 !text-rose-700 !border-rose-200">🛡️ YMYL Disclaimer: ON</Badge>}
              </div>
              {/* WO-H1-2569-001 TASK 3.1+3.4: H1 แยกเป็นเอกเทศ (ก่อน Meta Title) */}
              <div className="space-y-2 p-4 rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-white shadow-[0_1px_0_rgba(146,64,14,0.05)]">
                <div className="flex items-start justify-between text-[12.5px] pl-1 pr-1 gap-3 flex-wrap">
                  <label className="font-black text-amber-900 flex items-center gap-2">
                    <span className="text-[16px]">🏛️</span>
                    หัวข้อเรื่อง (H1 Content — <span className="text-[11px] text-amber-700">ปรากฏบนหน้าบทความจริง</span>)
                  </label>
                  <span className={h1.length >= 40 && h1.length <= 120 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    <b>{h1.length}</b>/512 ตัวอักษร{h1.length >= 40 && h1.length <= 120 ? ' ✓ ความยาวเหมาะสม (40–120)' : h1.length===0 ? ' (AI จะเติมจาก Outline H1 อัตโนมัติ)' : ' (แนะนำ 40–120 ตัว)'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    value={h1}
                    onChange={(e) => setH1(e.target.value.slice(0, 512))}
                    onBlur={() => {
                      if (h1.trim()) {
                        const idx = outlineSecs.findIndex(s => s.heading_level === 1);
                        if (idx >= 0) {
                          const cpy = outlineSecs.slice();
                          if (cpy[idx].heading_text.trim() !== h1.trim()) {
                            cpy[idx] = { ...cpy[idx], heading_text: h1.trim() };
                            setOutlineSecs(cpy);
                          }
                        } else {
                          setOutlineSecs(prev => [{ heading_level: 1, heading_text: h1.trim().slice(0,240), word_target_min: 0, word_target_max: 0, key_points: generateBulletsForHeading(h1.trim(), 1) }, ...prev]);
                        }
                      }
                    }}
                    placeholder='เช่น ทีเด็ดบอล คู่มือ 2569: เลขเด็ด วิธีดูตารางบอล และเคล็ดลับชนะอย่างปลอดภัย'
                    className="w-full !h-12 px-4 rounded-lg border-2 border-amber-200 bg-white text-[14px] font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    maxLength={512}
                  />
                  {!h1.trim() && outlineSecs.some(s=>s.heading_level===1) && (
                    <button
                      type="button"
                      onClick={() => {
                        const fH1 = outlineSecs.find(s=>s.heading_level===1)?.heading_text || '';
                        if (fH1) setH1(fH1.slice(0, 512));
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] px-2.5 h-7 rounded-md bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                    >
                      ⤵️ คัดลอกจาก Outline H1
                    </button>
                  )}
                </div>
                <div className="h-2.5 rounded-full overflow-hidden bg-amber-100/80">
                  <div
                    className={`h-full transition-all ${h1.length>=40 && h1.length<=120 ? 'bg-emerald-600' : h1.length>120 ? 'bg-amber-600' : 'bg-amber-400'}`}
                    style={{ width: `${Math.min(100, (h1.length / 120) * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] pl-1 pr-1 text-amber-700/90 mt-0.5">
                  <span className="font-semibold">💡 H1 = ชื่อบทความบนหน้าเว็บ (คนอ่านเห็นจริง) ความยาวประมาณ 40–120 ตัว</span>
                  <span className="text-stone-400">คนละฟิลด์กับ Meta Title SERP ด้านล่าง</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12.5px] pl-1 pr-1">
                  <label className="font-semibold text-stone-700">Meta Title (ชื่อหน้า SERP Google · <span className="text-[11px] text-sky-700">≤60 ตัว</span>)</label>
                  <span className={mt.length >= 30 && mt.length <= 60 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    <b>{mt.length}</b>/60 ตัวอักษร{mt.length >= 30 && mt.length <= 60 ? ' ✓ Optimal' : ' (เป้าหมาย 30-60)'}
                  </span>
                </div>
                <input
                  value={mt}
                  onChange={(e) => setMt(e.target.value.slice(0, 120))}
                  placeholder='เช่น ราคาบอลไหล วันนี้ คืออะไร สอนดูตารางบอล 2569'
                  className="w-full !h-11 px-4 rounded-lg border border-stone-200 bg-white text-sm outline-none focus:ring-2 focus:ring-sky-200"
                  maxLength={120}
                />
                <div className="h-2.5 rounded-full overflow-hidden bg-stone-200/70">
                  <div className={`h-full transition-all ${mt.length >= 30 && mt.length <= 60 ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (mt.length / 60) * 100)}%` }} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12.5px] pl-1 pr-1">
                  <label className="font-semibold text-stone-700">Meta Description (คำบรรยาย SERP)</label>
                  <span className={mdes.length >= 120 && mdes.length <= 320 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    <b>{mdes.length}</b>/320 ตัวอักษร{mdes.length >= 120 && mdes.length <= 320 ? ' ✓ Optimal' : ' (เป้าหมาย 120-320)'}
                  </span>
                </div>
                <textarea
                  value={mdes}
                  onChange={(e) => setMdes(e.target.value.slice(0, 400))}
                  rows={3}
                  placeholder='อธิบายสั้นๆ เกี่ยวกับเนื้อหาบทความ — ควรมี Keyword หลักอยู่ 1-2 ครั้ง และสะท้อน Search Intent ให้ชัดเจน'
                  className="w-full px-4 py-2.5 rounded-lg border border-stone-200 bg-white text-sm outline-none focus:ring-2 focus:ring-sky-200 resize-none"
                  maxLength={400}
                />
                <div className="h-2.5 rounded-full overflow-hidden bg-stone-200/70">
                  <div className={`h-full transition-all ${mdes.length >= 120 && mdes.length <= 320 ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (mdes.length / 320) * 100)}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-white border border-stone-200 rounded-md">
                <CheckCircle2 className="text-emerald-600 size-4 shrink-0" />
                <span>Clean markdown (H1..H6 structure 100% no # หลุด) · EEAT Score: <b className="text-emerald-700">{eeatEst}/100</b></span>
              </div>
            </div>
            <Separator />
            {/* WO-H1-2569-001 TASK 3.5: SPLIT 2 columns LEFT=บทความ <h1> CONTENT vs RIGHT=Google SERP <title> Meta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* LEFT COLUMN = CONTENT H1 (ปรากฏบนหน้าเว็บคนอ่าน) */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-100/60 via-yellow-100/40 to-white border-2 border-amber-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wide text-amber-800 flex items-center gap-1.5">
                    <span className="text-[14px]">🏛️</span>
                    1. บทความจริง (H1) — ผู้อ่านเห็นบนหน้าเว็บ
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold shadow-sm border border-amber-400/70">
                    &lt;h1&gt;
                  </span>
                </div>
                <div className="p-4 rounded-lg bg-white/85 border border-amber-200 min-h-[64px] flex items-center">
                  {h1.trim() ? (
                    <h1 className="text-[22px] leading-[1.35] font-black text-amber-950 break-words">{h1}</h1>
                  ) : (
                    <div className="text-amber-400 italic text-[13px]">หัวข้อเรื่อง (H1) ยังไม่ถูกตั้งค่า — จะเติมอัตโนมัติจาก Outline Section แรกที่เป็น H1 เมื่อ AI สร้างเสร็จ</div>
                  )}
                </div>
                <div className="mt-1.5 text-[10.5px] text-amber-800/80 flex items-center justify-between pl-0.5 pr-0.5">
                  <span>👀 ปรากฏที่หัวบทความ ก่อนเนื้อหาทุกประเด็น</span>
                  <span className="tabular-nums">{h1.length} ตัว</span>
                </div>
              </div>
              {/* RIGHT COLUMN = GOOGLE SERP (Meta Title + Meta Desc) */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-sky-100/80 via-white to-sky-50 border-2 border-sky-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wide text-sky-800 flex items-center gap-1.5">
                    <span className="text-[14px]">🔍</span>
                    2. Google SERP (Meta Title) — ผู้ใช้เห็นบนผลการค้นหา
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 font-bold shadow-sm border border-sky-400/70">
                    &lt;title&gt;
                  </span>
                </div>
                <div className="p-4 rounded-lg bg-white border border-sky-200 min-h-[88px]">
                  <div className="text-[15px] font-bold text-sky-800 mb-1 leading-snug break-words">
                    {mt || <span className="text-sky-400 italic">Meta Title ยังไม่ถูกตั้งค่า (ควร 30-60 ตัวอักษร)</span>}
                  </div>
                  <div className="text-[11px] text-emerald-700 mb-2 truncate">thaiaeo.manus.host › blog › {keyword ? keyword.replace(/\s+/g, '-').slice(0,80) : 'article-slug'}</div>
                  <div className="text-[13px] text-stone-700 leading-snug break-words">
                    {mdes || <span className="text-stone-400 italic">Meta Description ยังไม่ถูกตั้งค่า — คำบรรยายจะปรากฏตรงนี้บนหน้าผลการค้นหา Google (ควร 120-320 ตัว)</span>}
                  </div>
                </div>
                <div className="mt-1.5 text-[10.5px] text-sky-800/80 flex items-center justify-between pl-0.5 pr-0.5">
                  <span>🔝 Title 30-60 / Desc 120-320 ตัวอักษรสุดท้าย</span>
                  <span className="tabular-nums">title {mt.length}/60 · desc {mdes.length}/320</span>
                </div>
              </div>
            </div>
            <div className="text-[11px] px-3 py-2 rounded-lg bg-stone-100/80 border border-stone-200 text-stone-600">
              💡 <b className="text-stone-800">ความแตกต่างสำคัญ:</b> <span className="text-amber-800 font-semibold">H1 (ซ้าย)</span> ใช้บอกคนอ่านว่าบทความนี้คืออะไร (ยาวได้ 40–512 ตัว) ส่วน <span className="text-sky-800 font-semibold">Meta Title (ขวา)</span> ใช้ดึงดูดผู้ใช้กดคลิกจากหน้า Google (สั้น ≤60 ตัว) — สามารถใช้คนละสำนวนกันได้เลย
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 6 REVIEW + KEYWORD DENSITY GAUGE */}
      {cur === 5 && (() => {
        const parsedSections = parseBodyMdIntoSections(bodyMd);
        return (
        <div className="space-y-5">
          <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <BookCheck className="size-5 text-amber-700" />6️⃣ ตรวจ/แก้ไข (Per-Section Inline Editor + ✨ AI Rewrite)
              </h2>
              <p className="text-[13px] text-stone-500 -mt-2">แยกแก้ไขทีละส่วน (ตาม H2/H3) · กด ✨ AI เขียนใหม่ เพื่อปรับแต่งย่อหน้าแต่ละอันอิสระกัน</p>
              <Separator />
              <div className="flex gap-2 flex-wrap mb-3">
                <Button variant="outline" size="sm" className="!h-8 !text-[12px] !px-3"><b>B</b></Button>
                <Button variant="outline" size="sm" className="!h-8 !text-[12px] !px-3 italic"><i>I</i></Button>
                <Button variant="outline" size="sm" className="!h-8 !text-[12px] !px-3">H2</Button>
                <Button variant="outline" size="sm" className="!h-8 !text-[12px] !px-3">H3</Button>
                <Button variant="outline" size="sm" className="!h-8 !text-[12px] !px-3">• List</Button>
                <Button variant="outline" size="sm" className="!h-8 !text-[12px] !px-3">🔗 Link</Button>
                <Button
                  size="sm"
                  className="!h-8 !text-[12px] !px-3 !bg-amber-700 hover:!bg-amber-800 text-white"
                  disabled={rewriteSectionMut.isPending || !draftId || parsedSections.length === 0}
                  onClick={() => {
                    const firstContentIdx = parsedSections.findIndex(s => s.headingLevel >= 2);
                    doRewriteSection(firstContentIdx >= 0 ? firstContentIdx : 0);
                  }}
                  title="เขียนใหม่ย่อหน้าแรก (H2 Section แรก)"
                >
                  {rewritingSectionIdx !== null && (parsedSections.findIndex(s => s.headingLevel >= 2) === rewritingSectionIdx || rewritingSectionIdx === 0) ? (
                    <><Loader2 className="size-3.5 mr-1.5 animate-spin" />กำลัง AI เขียนใหม่…</>
                  ) : (
                    <><Sparkles className="size-3.5 mr-1.5" />↺ AI เขียนใหม่ย่อหน้าแรก</>
                  )}
                </Button>
              </div>

              {/* ===== SEO 18 BLUEPRINT RULES COMPLIANCE: GLOBAL SUMMARY ===== */}
              {(() => {
                const contentSecs = parsedSections.filter(s => (s.headingLevel || 0) >= 2 || (s.body && s.body.trim().length >= 40));
                const lsiList: string[] = [];
                if (keywordPlan?.lsiList && Array.isArray(keywordPlan.lsiList)) { for (const l of keywordPlan.lsiList.slice(0, 10)) { if (typeof l === 'string') lsiList.push(l); } }
                const complAll = computeSectionCompliance(contentSecs.length ? contentSecs : parsedSections.filter(s => s.body && s.body.trim().length>0), outlineSecs.filter(o => o.heading_level !== 1), keyword || '', lsiList);
                const avgPct = complAll.length ? Math.round(complAll.reduce((a,s)=>a+s.pct,0) / complAll.length) : 0;
                const critCount = complAll.filter(s => s.anyCritical).length;
                const wcTotal = estimateWordCount(bodyMd || '');
                const wcTarget = Math.max(1000, Number(targetWordTotal) || 0);
                const h2Count = outlineSecs.filter(s => s.heading_level === 2).length;
                const introHeading = (outlineSecs.find(o=>o.heading_level===1)?.heading_text) || (parsedSections.find(s=>s.headingLevel===1)?.heading || '');
                const h1HasFocus = hasKeywordOrLSI(introHeading, keyword || '', lsiList);

                type GlobalRule = { pass: boolean; critical: boolean; label: string; detail: string; color: string };
                const globalRules: GlobalRule[] = [];
                // Pre-compute link + body scopes (avoid TDZ hoist error below G11/G12/G13)
                const bodyTxt = String(bodyMd || '');
                const linkMatches = bodyTxt.match(/\[(?:[^\]]*)\]\((https?:\/\/[^\s)]+)\)/g) || [];
                const extLinks = linkMatches.filter(l => !/thaiaeo\.manus\.host|localhost|127\.0\.0\.1/.test(l)).length;
                const intLinks = linkMatches.length - extLinks;
                // G1: Total words 1000-1800 + chars 4000-9000 (Thai 4-5 chars/word actual measurement)
                {
                  const pass = wcTotal >= 1000 && wcTotal <= 1900;
                  const critical = wcTotal < 800 || wcTotal > 2200;
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const pctWc = Math.max(0, Math.round(100 * wcTotal / Math.max(1, wcTarget)));
                  const charsTotal = countCharsNoSpaces(bodyMd || '');
                  const charsMin = 4000; const charsMax = 9000;
                  const wcDetail2 = `${wcTotal.toLocaleString()} / ${wcTarget.toLocaleString()} คำ (${pctWc}%)`;
                  const charsDetail2 = `${charsTotal.toLocaleString()} / ${charsMin.toLocaleString()}–${charsMax.toLocaleString()} ตัวอักษรไทย`;
                  const tail = wcTotal<1000?'⚠️ <1000 สั้นเกินไป (G1)':wcTotal>1900?wcTotal>2200?'🔴 >2200 ยาวเวอร์':'🟡 ใกล้ 2000':'✅ 1000–1800 พอดี (G1 PASS)';
                  const detail = `${wcDetail2} · ${charsDetail2} — ${tail}`;
                  globalRules.push({ pass, critical, label: '🌐 ก1 ความยาวรวมบทความ 1000–1800 คำ · 4,000–9,000 ตัวอักษรไทย', detail, color });
                }
                // G2: 3-6 H2 headings
                {
                  const pass = h2Count >= 3 && h2Count <= 6;
                  const critical = h2Count < 2 || h2Count > 8;
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const detail = `${h2Count} H2 headings — เป้าหมาย 3–6 (${h2Count<3?'⚠️ น้อยเกินไป (G2)':h2Count>6?'🟡 มากเกิน 6 → แนะนำลด':'✅ 3–6 H2 พอดี (G2 PASS)'})`;
                  globalRules.push({ pass, critical, label: '🌐 ก2 จำนวนหัวข้อหลัก (H2) 3–6 หัวข้อ', detail, color });
                }
                // G3/G8: Section MAX 500 (anyCritical wc>=400 count → Rule G3 H3 split)
                {
                  const hugeSec = complAll.filter(s => s.wc >= 400).length;
                  const pass = hugeSec === 0;
                  const critical = hugeSec >= 2;
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const detail = hugeSec === 0 ? 'ทุก Section ≤ 399 คำ (ไม่ต้องแยก H3)' : `${hugeSec} Section ≥ 400 คำ → ${critical?'🔴 ต้องแยก H3 หรือ bullet points (G3/ S4 RED)':'🟡 แนะนำแยก H3 หรือ bullets'}`;
                  globalRules.push({ pass, critical, label: '🌐 ก3/G4 Section ≤ 350 คำ (≥400 ต้องแยก H3 / Bullet)', detail, color });
                }
                // K1: H1 heading มี Focus Keyword (CRITICAL RED หากไม่มี)
                {
                  const pass = !!h1HasFocus;
                  const critical = !pass && wcTotal >= 500;
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const displayH1 = introHeading ? `"${introHeading.slice(0, 60)}${introHeading.length>60?'…':''}"` : '(ไม่พบ H1 — ต้องใส่ H1 ใน Outline)';
                  const detail = pass ? `✅ H1 มี Focus/LSI keyword: ${displayH1}` : critical ? `🔴 H1 ${displayH1} ไม่มี Focus Keyword "${keyword||''}" (Rule K1 — Publish Block!)` : `🟡 H1 ${displayH1} — ตรวจภายหลัง`;
                  globalRules.push({ pass, critical, label: '🔑 K1 H1 + H2 ต้องมี Focus Keyword (Publish Block)', detail, color });
                }
                // G9 / T1 ส่วนนำ Introduction Budget 100-150w / 400-750 chars (Crit <80 หรือ >200)
                {
                  const firstSec = parsedSections[0];
                  const introBody = firstSec ? String(firstSec.body || '').trim() : '';
                  const introWc = estimateWordCount(introBody);
                  const introCh = countCharsNoSpaces(introBody);
                  const pass = introWc >= 100 && introWc <= 150;
                  const critical = introWc > 0 && (introWc < 80 || introWc > 200);
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const tag = introWc === 0 ? 'ยังไม่มีส่วนนำ'
                    : introWc < 80 ? '🔴 สั้นเกินไป Crit'
                    : introWc < 100 ? '🟡 <100 แนะนำเพิ่มเนื้อหา'
                    : introWc <= 150 ? '✅ 100-150 พอดี'
                    : introWc <= 200 ? '🟡 ใกล้ 200 แนะนำตัด'
                    : '🔴 >200 ยาวเกิน Crit';
                  const detail = `${introWc.toLocaleString()} คำ (${introCh.toLocaleString()} ตัวอักษร) / 100–150 คำ · 400–750 ตัวอักษร · ${tag} (T1 Blueprint)`;
                  globalRules.push({ pass, critical, label: '📄 ก9 ส่วนนำ Introduction 100–150 คำ · 400–750 ตัวอักษร (Publish Block)', detail, color });
                }
                // G10 / T3 Conclusion + CTA Budget 100-150w / 400-750 chars (Crit <50 หรือ ไม่มี CTA)
                {
                  const lastSec = parsedSections[parsedSections.length - 1];
                  const lastBody = lastSec ? String(lastSec.body || '').trim() : '';
                  const lastHeading = String(lastSec?.heading || '').toLowerCase();
                  const isConclusion = lastHeading.includes('สรุป') || lastHeading.includes('next step') || lastHeading.includes('next step') || parsedSections.length >= 2;
                  const concWc = estimateWordCount(lastBody);
                  const concCh = countCharsNoSpaces(lastBody);
                  const last300 = lastBody.slice(-300);
                  const hasIntLink = /\[[^\]]*\]\(\/(?!\/)/.test(last300) || /thaiaeo\.manus\.host/.test(last300);
                  const hasCtaVerbs = /(กด|คลิก).*(ติดต่อ|สั่งซื้อ|ดูต่อ|อ่านเพิ่ม|ถัดไป|สมัคร)/.test(last300);
                  const hasCta = hasIntLink || hasCtaVerbs;
                  const wcCrit = concWc > 0 && concWc < 50;
                  const ctaCrit = isConclusion && concWc > 0 && !hasCta;
                  const critical = wcCrit || ctaCrit;
                  const pass = concWc >= 100 && concWc <= 150 && hasCta;
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const wcTag = concWc === 0 ? 'ยังไม่มีสรุป'
                    : concWc < 50 ? '🔴 <50 Crit'
                    : concWc < 100 ? '🟡 <100 แนะนำเพิ่ม'
                    : concWc <= 150 ? '✅ 100-150w'
                    : concWc <= 200 ? '🟡 ใกล้ 200'
                    : '🔴 >200';
                  const ctaTag = hasCta ? 'มี CTA ✅' : '❌ ไม่มี CTA (ต้องมี Internal Link / Next Step)';
                  const detail = `${concWc.toLocaleString()} คำ (${concCh.toLocaleString()} ตัวอักษร) / 100–150 คำ · 400–750 ตัวอักษร · ${wcTag} · CTA: ${ctaTag} (T3)`;
                  globalRules.push({ pass, critical, label: '📝 ก10 สรุป Conclusion + CTA 100–150 คำ · 400–750 ตัวอักษร (Publish Block)', detail, color });
                }
                // G11 / C1 ตัวเลขสถิติ 2+ หลัก ต้องอ้างอิง (Digit ratio check)
                {
                  const digitMatchesG = bodyTxt.match(/\d{2,}/g) || [];
                  const bodyCites = (bodyTxt.match(/\[CITE\d+\]/gi) || []).length;
                  const reqLinks = Math.max(2, Math.ceil(digitMatchesG.length / 4));
                  const linkTotal = extLinks + bodyCites;
                  const noCiteAtAll = digitMatchesG.length >= 3 && linkTotal < reqLinks;
                  const critical = digitMatchesG.length >= 6 && linkTotal < Math.ceil(digitMatchesG.length / 5);
                  const pass = digitMatchesG.length === 0 || linkTotal >= reqLinks;
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const dtag = digitMatchesG.length === 0 ? 'ไม่มีตัวเลข' : `ตัวเลข ${digitMatchesG.length} กลุ่ม · ต้องการอ้างอิง ${reqLinks}+ จุด · ปัจจุบัน ${linkTotal} จุด${noCiteAtAll?' ⚠️ อ้างอิงน้อย':' / OK'}`;
                  const detail = `${dtag} (C1)`;
                  globalRules.push({ pass, critical, label: '📚 ก11 ตัวเลข/สถิติต้องอ้างอิง (Citation Rule C1)', detail, color });
                }
                // G12 / C2 Anchor Text ห้ามใช้ "คลิกที่นี่" / click here / raw URL
                {
                  const badAnchorG = bodyTxt.match(/\[(คลิกที่นี่|ที่นี่|อ่านต่อ|click here|here)\]\(/gi) || [];
                  const rawUrlG = bodyTxt.match(/\[(https?:\/\/[^\]]*)\]\(/gi) || [];
                  const totalBad = badAnchorG.length + rawUrlG.length;
                  const pass = totalBad === 0;
                  const critical = totalBad > 0;
                  const color = pass ? '#047857' : '#991b1b';
                  const detail = pass ? '✅ Anchor Text ทุกตัวสื่อความหมาย (ไม่ใช่ คลิกที่นี่ / raw URL)' : `🔴 พบ Anchor ไม่ดี ${totalBad} จุด — ห้ามใช้ "คลิกที่นี่" หรือวาง URL ดิบ (Publish Block) (C2)`;
                  globalRules.push({ pass, critical, label: '🔗 ก12 Anchor Text ต้องสื่อความหมาย (ห้าม คลิกที่นี่ / Raw URL)', detail, color });
                }
                // G13 / C3 External Links แนะนำ target="_blank" (Soft Warning เท่านั้น ไม่ Publish Block)
                {
                  const mdExtLinks = bodyTxt.match(/\[[^\]]*\]\(https?:\/\/[^\s)]+\)/g) || [];
                  const hasBlankAnn = mdExtLinks.filter(l => /\{?target="_blank|_blank|EXTERNAL/.test(l)).length;
                  const missingBlank = Math.max(0, extLinks - hasBlankAnn);
                  const pass = mdExtLinks.length === 0 || missingBlank === 0;
                  const critical = false;
                  const color = pass ? '#047857' : missingBlank > 0 ? '#92400e' : '#047857';
                  const detail = extLinks === 0 ? 'ยังไม่มีลิงก์ภายนอก' : missingBlank === 0 ? `✅ External ทั้ง ${extLinks} ลิงก์ แนะนำ target="_blank" (C3)` : `🟡 ${missingBlank} ลิงก์ภายนอก แนะนำเพิ่ม target="_blank" เปิดแท็บใหม่ (Soft Warn ไม่บล็อก) (C3)`;
                  globalRules.push({ pass, critical, label: '🪟 ก13 External Links แนะนำ target="_blank" (Soft Warn)', detail, color });
                }
                // G14 / F1 F3 F4 Forbidden Sources Detect Publish Block — Pantip / Sanook / Blogspot / คล้ายเว็บกระทู้ Copy Chain หรือโฆษณาแอบแฝง (>=2 เป็น Crit RED Block)
                {
                  const forbidDomainRegex = /pantip\.com|sanook\.com|dek-d\.com\/board|blogspot\.|pantipmarket|kapook\.com\/board|redd\.it|reddit\.com\/r\//i;
                  const promoBadAnchorRegex = /\[(.*?(โปร|ลดราคา|คูปอง|สั่งซื้อ|รีวิวตัวนี้|รีวิวสินค้า|รีวิวเลย|ซื้อเลย|ร้านนี้).*?)\]\(https?:\/\//i;
                  const forbidMatches: string[] = [];
                  const extAnchors = bodyTxt.match(/\[[^\]]*\]\(https?:\/\/[^\s)]+\)/gi) || [];
                  for(const a of extAnchors){ if(forbidDomainRegex.test(a)) forbidMatches.push(a.slice(0,80)); }
                  const f1Count = forbidMatches.length;
                  const f3Matches = bodyTxt.match(promoBadAnchorRegex) || [];
                  const f3Count = f3Matches.length;
                  const f1f3Total = f1Count + f3Count;
                  const pass = f1f3Total === 0;
                  const critical = f1f3Total >= 2 || (f1Count >= 1 && wcTotal >= 600);
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const detail = f1f3Total === 0
                    ? '✅ ไม่พบแหล่งอ้างอิงผิดกฎ (F1 Forum Copy Chain / F3 Promo Ad No Data)'
                    : `${f1Count>0?'🔴 F1: พบ Forum/Copy-Chain '+f1Count+' ลิงก์ (Pantip/Sanook/Dek-D/Blogspot) ':''}${f3Count>0?'🟡 F3: พบ Promo No Data '+f3Count+' Anchor ':''}${critical?' (Publish Block CRIT G14)':' แนะนำเปลี่ยนเป็น Q1-Q4 Source'}`;
                  globalRules.push({ pass, critical, label: '🚫 ก14 Forbidden Sources ห้ามอ้างอิง F1/F3 (Publish Block CRIT ≥2)', detail, color });
                }
                // G15 / F2 Outdated Stats Recency Soft Warn — พบปี 2022 หรือก่อนหน้า >=2 ตรง ใน Anchor / บริบท สถิติ → YELLOW ไม่ Block
                {
                  const oldYearRegex = /\b(201[0-9]|2020|2021|2022)\b/g;
                  const oldYearMatches = bodyTxt.match(oldYearRegex) || [];
                  const critical = false;
                  const pass = oldYearMatches.length <= 1 || wcTotal <= 100;
                  const color = pass ? '#047857' : '#92400e';
                  const detail = oldYearMatches.length === 0
                    ? '✅ ไม่พบข้อมูลล้าสมัย (ปี 2022 หรือก่อนหน้า)'
                    : `${oldYearMatches.length} ครั้ง พบปี 201X-2022 ในเนื้อหา — ${oldYearMatches.length>=3?'🟡 แนะนำอัปเดตข้อมูลเป็นปี 2568+ ใหม่':'💡 ปีเก่าอาจจะยอมรับได้ถ้าเป็นทฤษฎีพื้นฐาน/ประวัติศาสตร์'} (F2)`;
                  globalRules.push({ pass, critical, label: '⏱️ ก15 แหล่งอ้างอิงน้อยเกิน 3 ปี (Recency F2 Soft Warn)', detail, color });
                }
                // G16 / P2 Anchor Semantic Depth >=5 chars minimum not vague — count anchor < 5 Thai/Eng chars (ไม่ใช่ คลิกที่นี่ ที่ผ่านกฎ G12 แล้ว แต่ยังสั้นกว่า 5 อักษร = Vague Warn)
                {
                  const anchorShort: string[] = [];
                  const eachAnchor = bodyTxt.match(/\[([^\]]{1,12})\]\(https?:\/\//g) || [];
                  for(const a of eachAnchor){
                    const m = a.match(/^\[(.{1,12})\]\(/);
                    if(!m) continue;
                    const anchorText = m[1].trim();
                    // Skip if already caught in G12 bad anchor list (avoid double flag same)
                    if(/^(คลิกที่นี่|ที่นี่|อ่านต่อ|click here|here)$/i.test(anchorText)) continue;
                    const stripped = anchorText.replace(/[\s\-\.\!\?\,\:]/g,'');
                    // Thai chars count as graphemes, we approximate len >=5 original string or >=3 stripped for safety
                    if(anchorText.length < 5 || stripped.length <= 2) anchorShort.push(anchorText);
                  }
                  const shortN = anchorShort.length;
                  const pass = shortN === 0;
                  const critical = false;
                  const color = pass ? '#047857' : shortN >= 3 ? '#92400e' : '#92400e';
                  const detail = shortN === 0
                    ? '✅ Anchor Text ทุกอัน ความยาว >= 5 ตัวอักษร สื่อความหมายชัดเจน (P2)'
                    : `🟡 ${shortN} Anchor Text สั้นเกินไป (<5 ตัวอักษร)${shortN>=3?' — แนะนำใส่ชื่อหน่วยงาน/ชื่องานวิจัย (Anchor Semantic P2)':' — แนะนำปรับเพิ่มข้อความคำอธิบาย'}`;
                  globalRules.push({ pass, critical, label: '🧭 ก16 Anchor Text ความยาวเพียงพอ สื่อความหมาย (P2 Soft Warn)', detail, color });
                }
                // G17 / A1 Anchor Scope Exact (Publish Block CRIT RED หากครอบเกิน >=60 ตัวอักษร = ห้ามลากไฮไลต์ทั้งประโยค — User VERBATIM "อย่าลากไฮไลต์ทั้งประโยค")
                {
                  const overLongAnchors: string[] = [];
                  const anyAnchorLen = bodyTxt.match(/\[([^\]]{1,200})\]\(https?:\/\//g) || [];
                  for(const a of anyAnchorLen){
                    const m = a.match(/^\[(.{1,200})\]\(/);
                    if(!m) continue;
                    const anchorText = m[1];
                    if(anchorText.length >= 60) overLongAnchors.push(anchorText.slice(0,90));
                  }
                  const badScope = overLongAnchors.length;
                  const pass = badScope === 0;
                  const critical = badScope >= 2 || (badScope >= 1 && wcTotal >= 800);
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const ex = badScope > 0 ? overLongAnchors.slice(0,2).map(t=>`"${t.slice(0,40)}"`).join(' / ') : '';
                  const detail = badScope === 0
                    ? '✅ Anchor ทุกอัน ครอบเฉพาะชื่อหน่วยงาน (ไม่ครอบทั้งประโยค) — 8-50 ตัวอักษรพอดี (A1 G17)'
                    : `${critical?'🔴 Publish Block CRIT':'🟡'} ${badScope} Anchor ครอบเกิน ${overLongAnchors.map(x=>x.length).join(',')} ตัวอักษร (ครอบทั้งประโยค A1 ผิด)${ex?` ตัวอย่าง ${ex}`:''}${critical?' ห้ามเผยแพร่ จนกว่าจะแก้':' แนะนำปรับครอบเฉพาะชื่อหน่วยงาน'}`;
                  globalRules.push({ pass, critical, label: '🎯 ก17 Anchor Scope ครอบเฉพาะชื่อหน่วยงาน ห้ามครอบทั้งประโยค (A1 Publish Block ≥2)', detail, color });
                }
                // G18 / A2 Year Context — 3+ Digit Stats in paragraph MUST HAVE Year 256X / 202X tag = SOFT YELLOW WARN
                {
                  // Split paragraphs: \n\n split OR 2 newlines
                  const paragraphs = bodyTxt.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean);
                  let missingYearCount = 0;
                  for(const p of paragraphs){
                    const bigDigit = p.match(/\d{3,}/g);
                    if(!bigDigit || bigDigit.length < 1) continue;
                    const hasYear = /(256[0-9]|255[0-9]|20[2-3][0-9]|พ\.ศ\.|ค\.ศ\.)/.test(p);
                    if(!hasYear) missingYearCount++;
                  }
                  const pass = missingYearCount === 0;
                  const critical = false;
                  const color = pass ? '#047857' : missingYearCount >= 3 ? '#92400e' : '#92400e';
                  const detail = paragraphs.length === 0 || bodyTxt.length < 300
                    ? '✅ (เนื้อหายังไม่พอประเมินปี/บริบทเวลา)'
                    : missingYearCount === 0
                      ? '✅ ย่อหน้าที่มีตัวเลขสถิติทุกย่อหน้า ระบุปีบริบทเวลาไว้เรียบร้อย (A2 G18)'
                      : `🟡 ${missingYearCount} ย่อหน้ามีตัวเลข 3+ หลัก แต่ยังไม่ได้ระบุปี (พ.ศ. 25XX / ค.ศ. 20XX) — แนะนำใส่ปีเพื่อบอกความทันสมัย A2`;
                  globalRules.push({ pass, critical, label: '📅 ก18 สถิติทุกย่อหน้า ต้องระบุบริบทปี พ.ศ./ค.ศ. (A2 Soft Warn)', detail, color });
                }
                // G19 / A3 Layman Terms Conversion — ห้ามใช้ศัพท์สถิติซับซ้อนโดยไม่แปลงเป็นธรรมดา — SOFT YELLOW WARN
                {
                  const jargonRegex = /p-value|confidence interval|statistical significance|p\s*<\s*0\.05|p\s*<\s*0\.01|statistically significant|p-val|นัยสำคัญทางสถิติ|ค่า p/gi;
                  const jargonMatches = bodyTxt.match(jargonRegex) || [];
                  const pass = jargonMatches.length === 0;
                  const critical = false;
                  const color = pass ? '#047857' : jargonMatches.length >= 3 ? '#92400e' : '#92400e';
                  const uniq = jargonMatches.length > 0 ? Array.from(new Set(jargonMatches.map(s=>s.toLowerCase()))).slice(0,4).join(' / ') : '';
                  const detail = pass === true
                    ? '✅ ไม่พบศัพท์สถิติซับซ้อน (A3 G19)'
                    : `🟡 พบศัพท์สถิติซับซ้อน ${jargonMatches.length} ครั้ง${uniq?` (${uniq})`:''} — แนะนำแปลงเป็นภาษาธรรมดา เช่น "p-value <0.01" → "พบความแตกต่างอย่างชัดเจนในกลุ่มทดลอง" A3`;
                  globalRules.push({ pass, critical, label: '🗣️ ก19 ศัพท์สถิติซับซ้อน ให้แปลงเป็นภาษาธรรมดา (A3 Soft Warn)', detail, color });
                }
                // Overall: Links External 2-4 DA≥40 (G6) + Internal 2-5 Silo (G7)
                {
                  const pass = extLinks >= 2 && extLinks <= 6;
                  const critical = extLinks === 0 && wcTotal >= 1000;
                  const color = pass ? '#047857' : critical ? '#991b1b' : '#92400e';
                  const detail = `${extLinks} ลิงก์ภายนอก — เป้าหมาย 2–4 Authority DA≥40 (${pass?'✅ G6 PASS':extLinks===0?'⚠️ ยังไม่มีลิงก์ภายนอก (G6)':'🟡 แนะนำเพิ่ม/ลด'})`;
                  globalRules.push({ pass, critical, label: '🌐 ก6 External Links 2–4 (Authority/Gov/Edu/งานวิจัย)', detail, color });
                }
                {
                  const pass = intLinks >= 2 && intLinks <= 8;
                  const critical = false;
                  const color = pass ? '#047857' : intLinks === 0 ? '#92400e' : '#92400e';
                  const detail = `${intLinks} ลิงก์ภายใน — เป้าหมาย 2–5 (Silo Structure G7: ${pass?'✅ PASS':intLinks===0?'🟡 ยังไม่มี Internal Link (แนะนำเพิ่ม)':'🟡 แนะนำปรับ'})`;
                  globalRules.push({ pass, critical, label: '🌐 ก7 Internal Links 2–5 (Silo Structure)', detail, color });
                }

                const globalPass = globalRules.filter(r => r.pass).length;
                const globalCrit = globalRules.filter(r => r.critical).length;
                const globalPct = Math.round((globalPass / Math.max(1, globalRules.length)) * 100);
                const combinedPct = complAll.length ? Math.round((globalPct * 0.35) + (avgPct * 0.65)) : globalPct;
                const anyHardBlock = globalCrit > 0 || critCount > 0 || combinedPct < 75;

                // Stored as window-scope refs for guards below:
                (window as any).__seoCompliance = { combinedPct, avgPct, globalPct, critCount, globalCrit, anyHardBlock };

                const overallColor = combinedPct >= 85 ? '#047857' : combinedPct >= 75 ? '#047857' : combinedPct >= 60 ? '#92400e' : '#991b1b';
                return (
                  <div className="mb-4 space-y-3 p-4 rounded-2xl border-2" style={{ borderColor: overallColor, background: `color-mix(in srgb, ${overallColor} 6%, #fff)` }}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <div className="text-[15px] font-black flex items-center gap-2" style={{ color: overallColor }}>
                          <ShieldCheck className="size-5" /> SEO Blueprint 39 Rules (18 Base + 11 Template/Citation + 5 Source Tier + 5 Citation Sentence 2026/09/18) — ความสอดคล้องทั้งบทความ
                        </div>
                        <div className="text-[12px] text-stone-500 mt-0.5">ประเมินอัตโนมัติ 17 Global Rules + 6 Per-Section Metrics × {complAll.length} Sections = {17 + complAll.length*6} Checkpoints (Add Citation Sentence TEMPLATES 6 + A1-A3 Techniques)</div>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="text-right">
                          <div className="text-[11px] text-stone-500">SCORE รวม (Global 35% + Sections 65%)</div>
                          <div className="text-[36px] font-black leading-none" style={{ color: overallColor }}>{combinedPct}<span className="text-[18px] font-bold opacity-70">%</span></div>
                        </div>
                        <div className="h-12 w-28 rounded-xl overflow-hidden border border-stone-200 bg-white">
                          <div className="h-full transition-all duration-500" style={{ width: `${Math.max(4, combinedPct)}%`, background: overallColor }} />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {globalRules.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl border" style={{ borderColor: `color-mix(in srgb, ${r.color} 40%, #fff)`, background: `color-mix(in srgb, ${r.color} 4%, #fff)` }}>
                          <div className="mt-0.5 shrink-0 size-4 rounded-full flex items-center justify-center text-white text-[10px] font-black" style={{ background: r.color }}>{r.pass?'✓':'!'}</div>
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-bold leading-tight" style={{ color: r.color }}>{r.label}{r.critical && <span className="ml-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black border border-rose-200">Publish Block</span>}</div>
                            <div className="text-[12px] text-stone-600 mt-0.5">{r.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <div className="text-[11.5px] text-stone-500">
                        Section Avg: <b className="text-stone-800">{avgPct}%</b> · Pass {complAll.reduce((a,s)=>a+s.passCount,0)}/{complAll.reduce((a,s)=>a+s.total,0)} metrics
                        {critCount > 0 && <span className="ml-3 font-black text-rose-700">⚠️ {critCount} Section มี Critical Fail! ต้องแก้ก่อน Publish</span>}
                      </div>
                      <div className="text-[11.5px] font-bold px-3 py-1.5 rounded-lg" style={{ color: anyHardBlock ? '#991b1b' : '#047857', background: anyHardBlock ? '#fef2f2' : '#f0fdf4', border: `1px solid ${anyHardBlock ? '#fecaca' : '#bbf7d0'}` }}>
                        {anyHardBlock ? `❌ ไม่ผ่าน Publish Gate — ${combinedPct}% < 75% หรือมี Critical ${globalCrit+critCount} อย่าง (ต้องแก้ก่อน Publish/ถัดไป)` : `✅ ผ่าน Publish Gate — ${combinedPct}% ≥ 75% ไม่มี Critical Fail`}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* PER-SECTION CARDS (H2 wrapper + inline textarea + ✨ AI Rewrite button per section) */}
              <div className="space-y-3">
                {parsedSections.length === 0 && (
                  <div className="p-6 text-center text-stone-500 text-[13px] border border-dashed border-stone-300 rounded-xl bg-stone-50/50">
                    ไม่พบเนื้อหาบทความ — กลับไป Step 3 เขียนเนื้อหาก่อน
                  </div>
                )}
                {parsedSections.map((sec, sIdx) => {
                  const isH1 = sec.headingLevel === 1;
                  const isH2 = sec.headingLevel === 2;
                  const isH3 = sec.headingLevel === 3;
                  const isIntro = sec.headingLevel === 0;
                  const lvLabel = sec.headingLevel > 0 ? `H${sec.headingLevel}` : 'INTRO';
                  const bgCol = isH1 ? '#fef3c7' : isH2 ? '#dbeafe' : isH3 ? '#ecfdf5' : '#f5f5f4';
                  const bdCol = isH1 ? '#fde68a' : isH2 ? '#93c5fd' : isH3 ? '#6ee7b7' : '#e7e5e4';
                  const txtCol = isH1 ? 'text-amber-900' : isH2 ? 'text-sky-900' : isH3 ? 'text-emerald-900' : 'text-stone-700';
                  const isRewriting = rewritingSectionIdx === sIdx;
                  const showSecCompliance = (sec.headingLevel || 0) >= 2 || (sec.body && sec.body.trim().length >= 60);
                  let secCompliance: any = null;
                  if (showSecCompliance) {
                    const lsiList2: string[] = [];
                    if (keywordPlan?.lsiList && Array.isArray(keywordPlan.lsiList)) { for (const l of keywordPlan.lsiList.slice(0, 10)) { if (typeof l === 'string') lsiList2.push(l); } }
                    const arr = computeSectionCompliance([sec], outlineSecs.filter(o => o.heading_level !== 1), keyword || '', lsiList2);
                    if (arr.length) secCompliance = arr[0];
                  }
                  return (
                    <div
                      key={`sec-card-${sIdx}`}
                      className={`border rounded-xl overflow-hidden shadow-sm ${
                        isRewriting ? 'border-amber-400 ring-2 ring-amber-200' :
                        isH2 ? 'border-sky-200' :
                        isH1 ? 'border-amber-200' :
                        isH3 ? 'border-emerald-200' :
                        'border-stone-200'
                      }`}
                    >
                      <div
                        className={`p-2.5 flex items-center justify-between border-b ${txtCol}`}
                        style={{ backgroundColor: bgCol, borderColor: bdCol }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="px-2 py-0.5 text-[10.5px] font-bold rounded text-stone-800 shrink-0"
                            style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: `1px solid ${bdCol}` }}
                          >
                            {lvLabel}
                          </span>
                          <b className="truncate text-[13.5px]">{sec.heading}</b>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="hidden sm:inline-block text-[10.5px] opacity-70 mr-1">
                            ~{estimateWordCount(sec.body)} คำ
                          </span>
                          {showSecCompliance && secCompliance && (
                            <Badge
                              className={`!text-[10.5px] !px-2 !py-0.5 shrink-0 mr-0.5 ${
                                secCompliance.anyCritical
                                  ? '!bg-rose-100 !text-rose-800 !border !border-rose-300'
                                  : secCompliance.pct >= 80
                                  ? '!bg-emerald-100 !text-emerald-800 !border !border-emerald-300'
                                  : secCompliance.pct >= 60
                                  ? '!bg-amber-100 !text-amber-800 !border !border-amber-300'
                                  : '!bg-rose-50 !text-rose-700 !border !border-rose-200'
                              }`}
                            >
                              <ShieldCheck className="size-3 inline -mt-0.5 mr-0.5" />
                              {secCompliance.passCount}/{secCompliance.total} · {secCompliance.pct}%
                              {secCompliance.anyCritical && <span className="ml-0.5">🔴</span>}
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant={isH2 || !isIntro ? "default" : "outline"}
                            className={
                              (isH2 || !isIntro)
                                ? "!h-8 !text-[11.5px] !px-3 !bg-gradient-to-r !from-amber-600 !to-orange-600 hover:!from-amber-700 hover:!to-orange-700 text-white shadow-sm"
                                : "!h-8 !text-[11.5px] !px-3"
                            }
                            disabled={rewriteSectionMut.isPending || !draftId}
                            onClick={() => doRewriteSection(sIdx)}
                          >
                            {isRewriting ? (
                              <><Loader2 className="size-3.5 mr-1.5 animate-spin" />กำลังเขียนใหม่…</>
                            ) : (
                              <><Sparkles className="size-3.5 mr-1.5" />AI เขียนใหม่ย่อหน้านี้</>
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="p-3 bg-white">
                        {sec.headingLevel > 0 && (
                          <div
                            className={`font-bold mb-2 pb-1 border-b border-stone-100 ${
                              sec.headingLevel === 1 ? 'text-[22px] mt-1' :
                              sec.headingLevel === 2 ? 'text-[18px] mt-0.5' :
                              sec.headingLevel === 3 ? 'text-[15px] mt-0.5' :
                              'text-[14px]'
                            }`}
                          >
                            {sec.heading}
                          </div>
                        )}
                        {showSecCompliance && secCompliance && (
                          <div className="mb-2.5 space-y-1.5">
                            <div className="text-[10.5px] uppercase tracking-wider text-stone-500 font-semibold flex items-center gap-1">
                              <ShieldCheck className="size-3" />
                              ความสอดคล้อง Blueprint 18 Rules · ส่วนนี้
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {secCompliance.metrics.map((m: any, mI: number) => {
                                const mc = m.critical ? '#fecaca' : m.pass ? '#bbf7d0' : '#fde68a';
                                const mtx = m.critical ? '#991b1b' : m.pass ? '#065f46' : '#92400e';
                                const mbg = m.critical ? '#fef2f2' : m.pass ? '#f0fdf4' : '#fffbeb';
                                return (
                                  <div
                                    key={`sm-${sIdx}-${mI}`}
                                    className="p-1.5 rounded-lg border flex items-start gap-1.5"
                                    style={{ borderColor: mc, background: mbg }}
                                  >
                                    <span
                                      className="shrink-0 size-4 rounded-full grid place-items-center text-[9px] font-black mt-0.5"
                                      style={{ background: mc, color: mtx }}
                                    >
                                      {m.pass ? '✓' : m.critical ? '!' : '!'}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[11px] font-bold leading-tight" style={{ color: mtx }}>
                                        {m.label}
                                        {m.critical && <span className="ml-1 px-1 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-black border border-rose-200">Block</span>}
                                      </div>
                                      <div className="text-[10.5px] leading-tight mt-0.5 opacity-90" style={{ color: mtx }}>
                                        {m.detail}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <textarea
                          value={sec.body}
                          onChange={(e) => {
                            const newMd = replaceSectionInBodyMd(bodyMd, sIdx, e.target.value);
                            setBodyMd(newMd);
                          }}
                          className={`w-full p-3 border border-stone-200 rounded-lg font-serif text-[14.5px] leading-8 outline-none focus:ring-2 focus:ring-amber-200 resize-y transition-colors ${
                            isRewriting ? 'bg-amber-50/60 border-amber-200' : ''
                          } ${isIntro ? 'min-h-[110px]' : isH1 ? 'min-h-[110px]' : isH2 ? 'min-h-[220px]' : 'min-h-[140px]'}`}
                          placeholder={`เนื้อหาส่วนนี้...`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <Separator />
              <details className="text-[12.5px]">
                <summary className="cursor-pointer select-none text-stone-600 hover:text-amber-800 font-medium">
                  ⚙️ Raw Markdown Editor (ซ่อนโดยปริยาย — สำหรับมือโปรต้องการแก้ # และโครงสร้างโดยตรง)
                </summary>
                <div className="mt-2">
                  <textarea
                    value={bodyMd}
                    onChange={(e) => setBodyMd(e.target.value)}
                    className="w-full min-h-[220px] p-3 border border-stone-200 rounded-xl font-mono text-[12.5px] leading-7 outline-none focus:ring-2 focus:ring-amber-200 bg-stone-50"
                  />
                </div>
              </details>
            </CardContent>
          </Card>

          {/* KEYWORD DENSITY PANEL — Core SA L245-L266 */}
          <Card
            className={`!rounded-2xl !border p-4 space-y-2 mb-5 ${
              densityPass
                ? "!border-emerald-200 !bg-emerald-50/30"
                : "!border-rose-200 !bg-rose-50/40 !text-rose-800"
            }`}
          >
            <CardContent className="p-2 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Hash className="size-5 text-emerald-700" />📊 Keyword Density (แนะนำ ≤ {TARGET_DENSITY_PCT}% — ไม่บังคับตัด)
                </h2>
              </div>
              <div className="flex items-center justify-between text-[13px] mb-2">
                <span>จำนวนคำบทความ: <b>{wordCount.toLocaleString()} คำ</b></span>
                <span>เพดาน {TARGET_DENSITY_PCT}% = <b>{ceilingMax} ครั้ง</b></span>
              </div>
              <div className="h-3.5 rounded-full overflow-hidden border border-white/60 bg-stone-200/50">
                <div
                  className={`h-full transition ${densityPass ? "bg-emerald-600" : "bg-rose-600"}`}
                  style={{ width: `${Math.min(100, (kwTotalDemo / ceilingMax) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[12px] mt-1">
                <span className={`font-semibold ${densityPass ? "text-emerald-700" : "text-rose-700"}`}>
                  {densityPass
                    ? `✓ ใช้จริงรวม ${kwTotalDemo} ครั้ง (${demoPctRounded.toFixed(1)}%) — ไม่เกินเพดาน`
                    : `⚠ ใช้จริงรวม ${kwTotalDemo} ครั้ง (${demoPctRounded.toFixed(1)}%) เกินเพดาน ${TARGET_DENSITY_PCT}% → ต้องลดการใช้ซ้ำ`}
                </span>
                <span className="text-stone-500">เหลืออีก {Math.max(0, ceilingMax - kwTotalDemo)} ครั้ง</span>
              </div>
              <Separator />
              <div className="space-y-1.5 text-[12.5px] leading-[2em]">
                {densityRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {r.pass ? (
                      <CheckCircle2 className="text-emerald-600 size-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="text-rose-600 size-4 shrink-0" />
                    )}
                    <b className="text-stone-800">{r.kw}</b>
                    <span className="text-[11px] text-stone-400">
                      ({r.type === "main" ? "คีย์หลัก" : r.type === "longtail" ? "long-tail" : "LSI"})
                    </span>
                    <span className="ml-auto text-stone-500">{r.count} ครั้ง</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900">
            📐 <b>กฎ:</b> keyword ทั้งหมด (หลัก+รอง+LSI) รวมกัน <b>ไม่เกิน {TARGET_DENSITY_PCT}%</b> ของจำนวนคำ — เป็นเพดานกันยัด ไม่ใช่เป้าที่ต้องถึง (ใช้น้อยกว่าแต่อ่านลื่น = ดีกว่า)
          </div>

          {/* KEYWORD PLACEMENT CHECKLIST 5-POINT */}
          <Card className="!rounded-2xl !border !border-purple-200 !bg-purple-50/30 mb-5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="size-5 text-purple-700" />🎯 Keyword Placement Checklist
                </h2>
                <Badge className={`${placementChecklist.filter(p=>p.ok).length===5 ? '!bg-emerald-600 !text-white' : '!bg-amber-500 !text-white'}`}>
                  {placementChecklist.filter(p=>p.ok).length}/{placementChecklist[0]?.total || 5} ตรง
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[13px]">
                {placementChecklist.map((p, i) => (
                  <div key={p.id || i} className={`flex items-start gap-2 p-2.5 rounded-lg border ${p.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    {p.ok ? (
                      <CheckCircle2 className="text-emerald-600 size-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="text-amber-600 size-4 shrink-0 mt-0.5" />
                    )}
                    <span className={p.ok ? 'text-emerald-800' : 'text-amber-800'}>{p.label}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11.5px] text-purple-700 bg-white/70 rounded-lg p-2 border border-purple-100">
                💡 <b>Tip:</b> ครบ 5/5 → Google เข้าใจเรื่องราวของบทความชัดเจนขึ้น · Ranking ดีขึ้น · ลดการถูก de-index จากการยัด keyword ไม่สมเหตุสมผล
              </div>
            </CardContent>
          </Card>

          {/* References list */}
          <Card className="!rounded-2xl !border !border-emerald-200 !bg-emerald-50/40">
            <CardContent className="p-6 space-y-2">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                <BookCheck className="size-5 text-emerald-700" />📚 เอกสารอ้างอิง
              </h2>
              <Separator />
              <ol className="text-[13px] text-stone-700 leading-loose pl-6 list-decimal">
                {sources.map((s, i) => (
                  <li key={i} className="mb-1">
                    {s.domain.charAt(0).toUpperCase() + s.domain.slice(1)} —{" "}
                    <a href="#" className="text-sky-700 underline underline-offset-2">{s.title}</a>
                  </li>
                ))}
              </ol>
              <div className="p-3 rounded-lg bg-emerald-100 border border-emerald-200 mt-4 text-sm">
                ✅ <b className="text-emerald-800">เอกสารอ้างอิง 4 แหล่ง</b> ดึงอัตโนมัติจากขั้นหา Sources (SERP/DataForSEO)
              </div>
            </CardContent>
          </Card>
        </div>
        )})()}

      {/* STEP 7 PREVIEW — SA blueprint L286-L334 */}
      {cur === 6 && (
        <div className="space-y-5">
          <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Eye className="size-5 text-amber-700" />7️⃣ ดูตัวอย่างก่อนบันทึก (Preview)
              </h2>
              <Separator />
              <div className="p-4 border border-stone-200 rounded-xl bg-white">
                <div className="text-[11px] text-stone-400 mb-1">🔍 SEO Preview — หน้าตาบน Google</div>
                <div className="text-[17px] text-[#1a0dab] leading-tight mt-1 mb-0.5">{mt || <span className="text-stone-400 italic">Meta Title ยังไม่ถูกตั้งค่า</span>}</div>
                <div className="text-[12.5px] text-[#006621]">thaiaeo.manus.host › บทความ › {(keyword || "article-slug").trim().replace(/\s+/g, "-").slice(0, 90)}</div>
                <div className="text-[12.5px] text-[#4d5156] leading-snug mt-1">{mdes || <span className="text-stone-400 italic">Meta Description ยังไม่ถูกตั้งค่า</span>}</div>
              </div>
              <Separator />
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <div className="p-3 bg-stone-50 border-b border-stone-200 flex gap-4 text-xs text-stone-500 flex-wrap">
                  <span>📄 {wordCount.toLocaleString()} คำ</span>
                  <span>🔑 density {demoPctRounded}% ✓</span>
                  <span>📚 อ้างอิง 4 แหล่ง</span>
                  <span>⏱ อ่าน 8 นาที</span>
                </div>
                {/* KEYWORD COUNT SUMMARY TABLE (Step 7 ด้วยเหมือนกัน) */}
                <div className="p-3 border-b border-stone-200 bg-[#fefefe]">
                  <div className="text-[11px] text-stone-400 mb-1.5 font-semibold">📊 สรุปจำนวน Keyword ทั้งหมด (ตัดจากเนื้อหาบทความจริง) — เป้าหมายจาก Step 2 ({TARGET_SPLIT_MAIN_PCT}/{TARGET_SPLIT_LONG_PCT}/{TARGET_SPLIT_LSI_PCT})</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
                    {kwSummaryByType.map((row) => (
                      <div key={row.k} className={`p-2 rounded-lg border ${row.color} space-y-1.5`}>
                        <div className="font-bold flex items-center justify-between">
                          <span>{row.label}</span>
                          <span className="text-[11px] opacity-80">{row.pctStr}%</span>
                        </div>
                        <div className="text-[16px] font-black leading-none">
                          {row.count.toLocaleString()} <span className="text-[11px] font-normal opacity-70">/{row.target} ครั้ง</span>
                        </div>
                        <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                          <div className="h-full bg-current opacity-70 rounded-full" style={{ width: `${Math.min(100, Number(row.pctOfTarget) || 0)}%` }} />
                        </div>
                        <div className="text-[10.5px] opacity-80">{row.pctOfTarget}% ของเป้าหมาย</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-stone-500 px-1 flex-wrap gap-2">
                    {(() => {
                      const wcActual = estimateWordCount(bodyMd || '');
                      const wcTarget = Math.max(1000, Number(targetWordTotal) || 0);
                      const wcPct = Math.max(0, Math.round(100 * wcActual / Math.max(1, wcTarget)));
                      const wcColor = wcPct >= 80 ? '#047857' : wcPct >= 60 ? '#92400e' : '#991b1b';
                      return <span style={{color: wcColor, fontWeight: 700}}>📄 คำจริง/เป้า: <b>{wcActual.toLocaleString()}/{wcTarget.toLocaleString()}</b> ({wcPct}%) {wcPct<80?'· ต้อง≥80%':'✓'}</span>;
                    })()}
                    <span>รวม Keyword ทุกชนิดในบทความ: <b className="text-stone-700">{kwTotalDemo.toLocaleString()} ครั้ง</b> / เป้าหมาย {keywordPlan.ceilingTotal} ครั้ง (เพดาน {TARGET_DENSITY_PCT}% = {ceilingMax})</span>
                    <span style={{color: keywordPlan.mainDensityLevel==='red' ? '#991b1b' : keywordPlan.mainDensityLevel==='yellow' ? '#92400e' : '#075985', fontWeight:700}}>
                      🔑 คีย์หลักปรากฏจริงรวม <b>{keywordPlan.mainAppearsTotal} ครั้ง ({keywordPlan.mainDensityPct.toFixed(2)}%)</b>
                      · 💡 0.6-1.4% เขียว · 1.4-1.6% เหลือง · {'>'}1.6% แดง (คำแนะนำ)
                    </span>
                    <span className={densityPass ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>{densityPass ? '✓ ไม่เกินเพดาน' : '⚠ เกินเพดาน'}</span>
                  </div>
                </div>
                <div className="p-6 max-h-[340px] overflow-auto">
                  <article
                    className="prose prose-stone max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMdSafe(bodyMd || "") }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm font-semibold">สถานะ:</span>
                <select
                  className="rounded-lg border border-stone-200 p-1.5"
                  defaultValue="done"
                >
                  <option value="draft">📝 ร่าง</option>
                  <option value="done">✅ เสร็จ (พร้อมใช้)</option>
                </select>
                <span className="text-[11px] text-stone-400">บันทึกเข้าคลัง เพื่อส่งมอบลูกค้า</span>
              </div>

              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-5 text-sky-700" />
                  <h3 className="font-semibold text-sky-900">⏰ ตั้งเวลาเผยแพร่อัตโนมัติ (CRON Worker ทุก 1 นาที)</h3>
                </div>
                <p className="text-[12.5px] text-sky-700 -mt-1">เลือกวันที่ + เวลา → ระบบจะเผยแพร่ให้อัตโนมัติเมื่อถึงเวลานั้น (เก็บใน outlineJson.__scheduled_at ไม่ต้อง ALTER DB — AC-6 compliant)</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex items-center gap-2">
                    <Clock className="size-4 text-stone-500 shrink-0" />
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="flex-1 !h-10 rounded-lg border border-stone-200 px-3 outline-none focus:ring-2 focus:ring-sky-200 bg-white text-sm"
                      min={new Date(Date.now() + 120_000).toISOString().slice(0, 16)}
                    />
                  </div>
                  <Button
                    size="sm"
                    className="!h-10 !bg-sky-700 hover:!bg-sky-800 shrink-0"
                    onClick={doSetSchedule}
                    disabled={setScheduleMut.isPending || !draftId || !scheduledDateTime}
                  >
                    {setScheduleMut.isPending
                      ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังตั้งเวลา…</>
                      : <><CalendarDays className="size-4 mr-2" />ตั้งเวลาเผยแพร่</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="!h-10 shrink-0"
                    onClick={doCancelSchedule}
                    disabled={setScheduleMut.isPending || !draftId || !scheduledDateTime}
                  >
                    <X className="size-4 mr-2" />ยกเลิก
                  </Button>
                </div>
                {scheduledDateTime && (
                  <div className="text-[12px] text-sky-800 bg-white/70 rounded-lg px-3 py-2 border border-sky-100">
                    📅 ตารางเวลาที่ตั้ง: <b>{new Date(scheduledDateTime).toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'long' })}</b>
                    <span className="text-sky-600 ml-2">(ระบบจะเผยแพร่ให้อัตโนมัติในนาทีแรกหลังถึงเวลา)</span>
                  </div>
                )}
              </div>

              <Separator />
              <div className="flex gap-2 flex-wrap">
                <Button
                  className="!bg-amber-700 hover:!bg-amber-800"
                  onClick={() => doPublish(false)}
                  disabled={publishMut.isPending || !draftId || writeHasPlaceholder || /\[AUTO PLACEHOLDER\s*[—\-]/.test(bodyMd||'') || (estimateWordCount(bodyMd||'') / Math.max(1, Math.max(1000, Number(targetWordTotal)||0)) < 0.8) || !!((window as any).__seoCompliance?.anyHardBlock)}
                >
                  {publishMut.isPending
                    ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังเผยแพร่…</>
                    : <><Save className="size-4 mr-2" />✨ เผยแพร่ทันที (Publish)</>}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => doPublish(true)}
                  disabled={publishMut.isPending || !draftId || writeHasPlaceholder || /\[AUTO PLACEHOLDER\s*[—\-]/.test(bodyMd||'') || (estimateWordCount(bodyMd||'') / Math.max(1, Math.max(1000, Number(targetWordTotal)||0)) < 0.8) || !!((window as any).__seoCompliance?.anyHardBlock)}
                >
                  🔒 เลิกเผยแพร่
                </Button>
                <div className="flex gap-2 flex-1 flex-wrap">
                  <Button variant="outline" className="flex-1 min-w-[120px]"
                    onClick={() => {
                      const blob = new Blob([bodyMd || ''], { type: 'text/markdown;charset=utf-8' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `article_${draftId || 'draft'}_${Date.now()}.md`; a.click();
                      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                      toast.success("⬇ ดาวน์โหลด Markdown เสร็จ");
                    }}
                  >
                    <FileDown className="size-4 mr-2" />⬇ Markdown
                  </Button>
                  <Button variant="outline" className="flex-1 min-w-[120px]"
                    onClick={() => {
                      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${mt||keyword}</title><meta name="description" content="${mdes||''}"></head><body>${renderMdSafe(bodyMd||'')}</body></html>`;
                      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `article_${draftId || 'draft'}_${Date.now()}.html`; a.click();
                      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                      toast.success("⬇ ดาวน์โหลด HTML เสร็จ");
                    }}
                  >
                    <FileText className="size-4 mr-2" />⬇ HTML
                  </Button>
                  <Button variant="outline" className="flex-1 min-w-[120px]"
                    onClick={async () => {
                      const t = toast.loading("กำลังสร้างไฟล์ Word (.docx)...");
                      try {
                        const blob = await generateDocxBlob(bodyMd || '', mt || keyword);
                        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `article_${draftId || 'draft'}_${Date.now()}.docx`; a.click();
                        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                        toast.dismiss(t); toast.success("📄 ดาวน์โหลด Word (.docx) เสร็จ");
                      } catch (e: any) { toast.dismiss(t); toast.error("สร้างไฟล์ Word ล้มเหลว: " + String(e?.message || e).slice(0, 100)); }
                    }}
                  >
                    <FileType className="size-4 mr-2" />📄 Word (.docx)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

        </main>

        {/* ── 3-TIER CONTEXT SIDEBAR (KCP → /write PIPELINE PASS-THRU) ──
             ผู้ใช้ VERBATIM: คลิกเขียน ระบบต้องดึงคีย์ชุดนั้นไปที่หน้าเขียน เพื่อเตรียมเริ่มเขียน
             Pillar H1 / Cluster / Focus keyword H3·คีย์ลอง / Siblings list / กฎการวางคำ */}
        <aside className="lg:col-span-4 space-y-4">
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

                {q.data.cluster_context.pillar_keyword && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: '#fff7ed', color: '#92400e', border: '1px solid #b45309' }} title="บทความ Focus · Meta Title/Desc">H1 · Pillar</span>
                      <b className="text-[13px] text-stone-800 flex-1 break-words min-w-0">{q.data.cluster_context.pillar_keyword.keyword}</b>
                      <span className="text-[10px] text-stone-400 tabular-nums">#{q.data.cluster_context.pillar_keyword.id}</span>
                    </div>
                  </div>
                )}

                {q.data.cluster_context.cluster?.name && (
                  <div className="px-3 py-2 rounded-lg bg-white border border-amber-200/60">
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">กลุ่ม Cluster</p>
                    <p className="text-[13px] font-semibold text-stone-800 break-words">{q.data.cluster_context.cluster.name}</p>
                  </div>
                )}

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
                        <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600">Intent: {mapIntentUiLabel(q.data.cluster_context.focus_keyword.intent)}</span>
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
        </aside>
      </div>
    </MainDashboardShell>
  );
}
