import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sparkles, TrendingUp, Wand2, ChevronDown, ChevronRight, Target,
  GitBranch, Layers, Share2, FilePenLine, Trash2, AlertTriangle, Hash,
} from "lucide-react";
import {
  UNASSIGNED_CLUSTER_NAME, TIER_STYLES, TIER_PLACEMENT, SOURCES,
  intentStyleOf, kdBarColor, pickCategoryLabel, kwStyleOf,
  type ClusterTier,
} from "./ClusterTierBadges";
import { INTENTS } from "./ClusterTierBadges";
import type { DbKeyword, ClusterRow } from "@/hooks/useKeywordPlanner";

export type ClusterGroup = {
  clusterId: number;
  name: string;
  type: ClusterTier;
  items: DbKeyword[];
  parentId: number | null;
  writtenCount: number;
};

type ClusterManagerViewProps = {
  dbKeywords: DbKeyword[];
  clustersById: Record<number, ClusterRow>;
  clusters: ClusterRow[];
  totalKeywords: number;
  isUserAdminOrOwner: boolean;
  showClusterGroupsEmptyGuide?: boolean;
  workflowStep?: number;
  hasKeywords?: boolean;
  hasSvKd?: boolean;
  projectCategoryId?: number | null;
  expandedClustersView?: Set<number>;
  onToggleExpandCluster?: (clusterId: number) => void;
  onExpandAllClusters?: () => void;
  onCollapseAllClusters?: () => void;
  selectedIds?: Set<number>;
  onToggleSelectKeyword?: (id: number) => void;
  onOpenSeedPanel?: () => void;
  onEnrichSerp?: () => void;
  onClusterize?: () => void;
  onSwitchToCardsView?: () => void;
  onWriteGroup?: (group: ClusterGroup) => void;
  onShareGroup?: (group: ClusterGroup) => void;
  onDeleteGroup?: (clusterId: number) => void;
  onWriteKeyword?: (keyword: DbKeyword) => void;
};

