// EEAT Studio V2 · Clusters tRPC Router (SA Phase 1 Task 1.2.1 — Pillar/Cluster/Supporting TREE)
// 4 Procedures: create / update / delete / list(by project)
// Tree rules enforced create/update: pillar parent=null; cluster parent=Pillar; supporting parent=Cluster.
import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { protectedProcedure, TRPCError } from '../_core/middleware/rbac.js';
import { db } from '../../db/index.js';
import { clusters, projects, keywords } from '../../db/schema.js';
import { eq, and, inArray, asc, desc, count, sql } from 'drizzle-orm';
import { CLUSTER_TYPES } from '../../db/schema.js';
import type { ClusterType } from '../../shared/types.js';
import { assertProjectAccess } from './_projectAccess.js';

const NAME_MAX = 255;
const UNASSIGNED_CLUSTER_NAME = "📋 ยังไม่ได้จัดกลุ่ม (System)";

function isUnassignedMarker(name: string | null | undefined): boolean {
  return String(name ?? '').trim() === UNASSIGNED_CLUSTER_NAME;
}

async function getOrCreateMarkerCluster(pid: number): Promise<number> {
  const n = Number(pid);
  if (!n || n <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid projectId for marker cluster.' });
  let [row] = await db
    .select()
    .from(clusters)
    .where(and(eq(clusters.projectId, n), eq(clusters.name, UNASSIGNED_CLUSTER_NAME)))
    .limit(1);
  if (row) return Number(row.id);
  try {
    // ⚠️ SYSTEM MARKER EXCEPTION ONLY: This is the ONE AND ONLY place allowed to create
    // a "supporting" cluster with parentId=null. It represents the pre-grouping inbox for
    // newly imported keywords and is logically a top-level system bucket even though the
    // enum type is "supporting" (preserves DB schema / migration-free upgrade). Any attempt
    // to edit its shape via user API is blocked at update/delete validators below.
    const ins: any = await db.insert(clusters).values({ projectId: n, name: UNASSIGNED_CLUSTER_NAME, type: 'supporting', parentId: null as any, createdAt: new Date() });
    if (ins && typeof ins.insertId === 'number') return Number(ins.insertId);
    if (Array.isArray(ins) && ins[0] && typeof ins[0]?.insertId === 'number') return Number(ins[0].insertId);
  } catch (_dup) { /* race insert from parallel requests */ }
  [row] = await db.select().from(clusters).where(and(eq(clusters.projectId, n), eq(clusters.name, UNASSIGNED_CLUSTER_NAME))).limit(1);
  if (row) return Number(row.id);
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create unassigned marker cluster.' });
}

/** Fetch a cluster by id OR throw NOT_FOUND */
async function clusterOrNotFound(id: number) {
  const rows = await db.select().from(clusters).where(eq(clusters.id, id)).limit(1);
  if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: `Cluster ${id} not found.` });
  return rows[0];
}

