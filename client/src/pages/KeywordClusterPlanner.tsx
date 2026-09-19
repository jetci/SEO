import { useMemo, useState, useEffect, useRef } from "react";
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
import useAuth, { isUserAdminOrOwner } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import useKeywordPlanner, { type DbKeyword, type ClusterRow, type SharePayload } from "@/hooks/useKeywordPlanner";
import {
  INTENTS, intentStyleOf, kdBarColor, UNASSIGNED_CLUSTER_NAME, UNASSIGNED_FAKE_ID,
  TIER_STYLES, TIER_PLACEMENT, pickCategoryLabel, SOURCES, detectIntentClientSide,
} from "@/components/clusters/ClusterTierBadges";
import SerpPreviewModal from "@/components/clusters/SerpPreviewModal";
import AddClusterDialog from "@/components/clusters/AddClusterDialog";
import KeywordTableView, { type KeywordCardRow } from "@/components/clusters/KeywordTableView";
import ClusterManagerView, { buildClusterGroups, type ClusterGroup } from "@/components/clusters/ClusterManagerView";

type ClusterTier = "pillar" | "cluster" | "supporting";
type TierFilter = "all" | ClusterTier;
type IntentFilter = "all" | (typeof INTENTS[number]["key"]);
type StatusFilter = "all" | "pending" | "written";

