// EEAT Studio V2 — Shared Types (SA System Design §4 Schema contracts)
// Reused in client/server/db — SINGLE SOURCE OF TRUTH (no duplicate type decl)
// ⚠️ REVISED 2026-09-08: Synced with SQL/drizzle schema FIX-3
//   · UserRole: admin/writer ONLY (viewer REMOVED SA L46)
//   · TeamPermission: owner/admin/member ONLY (read/edit REMOVED SA L53)
//   · ArticleStatus: draft/published 2 values ONLY (writing/review REMOVED SA L68)
//   · CategorySeedRow: +icon +is_active +sort_order (NEW cols SA L57)
//   · ArticleMandatoryFk: keyword_id → number | null (SA L68 NULLABLE!)

// ── users roles (RBAC enum DB check constraint §4.1) ─────────────
// ✅ SA L46: enum(admin/writer) — viewer REMOVED
export type UserRole = 'admin' | 'writer';
export const USER_ROLES = ['admin', 'writer'] as const;

// ── team_members permission scope (§4.3 Iron Rule P3 COULD) ─────
// ✅ SA L53: enum(owner/admin/member) — read/edit REMOVED
export type TeamPermission = 'owner' | 'admin' | 'member';
export const TEAM_PERMISSIONS = ['owner', 'admin', 'member'] as const;

// ── articles status (§4.8 SA L68: 2 values ONLY draft/published) ───
// ✅ SA L68: enum(draft/published) — writing/review REMOVED
export type ArticleStatus = 'draft' | 'published';
export const ARTICLE_STATUSES = ['draft', 'published'] as const;

// ── categories is_ymyl (§4.4 Iron Rule §3) ───────────────────────
// ✅ FIX: +3 NEW COLS SA L57 explicit: icon, is_active, sort_order
export interface CategorySeedRow {
  id: number;
  name: string;
  slug: string;
  is_ymyl: 0 | 1;
  icon: string | null;
  is_active: 0 | 1;
  sort_order: number;
  description: string | null;
  created_at: string;
}

// ── clusters TREE type (§4.6 SA L62-L63) ──────────────────────────
export type ClusterType = 'pillar' | 'cluster' | 'supporting';
export const CLUSTER_TYPES = ['pillar', 'cluster', 'supporting'] as const;

// ── keywords status (§4.7 SA L66: pending/written) ───────────────
export type KeywordStatus = 'pending' | 'written';
export const KEYWORD_STATUSES = ['pending', 'written'] as const;

// ── keyword intent (SA Phase 1 Task 1.2: informational/transactional/commercial/navigational) ──
// ✅ Match db/schema.ts INTENTS enum L27 EXACT order
export type KeywordIntent = 'informational' | 'transactional' | 'commercial' | 'navigational';
export const KEYWORD_INTENTS = ['informational', 'transactional', 'commercial', 'navigational'] as const;

// ── Task 1.4 WriteKeywordPackage — COMPLETE (ท่อไม่ขาด) Phase 2 รับ 1:1 ──
export interface WriteKeywordPackage {
  keywordId: number;
  keyword: string;
  intent: KeywordIntent;
  projectId: number;
  categoryId: number;
  clusterId: number;
}

// ── Team permission cross-reference (reused by projects/clusters list) ──
export type ProjectWithPermission<TProject = any> = TProject & {
  permission: TeamPermission;
  categoryName?: string | null;
  categorySlug?: string | null;
};

// ── articles FK — SA L68: keyword_id NULLABLE! ────────────────────
export interface ArticleMandatoryFk {
  project_id: number;
  keyword_id: number | null;  // ✅ SA L68: keyword_id is nullable! (was non-null violation FIXED)
  author_id: number;
  category_id: number;
}
