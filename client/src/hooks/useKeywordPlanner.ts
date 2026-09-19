import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

const INTENTS_KEYS = ["commercial", "transactional", "navigational", "informational"] as const;
export type IntentKey = (typeof INTENTS_KEYS)[number];

export type ClusterTier = "pillar" | "cluster" | "supporting";
export type TierFilter = "all" | ClusterTier;
export type IntentFilter = "all" | IntentKey;
export type StatusFilter = "all" | "pending" | "written";

export type DbKeyword = {
  id: number;
  clusterId?: number | null;
  projectId?: number | null;
  categoryId?: number | null;
  keywordText: string;
  tier?: ClusterTier | null;
  searchVolume?: number | null;
  intentSuggestion?: IntentKey | null;
  difficulty?: number | null;
  isTarget?: number | boolean | null;
  status?: "pending" | "written" | null;
  createdAt?: any;
};

export type ClusterRow = { id: number; projectId: number; name: string; type: ClusterTier; parentId: number | null };

export type SharePayload = {
  v: 1;
  projectName: string;
  sharedAt: number;
  keywords: DbKeyword[];
  clusters: ClusterRow[];
};

export type KeywordFilters = {
  search: string;
  tierFilter: TierFilter;
  intentFilter: IntentFilter;
  statusFilter: StatusFilter;
};

export function encodeSharePayload(payload: SharePayload): string {
  try {
    const json = JSON.stringify(payload);
    const bin = new TextEncoder().encode(json);
    let binStr = "";
    bin.forEach(b => { binStr += String.fromCharCode(b); });
    return btoa(binStr);
  } catch (e) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); }
    catch { return btoa(JSON.stringify(payload)); }
  }
}

export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const binStr = atob(encoded);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (parsed && parsed.v === 1 && Array.isArray(parsed.keywords)) return parsed as SharePayload;
  } catch {}
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    const parsed = JSON.parse(json);
    if (parsed && parsed.v === 1 && Array.isArray(parsed.keywords)) return parsed as SharePayload;
  } catch {}
  try {
    const parsed = JSON.parse(atob(encoded));
    if (parsed && parsed.v === 1 && Array.isArray(parsed.keywords)) return parsed as SharePayload;
  } catch {}
  return null;
}

export function getShareHashFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const match = hash.match(/#share=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function detectIntentClientSide(raw: string): IntentKey {
  const t = String(raw || "").toLowerCase();
  const trans = ["สมัคร", "ฝาก", "ถอน", "จอง", "ซื้อ", "ขอ", "สมัครสมาชิก", "เติมเงิน", "โอน", "รับเงิน", "ลงทะเบียน", "สั่ง", "pay", "buy", "order", "register", "signup", "sign up", "bet", "deposit", "withdraw", "apply", "book"];
  for (const p of trans) if (t.includes(p.toLowerCase())) return "transactional";
  const nav = ["เข้าสู่ระบบ", "ล็อกอิน", "ล็อกอิน", "สมัครสมาชิก", "ทางเข้า", "หน้าแรก", "เว็บไซต์", "แอพ", "app", "download", "ลิ้งค์", "url", "เว็บตรง", "login", "signin", "sign in", "official", "site"];
  for (const p of nav) if (t.includes(p.toLowerCase())) return "navigational";
  const comm = ["ที่ดีที่สุด", "ดีที่สุด", "แนะนำ", "เปรียบเทียบ", "รีวิว", "รีวิว", "วิธีเลือก", "ยี่ห้อ", "ร้านค้า", "โปรโมชั่น", "โปรโมชัน", "โบนัส", "bonus", "review", "best", "top", "vs", "compare", "promotion", "discount"];
  for (const p of comm) if (t.includes(p.toLowerCase())) return "commercial";
  return "informational";
}

export default function useKeywordPlanner(props: { projectId?: number }) {
  const [tabsValue, setTabsValue] = useState<'cards' | 'shared' | 'tree' | 'table' | 'clusters'>('cards');

  const [serpModalOpen, setSerpModalOpenRaw] = useState(false);
  const [serpModalKeywordId, setSerpModalKeywordId] = useState<number | null>(null);

  const setSerpModalOpen = useCallback((b: boolean, kwId?: number | null) => {
    setSerpModalOpenRaw(b);
    if (b) {
      if (typeof kwId === 'number') setSerpModalKeywordId(kwId);
    } else {
      setSerpModalKeywordId(null);
    }
  }, []);

  const serpModal = {
    open: serpModalOpen,
    keywordId: serpModalKeywordId,
    setOpen: setSerpModalOpen,
  };

  const [addClusterDialogOpen, setAddClusterDialogOpen] = useState(false);
  const addClusterDialog = {
    open: addClusterDialogOpen,
    setOpen: setAddClusterDialogOpen,
  };

  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const assertProvidersReady = useCallback(async (need: 'llm' | 'serp' | 'both' = 'both'): Promise<boolean> => {
    try {
      const res: any = await utils.settings.pingCurrent.fetch({ kind: need });
      const fails: string[] = [];
      if ((need === 'llm' || need === 'both') && res?.llm?.ok !== true) {
        const m = String(res?.llm?.msg ?? 'ยังไม่บันทึก / ไม่ถูกต้อง').slice(0, 80);
        fails.push(`🔑 LLM: ${m}`);
      }
      if ((need === 'serp' || need === 'both') && res?.serp?.ok !== true) {
        const m = String(res?.serp?.msg ?? 'ยังไม่บันทึก / ไม่ถูกต้อง').slice(0, 80);
        fails.push(`🔍 SERP: ${m}`);
      }
      if (fails.length === 0) return true;
      toast.error(`❌ ตั้งค่า Key ไม่พร้อม — หยุดก่อนยิง Batch`, {
        description: `${fails.join(' | ')} · กดไปที่ Settings → ใส่ Key ใหม่ (URL: /settings)`,
        duration: 9000,
        closeButton: true,
      });
      return false;
    } catch (e: any) {
      toast.warning(`⚠️ ไม่สามารถตรวจสอบ API ได้ชั่วคราว — กดบันทึก Settings ก่อน (${String(e?.message ?? '').slice(0,40)})`);
      return false;
    }
  }, [utils, setLocation]);

  const [runningKwIds, setRunningKwIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleRun = useCallback((id: number, on: boolean) => {
    setRunningKwIds(prev => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s; });
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  }, []);

  const [keywordFilters, setKeywordFiltersState] = useState<KeywordFilters>({
    search: "",
    tierFilter: "all",
    intentFilter: "all",
    statusFilter: "all",
  });

  const setKeywordFilters = useCallback((partial: Partial<KeywordFilters> | ((prev: KeywordFilters) => KeywordFilters)) => {
    if (typeof partial === 'function') {
      setKeywordFiltersState(partial);
    } else {
      setKeywordFiltersState(prev => ({ ...prev, ...partial }));
    }
  }, []);

  useEffect(() => {
    const hashData = getShareHashFromUrl();
    if (!hashData) return;
    const decoded = decodeSharePayload(hashData);
    if (!decoded) {
    }
  }, []);

  return {
    tabsValue,
    setTabsValue,
    serpModal,
    addClusterDialog,
    assertProvidersReady,
    encodeSharePayload,
    decodeSharePayload,
    getShareHashFromUrl,
    detectIntentClientSide,
    toggleRun,
    toggleSelect,
    runningKwIds,
    selectedIds,
    setSelectedIds,
    keywordFilters,
    setKeywordFilters,
  };
}
