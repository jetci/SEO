// EEAT Studio V2 · Keywords tRPC Router (SA Phase 1 Task 1.2.2 + Phase 2 enrich/AI clusterize)
// 7 Procedures: create / update / delete / bulkCreate / listByCluster / enrichSerp / aiClusterize
// Intent 4 values default=informational. Status 2 values default=pending.
// Unique(project, keyword_text) → uk_keywords_project_text guard.
import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { protectedProcedure, TRPCError } from '../_core/middleware/rbac.js';
import { keywords, clusters, articles, projects as projectsTable, categories as categoriesTable } from '../../db/schema.js';
import { KEYWORD_INTENTS, KEYWORD_STATUSES, CLUSTER_TYPES } from '../../shared/types.js';
import { eq, and, inArray, asc, desc, isNull, or, ne, sql, like } from 'drizzle-orm';
import { assertProjectAccess, assertTeamAccess } from './_projectAccess.js';
import type { KeywordIntent, KeywordStatus } from '../../shared/types.js';
import { db } from '../../db/index.js';
import { SerpService, type EnrichResult } from '../services/serpClient.js';
import { LlmService } from '../services/llmClient.js';
import * as crypto from 'node:crypto';
import { IS_DEV } from '../_core/env.js';
import { getInsertId } from '../_core/utils/insertId.js';

const INTENTS = [...KEYWORD_INTENTS];
const KEYWORD_INTENT_ENUM = [...KEYWORD_INTENTS] as unknown as [string, ...string[]];
const CLUSTER_TYPE_ENUM = [...CLUSTER_TYPES] as unknown as [string, ...string[]];

const KW_MAX = 255;
const UNASSIGNED_CLUSTER_NAME = "ยังไม่ได้จัดกลุ่ม (System)";

const KW_INTENT_ARRAY = KEYWORD_INTENTS as unknown as [string, ...string[]];
const KW_STATUS_ARRAY = KEYWORD_STATUSES as unknown as [string, ...string[]];

/** Lazily UPSERT marker cluster for a project (FK-safe: NEVER use clusterId=0). Returns real cluster id. */
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
    // ⚠️ SYSTEM MARKER EXCEPTION ONLY (mirrors clusters.ts):
    // This is the ONE AND ONLY path in keywords.ts allowed to create a "supporting" cluster
    // with parentId=null. It represents the pre-grouping inbox for newly imported keywords.
    // Users CANNOT edit/delete/rename this row via the public API (enforced in clusters router
    // validators at create/update/delete). TypeScript/DB enum stays pillar/cluster/supporting
    // to avoid migration. Tree validator in clusters.ts has a marker-name exemption.
    await db.insert(clusters).values({
      projectId: n,
      name: UNASSIGNED_CLUSTER_NAME,
      type: 'supporting',
      parentId: null as any,
      createdAt: new Date(),
    });
  } catch (_e) { /* ignore duplicate races */ }
  [row] = await db
    .select()
    .from(clusters)
    .where(and(eq(clusters.projectId, n), eq(clusters.name, UNASSIGNED_CLUSTER_NAME)))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create unassigned marker cluster.' });
  return Number(row.id);
}

/** Heuristic Thai+English Intent Auto-Detect (used everywhere instead of default informational) */
function detectIntentFromText(raw: string): KeywordIntent {
  const kw = (raw ?? '').toLowerCase().trim();
  if (!kw) return 'informational';
  // Transactional (purchase-intent = user wants to buy/order/book/pay NOW
  if (/(จอง|สั่ง(ซื้อ|จอง|มอบหมาย)?|ชำระ|เช่า|สั่งอาหาร|สั่งของ|buy|order|book|purchase|checkout|subscribe|สมัครใช้งาน|เงื่อนไขการซื้อ|การชำระ)/.test(kw)) return 'transactional';
  // Navigational (user wants specific site/store/place
  if (/(ร้าน|ที่ไหน|ใกล้ฉัน|เว็บไซต์|หน้า login|ลงทะเบียนเข้าใช้งาน|official site|website|near me|map|ที่อยู่|ติดต่อ|fb|facebook|line id|whatsapp|เบอร์)/.test(kw)) return 'navigational';
  // Commercial (research before buy compare/price/review รีวิว เปรียบเทียบ ราคา
  if (/(ราคา|กี่บาท|เท่าไหร่|ดีกว่า|เทียบ|เปรียบเทียบ|รีวิว|review|top 10|ดีที่สุด|best|top|should i buy|worth it|คุ้มไหม|โปรโมชั่น|ส่วนลด|คูปอง|โค้ดส่วนลด|โปร|discount|coupon|เปรียบเทียบ iphone|เปรียบเทียบมือถือ)/.test(kw)) return 'commercial';
  // Explicit Informational (how what why when who)
  if (/(วิธี|ทำไม|อย่างไร|คืออะไร|คือ|ยังไง|เป็นอย่างไร|เป็นเมื่อไหร่|เหตุผล|วิธีทำ|สอน|แนะนำ|บทความ|วิธีรักษา|วิธีทำ|ข้อดีข้อเสีย|คือ|ข้อได้เปรียบ|หายังไง)/.test(kw)) return 'informational';
  // Rule: words count (short broad words = usually commercial, long tail detailed = informational)
  const spaceCount = (kw.match(/\s+/g) ?? []).length;
  if (spaceCount <= 1 && kw.length <= 18 && /(บ้าน|รถ|คอม|มือถือ|โน้ตบุ๊ค|ทีวี|ผัก|ผลไม้|เครื่อง|เสียง|เกมส์|watch|shoes|bag|เสื้อ|กางเกง|เครื่องสำอาง|ครีม|โลชั่น|ยา|อาหารเสริม|น้ำมัน|รถยนต์|รถจักรยานยนต์|ทาวน์เฮาส์|คอนโด|บ้านเดี่ยว|อพาร์ทเมนต์|บ้านแฝด|บ้านทาวน์เฮาส์|คอนโดมิเนียม|คอนโดมิเนียม)/i.test(kw)) return 'commercial';
  // Fallback 70% informational for long-tail which is the SEO majority
  return 'informational';
}

