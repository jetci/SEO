// EEAT Studio V2 · Projects tRPC Router (SA Phase 1 Task 1.1)
// 5 Procedures: create / list (pagination) / update / delete (soft) / get
// All procedures guard project team membership. Soft delete via is_active=0 (SA).
import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { IS_DEV } from '../_core/env.js';
import { protectedProcedure, TRPCError } from '../_core/middleware/rbac.js';
import { db } from '../../db/index.js';
import { users, projects, categories, articles, teamMembers, projectBrandVoices } from '../../db/schema.js';
import { eq, and, inArray, asc, desc, like, or, isNull, count } from 'drizzle-orm';
import { KEYWORD_INTENTS } from '../../shared/types.js';
import { assertTeamAccess, assertProjectAccess, userTeamIds } from './_projectAccess.js';
import type { ProjectWithPermission } from '../../shared/types.js';
import { LlmService } from '../services/llmClient.js';
import { getInsertId } from '../_core/utils/insertId.js';

const PROJECT_NAME_MIN = 1;
const PROJECT_NAME_MAX = 255;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function pickCategoryColor(catId: number | string | null | undefined): string {
  switch (Number(catId)) {
    case 1: return '#d97706';
    case 2: return '#dc2626';
    case 3: return '#7c3aed';
    case 4: return '#059669';
    case 5: return '#0891b2';
    case 6: return '#ea580c';
    case 7: return '#be123c';
    default: return '#475569';
  }
}