export function buildClusterGroups(
  dbKeywords: DbKeyword[],
  clustersById: Record<number, ClusterRow>,
  unassignedName: string = UNASSIGNED_CLUSTER_NAME,
): ClusterGroup[] {
  const groupsMap = new Map<number, ClusterGroup>();
  for (const raw of dbKeywords) {
    const k: DbKeyword = { ...raw };
    const cid = Number(k.clusterId) || 0;
    if (!groupsMap.has(cid)) {
      const c = cid > 0 ? clustersById[cid] : null;
      groupsMap.set(cid, {
        clusterId: cid,
        name: cid === 0 ? unassignedName : c?.name || `Cluster #${cid}`,
        type: (cid > 0 ? (c?.type || (k.tier || 'cluster')) : (k.tier || 'cluster')) as ClusterTier,
        items: [],
        parentId: cid > 0 ? (c?.parentId || null) : null,
        writtenCount: 0,
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
  return groupsArr;
}

export default function ClusterManagerView(props: ClusterManagerViewProps) {
  const {
    dbKeywords, clustersById, clusters, totalKeywords, isUserAdminOrOwner,
    showClusterGroupsEmptyGuide = false, workflowStep = 1, hasKeywords, hasSvKd,
    projectCategoryId = null,
    expandedClustersView: extExpanded, onToggleExpandCluster, onExpandAllClusters, onCollapseAllClusters,
    selectedIds = new Set<number>(), onToggleSelectKeyword,
    onOpenSeedPanel, onEnrichSerp, onClusterize, onSwitchToCardsView,
    onWriteGroup, onShareGroup, onDeleteGroup, onWriteKeyword,
  } = props;

  const [localExpanded, setLocalExpanded] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const expanded = extExpanded ?? localExpanded;

  const toggleCl = (cid: number) => {
    if (onToggleExpandCluster) { onToggleExpandCluster(cid); return; }
    setLocalExpanded(prev => { const next = new Set(prev); if (next.has(cid)) next.delete(cid); else next.add(cid); return next; });
  };
  const expandAll = () => {
    if (onExpandAllClusters) { onExpandAllClusters(); return; }
    setLocalExpanded(new Set(groupsArr.map(g => g.clusterId)));
  };
  const collapseAll = () => {
    if (onCollapseAllClusters) { onCollapseAllClusters(); return; }
    setLocalExpanded(new Set());
  };

  const groupsArr = useMemo(
    () => buildClusterGroups(dbKeywords, clustersById),
    [dbKeywords, clustersById]
  );

  const totalPillar = groupsArr.filter(g => g.type === 'pillar').length;
  const totalCluster = groupsArr.filter(g => g.type === 'cluster').length;
  const totalSupporting = groupsArr.filter(g => g.type === 'supporting').length;

  const flatClusters: ClusterRow[] = clusters && clusters.length ? clusters : Object.values(clustersById);
  const parentNameOf = (parentId: number | null) => {
    if (!parentId) return null;
    const pc = flatClusters.find((x: ClusterRow) => Number(x.id) === Number(parentId));
    return pc?.name ?? pickCategoryLabel(projectCategoryId ?? undefined);
  };
  const parentPillarName = (g: any) => {
    const cn = parentNameOf(g.parentId);
    if (cn) return cn;
    if (g.type === 'pillar') return pickCategoryLabel(projectCategoryId ?? undefined);
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
                โปรเจกต์นี้มี <strong className="text-stone-800">{totalKeywords} คำหลัก</strong> แต่ยังไม่ได้ส่งให้ AI จัดกลุ่ม 3-Tier
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {onOpenSeedPanel && (
                  <Button size="sm" className="!h-9 !rounded-lg !bg-gradient-to-r !from-purple-700 !to-indigo-700 hover:!from-purple-800 hover:!to-indigo-800 text-white" onClick={onOpenSeedPanel}>
                    <Sparkles className="size-3.5 mr-1.5" /> 1. เปิด AI Seed Panel
                  </Button>
                )}
                {hasKeywords && !hasSvKd && onEnrichSerp && (
                  <Button size="sm" variant="outline" className="!h-9 !rounded-lg !border-amber-300 !bg-white !text-amber-800 hover:!bg-amber-50" onClick={onEnrichSerp}>
                    <TrendingUp className="size-3.5 mr-1.5" /> 2. Enrich SERP (SV/KD)
                  </Button>
                )}
                {hasKeywords && hasSvKd && onClusterize && (
                  <Button size="sm" variant="outline" className="!h-9 !rounded-lg !border-emerald-300 !bg-white !text-emerald-800 hover:!bg-emerald-50" onClick={onClusterize}>
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
          <p className="text-[12.5px] text-stone-500 mb-4">เปิด AI Seed Panel หรือ Import CSV แล้วกด AI จัดกลุ่ม 3-Tier</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onOpenSeedPanel && (
              <Button size="sm" className="!h-9 !rounded-lg !bg-gradient-to-r !from-purple-700 !to-indigo-700 hover:!from-purple-800 hover:!to-indigo-800" onClick={onOpenSeedPanel} disabled={!isUserAdminOrOwner}>
                <Sparkles className="size-3.5 mr-1.5" /> เปิด AI Seed Panel
              </Button>
            )}
            {onSwitchToCardsView && (
              <Button size="sm" variant="outline" className="!h-9 !rounded-lg" onClick={onSwitchToCardsView}>
                <Layers className="size-3.5 mr-1.5" /> ดู Cards Grid
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {groupsArr.map(g => {
            const style = kwStyleOf(g.type);
            const pillarName = parentPillarName(g);
            const isExpanded = expanded.has(g.clusterId);
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
                  {isUserAdminOrOwner && (
                    <div className="flex items-center gap-1 shrink-0">
                      {onWriteGroup && (
                        <Button size="sm" variant="ghost" className="!h-9 !rounded-lg !text-[12px] !text-stone-700 hover:!bg-stone-100" onClick={() => onWriteGroup(g)}>
                          <FilePenLine className="size-4 mr-1.5" /> เขียน
                        </Button>
                      )}
                      {onShareGroup && (
                        <Button size="sm" variant="ghost" className="!h-9 !rounded-lg !text-[12px] !text-blue-700 hover:!bg-blue-50" onClick={() => onShareGroup(g)}>
                          <Share2 className="size-4 mr-1.5" /> Share
                        </Button>
                      )}
                      {onDeleteGroup && (
                        <Button size="sm" variant="ghost" className="!h-9 !rounded-lg !text-[12px] !text-rose-700 hover:!bg-rose-50" onClick={() => onDeleteGroup(g.clusterId)} disabled={g.clusterId === 0}>
                          <Trash2 className="size-4 mr-1.5" /> ลบ
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className="divide-y divide-stone-100">
                    {g.items.length === 0 ? (
                      <div className="px-4 py-3 text-[12px] text-stone-400 italic">ยังไม่มี Keywords ในกลุ่มนี้</div>
                    ) : g.items.map((k, i) => {
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
                          {isUserAdminOrOwner && (
                            <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                              {onWriteKeyword && (
                                <Button size="sm" variant="ghost" className="!h-8 !rounded-lg !px-2.5 !text-[11.5px] !text-emerald-700 hover:!bg-emerald-50" onClick={() => onWriteKeyword(k)}>
                                  <FilePenLine className="size-4 mr-1" /> เขียน
                                </Button>
                              )}
                              <Checkbox
                                checked={selectedIds.has(Number(k.id))}
                                onCheckedChange={() => onToggleSelectKeyword && onToggleSelectKeyword(Number(k.id))}
                                className="size-4"
                              />
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
}

export { TIER_STYLES, TIER_PLACEMENT, INTENTS, SOURCES };