type KeywordCardRowLocal = {
  id: string;
  keywordId: number;
  keyword: string;
  tier: ClusterTier;
  intent: (typeof INTENTS[number])["key"];
  kd: number;
  vol: number;
  style: { label: string; border: string; bg: string; text: string; icon: any };
  source?: string;
  status?: "pending" | "written" | null;
};

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
  const isAdmin = isUserAdminOrOwner(user);
  const planner = useKeywordPlanner(typeof projectId === "number" ? { projectId } : {});
  const {
    tabsValue, setTabsValue, serpModal, addClusterDialog,
    encodeSharePayload, decodeSharePayload, getShareHashFromUrl,
    toggleRun, toggleSelect, runningKwIds, selectedIds, setSelectedIds,
    keywordFilters, setKeywordFilters,
  } = planner;
  const { search, tierFilter, intentFilter, statusFilter } = keywordFilters;

  const [showSeedPanel, setShowSeedPanel] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  const [seedKeywords, setSeedKeywords] = useState<string[]>([]);
  const [longtailCount, setLongtailCount] = useState<number>(5);
  const [targetClusters, setTargetClusters] = useState<number>(30);
  const [seedRunning, setSeedRunning] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [addTier, setAddTier] = useState<ClusterTier>("supporting");
  const [addIntent, setAddIntent] = useState<(typeof INTENTS[number])["key"]>("informational");
  const [addClusterId, setAddClusterId] = useState<number | null>(null);
  const [importProject, setImportProject] = useState<number | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importPreview, setImportPreview] = useState<{keyword: string; volume?: number; difficulty?: number}[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [shareSearch, setShareSearch] = useState("");
  const [shareTierFilter, setShareTierFilter] = useState<TierFilter>("all");
  const [shareIntentFilter, setShareIntentFilter] = useState<IntentFilter>("all");
  const [confirmDeleteKwId, setConfirmDeleteKwId] = useState<number | null>(null);
  const [confirmDeleteClusterId, setConfirmDeleteClusterId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [serpCardInfo, setSerpCardInfo] = useState<{keywordText: string; tier: ClusterTier; style: any; vol: number; projectId: number | null} | null>(null);
  const [addClusterParentType, setAddClusterParentType] = useState<"top_pillar" | "pillar_parent" | "cluster_parent" | null>(null);
  const [addClusterParentId, setAddClusterParentId] = useState<number | null>(null);
  const [addClusterParentName, setAddClusterParentName] = useState<string>("");
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set([UNASSIGNED_FAKE_ID]));
  const [expandedTreeClusters, setExpandedTreeClusters] = useState<Set<number>>(new Set());

  const shareHash = getShareHashFromUrl();
  const isSharedView = !!shareHash;
  const [sharedPayload, setSharedPayload] = useState<SharePayload | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareHash) return;
    const p = decodeSharePayload(shareHash);
    if (p) setSharedPayload(p); else setShareError("ไม่สามารถถอดรหัส Payload จากลิงก์แชร์ได้ — ลิงก์อาจเสียหายหรือถูกแก้ไข");
  }, [shareHash]);

  const utils = trpc.useUtils();
  const kwListQ = trpc.keywords.listByProject.useQuery(
    { projectId: projectId === "all" ? undefined : projectId, search: search.trim() || undefined, tier: tierFilter, intent: intentFilter, status: statusFilter, limit: 500 },
    { staleTime: 30_000, enabled: !isSharedView }
  );
  const clustersQ = trpc.clusters.list.useQuery(
    { projectId: typeof projectId === "number" ? projectId : 0 },
    { staleTime: 60_000, enabled: !isSharedView && typeof projectId === "number" }
  );

  const enrichSerp = trpc.keywords.enrichSerp.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const decodeTrpcError = (e: any): { title: string; hint: string; raw: string } => {
    try {
      const msg = String(e?.message ?? String(e ?? 'Unknown')).slice(0, 300);
      const data: any = e?.data?.zodError ?? e?.data ?? null;
      let issues: string[] = [];
      if (data && Array.isArray(data?.issues)) issues = data.issues.slice(0, 3).map((i: any) => `/${String(i?.path?.join('/') ?? 'root')} ${i?.code ?? 'error'}: ${String(i?.message ?? '').slice(0, 80)}`);
      if (msg.includes('NOT_ASSIGNED_KEYWORDS_LEFT') || /\[NOT_ASSIGNED_KEYS\]/.test(msg)) return { title: 'ทุก Keyword จัดกลุ่มครบแล้ว', hint: 'เพิ่ม keyword ใหม่ หรือเลือกบางอันแล้วคลิกจัดกลุ่มเฉพาะที่เลือก', raw: msg };
      if (msg.includes('SELECTED_KEYWORDS_NOT_FOUND')) return { title: 'Keyword ที่เลือกไม่พบใน Project', hint: 'รีเฟรชหน้า แล้วลองเลือกใหม่', raw: msg };
      if (msg.includes('UNAUTHORIZED') || (typeof e?.data?.httpStatus === 'number' && e.data.httpStatus >= 401 && e.data.httpStatus <= 403)) return { title: 'Session หมดอายุ / ไม่มีสิทธิ์', hint: 'ออกจากระบบ แล้ว Login ใหม่', raw: msg };
      if (issues.length > 0) return { title: `ข้อมูล Input ไม่ถูกต้อง (Zod ${issues.length} issues)`, hint: issues.join(' · '), raw: msg };
      if (msg.includes('trace') || /traceId/i.test(msg)) return { title: 'Server AI Clusterize LLM Error', hint: msg.slice(0, 180), raw: msg };
      return { title: `Error: ${msg.slice(0, 60)}`, hint: 'ดู Console → Expand object', raw: msg };
    } catch (_) { return { title: String(e ?? 'Unknown error'), hint: 'Unknown', raw: JSON.stringify(e || null).slice(0, 200) }; }
  };
  const aiClusterize = trpc.keywords.aiClusterize.useMutation({
    onSuccess: async (res: any) => {
      if (res && typeof res === 'object') {
        const reason = String(res.reason_code || '');
        if (reason === 'NO_UNASSIGNED_KEYWORDS_LEFT') toast.info('ℹ️ ทุก Keyword จัดกลุ่มครบแล้ว');
        else if (reason === 'SELECTED_KEYWORDS_NOT_FOUND') toast.warning('⚠️ Keyword ที่เลือก ไม่พบในระบบ');
      }
      await utils.keywords.listByProject.invalidate();
      await utils.clusters.list.invalidate();
    },
    onError: (e: any) => { const info = decodeTrpcError(e); console.dir({ KCP_ERR: { raw: e, decoded: info } }, { depth: 8 }); toast.error(`❌ ${info.title}`); if (info.hint) setTimeout(() => toast.info(`💡 ${info.hint}`), 350); }
  });
  const runPlan = trpc.research.runPlanForKeyword.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const createDraft = trpc.write.createDraft.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const deleteKwMut = trpc.keywords.delete.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); await utils.clusters.list.invalidate(); } });
  const importCsvMut = trpc.keywords.importCsv.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const updateTierMut = trpc.keywords.updateTier.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const updateKwMut = trpc.keywords.update.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const createKwMut = trpc.keywords.create.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const bulkTierMut = trpc.keywords.bulkUpdateTier.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const bulkDelMut = trpc.keywords.bulkDelete.useMutation({ onSuccess: async () => { await utils.keywords.listByProject.invalidate(); } });
  const clusterUpdateMut = trpc.clusters.update.useMutation({ onSuccess: async () => { await utils.clusters.list.invalidate(); } });
  const clusterDeleteMut = trpc.clusters.delete.useMutation({ onSuccess: async () => { await utils.clusters.list.invalidate(); await utils.keywords.listByProject.invalidate(); } });

  const dbKeywords: DbKeyword[] = useMemo(() => (kwListQ.data?.keywords ?? []) as DbKeyword[], [kwListQ.data]);
  const totalKeywords = dbKeywords.length;
  const scopedProjects = projectId === "all" ? projects : projects.filter(p => p.id === projectId);
  const clusters: ClusterRow[] = useMemo(() => {
    if (isSharedView) return sharedPayload?.clusters ?? [];
    return (clustersQ.data?.clusters ?? []) as ClusterRow[];
  }, [clustersQ.data, sharedPayload, isSharedView]);
  const clustersById: Record<number, ClusterRow> = useMemo(() => {
    const m = new Map<number, ClusterRow>();
    clusters.forEach(c => m.set(c.id, c));
    return Object.fromEntries(m) as Record<number, ClusterRow>;
  }, [clusters]);
  const loading = kwListQ.isFetching || kwListQ.isLoading;

  function mapToCard(k: DbKeyword): KeywordCardRowLocal {
    const tier: ClusterTier = (k.tier && (k.tier === "pillar" || k.tier === "cluster" || k.tier === "supporting")) ? k.tier : "supporting";
    const style = TIER_STYLES[tier];
    const intent = k.intentSuggestion ?? detectIntentClientSide(k.keywordText);
    return {
      id: `kw-${k.id}`, keywordId: k.id, keyword: k.keywordText, tier, intent,
      kd: typeof k.difficulty === "number" ? k.difficulty : 0,
      vol: typeof k.searchVolume === "number" ? k.searchVolume : 0,
      style: { label: style.label, border: style.border, bg: style.bg, text: style.text, icon: style.icon },
      status: k.status ?? "pending",
    };
  }

  const allCards = useMemo(() => dbKeywords.map(k => mapToCard(k)), [dbKeywords]);
  const sharePreviewFiltered = useMemo(() => {
    if (!isSharedView) return [];
    const list = sharedPayload?.keywords ?? [];
    const s = shareSearch.trim().toLowerCase();
    return list.filter(k => {
      if (s && !(k.keywordText.toLowerCase().includes(s))) return false;
      if (shareTierFilter !== "all" && (k.tier ?? "supporting") !== shareTierFilter) return false;
      if (shareIntentFilter !== "all") {
        const ki = k.intentSuggestion ?? detectIntentClientSide(k.keywordText);
        if (ki !== shareIntentFilter) return false;
      }
      return true;
    });
  }, [sharedPayload, isSharedView, shareSearch, shareTierFilter, shareIntentFilter]);

  function clearSelection() { setSelectedIds(new Set()); }
  function selectAll(ids: number[]) { setSelectedIds(new Set(ids)); }

  async function handleToolbarReset() {
    setKeywordFilters({ search: "", tierFilter: "all", intentFilter: "all", statusFilter: "all" });
    clearSelection();
    toast.success("✅ รีเซ็ต Filter / Selection ครบแล้ว");
  }
  async function handleEnrichSerp() {
    if (projectId === "all" || totalKeywords === 0) { toast.warning("⚠️ เลือกโปรเจกต์ / เพิ่ม Keyword ก่อน"); return; }
    const ok = await planner.assertProvidersReady("serp");
    if (!ok) return;
    const info = selectedIds.size > 0 ? ` (${selectedIds.size} ที่เลือก)` : " (ทั้งหมด)";
    const t = toast.loading(`⚡ กำลัง Enrich SERP${info}...`);
    try {
      await enrichSerp.mutateAsync({ projectId: typeof projectId === "number" ? projectId : 0, keywordIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined });
      toast.success(`✅ Enrich SERP${info} เสร็จสิ้น`, { id: t });
    } catch (e: any) { toast.error(`❌ Enrich ล้มเหลว: ${String(e?.message ?? e).slice(0, 100)}`, { id: t }); }
  }
  async function handleClusterAction(c: KeywordCardRowLocal) {
    if (!isAdmin) return;
    const kwId = Number(c.keywordId);
    if (!kwId || kwId < 1) return;
    const busy = runningKwIds.has(kwId) || runPlan.isPending || createDraft.isPending;
    if (busy) return;
    toggleRun(kwId, true);
    const t = toast.loading(`📝 สร้าง Draft: ${c.keyword.slice(0, 45)}...`);
    try {
      const res: any = await createDraft.mutateAsync({ keywordId: kwId });
      const draftId = Number(res?.id ?? res?.insertId ?? 0);
      toast.success(`✅ สร้าง Draft #${draftId} เสร็จสิ้น → กำลังเปิดหน้าเขียน...`, { id: t });
      setTimeout(() => setLocation(`/write?kw_id=${kwId}&draft_id=${draftId}`), 600);
    } catch (e: any) { toast.error(`❌ สร้าง Draft ล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`, { id: t }); toggleRun(kwId, false); }
  }
  async function handleRunPlan2Step() {
    if (projectId === "all" || totalKeywords === 0) { toast.warning("⚠️ เลือกโปรเจกต์ / เพิ่ม Keyword ก่อน"); return; }
    const ok = await planner.assertProvidersReady("both");
    if (!ok) return;
    const t = toast.loading(`🚀 2-Step Plan: Step 1/2 Enrich SERP...`);
    try {
      if (selectedIds.size === 0) await enrichSerp.mutateAsync({ projectId: typeof projectId === "number" ? projectId : 0 });
      toast.loading(`🚀 2-Step Plan: Step 2/2 AI จัดกลุ่ม...`, { id: t });
      await aiClusterize.mutateAsync({ projectId: typeof projectId === "number" ? projectId : 0, keywordIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined });
      toast.success(`✅ 2-Step Plan เสร็จสิ้น — Keyword ถูกจัดกลุ่มเรียบร้อย`, { id: t });
    } catch (e: any) { toast.error(`❌ 2-Step Plan ล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`, { id: t }); }
  }
  function handleExportClusterPlan() {
    try {
      const plan: any = {
        version: "2.0", exportedAt: Date.now(),
        projectId, keywords: dbKeywords, clusters: clusters,
        counts: { total: totalKeywords, pillar: allCards.filter(c => c.tier === "pillar").length, cluster: allCards.filter(c => c.tier === "cluster").length, supporting: allCards.filter(c => c.tier === "supporting").length },
      };
      const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `cluster-plan-pid-${projectId}-${Date.now()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success("✅ บันทึก Cluster Plan เป็นไฟล์ JSON เรียบร้อย");
    } catch (e: any) { toast.error(`❌ Export ล้มเหลว: ${String(e?.message ?? e).slice(0, 100)}`); }
  }
  function handleFilePick(e: any) {
    const f: File = e?.target?.files?.[0];
    if (!f) return;
    setImportFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const rows: {keyword: string; volume?: number; difficulty?: number}[] = [];
        text.split(/\r?\n/).forEach((line, idx) => {
          const raw = line.trim(); if (!raw) return;
          if (idx === 0 && /keyword|คำ|search.?vol|vol|kd|diff/i.test(raw.split(/[,;\t]/)[0] || "") && raw.split(/[,;\t]/).length > 1) return;
          const parts = raw.split(/[,;\t]/);
          const kw = (parts[0] || "").trim().replace(/^"|"$/g, "").trim();
          if (!kw) return;
          const vol = parts[1] ? parseInt(parts[1].replace(/[^0-9]/g, ""), 10) : undefined;
          const kd = parts[2] ? parseInt(parts[2].replace(/[^0-9]/g, ""), 10) : undefined;
          rows.push({ keyword: kw, volume: Number.isFinite(vol as any) ? vol : undefined, difficulty: Number.isFinite(kd as any) ? kd : undefined });
        });
        setImportPreview(rows);
      } catch (e: any) { toast.error(`❌ อ่านไฟล์ล้มเหลว: ${String(e?.message ?? e).slice(0, 100)}`); }
    };
    reader.readAsText(f, "utf-8");
  }
  async function handleRunImport() {
    if (!importProject || importPreview.length === 0) return;
    try {
      await importCsvMut.mutateAsync({ projectId: importProject, rows: importPreview });
      toast.success(`✅ นำเข้า ${importPreview.length} rows เรียบร้อย`);
      setImportOpen(false); setImportFileName(""); setImportPreview([]); setImportProject(null);
    } catch (e: any) { toast.error(`❌ Import ล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`); }
  }
  function handleImportSelectProject(id: number) { setImportProject(Number.isFinite(id) && id > 0 ? id : null); }
  async function handleRunAdd() {
    const kw = addText.trim();
    if (!kw || projectId === "all") return;
    try {
      await createKwMut.mutateAsync({
        keywordText: kw,
        intent: addIntent,
        clusterId: addClusterId || UNASSIGNED_FAKE_ID,
      });
      toast.success(`✅ เพิ่ม Keyword "${kw.slice(0, 30)}" เรียบร้อย`);
      setAddOpen(false); setAddText(""); setAddTier("supporting"); setAddIntent("informational"); setAddClusterId(null);
    } catch (e: any) { toast.error(`❌ เพิ่มล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`); }
  }
  function seedAddFromText() {
    const lines = seedInput.split(/\r?\n|,|;/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) { toast.info("💡 วาง Seed keywords 1 คำต่อบรรทัด หรือคั่นด้วยเครื่องหมายจุลภาค"); return; }
    setSeedKeywords(prev => {
      const merged = [...prev];
      lines.forEach(l => { if (!merged.includes(l)) merged.push(l); });
      return merged;
    });
    setSeedInput("");
  }
  function handleSeedRemove(idx: number) { setSeedKeywords(prev => prev.filter((_, i) => i !== idx)); }
  function handleSeedClearAll() { setSeedKeywords([]); setSeedInput(""); }
  async function handleSeedRunAutoGroup() {
    if (projectId === "all" || !isAdmin) { toast.warning("⚠️ เลือกโปรเจกต์ก่อน"); return; }
    if (seedKeywords.length === 0 && totalKeywords === 0) { toast.warning("⚠️ วาง Seed keywords หรือมี Keyword ในระบบก่อน"); return; }
    const ok = await planner.assertProvidersReady("both");
    if (!ok) return;
    setSeedRunning(true);
    const t = toast.loading(`✨ AI Seed Auto-Group: สร้าง Keywords + จัดกลุ่ม Crown...`);
    try {
      if (seedKeywords.length > 0) {
        await Promise.all(seedKeywords.map(sk =>
          createKwMut.mutateAsync({
            keywordText: sk,
            intent: detectIntentClientSide(sk),
            clusterId: UNASSIGNED_FAKE_ID,
          }).catch(() => null)
        ));
      }
      await utils.keywords.listByProject.invalidate();
      setTimeout(async () => {
        try {
          await enrichSerp.mutateAsync({ projectId: typeof projectId === "number" ? projectId : 0 });
          await aiClusterize.mutateAsync({ projectId: typeof projectId === "number" ? projectId : 0 });
          toast.success(`✅ Seed Auto-Group เสร็จสิ้น — ${seedKeywords.length} Seeds ถูกจัดกลุ่ม`, { id: t });
          setSeedKeywords([]); setSeedInput(""); setShowSeedPanel(false);
        } catch (e2: any) { toast.error(`❌ Step 2 จัดกลุ่มล้มเหลว: ${String(e2?.message ?? e2).slice(0, 120)}`, { id: t }); }
        finally { setSeedRunning(false); }
      }, 500);
    } catch (e: any) { toast.error(`❌ Seed Auto-Group ล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`, { id: t }); setSeedRunning(false); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key.toLowerCase() === "a") { e.preventDefault(); if (isAdmin) selectAll(allCards.map(c => Number(c.keywordId)).filter(id => id > 0)); }
      if (e.key.toLowerCase() === "f") { e.preventDefault(); document.querySelector<HTMLInputElement>('input[data-kcp-search="1"]')?.focus(); }
      if (e.key.toLowerCase() === "n") { e.preventDefault(); setAddOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin, allCards]);

  function openSerpPreview(c: KeywordCardRowLocal) {
    setSerpCardInfo({ keywordText: c.keyword, tier: c.tier, style: c.style, vol: c.vol, projectId: typeof projectId === "number" ? projectId : null });
    serpModal.setOpen(true, Number(c.keywordId));
  }
  function closeSerpPreview() { serpModal.setOpen(false); setSerpCardInfo(null); }
  function openAddCluster(mode: "top_pillar" | "pillar_parent" | "cluster_parent", parentId?: number, parentName?: string) {
    setAddClusterParentType(mode);
    setAddClusterParentId(typeof parentId === "number" ? parentId : null);
    setAddClusterParentName(parentName || "");
    addClusterDialog.setOpen(true);
  }
  function closeAddCluster() { addClusterDialog.setOpen(false); setAddClusterParentType(null); setAddClusterParentId(null); setAddClusterParentName(""); }
  function toggleClusterExpand(cid: number) {
    setExpandedClusters(prev => { const n = new Set(prev); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });
  }
  function toggleTreeClusterExpand(cid: number) {
    setExpandedTreeClusters(prev => { const n = new Set(prev); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });
  }
  const childClusters = useMemo(() => {
    const byParent = new Map<number | null, ClusterRow[]>();
    clusters.forEach(c => { const arr = byParent.get(c.parentId) ?? []; arr.push(c); byParent.set(c.parentId, arr); });
    return byParent;
  }, [clusters]);
  const currentProjectClusterRows = useMemo(() => clusters, [clusters]);
  const currentProjectKeywords = useMemo(() => dbKeywords, [dbKeywords]);

  async function handleCardDelete(kwId: number) {
    try { await deleteKwMut.mutateAsync({ id: kwId }); toast.success("✅ ลบ Keyword เรียบร้อย"); }
    catch (e: any) { toast.error(`❌ ลบล้มเหลว: ${String(e?.message ?? e).slice(0, 100)}`); }
    finally { setConfirmDeleteKwId(null); }
  }
  async function handleDeleteCluster(cid: number) {
    try { await clusterDeleteMut.mutateAsync({ id: cid }); toast.success("✅ ลบ Cluster เรียบร้อย"); }
    catch (e: any) { toast.error(`❌ ลบ Cluster ล้มเหลว: ${String(e?.message ?? e).slice(0, 100)}`); }
    finally { setConfirmDeleteClusterId(null); }
  }
  function handleCopyClick(kwId: number, text: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopiedId(kwId); setTimeout(() => setCopiedId(cur => cur === kwId ? null : cur), 1500); toast.success("✅ คัดลอก Keyword แล้ว"); }).catch(() => toast.warning("⚠️ ไม่สามารถคัดลอกได้"));
  }

  // ======================================================================
  // SHARED VIEW STANDALONE MODE — Guest No-Login Required
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
        <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#fbf8f4]/85 backdrop-blur-sm">
          <div className="px-8 py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/" className="flex items-center gap-3 shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#b45309] to-[#d97706] text-white grid place-items-center shadow-sm">
                  <CheckCircle2 className="size-5" />
                </div>
                <div className="leading-tight"><p className="font-semibold text-[15px] text-stone-900">EEAT Studio</p><p className="text-[11px] text-stone-500">V2 · Shared View</p></div>
              </Link>
              <div className="flex-1 min-w-0">
                <h1 className="text-[22px] font-bold text-stone-900 tracking-tight font-[Playfair_Display,_serif]"><Share2 className="size-5 inline mr-2 text-amber-700" /> {projName}</h1>
                <p className="text-[13px] text-stone-600 mt-1">คำหลัก {stotal} คำ · Shared View (Read-Only) · ไม่ต้องเข้าสู่ระบบ{sharedAt && ` · แชร์เมื่อ ${sharedAt.toLocaleString('th-TH')}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm" className="!h-9 !rounded-lg !text-[12.5px]"><Link href="/login"><LogIn className="size-3.5 mr-1.5" /> เข้าสู่ระบบ / ใช้งานเต็มรูปแบบ</Link></Button>
              </div>
            </div>
          </div>
        </header>
        <main className="px-8 py-6 max-w-[1600px] mx-auto">
          <Alert className="mb-5 !rounded-xl !bg-sky-50 !border-sky-200">
            <Eye className="size-5 text-sky-700" />
            <AlertTitle className="!text-sky-900 !text-[14px] font-semibold flex items-center gap-2"><ShieldCheck className="size-4" /> Shared View Mode — Read-Only (Guest Access)</AlertTitle>
            <AlertDescription className="!text-sky-800 !text-[13px] mt-1">คุณกำลังมองเห็นข้อมูล Keywords / Clusters ที่ถูกแชร์ผ่านลิงก์ URL — ไม่ต้อง Login · ไม่ต้องต่อฐานข้อมูล · ไม่สามารถแก้ไขได้ · <Link href="/login" className="font-semibold underline ml-1">เข้าสู่ระบบที่นี่</Link></AlertDescription>
          </Alert>
          {shareError && (
            <Alert className="mb-5 !rounded-xl !bg-rose-50 !border-rose-200"><AlertTriangle className="size-5 text-rose-700" /><AlertTitle className="!text-rose-900 !text-[14px] font-semibold">ลิงก์แชร์ไม่ถูกต้อง</AlertTitle><AlertDescription className="!text-rose-800 !text-[13px] mt-1">{shareError}</AlertDescription></Alert>
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
                      <div className="w-10 h-10 rounded-lg grid place-items-center" style={{ backgroundColor: color.bg, color: color.text }}><Icon className="size-4.5" /></div>
                      <div className="flex-1"><p className="text-[10.5px] uppercase tracking-wider text-stone-500">{label}</p><p className="text-lg font-bold text-stone-900">{val}</p></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm mb-5">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><Input placeholder="🔍 ค้นหา Keyword..." value={shareSearch} onChange={e => setShareSearch(e.target.value)} className="!h-9 !pl-9 !rounded-lg" /></div>
                    <div className="flex items-center gap-1.5"><Filter className="size-3.5 text-stone-500 mr-1" />
                      {(["all", "pillar", "cluster", "supporting"] as TierFilter[]).map(t => {
                        const active = shareTierFilter === t;
                        const label = t === "all" ? "ทุก Tier" : TIER_STYLES[t as ClusterTier].label;
                        return (<Button key={t} size="sm" variant={active ? "default" : "ghost"} className={`!h-8 !rounded-full !px-3 !text-[12px] ${active ? '' : 'text-stone-600 hover:!bg-stone-100'}`} onClick={() => setShareTierFilter(t)}>{t !== "all" && (() => { const Ic = TIER_STYLES[t as ClusterTier].icon; return <Ic className="size-3 mr-1.5" />; })()}{label}</Button>);
                      })}
                    </div>
                    <select value={shareIntentFilter} onChange={e => setShareIntentFilter(e.target.value as IntentFilter)} className="h-8 !rounded-full border border-stone-300 px-3 text-[12px] bg-white focus:outline-none"><option value="all">ทุก Intent</option>{INTENTS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select>
                    <Badge variant="outline" className="!rounded-full !text-[11.5px] !px-2.5 !h-7">{sharedFiltered.length} / {stotal} Results</Badge>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sharedCards.map(c => {
                  const intentMeta = INTENTS.find(i => i.key === c.intent)!;
                  return (
                    <Card key={c.id} className="!rounded-2xl !bg-white !shadow-sm overflow-hidden opacity-95" style={{ borderLeft: `4px solid ${c.style.border}` }}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="px-2 py-1 rounded-md text-[10.5px] font-bold inline-flex items-center gap-1" style={{ backgroundColor: c.style.bg, color: c.style.text }}><c.style.icon className="size-3" /> {c.style.label}</span>
                          <Badge variant="outline" className="!rounded-full !text-[10.5px] !border-transparent" style={{ backgroundColor: `${intentMeta.color}12`, color: intentMeta.color }}>Intent: {intentMeta.label}</Badge>
                          <span className="flex-1" /><Badge variant="secondary" className="!rounded-full !text-[10px]"><TrendingUp className="size-3 mr-1" /> Vol: {c.vol.toLocaleString()}</Badge>
                        </div>
                        <h3 className="font-semibold text-[14.5px] text-stone-900 mb-2 leading-snug line-clamp-2">{c.keyword}</h3>
                        <div className="space-y-2">
                          <div><div className="flex items-center justify-between mb-0.5"><span className="text-[10.5px] uppercase tracking-wider text-stone-500">Keyword Difficulty</span><span className="text-[11.5px] font-semibold text-stone-800">{c.kd}%</span></div>
                          <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden"><div className={`h-full rounded-full ${kdBarColor(c.kd)}`} style={{ width: `${c.kd}%` }} /></div></div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {sharedCards.length === 0 && (<Card className="!rounded-2xl !border-dashed !border-stone-300 col-span-full"><CardContent className="p-8 text-center"><Search className="size-10 mx-auto text-stone-400 mb-3" /><h3 className="font-semibold text-stone-800 mb-1">ไม่พบ Keyword ตามเงื่อนไข Filter</h3><p className="text-stone-500 text-[13px]">ลองปรับ Search หรือ Filter Tier/Intent</p></CardContent></Card>)}
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
            <select value={String(projectId)} onChange={e => setProjectId(e.target.value === "all" ? "all" : Number(e.target.value))} className="h-9 !rounded-lg border border-stone-300 bg-white pl-3 pr-9 text-[13px] font-medium text-stone-800 appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 min-w-[240px] shrink-0">
              <option value="all">📋 ทุกโปรเจกต์ ({projects.length})</option>
              {projects.map(p => <option key={p.id} value={p.id}>🏷️ #{p.id} · {p.name?.slice(0, 50) || `Project ${p.id}`}</option>)}
            </select>
            <ChevronDown className="size-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
          </div>
          <div className="relative"><Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><Input data-kcp-search="1" placeholder="🔍 ค้นหา Keyword (Ctrl+F)" value={search} onChange={e => setKeywordFilters({ ...keywordFilters, search: e.target.value })} className="!h-9 !pl-9 !pr-16 !rounded-lg !w-[260px]" /><Badge variant="outline" className="!absolute !right-2 !top-1/2 !-translate-y-1/2 !text-[10px] !h-5 !rounded-full !bg-white/80">{allCards.length}</Badge></div>
          <Select value={tierFilter} onValueChange={v => setKeywordFilters({ ...keywordFilters, tierFilter: v as any })}><SelectTrigger className="!h-9 !w-[120px] !rounded-lg"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">ทุก Tier</SelectItem>{Object.entries(TIER_STYLES).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent></Select>
          <Select value={intentFilter} onValueChange={v => setKeywordFilters({ ...keywordFilters, intentFilter: v as any })}><SelectTrigger className="!h-9 !w-[140px] !rounded-lg"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">ทุก Intent</SelectItem>{INTENTS.map(i => <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={v => setKeywordFilters({ ...keywordFilters, statusFilter: v as any })}><SelectTrigger className="!h-9 !w-[120px] !rounded-lg"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">ทุก Status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="written">Written</SelectItem></SelectContent></Select>
          {isAdmin && selectedIds.size > 0 && (<Badge variant="default" className="!h-9 !rounded-lg !text-[12px] !px-3 !bg-amber-700 hover:!bg-amber-800 cursor-pointer shadow-sm" onClick={() => clearSelection()}>✓ {selectedIds.size} Selected (×)</Badge>)}
          {isAdmin && selectedIds.size > 0 && (<Select onValueChange={async v => { if (v === "pillar" || v === "cluster" || v === "supporting") { await bulkTierMut.mutateAsync({ ids: Array.from(selectedIds), tier: v }); clearSelection(); toast.success(`✅ ปรับ Tier ${selectedIds.size} rows → ${v}`); } else if (v === "delete") { await bulkDelMut.mutateAsync({ ids: Array.from(selectedIds) }); clearSelection(); toast.success(`✅ ลบ ${selectedIds.size} rows เรียบร้อย`); } }}><SelectTrigger className="!h-9 !w-[140px] !rounded-lg !bg-stone-50"><SelectValue placeholder="📋 Bulk Action..." /></SelectTrigger><SelectContent><SelectItem value="pillar">→ Set Pillar</SelectItem><SelectItem value="cluster">→ Set Cluster</SelectItem><SelectItem value="supporting">→ Set Supporting</SelectItem><SelectItem value="delete">🗑️ Delete Selected</SelectItem></SelectContent></Select>)}
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="!h-9 !rounded-lg !text-[12.5px]"><Upload className="size-3.5 mr-1.5" /> Import CSV</Button></DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="size-5 text-sky-700" /> นำเข้าคำหลักจากไฟล์ CSV/TXT</DialogTitle><DialogDescription className="text-[13px] text-stone-600">รองรับรูปแบบ: Keyword,Volume,Difficulty (รองรับ CSV/TXT · UTF-8)</DialogDescription></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>โปรเจกต์ *</Label><select className="w-full mt-1 h-9 rounded-lg border border-stone-300 px-3 text-[13px] bg-white" value={importProject ?? ''} onChange={e => handleImportSelectProject(parseInt(e.target.value, 10))}><option value="">— เลือกโปรเจกต์ —</option>{projects.map(p => <option key={p.id} value={p.id}>#{p.id} · {p.name?.slice(0, 40) || `โปรเจกต์ ${p.id}`}</option>)}</select></div>
                  <div><Label>ไฟล์ CSV/TXT</Label><input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="mt-1 block w-full text-[12.5px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-900 hover:file:bg-amber-200" onChange={handleFilePick} />{importFileName && <p className="text-[11px] text-stone-500 mt-1">ไฟล์: {importFileName} · Preview: {importPreview.length}</p>}</div>
                </div>
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-12 bg-stone-100 text-[11px] uppercase tracking-wider font-semibold text-stone-600"><div className="col-span-5 p-2 border-r border-stone-200">Keyword</div><div className="col-span-3 p-2 border-r border-stone-200 text-right">Vol</div><div className="col-span-3 p-2 text-right">KD</div><div className="col-span-1 p-2"></div></div>
                  <div className="max-h-56 overflow-y-auto">
                    {importPreview.length === 0 ? (<div className="p-8 text-center text-stone-400 text-[13px]"><Upload className="size-7 mx-auto mb-2 opacity-50" />{importFileName ? '⚠️ ไม่พบ Keyword rows' : 'เลือกไฟล์เพื่อแสดง Preview'}</div>)
                      : importPreview.slice(0, 50).map((r, i) => (<div key={i} className="grid grid-cols-12 border-b border-stone-100 text-[12.5px] last:border-0"><div className="col-span-5 p-2 border-r border-stone-100 truncate">{r.keyword}</div><div className="col-span-3 p-2 border-r border-stone-100 text-right font-mono text-stone-700">{r.volume?.toLocaleString() || '—'}</div><div className="col-span-3 p-2 text-right font-mono text-stone-700">{typeof r.difficulty === 'number' ? `${r.difficulty}%` : '—'}</div><div className="col-span-1 p-1 text-right"><CheckCircle2 className="size-3.5 text-emerald-600 inline" /></div></div>))}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2"><DialogClose asChild><Button variant="outline" size="sm" className="!h-9">ยกเลิก</Button></DialogClose><Button size="sm" className="!h-9 !bg-emerald-700 hover:!bg-emerald-800" disabled={!importProject || importPreview.length === 0 || importCsvMut.isPending} onClick={handleRunImport}>{importCsvMut.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}{importCsvMut.isPending ? 'กำลังนำเข้า...' : `นำเข้า (${importPreview.length})`}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="!h-9 !rounded-lg !text-[12.5px]"><Plus className="size-3.5 mr-1.5" /> เพิ่ม Keyword</Button></DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="size-5 text-emerald-700" /> เพิ่ม Keyword เดี่ยว</DialogTitle><DialogDescription className="text-[13px] text-stone-600">เพิ่มคำหลัก 1 คำ — เลือก Tier และ Intent เริ่มต้น</DialogDescription></DialogHeader>
              <div className="space-y-3 py-2">
                <div><Label>Keyword *</Label><Input value={addText} onChange={e => setAddText(e.target.value)} placeholder="เช่น วิธีเลือกหวยออกงวดนี้" className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tier</Label><Select value={addTier} onValueChange={v => setAddTier(v as ClusterTier)}><SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TIER_STYLES).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Intent</Label><Select value={addIntent} onValueChange={v => setAddIntent(v as any)}><SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger><SelectContent>{INTENTS.map(i => <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div><Label>Cluster ID (optional)</Label><Input type="number" value={addClusterId ?? ''} onChange={e => setAddClusterId(e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="ปล่อยว่างเพื่อ auto" className="mt-1" /></div>
              </div>
              <DialogFooter className="gap-2"><DialogClose asChild><Button variant="outline" size="sm" className="!h-9">ยกเลิก</Button></DialogClose><Button size="sm" className="!h-9 !bg-emerald-700 hover:!bg-emerald-800" onClick={handleRunAdd} disabled={createKwMut.isPending}>{createKwMut.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}{createKwMut.isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม Keyword'}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="flex items-center border border-stone-300 rounded-lg overflow-hidden shrink-0">
            <button onClick={() => setTabsValue('clusters')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors ${tabsValue==='clusters' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}><GitBranch className="h-3.5 w-3.5" /> Groups</button>
            <button onClick={() => setTabsValue('cards')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors border-x border-stone-300 ${tabsValue==='cards' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}><Layers className="h-3.5 w-3.5" /> Cards</button>
            <button onClick={() => setTabsValue('table')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors ${tabsValue==='table' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}><Database className="h-3.5 w-3.5" /> Table</button>
            <button onClick={() => setTabsValue('tree')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors border-x border-stone-300 ${tabsValue==='tree' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}><FolderTree className="h-3.5 w-3.5" /> Tree</button>
            <button onClick={() => setTabsValue('shared')} className={`px-3.5 py-2 text-[12.5px] whitespace-nowrap flex items-center gap-1.5 transition-colors ${tabsValue==='shared' ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-600'}`}><Target className="h-3.5 w-3.5" /> Shared</button>
          </div>
          <Button variant="outline" size="sm" onClick={() => handleEnrichSerp()} disabled={enrichSerp.isPending || totalKeywords === 0 || projectId === "all"} className="!h-9 !rounded-lg !text-[12.5px]">{enrichSerp.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Zap className="size-3.5 mr-1.5" />}⚡ Enrich</Button>
          <Button variant="default" size="sm" onClick={handleRunPlan2Step} disabled={enrichSerp.isPending || aiClusterize.isPending || totalKeywords === 0 || projectId === "all"} className="!h-9 !rounded-lg !text-[12.5px] !bg-amber-700 hover:!bg-amber-800">{enrichSerp.isPending || aiClusterize.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="size-3.5 mr-1.5" />}🚀 2-Step Plan</Button>
          <Button variant="outline" size="sm" onClick={handleExportClusterPlan} disabled={totalKeywords === 0} className="!h-9 !rounded-lg !text-[12.5px]" title="บันทึก Cluster Plan เป็น JSON"><Download className="size-3.5 mr-1.5" />บันทึก Plan</Button>
          <Button variant="outline" size="sm" onClick={handleToolbarReset} className="!h-9 !rounded-lg !text-[12.5px] !text-red-600 hover:!text-red-700 hover:!bg-red-50 !border-red-200" title="รีเซ็ตตัวกรองทั้งหมด"><RotateCcw className="size-3.5 mr-1.5" />เริ่มใหม่</Button>
          {isAdmin && (
            <Button size="sm" className={`!h-9 !rounded-lg !text-[12.5px] ${showSeedPanel ? '!bg-orange-700 hover:!bg-orange-800' : ''}`} onClick={() => setShowSeedPanel(v => !v)} disabled={aiClusterize.isPending || seedRunning || (!showSeedPanel && (totalKeywords === 0 && seedKeywords.length === 0) || projectId === "all")}>
              {aiClusterize.isPending || seedRunning ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : showSeedPanel ? <X className="size-3.5 mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
              {showSeedPanel ? `ปิด Seed Panel${seedKeywords.length > 0 ? ` (${seedKeywords.length})` : ''}` : '✨ AI จัดกลุ่ม keyword'}
            </Button>
          )}
        </div>
      }
    >
      {showSeedPanel && isAdmin && (
        <Card className="!rounded-2xl !border-indigo-200 !bg-gradient-to-br !from-indigo-50/70 !via-white !to-purple-50/70 !shadow-md mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-700 to-purple-700 px-5 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-2"><Sparkles className="size-5" /><h3 className="font-semibold text-[14px]">✨ AI Seed Input Panel</h3></div>
            <div className="flex items-center gap-2"><Badge className="!bg-white/20 !text-white !border-white/30 !text-[11px]">Seed: {seedKeywords.length}</Badge><Button variant="ghost" size="sm" className="!h-7 !text-[12px] !text-white hover:!bg-white/15 !rounded-full" onClick={handleSeedClearAll} disabled={seedRunning}>เคลียร์ทั้งหมด</Button><Button variant="ghost" size="sm" className="!h-7 !text-[12px] !text-white hover:!bg-white/15 !rounded-full" onClick={() => setShowSeedPanel(false)} disabled={seedRunning}><X className="size-3.5" /></Button></div>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2"><Label className="text-[12.5px] font-semibold text-stone-700">Seed Keywords (วาง 1 คำต่อบรรทัด หรือคั่นด้วย , / ;)</Label><Textarea value={seedInput} onChange={e => setSeedInput(e.target.value)} rows={5} placeholder={"หวยออกงวดนี้\nหวยรัฐบาล\nสล็อตแตกง่าย\nคาสิโนออนไลน์"} className="mt-1.5 !rounded-lg !text-[13px] !font-mono" /></div>
              <div className="space-y-3">
                <div><Label className="text-[12.5px] font-semibold text-stone-700">Long-tail per seed</Label><Input type="number" min={1} max={20} value={longtailCount} onChange={e => setLongtailCount(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)))} className="mt-1.5 !h-9 !rounded-lg" /></div>
                <div><Label className="text-[12.5px] font-semibold text-stone-700">Target Clusters (3-Tier)</Label><Input type="number" min={3} max={100} value={targetClusters} onChange={e => setTargetClusters(Math.max(3, Math.min(100, parseInt(e.target.value, 10) || 30)))} className="mt-1.5 !h-9 !rounded-lg" /></div>
                <div className="pt-1"><Button size="sm" className="!h-9 w-full !rounded-lg !bg-indigo-700 hover:!bg-indigo-800 text-white" onClick={seedAddFromText} disabled={!seedInput.trim()}><Plus className="size-3.5 mr-1.5" />เพิ่ม Seed ({seedInput.trim().split(/[\r\n,;]+/).filter(Boolean).length} บรรทัด)</Button></div>
                <div><Button size="sm" className="w-full !h-9 !rounded-lg !bg-gradient-to-r !from-amber-700 to-orange-700 hover:!from-amber-800 hover:!to-orange-800 text-white" onClick={handleSeedRunAutoGroup} disabled={seedRunning || projectId === "all"}>{seedRunning ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Wand2 className="size-3.5 mr-1.5" />}{seedRunning ? 'กำลังสร้าง/จัดกลุ่ม...' : `✨ Auto-Group Seeds → Crown`}</Button></div>
              </div>
            </div>
            {seedKeywords.length > 0 && (
              <div className="border border-indigo-100 rounded-xl p-4 bg-white/60 max-h-48 overflow-y-auto">
                <p className="text-[12px] text-stone-500 uppercase tracking-wider font-semibold mb-2">Seed Queue ({seedKeywords.length})</p>
                <div className="flex flex-wrap gap-2">{seedKeywords.map((s, i) => (<Badge key={`s${i}`} variant="outline" className="!rounded-full !text-[12px] !bg-white !py-1 !pl-3 !pr-1 !border-indigo-200">{s}<Button variant="ghost" size="sm" className="!h-5 !w-5 !p-0 !rounded-full ml-1 hover:!bg-rose-100 hover:!text-rose-700" onClick={() => handleSeedRemove(i)} aria-label={`Remove ${s}`}><X className="size-3" /></Button></Badge>))}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm mb-6 overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl grid place-items-center bg-amber-100 text-amber-800"><Terminal className="size-5" /></div>
            <div className="flex-1 min-w-0"><h3 className="font-bold text-[15px] text-stone-900">Workflow Pipeline · 5 Steps</h3><p className="text-[12.5px] text-stone-600">ตามลำดับ 1→5 · Progress จะ refresh ทุกครั้งที่คลิก Action ใดๆ</p></div>
            <Badge variant="outline" className="!rounded-full !h-7 !bg-stone-50 !text-[12px] !border-stone-200">{totalKeywords} คำหลัก · {clusters.length} Cluster</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "1. Seed/Import", done: totalKeywords > 0, desc: `${totalKeywords} KW`, icon: Plus },
              { label: "2. Enrich SERP", done: allCards.some(c => c.vol > 0 || c.kd > 0), desc: `${allCards.filter(c => c.vol > 0).length} enriched`, icon: Zap },
              { label: "3. AI Clusterize", done: clusters.length > 0, desc: `${clusters.length} groups`, icon: Sparkles },
              { label: "4. Review/Assign", done: dbKeywords.some(k => !!k.clusterId), desc: `${dbKeywords.filter(k => !!k.clusterId).length} assigned`, icon: GitBranch },
              { label: "5. Write Articles", done: dbKeywords.some(k => k.status === "written"), desc: `${dbKeywords.filter(k => k.status === "written").length} written`, icon: FilePenLine },
            ].map(({ label, done, desc, icon: Ic }, i) => (
              <div key={i} className={`relative p-3 rounded-xl border-2 ${done ? 'border-emerald-300 bg-emerald-50/60' : 'border-dashed border-stone-300 bg-stone-50'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-7 h-7 rounded-lg grid place-items-center ${done ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-500'}`}>{done ? <CheckCircle2 className="size-3.5" /> : <Ic className="size-3.5" />}</div>
                  <span className="text-[12px] font-semibold text-stone-800">{label}</span>
                </div>
                <p className={`text-[11px] ${done ? 'text-emerald-700 font-medium' : 'text-stone-500'}`}>{desc}</p>
                {i < 4 && <div className="hidden md:block absolute top-1/2 -right-[10px] -translate-y-1/2"><ChevronRight className="size-4 text-stone-300" /></div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tabsValue} onValueChange={setTabsValue as any} className="w-full">
        <TabsList className="hidden">
          <TabsTrigger value="clusters">Groups</TabsTrigger><TabsTrigger value="cards">Cards</TabsTrigger><TabsTrigger value="table">Table</TabsTrigger><TabsTrigger value="tree">Tree</TabsTrigger><TabsTrigger value="shared">Shared</TabsTrigger>
        </TabsList>

        <TabsContent value="clusters" className="!p-0 !mt-0">
          <ClusterManagerView
            dbKeywords={dbKeywords}
            clustersById={clustersById}
            clusters={clusters}
            totalKeywords={totalKeywords}
            isUserAdminOrOwner={isAdmin}
            expandedClustersView={expandedClusters}
            onToggleExpandCluster={toggleClusterExpand}
            onDeleteGroup={(cid: number) => setConfirmDeleteClusterId(cid)}
            onToggleSelectKeyword={toggleSelect}
            selectedIds={selectedIds}
            onWriteKeyword={(k: DbKeyword) => {
              const c = mapToCard(k);
              handleClusterAction(c as any);
            }}
          />
        </TabsContent>

        <TabsContent value="cards" className="!p-5 !pt-2 !mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {loading && allCards.length === 0 && Array.from({ length: 12 }).map((_, i) => (<Card key={`sk-${i}`} className="!rounded-2xl overflow-hidden"><div className="kcp-skeleton-shimmer"><CardContent className="p-4 space-y-3"><div className="flex items-center gap-2"><div className="w-16 h-5 rounded bg-stone-200" /><div className="w-20 h-4 rounded bg-stone-100" /><span className="flex-1" /><div className="w-14 h-4 rounded bg-stone-200" /></div><div className="h-5 rounded bg-stone-200 w-3/4" /><div className="h-4 rounded bg-stone-100 w-1/2" /><div className="h-1.5 rounded bg-stone-100 mt-4" /></CardContent></div></Card>))}
            {allCards.map((c, idx) => {
              const intent = INTENTS.find(i => i.key === c.intent)!;
              const busy = runningKwIds.has(Number(c.keywordId)) || runPlan.isPending || createDraft.isPending;
              const sel = selectedIds.has(Number(c.keywordId));
              return (
                <Card key={c.id} className={`!rounded-2xl !bg-white !shadow-sm overflow-hidden transition-all hover:shadow-md ${sel ? 'ring-2 ring-amber-500/60' : ''}`} style={{ borderLeft: `4px solid ${c.style.border}` }}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2 mb-2 flex-wrap">
                      {isAdmin && <Checkbox checked={sel} onCheckedChange={() => toggleSelect(Number(c.keywordId))} className="mt-0.5" aria-label={`Select ${c.keyword}`} />}
                      <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold inline-flex items-center gap-1" style={{ backgroundColor: c.style.bg, color: c.style.text }}><c.style.icon className="size-3" /> {c.style.label}</span>
                      <Badge variant="outline" className="!rounded-full !text-[10.5px] !border-transparent" style={{ backgroundColor: `${intent.color}12`, color: intent.color }}>● {intent.label}</Badge>
                      <span className="flex-1" />
                      {c.status === "written" && <Badge variant="secondary" className="!rounded-full !text-[10px] !bg-emerald-100 !text-emerald-800"><CheckCircle2 className="size-3 mr-1" />Written</Badge>}
                      <Badge variant="secondary" className="!rounded-full !text-[10px]"><TrendingUp className="size-3 mr-1" />{c.vol.toLocaleString()}</Badge>
                    </div>
                    <h3 className="font-semibold text-[14.5px] text-stone-900 mb-3 leading-snug line-clamp-2">{c.keyword}</h3>
                    <div className="space-y-2.5 mb-3">
                      <div><div className="flex items-center justify-between mb-0.5"><span className="text-[10.5px] uppercase tracking-wider text-stone-500">KD%</span><span className="text-[11.5px] font-semibold text-stone-800">{c.kd}%</span></div><div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden"><div className={`h-full rounded-full ${kdBarColor(c.kd)}`} style={{ width: `${c.kd}%` }} /></div></div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-2 border-t border-stone-100 flex-wrap">
                      <Button size="sm" className="!h-8 !rounded-lg !px-2.5 !text-[11.5px] font-semibold flex-1 shadow-sm !bg-emerald-700 hover:!bg-emerald-800 text-white" onClick={() => handleClusterAction(c)} disabled={!isAdmin || busy}>{busy && runningKwIds.has(Number(c.keywordId)) ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <FilePenLine className="size-3.5 mr-1.5" />}{busy && runningKwIds.has(Number(c.keywordId)) ? 'กำลังทำ...' : 'เขียนบท'}</Button>
                      <Button size="sm" variant="ghost" className="!h-8 !rounded-lg !px-2 !text-[11.5px] text-sky-700 hover:!bg-sky-50" onClick={() => openSerpPreview(c)} title="SERP Preview"><Search className="size-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="!h-8 !rounded-lg !px-2 !text-[11.5px] text-stone-600 hover:!bg-stone-100" onClick={() => handleCopyClick(Number(c.keywordId), c.keyword)} title="Copy keyword">{copiedId === Number(c.keywordId) ? <CheckCheck className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}</Button>
                      {isAdmin && <Button size="sm" variant="ghost" className="!h-8 !rounded-lg !px-2 !text-[11.5px] text-rose-600 hover:!bg-rose-50" onClick={() => setConfirmDeleteKwId(Number(c.keywordId))} title="Delete"><Trash2 className="size-3.5" /></Button>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!loading && allCards.length === 0 && (<Card className="!rounded-2xl !border-dashed !border-stone-300 col-span-full"><CardContent className="p-10 text-center"><Hash className="size-12 mx-auto text-stone-300 mb-3" /><h3 className="font-semibold text-stone-800 mb-1 text-[16px]">ยังไม่มี Keyword ในโปรเจกต์นี้</h3><p className="text-stone-500 text-[13px] mb-4">เริ่มได้ 3 ทาง: Import CSV · เพิ่ม Keyword เดี่ยว · เปิด Seed Panel → Auto Group ด้วย AI</p><div className="flex items-center justify-center gap-2 flex-wrap"><Button size="sm" variant="outline" className="!h-9 !rounded-lg" onClick={() => setImportOpen(true)}><Upload className="size-3.5 mr-1.5" />Import CSV</Button><Button size="sm" variant="outline" className="!h-9 !rounded-lg" onClick={() => setAddOpen(true)}><Plus className="size-3.5 mr-1.5" />เพิ่ม Keyword</Button><Button size="sm" className="!h-9 !rounded-lg !bg-amber-700 hover:!bg-amber-800" onClick={() => { setShowSeedPanel(true); }}><Sparkles className="size-3.5 mr-1.5" />AI Seed Panel</Button></div></CardContent></Card>)}
          </div>
        </TabsContent>

        <TabsContent value="table" className="!p-0 !mt-0">
          <KeywordTableView
            allCards={allCards as any}
            loading={loading}
            isUserAdminOrOwner={isAdmin}
            selectedIds={selectedIds}
            runningKwIds={runningKwIds}
            writePending={runPlan.isPending || createDraft.isPending}
            onToggleSelect={toggleSelect}
            onSelectAll={() => selectAll(allCards.map(c => Number(c.keywordId)).filter(id => id > 0))}
            onClearSelection={clearSelection}
            onWriteClick={handleClusterAction as any}
            onSerpPreviewClick={openSerpPreview as any}
            onCopyClick={(card: any) => handleCopyClick(Number(card.keywordId), String(card.keyword))}
            onDeleteClick={(card: any) => setConfirmDeleteKwId(Number(card.keywordId))}
            copiedId={copiedId === null ? null : String(copiedId)}
          />
        </TabsContent>

        <TabsContent value="tree" className="!p-5 !pt-2 !mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2"><Badge className="!bg-amber-100 !text-amber-900 !border-amber-200 !rounded-lg !text-[12px]"><FolderTree className="size-3.5 mr-1" />3-Tier Crown Architecture</Badge><Badge variant="outline" className="!rounded-lg !text-[12px]">Pillar ({clusters.filter(c => c.type === "pillar").length}) · Cluster ({clusters.filter(c => c.type === "cluster").length}) · Supporting KWs ({dbKeywords.filter(k => (k.tier || "supporting") === "supporting").length})</Badge></div>
              {isAdmin && <div className="flex items-center gap-2"><Button size="sm" className="!h-8 !rounded-lg !bg-[#92400e] hover:!bg-[#78350f] !text-white !text-[12px]" onClick={() => openAddCluster("top_pillar")}><Plus className="size-3 mr-1" /> เพิ่ม Pillar ใหม่</Button><Button size="sm" variant="outline" className="!h-8 !rounded-lg !text-[12px]" onClick={() => setExpandedTreeClusters(new Set(clusters.filter(c => c.type === "pillar").map(c => c.id)))}>Expand All</Button><Button size="sm" variant="outline" className="!h-8 !rounded-lg !text-[12px]" onClick={() => setExpandedTreeClusters(new Set())}>Collapse All</Button></div>}
            </div>
            {clusters.filter(c => c.type === "pillar").length === 0 && (<Card className="!rounded-2xl !border-dashed !border-amber-300 bg-amber-50/30"><CardContent className="p-6 text-center"><Crown className="size-10 mx-auto text-amber-600 mb-2" /><h3 className="font-semibold text-[15px] text-amber-900 mb-1">ยังไม่มี Pillar (H1) ในโปรเจกต์นี้</h3><p className="text-[13px] text-amber-700/80 mb-3">คลิก "เพิ่ม Pillar ใหม่" หรือใช้ "AI จัดกลุ่ม keyword" เพื่อสร้างโครงสร้าง 3-Tier Crown อัตโนมัติ</p>{isAdmin && <div className="flex items-center justify-center gap-2"><Button size="sm" className="!h-9 !rounded-lg !bg-amber-700 hover:!bg-amber-800" onClick={handleRunPlan2Step} disabled={projectId === "all" || totalKeywords === 0}><Sparkles className="size-3.5 mr-1.5" />AI สร้าง Pillar → Cluster → Supporting (ครบในคลิกเดียว)</Button><Button size="sm" variant="outline" className="!h-9 !rounded-lg" onClick={() => openAddCluster("top_pillar")}><Plus className="size-3.5 mr-1.5" />เพิ่ม Pillar ด้วยมือ</Button></div>}</CardContent></Card>)}
            {childClusters.get(null)?.filter(c => c.type === "pillar").sort((a, b) => a.name.localeCompare(b.name, 'th')).map(pillar => {
              const pillarOpen = expandedTreeClusters.has(pillar.id);
              const pillarKeywords = dbKeywords.filter(k => k.clusterId === pillar.id);
              return (
                <Card key={`pillar-${pillar.id}`} className="!rounded-2xl !bg-white !shadow-sm overflow-hidden" style={{ borderLeft: `5px solid ${TIER_STYLES.pillar.border}` }}>
                  <div className="flex items-stretch">
                    <div className="p-4 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Button variant="ghost" size="sm" className="!h-8 !w-8 !p-0 !rounded-lg shrink-0 hover:!bg-stone-100" onClick={() => toggleTreeClusterExpand(pillar.id)}>{pillarOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</Button>
                        <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: TIER_STYLES.pillar.bg, color: TIER_STYLES.pillar.text }}><Crown className="size-4.5" /></div>
                        <div className="min-w-0 flex-1"><p className="font-bold text-[15px] text-stone-900 truncate">{pillar.name}</p><p className="text-[11.5px] text-stone-500 mt-0.5">Pillar · {TIER_PLACEMENT.pillar.heading} · Cluster ใต้: {(childClusters.get(pillar.id) ?? []).length} · KW ตรง: {pillarKeywords.length}</p></div>
                        <Badge className="!rounded-full !text-[11px] !bg-amber-100 !text-amber-900 !border-amber-200 !py-1"><Hash className="size-3 mr-1" />#{pillar.id}</Badge>
                        {isAdmin && (<div className="flex items-center gap-1"><Button size="sm" variant="ghost" className="!h-8 !rounded-lg !text-[11.5px] !px-2 text-sky-700 hover:!bg-sky-50" onClick={() => openAddCluster("pillar_parent", pillar.id, pillar.name)} title="เพิ่ม Cluster ลูก"><Plus className="size-3.5 mr-1" />เพิ่ม Cluster</Button><Button size="sm" variant="ghost" className="!h-8 !rounded-lg !text-[11.5px] !px-2 text-rose-600 hover:!bg-rose-50" onClick={() => setConfirmDeleteClusterId(pillar.id)} title="ลบ Pillar (และ Cluster ลูกทั้งหมด?)"><Trash2 className="size-3.5" /></Button></div>)}
                      </div>
                    </div>
                  </div>
                  {pillarOpen && (<div className="border-t border-stone-100 bg-stone-50/40 px-2 pb-2"><div className="space-y-2 pt-3">{pillarKeywords.slice(0, 5).map(k => { const c = mapToCard(k); return (<div key={`pkw-${k.id}`} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-stone-200"><CircleDot className="size-3 text-stone-400" /><span className="text-[13px] font-medium text-stone-800 flex-1 truncate">{k.keywordText}</span><Button size="sm" className="!h-7 !rounded-md !px-2 !text-[11px] !bg-emerald-700 hover:!bg-emerald-800" onClick={() => handleClusterAction(c)} disabled={!isAdmin}>เขียนบท</Button></div>); })}{pillarKeywords.length > 5 && (<p className="text-[11.5px] text-stone-500 px-3 py-1.5">+ {pillarKeywords.length - 5} Keywords อื่นๆ — ดูเพิ่มใน Groups/Table Tab</p>)}
                    {(childClusters.get(pillar.id) ?? []).filter(c => c.type === "cluster").sort((a, b) => a.name.localeCompare(b.name, 'th')).map(cluster => {
                      const copen = expandedTreeClusters.has(cluster.id);
                      const clusterKWs = dbKeywords.filter(k => k.clusterId === cluster.id);
                      return (
                        <div key={`cluster-${cluster.id}`} className="ml-6 border-l-2 border-stone-200 pl-3 py-1.5">
                          <div className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-stone-200">
                            <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0 !rounded-md hover:!bg-stone-100 shrink-0" onClick={() => toggleTreeClusterExpand(cluster.id)}>{copen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Button>
                            <div className="w-7 h-7 rounded-md grid place-items-center shrink-0" style={{ backgroundColor: TIER_STYLES.cluster.bg, color: TIER_STYLES.cluster.text }}><Layers className="size-3.5" /></div>
                            <div className="min-w-0 flex-1"><p className="font-semibold text-[13.5px] text-stone-900 truncate">{cluster.name}</p><p className="text-[11px] text-stone-500">Cluster · H2 · Supporting KWs: {clusterKWs.length}</p></div>
                            <Badge variant="outline" className="!rounded-full !text-[10.5px]">#{cluster.id}</Badge>
                            {isAdmin && (<div className="flex items-center gap-0.5"><Button size="sm" variant="ghost" className="!h-7 !rounded-md !text-[11px] !px-1.5 text-emerald-700 hover:!bg-emerald-50" onClick={() => openAddCluster("cluster_parent", cluster.id, cluster.name)} title="เพิ่ม Supporting Clusterลูก"><Plus className="size-3" /></Button><Button size="sm" variant="ghost" className="!h-7 !rounded-md !text-[11px] !px-1.5 text-rose-600 hover:!bg-rose-50" onClick={() => setConfirmDeleteClusterId(cluster.id)}><Trash2 className="size-3" /></Button></div>)}
                          </div>
                          {copen && (<div className="ml-5 mt-1.5 space-y-1 border-l border-stone-200 pl-3 py-1">{clusterKWs.length === 0 && (<p className="text-[11.5px] text-stone-400 py-1 px-2 italic">— ไม่มี Supporting KW ใน Cluster นี้ — เพิ่ม KW หรือคลิก AI จัดกลุ่ม</p>)}{clusterKWs.slice(0, 10).map(k => { const c = mapToCard(k); const intent = INTENTS.find(i => i.key === c.intent)!; return (<div key={`ckw-${k.id}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-50"><BookOpen className="size-3" style={{ color: TIER_STYLES.supporting.text }} /><span className="text-[12.5px] text-stone-800 flex-1 truncate">{k.keywordText}</span><span className="text-[10.5px] shrink-0" style={{ color: intent.color }}>● {intent.label}</span>{c.vol > 0 && <span className="text-[11px] font-mono text-stone-500 shrink-0">{c.vol.toLocaleString()}</span>}<Button size="sm" variant="ghost" className="!h-6 !rounded-md !text-[10.5px] !px-1.5 text-sky-700 hover:!bg-sky-50" onClick={() => openSerpPreview(c)}><Search className="size-3" /></Button><Button size="sm" className="!h-6 !rounded-md !px-2 !text-[10.5px] !bg-emerald-700 hover:!bg-emerald-800" onClick={() => handleClusterAction(c)} disabled={!isAdmin}>เขียนบท</Button></div>); })}{clusterKWs.length > 10 && (<p className="text-[11px] text-stone-500 px-2 py-1">+ {clusterKWs.length - 10} Keywords อื่นๆ</p>)}</div>)}
                        </div>
                      );
                    })}</div></div>)}
                </Card>
              );
            })}
            {!loading && dbKeywords.filter(k => !k.clusterId).length > 0 && (<Card className="!rounded-2xl !border-dashed !border-stone-300 bg-stone-50/60"><CardHeader className="!p-4 flex-row items-center gap-3 space-y-0 !pb-2"><AlertTriangle className="size-5 text-stone-500" /><div className="flex-1"><CardTitle className="!text-[14px] text-stone-800">Keywords ยังไม่ได้ถูกจัดกลุ่ม ({dbKeywords.filter(k => !k.clusterId).length})</CardTitle><CardDescription className="!text-[12px] text-stone-500">ยังไม่ได้อยู่ใน Cluster ใดๆ — คลิก "✨ AI จัดกลุ่ม" เพื่อจัดกลุ่ม Crown Architecture</CardDescription></div>{isAdmin && totalKeywords > 0 && <Button size="sm" className="!h-9 !rounded-lg !bg-amber-700 hover:!bg-amber-800 shrink-0" onClick={handleRunPlan2Step} disabled={projectId === "all"}><Sparkles className="size-3.5 mr-1.5" />AI จัดกลุ่มทั้งหมด</Button>}</CardHeader><CardContent className="!p-4 !pt-2"><div className="flex flex-wrap gap-1.5">{dbKeywords.filter(k => !k.clusterId).slice(0, 60).map(k => (<Badge key={`un-${k.id}`} variant="outline" className="!rounded-full !text-[11.5px] !bg-white !py-1 !px-2.5 !border-stone-200 text-stone-700">{k.keywordText}</Badge>))}{dbKeywords.filter(k => !k.clusterId).length > 60 && (<Badge variant="outline" className="!rounded-full !text-[11px] !bg-stone-100">+ {dbKeywords.filter(k => !k.clusterId).length - 60} อื่นๆ</Badge>)}</div></CardContent></Card>)}
          </div>
        </TabsContent>

        <TabsContent value="shared" className="!p-5 !pt-2 !mt-0">
          <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm">
            <CardHeader className="!p-5 flex-row items-center gap-3 space-y-0 !pb-4"><div className="w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br from-sky-100 to-indigo-100 text-sky-700"><Share2 className="size-5" /></div><div className="flex-1 min-w-0"><CardTitle className="!text-[16px] text-stone-900 flex items-center gap-2">Share Cluster Plan เป็นลิงก์ (Read-Only · Guest No Login)</CardTitle><CardDescription className="!text-[13px] text-stone-500 mt-1">ระบบ Encode ข้อมูล Keywords + Clusters ลงใน URL Hash ด้วย Base64 — ผู้รับไม่ต้อง Login ก็เปิดดูได้ทันที</CardDescription></div><Badge className="!rounded-lg !h-7 !px-3 !bg-sky-100 !text-sky-800 !border-sky-200 !text-[11.5px]"><ShieldCheck className="size-3 mr-1" />Zero-Server · URL Hash Only</Badge></CardHeader>
            <CardContent className="!p-5 !pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Pillar", Icon: Crown, val: allCards.filter(c => c.tier === "pillar").length, color: TIER_STYLES.pillar },
                  { label: "Cluster", Icon: Layers, val: clusters.length, color: TIER_STYLES.cluster },
                  { label: "รวมคำหลัก", Icon: Hash, val: totalKeywords, color: { label: "T", border: "#475569", bg: "#f5f5f4", text: "#1c1917" } },
                ].map(({ label, val, Icon, color }) => (<Card key={label} className="!rounded-xl !border-stone-200 !bg-stone-50"><CardContent className="p-3 flex items-center gap-2.5"><div className="w-8 h-8 rounded-md grid place-items-center shrink-0" style={{ backgroundColor: color.bg, color: color.text }}><Icon className="size-4" /></div><div><p className="text-[10.5px] uppercase tracking-wider text-stone-500">{label}</p><p className="text-md font-bold text-stone-900">{val}</p></div></CardContent></Card>))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2"><Label className="text-[12.5px] font-semibold text-stone-700">ชื่อโปรเจกต์ (แสดงในหน้า Shared View)</Label><Input defaultValue={projects.find(p => p.id === projectId)?.name || `Cluster Plan · Project ${projectId}`} id="shareProjectName" className="mt-1.5 !rounded-lg" placeholder="เช่น โครงการ Keyword งวดตรุษจีน 2026" /></div>
                <div><Label className="text-[12.5px] font-semibold text-stone-700">สถานะ</Label><div className={`mt-1.5 h-9 !rounded-lg flex items-center gap-2 px-3 border ${totalKeywords > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-stone-50 text-stone-500'}`}>{totalKeywords > 0 ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}<span className="text-[13px] font-medium">{totalKeywords > 0 ? `พร้อมแชร์ (${totalKeywords} KW · ${clusters.length} Cluster)` : 'ไม่สามารถแชร์ได้ (ยังไม่มี Keyword)'}</span></div></div>
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-1"><Button size="sm" className="!h-10 !rounded-xl !px-4 !bg-gradient-to-r !from-sky-700 to-indigo-700 hover:!from-sky-800 hover:!to-indigo-800 !text-[13.5px]" onClick={() => {
                const projectNameInput = document.getElementById('shareProjectName') as HTMLInputElement | null;
                const projectName = projectNameInput?.value?.trim() || `Cluster Plan · Project ${projectId}`;
                const payload: SharePayload = { v: 1, projectName, sharedAt: Date.now(), keywords: dbKeywords, clusters };
                try {
                  const encoded = encodeSharePayload(payload);
                  const baseUrl = `${window.location.origin}${window.location.pathname}`;
                  const shareUrl = `${baseUrl}#share=${encodeURIComponent(encoded)}`;
                  navigator.clipboard?.writeText(shareUrl)
                    .then(() => toast.success(`✅ คัดลอกลิงก์แชร์เรียบร้อย · ~${Math.round(encoded.length/1024 * 10)/10} KB (URL Hash)`))
                    .catch(() => toast.warning("⚠️ คัดลอกล้มเหลว — กดปุ่ม Copy ลิงก์อีกครั้ง"));
                  const out = document.getElementById('shareUrlOutput') as HTMLInputElement | null;
                  if (out) out.value = shareUrl;
                } catch (e: any) { toast.error(`❌ สร้างลิงก์แชร์ล้มเหลว: ${String(e?.message ?? e).slice(0, 100)}`); }
              }} disabled={totalKeywords === 0}><LinkIcon className="size-4 mr-2" />🔗 สร้างลิงก์แชร์ & Copy</Button>
              <span className="text-[12px] text-stone-500"><Clock className="size-3 inline mr-1" />เวลาแชร์จะถูก embed ในลิงก์ (ในรูปแบบ timestamp)<Eye className="size-3 inline ml-3 mr-1" />ผู้รับเปิดผ่านเบราว์เซอร์ใดๆ ก็ได้</span></div>
              <div><Label className="text-[12.5px] font-semibold text-stone-700">ลิงก์แชร์ (คลิกปุ่มด้านบนเพื่อสร้าง)</Label><div className="flex items-center gap-2 mt-1.5"><Input id="shareUrlOutput" readOnly placeholder="— ยังไม่ได้สร้าง ลิงก์จะแสดงที่นี่ —" className="!rounded-lg !bg-stone-50 !font-mono !text-[12px] !pr-20" /><Button size="sm" variant="outline" className="!h-9 !rounded-lg !absolute !right-[22px] !mt-[2px]" onClick={() => { const out = document.getElementById('shareUrlOutput') as HTMLInputElement | null; if (out?.value) navigator.clipboard.writeText(out.value).then(() => toast.success("✅ คัดลอกลิงก์เรียบร้อย")).catch(() => toast.warning("⚠️ คัดลอกล้มเหลว")); else toast.info("💡 กดปุ่ม 'สร้างลิงก์แชร์' ก่อนนะ"); }}><Copy className="size-3.5 mr-1" />Copy</Button></div></div>
              <Alert className="!rounded-xl !bg-amber-50 !border-amber-200">
                <Info className="size-4.5 text-amber-800" />
                <AlertTitle className="!text-amber-900 !text-[13px] font-semibold flex items-center gap-2">ข้อจำกัด Zero-Server Hash Sharing</AlertTitle>
                <AlertDescription className="!text-amber-800 !text-[12.5px] mt-1 leading-relaxed">
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>URL ยาวเกิน ~2000 อักขระ อาจล้มเหลวในบางเบราว์เซอร์ (IE/บาง WebView) — กรณี Keyword 300+ คำ แนะนำ Export JSON แทน</li>
                    <li>Shared View เป็น Read-Only เท่านั้น — ผู้รับต้องเข้าสู่ระบบแล้วถึงจะสามารถแก้ไข หรือ เขียนบทความได้</li>
                    <li>ข้อมูลอยู่ใน URL Hash (ไม่ถูกส่งขึ้น Server) — เปลี่ยนแปลงใดๆ บนระบบหลังสร้างลิงก์ จะไม่สะท้อนในลิงก์เก่า</li>
                    <li>แชร์ระหว่างทีม ใช้ Export JSON + ส่งไฟล์ แทน เพราะยืดหยุ่นกว่าและ Backup ได้</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmDeleteKwId !== null} onOpenChange={(o) => { if (!o) setConfirmDeleteKwId(null); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2 text-rose-800"><Trash2 className="size-5" /> ยืนยันการลบ Keyword</AlertDialogTitle><AlertDialogDescription className="text-[13px] text-stone-600">คุณต้องการลบ Keyword นี้ใช่ไหม? การลบจะนำออกทันทีจากฐานข้อมูล และถอดออกจาก Cluster ที่เกี่ยวข้อง — ไม่สามารถกู้คืนได้</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="!h-9" onClick={() => setConfirmDeleteKwId(null)}>ยกเลิก</Button>
            <Button variant="destructive" size="sm" className="!h-9" onClick={() => { if (confirmDeleteKwId !== null) handleCardDelete(confirmDeleteKwId); }}><Trash2 className="size-3.5 mr-1.5" />ยืนยันลบ</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteClusterId !== null} onOpenChange={(o) => { if (!o) setConfirmDeleteClusterId(null); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2 text-rose-800"><Trash2 className="size-5" /> ยืนยันการลบ Cluster</AlertDialogTitle><AlertDialogDescription className="text-[13px] text-stone-600">ลบ Cluster #{confirmDeleteClusterId}? Keywords ที่อยู่ใน Cluster นี้จะไม่ถูกลบ แต่จะถูกตั้งเป็น "ยังไม่ได้จัดกลุ่ม" ใหม่ทั้งหมด (Unassigned)</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="!h-9" onClick={() => setConfirmDeleteClusterId(null)}>ยกเลิก</Button>
            <Button variant="destructive" size="sm" className="!h-9" onClick={() => { if (confirmDeleteClusterId !== null) handleDeleteCluster(confirmDeleteClusterId); }}><Trash2 className="size-3.5 mr-1.5" />ยืนยันลบ Cluster</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SerpPreviewModal
        open={serpModal.open}
        keywordId={serpModal.keywordId}
        onClose={closeSerpPreview}
        keywordText={serpCardInfo?.keywordText}
        keywordTier={serpCardInfo?.tier}
        keywordProjectId={serpCardInfo?.projectId ?? null}
        keywordVol={serpCardInfo?.vol}
        keywordStyleBg={serpCardInfo?.style?.bg}
        keywordStyleText={serpCardInfo?.style?.text}
        keywordStyleLabel={serpCardInfo?.style?.label}
        runningKwIds={runningKwIds}
        onToggleRun={toggleRun}
        enriching={enrichSerp.isPending}
      />

      <AddClusterDialog
        open={addClusterDialog.open}
        onClose={closeAddCluster}
        projectId={typeof projectId === "number" ? projectId : null}
        onAdded={async (cid: number) => { await utils.clusters.list.invalidate(); setExpandedClusters(prev => { const n = new Set(prev); n.add(cid); return n; }); setExpandedTreeClusters(prev => { const n = new Set(prev); if (addClusterParentType && addClusterParentId !== null) n.add(addClusterParentId); else n.add(cid); return n; }); toast.success(`✅ สร้าง Cluster สำเร็จ #${cid}`); }}
        parentType={addClusterParentType ?? undefined}
        parentId={addClusterParentId}
        parentName={addClusterParentName}
      />
    </MainDashboardShell>
  );
}
