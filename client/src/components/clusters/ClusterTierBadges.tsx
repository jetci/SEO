import { Crown, Layers, BookOpen } from "lucide-react";
import type { ComponentType } from "react";
import { detectIntentClientSide as _detectIntentClientSide, type IntentKey, type ClusterTier } from "@/hooks/useKeywordPlanner";

export { _detectIntentClientSide as detectIntentClientSide };
export type { IntentKey, ClusterTier };

export const INTENTS = [
  { key: "commercial", label: "Commercial", color: "#b45309" },
  { key: "transactional", label: "Transactional", color: "#dc2626" },
  { key: "navigational", label: "Navigational", color: "#7c3aed" },
  { key: "informational", label: "Informational", color: "#2563eb" },
] as const;

export function intentStyleOf(intentKey: IntentKey | string) {
  switch (intentKey) {
    case "informational":  return { label: "informational",  bg: "#dbeafe", border: "#93c5fd", text: "#1d4ed8" };
    case "commercial":     return { label: "commercial",     bg: "#fef3c7", border: "#fcd34d", text: "#b45309" };
    case "transactional":return { label: "transactional",bg: "#fee2e2", border: "#fca5a5", text: "#b91c1c" };
    case "navigational": return { label: "navigational", bg: "#ede9fe", border: "#c4b5fd", text: "#6d28d9" };
    default:              return { label: String(intentKey),        bg: "#f5f5f4", border: "#d6d3d1", text: "#44403c" };
  }
}

export function kdBarColor(kd?: number | null) {
  const n = typeof kd === "number" ? kd : 0;
  if (n < 30) return "bg-emerald-500";
  if (n < 60) return "bg-yellow-500";
  return "bg-red-500";
}

export const UNASSIGNED_CLUSTER_NAME = "ยังไม่ได้จัดกลุ่ม (System)";
export const UNASSIGNED_FAKE_ID = -999_000 as const;

export const TIER_STYLES: Record<ClusterTier, { label: string; border: string; bg: string; text: string; icon: ComponentType<{ className?: string }> }> = {
  pillar: { label: "Pillar", border: "#b45309", bg: "#fff7ed", text: "#92400e", icon: Crown },
  cluster: { label: "Cluster", border: "#2563eb", bg: "#eff6ff", text: "#1d4ed8", icon: Layers },
  supporting: { label: "Supporting", border: "#059669", bg: "#ecfdf5", text: "#047857", icon: BookOpen },
};

export const TIER_PLACEMENT: Record<ClusterTier, { heading: string; description: string; color: string; border: string; bg: string }> = {
  pillar:     { heading: "H1", description: "บทความ Focus · Meta Title/Desc", color: "#92400e", border: "#b45309", bg: "#fff7ed" },
  cluster:    { heading: "H2", description: "หัวข้อหลัก / Intro Section",    color: "#1d4ed8", border: "#2563eb", bg: "#eff6ff" },
  supporting: { heading: "H3", description: "Body · Alt Img · FAQ · LSI",    color: "#047857", border: "#059669", bg: "#ecfdf5" },
};

export function pickCategoryLabel(catId: number | null | undefined): string {
  switch (Number(catId)) {
    case 1: return "ฟุตบอล"; case 2: return "มวย"; case 3: return "สล็อต";
    case 4: return "หวย"; case 5: return "คาสิโน"; case 6: return "ไก่ชน";
    case 7: return "วัวชน"; default: return "ทุกหมวด";
  }
}

export const SOURCES = [
  { key: "serp_live", label: "DATA", color: "#047857", bg: "#ecfdf5" },
  { key: "db_stale", label: "DATA", color: "#92400e", bg: "#fff7ed" },
  { key: "cache_7d", label: "DATA", color: "#1d4ed8", bg: "#eff6ff" },
  { key: "pending", label: "PENDING", color: "#44403c", bg: "#f5f5f4" },
  { key: "na", label: "N/A", color: "#78716c", bg: "#f5f5f4" },
];

export function kwSource(v: number | null | undefined, idx = 0) {
  const DATA_SOURCE_COUNT = SOURCES.length - 2;
  if (typeof v === 'number' && v > 0) return SOURCES[(idx + Math.floor(v / 50)) % DATA_SOURCE_COUNT];
  return SOURCES[4];
}

export function kwStyleOf(tierRaw?: ClusterTier | null | string): { label: string; border: string; bg: string; text: string; icon: ComponentType<{ className?: string }> } {
  const t = (tierRaw as ClusterTier) || "supporting";
  return TIER_STYLES[t] ?? TIER_STYLES.supporting;
}
