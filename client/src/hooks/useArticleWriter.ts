import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/trpc";
import { toast } from "sonner";

export type PreviewMode = 'editor' | 'split' | 'preview';
export type WriterStatus = 'idle' | 'saving' | 'saved' | 'publishing' | 'error';
export type StepStatusType = 'pending' | 'running' | 'done' | 'error';

export type OutlineRow = {
  heading_level: 1 | 2 | 3 | 4 | 5 | 6;
  heading_text: string;
  word_target_min: number;
  word_target_max: number;
  key_points: string[];
};

export type SourceRow = {
  domain: string;
  title: string;
  da: number;
  pass: boolean;
};

export type KwDensityRow = {
  kw: string;
  type: "main" | "longtail" | "LSI";
  count: number;
  pass: boolean;
};

type AIModelDef = { id: string; label: string; badge: string; cls: string; per1m: number };
type LLMProviderKey = "openrouter" | "openai" | "anthropic" | "google";

const PROVIDER_CATALOG: Record<LLMProviderKey, { name: string; accent: string; models: AIModelDef[]; defaultIdx: number }> = {
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
  anthropic: {
    name: "Anthropic Claude",
    accent: "!bg-amber-50 !border-amber-200 text-amber-800",
    defaultIdx: 0,
    models: [
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (ไทยดี สมดุล)", badge: "ค่าเริ่มต้น / แนะนำ", cls: "bg-amber-700", per1m: 3 },
      { id: "claude-3-opus-20240229",     label: "Claude 3 Opus (อันดับสูง สร้างสรรค์)", badge: "ระดับสูง", cls: "bg-orange-700", per1m: 15 },
    ],
  },
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

export function renderMdSafe(md: string): string {
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

/** Minimal Word-compatible HTML .doc blob fallback for Export Word button. */
export async function generateDocxBlob(md: string, title: string = ''): Promise<Blob> {
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${title || 'Article'}</title>` +
    `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->` +
    `<style>body{font-family:'Calibri',sans-serif;line-height:1.6}h1{font-size:22pt;margin:14pt 0;color:#0f172a}h2{font-size:16pt;margin:12pt 0;color:#1e293b}h3{font-size:14pt;margin:10pt 0}p{margin:8pt 0;font-size:11pt}blockquote{border-left:4pt solid #fb7185;background:#fff1f2;padding:8pt 12pt;color:#881337;margin:10pt 0}code{background:#f1f5f9;padding:2pt 4pt;border-radius:2pt;color:#be123c;font-size:10pt}pre{background:#f1f5f9;padding:10pt;border-radius:4pt;white-space:pre-wrap;font-size:10pt}li{margin:3pt 0}</style>` +
    `</head><body>` +
    (title ? `<h1 style="font-size:26pt;margin:18pt 0 8pt 0">${title}</h1><hr style="border:1pt solid #cbd5e1;margin:10pt 0"/>` : '') +
    renderMdSafe(md) +
    `</body></html>`;
  return new Blob(['\ufeff', html], { type: 'application/msword' });
}

export function useArticleWriter(props: { draftId: string | number | undefined }) {
  const draftIdNum = Number(props.draftId ?? 0) || 0;

  const [resetKeyState, setResetKeyState] = useState<number>(0);
  function resetKey() { setResetKeyState(k => k + 1); }

  const [title, setTitleState] = useState("");
  const [mt, setMtState] = useState("");
  const [md, setMdState] = useState("");
  const [mdes, setMdesState] = useState("");
  const [slug, setSlugState] = useState("");

  const [previewMode, setPreviewMode] = useState<PreviewMode>("editor");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<WriterStatus>("idle");
  const [stepStatus, setStepStatus] = useState<Record<number, StepStatusType>>({});

  const [h1, setH1State] = useState("");
  const [keyword, setKeywordState] = useState("");
  const [category, setCategoryState] = useState<any>("ฟุตบอล");
  const [intent, setIntentState] = useState<any>("Informational");
  const [contentType, setContentTypeState] = useState<any>("Knowledge");
  const [model, setModelState] = useState<string>(
    PROVIDER_CATALOG.openrouter.models[PROVIDER_CATALOG.openrouter.defaultIdx].id
  );
  const [targetWordTotal, setTargetWordTotal] = useState<number>(3500);
  const [outlineSecs, setOutlineSecs] = useState<OutlineRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [scheduledDateTime, setScheduledDateTime] = useState<string>("");
  const [writeHasPlaceholder, setWriteHasPlaceholder] = useState<boolean>(false);

  const saveTimerRef = useRef<any>(null);
  const dirtyRef = useRef(false);

  function scheduleAutoSave() {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!dirtyRef.current) return;
      void doSave(true);
    }, 1000 * 30);
  }

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  function setTitle(v: string) { setTitleState(v); scheduleAutoSave(); }
  function setMt(v: string) { setMtState(v); scheduleAutoSave(); }
  function setMd(v: string) { setMdState(v); scheduleAutoSave(); }
  function setMdes(v: string) { setMdesState(v); scheduleAutoSave(); }
  function setSlug(v: string) { setSlugState(v); scheduleAutoSave(); }
  function setH1(v: string) { setH1State(v); scheduleAutoSave(); }
  function setKeyword(v: string) { setKeywordState(v); scheduleAutoSave(); }
  function setCategory(v: any) { setCategoryState(v); scheduleAutoSave(); }
  function setIntent(v: any) { setIntentState(v); scheduleAutoSave(); }
  function setContentType(v: any) { setContentTypeState(v); scheduleAutoSave(); }
  function setModel(v: string) { setModelState(v); scheduleAutoSave(); }

  const wordCount = useMemo(() => {
    const txt = md + " " + keyword;
    const en = (txt.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0);
    const thai = (txt.match(/[\u0E00-\u0E7F]/g)?.length ?? 0);
    return en + Math.ceil(thai / 3);
  }, [md, keyword]);

  const charCount = useMemo(() => {
    const t = md || '';
    if (!t.length) return 0;
    return t.replace(/\s+/g, '').length;
  }, [md]);

  const ymylInjected = md.slice(0, 1200).includes("คำเตือนความเสี่ยงด้านการพนัน") || md.includes("Disclaimer") || md.includes("ความเสี่ยงทางการเงิน") || category === "คาสิโน (YMYL)";
  const eeatEst = Math.max(0, Math.min(100,
    20
    + (wordCount >= 1500 ? 20 : Math.floor((wordCount / 1500) * 20))
    + (ymylInjected ? 15 : 0)
    + (sources.length >= 3 ? 15 : 0)
    + (mt.length >= 30 && mt.length <= 120 ? 15 : 0)
    + (mdes.length >= 80 && mdes.length <= 320 ? 15 : 0)
  ));

  const seoScore = useMemo(() => {
    const kw = (keyword || "").trim();
    const mdBody = md || "";
    const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ci = (hay: string, ndl: string) => ndl ? new RegExp(safe, "i").test(hay) : false;
    let score = eeatEst;
    if (kw) {
      const h1Lines = mdBody.match(/^#\s+.+$/gm) || [];
      if (h1Lines.some(l => ci(l, kw))) score += 10;
      const intro100w = mdBody.slice(0, Math.min(1800, mdBody.length));
      if (ci(intro100w, kw)) score += 10;
      const h2Lines = mdBody.match(/^##\s+.+$/gm) || [];
      if (h2Lines.some(l => ci(l, kw))) score += 10;
      if (ci(mt || "", kw)) score += 10;
      if (ci(mdes || "", kw)) score += 10;
    }
    return Math.max(0, Math.min(100, score));
  }, [keyword, md, mt, mdes, eeatEst]);

  const stepProgress = useMemo(() => {
    const doneCount = Object.values(stepStatus).filter(s => s === 'done').length;
    const total = 7;
    return Math.round((doneCount / total) * 100);
  }, [stepStatus]);

  const allStepsDone = useMemo(() => {
    return [1, 2, 3, 4, 5, 6, 7].every(n => stepStatus[n] === 'done');
  }, [stepStatus]);

  function runStep(stepNum: number) {
    setStepStatus(prev => ({ ...prev, [stepNum]: 'running' }));
  }

  const q = trpc.write.getDraft.useQuery(
    { draftId: draftIdNum || 1 },
    {
      enabled: !!draftIdNum,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    }
  );

  const settingsQ = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const activeProvider = useMemo<LLMProviderKey>(() => {
    const raw = String((settingsQ.data?.settings as any)?.llmProvider || "openrouter").toLowerCase() as LLMProviderKey;
    return PROVIDER_CATALOG[raw] ? raw : "openrouter";
  }, [settingsQ.data?.settings?.llmProvider]);
  const activeModels = useMemo<AIModelDef[]>(() => PROVIDER_CATALOG[activeProvider].models, [activeProvider]);
  const providerAccent = useMemo<string>(() => PROVIDER_CATALOG[activeProvider].accent, [activeProvider]);
  const providerDisplayName = useMemo<string>(() => PROVIDER_CATALOG[activeProvider].name, [activeProvider]);
  const providerDefaultIdx = useMemo<number>(() => PROVIDER_CATALOG[activeProvider].defaultIdx ?? 0, [activeProvider]);
  const hasLlmKey = useMemo<boolean>(() => !!((settingsQ.data?.settings as any)?.hasLlmApiKey), [settingsQ.data?.settings?.hasLlmApiKey]);

  const saveMut = trpc.write.saveDraft.useMutation({
    onMutate: () => { setStatus('saving'); },
    onSuccess: (r: any) => {
      if (r?.ok) {
        dirtyRef.current = false;
        setSavedAt(new Date().toLocaleTimeString("th-TH"));
        setStatus('saved');
      } else {
        setStatus('error');
      }
    },
    onError: () => { setStatus('error'); },
  });

  const publishMut = trpc.write.publish.useMutation({
    onMutate: () => { setStatus('publishing'); },
    onSuccess: () => { setStatus('saved'); },
    onError: () => { setStatus('error'); },
  });

  const setScheduleMut = trpc.write.setSchedule.useMutation();
  const createDraftMut = trpc.write.createDraft.useMutation();
  const genOutlineMut = trpc.write.generateOutline.useMutation();
  const rewriteSectionMut = trpc.write.rewriteSection.useMutation();
  const enrichSrpMut = trpc.research.enrichSerp.useMutation();

  async function doSave(silent = false, force = false) {
    if (!draftIdNum) {
      if (!silent) toast.error("เลือก Keyword จาก KCP สร้าง draft ก่อน แล้วเปิด Edit ที่นี่");
      return;
    }
    if (!force && saveMut.isPending) return;
    const effectiveTitle = (h1 && h1.trim().length >= 2) ? h1.trim() : (keyword || undefined);
    saveMut.mutate({
      draftId: draftIdNum,
      title: effectiveTitle,
      content: md || undefined,
      metaTitle: mt || null,
      metaDescription: mdes || null,
      wordCount,
      eeatScore: eeatEst,
      citationsCount: Math.min(99, Math.max(0, (sources.length))),
    }, {
      onSuccess(r: any) {
        if (r?.ok) {
          dirtyRef.current = false;
          setSavedAt(new Date().toLocaleTimeString("th-TH"));
          if (!silent) toast.success(r.message || "บันทึกสำเร็จ เข้าคลังบทความ DB");
        } else if (!silent) toast.error(String(r?.message || "save fail").slice(0, 140));
      },
      onError(err: any) {
        const s = String(err?.message || err).slice(0, 140);
        if (!silent) toast.error("Save err: " + s);
      }
    });
  }

  return {
    title, setTitle,
    mt, setMt,
    md, setMd,
    mdes, setMdes,
    slug, setSlug,
    h1, setH1,
    keyword, setKeyword,
    category, setCategory,
    intent, setIntent,
    contentType, setContentType,
    model, setModel,
    targetWordTotal, setTargetWordTotal,
    outlineSecs, setOutlineSecs,
    sources, setSources,
    scheduledDateTime, setScheduledDateTime,
    writeHasPlaceholder, setWriteHasPlaceholder,
    previewMode, setPreviewMode,
    savedAt,
    status,
    stepStatus, setStepStatus,
    q,
    settingsQ,
    activeProvider, activeModels, providerAccent, providerDisplayName, providerDefaultIdx, hasLlmKey,
    saveMut,
    publishMut,
    setScheduleMut,
    createDraftMut,
    genOutlineMut,
    rewriteSectionMut,
    enrichSrpMut,
    resetKey,
    wordCount,
    charCount,
    stepProgress,
    seoScore,
    eeatEst,
    ymylInjected,
    runStep,
    allStepsDone,
    doSave,
    draftIdNum,
    PROVIDER_CATALOG,
  };
}

export type UseArticleWriterReturn = ReturnType<typeof useArticleWriter>;