/** Validate Pillar→Cluster→Supporting hierarchy. Call before insert/update. */
async function validateTreeShape(input: {
  type: ClusterType;
  parentId?: number | null;
}, existing?: any): Promise<void> {
  const parentId = input.parentId === undefined ? (existing?.parentId ?? null) : input.parentId;
  const type = input.type ?? existing?.type ?? 'supporting';

  // 🟢 AUDIT KCP FIX: The system Unassigned marker folder is the ONE AND ONLY
  // exception to the "Supporting must have a Cluster parent" rule. It lives
  // as a top-level supporting bucket (parentId=null). Any edit/delete of this
  // special row is blocked at the procedure layer to avoid tree invariant breaks.
  if (isUnassignedMarker(existing?.name)) {
    if (type !== 'supporting' || parentId !== null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "Cannot modify the tree shape of the system Unassigned marker folder." });
    }
    return;
  }

  if (type === 'pillar') {
    if (parentId !== null && parentId !== undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pillar nodes cannot have a parent_id (top-level only).' });
    }
    return;
  }

  if (type === 'cluster') {
    if (!parentId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cluster requires parent_id pointing to a Pillar.' });
    const p = await clusterOrNotFound(Number(parentId));
    if (p.type !== 'pillar') throw new TRPCError({ code: 'BAD_REQUEST', message: `Cluster parent_id must be a Pillar (got type='${p.type}').` });
    return;
  }

  if (type === 'supporting') {
    // User-facing create/update: a supporting folder MUST live under a Cluster.
    // The Unassigned marker bypasses this rule ONLY via the internal getOrCreateMarkerCluster()
    // helper above, never through this validator path for user-created rows.
    if (!parentId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Supporting requires parent_id pointing to a Cluster.' });
    const p = await clusterOrNotFound(Number(parentId));
    if (p.type !== 'cluster') throw new TRPCError({ code: 'BAD_REQUEST', message: `Supporting parent_id must be a Cluster (got type='${p.type}').` });
    return;
  }

  throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown cluster type '${String(type)}'.` });
}

/** Detect circular parent reference (max depth 10). */
async function detectCycle(clusterId: number, newParentId: number | null): Promise<void> {
  if (!newParentId) return;
  let depth = 0;
  let current: number | null = newParentId;
  while (current && depth < 10) {
    if (current === clusterId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Circular parent reference detected in cluster tree.' });
    }
    const row = await clusterOrNotFound(current);
    current = row.parentId ? Number(row.parentId) : null;
    depth += 1;
  }
  if (depth >= 10) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cluster tree too deep (>10 levels) — max 3 tiers (pillar→cluster→supporting).' });
  }
}

/** Recursively collect child cluster ids under the given parent ids. */
async function collectDescendantIds(ids: number[]): Promise<number[]> {
  const out = new Set<number>(ids);
  let frontier = [...ids];
  for (let i = 0; i < 5; i += 1) {
    if (frontier.length === 0) break;
    const rows = await db.select({ id: clusters.id }).from(clusters).where(inArray(clusters.parentId as any, frontier));
    const next = rows.map(r => Number(r.id)).filter(id => !out.has(id));
    next.forEach(id => out.add(id));
    frontier = next;
  }
  return Array.from(out);
}

export const clustersRouter = router({
  create: protectedProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      name: z.string().min(1).max(NAME_MAX),
      type: z.enum(CLUSTER_TYPES as unknown as [string, ...string[]]).default('supporting'),
      parentId: z.number().int().positive().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'member' }, TRPCError);
      // 🟢 AUDIT KCP FIX: Users cannot create the reserved Unassigned marker folder
      // via the public API — only the internal getOrCreateMarkerCluster() helper
      // may create it. Also prevent users from creating supporting-with-null-parent
      // (that combination is reserved for the system marker only).
      if (isUnassignedMarker(input.name)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot create a cluster using the reserved system name '${UNASSIGNED_CLUSTER_NAME}'.` });
      }
      const normParentId = (input.parentId === 0 || input.parentId === undefined || !Number.isFinite(Number(input.parentId)) || Number(input.parentId) <= 0) ? null : Number(input.parentId);
      if (input.type === 'supporting' && normParentId === null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'User-created supporting folders must have a parent Cluster (parentId=null is reserved for the system Unassigned marker).' });
      }
      await validateTreeShape({ type: input.type as ClusterType, parentId: normParentId });
      try {
        const inserted: any = await db.insert(clusters).values({
          projectId: input.projectId,
          name: input.name,
          type: input.type as any,
          parentId: normParentId as any,
        });
        const id = Number(inserted[0]?.insertId ?? inserted.insertId ?? (inserted as any)?.insertId);
        const row = await clusterOrNotFound(id);
        return { ok: true, cluster: row, clusterId: id };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[clusters.create] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      patch: z.object({
        name: z.string().min(1).max(NAME_MAX).optional(),
        type: z.enum(CLUSTER_TYPES as unknown as [string, ...string[]]).optional(),
        parentId: z.number().int().positive().nullish(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await clusterOrNotFound(input.id);
      await assertProjectAccess(ctx, Number(existing.projectId), { minRole: 'member' }, TRPCError);
      // 🟢 AUDIT KCP FIX: System Unassigned marker is IMMUTABLE in shape (cannot rename,
      // retype, or reparent). Only the project that owns it can touch row-level, and
      // even then we block any structural changes to keep tree invariants consistent.
      const existingIsMarker = isUnassignedMarker(existing.name);
      const wantsRenameToMarker = 'name' in input.patch && isUnassignedMarker(input.patch.name);
      if (wantsRenameToMarker) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot rename a cluster to the reserved system name '${UNASSIGNED_CLUSTER_NAME}'.` });
      }
      if (existingIsMarker && ('type' in input.patch || 'parentId' in input.patch || ('name' in input.patch && !isUnassignedMarker(input.patch.name)))) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "The system Unassigned marker folder cannot be renamed, retyped, or reparented." });
      }

      const resolvedType = (input.patch.type ?? existing.type) as ClusterType;
      let resolvedParent: number | null;
      if (input.patch.parentId === undefined) {
        resolvedParent = (existing.parentId === 0 || existing.parentId === undefined || !Number.isFinite(Number(existing.parentId)) || Number(existing.parentId) <= 0) ? null : Number(existing.parentId);
      } else {
        resolvedParent = (input.patch.parentId === 0 || !Number.isFinite(Number(input.patch.parentId)) || Number(input.patch.parentId) <= 0) ? null : Number(input.patch.parentId);
      }
      await validateTreeShape({ type: resolvedType, parentId: resolvedParent }, existing);
      await detectCycle(Number(existing.id), resolvedParent);

      try {
        const patch: any = {};
        if ('name' in input.patch) patch.name = input.patch.name;
        if ('type' in input.patch) patch.type = input.patch.type;
        if ('parentId' in input.patch) patch.parentId = resolvedParent as any;
        if (Object.keys(patch).length === 0) return { ok: true, affected: 0 };
        const updated: any = await db.update(clusters).set(patch).where(eq(clusters.id, input.id));
        return { ok: true, affected: Number(updated[0]?.affectedRows ?? updated.affectedRows ?? (updated as any)?.[0]?.affectedRows ?? 0) };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[clusters.update] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await clusterOrNotFound(input.id);
      await assertProjectAccess(ctx, Number(existing.projectId), { minRole: 'member' }, TRPCError);
      // 🟢 AUDIT KCP FIX: Prevent user from directly deleting the system Unassigned marker.
      // It's the safe target for orphan keywords (prevent FK errors on cascading deletes
      // or reset flows) — should never disappear from a project tree.
      if (isUnassignedMarker(existing.name)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Cannot delete the system Unassigned marker folder. It is required as the safe inbox for orphan keywords during delete/reset flows." });
      }
      try {
        const allIds = await collectDescendantIds([Number(existing.id)]);
        const allIdsSafe = allIds.map(n => Number(n)).filter(n => n > 0);
        const markerClusterId = await getOrCreateMarkerCluster(Number(existing.projectId));
        // SAFE MOVE: Move any keywords inside cluster+descendants → marker cluster first (prevents FK error / no data loss)
        if (allIdsSafe.length > 0) {
          const kwRows = await db.select({ id: keywords.id }).from(keywords).where(inArray(keywords.clusterId as any, allIdsSafe));
          if (kwRows.length > 0) {
            const kwIds = kwRows.map(r => Number(r.id)).filter(n => n > 0);
            // 🟢 AUDIT KCP FIX: Preserve original keyword.tier (pillar/cluster/supporting)
            // on move to Unassigned. Previously ALL tiers were force-downgraded to
            // 'supporting' — losing pillar tier for major keywords, forcing user to
            // manually restore tier info if they reassign the row to a new cluster.
            // Only clusterId changes (point to marker), tier+intent stay as-is.
            await db.update(keywords).set({ clusterId: markerClusterId as any }).where(inArray(keywords.id, kwIds));
          }
        }
        // Delete clusters tree (marker cluster is NEVER included)
        const deleteIds = allIdsSafe.filter(n => n !== markerClusterId);
        let affected = 0;
        if (deleteIds.length > 0) {
          const del: any = await db.delete(clusters).where(inArray(clusters.id as any, deleteIds));
          affected = Number(del[0]?.affectedRows ?? del.affectedRows ?? (del as any)?.[0]?.affectedRows ?? deleteIds.length);
        }
        return { ok: true, affected, deletedClusterIds: deleteIds, movedKeywords: true };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[clusters.delete] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  list: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'member' }, TRPCError);
      try {
        const clusterRows = await db
          .select()
          .from(clusters)
          .where(eq(clusters.projectId, input.projectId))
          .orderBy(asc(clusters.type), asc(clusters.parentId), asc(clusters.id));

        const countRows = await db
          .select({ clusterId: keywords.clusterId, kwCount: count(keywords.id) })
          .from(keywords)
          .where(eq(keywords.projectId, input.projectId))
          .groupBy(keywords.clusterId);
        const kwCountMap = new Map<number, number>();
        countRows.forEach(r => { if (r.clusterId) kwCountMap.set(Number(r.clusterId), Number(r.kwCount ?? 0)); });

        const clustersWithCount = clusterRows.map(c => ({
          ...c,
          keywordCount: kwCountMap.get(Number(c.id)) ?? 0,
        }));

        return { ok: true, count: clustersWithCount.length, clusters: clustersWithCount, keywordCountByClusterId: Object.fromEntries(kwCountMap) };
      } catch (e: any) {
        console.warn('[clusters.list] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),
});

export default clustersRouter;
