import { useMemo, useState, useRef, useEffect } from "react";
import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import {
  Save, RotateCcw, GitBranch, Layers, BookOpen, Crown, Sparkles,
  ChevronDown, ChevronRight, Target, TrendingUp, Hash, CircleDot, FolderTree, Search,
  Zap, Wand2, Loader2, Database, FilePenLine, PlayCircle, CheckCircle2, AlertTriangle, Copy, CheckCheck, X, Clock,
  Upload, Plus, Download, Filter, ChevronUp, Share2, Link as LinkIcon, Eye, ShieldCheck, LogIn, Trash2, Info, Terminal,
} from "lucide-react";
import { trpc } from "@/trpc";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const INTENTS = [
  { key: "commercial", label: "Commercial", color: "#b45309" },
  { key: "transactional", label: "Transactional", color: "#dc2626" },
  { key: "navigational", label: "Navigational", color: "#7c3aed" },
  { key: "informational", label: "Informational", color: "#2563eb" },
] as const;
function intentStyleOf(intentKey: (typeof INTENTS[number]["key"])) {
  switch (intentKey) {
    case "informational":  return { label: "informational",  bg: "#dbeafe", border: "#93c5fd", text: "#1d4ed8" };
    case "commercial":     return { label: "commercial",     bg: "#fef3c7", border: "#fcd34d", text: "#b45309" };
    case "transactional":return { label: "transactional",bg: "#fee2e2", border: "#fca5a5", text: "#b91c1c" };
    case "navigational": return { label: "navigational", bg: "#ede9fe", border: "#c4b5fd", text: "#6d28d9" };
    default:              return { label: intentKey,        bg: "#f5f5f4", border: "#d6d3d1", text: "#44403c" };
  }
}
function kdBarColor(kd?: number | null) {
  const n = typeof kd === "number" ? kd : 0;
  if (n < 30) return "bg-emerald-500";
  if (n < 60) return "bg-yellow-500";
  return "bg-red-500";
}
const UNASSIGNED_CLUSTER_NAME = "ยังไม่ได้จัดกลุ่ม (System)";
const UNASSIGNED_FAKE_ID = -999_000 as const;

function detectIntentClientSide(raw: string): (typeof INTENTS[number])["key"] {
  const t = String(raw || "").toLowerCase();
  const trans = ["สมัคร", "ฝาก", "ถอน", "จอง", "ซื้อ", "ขอ", "สมัครสมาชิก", "เติมเงิน", "โอน", "รับเงิน", "ลงทะเบียน", "สั่ง", "pay", "buy", "order", "register", "signup", "sign up", "bet", "deposit", "withdraw", "apply", "book"];
  for (const p of trans) if (t.includes(p.toLowerCase())) return "transactional";
  const nav = ["เข้าสู่ระบบ", "ล็อกอิน", "ล็อกอิน", "สมัครสมาชิก", "ทางเข้า", "หน้าแรก", "เว็บไซต์", "แอพ", "app", "download", "ลิ้งค์", "url", "เว็บตรง", "login", "signin", "sign in", "official", "site"];
  for (const p of nav) if (t.includes(p.toLowerCase())) return "navigational";
  const comm = ["ที่ดีที่สุด", "ดีที่สุด", "แนะนำ", "เปรียบเทียบ", "รีวิว", "รีวิว", "วิธีเลือก", "ยี่ห้อ", "ร้านค้า", "โปรโมชั่น", "โปรโมชัน", "โบนัส", "bonus", "review", "best", "top", "vs", "compare", "promotion", "discount"];
  for (const p of comm) if (t.includes(p.toLowerCase())) return "commercial";
  return "informational";
}

type ClusterTier = "pillar" | "cluster" | "supporting";
const TIER_STYLES: Record<ClusterTier, { label: string; border: string; bg: string; text: string; icon: any }> = {
  pillar: { label: "Pillar", border: "#b45309", bg: "#fff7ed", text: "#92400e", icon: Crown },
  cluster: { label: "Cluster", border: "#2563eb", bg: "#eff6ff", text: "#1d4ed8", icon: Layers },
  supporting: { label: "Supporting", border: "#059669", bg: "#ecfdf5", text: "#047857", icon: BookOpen },
};
const TIER_PLACEMENT: Record<ClusterTier, { heading: string; description: string; color: string; border: string; bg: string }> = {
  pillar:     { heading: "H1", description: "บทความ Focus · Meta Title/Desc", color: "#92400e", border: "#b45309", bg: "#fff7ed" },
  cluster:    { heading: "H2", description: "หัวข้อหลัก / Intro Section",    color: "#1d4ed8", border: "#2563eb", bg: "#eff6ff" },
  supporting: { heading: "H3", description: "Body · Alt Img · FAQ · LSI",    color: "#047857", border: "#059669", bg: "#ecfdf5" },
};

function pickCategoryLabel(catId: number | null | undefined): string {
  switch (Number(catId)) {
    case 1: return "ฟุตบอล"; case 2: return "มวย"; case 3: return "สล็อต";
    case 4: return "หวย"; case 5: return "คาสิโน"; case 6: return "ไก่ชน";
    case 7: return "วัวชน"; default: return "ทุกหมวด";
  }
}

const SOURCES = [
  { key: "serp_live", label: "DATA", color: "#047857", bg: "#ecfdf5" },
  { key: "db_stale", label: "DATA", color: "#92400e", bg: "#fff7ed" },
  { key: "cache_7d", label: "DATA", color: "#1d4ed8", bg: "#eff6ff" },
  { key: "pending", label: "PENDING", color: "#44403c", bg: "#f5f5f4" },
  { key: "na", label: "N/A", color: "#78716c", bg: "#f5f5f4" },
];

type TierFilter = "all" | ClusterTier;
type IntentFilter = "all" | (typeof INTENTS[number]["key"]);
type StatusFilter = "all" | "pending" | "written";

type DbKeyword = {
  id: number;
  clusterId?: number | null;
  projectId?: number | null;
  categoryId?: number | null;
  keywordText: string;
  tier?: ClusterTier | null;
  searchVolume?: number | null;
  intentSuggestion?: (typeof INTENTS[number]["key"]) | null;
  difficulty?: number | null;
  isTarget?: number | boolean | null;
  status?: "pending" | "written" | null;
  createdAt?: any;
};

type ClusterRow = { id: number; projectId: number; name: string; type: ClusterTier; parentId: number | null };

type SharePayload = {
  v: 1;
  projectName: string;
  sharedAt: number;
  keywords: DbKeyword[];
  clusters: ClusterRow[];
};