/** Validate intent matches DB INTENTS enum (currently: commercial/info/nav/trans order handled by zod enum since both have same values) */
function assertValidIntent(v: string): asserts v is KeywordIntent {
  if (!KEYWORD_INTENTS.includes(v as any) && !INTENTS.includes(v as any)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid intent '${v}'. Expected one of: ${KEYWORD_INTENTS.join(', ')}.` });
  }
}

export const keywordsRouter = router({
  create: protectedProcedure
    .input(z.object({
      clusterId: z.number().int().positive(),
      keywordText: z.string().min(1).max(KW_MAX),
      intent: z.enum(KW_INTENT_ARRAY).default('informational'),
      status: z.enum(KW_STATUS_ARRAY).default('pending'),
    }))
    .mutation(async ({ ctx, input }) => {
      // ALWAYS auto-detect intent first; user can override later via inline edit
      const autoIntent = detectIntentFromText(input.keywordText);
      const [clusterRow] = await db.select().from(clusters).where(eq(clusters.id, input.clusterId)).limit(1);
      if (!clusterRow) throw new TRPCError({ code: 'NOT_FOUND', message: `Cluster ${input.clusterId} not found.` });
      await assertProjectAccess(ctx, Number(clusterRow.projectId), { minRole: 'member' }, TRPCError);

      const projects = await import('../../db/schema.js').then(m => m.projects);
      const [projRow] = await db
        .select({ categoryId: projects.categoryId })
        .from(projects)
        .where(eq(projects.id, Number(clusterRow.projectId)))
        .limit(1);
      // Fallback: if project category_id is NULL/0 (new project dialog bug) → auto pick default smallest id category instead of BAD_REQUEST
      let correctCategoryId = projRow ? Number(projRow.categoryId) : 0;
      if (!correctCategoryId || correctCategoryId <= 0) {
        const cats = await import('../../db/schema.js').then(m => m.categories);
        const [fb] = await db.select({ id: cats.id }).from(cats).orderBy(asc(cats.id)).limit(1);
        if (!fb?.id) throw new TRPCError({ code: 'BAD_REQUEST', message: `Project has no valid categoryId and no default category exists in categories table.` });
        correctCategoryId = Number(fb.id);
        try { await db.update(projects).set({ categoryId: correctCategoryId }).where(eq(projects.id, Number(clusterRow.projectId))); } catch (_e) { /* ignore */ }
        console.warn(`[keywords.create] WARN: project ${clusterRow.projectId} had NULL/0 category_id → auto-patched to default id=${correctCategoryId}`);
      }

      try {
        const inserted: any = await db.insert(keywords).values({
          clusterId: input.clusterId,
          projectId: Number(clusterRow.projectId),
          categoryId: correctCategoryId,
          keywordText: input.keywordText,
          intentSuggestion: autoIntent as any,
          status: input.status as any,
          tier: clusterRow.type as any,
        });
        const id = Number(inserted[0]?.insertId ?? inserted.insertId ?? (inserted as any)?.insertId);
        const [row] = await db.select().from(keywords).where(eq(keywords.id, id)).limit(1);
        return { ok: true, keyword: row, keywordId: id };
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        // Duplicate unique(project, keyword_text)
        if (/duplicate/i.test(msg) && /uk_keywords_project_text|keyword_project/i.test(msg)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Keyword '${input.keywordText}' already exists in this project.` });
        }
        if (!(e instanceof TRPCError)) console.warn('[keywords.create] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg.slice(0, 200) });
      }
    }),

  importCsv: protectedProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      rows: z.array(z.object({
        keyword: z.string().min(2).max(KW_MAX),
        volume: z.coerce.number().optional(),
        difficulty: z.coerce.number().min(0).max(100).optional(),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'member' }, TRPCError);
      const [proj] = await db
        .select({ id: projectsTable.id, categoryId: projectsTable.categoryId })
        .from(projectsTable)
        .where(eq(projectsTable.id, input.projectId))
        .limit(1);
      if (!proj) throw new TRPCError({ code: 'NOT_FOUND', message: `Project ${input.projectId} not found.` });
      // Fallback: if project was created with NULL category_id (new-project-dialog bug), pick smallest id default category instead of BAD_REQUEST (prevents 400 on importCsv)
      let catId = Number(proj.categoryId);
      if (!catId || catId <= 0) {
        const cats = await import('../../db/schema.js').then(m => m.categories);
        const [fallbackCat] = await db.select({ id: cats.id }).from(cats).orderBy(asc(cats.id)).limit(1);
        if (!fallbackCat?.id) throw new TRPCError({ code: 'BAD_REQUEST', message: `Project has no categoryId and no default category exists in categories table.` });
        catId = Number(fallbackCat.id);
        try { await db.update(projectsTable).set({ categoryId: catId }).where(eq(projectsTable.id, input.projectId)); } catch (_e) { /* ignore patch race */ }
        console.warn(`[importCsv] WARN: project ${input.projectId} had NULL/0 category_id → auto-patched to default id=${catId}`);
      }
      const uniqueMap = new Map<string, { keyword: string; volume?: number; difficulty?: number }>();
      for (const r of input.rows) {
        const k = r.keyword.trim();
        if (!k || k.length < 2) continue;
        if (uniqueMap.has(k.toLowerCase())) {
          const existing = uniqueMap.get(k.toLowerCase())!;
          if (typeof r.volume === 'number' && typeof existing.volume !== 'number') existing.volume = r.volume;
          if (typeof r.difficulty === 'number' && typeof existing.difficulty !== 'number') existing.difficulty = r.difficulty;
        } else {
          uniqueMap.set(k.toLowerCase(), { keyword: k, volume: r.volume, difficulty: r.difficulty });
        }
      }
      const deduped = Array.from(uniqueMap.values());
      if (deduped.length === 0) return { ok: true, inserted: 0, updated: 0, total_rows: input.rows.length, skipped: input.rows.length, unique_count: 0, inserted_keyword_ids: [] as number[] };
      let inserted = 0, updated = 0, skipped = 0;
      const insertedKeywordIds: number[] = [];
      const markerClusterId = await getOrCreateMarkerCluster(input.projectId);
      try {
        for (const r of deduped) {
          try {
            const rowIntent = detectIntentFromText(r.keyword);
            const values: any = {
              projectId: input.projectId,
              clusterId: markerClusterId,
              categoryId: catId,
              keywordText: r.keyword,
              tier: 'supporting' as any,
              intentSuggestion: rowIntent as any,
              status: 'pending' as any,
              ...(typeof r.volume === 'number' ? { searchVolume: r.volume } : {}),
              ...(typeof r.difficulty === 'number' ? { difficulty: r.difficulty } : {}),
            };
            const res: any = await db.insert(keywords).values(values);
            const newId = getInsertId(res);
            insertedKeywordIds.push(newId);
            inserted++;
            void res;
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (/duplicate/i.test(msg) && /uk_keywords_project_text|keyword_project/i.test(msg)) {
              const patch: any = {};
              if (typeof r.volume === 'number') patch.searchVolume = r.volume;
              if (typeof r.difficulty === 'number') patch.difficulty = r.difficulty;
              const rowIntent = detectIntentFromText(r.keyword);
              patch.intentSuggestion = rowIntent as any;
              if (Object.keys(patch).length > 0) {
                await db.update(keywords).set(patch).where(and(eq(keywords.projectId, input.projectId), eq(keywords.keywordText, r.keyword)));
              }
              updated++;
            } else {
              skipped++;
              if (IS_DEV) console.warn('[importCsv] skip row:', msg.slice(0, 80));
            }
          }
        }
        return { ok: true, inserted, updated, total_rows: input.rows.length, skipped, unique_count: deduped.length, inserted_keyword_ids: insertedKeywordIds };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[keywords.importCsv] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  listByProject: protectedProcedure
    .input(z.object({
      projectId: z.union([z.literal('all'), z.number().int().positive()]).default('all'),
      search: z.string().max(255).optional(),
      tier: z.enum(['all', ...CLUSTER_TYPE_ENUM] as unknown as readonly [string, ...string[]]).default('all'),
      intent: z.enum(['all', ...KEYWORD_INTENT_ENUM] as unknown as readonly [string, ...string[]]).default('all'),
      status: z.enum(['all', ...KW_STATUS_ARRAY] as unknown as readonly [string, ...string[]]).default('all'),
      limit: z.number().int().min(1).max(500).default(200),
    }).optional())
    .query(async ({ ctx, input }) => {
      const inp = input ?? { projectId: 'all' as const, limit: 200, tier: 'all' as const, intent: 'all' as const, status: 'all' as const, search: '' };
      try {
        const where: any[] = [];
        let projectIds: number[] = [];
        if (inp.projectId !== 'all') {
          await assertProjectAccess(ctx, Number(inp.projectId), { minRole: 'member' }, TRPCError);
          projectIds = [Number(inp.projectId)];
        } else {
          // List accessible projects via team memberships / ownership
          const userId = Number(ctx.user?.id ?? 0);
          const allRows: any[] = await import('../../db/schema.js').then(async (m) => {
            const { teams, teamMembers, projects } = m;
            const owned = await db.selectDistinct({ id: projects.id }).from(projects).leftJoin(teams, eq(teams.ownerId as any, userId)).where(eq(projects.teamId as any, teams.id));
            const member = await db.selectDistinct({ id: projects.id }).from(projects).innerJoin(teamMembers, and(eq(teamMembers.userId, userId), or(eq(projects.teamId as any, teamMembers.teamId), isNull(projects.teamId as any))));
            const perms = [...owned, ...member].map(r => Number(r.id)).filter(Boolean);
            return Array.from(new Set(perms)).map(id => ({ id }));
          });
          projectIds = allRows.map(r => Number(r.id)).filter(Boolean);
        }
        if (projectIds.length > 0) where.push(inArray(keywords.projectId, projectIds));
        if (inp.tier && inp.tier !== 'all') where.push(eq(keywords.tier, inp.tier as any));
        if (inp.intent && inp.intent !== 'all') where.push(eq(keywords.intentSuggestion, inp.intent as any));
        if (inp.status && inp.status !== 'all') where.push(eq(keywords.status, inp.status as any));
        const search = (inp.search || '').trim();
        const baseQ = db.select().from(keywords).where(where.length ? and(...where) : undefined).orderBy(sql`CASE ${keywords.tier} WHEN 'pillar' THEN 0 WHEN 'cluster' THEN 1 ELSE 2 END`, desc(keywords.searchVolume), asc(keywords.keywordText)).limit(inp.limit);
        let rows: any[] = [];
        if (search) {
          const searchLike = `%${search}%`;
          const searchQ = db.select().from(keywords).where(and(
            ...where,
            like(keywords.keywordText, searchLike),
          )).orderBy(sql`CASE ${keywords.tier} WHEN 'pillar' THEN 0 WHEN 'cluster' THEN 1 ELSE 2 END`, desc(keywords.searchVolume), asc(keywords.keywordText)).limit(inp.limit) as any;
          rows = await searchQ;
        } else {
          rows = await baseQ as any;
        }
        // Derive cluster-parent relationship from clusters table for hierarchy
        const clusterRows = await db.select().from(clusters).where(projectIds.length ? inArray(clusters.projectId, projectIds) : undefined);
        const clustersById = new Map<number, any>();
        for (const c of clusterRows) clustersById.set(Number(c.id), c);
        return { ok: true, count: rows.length, keywords: rows, clusters: clusterRows, clustersById: Object.fromEntries(clustersById), projectIds, filters_applied: inp };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[keywords.listByProject] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  updateTier: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      tier: z.enum(CLUSTER_TYPE_ENUM),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select().from(keywords).where(eq(keywords.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: `Keyword ${input.id} not found.` });
      await assertProjectAccess(ctx, Number(existing.projectId), { minRole: 'member' }, TRPCError);
      try {
        const updated: any = await db.update(keywords).set({ tier: input.tier as any }).where(eq(keywords.id, input.id));
        return { ok: true, affected: Number(updated[0]?.affectedRows ?? updated.affectedRows ?? (updated as any)?.[0]?.affectedRows ?? 0), keyword: { ...existing, tier: input.tier } };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[keywords.updateTier] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  bulkUpdateTier: protectedProcedure
    .input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(500),
      tier: z.enum(CLUSTER_TYPE_ENUM),
    }))
    .mutation(async ({ ctx, input }) => {
      const sample = await db.select().from(keywords).where(eq(keywords.id, input.ids[0])).limit(1);
      if (!sample[0]) throw new TRPCError({ code: 'NOT_FOUND', message: `Keyword ${input.ids[0]} not found.` });
      await assertProjectAccess(ctx, Number(sample[0].projectId), { minRole: 'member' }, TRPCError);
      try {
        const updated: any = await db.update(keywords).set({ tier: input.tier as any }).where(inArray(keywords.id, input.ids));
        return { ok: true, affected: Number(updated[0]?.affectedRows ?? updated.affectedRows ?? (updated as any)?.[0]?.affectedRows ?? 0) };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[keywords.bulkUpdateTier] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const sample = await db.select().from(keywords).where(eq(keywords.id, input.ids[0])).limit(1);
      if (!sample[0]) throw new TRPCError({ code: 'NOT_FOUND', message: `Keyword ${input.ids[0]} not found.` });
      await assertProjectAccess(ctx, Number(sample[0].projectId), { minRole: 'member' }, TRPCError);
      try {
        const linked = await db.select({ id: articles.id }).from(articles).where(inArray(articles.keywordId as any, input.ids)).limit(1);
        if (linked.length > 0) throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot delete: ${linked.length}+ keywords referenced by articles. Delete articles first.` });
        const del: any = await db.delete(keywords).where(inArray(keywords.id, input.ids));
        return { ok: true, affected: Number(del[0]?.affectedRows ?? del.affectedRows ?? (del as any)?.[0]?.affectedRows ?? 0), deletedIds: input.ids };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[keywords.bulkDelete] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      patch: z.object({
        keywordText: z.string().min(1).max(KW_MAX).optional(),
        intent: z.enum(KW_INTENT_ARRAY).optional(),
        status: z.enum(KW_STATUS_ARRAY).optional(),
        tier: z.enum(CLUSTER_TYPE_ENUM).optional(),
        clusterId: z.number().int().nullish(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.patch.intent) assertValidIntent(input.patch.intent);
      const [existing] = await db.select().from(keywords).where(eq(keywords.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: `Keyword ${input.id} not found.` });
      await assertProjectAccess(ctx, Number(existing.projectId), { minRole: 'member' }, TRPCError);

      let resolvedTier = (input.patch.tier ?? existing.tier) as any;
      let resolvedClusterId = input.patch.clusterId === undefined ? existing.clusterId : input.patch.clusterId;
      let resolvedProjectId = Number(existing.projectId);

      if (input.patch.clusterId !== undefined) {
        const raw = input.patch.clusterId;
        const rawNorm = (raw === undefined) ? existing.clusterId : ((raw === 0 || raw === null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) ? 0 : Number(raw));
        const isUnassign = rawNorm === 0 || rawNorm === null || Number(rawNorm) <= 0;
        if (isUnassign) {
          const pid = Number(existing.projectId);
          let [markerCluster] = await db
            .select()
            .from(clusters)
            .where(and(eq(clusters.projectId, pid), eq(clusters.name, UNASSIGNED_CLUSTER_NAME)))
            .limit(1);
          if (!markerCluster) {
            try { await db.insert(clusters).values({ projectId: pid, name: UNASSIGNED_CLUSTER_NAME, type: 'supporting', parentId: null as any, createdAt: new Date() }); }
            catch (e) { /* ignore duplicate race */ }
            [markerCluster] = await db
              .select()
              .from(clusters)
              .where(and(eq(clusters.projectId, pid), eq(clusters.name, UNASSIGNED_CLUSTER_NAME)))
              .limit(1);
          }
          if (!markerCluster) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create unassigned marker cluster.' });
          resolvedClusterId = Number(markerCluster.id);
          resolvedProjectId = Number(markerCluster.projectId);
          resolvedTier = markerCluster.type as any;
        } else {
          const [destCluster] = await db.select().from(clusters).where(eq(clusters.id, Number(input.patch.clusterId))).limit(1);
          if (!destCluster) throw new TRPCError({ code: 'NOT_FOUND', message: `Destination cluster ${input.patch.clusterId} not found.` });
          await assertProjectAccess(ctx, Number(destCluster.projectId), { minRole: 'member' }, TRPCError);
          resolvedClusterId = Number(destCluster.id);
          resolvedProjectId = Number(destCluster.projectId);
          resolvedTier = destCluster.type as any;
        }
      }

      try {
        const patch: any = {};
        if ('keywordText' in input.patch) patch.keywordText = input.patch.keywordText;
        if ('intent' in input.patch) patch.intentSuggestion = input.patch.intent as any;
        if ('status' in input.patch) patch.status = input.patch.status as any;
        if ('tier' in input.patch && input.patch.clusterId === undefined) patch.tier = input.patch.tier as any;
        if ('clusterId' in input.patch) {
          patch.clusterId = resolvedClusterId as any;
          patch.projectId = resolvedProjectId;
          patch.tier = resolvedTier;
        }
        if (Object.keys(patch).length === 0) return { ok: true, affected: 0 };
        const updated: any = await db.update(keywords).set(patch).where(eq(keywords.id, input.id));
        return { ok: true, affected: Number(updated[0]?.affectedRows ?? updated.affectedRows ?? (updated as any)?.[0]?.affectedRows ?? 0) };
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/duplicate/i.test(msg) && /uk_keywords_project_text|keyword_project/i.test(msg)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Duplicate keyword in project.` });
        }
        if (!(e instanceof TRPCError)) console.warn('[keywords.update] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg.slice(0, 200) });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select().from(keywords).where(eq(keywords.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: `Keyword ${input.id} not found.` });
      await assertProjectAccess(ctx, Number(existing.projectId), { minRole: 'member' }, TRPCError);
      try {
        // Refuse if articles reference this keyword_id (SA referential integrity)
        const linked = await db
          .select({ id: articles.id })
          .from(articles)
          .where(eq(articles.keywordId as any, Number(existing.id)))
          .limit(1);
        if (linked.length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot delete keyword ${input.id}: referenced by ${linked.length}+ article(s).` });
        }
        const del: any = await db.delete(keywords).where(eq(keywords.id, input.id));
        return { ok: true, affected: 1, deletedKeywordId: input.id };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[keywords.delete] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  bulkCreate: protectedProcedure
    .input(z.object({
      clusterId: z.number().int().positive(),
      keywordsText: z.string().min(1).max(1_000_000), // 1 MB cap
      intentDefault: z.enum(KW_INTENT_ARRAY).default('informational'),
    }))
    .mutation(async ({ ctx, input }) => {
      assertValidIntent(input.intentDefault);
      const [clusterRow] = await db.select().from(clusters).where(eq(clusters.id, input.clusterId)).limit(1);
      if (!clusterRow) throw new TRPCError({ code: 'NOT_FOUND', message: `Cluster ${input.clusterId} not found.` });
      await assertProjectAccess(ctx, Number(clusterRow.projectId), { minRole: 'member' }, TRPCError);

      const projects = await import('../../db/schema.js').then(m => m.projects);
      const [proj] = await db
        .select({ id: projects.id, categoryId: projects.categoryId })
        .from(projects)
        .where(eq(projects.id, Number(clusterRow.projectId)))
        .limit(1);
      if (!proj) throw new TRPCError({ code: 'NOT_FOUND', message: `Project for cluster not found.` });

      const rawLines = input.keywordsText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (rawLines.length === 0) return { ok: true, added: 0, skipped: 0, total: 0 };
      let added = 0, skipped = 0;
      try {
        for (const line of rawLines) {
          if (line.length > KW_MAX) { skipped += 1; continue; }
          try {
            await db.insert(keywords).values({
              clusterId: input.clusterId,
              projectId: proj.id,
              categoryId: Number(proj.categoryId ?? 0),
              keywordText: line,
              tier: clusterRow.type as any,
              intentSuggestion: input.intentDefault as any,
              status: 'pending' as any,
            });
            added += 1;
          } catch (_e: any) {
            // ignore duplicates; keep processing the rest
            const m = String(_e?.message ?? _e);
            if (/duplicate/i.test(m)) { skipped += 1; continue; }
            throw _e;
          }
        }
        return { ok: true, added, skipped, total: added + skipped, intentDefault: input.intentDefault };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[keywords.bulkCreate] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  listByCluster: protectedProcedure
    .input(z.object({ clusterId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [clusterRow] = await db.select().from(clusters).where(eq(clusters.id, input.clusterId)).limit(1);
      if (!clusterRow) throw new TRPCError({ code: 'NOT_FOUND', message: `Cluster ${input.clusterId} not found.` });
      await assertProjectAccess(ctx, Number(clusterRow.projectId), { minRole: 'member' }, TRPCError);
      try {
        const rows = await db
          .select()
          .from(keywords)
          .where(eq(keywords.clusterId, input.clusterId))
          .orderBy(asc(keywords.keywordText), asc(keywords.id));
        return { ok: true, count: rows.length, keywords: rows };
      } catch (e: any) {
        if (!(e instanceof TRPCError)) console.warn('[keywords.listByCluster] DB error:', e?.message?.slice(0, 150));
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  enrichSerp: protectedProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      keywordIds: z.array(z.number().int().positive()).max(100).optional(),
      keywordsTexts: z.array(z.string().min(1).max(KW_MAX)).max(50).optional(),
      clusterId: z.number().int().positive().optional(),
    }).refine(obj => obj.keywordIds?.length || obj.keywordsTexts?.length || obj.clusterId, {
      message: 'At least one of keywordIds, keywordsTexts, clusterId must be provided.',
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'member' }, TRPCError);
      const traceId = crypto.randomUUID();
      try {
        const [proj] = await db.select({ id: projectsTable.id, categoryId: projectsTable.categoryId }).from(projectsTable).where(eq(projectsTable.id, input.projectId)).limit(1);
        if (!proj || !proj.categoryId) throw new TRPCError({ code: 'NOT_FOUND', message: `Project ${input.projectId} not found.` });
        const kwTexts: string[] = [];
        const existingRows: any[] = [];
        if (input.clusterId) {
          const clusterKws = await db.select().from(keywords).where(eq(keywords.clusterId, input.clusterId));
          for (const k of clusterKws) kwTexts.push(k.keywordText), existingRows.push(k);
        }
        if (input.keywordIds?.length) {
          const byIds = await db.select().from(keywords).where(inArray(keywords.id, input.keywordIds));
          for (const k of byIds) kwTexts.push(k.keywordText), existingRows.push(k);
        }
        if (input.keywordsTexts?.length) {
          for (const t of input.keywordsTexts) kwTexts.push(t.trim());
        }
        const uniqueTexts = Array.from(new Set(kwTexts.filter(Boolean))).slice(0, 50);
        if (uniqueTexts.length === 0) return { ok: true, enriched_count: 0, avg_search_volume: 0, traceId, errors: [] };
        const markerClusterId = await getOrCreateMarkerCluster(input.projectId);
        const serp = await SerpService.forContext(ctx);
        const results: EnrichResult[] = await serp.enrichBatch(uniqueTexts);
        let enrichedCount = 0;
        let sumSv = 0;
        const errors: { keyword: string; code: string; msg?: string }[] = [];
        // Build map existing rows by keywordText
        const existingByText = new Map(existingRows.map(r => [String(r.keywordText).trim(), r]));
        for (const r of results) {
          if (r.error) { errors.push({ keyword: r.keyword, code: 'ENRICH_ERR', msg: r.error }); continue; }
          const existing = existingByText.get(r.keyword);
          const patch = {
            searchVolume: r.searchVolume,
            difficulty: r.difficulty,
            intentSuggestion: r.intent as any,
          };
          if (existing && existing.id) {
            await db.update(keywords).set(patch).where(eq(keywords.id, Number(existing.id)));
            enrichedCount++;
          } else {
            // Insert new unassigned → FK-safe marker cluster
            try {
              await db.insert(keywords).values({
                projectId: input.projectId,
                clusterId: markerClusterId,
                categoryId: Number(proj.categoryId),
                keywordText: r.keyword,
                tier: 'supporting',
                status: 'pending',
                ...patch,
              });
              enrichedCount++;
            } catch (dup: any) {
              const m = String(dup?.message ?? dup);
              if (/duplicate/i.test(m) && /uk_keywords_project_text/.test(m)) {
                // Update matching row (already existing case not in list input)
                await db.update(keywords).set(patch).where(and(eq(keywords.projectId, input.projectId), eq(keywords.keywordText, r.keyword)));
                enrichedCount++;
              } else {
                errors.push({ keyword: r.keyword, code: 'INSERT_ERR', msg: m.slice(0, 120) });
              }
            }
          }
          if (typeof r.searchVolume === 'number') sumSv += r.searchVolume;
        }
        return {
          ok: enrichedCount > 0 || errors.length === 0,
          traceId,
          enriched_count: enrichedCount,
          avg_search_volume: enrichedCount ? Math.round(sumSv / enrichedCount) : 0,
          new_metric_source: results.find(r => !r.error)?.provider ?? null,
          errors,
          total_input: results.length,
          error_rate_pct: Math.round((errors.length / Math.max(1, results.length)) * 100),
        };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        console.warn('[keywords.enrichSerp] DB error:', e?.message?.slice(0, 150));
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `[trace ${traceId}] ${String(e?.message ?? e).slice(0, 200)}`, cause: { traceId, retryable: true } as any });
      }
    }),

  aiClusterize: protectedProcedure
    .input(z.object({
      projectId: z.preprocess(v => Number(String(v ?? '0')), z.number().int().positive()),
      keywordIds: z.preprocess(v => {
        if (v === undefined || v === null || v === '') return undefined;
        if (!Array.isArray(v)) return [Number(v)].filter(n => Number.isFinite(n) && n > 0);
        return v.map(x => Number(String(x ?? '0'))).filter(n => Number.isFinite(n) && n > 0);
      }, z.array(z.number().int().positive()).max(500).optional()),
      targetClusters: z.preprocess(v => { const n = Number(String(v ?? '0')); return Number.isFinite(n) && n > 0 ? n : 30; }, z.number().int().min(3).max(120).default(30)),
      longtailCount: z.preprocess(v => { const n = Number(String(v ?? '0')); return Number.isFinite(n) && n > 0 ? n : 5; }, z.number().int().min(1).max(20).default(5)),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'member' }, TRPCError);
      const traceId = crypto.randomUUID();
      try {
        const [proj] = await db
          .select({ id: projectsTable.id, categoryId: projectsTable.categoryId })
          .from(projectsTable)
          .where(eq(projectsTable.id, input.projectId)).limit(1);
        if (!proj) throw new TRPCError({ code: 'NOT_FOUND', message: `Project ${input.projectId} not found.` });
        const catRow: { id: number; isYmyl: boolean | number | null; name: string } | undefined = (
          await db
            .select({ id: categoriesTable.id, isYmyl: categoriesTable.isYmyl, name: categoriesTable.name })
            .from(categoriesTable)
            .where(eq(categoriesTable.id, Number(proj.categoryId)))
            .limit(1)
        )[0] as any;
        const cat = catRow ? { ...catRow, isYmyl: !!catRow.isYmyl } : undefined;
        // Resolve candidate keywords
        let kwRows: any[];
        if (input.keywordIds?.length) {
          kwRows = await db.select().from(keywords).where(and(eq(keywords.projectId, input.projectId), inArray(keywords.id, input.keywordIds))).limit(500);
        } else {
          const markerClusterId = await getOrCreateMarkerCluster(input.projectId);
          kwRows = await db.select().from(keywords).where(and(eq(keywords.projectId, input.projectId), eq(keywords.clusterId, markerClusterId))).orderBy(desc(keywords.searchVolume)).limit(300);
        }
        kwRows = kwRows.slice(0, 300);
        const N_KW = kwRows.length;
        const autoScaleClusters = N_KW <= 30
          ? Math.max(2, Math.min(Math.ceil(N_KW / 3), 12))
          : Number(input.targetClusters) || 30;
        const userRequestedTarget = Math.max(3, Number(input.targetClusters) || 30);
        const targetTotal = Math.min(autoScaleClusters, userRequestedTarget, 120);
        // ─── 3-TIER DISTRIBUTION (1:1 MATCH OLD SYSTEM keywordClusters.ts L220-222) ───
        // OLD: Pillar 15% / Cluster 65% / Supporting 20% (CLUSTER ส่วนใหญ่ — ไม่ใช่ Supporting!)
        // OLD: ทุก cluster ทุก tier มี keywords ของตัวเองโดยตรง (ไม่เก็บไว้ที่ลูกแล้วมานับ)
        const pillarTarget = Math.max(1, Math.ceil(targetTotal * 0.15));
        const clusterTarget = Math.max(pillarTarget + 1, Math.round(targetTotal * 0.65));
        const supportingTarget = Math.max(0, targetTotal - pillarTarget - clusterTarget);
        // ═══════════════════════════════════════════════════════════════════
        // PRE-CLUSTER RESET (CRITICAL P0 — ไม่ให้ทับซ้อนรอบเก่า)
        // User กด AI จัดกลุ่มซ้ำ = เคลียร์โครงสร้างเดิมทั้งหมด clean slate ก่อนรัน LLM รอบใหม่
        // 1) Move ALL project keywords กลับไป 📋 ยังไม่ได้จัดกลุ่ม (System) marker
        // 2) DELETE old clusters ทั้งหมด ยกเว้น marker cluster (clean slate ไม่ทับซ้อน)
        // ═══════════════════════════════════════════════════════════════════
        try {
          const markerClusterId = await getOrCreateMarkerCluster(input.projectId);
          // Step 1: Move all keywords in project back to marker
          // 🟢 AUDIT KCP FIX: Preserve keyword.tier on AI re-cluster reset flow.
          // Before: every keyword's tier was force-reset to 'supporting' on every
          // AI Clusterize re-run. This destroyed pillar tier flags that users had
          // carefully set on strategic keywords (e.g. via Planner inline edits).
          // After: only clusterId is re-pointed to the marker. Tier + intent +
          // metrics (SV/difficulty/CPC) on each keyword row survive intact, and
          // the new 2-way tier<->cluster sync block later in this procedure will
          // re-sync tier only for keywords actually assigned to a new cluster.
          await db.update(keywords).set({
            clusterId: markerClusterId,
          }).where(eq(keywords.projectId, input.projectId));
          // Step 2: Delete old non-marker clusters (จะ delete ได้แล้ว เพราะ keywords ทั้งหมดย้ายกลับไป marker ไม่มี FK อ้างอิง)
          const oldC = await db.select({ id: clusters.id }).from(clusters).where(and(eq(clusters.projectId, input.projectId), ne(clusters.id as any, markerClusterId)));
          const safeIds = oldC.map(r => Number((r as any).id)).filter(n => n > 0 && n !== markerClusterId);
          if (safeIds.length > 0) {
            await db.delete(clusters).where(inArray(clusters.id as any, safeIds));
          }
        } catch (_resetErr) { /* best-effort — ถ้าเกิด FK (บาง article ผูกอยู่) ก็ข้ามไป ไม่ให้ break LLM flow */ }
        // FIX H1: NO throw BAD_REQUEST on empty. Return clean 200 OK with user-friendly zero flag.
        if (kwRows.length === 0) {
          return {
            ok: true,
            traceId,
            disclaimer_required: false,
            pillar_count: 0, cluster_count: 0, supporting_count: 0,
            assigned_keywords: 0, total_input_keywords: 0,
            unassigned_keywords_not_in_response: [],
            zero_rows: true,
            reason_code: input.keywordIds?.length ? 'SELECTED_KEYWORDS_NOT_FOUND' : 'NO_UNASSIGNED_KEYWORDS_LEFT',
          };
        }
        const llm = await LlmService.forContext(ctx);
        const clusterSchema = z.object({
          disclaimer_required: z.boolean().default(false),
          clusters: z.array(z.object({
            name: z.string().min(2).max(255),
            type: z.enum(CLUSTER_TYPES as unknown as [string, ...string[]]),
            parent_cluster_name: z.string().min(2).max(255).nullable().optional().or(z.literal('')),
            // BUG FIX: LLM ตอบกลับ 2 แบบ — flat string["kw1","kw2"] OR objects[{keyword_text,intent}] — รองรับทั้ง 2 union (ไม่ throw parse error)
            keywords: z.union([
              z.array(z.string().min(1).max(KW_MAX)),
              z.array(z.object({
                keyword_text: z.string(),
                intent: z.enum(KEYWORD_INTENTS as unknown as [string, ...string[]]).default('informational'),
              })),
            ]).default([]),
          })),
        });
        const YMYL_NOTE = cat?.isYmyl ? `\n\nCRITICAL [YMYL CATEGORY ${cat.name}]: You MUST set disclaimer_required=true. You MUST have a disclaimer/warning pillar cluster. Gambling/fintech/health disclaimers REQUIRED.\n` : '';
        const WANT_LONGS = Math.max(1, Number(input.longtailCount) || 5);
        const tierTargetNote = `\nTARGET OUTPUT SCALE (FOLLOW THIS EXACTLY — 1:1 MATCH OLD SYSTEM keywordClusters.ts L220-222):\n- TOTAL 3-TIER CLUSTERS TARGET: AIM FOR CLOSE TO ${targetTotal} clusters (pillar+cluster+supporting COMBINED, acceptable range: ${Math.max(3, targetTotal-5)} to ${targetTotal+10}).\n- Pillar (top-level broad topics): TARGET approx ${pillarTarget} pillars (range ${Math.max(1, pillarTarget-1)} to ${pillarTarget+3}).\n- Cluster (mid-level, per pillar): TARGET approx ${clusterTarget} total clusters (65% OF ALL CLUSTERS — LARGEST GROUP). ~${Math.round(clusterTarget / Math.max(1, pillarTarget))}-${Math.round(clusterTarget / Math.max(1, pillarTarget))+2} clusters PER pillar.\n- Supporting (long-tail, per cluster): TARGET approx ${supportingTarget} total supporting clusters ONLY (~20%).\nOLD-SYSTEM KEYWORD ASSIGNMENT RULE (MANDATORY 100% — TREE VIEW FIX):\n- EVERY CLUSTER (pillar, cluster, AND supporting) MUST have THEIR OWN DIRECT keywords[] entries. DO NOT put all/most keywords only in supporting clusters leaving pillar/cluster keywords=[] — user calls this bug "expand 0 rows, shows only 9 of 45".\n- DISTRIBUTE PROPORTIONALLY: ~15% total keywords DIRECT in pillars, ~65% DIRECT in clusters, ~20% DIRECT in supporting. Each group (pillar/cluster/supporting) MIN 1 DIRECT keyword entry.\nNEW RULE 7 (CRITICAL — 100%): EVERY cluster in output.clusters[] (pillar, cluster, supporting) MUST have a keywords[] array containing AT LEAST 1 keyword_text entry. DO NOT CREATE EMPTY clusters with keywords=[]. If target count cannot be filled with real groups, output FEWER clusters rather than outputting empty ones.\nNEW RULE 7B (CRITICAL — USER QA HARD FAIL): Pillar and Cluster tiers MUST have DIRECT keywords (never empty). You will FAIL QA if pillars/clusters have 0 DIRECT keywords because user expand → 0 rows.\nNEW RULE 8 (CRITICAL — DUPLICATE AVOID): Do NOT repeat the same keyword_text across different clusters. All keywords across ALL clusters MUST be unique strings.\nNEW RULE 9 (SCALE MATCH INPUT): You have ${N_KW} input keywords. Your total clusters count should be PROPORTIONAL to input size. For small inputs (<=20 words): output FEWER, DISTINCT groups (around 1 pillar, 2-3 clusters, 3-5 supporting max). Do NOT create more clusters than (input_keywords_count / 2).`;
        const system = `You are an SEO/Thai keyword clustering expert specializing in Thai language. STRICT JSON OUTPUT ONLY. No markdown, no fences. ${YMYL_NOTE}${tierTargetNote}\nRules:\n1. Create 3-tier tree: pillar (broad top-level), cluster (mid-level per pillar), supporting (long-tail per cluster). Every input keyword MUST be assigned 100%. Parent refs: pillars have parent_cluster_name null/empty. Clusters parent = pillar name. Supporting parent = cluster name. Output all 3 tiers in output.clusters[] flat array with types + parent refs so backend can build tree.\n2. tier.type ∈ ["pillar","cluster","supporting"]. Create clusters array with ALL tiers (pillar rows, cluster rows, supporting rows each as their own object in output.clusters with their own keywords array assigned to that group).\n3. Assign intent ∈ [informational,transactional,commercial,navigational] for each keyword.\n4. Cluster names should be THAI where keyword language is Thai. Make each cluster group distinct around a sub-topic, not a copy of broad keyword.\n5. If category YMYL flag: disclaimer_required=true, output at least 1 pillar about risks/warnings/disclaimers counted toward your pillar target.\n6. If you have more input keywords than target cluster slots, MERGE synonyms and very-close phrases into one cluster (each cluster.keywords[] array can contain MULTIPLE matching keywords — that is how you exceed 1:1 ratio). Do NOT leave keywords unassigned.`;
        const kwList = kwRows.map(k => `- ${k.keywordText}${typeof k.searchVolume === 'number' ? ` (sv ${k.searchVolume})` : ''}`).join('\n');
        const user = `CATEGORY: ${cat?.name ?? 'General'}\nUSER REQUESTED TOTAL 3-TIER CLUSTERS: ${targetTotal} (pillar ~${pillarTarget}, cluster ~${clusterTarget}, supporting ~${supportingTarget}, longtail/cluster ~${Number(input.longtailCount) || 5}).\nKEYWORDS INPUT (${kwRows.length} words — assign 100%):\n${kwList}`;
        const ATTEMPTS_SAFE = 2;
        let parsed: any = null;
        let lastParseErr: any = null;
        for (let at = 0; at < ATTEMPTS_SAFE; at++) {
          try {
            const tokBoost = 1 + (0.20 * at);
            const maxT = Math.round(8192 * tokBoost);
            parsed = await llm.chatStructured(system, user, clusterSchema, { maxTokens: maxT, temperature: at === 0 ? 0.1 : 0.0, model: undefined });
            if (parsed && Array.isArray((parsed as any).clusters) && (parsed as any).clusters.length > 0) break;
          } catch (parseErr: any) {
            lastParseErr = parseErr;
            // partial recovery: try to salvage raw JSON from error message (sometimes contains Head: {...})
            const m = /Head:\s*(\{[\s\S]*?)(\||$)/.exec(String(parseErr?.message ?? ''));
            if (m && m[1]) {
              try {
                const cand = JSON.parse(m[1].trim());
                if (cand && Array.isArray(cand.clusters) && cand.clusters.length > 0) { parsed = cand; break; }
              } catch {}
            }
          }
        }
        // FINAL RECOVERY: if chatStructured threw 2 times despite repair -> NOT THROW partial!
        if (!parsed || !Array.isArray((parsed as any)?.clusters)) {
          // Heuristic fallback: pillar 15% / cluster 65% / supporting 20% ratio (per North Star old SEO E design)
          const targetPillar = Math.max(1, Math.round(kwRows.length * 0.15));
          const mkHeuristic = (text: string): any => {
            const lo = text.toLowerCase();
            if (/(สมัคร|สั่ง|จอง|จ่าย|ฝาก|ถอน|ซื้อ|ลงทะเบียน)/.test(lo)) return 'transactional';
            if ((/ดีที่สุด|อันดับ|เปรียบเทียบ|รีวิว|ดีกว่า|vs|แนะนำ|ตรงไหน|ไหนดี|ยี่ห้อไหน|ราคาถูก|ราคา|โปร|โค้ด/).test(lo)) return 'commercial';
            if (/(login|เข้าสู่ระบบ|หน้าแรก|ติดต่อ|facebook|ไลน์|line|ล็อกอิน)/.test(lo)) return 'navigational';
            return 'informational';
          };
          // Build clusters by prefix first words (2-4 words) — simple synonym bucket
          const buckets = new Map<string, any[]>();
          for (const kw of kwRows) {
            const words = String(kw.keywordText || '').split(/\s+/).filter(Boolean).slice(0, 3).join(' ').toLowerCase() || String(kw.keywordText || '').toLowerCase();
            if (!buckets.has(words)) buckets.set(words, []);
            buckets.get(words)!.push(kw);
          }
          let bucketList = [...buckets.entries()].sort((a,b)=>b[1].length - a[1].length);
          const wantPillars = Math.max(1, Math.min(targetPillar, bucketList.length || 1));
          const pillars = bucketList.slice(0, wantPillars);
          const clustersBucket = bucketList.slice(wantPillars, wantPillars + Math.max(1, Math.round(kwRows.length * 0.55)));
          const supportingRem = bucketList.slice(wantPillars + clustersBucket.length);
          const synth: any[] = [];
          let pillarNames: string[] = pillars.map(p => p[0] || 'หลัก');
          if (pillarNames.length === 0) pillarNames = ['หลัก'];
          for (let i = 0; i < pillarNames.length; i++) {
            const name = pillarNames[i] || `Pillar ${i+1}`;
            synth.push({ name, type: 'pillar', parent_cluster_name: null, keywords: (pillars[i]?.[1] ?? []).map(r => ({ keyword_text: r.keywordText, intent: mkHeuristic(r.keywordText) })) });
          }
          for (let i = 0; i < clustersBucket.length; i++) {
            const [name, rows] = clustersBucket[i];
            const attachPillar = pillarNames[i % pillarNames.length];
            synth.push({ name: name || `Cluster ${i+1}`, type: 'cluster', parent_cluster_name: attachPillar, keywords: (rows||[]).map(r => ({ keyword_text: r.keywordText, intent: mkHeuristic(r.keywordText) })) });
          }
          let sIdx = 0;
          for (const [name, rows] of supportingRem) {
            const attachCluster = clustersBucket.length > 0 ? (clustersBucket[sIdx % clustersBucket.length]?.[0] || '') : pillarNames[0];
            sIdx++;
            synth.push({ name: name || `Supporting ${sIdx}`, type: 'supporting', parent_cluster_name: attachCluster, keywords: (rows||[]).map(r => ({ keyword_text: r.keywordText, intent: mkHeuristic(r.keywordText) })) });
          }
          // Distribute remaining unbucketed keywords evenly
          const alreadyCovered = new Set(synth.flatMap(c => (c.keywords||[]).map((k:any)=>String(k.keyword_text).trim().toLowerCase())));
          const remain = kwRows.filter(r => !alreadyCovered.has(String(r.keywordText || '').trim().toLowerCase()));
          let cursor = 0;
          for (const r of remain) {
            if (synth.length === 0) break;
            const target = synth[cursor % synth.length]; cursor++;
            target.keywords.push({ keyword_text: r.keywordText, intent: mkHeuristic(r.keywordText) });
          }
          parsed = parsed || { disclaimer_required: !!cat?.isYmyl || false, clusters: [] };
          if (!Array.isArray(parsed.clusters) || parsed.clusters.length === 0) parsed = { disclaimer_required: parsed.disclaimer_required || !!cat?.isYmyl, clusters: synth };
          if (parsed.clusters.length === 0) parsed = { disclaimer_required: !!cat?.isYmyl, clusters: synth };
          // Mark that we used heuristic fallback — FE can show warning banner
          (parsed as any).__heuristicFallback = true;
        }
        // Map name -> keywords (each keyword in output should match input text)
        const inputKwsLower = new Map<string, any>(kwRows.map(r => [String(r.keywordText).trim().toLowerCase(), r]));
        const clusterSpecRaw = Array.isArray(parsed.clusters) ? parsed.clusters : [];
        // BUG FIX NORMALIZE: Union schema อาจจะเป็น string[] หรือ objects[] — transform ทุกอันเป็น objects[] shape เดียวกันก่อนเข้า loop ไม่งั้น kw.keyword_text undefined → assigned หาย 8 คำ
        const normalizeKw = (k: any): { keyword_text: string; intent: KeywordIntent } => {
          if (typeof k === 'string') {
            return { keyword_text: String(k).trim(), intent: detectIntentFromText(String(k)) };
          }
          if (k && typeof k === 'object') {
            const text = String(k.keyword_text ?? k.text ?? k.keyword ?? k.term ?? '').trim();
            const rawIntent = String(k.intent ?? k.type ?? '').trim().toLowerCase();
            const intentOk = ((KEYWORD_INTENTS as unknown as string[]).includes(rawIntent)) ? rawIntent : detectIntentFromText(text);
            return { keyword_text: text, intent: intentOk as KeywordIntent };
          }
          return { keyword_text: '', intent: 'informational' };
        };
        const clusterSpec: any[] = clusterSpecRaw.map((c: any) => {
          const listRaw = Array.isArray(c?.keywords) ? c.keywords : [];
          return { ...c, keywords: listRaw.map((k: any) => normalizeKw(k)).filter((k: any) => k.keyword_text.length > 0) };
        });
        const devFallback = !!(parsed as any).__heuristicFallback || !!lastParseErr;
        void devFallback;
        // Insert pillars first -> get ids -> clusters -> supporting with parent refs
        const pillarByName = new Map<string, number>();
        let pillarCount = 0, clusterCount = 0, supportingCount = 0;
        let assignedCount = 0;
        let newlyInsertedKwCount = 0;
        const notAssigned: string[] = [];
        const insertedNameToId = new Map<string, number>();
        const upsertKwInDb = async (keywordText: string, intent: string, clusterId: number, tier: string) => {
          // BUG FIX: guard null/undefined — ไม่ให้ .trim() TypeError
          const t = String(keywordText ?? '').trim();
          if (!t) return false;
          const lower = t.toLowerCase();
          const existingRow = inputKwsLower.get(lower);
          const intentEnum = INTENTS.includes(intent as any) ? (intent as any) : null;
          if (existingRow) {
            await db.update(keywords).set({
              clusterId: Number(clusterId),
              tier: tier as any,
              ...(intentEnum ? { intentSuggestion: intentEnum } : {}),
            }).where(eq(keywords.id, Number(existingRow.id)));
            assignedCount++;
            // เก็บว่าคำ input นี้ถูก assign แล้ว → Post-Guard จะไม่นับซ้ำ
            (existingRow as any).__assigned = true;
            return true;
          }
          // NEW BRANCH: คำที่ LLM Generate ใหม่ (longtail/lsi จาก target longtailCount) = INSERT NEW ROW ไม่ใช่ notAssigned
          try {
            const categoryId = Number(proj?.categoryId ?? 0) || null;
            const source: any = 'ai_generated_lsi';
            const detectIntent = (s: string): any => {
              const i = s.toLowerCase();
              if (/(สมัคร|ใช้งาน|ซื้อ|จอง|จ่าย|สั่ง|ฝาก|ถอน|ลงทะเบียน|สมัครสมาชิก)/.test(i)) return 'transactional';
              if ((/ดีที่สุด|อันดับ|เปรียบเทียบ|รีวิว|ดีกว่า|vs|แนะนำ|ตรงไหน|ไหนดี|เว็บไหน|ยี่ห้อไหน/).test(i)) return 'commercial';
              if (/(เข้าสู่ระบบ|login|หน้าแรก|ช่องทางการติดต่อ|ติดต่อ|facebook|ไลน์|line)/.test(i)) return 'navigational';
              return 'informational';
            };
            const finalIntent = intentEnum || detectIntent(t);
            const res = await db.insert(keywords).values({
              projectId: input.projectId,
              keywordText: t,
              tier: tier as any,
              intentSuggestion: finalIntent,
              clusterId: Number(clusterId),
              categoryId: categoryId as any,
              keywordSource: source,
            } as any);
            const newId = getInsertId(res);
            if (Number(newId) > 0) {
              newlyInsertedKwCount++;
              assignedCount++;
              inputKwsLower.set(lower, { id: newId, keywordText: t, tier, intentSuggestion: finalIntent, clusterId, __assigned: true });
              return true;
            }
          } catch (_newKwErr) {
            // ignore duplicate insert (unique) but count it
          }
          notAssigned.push(t);
          return false;
        };
        // ─── HELPER: FILL FALLBACK LONGTAILS (ถ้า LLM ขาดไปให้สร้างเองด้วย suffix set) ───
        const LONGTAIL_SUFFIXES = [
          'วิธี', 'ทำไม', 'คืออะไร', 'อย่างไร', 'ดีที่สุด', '2026', '2569', 'สูตร', 'แนะนำ', 'ตรงไหน',
          'ไหนดี', 'ยี่ห้อไหน', 'ฟรี', 'ไม่ใช้เงิน', 'ล่าสุด', 'ใหม่ล่าสุด', 'วันนี้', 'พรุ่งนี้', 'อัปเดตล่าสุด',
          'เปรียบเทียบ', 'vs', 'รีวิว', 'แบบไหน', 'กี่บาท', 'ราคาล่าสุด', 'โปรโมชั่น', 'โค้ดส่วนลด', 'สอนวิธี',
          'แรกสุดในไทย', 'เชื่อถือได้', 'ถูกกฎหมาย', 'ที่คนเล่นเยอะที่สุด', 'สำหรับมือใหม่', 'ขั้นตอน',
          '3 เทคนิค', '5 เคล็ดลับ', '10 วิธี', 'ทีเด็ด', 'แม่นๆ', 'ไม่ผิดหวัง', 'สุดยอด'
        ];
        const tierOfCluster = (name: string, t: string) => t;
        const fillFallbackLongtails = (c: any) => {
          const wantPerCluster = Math.max(1, Number(input.longtailCount) || 5);
          const list = Array.isArray(c.keywords) ? [...c.keywords] : [];
          const existing = new Set(list.map(k => String(k.keyword_text || '').trim().toLowerCase()));
          let safety = 0;
          while (list.length < wantPerCluster && safety < 120) {
            safety++;
            const s1 = LONGTAIL_SUFFIXES[(list.length * 7 + safety) % LONGTAIL_SUFFIXES.length];
            const s2 = LONGTAIL_SUFFIXES[(list.length * 3 + safety * 5 + 13) % LONGTAIL_SUFFIXES.length];
            let kw = `${s1} ${c.name} ${s2}`.trim();
            if (kw.length > 120) kw = kw.slice(0, 120);
            const low = kw.toLowerCase();
            if (existing.has(low)) continue;
            const intent: any = (list[list.length - 1]?.intent) ||
              (/(สมัคร|สั่ง|จอง)/.test(low) ? 'transactional'
              : /(ดีที่สุด|แนะนำ|รีวิว|ไหนดี|ตรงไหน)/.test(low) ? 'commercial'
              : /(login|หน้าแรก|ติดต่อ)/.test(low) ? 'navigational'
              : 'informational');
            list.push({ keyword_text: kw, intent });
            existing.add(low);
          }
          return list;
        };
        const insertCluster = async (name: string, type: string, parentId: number|null): Promise<number> => {
          const trimmed = String(name || '').trim();
          if (!trimmed) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cluster name cannot be empty.' });
          const [existing] = await db.select().from(clusters).where(and(eq(clusters.projectId, input.projectId), eq(clusters.name, trimmed))).limit(1);
          if (existing) {
            const needPatch = (
              (existing.type !== type) ||
              (Number(existing.parentId || 0) !== Number(parentId || 0))
            );
            if (needPatch) {
              await db.update(clusters).set({
                type: type as any,
                parentId: (parentId ?? null) as any,
              }).where(eq(clusters.id, existing.id));
            }
            insertedNameToId.set(trimmed, existing.id);
            return existing.id;
          }
          const res = await db.insert(clusters).values({ projectId: input.projectId, name: trimmed, type: type as any, parentId: (parentId ?? null) as any });
          const id = getInsertId(res);
          insertedNameToId.set(trimmed, id);
          return id;
        };
        // P0: Cleanup orphan clusters (0 keywords inside) from previous runs BEFORE new insert (prevents size balloon)
        try {
          const markerClusterId = await getOrCreateMarkerCluster(input.projectId);
          const orphanRows = await db
            .select({ id: clusters.id })
            .from(clusters)
            .leftJoin(keywords, eq(keywords.clusterId as any, clusters.id))
            .where(and(eq(clusters.projectId, input.projectId), ne(clusters.id as any, markerClusterId)))
            .groupBy(clusters.id)
            .having(sql`COUNT(${keywords.id}) = 0`);
          const safe = orphanRows
            .map((r: any) => Number(r.id))
            .filter((n: number) => n > 0 && n !== markerClusterId);
          if (safe.length > 0) {
            await db.delete(clusters).where(inArray(clusters.id as any, safe));
          }
        } catch (_orphanErr) { /* best-effort only — do not break LLM if cleanup fails */ }
        // P0: Tier/Cluster 2-way sync: For any existing cluster rows in project, sync keyword.tier = cluster.type (prevents mismatches)
        try {
          const allCs: any[] = await db.select({ id: clusters.id, type: clusters.type }).from(clusters).where(eq(clusters.projectId, input.projectId));
          for (const c of allCs) {
            const t = (c.type || 'cluster') as any;
            await db.update(keywords).set({ tier: t }).where(and(eq(keywords.projectId, input.projectId), eq(keywords.clusterId as any, Number(c.id)), ne(keywords.tier as any, t)));
          }
        } catch (_syncErr) { /* best-effort — no break */ }
        for (const c of clusterSpec) {
          if (c.type === 'pillar') {
            const id = await insertCluster(c.name, 'pillar', null);
            pillarByName.set(c.name, id);
            insertedNameToId.set(c.name, id);
            pillarCount++;
            c.keywords = fillFallbackLongtails(c);
            for (const kw of c.keywords ?? []) {
              await upsertKwInDb(kw.keyword_text, kw.intent, id, 'pillar');
            }
          }
        }
        for (const c of clusterSpec) {
          if (c.type === 'cluster') {
            const parentName = (c.parent_cluster_name as string) || '';
            let parentId = pillarByName.get(parentName) ?? null;
            if (!parentId && parentName) {
              // Create missing pillar on demand (LLM might not have output as separate)
              const newPillarId = await insertCluster(parentName, 'pillar', null);
              pillarByName.set(parentName, newPillarId);
              parentId = newPillarId;
              pillarCount++;
            }
            const cid = await insertCluster(c.name, 'cluster', parentId);
            clusterCount++;
            c.keywords = fillFallbackLongtails(c);
            for (const kw of c.keywords ?? []) await upsertKwInDb(kw.keyword_text, kw.intent, cid, 'cluster');
          }
        }
        for (const c of clusterSpec) {
          if (c.type === 'supporting') {
            const parentName = (c.parent_cluster_name as string) || '';
            let parentId = insertedNameToId.get(parentName) ?? null;
            if (!parentId && parentName) {
              // Attach to pillarByName fallback or create temp cluster
              const pid = pillarByName.get(parentName);
              if (pid) {
                const ccid = await insertCluster(parentName, 'cluster', pid);
                parentId = ccid;
                clusterCount++;
              } else {
                // create new pillar + cluster
                const pid = await insertCluster(parentName, 'pillar', null);
                pillarCount++;
                const ccid = await insertCluster(c.name + '_parent', 'cluster', pid);
                parentId = ccid;
                clusterCount++;
              }
            }
            const sid = await insertCluster(c.name, 'supporting', parentId);
            supportingCount++;
            c.keywords = fillFallbackLongtails(c);
            for (const kw of c.keywords ?? []) await upsertKwInDb(kw.keyword_text, kw.intent, sid, 'supporting');
          }
        }
        // ═══════════════════════════════════════════════════════════════════
        // POST-GUARD (CRITICAL — NO MORE 8/9 UNASSIGNED!)
        // หลังจบ loop ทุก tier แล้ว — ตรวจสอบทุก input keyword: ไหนยังไม่มี __assigned=true
        // → บังคับแบ่งเป็น 3 Tier (Pillar / Cluster / Supporting) แยกกลุ่มละ 3 คำ (ไม่ยัดรวมกัน 1 กลุ่มใหญ่!)
        // → assignedCount ต้อง == total_input_keywords 100% ไม่ว่า LLM จะตอบแค่ไหนก็ตาม
        // ═══════════════════════════════════════════════════════════════════
        let coercedRemainingCount = 0;
        let coercedClusterId: number | null = null;
        {
          const remaining = kwRows.filter(r => !(r as any).__assigned);
          if (remaining.length > 0) {
            // ============== NEW 3-TIER FALLBACK STRUCTURE (NOT 1 BIG CLUSTER!) ==============
            const BATCH_PER_CLUSTER = 3; // ~3 คำ/Cluster (เหมือนระบบเก่า SEO E V1)
            const totalRemaining = remaining.length;
            // 1. สร้าง/ใช้ Pillar แม่ (ไม่เกิน 1 Pillar ต่อทุก 15 คำที่เหลือ)
            const needNewPillar = pillarByName.size === 0;
            let pillarIdForFallbacks: number;
            if (needNewPillar) {
              const pName = totalRemaining <= 5
                ? `กลุ่มหลัก: ${remaining[0].keywordText.slice(0, 18)} (Auto)`
                : `กลุ่มหลักทั่วไป (Auto Pillar)`;
              pillarIdForFallbacks = await insertCluster(pName, 'pillar', null);
              pillarByName.set(pName, pillarIdForFallbacks);
              pillarCount++;
            } else {
              pillarIdForFallbacks = [...pillarByName.values()][0];
            }
            // 2. แบ่ง Cluster: ทุก 6-7 คำ → 1 Cluster ระดับกลาง (มี Supporting ลูก)
            const CLUSTER_STEP = 6;
            const nClustersNeeded = Math.max(1, Math.ceil(totalRemaining / CLUSTER_STEP));
            const clustersNeeded: { id: number; kwMin: number; kwMax: number }[] = [];
            for (let ci = 0; ci < nClustersNeeded; ci++) {
              const kwSlice = remaining.slice(ci * CLUSTER_STEP, (ci + 1) * CLUSTER_STEP);
              if (kwSlice.length <= BATCH_PER_CLUSTER) {
                // <= 3 คำ: attach เป็น Cluster ระดับกลางได้เลย (ไม่ต้องมี Supporting ลูก)
                const cName = kwSlice.length === 1
                  ? `${kwSlice[0].keywordText.slice(0, 22)} (Auto)`
                  : `กลุ่มย่อย ${ci + 1}: ${kwSlice[0].keywordText.slice(0, 14)} - ${kwSlice[kwSlice.length - 1].keywordText.slice(0, 14)}`;
                const cid = await insertCluster(cName, 'cluster', pillarIdForFallbacks);
                clustersNeeded.push({ id: cid, kwMin: 0, kwMax: 100 });
                clusterCount++;
                // Attach ทั้งหมดเป็น keyword ใน Cluster นี้ตรงๆ
                for (const r of kwSlice) {
                  const intent = (r as any).intentSuggestion || detectIntentFromText(String(r.keywordText || ''));
                  const ok = await upsertKwInDb(String(r.keywordText || ''), String(intent), Number(cid), 'cluster');
                  if (ok) { coercedRemainingCount++; if (!coercedClusterId) coercedClusterId = cid; }
                }
              } else {
                // 4-6 คำ: สร้าง 1 Cluster กลาง + แต่ละ BATCH_PER_CLUSTER = 1 Supporting ลูก
                const cName = `กลุ่มย่อย ${ci + 1}: ${kwSlice[0].keywordText.slice(0, 14)} (Auto)`;
                const cid = await insertCluster(cName, 'cluster', pillarIdForFallbacks);
                clustersNeeded.push({ id: cid, kwMin: 0, kwMax: 100 });
                clusterCount++;
                // แยก Supporting ทีละ 3 คำ
                const nSupp = Math.max(1, Math.ceil(kwSlice.length / BATCH_PER_CLUSTER));
                for (let si = 0; si < nSupp; si++) {
                  const suppSlice = kwSlice.slice(si * BATCH_PER_CLUSTER, (si + 1) * BATCH_PER_CLUSTER);
                  if (suppSlice.length === 0) continue;
                  const sName = suppSlice.length === 1
                    ? `${suppSlice[0].keywordText.slice(0, 24)} (Auto)`
                    : `${suppSlice[0].keywordText.slice(0, 10)} - ${suppSlice[suppSlice.length - 1].keywordText.slice(0, 10)} (ลูก ${si + 1})`;
                  const sid = await insertCluster(sName, 'supporting', cid);
                  if (!coercedClusterId) coercedClusterId = sid;
                  supportingCount++;
                  for (const r of suppSlice) {
                    const intent = (r as any).intentSuggestion || detectIntentFromText(String(r.keywordText || ''));
                    const ok = await upsertKwInDb(String(r.keywordText || ''), String(intent), Number(sid), 'supporting');
                    if (ok) coercedRemainingCount++;
                  }
                }
              }
            }
          }
        }
        // ════════════════════════════════════════════════════════════════
        // KD=0 FIX: AUTO ENRICH POST-INSERT (BEST-EFFORT, NEVER BREAK RESPONSE)
        // ทุกครั้งที่ AI สร้าง keywords/cluster ใหม่เสร็จ → Enrich SERP อัตโนมัติ
        // เฉพาะ keywords ที่ KD/SV ยัง NULL → ไม่ต้องกด Enrich คน
        // ════════════════════════════════════════════════════════════════
        let autoEnrichedCount = 0;
        let autoEnrichErrors = 0;
        try {
          const needEnrich: { id: number; keywordText: any }[] = await db.select({ id: keywords.id, keywordText: keywords.keywordText })
            .from(keywords)
            .where(and(
              eq(keywords.projectId, input.projectId),
              or(isNull(keywords.difficulty), isNull(keywords.searchVolume))
            ))
            .limit(50);
          if (needEnrich.length > 0) {
            const serp = await SerpService.forContext(ctx);
            const batch: EnrichResult[] = await serp.enrichBatch(needEnrich.map(r => String(r.keywordText ?? '').trim()).filter(Boolean));
            for (const r of batch) {
              if (r.error) { autoEnrichErrors++; continue; }
              const patch = {
                searchVolume: r.searchVolume,
                difficulty: r.difficulty,
                intentSuggestion: r.intent as any,
              };
              try {
                await db.update(keywords).set(patch).where(and(
                  eq(keywords.projectId, input.projectId),
                  eq(keywords.keywordText, r.keyword)
                ));
                autoEnrichedCount++;
              } catch (_upd: any) { /* duplicate / race → ignore */ }
            }
          }
        } catch (enrichErr: any) {
          console.warn(`[aiClusterize auto enrich skipped trace=${traceId}]:`, String(enrichErr?.message ?? enrichErr).slice(0, 120));
        }
        return {
          ok: true,
          traceId,
          disclaimer_required: !!parsed.disclaimer_required,
          pillar_count: pillarCount,
          cluster_count: clusterCount,
          supporting_count: supportingCount,
          assigned_keywords: assignedCount,
          total_input_keywords: kwRows.length,
          newly_inserted_keywords: newlyInsertedKwCount,
          unassigned_keywords_not_in_response: notAssigned.slice(0, 50),
          devFallback: !!(parsed as any).__heuristicFallback || !!lastParseErr,
          parse_had_error: !!lastParseErr,
          coerced_remaining_count: coercedRemainingCount,
          coerced_cluster_id: coercedClusterId,
          auto_enriched_count: autoEnrichedCount,
          auto_enrich_errors: autoEnrichErrors,
        };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        console.warn('[aiClusterize] DB/LLM error:', e?.message?.slice(0, 150));
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `[trace ${traceId}] aiClusterize failed: ${String(e?.message ?? e).slice(0, 200)}`, cause: { traceId, retryable: true } as any });
      }
    }),
});

export default keywordsRouter;