export const projectsRouter = router({
  /**
   * create — owner/admin or member (SA G1.7 member=edit) can create.
   * Returns full project row.
   */
  create: protectedProcedure
    .input(z.object({
      teamId: z.number().int().positive(),
      categoryId: z.number().int().positive().optional(),
      name: z.string().min(PROJECT_NAME_MIN).max(PROJECT_NAME_MAX),
      mainKeyword: z.string().max(255).optional(),
      description: z.string().max(10000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Member allowed to create (SA G1.7 member=read+edit)
      const { userId } = await assertTeamAccess(ctx, input.teamId, { minRole: 'member' }, TRPCError);

      try {
        const inserted: any = await db.insert(projects).values({
          teamId: input.teamId,
          ownerId: userId,
          categoryId: input.categoryId ?? null,
          name: input.name,
          mainKeyword: input.mainKeyword ?? null,
          description: input.description ?? null,
          isActive: 1,
        });
        const projectId = getInsertId(inserted);
        const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
        return { ok: true, project: row, projectId };
      } catch (e: any) {
        if (IS_DEV) {
          console.warn('[projects.create] DB unavailable fallback mock.', e?.message ?? String(e).slice(0, 100));
          const mockId = Date.now();
          return {
            ok: true,
            project: {
              id: mockId, teamId: input.teamId, ownerId: userId,
              categoryId: input.categoryId ?? null, name: input.name,
              mainKeyword: input.mainKeyword ?? null, description: input.description ?? null,
              isActive: 1, createdAt: new Date(), updatedAt: new Date(),
            },
            projectId: mockId, mock: true,
          };
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  /**
   * list — server-side pagination (G1.3). Team isolation: only user's teams visible.
   */
  list: protectedProcedure
    .input(z.object({
      teamId: z.number().int().positive().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      search: z.string().max(200).optional(),
    }).optional())
    .query(async ({ ctx, input = {} as any }) => {
      try {
        const allowedTeamIds = await userTeamIds(ctx);
        if (allowedTeamIds.length === 0) return [] as any[];
        const effectiveTeamIds = input.teamId && allowedTeamIds.includes(input.teamId)
          ? [input.teamId]
          : allowedTeamIds;
        const page = Number(input.page ?? 1);
        const pageSize = Number(input.pageSize ?? DEFAULT_PAGE_SIZE);

        const baseWhere = and(
          inArray(projects.teamId, effectiveTeamIds),
          eq(projects.isActive, 1),
          input.search?.trim().length
            ? or(
                like(projects.name, `%${input.search.trim()}%`),
                like(projects.mainKeyword, `%${input.search.trim()}%`)
              )
            : undefined
        );

        const rows = await db
          .select({
            project: projects,
            categoryName: categories.name,
            categorySlug: categories.slug,
          })
          .from(projects)
          .leftJoin(categories, eq(projects.categoryId, categories.id))
          .where(baseWhere)
          .orderBy(desc(projects.createdAt), desc(projects.id))
          .limit(pageSize)
          .offset(Math.max(0, (page - 1) * pageSize));

        const openId = ctx.session!.openId;
        const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.googleOpenId, openId)).limit(1);
        const teamPermMap = new Map<number, string>();
        if (userRow) {
          const tmRows = await db
            .select({ teamId: teamMembers.teamId, permission: teamMembers.permission })
            .from(teamMembers)
            .where(and(eq(teamMembers.userId, userRow.id), inArray(teamMembers.teamId, effectiveTeamIds)));
          tmRows.forEach(r => teamPermMap.set(r.teamId, r.permission as string));
        }
        const out: any[] = rows.map(r => {
          const perm = (teamPermMap.get(Number(r.project.teamId ?? 0)) ?? 'member') as any;
          return {
            ...r.project,
            permission: perm,
            categoryName: r.categoryName,
            categorySlug: r.categorySlug,
            status: (r.project as any).isActive ? 'active' : 'archived',
            color: pickCategoryColor(r.project.categoryId),
          };
        });
        return out;
      } catch (e: any) {
        if (IS_DEV) {
          console.warn('[projects.list] DB fallback.', e?.message ?? String(e).slice(0, 100));
          return [] as any[];
        }
        return [] as any[];
      }
    }),

  /**
   * update — name, mainKeyword, categoryId, description.
   * SA G1.7: member=edit → minRole='member'
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      patch: z.object({
        name: z.string().min(PROJECT_NAME_MIN).max(PROJECT_NAME_MAX).optional(),
        mainKeyword: z.string().max(255).optional().nullable(),
        categoryId: z.number().int().positive().optional().nullable(),
        description: z.string().max(10000).optional().nullable(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.id, { minRole: 'member' }, TRPCError);
      try {
        const patch: any = {};
        if ('name' in input.patch) patch.name = input.patch.name;
        if ('mainKeyword' in input.patch) patch.mainKeyword = input.patch.mainKeyword ?? null;
        if ('categoryId' in input.patch) patch.categoryId = input.patch.categoryId ?? null;
        if ('description' in input.patch) patch.description = input.patch.description ?? null;
        if (Object.keys(patch).length === 0) return { ok: true, affected: 0 };
        const updated: any = await db.update(projects).set(patch).where(eq(projects.id, input.id));
        return { ok: true, affected: Number(updated[0]?.affectedRows ?? updated.affectedRows ?? (updated as any)?.[0]?.affectedRows ?? 0) };
      } catch (e: any) {
        if (IS_DEV) {
          console.warn('[projects.update] DB fallback mock.', e?.message ?? String(e).slice(0, 100));
          return { ok: true, affected: 1, mock: true };
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  /**
   * delete — SOFT delete (is_active=0). SA Mandate: "articles ผูก → ห้าม hard delete".
   * Requires minRole='admin' (owner/admin only — prevent accidental member wipe)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.id, { minRole: 'admin' }, TRPCError);
      try {
        // Check for any articles bound (SA G1.1 delete rule — articles ผูก ห้าม)
        const linkedArticles = await db
          .select({ id: articles.id })
          .from(articles)
          .where(eq(articles.projectId, input.id))
          .limit(1);
        if (linkedArticles.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot delete project (id=${input.id}): has ${linkedArticles.length}+ article(s) bound. Unlink or delete articles first.`,
          });
        }
        const del: any = await db.update(projects).set({ isActive: 0 }).where(eq(projects.id, input.id));
        return {
          ok: true,
          softDeleted: true,
          affected: Number(del[0]?.affectedRows ?? del.affectedRows ?? (del as any)?.[0]?.affectedRows ?? 0),
        };
      } catch (e: any) {
        if (IS_DEV && !(e instanceof TRPCError)) {
          console.warn('[projects.delete] DB fallback mock success.', e?.message ?? String(e).slice(0, 100));
          return { ok: true, softDeleted: true, affected: 1, mock: true };
        }
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  /**
   * get — single project detail with permission + category names. FLAT object return.
   */
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const access = await assertProjectAccess(ctx, input.id, { minRole: 'member' }, TRPCError);
      try {
        const rows = await db
          .select({ project: projects, categoryName: categories.name, categorySlug: categories.slug })
          .from(projects)
          .leftJoin(categories, eq(projects.categoryId, categories.id))
          .where(and(eq(projects.id, input.id), eq(projects.isActive, 1)))
          .limit(1);
        if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: `Project ${input.id} not found or deleted.` });
        const r = rows[0];
        return {
          ...r.project,
          permission: access.permission,
          categoryName: r.categoryName,
          categorySlug: r.categorySlug,
          status: (r.project as any).isActive ? 'active' : 'archived',
          color: pickCategoryColor(r.project.categoryId),
        };
      } catch (e: any) {
        if (IS_DEV && !(e instanceof TRPCError)) {
          console.warn('[projects.get] DB fallback.', e?.message ?? String(e).slice(0, 100));
          return {
            id: input.id, teamId: 1, ownerId: 1, categoryId: 1,
            name: 'Mock Project', mainKeyword: '', description: '',
            isActive: 1, createdAt: new Date(), updatedAt: new Date(),
            permission: access.permission, categoryName: 'ฟุตบอล', categorySlug: 'football',
            status: 'active', color: pickCategoryColor(1),
          };
        }
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }): Promise<any> => {
      const caller = projectsRouter.createCaller(ctx as any);
      return (caller as any).get(input);
    }),

  getActive: protectedProcedure
    .input(z.void().optional())
    .query(async ({ ctx }) => {
      try {
        const allowedTeamIds = await userTeamIds(ctx);
        if (allowedTeamIds.length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '[WRITER-04] No team memberships. Cannot list active projects' });
        }
        const rows = await db
          .select({ project: projects, categoryName: categories.name, categorySlug: categories.slug })
          .from(projects)
          .leftJoin(categories, eq(projects.categoryId, categories.id))
          .where(and(inArray(projects.teamId, allowedTeamIds), eq(projects.isActive, 1)))
          .orderBy(desc(projects.updatedAt), desc(projects.id))
          .limit(1);
        if (rows.length === 0) return null;
        const access = await assertProjectAccess(ctx, Number(rows[0].project.id), { minRole: 'member' }, TRPCError).catch(() => null);
        return {
          ...rows[0].project,
          permission: access?.permission ?? 'member',
          categoryName: rows[0].categoryName,
          categorySlug: rows[0].categorySlug,
          status: (rows[0].project as any).isActive ? 'active' : 'archived',
          color: pickCategoryColor(rows[0].project.categoryId),
          coverKeyword: (rows[0].project as any).mainKeyword ?? '',
        };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        if (IS_DEV) {
          console.warn('[projects.getActive] fallback.', e?.message ?? String(e).slice(0, 100));
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  /**
   * getBrandVoice — return parsed voice_json for project if row exists (SA Gold Idea #1)
   * permission: member can read (minRole='member')
   */
  getBrandVoice: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'member' }, TRPCError);
      try {
        const [row] = await db.select().from(projectBrandVoices).where(eq(projectBrandVoices.projectId, input.projectId)).limit(1);
        if (!row) return null;
        let voiceParsed: any = null;
        try { voiceParsed = JSON.parse(row.voiceJson || '{}'); } catch { voiceParsed = {}; }
        return { id: row.id, projectId: row.projectId, scrapedUrl: row.scrapedUrl, voice: voiceParsed, updatedAt: row.updatedAt, createdAt: row.createdAt };
      } catch (e: any) {
        if (IS_DEV) return null;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  /**
   * scrapeBrandVoice — fetch project homepage URL → extract HTML snippet → LLM summarize Brand Voice JSON
   * Upsert 1 row per project (UNIQUE project_id). permission: minRole='admin' (LLM cost)
   * Returns parsed voice object (brandTone / primaryLang / targetAudience / keywords[] / contentDo[] / contentDont[] / contentType)
   */
  scrapeBrandVoice: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive(), url: z.string().trim().max(2048).url() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'admin' }, TRPCError);
      const projectUrl = input.url.trim();
      let htmlSnippet = '';
      let hostName = '';
      try {
        const pu = new URL(projectUrl); hostName = pu.hostname;
      } catch { hostName = projectUrl.slice(0, 120); }
      try {
        const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 9000);
        try {
          const resp = await fetch(projectUrl, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 EEAT-Studio-V2/2.0 (+https://thaiaeo.manus.host)', 'Accept': 'text/html,application/xhtml+xml' }, signal: ac.signal });
          const html = await resp.text();
          htmlSnippet = html.slice(0, 8000);
        } finally { clearTimeout(t); }
      } catch (e: any) { htmlSnippet = `[FETCH_SKIP host=${hostName} reason=${String(e?.message || e).slice(0, 60)}]`; }

      let voice: any = {
        brandTone: 'มืออาชีพ เชื่อถือได้ friendly',
        primaryLang: 'ภาษาไทย',
        targetAudience: 'ผู้ใหญ่ 25-55 ปี ที่สนใจหาเนื้อหาคุณภาพ',
        keywords: [],
        contentDo: ['ใช้ภาษาไทยอ่านง่าย', 'ยกตัวอย่างชัดเจน', 'เน้นประโยชน์ต่อผู้อ่าน'],
        contentDont: ['ใช้ภาษาแสลงหยาบ', 'โกหกข้อมูล', 'ลอกลวงโกงแจกัน'],
        contentType: 'บทความแนะนำ + How-to + Review เชิงลึก',
        scrapedFrom: hostName,
      };
      try {
        const llm = await LlmService.forContext(ctx as any);
        const sysSchema = z.object({
          brandTone: z.string().max(400),
          primaryLang: z.string().max(80),
          targetAudience: z.string().max(600),
          keywords: z.array(z.string().max(60)).max(10),
          contentDo: z.array(z.string().max(300)).max(8),
          contentDont: z.array(z.string().max(300)).max(8),
          contentType: z.string().max(400),
        });
        const usr =
`HOMEPAGE URL: ${projectUrl}\nHOST: ${hostName}\n\nHTML SNIPPET (8KB MAX:\n${htmlSnippet}\n\n
Return JSON: brand voice guidelines for writing articles matching this brand's site.`;
        const sysText =
          'Extract brand voice guidelines STRICT JSON keys: brandTone (string), primaryLang, targetAudience, keywords (max10 strings array), contentDo (max8 strings DO guidelines), contentDont (max8 strings DONT rules), contentType.\n' +
          'If HTML snippet is empty or unreachable generate a safe generic Thai default conservative voice appropriate for hostname domain: ' + hostName + '\n' +
          'NO markdown fences, ONLY JSON.';
        const r = await llm.chatStructured(
          sysText.slice(0, 1200),
          usr.slice(0, 6000),
          sysSchema, { maxTokens: 1024, temperature: 0.3 }
        );
        if (r) voice = { ...voice, ...r };
      } catch { /* fallback defaults kept */ }
      voice.keywords = Array.isArray(voice.keywords) ? voice.keywords.slice(0,12) : [];
      voice.contentDo = Array.isArray(voice.contentDo) ? voice.contentDo.slice(0,8) : voice.contentDo;
      voice.contentDont = Array.isArray(voice.contentDont) ? voice.contentDont.slice(0,8) : voice.contentDont;

      const voiceStr = JSON.stringify(voice);
      const [exRow] = await db.select({ id: projectBrandVoices.id }).from(projectBrandVoices).where(eq(projectBrandVoices.projectId, input.projectId)).limit(1);
      if (exRow) {
        await db.update(projectBrandVoices).set({ voiceJson: voiceStr, scrapedUrl: projectUrl }).where(eq(projectBrandVoices.id, exRow.id));
      } else {
        await db.insert(projectBrandVoices).values({ projectId: input.projectId, scrapedUrl: projectUrl, voiceJson: voiceStr });
      }
      return { ok: true, voice, scrapedUrl: projectUrl, voiceJsonLen: voiceStr.length };
    }),

  saveBrandVoice: protectedProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      voice: z.object({
        brandTone: z.string().max(400).optional(),
        primaryLang: z.string().max(80).optional(),
        targetAudience: z.string().max(600).optional(),
        keywords: z.array(z.string().max(60)).max(20).optional(),
        contentDo: z.array(z.string().max(300)).max(12).optional(),
        contentDont: z.array(z.string().max(300)).max(12).optional(),
        contentType: z.string().max(400).optional(),
        tone_formal: z.number().min(0).max(100).optional(),
        tone_casual: z.number().min(0).max(100).optional(),
        tone_technical: z.number().min(0).max(100).optional(),
        tone_persuasive: z.number().min(0).max(100).optional(),
        scrapedFrom: z.string().max(400).optional(),
      }).passthrough(),
      scrapedUrl: z.string().max(2048).url().optional().or(z.literal('')),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'admin' }, TRPCError);
      const [exRow] = await db.select({ id: projectBrandVoices.id }).from(projectBrandVoices).where(eq(projectBrandVoices.projectId, input.projectId)).limit(1);
      let existingVoice: any = {};
      if (exRow) {
        const [curr] = await db.select({ voiceJson: projectBrandVoices.voiceJson }).from(projectBrandVoices).where(eq(projectBrandVoices.id, exRow.id)).limit(1);
        try { existingVoice = JSON.parse(curr?.voiceJson || '{}'); } catch { existingVoice = {}; }
      }
      const mergedVoice = { ...existingVoice, ...input.voice };
      const voiceStr = JSON.stringify(mergedVoice);
      if (exRow) {
        const patch: any = { voiceJson: voiceStr };
        if (typeof input.scrapedUrl === 'string' && input.scrapedUrl.length > 0) patch.scrapedUrl = input.scrapedUrl;
        await db.update(projectBrandVoices).set(patch).where(eq(projectBrandVoices.id, exRow.id));
      } else {
        await db.insert(projectBrandVoices).values({
          projectId: input.projectId,
          scrapedUrl: (typeof input.scrapedUrl === 'string' && input.scrapedUrl.length > 0) ? input.scrapedUrl : '',
          voiceJson: voiceStr,
        });
      }
      return { ok: true, voice: mergedVoice, voiceJsonLen: voiceStr.length, upserted: !exRow };
    }),

});

export default projectsRouter;