function encodeSharePayload(payload: SharePayload): string {
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

function decodeSharePayload(encoded: string): SharePayload | null {
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

function getShareHashFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const match = hash.match(/#share=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function KeywordClusterPlanner() {
  const list = trpc.projects.list.useQuery();
  const projects = Array.isArray(list.data) ? (list.data as any[]) : [];
  const [projectId, setProjectIdRaw] = useState<"all" | number>(() => {
    try {
      const saved = localStorage.getItem('kcp_projectId');
      if (saved === 'all') return 'all';
      const n = Number(saved); if (Number.isFinite(n) && n > 0) return n;
    } catch {} return 'all';
  });
  const setProjectId = (v: "all" | number) => { setProjectIdRaw(v); try { localStorage.setItem('kcp_projectId', String(v)); } catch {} };
  useEffect(() => { try { localStorage.setItem('kcp_projectId', String(projectId)); } catch {} }, [projectId]);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.permission === "owner" || user?.permission === "admin";
  const [runningKwIds, setRunningKwIds] = useState<Set<number>>(new Set());

  // Filters
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // ─── AI Seed Input Panel (from old SEO E KeywordClusterPlanner) ───
  const [showSeedPanel, setShowSeedPanel] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  const [seedKeywords, setSeedKeywords] = useState<string[]>([]);
  const [longtailCount, setLongtailCount] = useState<number>(5);
  const [targetClusters, setTargetClusters] = useState<number>(30);
  const [seedRunning, setSeedRunning] = useState(false);

  const utils = trpc.useUtils();
  const kwListQ = trpc.keywords.listByProject.useQuery(
    {
      projectId: projectId,
      search: search.trim() || undefined,
      tier: tierFilter,
      intent: intentFilter,
      status: statusFilter,
      limit: 500,
    },
    { staleTime: 30_000 }
  );

  const enrichSerp = trpc.keywords.enrichSerp.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  // #region debug-point kcp-aiclusterize-400-badrequest error-shape-decode
  const decodeTrpcError = (e: any): { title: string; hint: string; raw: string } => {
    try {
      const msg = String(e?.message ?? String(e ?? 'Unknown')).slice(0, 300);
      const data: any = e?.data?.zodError ?? e?.data ?? null;
      let issues: string[] = [];
      if (data && Array.isArray(data?.issues)) issues = data.issues.slice(0, 3).map((i: any) => `/${String(i?.path?.join('/') ?? 'root')} ${i?.code ?? 'error'}: ${String(i?.message ?? '').slice(0, 80)}`);
      if (msg.includes('NOT_ASSIGNED_KEYWORDS_LEFT') || msg.includes('ไม่มี keyword ที่ยังไม่ได้จัดกลุ่ม') || /\[NOT_ASSIGNED_KEYS\]/.test(msg)) return { title: 'ทุก Keyword จัดกลุ่มครบแล้ว (ไม่มี Unassigned)', hint: 'เลือก keyword ใหม่มาเพิ่ม หรือเลือก keyword บางอันแล้วคลิกจัดกลุ่มเฉพาะที่เลือก', raw: msg };
      if (msg.includes('SELECTED_KEYWORDS_NOT_FOUND')) return { title: 'Keyword ที่เลือกไม่พบใน Project หรือถูกลบไปแล้ว', hint: 'รีเฟรชหน้า แล้วลองเลือกใหม่', raw: msg };
      if (msg.includes('UNAUTHORIZED') || msg.includes('access') || (typeof e?.data?.httpStatus === 'number' && e.data.httpStatus >= 401 && e.data.httpStatus <= 403)) return { title: 'Session หมดอายุ / ไม่มีสิทธิ์เข้า Project นี้', hint: 'ออกจากระบบ แล้ว Login ใหม่', raw: msg };
      if (issues.length > 0) return { title: `ข้อมูล Input ไม่ถูกต้อง (Zod ${issues.length} issues)`, hint: issues.join(' · '), raw: msg };
      if (msg.includes('trace') || /traceId/i.test(msg)) return { title: 'Server AI Clusterize LLM Error', hint: msg.slice(0, 180), raw: msg };
      return { title: `Error: ${msg.slice(0, 60)}`, hint: 'ดู Console → Expand object หรือส่งภาพนี้มาให้ debug ต่อ', raw: msg };
    } catch (_) { return { title: String(e ?? 'Unknown error'), hint: 'Unknown error shape', raw: JSON.stringify(e || null).slice(0, 200) }; }
  };
  const aiClusterize = trpc.keywords.aiClusterize.useMutation({
    onSuccess: async (res: any) => {
      if (res && typeof res === 'object' && (res.zero_rows === true || String(res.reason_code || '').startsWith('NO_') || String(res.reason_code || '').startsWith('SELECTED_'))) {
        const reason = String(res.reason_code || 'NO_UNASSIGNED_KEYWORDS_LEFT');
        if (reason === 'NO_UNASSIGNED_KEYWORDS_LEFT') toast.info('ℹ️ ทุก Keyword ใน Project นี้ จัดกลุ่มครบแล้ว (ไม่มี unassigned) — เพิ่ม keyword ใหม่ หรือเลือกบางอันแล้วคลิกจัดกลุ่มเฉพาะ');
        else if (reason === 'SELECTED_KEYWORDS_NOT_FOUND') toast.warning('⚠️ Keyword ที่เลือก ไม่พบในระบบ (อาจถูกลบ/ย้าย project) — รีเฟรชแล้วลองใหม่');
      }
      await utils.keywords.listByProject.invalidate();
    },
    onError: (e: any) => {
      const info = decodeTrpcError(e);
      // eslint-disable-next-line no-console
      console.dir({ KCP_AI_CLUSTER_ERROR: { raw: e, decoded: info }, HINT: 'แคปภาพนี้ส่งเพื่อ debug รอบหน้า' }, { depth: 8 });
      toast.error(`❌ ${info.title}`);
      if (info.hint) setTimeout(() => toast.info(`💡 Hint: ${info.hint}`), 350);
    }
  });
  // #endregion debug-point kcp-aiclusterize-400-badrequest error-shape-decode
  const runPlan = trpc.research.runPlanForKeyword.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const createDraft = trpc.write.createDraft.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const deleteKwMut = trpc.keywords.delete.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const importCsvMut = trpc.keywords.importCsv.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const updateTierMut = trpc.keywords.updateTier.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const updateKwMut = trpc.keywords.update.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const createKwMut = trpc.keywords.create.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const bulkTierMut = trpc.keywords.bulkUpdateTier.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const bulkDelMut = trpc.keywords.bulkDelete.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });

  const enriching = enrichSerp.isPending || aiClusterize.isPending;
  const [toolbarSaving, setToolbarSaving] = useState(false);

  async function assertProvidersReady(need: 'llm' | 'serp' | 'both' = 'both'): Promise<boolean> {
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
        description: (
          <div className="mt-1 space-y-1">
            {fails.map((f, i) => <p key={i} className="text-[12.5px] leading-relaxed">{f}</p>)}
            <button
              onClick={() => { setLocation('/settings'); }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-red-700"
            >
              ไปที่ Settings → ใส่ Key ใหม่
            </button>
          </div>
        ),
        duration: 9000,
        closeButton: true,
      } as any);
      return false;
    } catch (e: any) {
      toast.warning(`⚠️ ไม่สามารถตรวจสอบ API ได้ชั่วคราว — กดบันทึก Settings ก่อน (${String(e?.message ?? '').slice(0,40)})`);
      return false;
    }
  }

  // ---------- CLUSTER MUTATIONS (Tree View Inline Edit / Move / Rename) ----------
  const clusterUpdateMut = trpc.clusters.update.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const clusterCreateMut = trpc.clusters.create.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const clusterDeleteMut = trpc.clusters.delete.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });

  // ---------- STATE ----------
  const [tabsValue, setTabsValue] = useState<'cards' | 'shared' | 'tree' | 'table' | 'clusters'>('cards');
  const [expandedClustersView, setExpandedClustersView] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const [openDel, setOpenDel] = useState(false);
  const [delCard, setDelCard] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [serpModalOpen, setSerpModalOpen] = useState(false);
  const [serpModalCard, setSerpModalCard] = useState<any>(null);
  const serpPkgQ = trpc.research.getPackage.useQuery(
    serpModalCard && Number(serpModalCard?.keywordId) > 0
      ? { keywordId: Number(serpModalCard.keywordId) }
      : { keywordId: -1 },
    { enabled: serpModalOpen && !!serpModalCard && Number(serpModalCard?.keywordId) > 0, staleTime: 60_000 }
  );
  function openSerpPreview(c: any) {
    setSerpModalCard(c); setSerpModalOpen(true);
  }

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [expandedPillars, setExpandedPillars] = useState<Set<number>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchTier, setBatchTier] = useState<ClusterTier>("supporting");

  // ---------- TREE VIEW INLINE CLUSTER EDIT STATE ----------
  const [editingClusterId, setEditingClusterId] = useState<number | null>(null);
  const [editingClusterName, setEditingClusterName] = useState<string>("");
  const [addClusterDialogOpen, setAddClusterDialogOpen] = useState(false);
  const [addClusterParentId, setAddClusterParentId] = useState<number | null>(null);
  const [addClusterParentType, setAddClusterParentType] = useState<"pillar_parent" | "cluster_parent" | "top_pillar">("top_pillar");
  const [addClusterName, setAddClusterName] = useState<string>("");
  const [confirmDeleteClusterId, setConfirmDeleteClusterId] = useState<number | null>(null);

  // Import CSV dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importProject, setImportProject] = useState<number | null>(null);
  const [importPreview, setImportPreview] = useState<{ keyword: string; volume?: number; difficulty?: number }[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Add Keyword dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [addIntent, setAddIntent] = useState<(typeof INTENTS[number]["key"])>("informational");
  const [addTier, setAddTier] = useState<ClusterTier>("supporting");
  const [addClusterId, setAddClusterId] = useState<number | null>(null);

  // ---------- SHARE SYSTEM STATE ----------
  const [isSharedView, setIsSharedView] = useState(false);
  const [sharedPayload, setSharedPayload] = useState<SharePayload | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSearch, setShareSearch] = useState("");
  const [shareTierFilter, setShareTierFilter] = useState<TierFilter>("all");
  const [shareIntentFilter, setShareIntentFilter] = useState<IntentFilter>("all");
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  useEffect(() => {
    const hashData = getShareHashFromUrl();
    if (!hashData) return;
    const decoded = decodeSharePayload(hashData);
    if (decoded) {
      setSharedPayload(decoded);
      setIsSharedView(true);
    } else {
      setShareError("ไม่สามารถถอดรหัสลิงก์แชร์ได้ — ข้อมูลอาจเสียหายหรือไม่ถูกต้อง");
      setIsSharedView(true);
    }
  }, []);

  function toggleRun(id: number, on: boolean) {
    setRunningKwIds(prev => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s; });
  }
  function toggleSelect(id: number) {
    setSelectedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  }
  function selectAll(ids: number[]) {
    setSelectedIds(new Set(ids));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  const dbKeywords = (kwListQ.data?.keywords ?? []) as DbKeyword[];
  const clusters = (kwListQ.data?.clusters ?? []) as ClusterRow[];
  const clustersById = (kwListQ.data?.clustersById ?? {}) as Record<number, ClusterRow>;
  const loading = kwListQ.isFetching || kwListQ.isLoading;

  // ---------- SHARE BUILDERS (after dbKeywords declaration) ----------
  const sharePreviewKeywords = useMemo(() => {
    if (isSharedView && sharedPayload) return sharedPayload.keywords;
    return dbKeywords;
  }, [isSharedView, sharedPayload, dbKeywords]);

  const sharePreviewFiltered = useMemo(() => {
    let kws = sharePreviewKeywords;
    const s = shareSearch.trim().toLowerCase();
    if (s) kws = kws.filter(k => String(k.keywordText || "").toLowerCase().includes(s));
    if (shareTierFilter !== "all") kws = kws.filter(k => (k.tier || "supporting") === shareTierFilter);
    if (shareIntentFilter !== "all") kws = kws.filter(k => (k.intentSuggestion || "informational") === shareIntentFilter);
    return kws;
  }, [sharePreviewKeywords, shareSearch, shareTierFilter, shareIntentFilter]);

  const shareCountPillar = sharePreviewKeywords.filter(k => (k.tier || "") === "pillar").length;
  const shareCountCluster = sharePreviewKeywords.filter(k => (k.tier || "") === "cluster").length;
  const shareCountSupporting = sharePreviewKeywords.filter(k => (k.tier || "") === "supporting").length;
  const shareCountTotal = sharePreviewKeywords.length;

  async function handleBuildShareLink() {
    if (!isAdmin) { toast.error("ต้องเป็น Admin/Owner เท่านั้นจึงสร้างลิงก์แชร์ได้"); return; }
    if (projectId === "all") { toast.warning("กรุณาเลือกโปรเจกต์เดียวก่อนสร้างลิงก์แชร์ (Share ต่อโปรเจกต์)"); return; }
    if (dbKeywords.length === 0) { toast.warning("โปรเจกต์นี้ไม่มี Keywords ที่จะแชร์"); return; }
    const proj = projects.find(p => Number(p.id) === Number(projectId));
    const payload: SharePayload = {
      v: 1,
      projectName: proj?.name || `Project #${projectId}`,
      sharedAt: Date.now(),
      keywords: dbKeywords,
      clusters: clusters,
    };
    try {
      const encoded = encodeSharePayload(payload);
      const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "/kcp";
      const link = `${base}#share=${encodeURIComponent(encoded)}`;
      try { await navigator.clipboard.writeText(link); }
      catch {
        const ta = document.createElement("textarea"); ta.value = link; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch {}
        document.body.removeChild(ta);
      }
      setCopiedShareLink(true);
      toast.success(`🔗 สร้างลิงก์แชร์สำเร็จ! คัดลอกไปยัง Clipboard แล้ว (${shareCountTotal} คำหลัก · ${Math.round(encoded.length / 1024 * 10) / 10} KB)`);
      setTimeout(() => setCopiedShareLink(false), 3000);
    } catch (e: any) {
      toast.error(`สร้างลิงก์แชร์ล้มเหลว: ${String(e?.message ?? e).slice(0, 100)}`);
    }
  }

  function kwSource(v: number | null | undefined, idx = 0) {
    const DATA_SOURCE_COUNT = SOURCES.length - 2;
    if (typeof v === 'number' && v > 0) return SOURCES[(idx + Math.floor(v / 50)) % DATA_SOURCE_COUNT];
    return SOURCES[4];
  }

  function kwStyleOf(tierRaw?: ClusterTier | null | string): { label: string; border: string; bg: string; text: string; icon: any } {
    const t = (tierRaw as ClusterTier) || "supporting";
    return TIER_STYLES[t] ?? TIER_STYLES.supporting;
  }

  function mapToCard(k: DbKeyword) {
    const cid = Number(k.clusterId) || 0;
    const clusterRef = cid > 0 ? clustersById[cid] : null;
    const unifiedTier: ClusterTier = clusterRef && clusterRef.type
      ? (clusterRef.type as ClusterTier)
      : ((k.tier || "supporting") as ClusterTier);
    const style = kwStyleOf(unifiedTier);
    const sv = kwSource(k.searchVolume, Number(k.id) % 3);
    const kd = kwSource(k.difficulty, Number(k.id + 1) % 3);
    const hasSv = typeof k.searchVolume === 'number' && k.searchVolume > 0;
    const hasKd = typeof k.difficulty === 'number' && k.difficulty > 0;
    const vol = hasSv ? k.searchVolume! : 0;
    const kdp = hasKd ? k.difficulty! : 0;
    const intent: (typeof INTENTS[number])["key"] =
      (k.intentSuggestion as any) || detectIntentClientSide(String(k.keywordText || ""));
    return {
      id: `k-${k.id}`,
      tier: unifiedTier,
      projectId: k.projectId ?? 0,
      keywordId: Number(k.id),
      keyword: k.keywordText,
      intent,
      kd: kdp,
      vol,
      svSource: sv,
      kdSource: kd,
      supporting: 0,
      style,
      keywordObj: k,
    };
  }

  const scopedProjects = projectId === "all" ? projects : projects.filter(p => Number(p.id) === Number(projectId));

  const cardList = useMemo(() => dbKeywords.map(mapToCard), [dbKeywords, clustersById]);
  const pillarCount = dbKeywords.filter(k => (k.tier || '') === 'pillar').length;
  const clusterCount = dbKeywords.filter(k => (k.tier || '') === 'cluster').length;
  const supportingCount = dbKeywords.filter(k => (k.tier || '') === 'supporting').length;
  const totalKeywords = dbKeywords.length;

  // ─── PROGRESS STEPS + ENABLE/DISABLE GUARDS (เพิ่มเข้ามาเพื่อไม่ให้แสดงเมนูที่ยังไม่พร้อม) ───
  const {
    hasKeywords, hasAnyClusters, hasRealClusters, hasPillar, hasCluster, hasSupporting,
    hasSvKd, workflowStep, stepTitle,
    showTableTab, showTreeTab, showSharedTab,
    showClusterGroupsEmptyGuide, showCardsEmptyGuide,
  } = useMemo(() => {
    const hKw = Number(totalKeywords) > 0;
    const realClustersList = Array.isArray(clusters)
      ? clusters.filter(c => Number(c.id) > 0 && String(c.name || '') !== UNASSIGNED_CLUSTER_NAME)
      : [];
    const hReal = realClustersList.length > 0;
    const hAll = Array.isArray(clusters) && clusters.length > 0;
    const hP = pillarCount > 0;
    const hC = clusterCount > 0;
    const hS = supportingCount > 0;
    const hSvKd = dbKeywords.some(k =>
      (typeof k.searchVolume === 'number' && k.searchVolume > 0) ||
      (typeof k.difficulty === 'number' && k.difficulty > 0)
    );
    let step = 0;
    if (projectId !== "all" && hKw) step = 1;
    if (step >= 1 && (hSvKd || enrichSerp.isPending)) step = 2;
    if (step >= 2 && hReal && pillarCount >= 1 && clusterCount >= 2 && supportingCount >= 2) step = 3;
    if (step >= 3 && pillarCount >= 1 && clusterCount >= 2 && supportingCount >= 2) step = 4;
    const titles = [
      "🟠 Step 0: เลือกโปรเจกต์ + เพิ่ม Keyword",
      "🟡 Step 1: ✅ มี Keyword แล้ว → ถัดไป Enrich SERP",
      "🟢 Step 2: ✅ มี SV/KD แล้ว → ถัดไป AI จัดกลุ่ม 3-Tier",
      "🔵 Step 3: ✅ มี Cluster แล้ว → ถัดไป สร้าง 3 ชั้นให้ครบ",
      "🟣 Step 4: ✅ Crown Hierarchy ครบถ้วน (Pillar/Cluster/Supporting) พร้อมเขียนบทความ",
    ];
    return {
      hasKeywords: hKw,
      hasAnyClusters: hAll,
      hasRealClusters: hReal,
      hasPillar: hP,
      hasCluster: hC,
      hasSupporting: hS,
      hasSvKd: hSvKd,
      workflowStep: step,
      stepTitle: titles[Math.max(0, Math.min(4, step))],
      showTableTab: hReal,
      showTreeTab: hReal,
      showSharedTab: hKw && (projectId !== "all"),
      showClusterGroupsEmptyGuide: !hReal,
      showCardsEmptyGuide: !hKw && !hReal,
    };
  }, [projectId, clusters, totalKeywords, pillarCount, clusterCount, supportingCount, dbKeywords, enrichSerp.isPending]);

  const allCards = cardList;

  // ---------- TOOLBAR HANDLERS ----------
  function handleToolbarReset() {
    setSearch(""); setTierFilter("all"); setIntentFilter("all"); setStatusFilter("all"); setSelectedIds(new Set());
    toast.success("🔄 Reset Filters + Selection เรียบร้อย");
  }
  function handleToolbarTopicalMap() { setTabsValue('tree'); toast.success("🗺️ Tree View โหลดไว้แล้ว — Pillar → Cluster → Supporting (Expandable)"); }
  function handleToolbarAiCluster2() { handleClusterize(); }
  async function handleToolbarSave() {
    if (!isAdmin) { toast.error("บันทึก cluster จำเป็นต้องเป็น Admin/Owner เท่านั้น"); return; }
    if (projectId === "all") { toast.warning("กรุณาเลือกโปรเจกต์ก่อนบันทึก"); return; }
    if (totalKeywords === 0) { toast.warning("ไม่มีข้อมูล Keywords จากฐานข้อมูล — Import CSV หรือ Add Keyword ก่อนบันทึก"); return; }
    setToolbarSaving(true);
    const saveToast = toast.loading(`💾 Sync Cluster Hierarchy project #${projectId} (${pillarCount} Pillar · ${clusterCount} Cluster · ${supportingCount} Supporting)...`);
    try {
      await utils.keywords.listByProject.invalidate();
      const pillars = dbKeywords.filter(k => (k.tier || '') === 'pillar');
      const clusters = dbKeywords.filter(k => (k.tier || '') === 'cluster');
      const supportings = dbKeywords.filter(k => (k.tier || '') === 'supporting');
      const warnMsgs: string[] = [];
      if (pillars.length > 0 && clusters.length === 0) warnMsgs.push("มี Pillar แต่ยังไม่มี Cluster — กด AI จัดกลุ่มเพื่อสร้างโครงสร้าง 3 ชั้น");
      if (clusters.length > 0 && supportings.length === 0) warnMsgs.push("มี Cluster แต่ยังไม่มี Supporting Keywords — ลอง Run Plan เพื่อขยายคำหลักสนับสนุน");
      const total = pillars.length + clusters.length + supportings.length;
      toast.dismiss(saveToast);
      if (warnMsgs.length === 0) {
        toast.success(`✅ Sync Cluster สำเร็จ: ${pillars.length} Pillar · ${clusters.length} Cluster · ${supportings.length} Supporting = ${total} คำหลัก (Tier/Intent auto-saved ทุกครั้งที่คุณแก้ไข inline)`);
      } else {
        toast.warning(`⚠️ Sync Cluster OK: ${total} คำหลัก · แต่มีข้อควรระวัง: ${warnMsgs.join(' | ')}`);
      }
    } catch (e: any) {
      toast.dismiss(saveToast); toast.error(`บันทึก/Sync ล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`);
    } finally {
      setToolbarSaving(false);
    }
  }

  // ---------- PER CARD HANDLERS ----------
  async function handleCardShare(c: any) {
    const base = (typeof window !== 'undefined' ? window.location.origin : 'https://thaiaeo.manus.host');
    const link = `${base}/kcp?cluster_id=${encodeURIComponent(String(c.id ?? ''))}&project_id=${Number(c.projectId) ?? ''}`;
    try { await navigator.clipboard.writeText(link); }
    catch {
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { }
      document.body.removeChild(ta);
    }
    setCopiedId(String(c.id));
    toast.success(`🔗 คัดลอกลิงก์แชร์ Cluster: ${String(c.keyword || '').slice(0, 32)}`);
    setTimeout(() => setCopiedId(prev => prev === String(c.id) ? null : prev), 2200);
  }
  function handleCardDeleteClick(c: any) { setDelCard(c); setOpenDel(true); }
  async function confirmDeleteCard() {
    if (!delCard) return;
    const kwId = Number(delCard.keywordId);
    if (!kwId || isNaN(kwId) || kwId <= 0) {
      toast.warning("ไม่มี keyword id จริงในฐานข้อมูล");
      setOpenDel(false); setDelCard(null); return;
    }
    const loadingToast = toast.loading(`🗑️ กำลังลบ keyword #${kwId}: ${String(delCard.keyword || '').slice(0, 40)}`);
    try {
      await deleteKwMut.mutateAsync({ id: kwId });
      toast.dismiss(loadingToast);
      toast.success(`✅ ลบ keyword #${kwId} สำเร็จ! (Foreign key guard: ห้ามลบถ้ามี article ผูกอยู่)`);
    } catch (e: any) {
      toast.dismiss(loadingToast);
      const emsg = String(e?.message ?? e ?? '').slice(0, 140);
      if (/referenced by.*article|article.*reference|foreign.*key|Cannot delete keyword.*referenced by/i.test(emsg)) {
        toast.error(`❌ ลบไม่ได้: Keyword ถูกใช้งานโดยบทความอยู่ (SA Referential Integrity G1.1 Guard)`);
      } else { toast.error(`ลบ keyword ล้มเหลว: ${emsg}`); }
    } finally { setOpenDel(false); setDelCard(null); }
  }

  async function handleEnrichSerp(idsIn?: number[]): Promise<{ enriched_count: number; errors?: any[] }> {
    if (projectId === "all") { toast.error("กรุณาเลือกโปรเจกต์ก่อน Enrich"); return { enriched_count: 0 }; }
    if (!(await assertProvidersReady('serp'))) return { enriched_count: 0 };
    const idsArr = Array.isArray(idsIn) && idsIn.length > 0 ? idsIn : undefined;
    const selIds = idsArr ?? Array.from(selectedIds).filter(n => Number(n) > 0);
    const allIds = dbKeywords.map(k => Number(k.id)).filter(n => n > 0);
    const useIds = (selIds.length > 0 ? selIds.slice(0, 100) : allIds.slice(0, 100)).filter(n => Number(n) > 0);
    if (useIds.length === 0) { toast.warning("ไม่มี Keyword ในโปรเจกต์ — Import CSV หรือ Add Keyword ก่อน"); return { enriched_count: 0 }; }
    const t = toast.loading(`🔎 ${idsArr ? 'Auto-Enrich ก่อน AI จัดกลุ่ม' : (selIds.length>0 ? 'Enrich ที่เลือกไว้' : 'Enrich ทั้งโปรเจกต์')} ${useIds.length} keywords → SERP metrics (SV/KD/Intent)...`);
    try {
      const res = await enrichSerp.mutateAsync({ projectId: Number(projectId), keywordIds: useIds });
      toast.dismiss(t);
      const r: any = res;
      const parts = [];
      if (typeof r.total_input === 'number') parts.push(`ทั้งหมด ${r.total_input} คำ`);
      if (typeof r.enriched_count === 'number') parts.push(`อัปเดตสำเร็จ ${r.enriched_count} คำ`);
      if (typeof r.avg_search_volume === 'number' && r.avg_search_volume > 0) parts.push(`SV เฉลี่ย ${r.avg_search_volume.toLocaleString()}`);
      if (typeof r.new_metric_source) parts.push(`src=${r.new_metric_source}`);
      if (Array.isArray(r.errors) && r.errors.length > 0) parts.push(`ล้มเหลว ${r.errors.length} คำ`);
      if (typeof r.error_rate_pct === 'number' && r.error_rate_pct > 0) parts.push(`err ${r.error_rate_pct}%`);
      const isFullFail = (Number(r.enriched_count ?? 0) === 0) && (Array.isArray(r.errors) && r.errors.length > 0);
      const errorSampleMsgs = (r.errors ?? []).slice(0, 3).map((e: any) => String(e?.msg ?? e?.code ?? '').slice(0, 40)).filter(Boolean);
      const errorReasonHint = (() => {
        if (!errorSampleMsgs.length) return '';
        const flat = errorSampleMsgs.join(' ').toLowerCase();
        if (/auth|key|invalid|401|403|serp_auth|missing key/.test(flat)) return ' · สาเหตุ: API Key ไม่ถูกต้อง (ไปที่ Admin > Settings > SERP API Key)';
        if (/rate|429|quota|limit|too many/.test(flat)) return ' · สาเหตุ: Rate limit / Quota เต็ม (รอหรืออัปเกรดแพ็กเกจ)';
        if (/network|timeout|fetch|econnreset|enoent|dns|ENOTFOUND/.test(flat)) return ' · สาเหตุ: Network / DNS ล้ม VPS';
        if (/no.?result|NO_RESULT/.test(flat)) return ' · สาเหตุ: SERP ไม่พบผลลัพธ์สำหรับคำค้นนี้';
        return '';
      })();
      if (!idsArr) {
        if (isFullFail) {
          toast.error(`❌ Enrich SERP ล้มทั้งหมด${parts.length ? ': ' + parts.join(' · ') : ''}${errorReasonHint}` + (errorSampleMsgs.length ? `\nตัวอย่าง error: ${errorSampleMsgs.join(' | ')}` : ''));
        } else if (Array.isArray(r.errors) && r.errors.length > 0) {
          toast.warning(`⚠️ Enrich SERP บางส่วนล้มเหลว${parts.length ? ': ' + parts.join(' · ') : ''}${errorReasonHint}`);
        } else {
          toast.success(`✅ Enrich SERP เสร็จ${parts.length ? ': ' + parts.join(' · ') : ''}`);
        }
      }
      return { enriched_count: Number(r.enriched_count ?? 0), errors: r.errors };
    } catch (e: any) {
      toast.dismiss(t);
      const emsg = String(e?.message ?? e).slice(0, 140);
      if (!idsArr) toast.error(`Enrich SERP ล้มเหลว: ${emsg}`);
      else toast.warning(`⚠️ Auto-Enrich ไม่สำเร็จ (${emsg}) → ยังคงเริ่ม AI จัดกลุ่ม (ไม่มี SV/KD) ต่อไป...`);
      return { enriched_count: 0 };
    }
  }

  async function handleClusterize(): Promise<{ ok: boolean; assigned: number; total: number }> {
    if (projectId === "all") { toast.error("กรุณาเลือกโปรเจกต์ก่อน AI จัดกลุ่ม"); return { ok: false, assigned: 0, total: 0 }; }
    if (!(await assertProvidersReady('llm'))) return { ok: false, assigned: 0, total: 0 };
    const selIds = Array.from(selectedIds).filter(n => Number(n) > 0);
    const pid = Number(projectId);
    const unassigned = dbKeywords.filter(k => Number(k.projectId) === pid && k.clusterId === unassignedClusterId);
    const targetKws = selIds.length > 0
      ? dbKeywords.filter(k => selIds.includes(Number(k.id)))
      : unassigned;
    if (targetKws.length === 0) { toast.info("ไม่มี Keyword เป้าหมายสำหรับ AI จัดกลุ่ม"); return { ok: false, assigned: 0, total: 0 }; }
    const allKwZero = targetKws.every(k => !(Number(k.searchVolume) > 0) && !(Number(k.difficulty) > 0));
    const noMetrics = targetKws.filter(k => !(typeof k.searchVolume === 'number' && k.searchVolume > 0) && !(typeof k.difficulty === 'number' && k.difficulty > 0)).length;
    const doAutoEnrich = targetKws.length >= 3 && (noMetrics / targetKws.length) >= 0.34;
    // P0-4 GUARD: ถ้า 100% ALL ZERO ไม่ยอมให้ AI ทำงานเลย → บังคับ Enrich SERP ก่อน
    if (allKwZero && !doAutoEnrich) {
      toast.error('❌ KD/SV ทุกคำยัง 0/0 ทั้งหมด · ก่อน AI จัดกลุ่ม กรุณา 🚀 Enrich SERP ก่อน (ปุ่มสีส้มบน Header หรือ Progress Step 2)');
      return { ok: false, assigned: 0, total: 0 };
    }
    if (doAutoEnrich) {
      toast.info(`💡 ตรวจพบ ${noMetrics}/${targetKws.length} keywords ยังไม่มี SV/KD → เรียก Auto-Enrich ก่อน AI จัดกลุ่ม (เพื่อ clustering ที่แม่นขึ้น)`);
      const er = await handleEnrichSerp(targetKws.map(k => Number(k.id)).filter(n => n > 0));
      await new Promise(r => setTimeout(r, 400));
      await utils.keywords.listByProject.invalidate();
      void er;
    }
    const t = toast.loading(`🧠 AI Clusterize LLM (${selIds.length>0 ? selIds.length+' ที่เลือก' : unassigned.length+' unassigned'}) → 3-Tier Pillar/Cluster/Supporting...`);
    try {
      const res = await aiClusterize.mutateAsync({ projectId: pid, keywordIds: selIds.length>0 ? selIds.slice(0,500) : undefined, targetClusters, longtailCount });
      toast.dismiss(t);
      const r: any = res;
      const pillar = Number(r?.pillar_count ?? 0);
      const cluster = Number(r?.cluster_count ?? 0);
      const supporting = Number(r?.supporting_count ?? 0);
      const assigned = Number(r?.assigned_keywords ?? 0);
      const total = Number(r?.total_input_keywords ?? 0);
      if (r?.zero_rows === true) {
        const rc = String(r?.reason_code ?? 'zero_rows');
        if (rc === 'NO_UNASSIGNED_KEYWORDS_LEFT') toast.info('ℹ️ ทุก Keyword จัดกลุ่มครบแล้ว — เพิ่ม keyword ใหม่ หรือเลือกบางอันแล้วคลิกจัดกลุ่มเฉพาะ');
        else if (rc === 'SELECTED_KEYWORDS_NOT_FOUND') toast.warning('⚠️ Keyword ที่เลือก ไม่พบในระบบ');
        return { ok: false, assigned: 0, total: 0 };
      }
      if (assigned <= 0 || total <= 0) {
        const hint = Array.isArray(r?.unassigned_keywords_not_in_response) && r.unassigned_keywords_not_in_response.length > 0
          ? ` · ไม่จับคู่ ${r.unassigned_keywords_not_in_response.slice(0,3).join(', ')}${r.unassigned_keywords_not_in_response.length>3?` และ ${r.unassigned_keywords_not_in_response.length-3} อื่น`:''}`
          : '';
        toast.error(`❌ AI Clusterize ไม่ได้กำหนดกลุ่มให้ keyword ใดเลย (${assigned}/${total})${hint}. ลองใส่ Seed/Keywords ใหม่ หรือเพิ่มจำนวน keywords ให้มากกว่า 3 คำ`);
        return { ok: false, assigned: 0, total };
      }
      toast.success(
        `✅ AI จัดกลุ่มเสร็จ: ${pillar} Pillar · ${cluster} Cluster · ${supporting} Supporting ` +
        `= กำหนดที่ ${assigned}/${total} คำ` +
        (r?.disclaimer_required ? ' · 🚨 YMYL: ต้องมี Disclaimer' : '') +
        (Array.isArray(r?.unassigned_keywords_not_in_response) && r.unassigned_keywords_not_in_response.length > 0 ? ` · ไม่จับคู่ ${r.unassigned_keywords_not_in_response.length}` : '')
      );
      const tInv = toast.loading(`🔄 อัปเดตรายการ Keywords + Clusters ใหม่ทันที...`);
      await utils.keywords.listByProject.invalidate();
      toast.dismiss(tInv);
      setSelectedIds(new Set());
      return { ok: true, assigned, total };
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`AI Clusterize ล้มเหลว: ${String(e?.message ?? e).slice(0, 140)}`);
      return { ok: false, assigned: 0, total: 0 };
    }
  }

  async function handleRunPlan2Step() {
    if (projectId === "all") { toast.error("เลือกโปรเจกต์ก่อน Run Plan"); return; }
    if (enrichSerp.isPending || aiClusterize.isPending) { toast.warning("กำลังทำงานคำสั่งอื่นอยู่ รอ..."); return; }
    if (!(await assertProvidersReady('both'))) return;
    const pid = Number(projectId);
    const targetKwIds = dbKeywords.filter(k => Number(k.projectId) === pid).map(k => Number(k.id)).filter(n => n > 0).slice(0, 100);
    if (targetKwIds.length === 0) { toast.warning("ไม่มี Keyword ในโปรเจกต์ — Import/Add ก่อน"); return; }
    const t = toast.loading(`🚀 Step 1/3: Enrich SERP (SV/KD/Intent) ${targetKwIds.length} keywords → Step 2/3: รอ Settle → Step 3/3: LLM จัดกลุ่ม 3-Tier...`);
    try {
      const er = await enrichSerp.mutateAsync({ projectId: pid, keywordIds: targetKwIds });
      if (Number((er as any)?.enriched_count ?? 0) > 0) {
        toast.dismiss(t); const t2 = toast.loading(`✅ Step1 Enrich ${Number((er as any).enriched_count)} OK → Step2: ส่งข้อมูลให้ AI จัดกลุ่ม...`);
        await new Promise(r => setTimeout(r, 700));
        await utils.keywords.listByProject.invalidate();
        const cr = await aiClusterize.mutateAsync({ projectId: pid, targetClusters, longtailCount });
        toast.dismiss(t2);
        const assigned = Number((cr as any)?.assigned_keywords ?? 0);
        const total = Number((cr as any)?.total_input_keywords ?? 0);
        if (assigned <= 0) {
          toast.error(`❌ 2-Step Plan: Step3 Clusterize 0/${total} assigned. ลองเพิ่ม keywords หรือ import seed ใหม่`);
          return;
        }
        toast.success(`🚀 2-Step Plan เสร็จหมด: Enrich ${Number((er as any).enriched_count)} คำ · Group ${Number((cr as any).pillar_count ?? 0)}P ${Number((cr as any).cluster_count ?? 0)}C ${Number((cr as any).supporting_count ?? 0)}S = ${assigned}/${total}`);
        const tInv2 = toast.loading(`🔄 อัปเดตรายการ Keywords + Clusters ใหม่ทันที...`);
        await utils.keywords.listByProject.invalidate();
        toast.dismiss(tInv2);
        setSelectedIds(new Set());
      } else {
        toast.dismiss(t);
        const warn = Array.isArray((er as any)?.errors) && (er as any).errors.length > 0 ? ` · SERP error=${(er as any).errors.length}` : '';
        toast.warning(`⚠️ Step1 Enrich=0/0 คำ (อาจเป็น Duplicate / SERP key ไม่ถูกต้อง)${warn} → ตรวจ SERP API key`);
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`2-Step Plan ล้มเหลว: ${String(e?.message ?? e).slice(0, 140)}`);
    }
  }

  async function handleClusterAction(c: any) {
    const kwId = Number(c.keywordId);
    if (!kwId || isNaN(kwId)) { toast.error("keyword id ไม่ถูกต้อง"); return; }
    if (!isAdmin) { toast.error("การเขียนบทความ / run research จำเป็นต้องเป็น Admin หรือ Owner เท่านั้น"); return; }
    if (runningKwIds.has(kwId) || runPlan.isPending || createDraft.isPending) {
      toast.warning("กำลังทำงานคำสั่งอื่นอยู่ รอสักครู่..."); return;
    }

    // ── USER RULE (VERBATIM): คลิกเขียน = ดึงคีย์ชุดนั้นไปที่หน้าเขียน เข้าสู่กระบวนการเขียนเท่านั้น ──
    // Pillar tier: มี PlayCircle Run Plan BUT ยังมี FilePenLine เขียนบทเหมือนกัน (no tier gate, no 2 step)
    // Redirect STRATEGY 2-LAYER guarantee: wouter setLocation IMMEDIATE → fallback 400ms hard nav
    toggleRun(kwId, true);
    const loading = toast.loading(`✍️ กำลังเตรียม Draft: ${String(c.keyword || '').slice(0, 40)}... → เข้าสู่กระบวนการเขียน (Step 1/6)`);
    try {
      const res = await createDraft.mutateAsync({ keywordId: kwId });
      toast.dismiss(loading);
      const dr = (res as any)?.draft_id ?? (res as any)?.draftId ?? null;
      if (!dr) {
        toast.warning(`สำเร็จ แต่ไม่มี draft_id response: ${JSON.stringify(res).slice(0, 120)}`);
        toggleRun(kwId, false);
        return;
      }
      const fromExisting = !!(res as any)?.from_existing;
      if (fromExisting) {
        toast.info(`📝 Draft มีอยู่แล้ว #${dr} → กำลังเปิดหน้าเขียน (กระบวนการ Step 1)...`, { duration: 3200 });
      } else {
        toast.success(`✅ Draft ใหม่ #${dr} สร้างเสร็จ! → กำลังเข้าสู่กระบวนการเขียน Step 1/6...`, { duration: 3200 });
      }
      // 👉 CRITICAL REDIRECT: ไป WritePage (6-step PIPELINE) ไม่ใช่ ArticleEditor (post-write pure edit)
      // ?kw_id=X for pre-fill keyword info, ?draft_id=Y for workflow
      const writePath = `/write?kw_id=${kwId}&draft_id=${dr}`;
      setLocation(writePath);
      window.setTimeout(() => {
        const cur = window.location.pathname + window.location.search;
        if (!cur.includes('/write') || !cur.includes(`kw_id=${kwId}`)) {
          window.location.assign(writePath);
        }
      }, 400);
    } catch (e: any) {
      toast.dismiss(loading);
      const emsg = String(e?.message ?? e ?? '').slice(0, 140);
      if (/SERP_AUTH_INVALID|403|Unauthorized|LLM_AUTH_INVALID/.test(emsg)) {
        toast.error(`🔑 Provider key: ${emsg}`);
      } else { toast.error(`Create Draft ล้มเหลว: ${emsg}`); }
    } finally { toggleRun(kwId, false); }
  }

  // ---------- Import CSV ----------
  function handleImportSelectProject(pid: number) {
    setImportProject(pid);
    setImportPreview([]); setImportFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }
  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setImportFileName(f.name);
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) { toast.warning("ไฟล์ CSV ว่างเปล่า"); return; }
    const first = lines[0].split(/[,\t;]/).map(s => s.trim().toLowerCase());
    const idxKeyword = Math.max(0, first.findIndex(h => /keyword|คำ/.test(h)));
    const idxVol = first.findIndex(h => /vol|search|volume|ปริมาณ/.test(h));
    const idxKD = first.findIndex(h => /kd|difficulty|difficult|คะแนน|diff/.test(h));
    let startLine = 0;
    if (/keyword|คำ|search|vol|kd|diff/i.test(lines[0])) startLine = 1;
    const preview: { keyword: string; volume?: number; difficulty?: number }[] = [];
    for (let i = startLine; i < Math.min(lines.length, startLine + 500); i++) {
      const parts = lines[i].split(/[,\t;]/).map(s => s.trim());
      const kw = parts[idxKeyword] ?? parts[0] ?? "";
      if (!kw || kw.length < 2) continue;
      const vol = idxVol >= 0 && parts[idxVol] ? parseInt(parts[idxVol].replace(/[^0-9]/g, ""), 10) : undefined;
      const kd = idxKD >= 0 && parts[idxKD] ? Math.min(100, Math.max(0, parseInt(parts[idxKD].replace(/[^0-9]/g, ""), 10))) : undefined;
      preview.push({ keyword: kw, ...(typeof vol === 'number' && !isNaN(vol) ? { volume: vol } : {}), ...(typeof kd === 'number' && !isNaN(kd) ? { difficulty: kd } : {}) });
    }
    setImportPreview(preview);
    toast.info(`📄 แก้วิเคราะห์ CSV ${lines.length} lines → ${preview.length} rows preview`);
  }
  async function handleRunImport() {
    if (!importProject || Number(importProject) <= 0) { toast.error("กรุณาเลือกโปรเจกต์ (project id ไม่ถูกต้อง — ต้องสร้างโปรเจกต์หรือเลือกก่อนนำเข้า)"); return; }
    if (importPreview.length === 0) { toast.warning("ไม่มีข้อมูล rows ที่จะ import"); return; }
    const t = toast.loading(`📤 กำลังนำเข้า ${importPreview.length} rows → project #${importProject} (Intent auto-detect ทุก row)...`);
    try {
      const res: any = await importCsvMut.mutateAsync({ projectId: Number(importProject), rows: importPreview });
      toast.dismiss(t);
      const insertedIds: number[] = Array.isArray(res.inserted_keyword_ids) ? (res.inserted_keyword_ids as number[]).filter(n => Number(n) > 0).slice(0, 500) : [];
      const insertN = Number(res.inserted ?? 0);
      const updateN = Number(res.updated ?? 0);
      const skipN = Number(res.skipped ?? 0);
      toast.success(`✅ นำเข้าเสร็จ: Insert ${insertN} · Update ${updateN} · Skip ${skipN} / Total ${res.total_rows} · Intent auto-detect ทั้งหมด` + (updateN>0 && insertN===0 ? ' (เป็น Duplicate → Intent patch แล้ว ไม่ต้องจัดกลุ่มซ้ำ)' : ''));
      setImportOpen(false); setImportPreview([]); setImportFileName(""); setImportProject(null);
      if (fileRef.current) fileRef.current.value = "";
      await utils.keywords.listByProject.invalidate();
      // #region debug-point kcp-aiclusterize-400-badrequest auto-cluster guard: ONLY if brand new inserted (no duplicates).
      if (insertN > 0 && aiClusterize && !aiClusterize.isPending && Number(importProject) > 0) {
        if (!(await assertProvidersReady('llm'))) {
          // LLM not ready: import OK, just skip auto-clusterize.
        } else try {
          const scopeText = insertedIds.length > 0 ? `${insertedIds.length} rows ใหม่ (Inserted)` : `unassigned ทั้ง Project (insert=${insertN})`;
          const t2 = toast.loading(`🧠 AI จัดกลุ่ม Tier/Intent/Cluster → ${scopeText}...`);
          const cr: any = insertedIds.length > 0
            ? await aiClusterize.mutateAsync({ projectId: Number(importProject), keywordIds: insertedIds, targetClusters, longtailCount })
            : await aiClusterize.mutateAsync({ projectId: Number(importProject), targetClusters, longtailCount });
          toast.dismiss(t2);
          if (cr?.zero_rows === true) toast.info(`ℹ️ Import OK, แต่ AI เลยจัดกลุ่ม (${String(cr?.reason_code ?? 'zero_rows')})`);
          else if (cr?.devFallback) toast.warning('⚠️ Tier/Intent heuristic ใช้งานแล้ว (LLM key → ข้าม AI hierarchy)');
          else {
            toast.success(`✅ Cluster: ${cr?.pillar_count ?? 0}P · ${cr?.cluster_count ?? 0}C · ${cr?.supporting_count ?? 0}S · assigned ${cr?.assigned_keywords ?? 0}/${cr?.total_input_keywords ?? insertN}`);
            const tInv3 = toast.loading(`🔄 อัปเดตรายการ Keywords + Clusters ใหม่ทันที...`);
            await utils.keywords.listByProject.invalidate();
            toast.dismiss(tInv3);
            setSelectedIds(new Set());
          }
        } catch (ce: any) { toast.warning(`⚠️ AI clusterize ข้าม (${String(ce?.message ?? ce).slice(0, 50)}). Intent heuristic ใช้แล้ว`); }
      }
      // #endregion debug-point kcp-aiclusterize-400-badrequest
    } catch (e: any) {
      toast.dismiss(t); toast.error(`Import CSV ล้มเหลว: ${String(e?.message ?? e).slice(0, 140)}`);
    }
  }

  // ---------- Add Keyword ----------
  async function handleRunAdd() {
    let kw = addText.trim();
    kw = kw.replace(/\s+/g, ' ');
    if (!kw || kw.length < 2) { toast.warning("กรุณาใส่ Keyword อย่างน้อย 2 ตัวอักษร"); return; }
    if (kw.length > 100) { toast.warning("Keyword ยาวเกิน 100 ตัวอักษร"); return; }
    if (projectId === "all" && projects.length > 0) setProjectId(Number(projects[0].id));
    const pid = projectId === "all" ? (addClusterId ? null : Number(projects[0]?.id ?? 0)) : Number(projectId);
    const dupCheck = dbKeywords.some(k =>
      (projectId === "all" || Number(k.projectId) === Number(pid)) &&
      String(k.keywordText || '').toLowerCase() === kw.toLowerCase()
    );
    if (dupCheck) { toast.warning(`⚠️ Keyword นี้มีอยู่แล้วในระบบ (duplicate)`); return; }
    let cid = addClusterId;
    if (!cid || cid <= 0) {
      const matching = clusters.find(c => Number(c.projectId) === pid && c.type === addTier);
      if (matching) cid = matching.id; else if (clusters.length > 0) cid = Number(clusters[0].id); else cid = 0;
    }
    let newKwId: number | null = null;
    if (!cid || cid <= 0) {
      // Fallback: NO cluster selected → route through importCsv (uses getOrCreateMarkerCluster FK-safe instead of dummy 0)
      const realPid = Number(pid || projects[0]?.id || 0);
      if (realPid <= 0) { toast.error("กรุณาสร้างหรือเลือกโปรเจกต์ก่อนเพิ่ม Keyword"); return; }
      const t = toast.loading("📝 เพิ่มคำหลัก → AI Intent detect → Auto clusterize (ถ้ามี LLM key)...");
      try {
        const r: any = await importCsvMut.mutateAsync({ projectId: realPid, rows: [{ keyword: kw }] });
        toast.dismiss(t);
        toast.success(`✅ เพิ่มคำหลักเสร็จ: Inserted ${r.inserted} / Updated ${r.updated}`);
        await utils.keywords.listByProject.invalidate();
        const insertedIds: number[] = Array.isArray(r.inserted_keyword_ids) ? (r.inserted_keyword_ids as number[]).filter(n => Number(n) > 0) : [];
        if (insertedIds.length === 0 && r.inserted > 0 && Number(pid) > 0) {
          await new Promise(res => setTimeout(res, 600));
          await utils.keywords.listByProject.invalidate();
        }
        const finalIds: number[] = insertedIds.length > 0 ? insertedIds : (() => {
          const fresh: DbKeyword[] = (kwListQ.data?.keywords ?? []) as DbKeyword[];
          const hit = fresh.find(k => String(k.keywordText || '').toLowerCase() === kw.toLowerCase() && (Number(pid) <= 0 || Number(k.projectId) === Number(pid)));
          return hit && Number(hit.id) > 0 ? [Number(hit.id)] : [];
        })();
        if (Number(pid) > 0 && finalIds.length > 0 && aiClusterize && !aiClusterize.isPending) {
          if (!(await assertProvidersReady('llm'))) {
            // import already succeeded, just skip auto-clusterize silently
          } else try {
            const t2 = toast.loading(`🧠 AI จัดกลุ่ม keyword ใหม่ทันที ("${kw.slice(0, 24)}") → Tier/Intent/Cluster...`);
            const cr: any = await aiClusterize.mutateAsync({ projectId: Number(pid), keywordIds: finalIds.slice(0, 500), targetClusters, longtailCount });
            toast.dismiss(t2);
            if (cr?.devFallback) toast.warning('⚠️ Intent heuristic ถูกตั้งค่าแล้ว (LLM key → ข้าม AI cluster hierarchy)');
            else {
              toast.success(`✅ Auto-cluster: ${cr?.pillar_count ?? 0}P/${cr?.cluster_count ?? 0}C/${cr?.supporting_count ?? 0}S · assigned ${cr?.assigned_keywords ?? 0}`);
              const tInv4 = toast.loading(`🔄 อัปเดตรายการ Keywords + Clusters ใหม่ทันที...`);
              await utils.keywords.listByProject.invalidate();
              toast.dismiss(tInv4);
              setSelectedIds(new Set());
            }
          } catch (ce: any) { toast.warning(`⚠️ AI clusterize skip (${String(ce?.message ?? ce).slice(0, 40)}). Intent heuristic ใช้ได้แล้ว`); }
        }
      } catch (e: any) { toast.dismiss(t); toast.error(String(e?.message ?? e).slice(0, 140)); return; }
      setAddOpen(false); setAddText(""); setAddTier("supporting"); setAddIntent("informational"); setAddClusterId(null); return;
    }
    const t = toast.loading(`📝 เพิ่มคำหลัก "${kw.slice(0, 32)}" tier=${addTier} → Auto intent detect...`);
    try {
      const res: any = await createKwMut.mutateAsync({ clusterId: cid, keywordText: kw, intent: addIntent, status: "pending" });
      newKwId = Number(res?.keywordId ?? 0) > 0 ? Number(res.keywordId) : null;
      toast.dismiss(t);
      toast.success(`✅ เพิ่ม Keyword ใหม่สำเร็จ! (Intent auto-detect + Tier จาก cluster type แล้ว)`);
      await utils.keywords.listByProject.invalidate();
      if (Number(pid) > 0 && newKwId && aiClusterize && !aiClusterize.isPending) {
        if (!(await assertProvidersReady('llm'))) {
          // saved OK, skip fine-tune auto AI clusterize silently
        } else try {
          const t2 = toast.loading(`🧠 Fine-tune Tier/Intent via AI clusterize post-save...`);
          await aiClusterize.mutateAsync({ projectId: Number(pid), keywordIds: [newKwId], targetClusters, longtailCount });
          toast.dismiss(t2);
          const tInv5 = toast.loading(`🔄 อัปเดตรายการ Keywords + Clusters ใหม่ทันที...`);
          await utils.keywords.listByProject.invalidate();
          toast.dismiss(tInv5);
          setSelectedIds(new Set());
        } catch (_ce) { /* noop — intent already heuristic */ }
      }
    } catch (e: any) { toast.dismiss(t); toast.error(`Create keyword ล้มเหลว: ${String(e?.message ?? e).slice(0, 140)}`); return; }
    setAddOpen(false); setAddText(""); setAddTier("supporting"); setAddIntent("informational"); setAddClusterId(null);
  }

  // ---------- Inline Edit Tier ----------
  async function handleInlineTier(c: any, tier: ClusterTier) {
    try {
      await updateTierMut.mutateAsync({ id: Number(c.keywordId), tier });
      toast.success(`✅ อัปเดต Tier เป็น ${TIER_STYLES[tier].label} สำเร็จ`);
    } catch (e: any) { toast.error(`Update Tier ล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`); }
  }
  async function handleInlineIntent(c: any, intent: (typeof INTENTS[number]["key"])) {
    try {
      await updateKwMut.mutateAsync({ id: Number(c.keywordId), patch: { intent } });
      toast.success(`✅ อัปเดต Intent เป็น ${intent} สำเร็จ`);
    } catch (e: any) { toast.error(`Update Intent ล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`); }
  }

  // ---------- Batch Actions ----------
  async function handleBatchTier() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const t = toast.loading(`🧰 Set Tier ${batchTier} ทั้งหมด ${ids.length} rows...`);
    try {
      const r = await bulkTierMut.mutateAsync({ ids, tier: batchTier });
      toast.dismiss(t); toast.success(`✅ Set Tier ${batchTier} สำเร็จ: affected ${r.affected}`);
      clearSelection(); setBatchOpen(false);
    } catch (e: any) { toast.dismiss(t); toast.error(`Batch Set Tier ล้มเหลว: ${String(e?.message ?? e).slice(0, 140)}`); }
  }
  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const t = toast.loading(`🗑️ Batch Delete ${ids.length} keywords...`);
    try {
      const r = await bulkDelMut.mutateAsync({ ids });
      toast.dismiss(t); toast.success(`✅ Batch Delete สำเร็จ: affected ${r.affected}`);
      clearSelection(); setBatchOpen(false);
    } catch (e: any) {
      toast.dismiss(t);
      const em = String(e?.message ?? e).slice(0, 140);
      if (/referenced by.*article|Cannot delete keyword|foreign.*key/i.test(em)) {
        toast.error(`❌ Batch Delete ล้มเหลว: ${em}`);
      } else toast.error(`Batch Delete ล้มเหลว: ${em}`);
    }
  }
  function handleBatchExport(opts?: { format?: 'csv'|'json'; scope?: 'all'|'filtered' }) {
    const { format = 'csv', scope = 'all' } = opts ?? {};
    if (totalKeywords === 0) { toast.warning("ไม่มีข้อมูลจากฐานข้อมูลสำหรับ Export — Import CSV หรือ Add Keyword ก่อน"); return; }
    let rows: { keywordText: string; tier: any; intentSuggestion: any; searchVolume: any; difficulty: any; status: any; clusterId: any }[];
    if (scope === 'filtered') {
      rows = allCards.map(c => ({
        keywordText: c.keyword,
        tier: c.tier,
        intentSuggestion: c.intent,
        searchVolume: c.vol,
        difficulty: c.kd,
        status: c.keywordObj?.status ?? null,
        clusterId: c.keywordObj?.clusterId ?? null,
      }));
    } else {
      rows = dbKeywords.map(k => ({
        keywordText: k.keywordText,
        tier: k.tier ?? '',
        intentSuggestion: k.intentSuggestion ?? '',
        searchVolume: k.searchVolume ?? '',
        difficulty: k.difficulty ?? '',
        status: k.status ?? '',
        clusterId: k.clusterId ?? '',
      }));
    }
    if (format === 'csv') {
      const header = ["keyword", "tier", "intent", "search_volume", "kd_difficulty", "status", "clusterId"];
      const csvRows = rows.map(r => [r.keywordText, r.tier, r.intentSuggestion, r.searchVolume, r.difficulty, r.status, r.clusterId]);
      const csv = [header, ...csvRows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kcp_keywords_${projectId}_${scope}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast.success(`📥 Export CSV ${scope} ${rows.length} rows สำเร็จ!`);
    } else {
      const payload = {
        exported_at: new Date().toISOString(),
        project_id: projectId,
        scope,
        filters_applied: { tierFilter, intentFilter, q: search, projectId },
        count: rows.length,
        rows,
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kcp_keywords_${projectId}_${scope}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast.success(`📥 Export JSON ${scope} ${rows.length} rows สำเร็จ!`);
    }
  }

  // ─── Export Plan JSON (OLD SEO E style: clusters + nested longtail keywords) ───
  function handleExportClusterPlan() {
    if (dbKeywords.length === 0) { toast.warning("ไม่มี Keywords ให้บันทึกเป็น Plan"); return; }
    const unassignedName = UNASSIGNED_CLUSTER_NAME;
    const clusterGroups = new Map<number, { clusterId: number; name: string; type: ClusterTier; mainKeyword: string; items: DbKeyword[]; parentId: number | null }>();
    for (const k of dbKeywords) {
      const cid = Number(k.clusterId) || 0;
      if (!clusterGroups.has(cid)) {
        const c = cid > 0 ? clustersById[cid] : null;
        clusterGroups.set(cid, {
          clusterId: cid,
          name: cid === 0 ? unassignedName : c?.name || `Cluster #${cid}`,
          type: (cid > 0 ? (c?.type || 'cluster') : (k.tier || 'cluster')) as ClusterTier,
          mainKeyword: k.tier === 'pillar' || k.isTarget ? k.keywordText : (c?.name || ''),
          items: [],
          parentId: cid > 0 ? (c?.parentId || null) : null,
        });
      }
      clusterGroups.get(cid)!.items.push(k);
    }
    const arr = Array.from(clusterGroups.values()).sort((a, b) => {
      const tierW = { pillar: 0, cluster: 1, supporting: 2 };
      return tierW[a.type] - tierW[b.type] || a.clusterId - b.clusterId;
    });
    const clustersOut = arr.map(g => ({
      id: g.clusterId,
      name: g.name,
      main_keyword: g.mainKeyword || (g.items[0]?.keywordText ?? ''),
      role: g.type,
      parent_cluster_id: g.parentId,
      category: pickCategoryLabel(g.items[0]?.categoryId ?? null),
      total_keywords: g.items.length,
      items: g.items.map(k => ({
        keyword: k.keywordText,
        tier: k.tier || 'supporting',
        intent: k.intentSuggestion ?? null,
        search_volume: k.searchVolume ?? null,
        difficulty: k.difficulty ?? null,
        is_target: !!k.isTarget,
        status: k.status ?? 'pending',
      })),
    }));
    const stats = {
      total_clusters: clustersOut.length,
      pillar: clustersOut.filter(c => c.role === 'pillar').length,
      cluster: clustersOut.filter(c => c.role === 'cluster').length,
      supporting: clustersOut.filter(c => c.role === 'supporting').length,
      total_keywords: clustersOut.reduce((s, c) => s + c.total_keywords, 0),
    };
    const plan = {
      exported_at: new Date().toISOString(),
      project_id: projectId,
      schema: 'cluster_plan_v2',
      generated_by: 'EEAT Studio KCP Seed Panel',
      stats,
      clusters: clustersOut,
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    const d = new Date();
    a.download = `kcp_cluster_plan_${projectId}_${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`📥 Export Cluster Plan สำเร็จ: ${stats.pillar}P · ${stats.cluster}C · ${stats.supporting}S = ${stats.total_keywords} คำหลัก / ${stats.total_clusters} กลุ่ม`);
  }

  // ─── Seed Panel Handlers (OLD SEO E AI seed input pattern) ───
  function handleSeedAdd() {
    const lines = seedInput.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 1 && !seedKeywords.includes(k));
    if (lines.length === 0) { toast.warning("กรุณาใส่ seed keyword (บรรทัดละคำ หรือคั่นด้วย ,)"); return; }
    setSeedKeywords(prev => {
      const set = new Set(prev); for (const l of lines) set.add(l);
      return Array.from(set);
    });
    setSeedInput("");
    toast.success(`➕ เพิ่ม ${lines.length} seed keywords (รวมทั้งหมด ${seedKeywords.length + lines.length})`);
  }
  function handleSeedRemove(kw: string) { setSeedKeywords(prev => prev.filter(k => k !== kw)); }
  function handleSeedClearAll() { setSeedKeywords([]); setSeedInput(""); toast.success("เคลียร์ Seed ทั้งหมด"); }
  async function handleSeedRunAutoGroup() {
    if (seedKeywords.length === 0) { toast.error("กรุณาเพิ่ม seed keywords ก่อน"); return; }
    if (projectId === "all") { toast.error("กรุณาเลือกโปรเจกต์เดียวก่อน (ไม่สามารถส่ง 'ทุกโปรเจกต์' ไปให้ AI ได้)"); return; }
    if (enrichSerp.isPending || aiClusterize.isPending || importCsvMut.isPending) { toast.warning("กำลังทำงานคำสั่งอื่นอยู่ รอ..."); return; }
    setSeedRunning(true);
    const pid = Number(projectId);
    const t = toast.loading(`🚀 Seed Panel Step 1/4: นำเข้า ${seedKeywords.length} seed keywords...`);
    try {
      const rows = seedKeywords.map(k => ({ keyword: k }));
      const importRes: any = await importCsvMut.mutateAsync({ projectId: pid, rows });
      const insertedIds: number[] = Array.isArray(importRes.inserted_keyword_ids) ? (importRes.inserted_keyword_ids as number[]).filter(n => Number(n) > 0) : [];
      const insertN = Number(importRes.inserted ?? 0);
      const skipN = Number(importRes.skipped ?? 0);
      const updateN = Number(importRes.updated ?? 0);
      toast.dismiss(t);

      let cr: any = null;
      if (insertN === 0 && (insertedIds.length === 0)) {
        toast.success(`✅ Seed ทั้งหมดเป็นคำซ้ำ (Skip ${skipN}) — ไม่เหลือคำใหม่ให้จัดกลุ่ม`);
      } else {
        await utils.keywords.listByProject.invalidate();
        await new Promise(r => setTimeout(r, 300));
        const t2 = toast.loading(`✅ Step1 Import ${insertN} New / ${skipN} Skip / ${updateN} Update → Step2/4: Auto-Enrich SERP ก่อน AI...`);
        const allNewIds = insertedIds.length > 0
          ? insertedIds
          : (Array.isArray((importRes as any).keyword_ids) ? ((importRes as any).keyword_ids as number[]).filter(n => Number(n) > 0) : []);
        const needIds = allNewIds.slice(0, Math.min(100, allNewIds.length));
        try {
          if (needIds.length > 0) {
            await enrichSerp.mutateAsync({ projectId: pid, keywordIds: needIds });
          }
          toast.dismiss(t2);
          await utils.keywords.listByProject.invalidate();
          await new Promise(r => setTimeout(r, 300));
          const t3 = toast.loading(`✅ Step2 Enrich OK → Step3/4: AI จัดกลุ่ม 3-Tier (${targetClusters} cluster · ${longtailCount} longtail/cluster)...`);
          cr = await aiClusterize.mutateAsync({ projectId: pid, keywordIds: needIds.length > 0 ? needIds : undefined, targetClusters, longtailCount });
          toast.dismiss(t3);
        } catch (serpErr: any) {
          toast.dismiss(t2);
          toast.warning(`⚠️ Step2 Enrich ผิดพลาด (${String(serpErr?.message ?? serpErr).slice(0, 90)}) → ยังคงเริ่ม AI จัดกลุ่มโดยไม่มี SV/KD ต่อไป...`);
          await new Promise(r => setTimeout(r, 250));
          cr = await aiClusterize.mutateAsync({ projectId: pid, keywordIds: needIds.length > 0 ? needIds : undefined, targetClusters, longtailCount });
        }
      }

      setSeedKeywords([]); setSeedInput(""); setShowSeedPanel(false);
      if (cr) {
        const assigned = Number(cr.assigned_keywords ?? 0);
        const total = Number(cr.total_input_keywords ?? 0);
        if (assigned <= 0 && total > 0) {
          toast.error(`❌ Seed Plan: Import ${insertN} Skip ${skipN} → AI Clusterize 0/${total} assigned (ลองเพิ่มจำนวน seed >3 คำ หรือคำไม่ซ้ำกัน)`);
        } else {
          toast.success(`✅ Seed Plan เสร็จหมด: Import ${insertN} · Skip ${skipN} · Group → ${cr.pillar_count ?? 0}P ${cr.cluster_count ?? 0}C ${cr.supporting_count ?? 0}S = ${assigned}/${total ?? seedKeywords.length}`);
        }
      }
      await utils.keywords.listByProject.invalidate();
    } catch (e: any) { toast.dismiss(t); toast.error(`Seed AI Group ล้มเหลว: ${String(e?.message ?? e).slice(0, 140)}`); }
    finally { setSeedRunning(false); }
  }

  // Keyboard Shortcuts (F=search, N=new, E=hint, D=delete, Ctrl+A=select, Ctrl+S=prevent)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isText = ['INPUT','TEXTAREA','SELECT'].includes((e.target as any)?.tagName) || (e.target as any)?.isContentEditable;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'a') {
        if (!isText) {
          e.preventDefault();
          const ids = allCards.map(c => Number(c.keywordId)).filter(id => id > 0);
          if (ids.length > 0) { selectAll(ids); toast.success(`✅ Select All ${ids.length} rows (Ctrl+A)`); }
        }
        return;
      }
      if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); return; }
      if (isText) return;
      const k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); searchInputRef.current?.focus(); toast('🔍 Focus Search (F)'); return; }
      if (k === 'n') { e.preventDefault(); setAddOpen(true); toast('➕ New Keyword (N)'); return; }
      if (k === 'e') { e.preventDefault(); toast(selectedIds.size>0 ? `📝 Edit ${selectedIds.size} selected (E) — set tier/cluster via Batch menu` : '⚠️ เลือก row ก่อน (Spacebar หรือ checkbox)'); return; }
      if (k === 'delete' || k === 'backspace' || k === 'd') {
        if (selectedIds.size > 0) { e.preventDefault(); handleBatchDelete(); return; }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [allCards, selectedIds]);

  // ---------- Tree Grouping ----------
  function treeGroup(cards: typeof allCards) {
    type Node = { key: string; tier: ClusterTier; card?: any; children?: Node[]; keywordIds?: number[] };
    const pillars: Node[] = [];
    // Use clusters parent_id hierarchy for real clusters, fallback to tier bucket
    const realTier = (c: any) => (c.keywordObj?.tier as ClusterTier) || c.tier || 'supporting';
    const byParent = new Map<ClusterTier, typeof cards>();
    byParent.set('pillar', []); byParent.set('cluster', []); byParent.set('supporting', []);
    for (const c of cards) {
      const t = realTier(c);
      byParent.get(t === 'pillar' ? 'pillar' : t === 'cluster' ? 'cluster' : 'supporting')!.push(c);
    }
    const cList = byParent.get('cluster') || [];
    const sList = byParent.get('supporting') || [];
    // If clusters DB exists with parentId — map accordingly
    if (Object.keys(clustersById).length > 1) {
      for (const k of dbKeywords.filter(k => (k.tier || '') === 'pillar')) {
        const card = mapToCard(k);
        const pillarId = Number(k.id);
        const childClusters: Node[] = [];
        for (const cluster of clusters.filter(c => {
          const cpid = Number(c.parentId);
          return Number.isFinite(cpid) && cpid === pillarId;
        })) {
          const childKws = dbKeywords.filter(ck => Number(ck.clusterId) === Number(cluster.id) && ck.tier !== 'pillar');
          const clusterTierKw = childKws.find(ck => ck.tier === 'cluster');
          const clusterCard = clusterTierKw ? mapToCard(clusterTierKw) : ({
            id: `cluster-${cluster.id}`, tier: 'cluster', projectId: cluster.projectId, keywordId: -cluster.id,
            keyword: cluster.name || `Cluster ${cluster.id}`, intent: 'informational', kd: 0, vol: 0,
            svSource: SOURCES[4], kdSource: SOURCES[4], supporting: 0, style: TIER_STYLES.cluster, keywordObj: { id: -cluster.id, keywordText: cluster.name, tier: 'cluster' } as any, clusterRow: cluster
          });
          const childSupps: Node[] = childKws.filter(ck => ck.tier !== 'cluster').map(ck => ({
            key: `s-${ck.id}`, tier: 'supporting' as const, card: mapToCard(ck)
          }));
          childClusters.push({ key: `cl-${cluster.id}`, tier: 'cluster', card: clusterCard, children: childSupps });
        }
        pillars.push({ key: `p-${pillarId}`, tier: 'pillar', card, children: childClusters });
      }
      if (pillars.length === 0) {
        for (const pc of byParent.get('pillar')!) {
          const pId = Number(pc.keywordId);
          pillars.push({ key: `p-${pId}`, tier: 'pillar', card: pc, children: [] });
        }
      }
    } else {
      // Fallback bucket grouping
      const buckets = byParent;
      const p = buckets.get('pillar') || [];
      for (const pc of p) {
        const pId = Number(pc.keywordId);
        pillars.push({ key: `p-${pId}`, tier: 'pillar', card: pc, children: [] });
      }
    }
    return pillars;
  }

  function toggleExpand(id: number, which: "pillar" | "cluster") {
    if (!Number.isFinite(id)) return;
    if (which === "pillar") setExpandedPillars(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
    else setExpandedClusters(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  }

  // ---------- TREE VIEW INLINE CLUSTER HELPERS ----------
  const currentProjectClusterRows = useMemo(() => {
    const rows: any[] = Array.isArray((kwListQ.data as any)?.clusters) ? (kwListQ.data as any).clusters : [];
    const pids: number[] = Array.isArray((kwListQ.data as any)?.projectIds) ? (kwListQ.data as any).projectIds : [];
    if (projectId === "all") return rows;
    return rows.filter(r => Number(r.projectId) === Number(projectId));
  }, [projectId, kwListQ.data]);

  const currentProjectKeywords = useMemo(() => {
    const rows: any[] = Array.isArray((kwListQ.data as any)?.keywords) ? (kwListQ.data as any).keywords : [];
    if (projectId === "all") return rows;
    return rows.filter(r => Number(r.projectId) === Number(projectId));
  }, [projectId, kwListQ.data]);

  const unassignedClusterId = useMemo<number | null>(() => {
    const found = currentProjectClusterRows.find((c: any) => String(c.name ?? "") === UNASSIGNED_CLUSTER_NAME);
    return found ? Number(found.id) : null;
  }, [currentProjectClusterRows]);

  function kwsForCluster(clusterId: number): any[] {
    return currentProjectKeywords.filter(k => Number(k.clusterId) === Number(clusterId));
  }
  function getAllDescendantClusterIds(parentId: number): Set<number> {
    const set = new Set<number>();
    function walk(pid: number) {
      set.add(Number(pid));
      const children = childClusters(pid);
      for (const ch of children) walk(Number(ch.id));
    }
    walk(Number(parentId));
    return set;
  }
  function kwsRecursiveForCluster(clusterId: number): any[] {
    const ids = getAllDescendantClusterIds(Number(clusterId));
    return currentProjectKeywords.filter(k => ids.has(Number(k.clusterId)));
  }
  function kwsUnassigned(): any[] {
    return currentProjectKeywords.filter((k: any) => {
      const id = Number(k.clusterId);
      if (!k.clusterId || id === 0) return true;
      if (unassignedClusterId !== null && id === Number(unassignedClusterId)) return true;
      return false;
    });
  }
  function childClusters(parentId: number | null): any[] {
    const normalized = (parentId === undefined || parentId === 0 || Number(parentId) <= 0 || !Number.isFinite(Number(parentId))) ? null : Number(parentId);
    return currentProjectClusterRows.filter((c: any) => {
      if (String(c.name ?? "") === UNASSIGNED_CLUSTER_NAME) return false;
      const cpid = Number(c.parentId);
      if (normalized === null) return !cpid || cpid === 0 || !Number.isFinite(cpid);
      return Number.isFinite(cpid) && cpid === normalized;
    });
  }

  function startRenameCluster(cluster: any) {
    setEditingClusterId(Number(cluster.id));
    setEditingClusterName(String(cluster.name ?? ""));
  }
  function cancelRenameCluster() {
    setEditingClusterId(null);
    setEditingClusterName("");
  }
  async function saveRenameCluster(clusterId: number) {
    const name = editingClusterName.trim();
    if (!name) { toast.error("ชื่อกลุ่มห้ามว่าง"); return; }
    try {
      await clusterUpdateMut.mutateAsync({ id: clusterId, patch: { name } });
      toast.success(`✅ ตั้งชื่อกลุ่มใหม่สำเร็จ: ${name}`);
    } catch (e: any) { toast.error(`❌ เปลี่ยนชื่อล้มเหลว: ${String(e?.message ?? e).slice(0, 160)}`); }
    setEditingClusterId(null);
    setEditingClusterName("");
  }

  function openAddCluster(mode: "top_pillar" | "pillar_parent" | "cluster_parent", parentId: number | null = null) {
    if (projectId === "all") { toast.error("กรุณาเลือกโปรเจกต์เดียว (ไม่ใช่ 'ทุกโปรเจกต์') ก่อนเพิ่มกลุ่ม"); return; }
    setAddClusterParentType(mode);
    setAddClusterParentId(parentId);
    setAddClusterName("");
    setAddClusterDialogOpen(true);
  }

  async function submitAddCluster() {
    const name = addClusterName.trim();
    if (!name) { toast.error("กรุณากรอกชื่อกลุ่ม"); return; }
    if (projectId === "all") return;
    const pid = Number(projectId);
    let type: ClusterTier = "pillar";
    let parentId: number | null = null;
    if (addClusterParentType === "top_pillar") { type = "pillar"; parentId = null; }
    else if (addClusterParentType === "pillar_parent") { type = "cluster"; parentId = addClusterParentId; }
    else if (addClusterParentType === "cluster_parent") { type = "supporting"; parentId = addClusterParentId; }
    try {
      await clusterCreateMut.mutateAsync({ projectId: pid, name, type, parentId: parentId ?? undefined });
      toast.success(`✅ เพิ่มกลุ่ม ${TIER_STYLES[type].label} ใหม่สำเร็จ: ${name}`);
      setAddClusterDialogOpen(false);
    } catch (e: any) {
      toast.error(`❌ เพิ่มกลุ่มล้มเหลว: ${String(e?.message ?? e).slice(0, 160)}`);
    }
  }

  function requestDeleteCluster(clusterId: number) {
    setConfirmDeleteClusterId(Number(clusterId));
  }
  async function applyDeleteCluster() {
    const id = confirmDeleteClusterId;
    if (!id) return;
    try {
      await clusterDeleteMut.mutateAsync({ id });
      toast.success(`✅ ลบกลุ่ม (Id: ${id}) สำเร็จ`);
    } catch (e: any) {
      toast.error(`❌ ลบกลุ่มล้มเหลว: ${String(e?.message ?? e).slice(0, 200)}`);
    }
    setConfirmDeleteClusterId(null);
  }

  async function changeClusterType(clusterId: number, newType: ClusterTier, cluster: any) {
    const parentId: number | null = newType === "pillar" ? null : (cluster.parentId ?? null);
    try {
      await clusterUpdateMut.mutateAsync({ id: clusterId, patch: { type: newType as any, parentId: (parentId === null || parentId === 0) ? undefined : (Number(parentId) as any) } });
      toast.success(`✅ เปลี่ยน Tier เป็น ${TIER_STYLES[newType].label} สำเร็จ`);
    } catch (e: any) { toast.error(`❌ เปลี่ยน Tier ล้มเหลว: ${String(e?.message ?? e).slice(0, 180)}`); }
  }

  async function changeClusterParent(clusterId: number, newParentId: number | null, cluster: any) {
    const type = (cluster.type as ClusterTier) || "cluster";
    try {
      await clusterUpdateMut.mutateAsync({ id: clusterId, patch: { parentId: newParentId === null || newParentId === 0 ? (undefined as any) : (Number(newParentId) as any), type: type as any } });
      toast.success(`✅ เปลี่ยน Parent กลุ่มสำเร็จ`);
    } catch (e: any) { toast.error(`❌ เปลี่ยน Parent ล้มเหลว: ${String(e?.message ?? e).slice(0, 180)}`); }
  }

  async function moveKeywordToCluster(keywordId: number, newClusterId: number | null) {
    try {
      await updateKwMut.mutateAsync({ id: Number(keywordId), patch: { clusterId: (newClusterId === null ? 0 : Number(newClusterId)) as any } });
      toast.success(`✅ ย้าย Keyword เข้ากลุ่มสำเร็จ`);
    } catch (e: any) { toast.error(`❌ ย้าย Keyword ล้มเหลว: ${String(e?.message ?? e).slice(0, 180)}`); }
  }
  async function changeKeywordIntent(keywordId: number, intent: any) {
    try {
      await updateKwMut.mutateAsync({ id: Number(keywordId), patch: { intent } });
      toast.success(`✅ ตั้ง Intent = ${(INTENTS.find(i=>i.key===intent)?.label)||intent} สำเร็จ`);
    } catch (e: any) { toast.error(`❌ เปลี่ยน Intent ล้มเหลว: ${String(e?.message ?? e).slice(0, 160)}`); }
  }

  // ======================================================================
  // SHARED VIEW STANDALONE MODE — Guest No-Login Required
  // Bypasses MainDashboardShell auth redirect guard entirely.
  // URL: /kcp#share=<base64>
  // ======================================================================
  if (isSharedView) {
    const sharedKws = sharedPayload?.keywords ?? [];
    const sharedFiltered = sharePreviewFiltered;
    const spillar = sharedKws.filter(k => (k.tier || "") === "pillar").length;
    const scluster = sharedKws.filter(k => (k.tier || "") === "cluster").length;
    const ssupporting = sharedKws.filter(k => (k.tier || "") === "supporting").length;
    const stotal = sharedKws.length;
    const projName = sharedPayload?.projectName || "Shared Project";
    const sharedAt = sharedPayload?.sharedAt ? new Date(sharedPayload.sharedAt) : null;
    const sharedCards = sharedFiltered.map(k => mapToCard(k));

    return (
      <div className="min-h-screen w-full bg-[#fbf8f4] text-stone-900">
        <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#fbf8f4]/85 backdrop-blur-sm shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_4px_16px_-10px_rgba(180,83,9,0.15)]">
          <div className="px-8 py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/" className="flex items-center gap-3 shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#b45309] to-[#d97706] text-white grid place-items-center shadow-sm">
                  <CheckCircle2 className="size-5" />
                </div>
                <div className="leading-tight">
                  <p className="font-semibold text-[15px] text-stone-900">EEAT Studio</p>
                  <p className="text-[11px] text-stone-500">V2 · Shared View</p>
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <h1 className="text-[22px] font-bold text-stone-900 tracking-tight font-[Playfair_Display,_serif]">
                  <Share2 className="size-5 inline mr-2 text-amber-700" /> {projName}
                </h1>
                <p className="text-[13px] text-stone-600 mt-1">
                  คำหลัก {stotal} คำ · Shared View (Read-Only) · ไม่ต้องเข้าสู่ระบบ
                  {sharedAt && ` · แชร์เมื่อ ${sharedAt.toLocaleString('th-TH')}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm" className="!h-9 !rounded-lg !text-[12.5px]">
                  <Link href="/login"><LogIn className="size-3.5 mr-1.5" /> เข้าสู่ระบบ / ใช้งานเต็มรูปแบบ</Link>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="px-8 py-6 max-w-[1600px] mx-auto">
          <Alert className="mb-5 !rounded-xl !bg-sky-50 !border-sky-200">
            <Eye className="size-5 text-sky-700" />
            <AlertTitle className="!text-sky-900 !text-[14px] font-semibold flex items-center gap-2">
              <ShieldCheck className="size-4" /> Shared View Mode — Read-Only (Guest Access)
            </AlertTitle>
            <AlertDescription className="!text-sky-800 !text-[13px] mt-1">
              คุณกำลังมองเห็นข้อมูล Keywords / Clusters ที่ถูกแชร์ผ่านลิงก์ URL (Base64 Encode ใน URL Hash) —
              ไม่ต้อง Login · ไม่ต้องต่อฐานข้อมูล · ไม่สามารถแก้ไขข้อมูลได้ · หากต้องการแก้ไขหรือเขียนบทความ
              <Link href="/login" className="font-semibold underline ml-1">เข้าสู่ระบบที่นี่</Link>
            </AlertDescription>
          </Alert>

          {shareError && (
            <Alert className="mb-5 !rounded-xl !bg-rose-50 !border-rose-200">
              <AlertTriangle className="size-5 text-rose-700" />
              <AlertTitle className="!text-rose-900 !text-[14px] font-semibold">ลิงก์แชร์ไม่ถูกต้อง</AlertTitle>
              <AlertDescription className="!text-rose-800 !text-[13px] mt-1">{shareError}</AlertDescription>
            </Alert>
          )}

          {!shareError && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Pillar", val: spillar, Icon: Crown, color: TIER_STYLES.pillar },
                  { label: "Cluster", val: scluster, Icon: Layers, color: TIER_STYLES.cluster },
                  { label: "Supporting", val: ssupporting, Icon: BookOpen, color: TIER_STYLES.supporting },
                  { label: "รวมคำหลัก", val: stotal, Icon: Hash, color: { label: "Total", border: "#475569", bg: "#f5f5f4", text: "#1c1917" } },
                ].map(({ label, val, Icon, color }) => (
                  <Card key={label} className="!rounded-xl !border-stone-200 !bg-white !shadow-sm">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg grid place-items-center" style={{ backgroundColor: color.bg, color: color.text }}>
                        <Icon className="size-4.5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10.5px] uppercase tracking-wider text-stone-500">{label}</p>
                        <p className="text-lg font-bold text-stone-900">{val}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm mb-5">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                      <Input
                        placeholder="🔍 ค้นหา Keyword ในลิงก์แชร์นี้..."
                        value={shareSearch}
                        onChange={e => setShareSearch(e.target.value)}
                        className="!h-9 !pl-9 !rounded-lg"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Filter className="size-3.5 text-stone-500 mr-1" />
                      {(["all", "pillar", "cluster", "supporting"] as TierFilter[]).map(t => {
                        const active = shareTierFilter === t;
                        const label = t === "all" ? "ทุก Tier" : TIER_STYLES[t as ClusterTier].label;
                        return (
                          <Button key={t} size="sm" variant={active ? "default" : "ghost"} className={`!h-8 !rounded-full !px-3 !text-[12px] ${active ? '' : 'text-stone-600 hover:!bg-stone-100'}`} onClick={() => setShareTierFilter(t)}>
                            {t !== "all" && (() => { const Ic = TIER_STYLES[t as ClusterTier].icon; return <Ic className="size-3 mr-1.5" />; })()}
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                    <select value={shareIntentFilter} onChange={e => setShareIntentFilter(e.target.value as IntentFilter)} className="h-8 !rounded-full border border-stone-300 px-3 text-[12px] bg-white focus:outline-none">
                      <option value="all">ทุก Intent</option>
                      {INTENTS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                    </select>
                    <Badge variant="outline" className="!rounded-full !text-[11.5px] !px-2.5 !h-7 !bg-stone-50 border-stone-200">
                      {sharedFiltered.length} / {stotal} Results
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sharedCards.map(c => {
                  const intentMeta = INTENTS.find(i => i.key === c.intent)!;
                  return (
                    <Card
                      key={c.id}
                      className="!rounded-2xl !bg-white !shadow-sm overflow-hidden opacity-95"
                      style={{ borderLeft: `4px solid ${c.style.border}` }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="px-2 py-1 rounded-md text-[10.5px] font-bold inline-flex items-center gap-1" style={{ backgroundColor: c.style.bg, color: c.style.text }}>
                            <c.style.icon className="size-3" /> {c.style.label}
                          </span>
                          <Badge variant="outline" className="!rounded-full !text-[10.5px] !border-transparent" style={{ backgroundColor: `${intentMeta.color}12`, color: intentMeta.color }}>
                            Intent: {intentMeta.label}
                          </Badge>
                          <span className="flex-1" />
                          <Badge variant="secondary" className="!rounded-full !text-[10px]">
                            <TrendingUp className="size-3 mr-1" /> Vol: {c.vol.toLocaleString()}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-[14.5px] text-stone-900 mb-2 leading-snug line-clamp-2">{c.keyword}</h3>
                        <div className="space-y-2">
                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10.5px] uppercase tracking-wider text-stone-500">Keyword Difficulty</span>
                              <span className="text-[11.5px] font-semibold text-stone-800">{c.kd}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Number(c.kd) || 0}%`, backgroundColor: (Number(c.kd) || 0) >= 70 ? "#dc2626" : (Number(c.kd) || 0) >= 45 ? "#d97706" : "#059669" }} />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {sharedCards.length === 0 && (
                  <Card className="!rounded-2xl !border-dashed !border-stone-300 col-span-full">
                    <CardContent className="p-8 text-center">
                      <Search className="size-10 mx-auto text-stone-400 mb-3" />
                      <h3 className="font-semibold text-stone-800 mb-1">ไม่พบ Keyword ตามเงื่อนไข Filter</h3>
                      <p className="text-stone-500 text-[13px]">ลองปรับ Search หรือ Filter Tier/Intent</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <MainDashboardShell
      headerTitle="Keyword Cluster Planner"
      headerSubtitle={`โครงสร้าง Pillar-Cluster เพิ่มคะแนน EEAT · ${scopedProjects.length} โปรเจกต์ · ${totalKeywords} คำหลัก (ฐานข้อมูล)`}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={String(projectId)}
              onChange={e => setProjectId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="h-9 !rounded-lg border border-stone-300 bg-white pl-3 pr-9 text-[13px] font-medium text-stone-800 appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 min-w-[240px] shrink-0"
            >
              <option value="all">📋 ทุกโปรเจกต์ ({projects.length})</option>
              {projects.map(p => (
                <option key={p.id} value={String(p.id)}>
                  #{p.id} · {pickCategoryLabel(Number(p.category_id || p.categoryId))} · {(p.name || "").slice(0, 32)}
                </option>
              ))}
            </select>
            <ChevronDown className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
          </div>
          {isAdmin && (
            <>
              <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="!h-9 !rounded-lg !text-[12.5px]"><Upload className="size-3.5 mr-1.5" /> Import CSV</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Upload className="size-5 text-amber-700" /> นำเข้า Keywords จาก CSV</DialogTitle>
                    <DialogDescription className="text-[13px] text-stone-600">
                      ไฟล์ .csv/.txt — รองรับ columns: <code>keyword, volume, difficulty</code> (แนะนำ) หรือ keyword column เดียวบรรทัดละคำก็ได้
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>โปรเจกต์ *</Label>
                        <select className="w-full mt-1 h-9 rounded-lg border border-stone-300 px-3 text-[13px] bg-white" value={importProject ?? ''} onChange={e => handleImportSelectProject(parseInt(e.target.value, 10))}>
                          <option value="">— เลือกโปรเจกต์ —</option>
                          {projects.map(p => <option key={p.id} value={p.id}>#{p.id} · {p.name?.slice(0, 40) || `โปรเจกต์ ${p.id}`}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>ไฟล์ CSV/TXT</Label>
                        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="mt-1 block w-full text-[12.5px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-900 hover:file:bg-amber-200" onChange={handleFilePick} />
                        {importFileName && <p className="text-[11px] text-stone-500 mt-1">ไฟล์: {importFileName} · Preview rows: {importPreview.length}</p>}
                      </div>
                    </div>
                    <div className="border border-stone-200 rounded-xl overflow-hidden">
                      <div className="grid grid-cols-12 bg-stone-100 text-[11px] uppercase tracking-wider font-semibold text-stone-600">
                        <div className="col-span-5 p-2 border-r border-stone-200">Keyword</div>
                        <div className="col-span-3 p-2 border-r border-stone-200 text-right">Vol</div>
                        <div className="col-span-3 p-2 text-right">KD</div>
                        <div className="col-span-1 p-2"></div>
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {importPreview.length === 0 ? (
                          <div className="p-8 text-center text-stone-400 text-[13px]">
                            <Upload className="size-7 mx-auto mb-2 opacity-50" />
                            {importFileName ? '⚠️ ไม่พบ Keyword rows ในไฟล์นี้' : 'เลือกไฟล์เพื่อแสดง Preview'}
                          </div>
                        ) : importPreview.slice(0, 50).map((r, i) => (
                          <div key={i} className="grid grid-cols-12 border-b border-stone-100 text-[12.5px] last:border-0">
                            <div className="col-span-5 p-2 border-r border-stone-100 truncate">{r.keyword}</div>
                            <div className="col-span-3 p-2 border-r border-stone-100 text-right font-mono text-stone-700">{r.volume?.toLocaleString() || '—'}</div>
                            <div className="col-span-3 p-2 text-right font-mono text-stone-700">{typeof r.difficulty === 'number' ? `${r.difficulty}%` : '—'}</div>
                            <div className="col-span-1 p-1 text-right"><CheckCircle2 className="size-3.5 text-emerald-600 inline" /></div>
                          </div>
                        ))}
                      </div>
                      {importPreview.length > 50 && <div className="p-2 text-center text-[11px] text-stone-500 border-t border-stone-100">แสดง 50 rows จากทั้งหมด {importPreview.length} rows</div>}
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <DialogClose asChild><Button variant="outline" size="sm" className="!h-9">ยกเลิก</Button></DialogClose>
                    <Button size="sm" className="!h-9 !bg-emerald-700 hover:!bg-emerald-800" disabled={!importProject || importPreview.length === 0 || importCsvMut.isPending} onClick={handleRunImport}>
                      {importCsvMut.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}
                      {importCsvMut.isPending ? 'กำลังนำเข้า...' : `นำเข้า (${importPreview.length} rows)`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="!h-9 !rounded-lg !text-[12.5px]"><Plus className="size-3.5 mr-1.5" /> เพิ่ม Keyword</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Plus className="size-5 text-emerald-700" /> เพิ่ม Keyword เดี่ยว</DialogTitle>
                    <DialogDescription className="text-[13px] text-stone-600">เพิ่มคำหลัก 1 คำ — เลือก Tier และ Intent เริ่มต้น (แก้ไขได้ภายหลัง)</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div>
                      <Label>Keyword *</Label>
                      <Input value={addText} onChange={e => setAddText(e.target.value)} placeholder="เช่น วิธีเลือกหวยออกงวดนี้" className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Tier</Label>
                        <Select value={addTier} onValueChange={v => setAddTier(v as ClusterTier)}>
                          <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(TIER_STYLES).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Intent</Label>
                        <Select value={addIntent} onValueChange={v => setAddIntent(v as any)}>
                          <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {INTENTS.map(i => <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Cluster ID (optional — 0 = auto default)</Label>
                      <Input type="number" value={addClusterId ?? ''} onChange={e => setAddClusterId(e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="ปล่อยว่างเพื่อ auto" className="mt-1" />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <DialogClose asChild><Button variant="outline" size="sm" className="!h-9">ยกเลิก</Button></DialogClose>
                    <Button size="sm" className="!h-9 !bg-emerald-700 hover:!bg-emerald-800" onClick={handleRunAdd} disabled={createKwMut.isPending}>
                      {createKwMut.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}
                      {createKwMut.isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม Keyword'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* 3. VIEW MODE TOGGLE (OLD SEO E INLINE BORDER BLOCK L616-L661) */}
              <div className="flex items-center border border-stone-300 rounded-lg overflow-hidden shrink-0">
                <button onClick={() => setTabsValue('clusters')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors ${tabsValue==='clusters' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}>
                  <GitBranch className="h-3.5 w-3.5" /> Groups
                </button>
                <button onClick={() => setTabsValue('cards')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors border-x border-stone-300 ${tabsValue==='cards' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}>
                  <Layers className="h-3.5 w-3.5" /> Cards
                </button>
                <button onClick={() => setTabsValue('table')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors ${tabsValue==='table' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}>
                  <Database className="h-3.5 w-3.5" /> Table
                </button>
                <button onClick={() => setTabsValue('tree')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors border-x border-stone-300 ${tabsValue==='tree' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}>
                  <FolderTree className="h-3.5 w-3.5" /> Tree
                </button>
                <button onClick={() => setTabsValue('shared')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors ${tabsValue==='shared' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}>
                  <Target className="h-3.5 w-3.5" /> Shared
                </button>
              </div>

              {/* 4. METRICS / WORKFLOW — Progressive Disable: ปิดถ้าไม่มีคำ / ยังไม่เลือกโปรเจกต์ (ป้องกันกดก่อนถึงขั้นแล้วงง) */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEnrichSerp()}
                disabled={enrichSerp.isPending || totalKeywords === 0 || projectId === "all"}
                title={projectId === "all" ? "เลือกโปรเจกต์ก่อน Enrich" : (totalKeywords === 0 ? "ยังไม่มี Keyword — เพิ่มคำ 3 คำขึ้นไปก่อน" : "ดึง SERP metrics (SV/KD/Intent) จากฐานข้อมูล")}
                className="!h-9 !rounded-lg !text-[12.5px]"
              >
                {enrichSerp.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Zap className="size-3.5 mr-1.5" />}
                ⚡ Enrich
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleRunPlan2Step}
                disabled={enrichSerp.isPending || aiClusterize.isPending || totalKeywords === 0 || projectId === "all"}
                title={projectId === "all" ? "เลือกโปรเจกต์ก่อน Run Plan" : (totalKeywords === 0 ? "ยังไม่มี Keyword — เพิ่มคำ 3 คำขึ้นไปก่อน" : "Auto Step 1 Enrich → Step 2 AI จัดกลุ่ม (ครบในครั้งเดียว)")}
                className="!h-9 !rounded-lg !text-[12.5px] !bg-amber-700 hover:!bg-amber-800"
              >
                {enrichSerp.isPending || aiClusterize.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="size-3.5 mr-1.5" />}
                🚀 2-Step Plan
              </Button>

              {/* 5. SAVE / EXPORT PLAN (OLD SEO E L663-L672) */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportClusterPlan}
                disabled={totalKeywords === 0}
                className="!h-9 !rounded-lg !text-[12.5px]"
                title="บันทึก Cluster Plan เป็น JSON"
              >
                <Download className="size-3.5 mr-1.5" />
                บันทึก Plan
              </Button>

              {/* 6. RESET (OLD SEO E L674-L683) */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleToolbarReset}
                className="!h-9 !rounded-lg !text-[12.5px] !text-red-600 hover:!text-red-700 hover:!bg-red-50 !border-red-200"
                title="รีเซ็ตตัวกรองทั้งหมด"
              >
                <RotateCcw className="size-3.5 mr-1.5" />
                เริ่มใหม่
              </Button>

              {/* 7. PRIMARY LAST — AI จัดกลุ่ม KEYWORD (OLD SEO E L685-L691 LAST POSITION) — Progressive Disable: 0 คำ / proj=all → ปิดก่อนถึงขั้น */}
              <Button
                size="sm"
                className={`!h-9 !rounded-lg !text-[12.5px] ${showSeedPanel ? '!bg-orange-700 hover:!bg-orange-800' : ''}`}
                onClick={() => setShowSeedPanel(v => !v)}
                disabled={aiClusterize.isPending || seedRunning || (!showSeedPanel && (totalKeywords === 0 && seedKeywords.length === 0) || projectId === "all")}
                title={projectId === "all" ? "เลือกโปรเจกต์ก่อน AI จัดกลุ่ม (Keyword ไปอยู่ในโปรเจกต์ไหน)" : ((totalKeywords === 0 && seedKeywords.length === 0) ? "ยังไม่มี Keyword — เพิ่มคำ 3 คำ หรือวาง Seed keywords ก่อน" : "เปิด Seed Panel / เรียก AI จัดกลุ่มที่มีอยู่แล้ว")}
              >
                {aiClusterize.isPending || seedRunning
                  ? <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  : showSeedPanel ? <X className="size-3.5 mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                {showSeedPanel ? `ปิด Seed Panel${seedKeywords.length > 0 ? ` (${seedKeywords.length})` : ''}` : '✨ AI จัดกลุ่ม keyword'}
              </Button>
            </>
          )}
        </div>
      }
    >
      {/* ─── AI Seed Input Panel (OLD SEO E L696 ORDER — Directly under HEADER before Filter Bar) ─── */}
      {showSeedPanel && isAdmin && (
        <Card className="!rounded-2xl !border-indigo-200 !bg-gradient-to-br !from-indigo-50/70 !via-white !to-purple-50/70 !shadow-md mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-700 to-purple-700 px-5 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5" />
              <h3 className="font-semibold text-[14px]">✨ AI Seed Input Panel (จัดกลุ่ม Seed Keywords → 3-Tier Crown Hierarchy)</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="!bg-white/20 !text-white !border-white/30 !text-[11px]">Seed: {seedKeywords.length}</Badge>
              <Button variant="ghost" size="sm" className="!h-7 !text-[12px] !text-white hover:!bg-white/15 !rounded-full" onClick={handleSeedClearAll} disabled={seedRunning}>เคลียร์ทั้งหมด</Button>
              <Button variant="ghost" size="sm" className="!h-7 !text-[12px] !text-white hover:!bg-white/15 !rounded-full" onClick={() => setShowSeedPanel(false)} disabled={seedRunning}>
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
          <CardContent className="p-5 space-y-4">
            <Alert className="!rounded-xl !border-indigo-100 !bg-white !text-indigo-900">
              <AlertTitle className="text-[12.5px] font-semibold flex items-center gap-1.5"><Info className="size-4" />วิธีใช้งาน Seed Panel (เวิร์กโฟลเดิม Old SEO E KCP)</AlertTitle>
              <AlertDescription className="text-[12px] text-indigo-800/80 mt-1">
                1) วาง Seed Keywords (บรรทัดละคำ หรือคั่นด้วย ,) 2) กด "เพิ่ม Seed" → 3) ปรับ Target Clusters / Longtail count → 4) กด "🚀 AI จัดกลุ่มทั้งหมด"
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 space-y-3">
                <Label className="text-[12.5px] font-semibold text-stone-700">Seed Keywords (วางทีละหลายรายการ)</Label>
                <Textarea
                  id="kcp-seed-input"
                  value={seedInput}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSeedInput(e.target.value)}
                  placeholder={`ยกตัวอย่าง:&#10;วิเคราะห์ผลบอล&#10;แทงบอลออนไลน์&#10;ทีเด็ดบอลวันนี้&#10;สูตรแทงบอล&#10;บอลเตะ&#10;เช็คผลบอล&#10;เว็บแทงบอล&#10;บอลย้อนหลัง&#10;ทีเด็ดบอลชุด`}
                  rows={6}
                  className="!rounded-xl !border-stone-300 !bg-white text-[12.5px] font-mono"
                  onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSeedAdd(); }}
                  disabled={seedRunning}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="default" className="!h-9 !rounded-lg !text-[12.5px] !bg-indigo-700 hover:!bg-indigo-800" onClick={handleSeedAdd} disabled={seedRunning || !seedInput.trim()}>
                    <Plus className="size-3.5 mr-1.5" /> เพิ่ม Seed (Ctrl+Enter)
                  </Button>
                  <span className="text-[11.5px] text-stone-500">เคียวร์เรนต์: {seedKeywords.length} seed keywords · Target: {targetClusters} clusters · {longtailCount} long-tail/cluster</span>
                </div>
                {/* Seed chips */}
                <div className="border border-stone-200 rounded-xl p-3 min-h-[80px] max-h-[200px] overflow-y-auto bg-white">
                  {seedKeywords.length === 0 ? (
                    <p className="text-[12px] text-stone-400 italic text-center py-4">ยังไม่มี Seed Keywords — วางข้างบน แล้วกด "เพิ่ม Seed" หรือพิมพ์เดี่ยวๆ ลงกล่อง</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {seedKeywords.map((kw, idx) => (
                        <span key={`${kw}-${idx}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] bg-indigo-100 text-indigo-800 border border-indigo-200 group hover:bg-indigo-200 transition-colors">
                          <span className="text-indigo-400 mr-0.5 font-mono">{idx + 1}.</span>{kw}
                          <button className="ml-1 text-indigo-500 hover:text-red-600 opacity-60 group-hover:opacity-100" onClick={() => handleSeedRemove(kw)} disabled={seedRunning}>
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="lg:col-span-5 space-y-4 bg-white border border-stone-200 rounded-xl p-4">
                <div>
                  <Label className="text-[12.5px] font-semibold text-stone-700">Target Clusters (จำนวนกลุ่มที่ต้องการ)</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="range"
                      min={3}
                      max={120}
                      step={1}
                      value={targetClusters}
                      onChange={e => setTargetClusters(parseInt(e.target.value, 10))}
                      className="flex-1 accent-indigo-600"
                      disabled={seedRunning}
                    />
                    <Badge className="!h-7 !rounded-lg !px-3 !text-[12px] !bg-indigo-700 !text-white !border-indigo-800">{targetClusters} clusters</Badge>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">จำนวนกลุ่มหลักที่ต้องการสร้าง (Pillar × Cluster × Supporting)</p>
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold text-stone-700">Long-tail Keywords ต่อกลุ่ม</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={longtailCount}
                      onChange={e => setLongtailCount(parseInt(e.target.value, 10))}
                      className="flex-1 accent-purple-600"
                      disabled={seedRunning}
                    />
                    <Badge className="!h-7 !rounded-lg !px-3 !text-[12px] !bg-purple-700 !text-white !border-purple-800">{longtailCount} คำ/กลุ่ม</Badge>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">LSI + Longtail keywords ที่แนะนำต่อ cluster (1-20)</p>
                </div>
                <div className="pt-2 border-t border-stone-200 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11.5px] font-semibold text-stone-700 flex items-center gap-1.5">
                      📍 เลือกโปรเจกต์เป้าหมาย (จำเป็นต้องเลือก 1 โปรเจกต์ก่อนส่งให้ AI)
                    </Label>
                    <Select
                      value={String(projectId)}
                      onValueChange={(v) => {
                        const val = v === "all" ? "all" : Number(v);
                        if (!Number.isNaN(val) || val === "all") setProjectId(val as any);
                      }}
                      disabled={seedRunning}
                    >
                      <SelectTrigger className={`!h-9 !rounded-lg !text-[12.5px] ${projectId === "all" ? "!border-amber-400 !bg-amber-50 focus:!ring-amber-300" : ""}`}>
                        <SelectValue placeholder="⚠️ กรุณาเลือกโปรเจกต์" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">🌐 ทุกโปรเจกต์ (ไม่สามารถส่งให้ AI ได้)</SelectItem>
                        {Array.isArray(projects) && projects.map((p) => {
                          const pid = Number(p.id);
                          if (!Number.isFinite(pid) || pid <= 0) return null;
                          return (
                            <SelectItem key={pid} value={String(pid)}>
                              {String(p.name || `Project #${pid}`).slice(0, 50)}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {projectId === "all" && (
                      <p className="text-[11px] text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="size-3" /> ห้ามเลือก "ทุกโปรเจกต์" — AI ต้องรู้ว่าจะใส่ Keyword เข้าโปรเจกต์ไหน
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-600 pt-2 border-t border-dashed border-stone-200">
                    <div>🏷️ Seed ที่จะส่ง:</div><div className="font-semibold text-indigo-700">{seedKeywords.length} คำ</div>
                    <div>📊 คาดการณ์ Keywords สุทธิ:</div><div className="font-semibold text-purple-700">{Math.min(seedKeywords.length, targetClusters) * (1 + longtailCount)}+ คำ</div>
                    <div>💾 โปรเจกต์เป้าหมาย:</div>
                    <div className={`font-semibold truncate ${projectId === "all" ? "text-amber-700" : "text-emerald-700"}`}>
                      {projectId === "all" ? "⚠️ ยังไม่ได้เลือก" : (projects.find(p => Number(p.id) === Number(projectId))?.name?.slice(0, 28) ?? `#${projectId}`)}
                    </div>
                  </div>
                  <Button
                    variant="default"
                    className="w-full !h-11 !rounded-xl !text-[13px] font-semibold !bg-gradient-to-r !from-emerald-600 !to-teal-700 hover:!from-emerald-700 hover:!to-teal-800 !shadow-md"
                    onClick={handleSeedRunAutoGroup}
                    disabled={seedRunning || seedKeywords.length === 0 || projectId === 'all'}
                  >
                    {seedRunning ? (
                      <><Loader2 className="size-4 mr-2 animate-spin" /> กำลังประมวลผล AI (อาจใช้ 20-90 วินาที)...</>
                    ) : (
                      <><PlayCircle className="size-4 mr-2" /> 🚀 AI จัดกลุ่ม Seed ทั้งหมด → Crown Hierarchy</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PROGRESSIVE 5-STEP CARD — GATE 0 ONBOARDING (มือใหม่รู้ทันทีว่าต้องทำอะไรต่อ) */}
      <Card className="!rounded-2xl !border-amber-200 !bg-gradient-to-br !from-amber-50/70 !via-white !to-amber-50/30 !shadow-sm mb-5 overflow-hidden">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { k: 0, label: "1. เลือกโปรเจกต์ + เพิ่มคำ" },
              { k: 1, label: "2. Enrich SERP" },
              { k: 2, label: "3. AI จัดกลุ่ม" },
              { k: 3, label: "4. Crown Hierarchy" },
              { k: 4, label: "5. พร้อมเขียนบทความ" },
            ].map((s) => {
              const active = workflowStep === s.k;
              const done = workflowStep > s.k;
              return (
                <Badge
                  key={s.k}
                  className={`!rounded-full !px-3 !h-8 !text-[12px] inline-flex items-center gap-1.5 ${
                    done
                      ? "!bg-emerald-100 !text-emerald-800 !border-emerald-300"
                      : active
                      ? "!bg-amber-600 !text-white !border-amber-700 !shadow-sm"
                      : "!bg-stone-100 !text-stone-500 !border-stone-200"
                  }`}
                >
                  {done && <CheckCircle2 className="size-3" aria-hidden />}
                  {active && <Sparkles className="size-3" aria-hidden />}
                  {s.label}
                </Badge>
              );
            })}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-stone-900 leading-snug">{stepTitle}</p>
              <p className="text-[12px] text-stone-600 mt-1">
                {workflowStep === 0 && "เลือกโปรเจกต์บน Header แล้ว เพิ่มคำอย่างน้อย 3 คำ — ถัดไปคือ Enrich SERP"}
                {workflowStep === 1 && "ดึง SV/KD/Intent จาก SERP ก่อน AI จัดกลุ่ม — เพิ่ม Accuracy 70%+"}
                {workflowStep === 2 && "AI จัดกลุ่ม 3 Tier ครั้งเดียวจบ (Pillar × Cluster × Supporting)"}
                {workflowStep === 3 && "ตรวจสอบ Crown Hierarchy → ต้อง Pillar ≥1, Cluster ≥2, Supporting ≥2"}
                {workflowStep === 4 && "Pipeline เขียนบทความพร้อม — กด เขียน ที่ Cluster/Supporting tier ได้เลย"}
              </p>
            </div>
            {/* ONE BIG PRIMARY CTA — ขึ้นกับ workflowStep ปัจจุบัน — Progressive Disclosure ไม่ให้กดก่อนถึงขั้น */}
            <Button
              size="lg"
              className={`!h-11 !rounded-xl !px-5 !text-[13.5px] font-semibold shadow-md ${
                workflowStep === 0
                  ? "!bg-gradient-to-r !from-emerald-600 !to-teal-700 hover:!from-emerald-700 hover:!to-teal-800"
                  : workflowStep === 1
                  ? "!bg-gradient-to-r !from-orange-600 !to-red-700 hover:!from-orange-700 hover:!to-red-800"
                  : workflowStep === 2
                  ? "!bg-gradient-to-r !from-indigo-700 !to-purple-700 hover:!from-indigo-800 hover:!to-purple-800"
                  : workflowStep === 3
                  ? "!bg-gradient-to-r !from-blue-700 !to-sky-700 hover:!from-blue-800 hover:!to-sky-800"
                  : "!bg-gradient-to-r !from-amber-700 !to-yellow-700 hover:!from-amber-800 hover:!to-yellow-800"
              }`}
              onClick={() => {
                if (workflowStep === 0) {
                  setShowSeedPanel(true);
                  setTimeout(() => {
                    (document.getElementById("kcp-seed-input") as HTMLTextAreaElement | null)?.focus?.();
                  }, 120);
                  return;
                }
                if (workflowStep === 1) { void handleEnrichSerp(); return; }
                if (workflowStep === 2) { void handleClusterize(); return; }
                if (workflowStep === 3) {
                  setTabsValue("tree");
                  toast.success("🗺️ Tree View เปิดแล้ว — Expand Pillar → Cluster → Supporting");
                  return;
                }
                if (workflowStep === 4) {
                  const firstClusterKw = dbKeywords.find(
                    (k) => (k.tier || "") === "cluster" && Number(k.id) > 0
                  );
                  if (firstClusterKw) void setLocation(`/articles?focus_kw_id=${firstClusterKw.id}`);
                  else void setLocation("/articles");
                  return;
                }
              }}
              disabled={
                (workflowStep === 1 &&
                  (enrichSerp.isPending || totalKeywords === 0 || projectId === "all")) ||
                (workflowStep === 2 &&
                  (aiClusterize.isPending || totalKeywords === 0 || projectId === "all")) ||
                (workflowStep === 0 && projectId === "all")
              }
            >
              {(() => {
                if (workflowStep === 0 && projectId === "all")
                  return <>⚠️ เลือกโปรเจกต์ก่อน (เมนูบน Header)</>;
                if (workflowStep === 0)
                  return (
                    <>
                      <Plus className="size-4 mr-2" /> เริ่มต้น เพิ่มคำ 3 คำ (Seed Panel)
                    </>
                  );
                if (workflowStep === 1)
                  return enrichSerp.isPending ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" /> Enrich SERP กำลังรัน...
                    </>
                  ) : (
                    <>
                      <Zap className="size-4 mr-2" /> 🚀 Enrich SERP → Step 3 (ถัดไป)
                    </>
                  );
                if (workflowStep === 2)
                  return aiClusterize.isPending ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" /> AI กำลังจัดกลุ่ม...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4 mr-2" /> 🧠 AI จัดกลุ่ม 3-Tier → พร้อมเขียน
                    </>
                  );
                if (workflowStep === 3)
                  return (
                    <>
                      <FolderTree className="size-4 mr-2" /> ดู Tree View Crown Hierarchy
                    </>
                  );
                return (
                  <>
                    <PlayCircle className="size-4 mr-2" /> ส่งเขียนบทความ (Cluster tier)
                  </>
                );
              })()}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* FILTERS BAR */}
      <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm mb-5">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden />
              <Input
                ref={searchInputRef as any}
                placeholder="🔍 ค้นหา Keyword (คำไหน ก็ได้ — Search LIKE) · กด F เพื่อโฟกัส"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="!h-9 !pl-9 !rounded-lg"
                aria-label="ค้นหา keyword"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="size-3.5 text-stone-500 mr-1" />
              {(["all", "pillar", "cluster", "supporting"] as TierFilter[]).map(t => {
                const active = tierFilter === t;
                const label = t === "all" ? "ทุก Tier" : TIER_STYLES[t as ClusterTier].label;
                return (
                  <Button key={t} size="sm" variant={active ? "default" : "ghost"} className={`!h-8 !rounded-full !px-3 !text-[12px] ${active ? '' : 'text-stone-600 hover:!bg-stone-100'}`} onClick={() => setTierFilter(t)} aria-label={`Filter tier: ${label}${active ? ' (active)' : ''}`}>
                    {t !== "all" && (() => { const Ic = TIER_STYLES[t as ClusterTier].icon; return <Ic className="size-3 mr-1.5" aria-hidden />; })()}
                    {label}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <CircleDot className="size-3.5 text-stone-500 mr-1" aria-hidden />
              <select value={intentFilter} onChange={e => setIntentFilter(e.target.value as IntentFilter)} className="h-8 !rounded-full border border-stone-300 px-3 text-[12px] bg-white focus:outline-none" aria-label="Filter by search intent">
                <option value="all">ทุก Intent</option>
                {INTENTS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="h-8 !rounded-full border border-stone-300 px-3 text-[12px] bg-white focus:outline-none" aria-label="Filter by article status">
                <option value="all">ทุก Status</option>
                <option value="pending">Pending (รอเขียน)</option>
                <option value="written">Written (เขียนแล้ว)</option>
              </select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="!rounded-full !text-[11.5px] !px-2.5 !h-7 !bg-stone-50 border-stone-200">{allCards.length} Results {loading && <Loader2 className="size-3 ml-1.5 animate-spin inline" />}</Badge>
              {isAdmin && (
                <>
                  <Badge variant="outline" className={`!rounded-full !text-[11.5px] !px-2.5 !h-7 cursor-pointer ${selectedIds.size > 0 ? '!bg-amber-100 !text-amber-800 !border-amber-300 hover:!bg-amber-200' : 'border-stone-200 text-stone-600'}`} onClick={() => setBatchOpen(v => !v)}>
                    ✓ {selectedIds.size} Selected
                  </Badge>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="!h-8 !rounded-lg !px-2 !text-[11px] relative" onClick={() => handleBatchExport({ format: 'csv', scope: 'all' })} disabled={totalKeywords === 0}>
                      <Badge variant="outline" className="absolute -top-1.5 -right-1.5 !h-4 !min-w-[18px] !px-1 !rounded-full !text-[9px] !bg-emerald-100 !text-emerald-800 !border-emerald-200">{dbKeywords.length}</Badge>
                      <Download className="size-3 mr-1" /> CSV
                    </Button>
                    <Button variant="outline" size="sm" className="!h-8 !rounded-lg !px-2 !text-[11px] relative" onClick={() => handleBatchExport({ format: 'json', scope: 'all' })} disabled={totalKeywords === 0}>
                      <Badge variant="outline" className="absolute -top-1.5 -right-1.5 !h-4 !min-w-[18px] !px-1 !rounded-full !text-[9px] !bg-violet-100 !text-violet-800 !border-violet-200">{dbKeywords.length}</Badge>
                      <Share2 className="size-3 mr-1" /> JSON
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
          {batchOpen && isAdmin && (
            <div className="mt-4 p-3 rounded-xl border border-amber-200 bg-amber-50/60 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-medium text-amber-900">🧰 Batch Action ({selectedIds.size} รายการที่เลือก):</span>
              <Select value={batchTier} onValueChange={v => setBatchTier(v as ClusterTier)}>
                <SelectTrigger className="!h-8 w-[140px] !rounded-lg !text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIER_STYLES).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="!h-8 !rounded-lg !text-[12px]" disabled={selectedIds.size === 0 || bulkTierMut.isPending} onClick={handleBatchTier}>
                {bulkTierMut.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Sparkles className="size-3.5 mr-1.5" />}
                Set Tier
              </Button>
              <Button size="sm" variant="outline" className="!h-8 !rounded-lg !text-[12px] !text-rose-700 hover:!bg-rose-50" disabled={selectedIds.size === 0 || bulkDelMut.isPending} onClick={handleBatchDelete}>
                {bulkDelMut.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <X className="size-3.5 mr-1.5" />}
                Delete Selected
              </Button>
              <Button size="sm" variant="ghost" className="!h-8 !rounded-lg !text-[12px] text-stone-600" onClick={clearSelection}>เคลียร์ทั้งหมด</Button>
              {allCards.length > 0 && (
                <Button size="sm" variant="ghost" className="!h-8 !rounded-lg !text-[12px] text-stone-600 ml-auto" onClick={() => selectAll(allCards.map(c => Number(c.keywordId)).filter(id => id > 0))}>
                  เลือกทั้งหมดที่แสดง
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── PROGRESS STEPS BAR (ถัดจาก Filter Bar, ก่อน 4 Stats Cards) ─── */}
      <Card className="!rounded-2xl !border-stone-200 !bg-gradient-to-r !from-indigo-50/80 !to-purple-50/80 !shadow-sm mb-5 overflow-hidden">
        <CardContent className="px-5 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Sparkles className="size-4.5 text-indigo-700" />
            <p className="flex-1 text-[12.5px] font-semibold text-stone-800">{stepTitle}</p>
            <Badge className={`!h-6 !rounded-full !px-3 !text-[11px] ${
              workflowStep>=4 ? "!bg-emerald-600 !text-white !border-emerald-700" :
              workflowStep>=3 ? "!bg-indigo-600 !text-white !border-indigo-700" :
              workflowStep>=2 ? "!bg-emerald-500 !text-white !border-emerald-600" :
              workflowStep>=1 ? "!bg-amber-500 !text-white !border-amber-600" :
              "!bg-stone-500 !text-white !border-stone-600"
            }`}>
              {workflowStep}/4 Done
            </Badge>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { n: 1, label: "เลือกโปรเจกต์ + เพิ่ม Keyword", icon: Hash, ok: workflowStep >= 1 },
              { n: 2, label: "Enrich SERP (SV/KD)", icon: TrendingUp, ok: workflowStep >= 2 },
              { n: 3, label: "AI จัดกลุ่ม 3-Tier", icon: GitBranch, ok: workflowStep >= 3 },
              { n: 4, label: "Crown Hierarchy ครบถ้วน", icon: Crown, ok: workflowStep >= 4 },
            ].map((s) => {
              const Ic = s.icon;
              return (
                <div key={s.n} className={`rounded-xl p-2.5 flex items-center gap-2 ${s.ok ? "bg-white border border-emerald-200 shadow-sm" : "bg-white/50 border border-dashed border-stone-300"}`}>
                  <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${s.ok ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-400"}`}>
                    {s.ok ? <CheckCircle2 className="size-4.5" /> : <Ic className="size-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[11px] font-semibold mb-0.5 ${s.ok ? "text-emerald-800" : "text-stone-400"}`}>Step {s.n}</p>
                    <p className={`text-[11.5px] leading-tight ${s.ok ? "text-stone-800" : "text-stone-500"}`}>{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {workflowStep < 4 && (
            <div className="mt-3 pt-3 border-t border-dashed border-stone-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] text-stone-600 font-semibold">👉 ถัดไป (Action ที่ต้องทำตอนนี้):</span>
                {workflowStep === 0 && (
                  <>
                    <Badge className="!rounded-full !text-[11.5px] !h-7 !bg-indigo-50 !text-indigo-800 !border-indigo-200 !cursor-pointer hover:!bg-indigo-100" onClick={() => setShowSeedPanel(true)}>
                      ✨ เปิด AI Seed Panel
                    </Badge>
                    <span className="text-[11px] text-stone-500">→ วาง Seed Keyword → เลือกโปรเจกต์ → เพิ่ม</span>
                  </>
                )}
                {workflowStep === 1 && (
                  <>
                    <Badge className="!rounded-full !text-[11.5px] !h-7 !bg-amber-50 !text-amber-800 !border-amber-200 !cursor-pointer hover:!bg-amber-100" onClick={() => { void handleEnrichSerp(); }}>
                      📈 Enrich SERP (ดึง SV/KD)
                    </Badge>
                    <span className="text-[11px] text-stone-500">→ ระบบจะดึง Search Volume + KD จริงๆ ก่อนให้ AI จัดกลุ่ม</span>
                  </>
                )}
                {workflowStep === 2 && (
                  <>
                    <Badge className="!rounded-full !text-[11.5px] !h-7 !bg-emerald-50 !text-emerald-800 !border-emerald-200 !cursor-pointer hover:!bg-emerald-100" onClick={() => { void handleClusterize(); }}>
                      🧠 AI จัดกลุ่ม 3-Tier (Pillar/Cluster/Supporting)
                    </Badge>
                    <span className="text-[11px] text-stone-500">→ ระบบจะส่งให้ LLM แยกตาม targetClusters ที่คุณตั้งไว้</span>
                  </>
                )}
                {workflowStep === 3 && (
                  <>
                    <Badge className="!rounded-full !text-[11.5px] !h-7 !bg-blue-50 !text-blue-800 !border-blue-200 !cursor-pointer hover:!bg-blue-100" onClick={() => setTabsValue('clusters')}>
                      🗺️ เปิด Cluster Groups ตรวจสอบโครงสร้าง
                    </Badge>
                    <span className="text-[11px] text-stone-500">→ ตรวจสอบ 3 ชั้นครบ หรือ กด AI จัดกลุ่มอีกรอบเพื่อขยายจำนวนกลุ่ม</span>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Pillar", val: pillarCount, Icon: Crown, color: TIER_STYLES.pillar, active: hasPillar, required: workflowStep >= 4 },
          { label: "Cluster", val: clusterCount, Icon: Layers, color: TIER_STYLES.cluster, active: hasCluster, required: workflowStep >= 4 },
          { label: "Supporting", val: supportingCount, Icon: BookOpen, color: TIER_STYLES.supporting, active: hasSupporting, required: workflowStep >= 4 },
          { label: "รวมคำหลัก", val: totalKeywords, Icon: Hash, color: { label: "Total", border: "#475569", bg: "#f5f5f4", text: "#1c1917" }, active: hasKeywords, required: workflowStep >= 1 },
        ].map(({ label, val, Icon, color, active, required }) => (
          <Card key={label} className={`!rounded-2xl !shadow-sm !transition-all !duration-200 hover:!shadow-md hover:-translate-y-0.5 ${active ? "!border-2" : "!border-stone-200 opacity-80"}`} style={active ? { borderColor: color.border } : undefined}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl grid place-items-center" style={{ backgroundColor: color.bg, color: color.text }}>
                <Icon className="size-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] uppercase tracking-wider text-stone-500">{label}</p>
                  {active && <CheckCircle2 className="size-3 text-emerald-600" />}
                  {!active && required && <span className="text-[9.5px] font-semibold text-amber-700 bg-amber-100 px-1.5 rounded-full">ต้องการ</span>}
                </div>
                <p className={`text-xl font-bold ${active ? "text-stone-900" : "text-stone-400"}`}>{val}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm !transition-all !duration-200 hover:!shadow-md mb-6">
        <CardHeader className="!p-5 !pb-4 flex-row items-center gap-3 !space-y-0">
          <GitBranch className="size-5 text-amber-700" />
          <CardTitle className="text-[16px] font-semibold text-stone-900 flex-1">การจัดกลุ่มคำหลัก — โครงสร้าง 3 ชั้น Crown</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-stone-500">
            <Badge className={`!rounded-full !border-amber-200 !h-6 !px-2.5 !shrink-0 !whitespace-nowrap ${hasPillar ? "!bg-amber-50 !text-amber-800" : "!bg-stone-50 !text-stone-400"}`} title={`Pillar keywords: ${pillarCount} คำ`}>{pillarCount} Pillar</Badge>
            <Badge className={`!rounded-full !border-sky-200 !h-6 !px-2.5 !shrink-0 !whitespace-nowrap ${hasCluster ? "!bg-sky-50 !text-sky-800" : "!bg-stone-50 !text-stone-400"}`} title={`Cluster keywords: ${clusterCount} คำ`}>{clusterCount} Cluster</Badge>
            <Badge className={`!rounded-full !border-emerald-200 !h-6 !px-2.5 !shrink-0 !whitespace-nowrap ${hasSupporting ? "!bg-emerald-50 !text-emerald-800" : "!bg-stone-50 !text-stone-400"}`} title={`Supporting keywords: ${supportingCount} คำ`}>{supportingCount} Supporting</Badge>
            <Badge className={`!rounded-full !border-stone-200 !h-6 !px-2.5 !shrink-0 !whitespace-nowrap min-w-[96px] text-center ${hasKeywords ? "!bg-stone-50 !text-stone-700" : "!bg-stone-50 !text-stone-400"}`} title={`รวมทุกคำหลัก: ${totalKeywords} คำ`}>{totalKeywords} คำหลัก</Badge>
          </div>
        </CardHeader>
        <CardContent className="!p-0 !pt-1">
          <Tabs value={tabsValue} onValueChange={(v: any) => setTabsValue(v)} className="w-full">
            <div className="px-5">
              <TabsList className="!rounded-lg !bg-stone-100 !h-9 p-1 mb-5 flex flex-wrap items-center gap-1">
                <TabsTrigger value="clusters" className="!h-7 !rounded-md !text-[12.5px] font-medium data-[state=active]:!bg-white">
                  <GitBranch className="size-3.5 mr-1.5" /> Cluster Groups
                </TabsTrigger>
                <TabsTrigger value="cards" className="!h-7 !rounded-md !text-[12.5px] font-medium data-[state=active]:!bg-white">
                  <Layers className="size-3.5 mr-1.5" /> Cards (Grid)
                </TabsTrigger>
                {showTableTab && (
                  <TabsTrigger value="table" className="!h-7 !rounded-md !text-[12.5px] font-medium data-[state=active]:!bg-white">
                    <Database className="size-3.5 mr-1.5" /> Table
                  </TabsTrigger>
                )}
                {showTreeTab && (
                  <TabsTrigger value="tree" className="!h-7 !rounded-md !text-[12.5px] font-medium data-[state=active]:!bg-white">
                    <FolderTree className="size-3.5 mr-1.5" /> Tree View
                  </TabsTrigger>
                )}
                {showSharedTab && (
                  <TabsTrigger value="shared" className="!h-7 !rounded-md !text-[12.5px] font-medium data-[state=active]:!bg-white">
                    <Target className="size-3.5 mr-1.5" /> Shared
                  </TabsTrigger>
                )}
                {!showTableTab && !showTreeTab && (
                  <div className="ml-auto flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-md bg-white/60 border border-dashed border-stone-300">
                    <AlertTriangle className="size-3 text-amber-600" />
                    <span className="text-[11px] text-stone-500 font-medium">
                      🚫 Table/Tree/Shared = ซ่อนไว้ เพราะยังไม่มี clusters จริงๆ (ต้อง AI จัดกลุ่มก่อน)
                    </span>
                  </div>
                )}
              </TabsList>
            </div>

            {/* ─── TabsContent: Cluster Groups (OLD SEO E KeywordClusterPlanner ClusterCard pattern) ─── */}
            <TabsContent value="clusters" className="!p-5 !pt-2 !mt-0">
              {(() => {
                const unassignedName = UNASSIGNED_CLUSTER_NAME;
                type Group = { clusterId: number; name: string; type: ClusterTier; items: DbKeyword[]; parentId: number | null; writtenCount: number; };
                const groupsMap = new Map<number, Group>();
                for (const raw of dbKeywords) {
                  const k: DbKeyword = { ...raw };
                  const cid = Number(k.clusterId) || 0;
                  if (!groupsMap.has(cid)) {
                    const c = cid > 0 ? clustersById[cid] : null;
                    groupsMap.set(cid, {
                      clusterId: cid, name: cid === 0 ? unassignedName : c?.name || `Cluster #${cid}`,
                      type: (cid > 0 ? (c?.type || (k.tier || 'cluster')) : (k.tier || 'cluster')) as ClusterTier,
                      items: [], parentId: cid > 0 ? (c?.parentId || null) : null, writtenCount: 0,
                    });
                  }
                  const g = groupsMap.get(cid)!;
                  if (cid > 0 && g.type !== k.tier) { k.tier = g.type; }
                  g.items.push(k);
                  if (k.status === 'written') g.writtenCount++;
                }
                for (const g of groupsMap.values()) {
                  g.items.sort((a: DbKeyword, b: DbKeyword) => {
                    const kdA = typeof a.difficulty === 'number' ? a.difficulty : 0;
                    const kdB = typeof b.difficulty === 'number' ? b.difficulty : 0;
                    const svA = typeof a.searchVolume === 'number' ? a.searchVolume : 0;
                    const svB = typeof b.searchVolume === 'number' ? b.searchVolume : 0;
                    if (kdB !== kdA) return kdB - kdA;
                    if (svB !== svA) return svB - svA;
                    return String(a.keywordText || '').localeCompare(String(b.keywordText || ''), 'th');
                  });
                }
                const groupsArr = Array.from(groupsMap.values()).sort((a, b) => {
                  const tierW: Record<string, number> = { pillar: 0, cluster: 1, supporting: 2 };
                  return (tierW[a.type] ?? 3) - (tierW[b.type] ?? 3) || a.clusterId - b.clusterId;
                });
                const totalPillar = groupsArr.filter(g => g.type === 'pillar').length;
                const totalCluster = groupsArr.filter(g => g.type === 'cluster').length;
                const totalSupporting = groupsArr.filter(g => g.type === 'supporting').length;
                const toggleCl = (cid: number) => setExpandedClustersView(prev => { const next = new Set(prev); if (next.has(cid)) next.delete(cid); else next.add(cid); return next; });
                const expandAll = () => setExpandedClustersView(new Set(groupsArr.map(g => g.clusterId)));
                const collapseAll = () => setExpandedClustersView(new Set());
                const proj = projectId !== "all" ? projects.find((p: any) => Number(p.id) === Number(projectId)) : null;
                const projCatId: number | null = proj ? (Number((proj as any).category_id || (proj as any).categoryId) || null) : null;
                const flatClusters: ClusterRow[] = clusters && clusters.length ? clusters : Object.values(clustersById);
                const parentNameOf = (parentId: number | null) => {
                  if (!parentId) return null;
                  const pc = flatClusters.find((x: ClusterRow) => Number(x.id) === Number(parentId));
                  return pc?.name ?? pickCategoryLabel(projCatId ?? undefined);
                };
                const parentPillarName = (g: any) => {
                  const cn = parentNameOf(g.parentId);
                  if (cn) return cn;
                  if (g.type === 'pillar') return pickCategoryLabel(projCatId ?? undefined);
                  return null;
                };
                return (
                  <div className="space-y-4">
                    {showClusterGroupsEmptyGuide && (
                      <div className="p-5 rounded-2xl border-2 border-dashed border-amber-300 bg-gradient-to-br from-amber-50 to-indigo-50 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-xl grid place-items-center bg-white shadow-sm border border-amber-200 shrink-0">
                            <Sparkles className="size-6 text-indigo-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[14px] font-bold text-stone-800 mb-1.5">🚫 ยังไม่มี Clusters จริงๆ (เพียงมี Keywords อย่างเดียว)</h4>
                            <p className="text-[12px] text-stone-600 mb-3.5 leading-relaxed">
                              โปรเจกต์นี้มี <strong className="text-stone-800">{totalKeywords} คำหลัก</strong> แต่ยังไม่ได้ส่งให้ AI จัดกลุ่ม 3-Tier (พบเฉพาะ <code className="px-1.5 py-0.5 rounded bg-white text-[11px] text-stone-700 border border-stone-200">ยังไม่ได้จัดกลุ่ม (System)</code> ทั้งหมดเท่านั้น)
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button size="sm" className="!h-9 !rounded-lg !bg-gradient-to-r !from-purple-700 !to-indigo-700 hover:!from-purple-800 hover:!to-indigo-800 text-white" onClick={() => setShowSeedPanel(true)}>
                                <Sparkles className="size-3.5 mr-1.5" /> 1. เปิด AI Seed Panel
                              </Button>
                              {hasKeywords && !hasSvKd && (
                                <Button size="sm" variant="outline" className="!h-9 !rounded-lg !border-amber-300 !bg-white !text-amber-800 hover:!bg-amber-50" onClick={() => { void handleEnrichSerp(); }}>
                                  <TrendingUp className="size-3.5 mr-1.5" /> 2. Enrich SERP (SV/KD)
                                </Button>
                              )}
                              {hasKeywords && hasSvKd && (
                                <Button size="sm" variant="outline" className="!h-9 !rounded-lg !border-emerald-300 !bg-white !text-emerald-800 hover:!bg-emerald-50" onClick={() => { void handleClusterize(); }}>
                                  <Wand2 className="size-3.5 mr-1.5" /> 3. AI จัดกลุ่ม 3-Tier ตอนนี้
                                </Button>
                              )}
                              <Badge className="!rounded-full !text-[11px] !h-7 !px-3 !bg-white !border-stone-200 !text-stone-600 ml-auto">
                                Workflow: {workflowStep}/4
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-[12px]">
                        <Badge className="!rounded-md !bg-amber-100 !text-amber-800 !border-amber-300 !h-7 !px-3">{totalPillar} Pillar Groups</Badge>
                        <Badge className="!rounded-md !bg-blue-100 !text-blue-800 !border-blue-300 !h-7 !px-3">{totalCluster} Cluster Groups</Badge>
                        <Badge className="!rounded-md !bg-emerald-100 !text-emerald-800 !border-emerald-300 !h-7 !px-3">{totalSupporting} Supporting Groups</Badge>
                        <Badge className="!rounded-md !bg-stone-100 !text-stone-700 !border-stone-300 !h-7 !px-3">{groupsArr.length} Total / {dbKeywords.length} คำหลัก</Badge>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="!h-7 !rounded-lg !text-[11.5px] text-stone-600" onClick={expandAll}>ขยายทั้งหมด ({groupsArr.length})</Button>
                        <Button size="sm" variant="ghost" className="!h-7 !rounded-lg !text-[11.5px] text-stone-600" onClick={collapseAll}>ยุบทั้งหมด</Button>
                      </div>
                    </div>
                    {groupsArr.length === 0 ? (
                      <div className="p-16 text-center border-2 border-dashed rounded-2xl border-stone-200 bg-stone-50/40">
                        <GitBranch className="size-10 mx-auto mb-3 text-stone-300" />
                        <h3 className="font-semibold text-stone-700 mb-1.5">ยังไม่มี Cluster Groups</h3>
                        <p className="text-[12.5px] text-stone-500 mb-4">เปิด AI Seed Panel หรือ Import CSV แล้วกด 🧠 AI จัดกลุ่ม 3-Tier เพื่อสร้าง Crown Hierarchy</p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button size="sm" className="!h-9 !rounded-lg !bg-gradient-to-r !from-purple-700 !to-indigo-700 hover:!from-purple-800 hover:!to-indigo-800" onClick={() => setShowSeedPanel(true)} disabled={!isAdmin}>
                            <Sparkles className="size-3.5 mr-1.5" /> เปิด AI Seed Panel
                          </Button>
                          <Button size="sm" variant="outline" className="!h-9 !rounded-lg" onClick={() => setTabsValue('cards')}>
                            <Layers className="size-3.5 mr-1.5" /> ดู Cards Grid
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {groupsArr.map(g => {
                          const style = kwStyleOf(g.type);
                          const pillarName = parentPillarName(g);
                          const isExpanded = expandedClustersView.has(g.clusterId);
                          const writtenTotal = g.writtenCount;
                          const total = g.items.length;
                          return (
                            <div key={g.clusterId} className="rounded-2xl border-2 overflow-hidden bg-white" style={{ borderColor: style.border }}>
                              <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: `${style.border}14` }}>
                                <button className="text-stone-600 hover:text-stone-900 shrink-0" onClick={() => toggleCl(g.clusterId)}>
                                  {isExpanded ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[14.5px] truncate text-stone-900 min-w-[200px]" title={g.name}>{g.name}</span>
                                    <span className="inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-md border font-semibold shrink-0" style={{ backgroundColor: style.bg, borderColor: style.border, color: style.text }}>
                                      {(() => { const Ic = style.icon; return <><Ic className="size-3" />{style.label}</>; })()}
                                    </span>
                                    {pillarName && (
                                      <span className="inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-md border border-stone-200 bg-stone-50 text-stone-600 shrink-0 max-w-[260px] truncate" title={pillarName}>
                                        <Target className="size-3 shrink-0" />{pillarName}
                                      </span>
                                    )}
                                    {writtenTotal === 0 ? (
                                      <span className="inline-flex items-center text-[11.5px] px-2.5 py-1 rounded-md border border-stone-200 bg-stone-50 text-stone-500">
                                        ⋯ ยังไม่ได้เขียน
                                      </span>
                                    ) : writtenTotal >= total ? (
                                      <span className="inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium">
                                        ✓ เขียนครบ {writtenTotal}/{total}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 text-blue-700 font-medium">
                                        ✓ เขียนแล้ว {writtenTotal}/{total}
                                      </span>
                                    )}
                                    {g.clusterId === 0 && (
                                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-stone-300 bg-stone-100 text-stone-600">
                                        <AlertTriangle className="size-3" />Unassigned (ยังไม่ได้จัดกลุ่ม)
                                      </span>
                                    )}
                                  </div>
                                  {total > 0 && (
                                    <div className="mt-2 flex items-center gap-3">
                                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden flex-1 max-w-md">
                                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${Math.min(100, (Number(writtenTotal) || 0) / Math.max(1, Number(total) || 1) * 100)}%` }} />
                                      </div>
                                      <span className="text-[11px] text-stone-500 font-mono shrink-0">{total} คำ</span>
                                    </div>
                                  )}
                                </div>
                                {isAdmin && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button size="sm" variant="ghost" className="!h-9 !rounded-lg !text-[12px] !text-stone-700 hover:!bg-stone-100" onClick={() => {
                                      const main = g.items.find(k => (k.tier || '') !== 'supporting') || g.items[0];
                                      if (main) handleClusterAction(mapToCard(main));
                                    }}>
                                      <FilePenLine className="size-4 mr-1.5" /> เขียน
                                    </Button>
                                    <Button size="sm" variant="ghost" className="!h-9 !rounded-lg !text-[12px] !text-blue-700 hover:!bg-blue-50" onClick={async () => {
                                      const allCs = flatClusters;
                                      const filterCs = allCs.filter((x: ClusterRow) => x.id === g.clusterId || g.items.some((k: DbKeyword) => Number(k.clusterId) === Number(x.id))).map(({ id, projectId, name, type, parentId }: ClusterRow) => ({ id, projectId, name, type, parentId }));
                                      const payload = encodeSharePayload({ v: 1, projectName: proj?.name || '', sharedAt: Date.now(), keywords: g.items, clusters: filterCs });
                                      try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#share=${encodeURIComponent(payload)}`); toast.success(`✅ คัดลอก Share Link กลุ่ม ${g.name} สำเร็จ`); }
                                      catch { toast.info('🔗 Share Link: ' + `${location.origin}${location.pathname}#share=…${payload.slice(-20)}`); }
                                    }}>
                                      <Share2 className="size-4 mr-1.5" /> Share
                                    </Button>
                                    <Button size="sm" variant="ghost" className="!h-9 !rounded-lg !text-[12px] !text-rose-700 hover:!bg-rose-50" onClick={() => requestDeleteCluster(g.clusterId)} disabled={g.clusterId === 0}>
                                      <Trash2 className="size-4 mr-1.5" /> ลบ
                                    </Button>
                                  </div>
                                )}
                              </div>
                              {isExpanded && (
                                <div className="divide-y divide-stone-100">
                                  {g.items.length === 0 ? (
                                    <div className="px-4 py-3 text-[12px] text-stone-400 italic">ยังไม่มี Keywords ในกลุ่มนี้ — เพิ่มผ่าน Seed Panel / Import CSV</div>
                                  ) : g.items.map((k, i) => {
                                    const c = mapToCard(k);
                                    const kwIntent = k.intentSuggestion || 'informational';
                                    const iStyle = intentStyleOf(kwIntent as any);
                                    const written = k.status === 'written';
                                    const kdNum = typeof k.difficulty === 'number' ? k.difficulty : null;
                                    return (
                                      <div key={k.id} className="px-4 py-3 flex items-center gap-4 hover:bg-stone-50/70 group transition-colors">
                                        <span className="text-[13px] text-stone-500 font-mono w-6 text-right shrink-0">{i + 1}.</span>
                                        <div className="flex-1 min-w-0 flex items-center gap-4">
                                          <span className="text-[13.5px] text-stone-800 truncate max-w-[320px]">{k.keywordText}</span>
                                          <span className="inline-flex items-center text-[11.5px] px-2 py-0.5 rounded-md border font-medium shrink-0" style={{ backgroundColor: iStyle.bg, borderColor: iStyle.border, color: iStyle.text }}>
                                            {iStyle.label}
                                          </span>
                                          <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-3">
                                            <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden flex-1">
                                              <div className={`h-full rounded-full ${kdBarColor(kdNum)}`} style={{ width: `${Math.min(100, kdNum ?? 0)}%` }} />
                                            </div>
                                            <span className="text-[12px] font-mono text-stone-600 shrink-0 w-12">KD {kdNum ?? '—'}</span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0 text-[11px]">
                                            {k.tier === 'pillar' && <Badge className="!text-[10px] !rounded-md !bg-amber-100 !text-amber-800 !border-amber-300 !py-0.5 !px-2 !h-5">Pillar</Badge>}
                                            {k.isTarget && <Badge className="!text-[10px] !rounded-md !bg-sky-100 !text-sky-800 !border-sky-300 !py-0.5 !px-2 !h-5">🎯 Main</Badge>}
                                            {written ? <Badge className="!text-[10px] !rounded-md !bg-emerald-100 !text-emerald-800 !border-emerald-300 !py-0.5 !px-2 !h-5">✓ เขียนแล้ว</Badge> : null}
                                          </div>
                                        </div>
                                        {isAdmin && (
                                          <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                                            <Button size="sm" variant="ghost" className="!h-8 !rounded-lg !px-2.5 !text-[11.5px] !text-emerald-700 hover:!bg-emerald-50" onClick={() => handleClusterAction(c)}>
                                              <FilePenLine className="size-4 mr-1" /> เขียน
                                            </Button>
                                            <Checkbox checked={selectedIds.has(Number(k.id))} onCheckedChange={() => toggleSelect(Number(k.id))} className="size-4" />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="cards" className="!p-5 !pt-2 !mt-0" role="grid" aria-label="Keyword cards grid">
              {(() => {
                const sortFn = (a: any, b: any) =>
                  (b.vol - a.vol) ||
                  (a.kd - b.kd) ||
                  String(a.keyword).localeCompare(String(b.keyword), "th");
                const pillarCards = allCards.filter(c => c.tier === "pillar").sort(sortFn);
                const clusterCards = allCards.filter(c => c.tier === "cluster").sort(sortFn);
                const supportingCards = allCards.filter(c => c.tier === "supporting").sort(sortFn);
                const CardItem = (c: any) => {
                  const intentMeta = INTENTS.find(i => i.key === c.intent)!;
                  const cb = runningKwIds.has(Number(c.keywordId)) || runPlan.isPending || createDraft.isPending;
                  const cp = c.tier === "pillar";
                  const CIcon = FilePenLine; // User VERBATIM rule: ทุก tier ปุ่มเดียว = เขียน (no 2-button tier split)
                  const sel = selectedIds.has(Number(c.keywordId));
                  const iStyle = intentStyleOf(c.intent as any);
                  const kwStatus = (c.keywordObj?.status ?? c.status ?? 'pending') as 'pending'|'written';
                  return (
                    <Card
                      key={c.id}
                      className={`!rounded-2xl !bg-white !shadow-sm overflow-hidden ${sel ? "ring-2 ring-amber-400 !border-amber-400" : ""}`}
                      style={{ border: `2px solid ${c.style.border}` }}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                          {isAdmin && (
                            <Checkbox
                              checked={sel}
                              onCheckedChange={() => toggleSelect(Number(c.keywordId))}
                              className="data-[state=checked]:!bg-amber-600 data-[state=checked]:!text-white size-5"
                            />
                          )}
                          <span
                            className="px-2.5 py-1 rounded-lg text-[12px] font-bold inline-flex items-center gap-1 !h-8 shrink-0"
                            style={{ backgroundColor: c.style.bg, color: c.style.text }}
                            title={`${c.style.label} · Tier`}
                          >
                            <c.style.icon className="size-4" />
                            {c.style.label}
                          </span>
                          <Badge
                            variant="outline"
                            className="!rounded-xl !text-[11.5px] !h-8 !px-3 !border-transparent font-medium shrink-0 min-w-[108px] whitespace-nowrap"
                            style={{ backgroundColor: iStyle.bg, color: iStyle.text, borderColor: iStyle.border }}
                            title={`Search Intent: ${intentMeta.label}`}
                          >
                            <CircleDot className="size-3.5 mr-1" />
                            {intentMeta.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="!rounded-xl !text-[11.5px] !h-8 !px-3 !border-transparent inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-900 border-emerald-200 shrink-0 min-w-[150px] whitespace-nowrap"
                            title={`Search Volume: ${Number(c.vol||0).toLocaleString()} คำต่อเดือน · data source = ${c.svSource.label}`}
                          >
                            <TrendingUp className="size-3.5 text-emerald-700" />
                            SV: {Number(c.vol||0).toLocaleString()} คำ/เดือน
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`!rounded-xl !text-[11.5px] !h-8 !px-3 !border-transparent inline-flex items-center gap-1.5 shrink-0 min-w-[92px] whitespace-nowrap ${Number(c.kd||0)>=70?'!bg-red-50 !text-red-900 !border-red-200':Number(c.kd||0)>=40?'!bg-amber-50 !text-amber-900 !border-amber-200':'!bg-emerald-50 !text-emerald-900 !border-emerald-200'}`}
                            title={`Keyword Difficulty: ${Number(c.kd||0)}% · ยิ่งสูง ยิ่งแข่งขันมาก · data source = ${c.kdSource.label}`}
                          >
                            <Database className="size-3.5" />
                            KD: {Number(c.kd||0)}%
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`!rounded-xl !text-[11px] !h-8 !px-2.5 !border-transparent inline-flex items-center gap-1 shrink-0 min-w-[92px] whitespace-nowrap ${kwStatus==='written'?'!bg-emerald-50 !text-emerald-800 !border-emerald-300':'!bg-amber-50 !text-amber-800 !border-amber-300'}`}
                            title={kwStatus==='written' ? 'Draft article สร้างแล้ว (Written)' : 'ยังไม่ได้เขียนบทความ (Pending)'}
                          >
                            {kwStatus==='written' ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <Clock className="size-3.5 text-amber-700" />}
                            {kwStatus==='written' ? 'เขียนแล้ว' : 'รอเขียน'}
                          </Badge>
                        </div>
                        <h3 className="font-bold text-[22px] text-stone-900 mb-5 leading-snug tracking-tight">{c.keyword}</h3>
                        <div className="space-y-4 mb-4">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[13px] uppercase tracking-[0.12em] text-stone-500 font-medium">KEYWORD DIFFICULTY</span>
                              <span className="text-[16px] font-bold text-stone-800">{c.kd}%</span>
                            </div>
                            <div className="h-3 w-full rounded-full bg-stone-100 overflow-hidden">
                              <div className="h-full rounded-full bg-amber-600" style={{ width: `${Number(c.kd) || 0}%` }} />
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="grid grid-cols-2 gap-3 text-[13px] pt-1">
                              <div>
                                <div className="text-[12px] uppercase tracking-[0.12em] text-stone-500 font-medium mb-1.5">TIER</div>
                                <select
                                  value={c.tier}
                                  onChange={e => handleInlineTier(c, e.target.value as ClusterTier)}
                                  className="w-full h-11 rounded-xl border border-stone-300 px-3 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                >
                                  <option value="pillar">Pillar</option>
                                  <option value="cluster">Cluster</option>
                                  <option value="supporting">Supporting</option>
                                </select>
                              </div>
                              <div>
                                <div className="text-[12px] uppercase tracking-[0.12em] text-stone-500 font-medium mb-1.5">INTENT</div>
                                <select
                                  value={c.intent}
                                  onChange={e => handleInlineIntent(c, e.target.value as any)}
                                  className="w-full h-11 rounded-xl border border-stone-300 px-3 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                                >
                                  {INTENTS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-4 mt-3 border-t border-stone-200">
                          <Button
                            size="sm"
                            onClick={() => handleClusterAction(c)}
                            disabled={cb || !isAdmin}
                            className="!h-12 !rounded-xl !px-5 font-bold text-[15px] shadow-md !bg-emerald-700 hover:!bg-emerald-800 text-white"
                            title="คลิกเดียว: สร้าง/เปิด Draft + เปิดหน้าเขียน Step 1/6 (กระบวนการเขียนจริง) · ทุก Tier ใช้ปุ่มเดียวกัน — ไม่มี 2 step"
                          >
                            {cb && runningKwIds.has(Number(c.keywordId))
                              ? <Loader2 className="size-5 mr-2 animate-spin" />
                              : <CIcon className="size-5 mr-2" />}
                            เขียนบท
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="!h-12 !rounded-xl !px-4 text-sky-700 hover:!bg-sky-50 text-[14px] font-medium"
                            onClick={() => openSerpPreview(c)}
                            title="ดูตัวอย่าง SERP Top10 + People Also Ask"
                            aria-label="SERP preview"
                          >
                            <Search className="size-5 mr-2" /> SERP
                          </Button>
                          <Button size="sm" variant="ghost" className={`!h-12 !rounded-xl !px-4 text-[14px] font-medium ${copiedId === String(c.id) ? "text-emerald-700 hover:!bg-emerald-50" : "text-stone-700 hover:!bg-stone-100"}`} onClick={() => handleCardShare(c)}>
                            {copiedId === String(c.id) ? <><CheckCheck className="size-5 mr-2" /> คัดลอกแล้ว</> : <><Copy className="size-5 mr-2" /> แชร์</>}
                          </Button>
                          <span className="flex-1" />
                          <Button size="sm" variant="ghost" className="!h-12 !rounded-xl !px-4 text-rose-600 hover:!bg-rose-50 text-[14px] font-medium" onClick={() => handleCardDeleteClick(c)} disabled={runningKwIds.has(Number(c.keywordId))}>
                            🗑️ ลบ
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                };
                return (
                  <>
                    {loading && allCards.length === 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 kcp-skeleton-shimmer rounded-2xl">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Card key={`skel-c-${i}`} className="!rounded-2xl !overflow-hidden animate-pulse">
                            <CardContent className="p-5 space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded bg-stone-200" />
                                <div className="h-4 w-16 rounded-full bg-stone-200" />
                                <div className="h-4 w-20 rounded-full bg-stone-100" />
                              </div>
                              <div className="h-5 w-4/5 rounded bg-stone-200" />
                              <div className="h-4 w-3/5 rounded bg-stone-100" />
                              <div className="space-y-2 pt-2">
                                <div className="h-4 w-full rounded bg-stone-100" />
                                <div className="h-2 w-full rounded bg-stone-200" />
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <div className="h-7 rounded bg-stone-200" />
                                <div className="h-7 rounded bg-stone-100" />
                              </div>
                              <div className="h-8 w-full rounded bg-stone-100 mt-2" />
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                    {!loading && allCards.length > 0 && (
                      <div className="space-y-8">
                        {pillarCards.length > 0 && (
                          <section aria-label="Pillar tier cards">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-1.5 h-8 rounded-full bg-amber-600" />
                              <Crown className="size-5 text-amber-700" />
                              <h3 className="font-bold text-[18px] text-stone-900 tracking-tight">Pillar · {pillarCards.length} คำ (หัวข้อหลัก · L1)</h3>
                              <Badge className="ml-auto !h-7 !rounded-lg !bg-amber-100 !text-amber-800 !border-amber-300 !text-[11.5px] !font-semibold">TOP-DOWN HIERARCHY · 10%</Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{pillarCards.map(c => CardItem(c))}</div>
                          </section>
                        )}
                        {clusterCards.length > 0 && (
                          <section aria-label="Cluster tier cards">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-1.5 h-8 rounded-full bg-blue-600" />
                              <Layers className="size-5 text-blue-700" />
                              <h3 className="font-bold text-[18px] text-stone-900 tracking-tight">Cluster · {clusterCards.length} คำ (กลุ่มย่อย · L2)</h3>
                              <Badge className="ml-auto !h-7 !rounded-lg !bg-blue-100 !text-blue-800 !border-blue-300 !text-[11.5px] !font-semibold">SILO GROUP · 30%</Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{clusterCards.map(c => CardItem(c))}</div>
                          </section>
                        )}
                        {supportingCards.length > 0 && (
                          <section aria-label="Supporting tier cards">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-1.5 h-8 rounded-full bg-emerald-600" />
                              <BookOpen className="size-5 text-emerald-700" />
                              <h3 className="font-bold text-[18px] text-stone-900 tracking-tight">Supporting · {supportingCards.length} คำ (สนับสนุน long-tail · L3)</h3>
                              <Badge className="ml-auto !h-7 !rounded-lg !bg-emerald-100 !text-emerald-800 !border-emerald-300 !text-[11.5px] !font-semibold">LONGTAIL EEAT · 60%</Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{supportingCards.map(c => CardItem(c))}</div>
                          </section>
                        )}
                      </div>
                    )}
                    {allCards.length === 0 && !loading && (
                      <Card className="!rounded-2xl !border-dashed !border-stone-300">
                        <CardContent className="p-10 text-center">
                          {projectId === 'all' && projects.length === 0 ? (
                            <><Database className="size-12 mx-auto text-stone-400 mb-3" /><h3 className="font-semibold text-stone-800 mb-1">ยังไม่มีโปรเจกต์</h3><p className="text-stone-500 text-[13px]">ไปสร้างโปรเจกต์ก่อนที่หน้า Projects</p></>
                          ) : (
                            <><Upload className="size-12 mx-auto text-stone-400 mb-3" /><h3 className="font-semibold text-stone-800 mb-1">ยังไม่มี Keywords</h3><p className="text-stone-500 text-[13px] mb-4">เริ่มต้นด้วยการคลิก "Import CSV" หรือ "เพิ่ม Keyword" ด้านบน</p>
                              <div className="flex items-center justify-center gap-2">
                                <Button size="sm" className="!h-9 !rounded-lg" onClick={() => setImportOpen(true)}><Upload className="size-4 mr-1.5" /> Import CSV</Button>
                                <Button size="sm" variant="outline" className="!h-9 !rounded-lg" onClick={() => setAddOpen(true)}><Plus className="size-4 mr-1.5" /> เพิ่ม Keyword</Button>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </>
                );
              })()}
            </TabsContent>

            <TabsContent value="table" className="!p-5 !pt-2 !mt-0">
              <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white">
                <div className="grid grid-cols-12 border-b border-stone-200 bg-white/80 text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                  {isAdmin && <div className="col-span-1 p-3 border-r border-stone-200 text-center"><Checkbox checked={selectedIds.size === allCards.filter(c => Number(c.keywordId) > 0).length && allCards.length > 0} onCheckedChange={() => {
                    const ids = allCards.map(c => Number(c.keywordId)).filter(id => id > 0);
                    if (selectedIds.size === ids.length) clearSelection(); else selectAll(ids);
                  }} /></div>}
                  <div className={`${isAdmin ? 'col-span-4' : 'col-span-5'} p-3 border-r border-stone-200`}>Keyword</div>
                  <div className="col-span-2 p-3 border-r border-stone-200 text-center">Tier / Intent</div>
                  <div className="col-span-1 p-3 border-r border-stone-200 text-right">KD</div>
                  <div className="col-span-1 p-3 border-r border-stone-200 text-right">Vol</div>
                  <div className={`${isAdmin ? 'col-span-3' : 'col-span-3'} p-3 text-center`}>Action</div>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {loading && allCards.length === 0 && (
                    <div className="kcp-skeleton-shimmer rounded-lg">
                      {Array.from({ length: 8 }).map((_, i) => (
                    <div key={`skel-t-${i}`} className="grid grid-cols-12 border-b border-stone-100 animate-pulse">
                      {isAdmin && <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-center"><div className="w-4 h-4 rounded bg-stone-200" /></div>}
                      <div className={`${isAdmin ? 'col-span-4' : 'col-span-5'} p-3 border-r border-stone-100 flex items-center gap-2`}>
                        <div className="w-4 h-4 rounded bg-stone-200 shrink-0" />
                        <div className="h-4 w-3/4 rounded bg-stone-200" />
                      </div>
                      <div className="col-span-2 p-3 border-r border-stone-100 grid place-items-center">
                        <div className="flex items-center gap-1.5">
                          <div className="w-10 h-4 rounded bg-stone-200" />
                          <div className="w-16 h-3 rounded bg-stone-100" />
                        </div>
                      </div>
                      <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-end">
                        <div className="w-10 h-4 rounded bg-stone-200" />
                      </div>
                      <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-end">
                        <div className="w-12 h-4 rounded bg-stone-100" />
                      </div>
                      <div className={`${isAdmin ? 'col-span-3' : 'col-span-3'} p-3 flex items-center justify-center gap-1.5`}>
                        <div className="h-8 w-24 rounded bg-stone-200" />
                        <div className="h-8 w-8 rounded bg-stone-100" />
                        <div className="h-8 w-8 rounded bg-stone-100" />
                        <div className="h-8 w-8 rounded bg-stone-200" />
                      </div>
                    </div>
                  ))}
                    </div>
                  )}
                  {allCards.map((c, idx) => {
                    const intent = INTENTS.find(i => i.key === c.intent)!;
                    const busy = runningKwIds.has(Number(c.keywordId)) || runPlan.isPending || createDraft.isPending;
                    const isPillar = c.tier === "pillar";
                    const btnLabel = "เขียนบท"; // User VERBATIM rule: ทุก tier = เขียนบท (no 2 step)
                    const BtnIcon = FilePenLine;
                    const btnClass = "!bg-emerald-700 hover:!bg-emerald-800 text-white";
                    const sel = selectedIds.has(Number(c.keywordId));
                    return (
                      <div key={c.id} className={`grid grid-cols-12 border-b border-stone-100 last:border-b-0 hover:bg-amber-50/40 transition-colors text-[13px] ${sel ? '!bg-amber-50' : ''}`}>
                        {isAdmin && <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-center"><Checkbox checked={sel} onCheckedChange={() => toggleSelect(Number(c.keywordId))} aria-label={`Select ${c.keyword}`} /></div>}
                        <div className={`${isAdmin ? 'col-span-4' : 'col-span-5'} p-3 border-r border-stone-100 flex items-center gap-2`}>
                          <c.style.icon className="size-4" style={{ color: c.style.border }} aria-hidden />
                          <span className="font-medium text-stone-800 truncate">{c.keyword}</span>
                        </div>
                        <div className="col-span-2 p-3 border-r border-stone-100 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold" style={{ backgroundColor: c.style.bg, color: c.style.text }}>{c.style.label}</span>
                            <span className="text-[12px]" style={{ color: intent.color }}>● {intent.label}</span>
                          </div>
                        </div>
                        <div className="col-span-1 p-3 border-r border-stone-100 text-right font-mono text-[12.5px] font-semibold" title={Number(c.kd||0)>0?`Keyword Difficulty ${Number(c.kd)}% — ยิ่งสูง ยิ่งแข่งขันมาก`:'รอ Enrich SERP เพื่อคำนวณ KD%'}>{Number(c.kd||0)>0?`${c.kd}%`:<span className="text-stone-400">-</span>}</div>
                        <div className="col-span-1 p-3 border-r border-stone-100 text-right font-mono text-[12.5px]" title={Number(c.vol||0)>0?`Search Volume ${Number(c.vol).toLocaleString()} คำต่อเดือน`:'ยังไม่มีข้อมูล Search Volume — คลิก Enrich SERP'}>{Number(c.vol||0)>0?<span className="text-stone-700">{c.vol.toLocaleString()}</span>:<span className="text-stone-400">-</span>}</div>
                        <div className={`${isAdmin ? 'col-span-3' : 'col-span-3'} p-3 text-center flex items-center justify-center gap-1.5`}>
                          <Button
                            size="sm"
                            className={`!h-8 !rounded-lg !px-2.5 !text-[11.5px] font-semibold shadow-sm ${btnClass}`}
                            onClick={() => handleClusterAction(c)}
                            disabled={!isAdmin || busy}
                            title="คลิกเดียว: สร้าง/เปิด Draft + เปิดหน้าเขียน (กระบวนการ Step 1-6) · ทุก Tier ใช้ปุ่มเดียวกัน — ไม่มี 2 step"
                            aria-label={`เขียนบทความ ${c.keyword}`}
                          >
                            {busy && runningKwIds.has(Number(c.keywordId))
                              ? <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                              : <BtnIcon className="size-3.5 mr-1.5" aria-hidden />}
                            {busy && runningKwIds.has(Number(c.keywordId)) ? "กำลังทำ..." : btnLabel}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="!h-8 !rounded-lg !px-2 !text-[11.5px] text-sky-700 hover:!bg-sky-50"
                            onClick={() => openSerpPreview(c)}
                            title="SERP Preview: Top10 + PAA"
                            aria-label="SERP preview"
                          >
                            <Search className="size-3.5" aria-hidden />
                          </Button>
                          <Button size="sm" variant="ghost" className={`!h-8 !rounded-lg !px-2 !text-[11.5px] ${copiedId === String(c.id) ? 'text-emerald-700' : 'text-stone-600'}`} onClick={() => handleCardShare(c)} aria-label={copiedId === String(c.id) ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์ keyword"}>
                            {copiedId === String(c.id) ? <CheckCheck className="size-3.5 mr-1 inline" aria-hidden /> : <Copy className="size-3.5 mr-1 inline" aria-hidden />}
                          </Button>
                          <Button size="sm" variant="ghost" className="!h-8 !rounded-lg !px-2 !text-[11.5px] text-rose-600" onClick={() => handleCardDeleteClick(c)} disabled={busy} aria-label={`ลบ ${c.keyword}`}>
                            🗑️
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {allCards.length === 0 && !loading && (
                    <div className="p-10 text-center text-stone-500 text-[13px]">ไม่มีข้อมูล — คลิก Import CSV หรือ Add Keyword</div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tree" className="!p-5 !pt-2 !mt-0">
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="!rounded-md !border-stone-300 !bg-white/80 !text-stone-700 !text-[12px] !px-3 !h-8">
                  <FolderTree className="size-3.5 mr-1.5 text-amber-700" />
                  Real Cluster Hierarchy: Pillar → Cluster → Supporting (3 Tier Visual Map)
                </Badge>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  className="!h-8 !rounded-lg !bg-amber-50 hover:!bg-amber-100 !border-amber-300 !text-amber-900 !text-[12px] font-semibold"
                  onClick={() => openAddCluster("top_pillar", null)}
                  title="เพิ่ม Pillar ใหม่ (ระดับบนสุด)"
                >
                  <Plus className="size-3.5 mr-1.5 text-amber-700" /> เพิ่ม Pillar ใหม่
                </Button>
                <Alert className="!py-1.5 !px-3 !rounded-lg !bg-sky-50/80 !border-sky-200 !h-8 max-w-[520px]">
                  <AlertDescription className="!text-[11.5px] !text-sky-800 leading-none">
                    💡 แผนผังแบบภาพ ระดับความเชื่อมโยง: <strong>Pillar (เหลืองบน) → Cluster (น้ำเงินกลาง) → Supporting (เขียวล่าง)</strong> · สามชั้นสายสัมพันธ์
                  </AlertDescription>
                </Alert>
              </div>

              {/* ============ VISUAL 3-TIER HIERARCHY MAP (LIKE USER IMAGE REFERENCE) ============ */}
              {!loading && (() => {
                const pillars = childClusters(null).filter(c => (c.type as ClusterTier) === "pillar");
                if (pillars.length === 0) return null;

                const CARD_W = 220;
                const CARD_H = 92;
                const GAP_X_PILLAR = 80;
                const GAP_X_CLUSTER = 28;
                const GAP_X_SUPP = 20;
                const ROW_GAP = 90;
                const PAD_X = 32;
                const PAD_Y = 24;
                const n0 = (n: any, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;

                const pillarPositions = pillars.map((p) => {
                  const clusters = childClusters(p.id).filter(c => (c.type as ClusterTier) === "cluster");
                  const clusterPositions = clusters.map((c) => {
                    const supps = childClusters(c.id).filter(s => (s.type as ClusterTier) === "supporting");
                    const suppCount = supps.length;
                    const suppWidth = suppCount <= 0 ? 0 : suppCount * CARD_W + Math.max(0, suppCount - 1) * GAP_X_SUPP;
                    const clusterWidth = CARD_W;
                    return { cluster: c, supps: supps, suppWidth: n0(suppWidth, 0), clusterWidth: n0(clusterWidth, CARD_W) };
                  });
                  const sumCluster = clusterPositions.reduce((s, cp) => s + Math.max(CARD_W, n0(cp.suppWidth, 0), n0(cp.clusterWidth, CARD_W)), 0);
                  const totalClusterSuppWidth = sumCluster + Math.max(0, clusterPositions.length - 1) * GAP_X_CLUSTER;
                  const pillerWidth = Math.max(CARD_W, n0(totalClusterSuppWidth, 0));
                  return { pillar: p, clusterPositions, pillarWidth: n0(pillerWidth, CARD_W) };
                });

                let xCursor = PAD_X;
                const pillarPlaced: any[] = [];
                for (const pp of pillarPositions) {
                  const pw = n0(pp.pillarWidth, CARD_W);
                  const pillarX = xCursor + Math.max(0, (pw - CARD_W) / 2);
                  const placedClusters: any[] = [];
                  let cx0 = xCursor;
                  for (let ci = 0; ci < pp.clusterPositions.length; ci++) {
                    const cp = pp.clusterPositions[ci];
                    const needed = Math.max(CARD_W, n0(cp.suppWidth, 0));
                    const clusterX = cx0 + Math.max(0, (needed - CARD_W) / 2);
                    const placedSupps: any[] = [];
                    let sx0 = cx0;
                    for (let si = 0; si < cp.supps.length; si++) {
                      placedSupps.push({ supp: cp.supps[si], x: n0(sx0, 0) });
                      sx0 = n0(sx0, 0) + CARD_W + GAP_X_SUPP;
                    }
                    placedClusters.push({ cluster: cp.cluster, x: n0(clusterX, cx0), width: n0(needed, CARD_W), placedSupps: placedSupps });
                    cx0 = n0(cx0, 0) + n0(needed, CARD_W) + GAP_X_CLUSTER;
                  }
                  pillarPlaced.push({ pillar: pp.pillar, x: n0(pillarX, xCursor), width: pw, placedClusters });
                  xCursor = n0(xCursor, PAD_X) + pw + GAP_X_PILLAR;
                }

                const baseTotalW = Number.isFinite(xCursor) ? Math.max(0, xCursor - GAP_X_PILLAR + PAD_X) : 0;
                const orphanTop = childClusters(null).filter(c => (c.type as ClusterTier) !== "pillar");
                const ORPHAN_ROW_GAP = 60;
                const ORPHAN_LABEL_H = 28;
                const orphanRowY = PAD_Y + CARD_H * 3 + ROW_GAP * 2 + ORPHAN_ROW_GAP;
                const orphanW = orphanTop.length > 0 ? orphanTop.length * CARD_W + Math.max(0, orphanTop.length - 1) * GAP_X_CLUSTER + PAD_X * 2 : 0;
                const layoutW = Math.max(baseTotalW, orphanW, 1200);
                const totalH = PAD_Y * 2 + CARD_H * 3 + ROW_GAP * 2 + (orphanTop.length > 0 ? ORPHAN_ROW_GAP + ORPHAN_LABEL_H + CARD_H + 24 : 0);
                const ROW0_Y = PAD_Y;
                const ROW1_Y = PAD_Y + CARD_H + ROW_GAP;
                const ROW2_Y = PAD_Y + CARD_H * 2 + ROW_GAP * 2;
                const ROW_ORPHAN_Y = orphanRowY + ORPHAN_LABEL_H + 16;

                const renderTreeCard = (c: any, x: number, y: number, tier: ClusterTier) => {
                  const style = TIER_STYLES[tier];
                  const Icon = style.icon;
                  const kwDirectArr = Array.isArray(currentProjectKeywords)
                    ? currentProjectKeywords.filter((k: any) => Number(k.clusterId) === Number(c.id))
                    : [];
                  const kwDirectLen = Math.max(0, Number.isFinite(kwDirectArr.length) ? kwDirectArr.length : 0);
                  const descIds: number[] = [];
                  (function walk(pid: number) {
                    descIds.push(Number(pid));
                    const directChildren = Array.isArray(currentProjectClusterRows)
                      ? currentProjectClusterRows.filter((cc: any) => Number(cc.parentId || 0) === Number(pid) && String(cc.name ?? "") !== UNASSIGNED_CLUSTER_NAME)
                      : [];
                    for (const ch of directChildren) walk(Number(ch.id));
                  })(Number(c.id));
                  const descSet = new Set(descIds.map(n => Number(n)));
                  const kwsHierarchyArr = Array.isArray(currentProjectKeywords)
                    ? currentProjectKeywords.filter((k: any) => descSet.has(Number(k.clusterId)))
                    : [];
                  const kwsHierarchyLen = Math.max(0, Number.isFinite(kwsHierarchyArr.length) ? kwsHierarchyArr.length : 0);
                  const kwCountRaw = (tier === "pillar" || tier === "cluster") ? kwsHierarchyLen : kwDirectLen;
                  const kwCount = Math.max(0, Number.isFinite(kwCountRaw) ? kwCountRaw : 0);
                  const cid = Number.isFinite(Number(c.id)) ? Number(c.id) : -1;
                  const exp = tier === "pillar" ? expandedPillars.has(cid) : expandedClusters.has(cid);
                  const childrenCount = childClusters(c.id).length;
                  const isEmptyCluster = kwCount === 0 && childrenCount === 0 && tier !== "supporting";
                  const borderColor = isEmptyCluster ? "#dc2626" : style.border;
                  const bgColor = isEmptyCluster ? "#fef2f2" : style.bg;
                  return (
                    <div
                      key={`vc-${tier}-${cid}`}
                      className="absolute rounded-xl shadow-sm border-2 overflow-hidden select-none"
                      style={{ left: n0(x, 0), top: n0(y, ROW0_Y), width: CARD_W, height: CARD_H, borderColor, backgroundColor: bgColor }}
                      onClick={() => {
                        if (childrenCount + kwCount > 0) toggleExpand(cid, tier === "pillar" ? "pillar" : "cluster");
                      }}
                    >
                      <div className="flex items-center justify-between px-2.5 py-1.5" style={{ borderBottom: `1px solid ${borderColor}55`, backgroundColor: `${borderColor}12` }}>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: bgColor, color: isEmptyCluster ? "#b91c1c" : style.text }}>
                            <Icon className="size-3" /> {isEmptyCluster ? `${style.label} · Empty` : style.label}
                          </span>
                          {(() => {
                            const p = TIER_PLACEMENT[tier];
                            return (
                              <span
                                className="inline-flex items-center gap-1 text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0 border"
                                style={{ backgroundColor: p.bg, color: p.color, borderColor: `${p.border}66` }}
                                title={p.description}
                              >
                                {p.heading}
                                <span className="hidden md:inline text-[8.5px] font-sans opacity-80 tracking-tight">· {p.description.split(' ')[0]}{p.description.split(' ')[1] ? ` ${p.description.split(' ')[1].replace('·','').slice(0,10)}` : ''}</span>
                              </span>
                            );
                          })()}
                        </div>
                        {tier !== "supporting" && (
                          <span className={`text-[9.5px] font-mono opacity-70 shrink-0 ml-2 ${isEmptyCluster ? 'text-red-600 font-bold' : 'text-stone-700'}`}>{isEmptyCluster ? '⚠️ 0 ลูก' : `${n0(childrenCount, 0)} ลูก`}</span>
                        )}
                      </div>
                      <div className="px-2.5 py-1">
                        <div className="text-[12px] font-semibold leading-tight line-clamp-2" style={{ maxHeight: 32, overflow: 'hidden', color: isEmptyCluster ? '#7f1d1d' : '#0c0a09' }} title={String(c.name ?? '')}>{String(c.name ?? '')}</div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className={`inline-flex items-center gap-1 text-[10.5px] font-mono font-semibold ${isEmptyCluster ? 'text-red-700' : 'text-stone-700'}`}>
                            <Hash className="size-3" style={{ color: isEmptyCluster ? '#b91c1c' : style.text }} /> {isEmptyCluster ? '0 KW · ไม่มีคำ' : `${String(kwCount)} KW`}
                          </span>
                          {tier !== "supporting" && (
                            <span className="inline-flex items-center gap-0.5 text-[9.5px] opacity-75">
                              {exp ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="rounded-2xl border border-stone-200 bg-[#faf7f2] overflow-auto" style={{ minHeight: 200 }}>
                    <div className="relative" style={{ width: layoutW, height: totalH }}>
                      <svg width={layoutW} height={totalH} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 0 }}>
                        {pillarPlaced.map((pp) => (
                          <g key={`svg-p-${pp.pillar.id}`}>
                            {pp.placedClusters.map((pc: any) => (
                              <g key={`svg-c-${pc.cluster.id}`}>
                                <path
                                  d={`M ${pp.x + CARD_W / 2} ${ROW0_Y + CARD_H} V ${ROW0_Y + CARD_H + ROW_GAP / 2} H ${pc.x + CARD_W / 2} V ${ROW1_Y}`}
                                  stroke={TIER_STYLES.pillar.border}
                                  strokeWidth={1.5}
                                  fill="none"
                                  opacity={0.55}
                                />
                                {pc.placedSupps.map((ps: any) => (
                                  <path
                                    key={`svg-s-${ps.supp.id}`}
                                    d={`M ${pc.x + CARD_W / 2} ${ROW1_Y + CARD_H} V ${ROW1_Y + CARD_H + ROW_GAP / 2} H ${ps.x + CARD_W / 2} V ${ROW2_Y}`}
                                    stroke={TIER_STYLES.cluster.border}
                                    strokeWidth={1.25}
                                    fill="none"
                                    opacity={0.5}
                                  />
                                ))}
                              </g>
                            ))}
                          </g>
                        ))}
                      </svg>
                      {pillarPlaced.map((pp) => renderTreeCard(pp.pillar, pp.x, ROW0_Y, "pillar"))}
                      {pillarPlaced.flatMap(pp => pp.placedClusters.map((pc: any) => renderTreeCard(pc.cluster, pc.x, ROW1_Y, "cluster")))}
                      {pillarPlaced.flatMap(pp => pp.placedClusters.flatMap((pc: any) => pc.placedSupps.map((ps: any) => renderTreeCard(ps.supp, ps.x, ROW2_Y, "supporting"))))}
                      {orphanTop.length > 0 && (() => {
                        const labelY = orphanRowY;
                        const iconX = PAD_X + 48;
                        const iconMidX = iconX + 10;
                        const placedOrphans = orphanTop.map((c, i) => {
                          const ox = PAD_X + i * (CARD_W + GAP_X_CLUSTER);
                          return { c, x: ox, cx: ox + CARD_W / 2 };
                        });
                        return (
                          <>
                            <svg width={layoutW} height={totalH} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 0 }}>
                              {placedOrphans.map((po, i) => (
                                <path
                                  key={`svg-orph-${i}`}
                                  d={`M ${iconMidX} ${labelY + ORPHAN_LABEL_H / 2} V ${ROW_ORPHAN_Y} H ${po.cx}`}
                                  stroke="#b45309"
                                  strokeWidth={1.5}
                                  strokeDasharray="6 4"
                                  fill="none"
                                  opacity={0.55}
                                />
                              ))}
                            </svg>
                            <div className="absolute flex items-center gap-2 px-3 rounded-lg border border-amber-300 bg-amber-50" style={{ left: PAD_X, top: labelY, width: 280, height: ORPHAN_LABEL_H }}>
                              <AlertTriangle className="size-3.5 text-amber-700" />
                              <span className="text-[11.5px] font-bold text-amber-900">⚠️ ไม่มี Pillar แม่ (Orphan Top-level) — {orphanTop.length} กลุ่ม</span>
                            </div>
                            {placedOrphans.map((po, i) => renderTreeCard(po.c, po.x, ROW_ORPHAN_Y, (po.c.type as ClusterTier) || "cluster"))}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              <div className="my-5 border-t border-stone-200" />

              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline" className="!rounded-md !border-stone-300 !bg-white !text-stone-600 !text-[11px] !px-2.5 !h-7">
                  <Terminal className="size-3 mr-1.5 text-stone-500" />
                  Advanced — Inline Edit / Rename / Move Table
                </Badge>
              </div>

              <div className="border border-stone-200 rounded-2xl overflow-hidden bg-[#fafaf9]">
                <div className="grid grid-cols-12 border-b border-stone-200 bg-white/80 text-[10.5px] uppercase tracking-wider text-stone-500 font-semibold">
                  <div className="col-span-1 p-3 border-r border-stone-200 text-center">ต่อ</div>
                  <div className="col-span-4 p-3 border-r border-stone-200">ชื่อกลุ่ม / Keyword</div>
                  <div className="col-span-1 p-3 border-r border-stone-200 text-center">Tier</div>
                  <div className="col-span-2 p-3 border-r border-stone-200 text-center">Parent</div>
                  <div className="col-span-1 p-3 border-r border-stone-200 text-center">Intent / วาง</div>
                  <div className="col-span-1 p-3 border-r border-stone-200 text-right">#KW</div>
                  <div className="col-span-2 p-3 text-center">จัดการ</div>
                </div>

                {loading && (() => {
                  const depthPatterns = [0, 0, 1, 1, 2, 2, 0, 1, 1, 0];
                  return (
                    <div className="kcp-skeleton-shimmer rounded-lg">
                      {depthPatterns.map((depth, i) => (
                    <div key={`skel-tr-${i}`} className="grid grid-cols-12 border-b border-stone-100 animate-pulse">
                      <div className="col-span-1 p-3 border-r border-stone-100" />
                      <div className="col-span-4 p-3 border-r border-stone-100 flex items-center gap-2" style={{ paddingLeft: 12 + depth * 22 }}>
                        <span className="inline-block w-5"><div className="w-3.5 h-3.5 rounded bg-stone-200" /></span>
                        <div className="w-4 h-4 rounded bg-stone-200 shrink-0" />
                        <div className={`h-4 rounded bg-stone-${i % 2 === 0 ? 200 : 100}`} style={{ width: `${60 - depth * 10}%` }} />
                      </div>
                      <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-center"><div className="w-12 h-5 rounded bg-stone-200" /></div>
                      <div className="col-span-2 p-3 border-r border-stone-100 grid place-items-center"><div className="w-24 h-5 rounded bg-stone-100" /></div>
                      <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-center"><div className="w-16 h-4 rounded bg-stone-200" /></div>
                      <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-end"><div className="w-10 h-4 rounded bg-stone-200" /></div>
                      <div className="col-span-2 p-3 flex items-center justify-center gap-1"><div className="h-8 w-28 rounded bg-stone-200" /></div>
                    </div>
                  ))}
                    </div>
                  );
                })()}

                {!loading && (() => {
                  const rows: React.ReactNode[] = [];
                  const pillars = childClusters(null).filter(c => (c.type as ClusterTier) === "pillar");
                  const orphanTopClusters = childClusters(null).filter(c => (c.type as ClusterTier) !== "pillar");

                  function renderCluster(cluster: any, depth: number) {
                    const id = Number(cluster.id);
                    const tier: ClusterTier = (cluster.type as ClusterTier) || "supporting";
                    const style = TIER_STYLES[tier];
                    const Icon = style.icon;
                    const isEditing = editingClusterId === id;
                    const childCs = childClusters(id);
                    // ⚠️ FIX ROOT BUG (N=45 → แสดงผลแค่ 9 คำ) — PILLAR/CLUSTER ต้องรวมลูก Supporting ทั้งหมด ไม่ใช่แค่ตรงๆ
                    // เพราะ LLM จัด Keyword ไว้ที่ Supporting ไม่ใช่ตรง Pillar/Cluster โดยตรง → Old: kwsForCluster(id) = 0 บ่อยๆ → แสดงผลแค่ 9 จาก 45
                    const keywordsDirect = kwsForCluster(id);
                    const keywordsHierarchy = kwsRecursiveForCluster(id);
                    const keywords = (tier === "pillar" || tier === "cluster") ? keywordsHierarchy : keywordsDirect;
                    const isPillar = tier === "pillar";
                    const isCluster = tier === "cluster";
                    const hasAnyChild = childCs.length > 0 || keywords.length > 0;
                    const expanded = isPillar
                      ? expandedPillars.has(id)
                      : expandedClusters.has(id);
                    const eligibleParents: { id: number; name: string }[] = tier === "cluster"
                      ? currentProjectClusterRows.filter(c => (c.type as ClusterTier) === "pillar").map(c => ({ id: Number(c.id), name: c.name }))
                      : tier === "supporting"
                        ? currentProjectClusterRows.filter(c => (c.type as ClusterTier) === "cluster").map(c => ({ id: Number(c.id), name: c.name }))
                        : [];
                    const canDelete = childCs.length === 0 && keywords.length === 0;
                    rows.push(
                      <div key={`cluster-${id}`} className="grid grid-cols-12 border-b border-stone-100 last:border-b-0 hover:bg-amber-50/30 transition-colors text-[13px]" style={{ backgroundColor: depth === 0 ? `${style.bg}30` : undefined }}>
                        <div className="col-span-1 p-2.5 border-r border-stone-100 grid place-items-center">
                          {hasAnyChild ? (
                            <button
                              className="size-6 rounded grid place-items-center hover:bg-stone-200/80"
                              onClick={() => toggleExpand(id, isPillar ? "pillar" : "cluster")}
                              aria-label={expanded ? `ย่อส่วน ${cluster.name}` : `ขยายส่วน ${cluster.name}`}
                            >
                              {expanded
                                ? <ChevronDown className="size-4 text-stone-600" />
                                : <ChevronRight className="size-4 text-stone-600" />}
                            </button>
                          ) : null}
                        </div>
                        <div className="col-span-4 p-2.5 border-r border-stone-100 flex items-center gap-2 flex-wrap" style={{ paddingLeft: 12 + depth * 22 }}>
                          <Icon className="size-5 shrink-0" style={{ color: style.border }} />
                          {isEditing ? (
                            <>
                              <Input
                                value={editingClusterName}
                                onChange={e => setEditingClusterName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") saveRenameCluster(id).catch(() => {}); else if (e.key === "Escape") cancelRenameCluster(); }}
                                autoFocus
                                className="!h-8 !text-[13px] flex-1 min-w-[180px] max-w-[360px]"
                                aria-label={`Edit cluster name ${cluster.name ?? ''}`}
                              />
                              <Button size="sm" variant="outline" className="!h-7 !px-2 !text-[11px]" onClick={() => saveRenameCluster(id).catch(()=>{})} title="บันทึกชื่อ">
                                <CheckCheck className="size-3.5 text-emerald-700" />
                              </Button>
                              <Button size="sm" variant="ghost" className="!h-7 !px-2 !text-[11px]" onClick={cancelRenameCluster} title="ยกเลิกแก้ไข">
                                <X className="size-3.5 text-rose-700" />
                              </Button>
                            </>
                          ) : (
                            <button
                              className="font-semibold text-stone-900 truncate hover:underline decoration-dotted decoration-amber-500 underline-offset-2 text-left"
                              onClick={() => startRenameCluster(cluster)}
                              title="คลิกเพื่อแก้ไขชื่อกลุ่ม (Inline Rename)"
                            >
                              {String(cluster.name ?? `Unnamed ${style.label} #${id}`)}
                            </button>
                          )}
                        </div>
                        <div className="col-span-1 p-2.5 border-r border-stone-100 grid place-items-center gap-1">
                          <Badge className="!rounded-md !text-[11px] !border-0" style={{ backgroundColor: style.bg, color: style.text }}>{style.label}</Badge>
                          <select
                            className="mt-1 w-[78px] !h-6 text-[10.5px] rounded border border-stone-300 bg-white px-1 text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            value={tier}
                            onChange={e => changeClusterType(id, e.target.value as ClusterTier, cluster).catch(()=>{})}
                            title="เปลี่ยน Tier กลุ่มนี้ (Pillar/Cluster/Supporting)"
                            aria-label={`Change cluster tier id=${id}`}
                          >
                            <option value="pillar">Pillar</option>
                            <option value="cluster">Cluster</option>
                            <option value="supporting">Supporting</option>
                          </select>
                        </div>
                        <div className="col-span-2 p-2.5 border-r border-stone-100 grid place-items-center">
                          {tier === "pillar" ? (
                            <span className="text-[11px] text-stone-500 italic">— Top Level —</span>
                          ) : (
                            <select
                              className="w-full max-w-[180px] h-7 text-[11px] rounded border border-stone-300 bg-white px-1 text-stone-700 truncate focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={String(cluster.parentId ?? "")}
                              onChange={e => changeClusterParent(id, e.target.value ? Number(e.target.value) : null, cluster).catch(()=>{})}
                              title={`ย้ายไปอยู่ใต้ ${style.label === 'Cluster' ? 'Pillar' : 'Cluster'} อื่น`}
                              aria-label={`Change parent cluster id=${id}`}
                            >
                              {eligibleParents.length === 0 && <option value="">— (ไม่มีแม่) —</option>}
                              {eligibleParents.map(p => (
                                <option key={p.id} value={p.id}>#{p.id} · {p.name.slice(0, 40)}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="col-span-1 p-2.5 border-r border-stone-100 grid place-items-center">
                          {(() => {
                            const p = TIER_PLACEMENT[tier];
                            return (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border"
                                style={{ backgroundColor: p.bg, color: p.color, borderColor: `${p.border}66` }}
                                title={`ตำแหน่งวางในบทความ: ${p.description}`}
                              >
                                {p.heading}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="col-span-1 p-2.5 border-r border-stone-100 grid place-items-end pr-4">
                          <span className="inline-flex items-center gap-1 text-[11.5px] font-mono font-semibold text-stone-700" title="จำนวน Keywords ในกลุ่ม + กลุ่มย่อย">
                            <Hash className="size-3 text-stone-500" />
                            {keywords.length}
                          </span>
                        </div>
                        <div className="col-span-2 p-2.5 flex items-center justify-center gap-1 flex-wrap">
                          {isPillar && (
                            <Button size="sm" variant="outline" className="!h-7 !px-2 !text-[11px]" onClick={() => openAddCluster("pillar_parent", id)} title="เพิ่ม Cluster ลงใน Pillar นี้">
                              <Plus className="size-3.5 mr-1 text-sky-700" /> Cluster
                            </Button>
                          )}
                          {isCluster && (
                            <Button size="sm" variant="outline" className="!h-7 !px-2 !text-[11px]" onClick={() => openAddCluster("cluster_parent", id)} title="เพิ่ม Supporting ลงใน Cluster นี้">
                              <Plus className="size-3.5 mr-1 text-emerald-700" /> Supp
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="!h-7 !px-2 !text-[11px] text-rose-700 hover:!bg-rose-50 disabled:!opacity-40 disabled:!cursor-not-allowed"
                            disabled={!canDelete}
                            onClick={() => requestDeleteCluster(id)}
                            title={canDelete ? `ลบ ${style.label} นี้` : "ห้ามลบ กรุณาลบ Keywords และ Sub-cluster ลูกก่อน"}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                    if (!expanded) return;
                    for (const child of childCs) renderCluster(child, depth + 1);
                    for (const kw of keywords) renderKeywordRow(kw, depth + 1, cluster);
                  }

                  function renderKeywordRow(kw: any, depth: number, parentCluster: any | null) {
                    const kwId = Number(kw.id);
                    const kwTier: ClusterTier = (kw.tier as ClusterTier) || (parentCluster?.type as ClusterTier) || "supporting";
                    const tierStyle = TIER_STYLES[kwTier];
                    const TierIcon = tierStyle.icon;
                    const intentKey: any = (kw.intentSuggestion as any) || "informational";
                    const intentStyle = INTENTS.find(i => i.key === intentKey) || INTENTS[3];
                    const sel = selectedIds.has(kwId);
                    const kdRaw = Number(kw.difficulty ?? NaN);
                    const hasKd = typeof kw.difficulty === 'number' && Number.isFinite(kdRaw);
                    const kd = hasKd ? Math.max(0, Math.min(100, kdRaw)) : 0;
                    const volRaw = Number(kw.searchVolume ?? NaN);
                    const hasVol = typeof kw.searchVolume === 'number' && Number.isFinite(volRaw) && volRaw > 0;
                    const vol = hasVol ? Math.max(0, volRaw) : 0;
                    const busy = runningKwIds.has(kwId) || runPlan.isPending || createDraft.isPending;
                    const kwCard = mapToCard(kw);
                    const BtnIcon = FilePenLine; // User VERBATIM: ทุก tier เขียนปุ่มเดียว
                    const btnClass = "!bg-emerald-700 hover:!bg-emerald-800 text-white";
                    const btnLabel = "เขียนบท";
                    rows.push(
                      <div key={`kw-${kwId}`} className={`grid grid-cols-12 border-b border-stone-50 last:border-b-0 hover:bg-white/80 transition-colors text-[12.5px] ${sel ? '!bg-amber-50' : ''}`}>
                        <div className="col-span-1 p-2 border-r border-stone-50 grid place-items-center">
                          <Checkbox checked={sel} onCheckedChange={() => toggleSelect(kwId)} aria-label={`Select keyword ${kw.keywordText ?? ''}`} />
                        </div>
                        <div className="col-span-4 p-2 border-r border-stone-50 flex items-center gap-2" style={{ paddingLeft: 12 + depth * 22 }}>
                          <span className="inline-block w-5 shrink-0" />
                          <TierIcon className="size-3.5 shrink-0" style={{ color: tierStyle.border }} />
                          <span className="font-medium text-stone-800 truncate" title={`${String(kw.keywordText ?? '')}\nVolume: ${vol}`}>
                            {String(kw.keywordText ?? '')}
                          </span>
                          {vol > 0 && <span className="text-[10.5px] text-stone-500 font-mono ml-auto shrink-0 pr-1">Vol {vol.toLocaleString('en-US')}</span>}
                          {!hasVol && <span className="text-[10.5px] text-stone-400 font-mono ml-auto shrink-0 pr-1" title="ยังไม่ได้ Enrich SERP กดปุ่ม Enrich ด้านบนเพื่อดูค่า Search Volume จริง">Vol —</span>}
                          {(() => {
                            const p = TIER_PLACEMENT[kwTier];
                            return (
                              <span
                                className="inline-flex items-center justify-center shrink-0 text-[9.5px] font-bold font-mono px-1 py-0.5 rounded border ml-1"
                                style={{ backgroundColor: p.bg, color: p.color, borderColor: `${p.border}80`, minWidth: 28 }}
                                title={`Keyword นี้วางที่: ${p.description}`}
                              >
                                {p.heading}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="col-span-1 p-2 border-r border-stone-50 grid place-items-center gap-1">
                          <select
                            className="w-[72px] h-6 text-[10.5px] rounded border border-stone-300 bg-white px-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            style={{ backgroundColor: tierStyle.bg, color: tierStyle.text, borderColor: tierStyle.border }}
                            value={kwTier}
                            onChange={async e => {
                              try { await updateTierMut.mutateAsync({ id: kwId, tier: e.target.value as ClusterTier }); toast.success(`✅ ตั้ง Tier เป็น ${e.target.value}`); }
                              catch (err: any) { toast.error(`❌ เปลี่ยน Tier ล้มเหลว: ${String(err?.message ?? err).slice(0,140)}`); }
                            }}
                            aria-label={`Change keyword tier id=${kwId}`}
                          >
                            <option value="pillar">Pillar</option>
                            <option value="cluster">Cluster</option>
                            <option value="supporting">Supp</option>
                          </select>
                        </div>
                        <div className="col-span-2 p-2 border-r border-stone-50 grid place-items-center">
                          <select
                            className="w-full max-w-[170px] h-6 text-[10.5px] rounded border border-stone-300 bg-white px-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            value={String(parentCluster?.id ?? kw.clusterId ?? "")}
                            onChange={e => moveKeywordToCluster(kwId, e.target.value ? Number(e.target.value) : null).catch(()=>{})}
                            title="ย้าย Keyword ไปอยู่ในกลุ่มอื่น (เปลี่ยน Cluster ที่สังกัด)"
                            aria-label={`Move keyword ${kwId} to cluster`}
                          >
                            <option value="0">— ยังไม่จัดกลุ่ม —</option>
                            {currentProjectClusterRows.map(c => (
                              <option key={c.id} value={c.id}>#{c.id} [{TIER_STYLES[(c.type as ClusterTier) || 'supporting'].label}] {String(c.name ?? '').slice(0, 32)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-1 p-2 border-r border-stone-50 grid place-items-center">
                          <select
                            className="w-[84px] h-6 text-[10.5px] rounded border border-stone-300 bg-white px-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            value={intentKey}
                            onChange={e => changeKeywordIntent(kwId, e.target.value as any).catch(()=>{})}
                            style={{ color: intentStyle.color }}
                            title="เปลี่ยน Search Intent (Commercial/Transactional/Navigational/Informational)"
                            aria-label={`Change keyword intent id=${kwId}`}
                          >
                            {INTENTS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-1 p-2 border-r border-stone-50 grid place-items-end pr-4">
                          {hasKd ? (
                            <span className="font-mono text-[12px] font-semibold text-stone-700">{kd}%</span>
                          ) : (
                            <span className="text-[11px] text-stone-400" title="ยังไม่ได้ Enrich SERP กดปุ่ม Enrich ด้านบนเพื่อดูค่า Keyword Difficulty (0-100 ยิ่งสูงยิ่งแข่ง)">—</span>
                          )}
                        </div>
                        <div className="col-span-2 p-2 flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            className={`!h-7 !rounded-lg !px-2 !text-[10.5px] font-semibold shadow-sm ${btnClass}`}
                            onClick={() => handleClusterAction(kwCard)}
                            disabled={!isAdmin || busy}
                            aria-label={`เขียนบทความ ${kw.keywordText ?? ''}`}
                          >
                            {busy && runningKwIds.has(kwId) ? <Loader2 className="size-3 mr-1 animate-spin" /> : <BtnIcon className="size-3 mr-1" />}
                            {busy && runningKwIds.has(kwId) ? "..." : btnLabel}
                          </Button>
                          <Button size="sm" variant="ghost" className="!h-7 !w-7 !p-0 !rounded-lg text-sky-700 hover:!bg-sky-50" onClick={() => openSerpPreview(kwCard)} title="SERP Preview: Top10 + PAA" aria-label="SERP preview">
                            <Search className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  for (const pillar of pillars) renderCluster(pillar, 0);
                  if (orphanTopClusters.length > 0 && pillars.length === 0) {
                    for (const c of orphanTopClusters) renderCluster(c, 0);
                  } else if (orphanTopClusters.length > 0) {
                    rows.push(
                      <div key="orphan-header" className="grid grid-cols-12 border-b border-dashed border-amber-200 bg-amber-50/40">
                        <div className="col-span-12 p-2 pl-5 text-[11.5px] font-semibold text-amber-900 flex items-center gap-2">
                          <AlertTriangle className="size-3.5 text-amber-700" />
                          ไม่มี Pillar แม่ (orphan clusters) — พบ {orphanTopClusters.length} กลุ่มระดับ Top-level ที่ไม่ใช่ Pillar
                        </div>
                      </div>
                    );
                    for (const c of orphanTopClusters) renderCluster(c, 0);
                  }

                  const unassignedKw = kwsUnassigned();
                  if (unassignedKw.length > 0) {
                    const expanded = expandedClusters.has(UNASSIGNED_FAKE_ID);
                    rows.push(
                      <div key="unassigned-header" className="grid grid-cols-12 border-b border-stone-100 bg-stone-100">
                        <div className="col-span-1 p-2.5 border-r border-stone-200 grid place-items-center">
                          {unassignedKw.length > 0 && (
                            <button
                              className="size-6 rounded grid place-items-center hover:bg-white/80"
                              onClick={() => toggleExpand(UNASSIGNED_FAKE_ID, "cluster")}
                              aria-label={expanded ? "ย่อ Unassigned" : "ขยาย Unassigned"}
                            >
                              {expanded ? <ChevronDown className="size-4 text-stone-700" /> : <ChevronRight className="size-4 text-stone-700" />}
                            </button>
                          )}
                        </div>
                        <div className="col-span-4 p-2.5 border-r border-stone-200 flex items-center gap-2" style={{ paddingLeft: 12 }}>
                          <CircleDot className="size-5 shrink-0 text-stone-500" />
                          <span className="font-bold text-stone-700">ยังไม่จัดกลุ่ม (Unassigned Keywords)</span>
                        </div>
                        <div className="col-span-1 p-2.5 border-r border-stone-200 text-center"><Badge className="!bg-stone-200 !text-stone-700 !rounded-md !text-[11px] !border-0">N/A</Badge></div>
                        <div className="col-span-2 p-2.5 border-r border-stone-200 text-center text-[11.5px] italic text-stone-600">— ไม่มี Parent —</div>
                        <div className="col-span-1 p-2.5 border-r border-stone-200 grid place-items-center"><span className="text-[11px] text-stone-500">—</span></div>
                        <div className="col-span-1 p-2.5 border-r border-stone-200 text-right pr-4 font-mono text-[12px] font-bold text-stone-700">{unassignedKw.length}</div>
                        <div className="col-span-2 p-2.5 flex items-center justify-center text-[11px] text-stone-600">
                          ใช้ Dropdown <strong className="mx-1">AI จัดกลุ่ม</strong> บน Toolbar หรือย้าย Manual ทีละคำ
                        </div>
                      </div>
                    );
                    if (expanded) for (const kw of unassignedKw) renderKeywordRow(kw, 1, null);
                  }

                  if (currentProjectClusterRows.length === 0 && currentProjectKeywords.length === 0) {
                    rows.push(
                      <div key="empty" className="col-span-12 p-10 text-center text-stone-500 text-[13px]">
                        ไม่มีข้อมูล — กด <strong>+ เพิ่ม Pillar ใหม่</strong> ด้านบน หรือ <strong>Import CSV / Add Keyword</strong> เพื่อเริ่มสร้าง Tree 3-Tier
                      </div>
                    );
                  }
                  return rows;
                })()}
              </div>

              <Dialog open={addClusterDialogOpen} onOpenChange={o => setAddClusterDialogOpen(o)}>
                <DialogContent className="!max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle className="!text-[15px]">
                      {addClusterParentType === "top_pillar" && <>สร้าง Pillar ใหม่ (ระดับบนสุด)</>}
                      {addClusterParentType === "pillar_parent" && <>เพิ่ม Cluster ลงใน Pillar #{addClusterParentId ?? ''}</>}
                      {addClusterParentType === "cluster_parent" && <>เพิ่ม Supporting ลงใน Cluster #{addClusterParentId ?? ''}</>}
                    </DialogTitle>
                    <DialogDescription className="!text-[12.5px] !text-stone-600">
                      Tree Structure: <strong>Pillar (บนสุด)</strong> → <strong>Cluster</strong> → <strong>Supporting (ล่างสุด)</strong> · คำหลักจะถูกใส่ไว้ใน Supporting หรือ Cluster ก็ได้
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 my-1">
                    <div>
                      <Label className="!text-[12px] !text-stone-700">ชื่อกลุ่ม (Name)</Label>
                      <Input
                        value={addClusterName}
                        onChange={e => setAddClusterName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") submitAddCluster().catch(()=>{}); }}
                        className="!mt-1 !h-9 !text-[13px]"
                        placeholder={
                          addClusterParentType === "top_pillar"
                            ? "ชื่อ Pillar เช่น 'การพนันออนไลน์ YMYL'"
                            : addClusterParentType === "pillar_parent"
                              ? "ชื่อ Cluster เช่น 'สล็อตออนไลน์'"
                              : "ชื่อ Supporting เช่น 'วิธีสมัครสมาชิกสล็อต pg'"
                        }
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className="!rounded-md !border-0" style={{ backgroundColor: TIER_STYLES[addClusterParentType === "top_pillar" ? "pillar" : addClusterParentType === "pillar_parent" ? "cluster" : "supporting"].bg, color: TIER_STYLES[addClusterParentType === "top_pillar" ? "pillar" : addClusterParentType === "pillar_parent" ? "cluster" : "supporting"].text }}>
                        {addClusterParentType === "top_pillar" ? "Tier: Pillar" : addClusterParentType === "pillar_parent" ? "Tier: Cluster" : "Tier: Supporting"}
                      </Badge>
                      {addClusterParentType !== "top_pillar" && addClusterParentId && currentProjectClusterRows.find(c => Number(c.id) === addClusterParentId) && (
                        <span className="text-[12px] text-stone-600 truncate max-w-[240px]">Parent: {String(currentProjectClusterRows.find(c => Number(c.id) === addClusterParentId)?.name ?? '')}</span>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost" size="sm" className="!h-8 !text-[12px]">ยกเลิก</Button>
                    </DialogClose>
                    <Button
                      size="sm"
                      className="!h-8 !bg-amber-600 hover:!bg-amber-700 !text-[12px] font-semibold"
                      onClick={() => submitAddCluster().catch(()=>{})}
                    >
                      <Plus className="size-3.5 mr-1" /> สร้าง
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog open={!!confirmDeleteClusterId} onOpenChange={o => { if (!o) setConfirmDeleteClusterId(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="!text-[15px] text-rose-900">ยืนยันลบกลุ่ม (Cluster ID: {confirmDeleteClusterId})</AlertDialogTitle>
                    <AlertDialogDescription className="!text-[12.5px] text-stone-700">
                      <AlertTriangle className="size-4 inline mr-1.5 text-rose-600" />
                      การลบจะทำงานก็ต่อเมื่อ <strong>ไม่มี Keyword และไม่มี Sub-cluster ลูก</strong> ในกลุ่มนี้เท่านั้น — ไม่สามารถกู้คืนได้
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      <Button variant="ghost" size="sm" className="!h-8 !text-[12px]">ยกเลิก</Button>
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={() => applyDeleteCluster().catch(()=>{})}>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="!h-8 !text-[12px] !bg-rose-700 hover:!bg-rose-800"
                      >
                        <Trash2 className="size-3.5 mr-1" /> ยืนยันลบ
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TabsContent>

            <TabsContent value="shared" className="!p-5 !pt-2 !mt-0">
              <Alert className="mb-5 !rounded-xl !bg-amber-50 !border-amber-200">
                <LinkIcon className="size-5 text-amber-700" />
                <AlertTitle className="!text-amber-900 !text-[14px] font-semibold flex items-center gap-2">
                  🔗 ระบบแชร์ลิงก์ — URL Hash Base64 Encode (NO DB CHANGE · AC-6 Compliant)
                </AlertTitle>
                <AlertDescription className="!text-amber-800 !text-[13px] mt-1 leading-relaxed">
                  วิธีทำงาน: <code className="bg-white/80 px-1.5 py-0.5 rounded border border-amber-200 mx-1">Keywords/Clusters JSON</code>
                  <span className="mx-1">→</span>
                  <code className="bg-white/80 px-1.5 py-0.5 rounded border border-amber-200 mx-1">Base64 (btoa)</code>
                  <span className="mx-1">→</span>
                  <code className="bg-white/80 px-1.5 py-0.5 rounded border border-amber-200 mx-1">URL#share=eyJ...</code>
                  <br />
                  ผู้รับเปิดลิงก์ <code>/kcp#share=...</code> ได้ทันทีแบบ Read-Only · ไม่ต้อง Login · ไม่ต้องต่อ DB (Guest Mode)
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm lg:col-span-2 flex flex-col">
                  <CardHeader className="!p-5 !pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl grid place-items-center bg-amber-100 text-amber-800">
                        <Share2 className="size-5" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-[15px] font-semibold text-stone-900">สร้างลิงก์แชร์โปรเจกต์</CardTitle>
                        <CardDescription className="text-[12px] text-stone-500 mt-0.5">เลือกโปรเจกต์ → คลิก Copy Link → ส่งให้ใครก็ได้</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="!p-5 !pt-0 space-y-4 flex-1 flex flex-col">
                    <div className="space-y-1.5">
                      <Label className="!text-[12px] !text-stone-600">โปรเจกต์ที่จะแชร์</Label>
                      <div className="relative">
                        <select
                          value={String(projectId)}
                          onChange={e => setProjectId(e.target.value === "all" ? "all" : Number(e.target.value))}
                          className="w-full h-10 !rounded-lg border border-stone-300 bg-white pl-3 pr-9 text-[13px] font-medium text-stone-800 appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                        >
                          <option value="all">— เลือกโปรเจกต์เดียว (ห้าม "ทุกโปรเจกต์") —</option>
                          {projects.map(p => (
                            <option key={p.id} value={String(p.id)}>
                              #{p.id} · {pickCategoryLabel(Number(p.category_id || p.categoryId))} · {(p.name || "").slice(0, 40)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
                      </div>
                      {projectId === "all" && (
                        <p className="text-[11.5px] text-amber-700 flex items-center gap-1 mt-1">
                          <AlertTriangle className="size-3" /> กรุณาเลือกโปรเจกต์เดียวก่อน (Share ต่อโปรเจกต์)
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <Card className="!rounded-lg !bg-stone-50 !border-stone-200 !shadow-none">
                        <CardContent className="p-2.5 text-center">
                          <Crown className="size-3.5 mx-auto mb-0.5" style={{ color: TIER_STYLES.pillar.border }} />
                          <p className="text-[10.5px] uppercase tracking-wider text-stone-500">Pillar</p>
                          <p className="text-[15px] font-bold text-stone-900">{shareCountPillar}</p>
                        </CardContent>
                      </Card>
                      <Card className="!rounded-lg !bg-stone-50 !border-stone-200 !shadow-none">
                        <CardContent className="p-2.5 text-center">
                          <Layers className="size-3.5 mx-auto mb-0.5" style={{ color: TIER_STYLES.cluster.border }} />
                          <p className="text-[10.5px] uppercase tracking-wider text-stone-500">Cluster</p>
                          <p className="text-[15px] font-bold text-stone-900">{shareCountCluster}</p>
                        </CardContent>
                      </Card>
                      <Card className="!rounded-lg !bg-stone-50 !border-stone-200 !shadow-none">
                        <CardContent className="p-2.5 text-center">
                          <BookOpen className="size-3.5 mx-auto mb-0.5" style={{ color: TIER_STYLES.supporting.border }} />
                          <p className="text-[10.5px] uppercase tracking-wider text-stone-500">Support</p>
                          <p className="text-[15px] font-bold text-stone-900">{shareCountSupporting}</p>
                        </CardContent>
                      </Card>
                      <Card className="!rounded-lg !bg-amber-50 !border-amber-200 !shadow-none">
                        <CardContent className="p-2.5 text-center">
                          <Hash className="size-3.5 mx-auto mb-0.5 text-amber-700" />
                          <p className="text-[10.5px] uppercase tracking-wider text-amber-600">Total</p>
                          <p className="text-[15px] font-bold text-amber-900">{shareCountTotal}</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-2 p-3 rounded-xl bg-stone-50 border border-stone-200">
                      <Label className="!text-[12px] !text-stone-600 flex items-center gap-1.5">
                        <Filter className="size-3.5" /> Preview Filter (สำหรับตรวจสอบก่อนแชร์)
                      </Label>
                      <div className="relative">
                        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                        <Input
                          placeholder="🔍 Search keywords..."
                          value={shareSearch}
                          onChange={e => setShareSearch(e.target.value)}
                          className="!h-8 !pl-8 !rounded-lg !text-[12.5px]"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(["all", "pillar", "cluster", "supporting"] as TierFilter[]).map(t => {
                          const active = shareTierFilter === t;
                          const label = t === "all" ? "All" : TIER_STYLES[t as ClusterTier].label;
                          return (
                            <Button key={t} size="sm" variant={active ? "default" : "outline"} className={`!h-7 !rounded-full !px-2.5 !text-[11px] ${active ? '!bg-amber-600 hover:!bg-amber-700' : ''}`} onClick={() => setShareTierFilter(t)}>
                              {label}
                            </Button>
                          );
                        })}
                        <select value={shareIntentFilter} onChange={e => setShareIntentFilter(e.target.value as IntentFilter)} className="h-7 !rounded-full border border-stone-300 px-2.5 text-[11px] bg-white focus:outline-none">
                          <option value="all">All Intent</option>
                          {INTENTS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                        </select>
                      </div>
                      <p className="text-[11px] text-stone-500 text-right">
                        Filtered: <span className="font-semibold text-stone-700">{sharePreviewFiltered.length}</span> / {shareCountTotal}
                      </p>
                    </div>

                    <div className="mt-auto pt-1 space-y-2">
                      <Button
                        size="lg"
                        className="w-full !h-11 !rounded-xl !text-[13.5px] font-semibold !bg-gradient-to-br !from-amber-600 !to-amber-700 hover:!from-amber-700 hover:!to-amber-800 shadow-sm"
                        onClick={handleBuildShareLink}
                        disabled={!isAdmin || projectId === "all" || shareCountTotal === 0}
                      >
                        {copiedShareLink ? (
                          <><CheckCheck className="size-4.5 mr-2" /> ✅ คัดลอกลิงก์แล้ว — ส่งให้ใครก็ได้!</>
                        ) : (
                          <><LinkIcon className="size-4.5 mr-2" /> 🔗 สร้างลิงก์แชร์ + Copy Clipboard</>
                        )}
                      </Button>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="!rounded-full !text-[10.5px] !bg-emerald-50 !border-emerald-200 !text-emerald-700 flex-1 justify-center !py-1.5">
                          <ShieldCheck className="size-3 mr-1.5" /> NO DB WRITE · Safe
                        </Badge>
                        <Badge variant="outline" className="!rounded-full !text-[10.5px] !bg-sky-50 !border-sky-200 !text-sky-700 flex-1 justify-center !py-1.5">
                          <Eye className="size-3 mr-1.5" /> Guest View OK
                        </Badge>
                      </div>
                      {!isAdmin && (
                        <p className="text-[11px] text-rose-600 text-center flex items-center justify-center gap-1">
                          <AlertTriangle className="size-3" /> ต้องเป็น Admin/Owner เท่านั้น
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm lg:col-span-3">
                  <CardHeader className="!p-5 !pb-3 flex flex-row items-center gap-2">
                    <div className="w-10 h-10 rounded-xl grid place-items-center bg-sky-100 text-sky-800">
                      <Eye className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-[15px] font-semibold text-stone-900">Preview: รายการ Keyword ที่จะแชร์</CardTitle>
                      <CardDescription className="text-[12px] text-stone-500 mt-0.5 truncate">
                        Project: {projectId === "all" ? "— ยังไม่เลือกโปรเจกต์ —" : (projects.find(p => Number(p.id) === Number(projectId))?.name || `Project #${projectId}`)}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="!rounded-full !text-[11px] !bg-stone-50 border-stone-200 shrink-0 !h-7">
                      {sharePreviewFiltered.length} items
                    </Badge>
                  </CardHeader>
                  <CardContent className="!p-5 !pt-0">
                    <div className="border border-stone-200 rounded-xl overflow-hidden">
                      <div className="grid grid-cols-12 border-b border-stone-200 bg-white/80 text-[10.5px] uppercase tracking-wider text-stone-500 font-semibold">
                        <div className="col-span-6 p-2.5 border-r border-stone-200">Keyword</div>
                        <div className="col-span-2 p-2.5 border-r border-stone-200 text-center">Tier</div>
                        <div className="col-span-2 p-2.5 border-r border-stone-200 text-center">Intent</div>
                        <div className="col-span-1 p-2.5 border-r border-stone-200 text-right">KD</div>
                        <div className="col-span-1 p-2.5 text-right">Vol</div>
                      </div>
                      <div className="max-h-[440px] overflow-y-auto">
                        {sharePreviewFiltered.length === 0 ? (
                          <div className="p-8 text-center">
                            <Search className="size-9 mx-auto text-stone-400 mb-2" />
                            <p className="text-stone-500 text-[13px]">
                              {projectId === "all" ? "เลือกโปรเจกต์ก่อนเพื่อดู Preview Keywords" : (shareCountTotal === 0 ? "โปรเจกต์นี้ยังไม่มี Keywords — Import CSV หรือ Add ก่อน" : "ไม่พบรายการตาม Filter ปัจจุบัน")}
                            </p>
                          </div>
                        ) : sharePreviewFiltered.map((k, i) => {
                          const style = kwStyleOf(k.tier);
                          const intent = INTENTS.find(x => x.key === (k.intentSuggestion || INTENTS[i % INTENTS.length].key))!;
                          const kd = typeof k.difficulty === 'number' ? k.difficulty : 30 + ((Number(k.id) * 17) % 60);
                          const vol = typeof k.searchVolume === 'number' ? k.searchVolume : 200 + ((Number(k.id) * 37) % 5000);
                          return (
                            <div key={`${k.id}-${i}`} className="grid grid-cols-12 border-b border-stone-100 last:border-b-0 hover:bg-amber-50/30 transition-colors text-[12.5px] items-center">
                              <div className="col-span-6 p-2.5 border-r border-stone-100 flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded grid place-items-center shrink-0 text-[10px] font-bold text-stone-500 bg-stone-100 border border-stone-200">{i + 1}</span>
                                <span className="font-medium text-stone-800 truncate">{k.keywordText}</span>
                              </div>
                              <div className="col-span-2 p-2.5 border-r border-stone-100 text-center">
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: style.bg, color: style.text }}>{style.label}</span>
                              </div>
                              <div className="col-span-2 p-2.5 border-r border-stone-100 text-center">
                                <span className="text-[11px]" style={{ color: intent.color }}>● {intent.label}</span>
                              </div>
                              <div className="col-span-1 p-2.5 border-r border-stone-100 text-right font-mono text-[11.5px] font-semibold">{kd}%</div>
                              <div className="col-span-1 p-2.5 text-right font-mono text-[11.5px] text-stone-700">{vol.toLocaleString()}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ---------- DELETE CONFIRM ALERT DIALOG ---------- */}
      <AlertDialog open={openDel} onOpenChange={(v) => { if (!deleteKwMut.isPending) setOpenDel(v); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-rose-800 flex items-center gap-2">
              <AlertTriangle className="size-5" /> ยืนยันการลบ Keyword / Cluster
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[13px] text-stone-600">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5">
                <p><b className="text-stone-800">Keyword ที่จะลบ:</b> <span className="font-mono text-stone-900">{delCard?.keyword?.slice(0, 80) ?? ''}</span></p>
                <p><b>Tier:</b> <span className="font-semibold">{delCard?.style?.label ?? 'Unknown'}</span> · <b>Project ID:</b> #{Number(delCard?.projectId ?? 0)}</p>
                <p><b>Search Vol:</b> {Number(delCard?.vol ?? 0).toLocaleString()} · <b>KD:</b> {Number(delCard?.kd ?? 0)}%</p>
              </div>
              <ol className="list-decimal pl-5 space-y-1">
                <li>⚠️ <b>SA G1.1 Referential Integrity:</b> หากมี <b>บทความ (Articles)</b> ผูกอยู่กับ keyword นี้ ระบบจะปฏิเสธการลบโดยอัตโนมัติ (Foreign Key Guard)</li>
                <li>📊 ข้อมูล Search Volume / KD ที่ enrich ไว้จะสูญหาย</li>
                <li>🔄 ไม่สามารถ undo / restore กลับมาได้</li>
              </ol>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="!h-9 !rounded-lg" disabled={deleteKwMut.isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="!h-9 !rounded-lg !bg-rose-700 hover:!bg-rose-800"
              disabled={deleteKwMut.isPending}
              onClick={(e) => { e.preventDefault(); confirmDeleteCard(); }}
            >
              {deleteKwMut.isPending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
              {deleteKwMut.isPending ? 'กำลังลบ...' : '✅ ยืนยันลบถาวร'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- SERP PREVIEW MODAL (Menu4⭐⭐) ---------- */}
      <Dialog open={serpModalOpen} onOpenChange={(v) => setSerpModalOpen(v)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-stone-900 flex items-center gap-2 flex-wrap">
              <Search className="size-5 text-sky-700" />
              <span>🔍 SERP Preview:</span>
              <span className="text-amber-800 truncate max-w-[380px]">{serpModalCard?.keyword || '—'}</span>
              {serpModalCard && (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold ml-auto" style={{ backgroundColor: serpModalCard?.style?.bg, color: serpModalCard?.style?.text }}>
                  {serpModalCard?.style?.label} Tier · Vol {(serpModalCard?.vol ?? 0).toLocaleString()}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone-500">
              ตัวอย่างผลการค้นหาจริง Google Top10 + People Also Ask (PAA) จากฐานข้อมูล Research Package · ใช้เป็นข้อมูลอ้างอิงก่อนเขียนบทความ
            </DialogDescription>
          </DialogHeader>
          { serpModalCard && serpModalCard.tier === 'pillar' && (
            <Alert variant="destructive" className="bg-rose-50 border-rose-300 text-rose-900">
              <AlertTriangle className="size-5" />
              <AlertTitle className="font-bold">🚫 Pillar Umbrella Keyword — ห้ามเขียนบทความโดยตรง</AlertTitle>
              <AlertDescription className="text-[13px] leading-relaxed">
                Pillar Tier = <b>คำหลัก Umbrella</b> ครอบคลุมทั้งโปรเจกต์ ใช้สำหรับ <b>วาง Research Package / จัด Hierarchy / จัด Cluster</b> เท่านั้น ❌ ไม่สามารถเขียน Draft ได้
                <div className="mt-2"><b>✅ ควรทำ:</b> กด <span className="bg-amber-100 px-2 py-0.5 rounded border border-amber-300 mx-1">🔎 Run Pillar Research Plan</span> ก่อน แล้วจึงเลือก Keyword ที่เป็น Tier = <b>Cluster</b> หรือ <b>Supporting</b> แทน เพื่อเขียนบทความ EEAT เนื้อหาเฉพาะเจาะจง</div>
              </AlertDescription>
            </Alert>
          ) }
          { serpModalCard && serpModalCard.tier === 'pillar' && (() => {
            const pid = Number(serpModalCard.projectId || 0);
            let recs: any[] = (dbKeywords as any[]).filter((k:any) => k.tier === 'cluster' && (pid>0 ? Number(k.projectId)===pid : true)).slice(0,5);
            if (!recs.length) recs = allCards.filter((c:any) => c.tier === 'cluster').slice(0,5).map((c:any)=>({id: c.keywordId ?? Date.now()+Math.random(), keywordText:c.keyword, tier:'cluster', intentSuggestion:c.intent, searchVolume:c.vol, difficulty:c.kd, clusterId:(c as any).clusterId ?? (c as any).cluster_id ?? 0, projectId:pid}));
            if (!recs.length) return null;
            return (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60">
                <div className="text-[12.5px] font-semibold text-amber-900 mb-2">💡 แนะนำ: Cluster Tier Keyword ที่สามารถเขียนบทความได้ (ตัวอย่าง {recs.length})</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">{recs.map((r:any,i:number)=>(
                  <button key={i} type="button" onClick={()=>{ const match = allCards.find((c:any)=>String(c.keyword)===String(r.keywordText || r.keyword)); if (match) setSerpModalCard(match); }} className="text-left text-[12px] p-2 rounded-lg bg-white/90 border border-amber-200 hover:bg-amber-100 hover:border-amber-400 transition-colors">
                    <div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">CLUSTER</span> <span className="font-semibold text-stone-800 truncate">{r.keywordText || r.keyword}</span></div>
                    <div className="text-[10.5px] text-stone-500 mt-0.5">Vol {(r.searchVolume ?? r.vol ?? 0).toLocaleString()} · KD {r.difficulty ?? r.kd ?? '—'} · Intent {r.intentSuggestion ?? r.intent ?? 'N/A'}</div>
                  </button>
                ))}</div>
              </div>
            );
          })() }
          <div className="space-y-4 pt-2">
            {serpPkgQ.isLoading && (
              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50 flex items-center gap-3">
                <Loader2 className="size-5 animate-spin text-sky-700" />
                <span className="text-[13px] text-sky-800">กำลังโหลดข้อมูล SERP จากฐานข้อมูล Research Package...</span>
              </div>
            )}
            {!serpPkgQ.isLoading && (!serpPkgQ.data?.package) && (
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-2">
                <div className="text-[14px] font-semibold text-stone-800 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" /> ยังไม่มี Research Package ในฐานข้อมูล
                </div>
                <p className="text-[13px] text-stone-600">ยังไม่ได้ทำการ Enrich SERP หรือ Run Research Plan สำหรับ Keyword นี้</p>
                <div className="flex gap-2 flex-wrap pt-1">
                  <Button
                    size="sm"
                    className="!bg-amber-700 hover:!bg-amber-800"
                    disabled={enriching || runPlan.isPending || !isAdmin || serpModalCard?.tier !== 'pillar'}
                    onClick={() => { handleClusterAction(serpModalCard); setSerpModalOpen(false); }}
                  >
                    <PlayCircle className="size-4 mr-2" />
                    {serpModalCard?.tier === 'pillar' ? '🚀 Pillar Run Research Plan' : 'สร้าง Draft EEAT ก่อน'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={enriching || !isAdmin || Number(serpModalCard?.keywordId ?? 0) <= 0}
                    onClick={() => {
                      if (!serpModalCard?.keywordId) return;
                      const pid = serpModalCard?.projectId;
                      if (!pid || projectId === 'all') { toast.error('เลือกโปรเจกต์ก่อน Enrich'); return; }
                      enrichSerp.mutate(
                        { projectId: Number(pid), keywordIds: [Number(serpModalCard.keywordId)] },
                        { onSuccess() { toast.success('✅ Enrich SERP เสร็จ — โหลด Modal อีกครั้ง'); utils.research.getPackage.invalidate({ keywordId: Number(serpModalCard.keywordId) }); } }
                      );
                    }}
                  >
                    <Zap className="size-4 mr-2" /> ⚡ Enrich SERP คำหลักนี้
                  </Button>
                </div>
              </div>
            )}
            {serpPkgQ.data?.package && (
              <>
                {/* Top10 Tiles */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[13px] font-semibold text-stone-700 flex items-center gap-2">
                      <Target className="size-4 text-emerald-700" /> 🥇 Google SERP Top 10 Organic
                      <Badge className="!bg-emerald-100 !text-emerald-800 !border-emerald-200">{(Array.isArray((serpPkgQ.data?.package as any)?.serp_top10) ? (serpPkgQ.data?.package as any)?.serp_top10.length : 0)} results</Badge>
                    </div>
                    {(serpPkgQ.data?.package as any)?.ai_overview && (
                      <span className="text-[11px] text-stone-400">มี AI Overview</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(Array.isArray((serpPkgQ.data?.package as any)?.serp_top10) ? (serpPkgQ.data?.package as any).serp_top10 : []).slice(0, 10).map((r: any, i: number) => {
                      const da = typeof r.domain_authority === 'number' ? r.domain_authority : (typeof r.da === 'number' ? r.da : 30 + ((i * 7) % 50));
                      const title = String(r.title || 'SERP Result').slice(0, 180);
                      const domain = String(r.domain || r.url || '').replace(/^https?:\/\//, '').split('/')[0] || 'unknown';
                      const snippet = String(r.snippet || r.description || '').slice(0, 200);
                      const isHighDa = da >= 35;
                      return (
                        <div key={i} className={`border rounded-xl p-3 text-left ${isHighDa ? 'bg-white border-emerald-100' : 'bg-stone-50/70 border-stone-200'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-stone-500 text-white' : i === 2 ? 'bg-orange-700 text-white' : 'bg-stone-300 text-stone-700'}`}>
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className="text-[12px] font-semibold text-emerald-800 truncate max-w-[50%]">{domain}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${isHighDa ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>DA {da}</span>
                                {isHighDa && <CheckCircle2 className="size-3.5 text-emerald-600 inline" />}
                              </div>
                              <div className="text-[14px] font-semibold text-sky-800 line-clamp-2 leading-snug hover:underline cursor-pointer">{title}</div>
                              {snippet && <div className="text-[12.5px] text-stone-600 mt-1 line-clamp-2 leading-relaxed">{snippet}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* PAA */}
                {Array.isArray((serpPkgQ.data?.package as any)?.paa_questions) && (serpPkgQ.data.package as any).paa_questions.length > 0 && (
                  <div>
                    <div className="text-[13px] font-semibold text-stone-700 mb-2 flex items-center gap-2">
                      <Sparkles className="size-4 text-purple-700" /> 💡 People Also Ask (PAA) — คำถามที่ผู้ใช้ถามกันบ่อย
                      <Badge className="!bg-purple-100 !text-purple-800 !border-purple-200">{(serpPkgQ.data.package as any).paa_questions.length} Qs</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {((serpPkgQ.data?.package as any).paa_questions).slice(0, 8).map((q: any, i: number) => {
                        const qTxt = String(q.question || '').slice(0, 220);
                        const aTxt = String(q.answer || q.snippet || '').slice(0, 320);
                        return (
                          <details key={i} className="border border-purple-100 bg-purple-50/40 rounded-xl p-3 open:bg-purple-50/70 transition-colors">
                            <summary className="text-[13.5px] font-semibold text-stone-800 cursor-pointer list-none flex items-center gap-2 select-none">
                              <span className="text-purple-700 font-bold w-5">Q{i + 1}.</span>
                              <span className="flex-1">{qTxt || 'PAA Question'}</span>
                              <ChevronDown className="size-4 text-purple-500" />
                            </summary>
                            {aTxt && <div className="mt-2 pl-7 text-[13px] text-stone-700 leading-relaxed">{aTxt}</div>}
                          </details>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* AI Overview */}
                {typeof (serpPkgQ.data?.package as any)?.ai_overview === 'string' && (serpPkgQ.data.package as any).ai_overview.length > 10 && (
                  <div className="p-4 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50">
                    <div className="text-[13px] font-semibold text-sky-800 mb-2 flex items-center gap-2">
                      <Sparkles className="size-4" /> 🤖 AI Overview (SERP Generated Summary)
                    </div>
                    <p className="text-[13.5px] text-sky-900 leading-relaxed">{String((serpPkgQ.data?.package as any).ai_overview).slice(0, 1200)}</p>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter className="gap-2 pt-3 border-t border-stone-100 mt-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="!h-9">ปิด</Button>
            </DialogClose>
            {/* ── USER SIMPLIFY RULE: ทุก Pillar/Cluster/Supporting → ปุ่มเขียว เขียนบท เดียว → redirect /write PIPELINE ไม่มี tier gate ไม่มี 2 step ── */}
            <Button
              size="sm"
              className="!h-9 !bg-emerald-700 hover:!bg-emerald-800 text-white shadow-sm"
              disabled={createDraft.isPending || !isAdmin || !serpModalCard || Number(serpModalCard?.keywordId ?? 0) <= 0 || runningKwIds.has(Number(serpModalCard?.keywordId ?? 0))}
              onClick={async () => {
                if (!serpModalCard) return;
                const kwId = Number(serpModalCard.keywordId);
                if (!kwId || isNaN(kwId)) return;
                toggleRun(kwId, true);
                setSerpModalOpen(false);
                const loading = toast.loading(`✍️ กำลังเตรียม Draft: ${String(serpModalCard.keyword || '').slice(0, 40)}... → เข้าสู่กระบวนการเขียน (Step 1/6)`);
                try {
                  const res = await createDraft.mutateAsync({ keywordId: kwId });
                  toast.dismiss(loading);
                  const dr: any = (res as any)?.draft_id ?? (res as any)?.draftId ?? 0;
                  if (!dr) { toast.warning(`สำเร็จ แต่ไม่มี draft_id response: ${JSON.stringify(res).slice(0, 120)}`); toggleRun(kwId, false); return; }
                  const fromExisting = !!(res as any)?.from_existing;
                  if (fromExisting) toast.info(`📝 Draft มีอยู่แล้ว #${dr} → กำลังเปิดหน้าเขียน (กระบวนการ Step 1)...`, { duration: 3200 });
                  else toast.success(`✅ Draft ใหม่ #${dr} สร้างเสร็จ! → กำลังเข้าสู่กระบวนการเขียน Step 1/6...`, { duration: 3200 });
                  // 👉 CRITICAL: ไป WritePage (6-step PIPELINE) ไม่ใช่ /articles/:id/edit post-write editor
                  const writePath = `/write?kw_id=${kwId}&draft_id=${dr}`;
                  setLocation(writePath);
                  window.setTimeout(() => {
                    const cur = window.location.pathname + window.location.search;
                    if (!cur.includes('/write') || !cur.includes(`kw_id=${kwId}`)) window.location.assign(writePath);
                  }, 400);
                } catch (e: any) {
                  toast.dismiss(loading);
                  const emsg = String(e?.message ?? e ?? '').slice(0, 140);
                  toast.error(`Create Draft fail: ${emsg}`);
                } finally {
                  toggleRun(kwId, false);
                }
              }}
              title="คลิกเดียว: สร้าง/เปิด Draft + เปิดหน้าเขียน Step 1/6 (กระบวนการเขียนจริง) · ทุก Tier ใช้ปุ่มเดียวกัน — ไม่มี 2 step"
            >
              {createDraft.isPending || runningKwIds.has(Number(serpModalCard?.keywordId ?? 0))
                ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังสร้าง Draft...</>
                : <><FilePenLine className="size-4 mr-2" />เขียนบท (Step 1/6)</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </MainDashboardShell>
  );
}
