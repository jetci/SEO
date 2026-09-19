// EEAT Studio V2 · Write tRPC Router — Phase 2D Write Pipeline (10 Steps: 5-10)
// Replaces PHASE1 STUB => now wires ArticleWriterService to generate EEAT 1500+ word drafts.
// 3 Procedures: write.createDraft, write.getDraft, write.publish
// Status: write_articles workflow 10-step, articles.status draft/published FK
import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { protectedProcedure, TRPCError, type ProtectedCtx } from '../_core/middleware/rbac.js';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { articles, clusters, keywords as keywordsTable, projects as projectsTable, categories as categoriesTable, researchPackages as rpTable, users, writeArticles } from '../../db/schema.js';
import { assertProjectAccess } from './_projectAccess.js';
import ArticleWriterService, { type ResearchPackageLite } from '../services/articleWriterService.js';
import { resolveTeamIdForSettings, resolveTeamSettings } from './settings.js';
import { PROVIDER_DEFAULT_MODELS } from '../services/llmClient.js';
import * as crypto from 'node:crypto';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';

function extractInsertId(res: any): number {
  if (Array.isArray(res)) {
    if (res.length > 0 && typeof res[0]?.insertId === 'number') return Number(res[0].insertId);
    if (typeof (res as any).insertId === 'number') return Number((res as any).insertId);
    const first = (res as any)[0];
    if (first && typeof first === 'object') {
      if (typeof (first as any).insertId === 'number') return Number((first as any).insertId);
      if (Array.isArray(first) && typeof first[0]?.insertId === 'number') return Number(first[0].insertId);
    }
  } else if (res && typeof (res as any).insertId === 'number') return Number((res as any).insertId);
  return 0;
}

function serverParseInlineRuns(line: string, extraOpts?: { italics?: boolean }): TextRun[] {
  const runs: TextRun[] = [];
  const tokens = line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  const italicBase = !!(extraOpts?.italics);
  for (const tok of tokens) {
    if (!tok) continue;
    const boldMatch = tok.match(/^\*\*([^*\n]+)\*\*$/);
    const codeMatch = tok.match(/^`([^`\n]+)`$/);
    if (boldMatch) runs.push(new TextRun({ text: boldMatch[1], bold: true, italics: italicBase }));
    else if (codeMatch) runs.push(new TextRun({ text: codeMatch[1], font: "Courier New", size: 20, italics: italicBase }));
    else runs.push(new TextRun({ text: tok, italics: italicBase }));
  }
  return runs.length ? runs : [new TextRun({ text: "", italics: italicBase })];
}

function serverMarkdownToDocxParagraphs(md: string): Paragraph[] {
  const lines = String(md ?? "").split(/\r?\n/);
  const paras: Paragraph[] = [];
  let inCodeBlock = false;
  let codeBuf: string[] = [];
  const flushCode = () => {
    if (codeBuf.length) {
      for (const cl of codeBuf) paras.push(new Paragraph({ children: [new TextRun({ text: cl, font: "Courier New", size: 20 })], spacing: { before: 0, after: 0 } }));
      codeBuf = [];
    }
  };
  for (const raw of lines) {
    if (/^```/.test(raw)) { inCodeBlock ? (flushCode(), inCodeBlock = false) : (inCodeBlock = true); continue; }
    if (inCodeBlock) { codeBuf.push(raw); continue; }
    const h1 = raw.match(/^#\s+(.*)$/); if (h1) { flushCode(); paras.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: serverParseInlineRuns(h1[1]) })); continue; }
    const h2 = raw.match(/^##\s+(.*)$/); if (h2) { flushCode(); paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: serverParseInlineRuns(h2[1]) })); continue; }
    const h3 = raw.match(/^###\s+(.*)$/); if (h3) { flushCode(); paras.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: serverParseInlineRuns(h3[1]) })); continue; }
    const h4 = raw.match(/^####\s+(.*)$/); if (h4) { flushCode(); paras.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: serverParseInlineRuns(h4[1]) })); continue; }
    const bullet = raw.match(/^\s*[-*+]\s+(.*)$/); if (bullet) { flushCode(); paras.push(new Paragraph({ bullet: { level: 0 }, children: serverParseInlineRuns(bullet[1]) })); continue; }
    const quote = raw.match(/^>\s*(.*)$/);
    if (quote) { flushCode(); paras.push(new Paragraph({ children: serverParseInlineRuns(quote[1], { italics: true }), spacing: { before: 60, after: 60 } })); continue; }
    if (!raw.trim()) { flushCode(); paras.push(new Paragraph({ children: [new TextRun("")], spacing: { after: 100 } })); continue; }
    flushCode();
    paras.push(new Paragraph({ children: serverParseInlineRuns(raw) }));
  }
  flushCode();
  return paras;
}

// ==================================================================
// 🔴 NON-NEGOTIABLE GLOBAL ANTI-GENERIC OUTLINE GUARD (ALL ENDPOINTS)
// ANY endpoint that loads outline_json from write_articles MUST run this
// Refuses ALL 8 original + all user screenshot generic patterns
// ==================================================================
const OUTLINE_BANNED_SUBSTRINGS: string[] = [
  // ===== EXACT USER SCREENSHOT TH LABELS (60 วันไม่คืบหน้า) =====
  '(Definition)',
  '(Why / Causes)',
  '(How-to Guide)',
  '(Comparison / Case Study)',
  '(Key Takeaways)',
  '(ปิดท้ายบทความ)',
  'ขั้นตอน 1-3: เตรียมความพร้อม',
  'เตรียมความพร้อม → ดำเนินการ → ตรวจสอบผลลัพธ์',
  'ข้อผิดพลาดที่พบบ่อย',
  'คำจำกัดความและประเภทของ',
  'คืออะไร? — บทนำและบริบท',
  'สาเหตุและปัจจัยสำคัญของ',
  'วิธีทำ / คู่มือปฏิบัติ',
  'กับทางเลือกอื่น',
  'แหล่งอ้างอิงและข้อมูลยืนยัน',
  'สรุปและคำแนะนำที่สำคัญ',
  // ===== USER VERBATIM BLACKLIST (NEW BORING ACADEMIC HEADING WORDS — DO NOT GENERATE THESE EVER) =====
  'บทนำ',
  'บทสรุป',
  'ข้อดีและข้อเสีย',
  'ความสำคัญของ',
  'ปัจจัยที่ส่งผลต่อ',
  'ข้อดี-ข้อเสีย',
  'ความสำคัญ',
  'ปัจจัยที่เกี่ยวข้อง',
];
function headingContainsGeneric(h: string): boolean {
  if (!h) return false;
  const s = String(h);
  for (let i = 0; i < OUTLINE_BANNED_SUBSTRINGS.length; i++) if (s.includes(OUTLINE_BANNED_SUBSTRINGS[i])) return true;
  return false;
}
function outlineIsGenericTemplate(o: any): boolean {
  if (!o || !Array.isArray(o?.sections)) return false;
  for (const sec of (o.sections as any[])) {
    const t = String(sec?.heading_text ?? '');
    if (headingContainsGeneric(t)) return true;
  }
  return false;
}

async function serverGenerateDocxBuffer(md: string, titleText?: string): Promise<Buffer> {
  const children: Paragraph[] = [];
  if (titleText?.trim()) children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: titleText, bold: true })] }));
  children.push(...serverMarkdownToDocxParagraphs(md));
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const arr = await Packer.toBuffer(doc);
  return Buffer.from(arr);
}

const NEW_UUID = () => crypto.randomUUID();

export const writeRouter = router({
  createDraft: protectedProcedure
    .input(z.object({
      keywordId: z.number().int().positive().optional(),
      draftId: z.number().int().positive().optional(),
      keyword: z.string().min(1).max(255).optional(),
      outlineSections: z.array(z.object({ heading_level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), heading_text: z.string().min(1).max(255), word_target_min: z.number().int().default(0), word_target_max: z.number().int().default(0), key_points: z.array(z.string()).default([]) })).max(80).optional(),
      category: z.string().max(120).optional(),
      intent: z.string().max(120).optional(),
      contentType: z.string().max(120).optional(),
      force: z.boolean().default(false),
      model: z.string().max(120).optional(),
      targetWordCount: z.number().int().min(500).max(20000).optional(),
    }).refine(i =>
      Number(i.keywordId ?? 0) > 0 || Number(i.draftId ?? 0) > 0 || (typeof i.keyword === 'string' && i.keyword.trim().length > 0),
      { message: 'ต้องระบุ keywordId หรือ draftId หรือ keyword text อย่างน้อย 1 อย่าง' }
    ))
    .mutation(async ({ ctx, input }) => {
      const traceId = NEW_UUID();
      const selectedModel = String(input.model || "").trim() || undefined;

      // ── FRESH START GUARD: Resolve keywordId / draftId from raw keyword text when user typed at /write (no URL kw_id/draft_id params from KCP)
      let resolvedKeywordId: number = Number(input.keywordId ?? 0);
      let resolvedDraftId: number = Number(input.draftId ?? 0);
      if (resolvedKeywordId === 0 && resolvedDraftId === 0 && typeof input.keyword === 'string' && input.keyword.trim().length > 0) {
        const kwText = input.keyword.trim();
        try {
          const [existingKw] = await db.select({
            id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier,
            projectId: keywordsTable.projectId, categoryId: keywordsTable.categoryId, clusterId: keywordsTable.clusterId,
          }).from(keywordsTable).where(eq(keywordsTable.keywordText, kwText)).limit(1);
          if (existingKw) resolvedKeywordId = Number(existingKw.id);
        } catch { /* lookup fail */ }
        if (resolvedKeywordId === 0) {
          let defaultProjectId: number = 0;
          let defaultCategoryId: number = 0;
          let defaultClusterId: number = 0;
          try {
            const [projRow] = await db.select({ id: projectsTable.id, categoryId: projectsTable.categoryId }).from(projectsTable).limit(1);
            if (projRow) { defaultProjectId = Number(projRow.id); if (projRow.categoryId) defaultCategoryId = Number(projRow.categoryId); }
          } catch { /* no projects yet */ }
          try {
            const [cl] = await db.select({ id: clusters.id }).from(clusters).limit(1);
            if (cl) defaultClusterId = Number(cl.id);
          } catch { /* ignore */ }
          if (!defaultCategoryId) {
            try { const [catR] = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1); if (catR) defaultCategoryId = Number(catR.id); } catch {}
          }
          let intentSuggestion: 'commercial' | 'informational' | 'navigational' | 'transactional' = 'informational';
          {
            const intentRaw = (typeof input.intent === 'string' && input.intent.trim()) ? input.intent.trim().toLowerCase().slice(0, 40) : '';
            if (intentRaw === 'commercial') intentSuggestion = 'commercial';
            else if (intentRaw === 'transactional') intentSuggestion = 'transactional';
            else if (intentRaw === 'navigational') intentSuggestion = 'navigational';
          }
          try {
            const inserted = await db.insert(keywordsTable).values({
              clusterId: defaultClusterId || 0,
              projectId: defaultProjectId || 0,
              categoryId: defaultCategoryId || 0,
              keywordText: kwText,
              intentSuggestion,
              status: 'pending',
              tier: 'supporting',
              isTarget: 0,
            }).$returningId();
            if (inserted && inserted[0] && inserted[0].id) resolvedKeywordId = Number(inserted[0].id);
          } catch {
            try {
              const [e2] = await db.select({ id: keywordsTable.id }).from(keywordsTable).where(eq(keywordsTable.keywordText, kwText)).limit(1);
              if (e2) resolvedKeywordId = Number(e2.id);
            } catch {}
          }
        }
      }
      if (resolvedKeywordId === 0 && resolvedDraftId === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'ไม่สามารถค้นหาหรือสร้าง Keyword ได้ กรุณาเลือกจาก Keyword Cluster Planner หรือพิมพ์ Keyword ใหม่อีกครั้ง' });
      }

      // If we have draftId, load article and get keywordId from it
      if (resolvedDraftId > 0) {
        try {
          const [dr] = await db.select({ kwId: articles.keywordId, title: articles.title }).from(articles).where(eq(articles.id, resolvedDraftId)).limit(1);
          if (dr && dr.kwId && resolvedKeywordId === 0) resolvedKeywordId = Number(dr.kwId);
        } catch { /* ignore */ }
      }

      // ── SANITIZE SELECTED MODEL (Cross-Provider ID prefix guard — same logic as generateOutline)
      const teamSettingsCreate = await resolveTeamSettings(ctx);
      const runtimeProviderCreate = String(teamSettingsCreate.llmProvider || 'openrouter').toLowerCase();
      function sanitizeModelIdCreate(selected: string | undefined, provider: string): string {
        const raw = String(selected || '').trim();
        const fallback = (PROVIDER_DEFAULT_MODELS as any)[provider] || (PROVIDER_DEFAULT_MODELS as any).openrouter;
        if (!raw) return fallback;
        if (provider !== 'openrouter' && raw.includes('/')) {
          const stripped = raw.split('/').slice(1).join('/');
          return stripped ? stripped : fallback;
        }
        if (provider === 'openrouter' && !raw.includes('/')) return fallback;
        return raw;
      }
      const finalModelCreate = sanitizeModelIdCreate(selectedModel, runtimeProviderCreate);
      const [kw] = await db.select({
        id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier,
        projectId: keywordsTable.projectId, categoryId: keywordsTable.categoryId, clusterId: keywordsTable.clusterId,
      }).from(keywordsTable).where(eq(keywordsTable.id, resolvedKeywordId)).limit(1);
      if (!kw) throw new TRPCError({ code: 'NOT_FOUND', message: `Keyword ${resolvedKeywordId} not found.` });
      // ── USER SIMPLIFY RULE: ทุก Pillar/Cluster/Supporting เขียนได้เดียวกัน ──
      // OLD BLOCKER REMOVED: Pillar tier no longer throws BAD_REQUEST
      if (!kw.projectId) throw new TRPCError({ code: 'BAD_REQUEST', message: '[NO_PROJECT_ID] keyword missing project FK.' });
      await assertProjectAccess(ctx, Number(kw.projectId), { minRole: 'member' }, TRPCError);

      // Resolve author id safely: ctx.user can be NULL if user DB row not pre-hydrated into context
      // (per ProtectedCtx type user: User | null). Fallback: resolve via ctx.session.openId like other routers.
      const openId = String(ctx.session!.openId || '').trim();
      let authorId: number = 0;
      if (ctx.user && typeof ctx.user.id === 'number' && Number.isFinite(ctx.user.id) && ctx.user.id > 0) {
        authorId = Number(ctx.user.id);
      } else if (openId) {
        const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.googleOpenId, openId)).limit(1);
        if (!userRow) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Author DB row not found for current session. Please sign in again.' });
        authorId = Number(userRow.id);
      } else {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session missing openId. Please sign in.' });
      }
      const teamId = await resolveTeamIdForSettings(ctx);

      // Find cluster topic (parentId -> pillar / cluster self name / pillar self = keyword for pillar tier)
      let clusterTopic: string | null = null;
      if (kw.clusterId) {
        const [cl] = await db.select({ name: clusters.name, type: clusters.type }).from(clusters).where(eq(clusters.id, Number(kw.clusterId))).limit(1);
        if (cl) clusterTopic = cl.name;
      } else if (kw.tier === 'cluster' || kw.tier === 'pillar') {
        clusterTopic = kw.keywordText;
      }

      // Load research package: For pillar tier → use SELF pkg. For cluster/supporting → find pillar ancestor pkg first, fallback self
      let pkgLite: ResearchPackageLite = { keyword_text: kw.keywordText, serp_top10: [], paa_questions: [], ai_overview: '', citation_pool: [], is_ymyl: false, ymyldisclaimer_required: false, keyword_id: kw.id, project_id: kw.projectId };
      let ymyl = false;
      let realRelatedSearches: string[] = [];
      let realPeopleAlsoSearch: string[] = [];
      {
        let pillarKwId: number | undefined;
        if (kw.tier === 'pillar') {
          pillarKwId = kw.id;
        } else if (kw.clusterId) {
          const [pillarkw] = await db.select({ id: keywordsTable.id }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'pillar'), eq(keywordsTable.clusterId, Number(kw.clusterId)))).limit(1);
          if (pillarkw) pillarKwId = pillarkw.id;
        }
        const pkgKwId = pillarKwId ?? kw.id;
        const [pkgRow] = await db.select({ pkg: rpTable.packageJson, pkgid: rpTable.id }).from(rpTable).where(eq(rpTable.keywordId, pkgKwId)).limit(1);
        if (pkgRow?.pkg) {
          try {
            const parsed = typeof pkgRow.pkg === 'string' ? JSON.parse(pkgRow.pkg) : pkgRow.pkg;
            (pkgLite as any) = { ...pkgLite, ...(parsed ?? {}) };
            if (typeof pkgLite.keyword_text !== 'string' || !pkgLite.keyword_text) pkgLite.keyword_text = kw.keywordText;
            if (!Array.isArray(pkgLite.serp_top10)) pkgLite.serp_top10 = [];
            if (!Array.isArray(pkgLite.paa_questions)) pkgLite.paa_questions = [];
            if (!Array.isArray(pkgLite.citation_pool)) pkgLite.citation_pool = [];
            if (Array.isArray((parsed as any)?.related_searches)) realRelatedSearches = (parsed as any).related_searches;
            if (Array.isArray((parsed as any)?.people_also_search)) realPeopleAlsoSearch = (parsed as any).people_also_search;
          } catch { /* keep empty pkg fallback */ }
        }
        const [proj] = await db.select({ categoryId: projectsTable.categoryId }).from(projectsTable).where(eq(projectsTable.id, Number(kw.projectId))).limit(1);
        if (proj?.categoryId) {
          const [cat] = await db.select({ isYmyl: categoriesTable.isYmyl }).from(categoriesTable).where(eq(categoriesTable.id, Number(proj.categoryId))).limit(1);
          ymyl = !!cat?.isYmyl;
        }
      }

      // Return existing draft if force=false and already exists (ALL tiers including pillar)
      if (!input.force) {
        const [existing] = await db.select({
          artId: articles.id, title: articles.title, status: articles.status, content: articles.content, metaTitle: articles.metaTitle, metaDescription: articles.metaDescription, categoryId: articles.categoryId,
          writeStep: writeArticles.writeStep, stepStatus: writeArticles.stepStatus, wordCount: writeArticles.wordCount, eeatScore: writeArticles.eeatScore, disclaimerAdded: writeArticles.disclaimerAdded, citationsCount: writeArticles.citationsCount, writeId: writeArticles.id,
        }).from(articles).innerJoin(writeArticles, eq(writeArticles.articleId, articles.id)).where(and(eq(articles.projectId, Number(kw.projectId)), eq(articles.keywordId, kw.id))).limit(1);
        if (existing && existing.status === 'draft') {
          const existingHasPlaceholder = existing.stepStatus === 'fail';
          return { ok: true, traceId, phase2Ready: true, draft_id: existing.artId, write_article_id: existing.writeId, from_existing: true, title: existing.title, content: existing.content, word_count_total: existing.wordCount, citations_count: existing.citationsCount, eeat_score: existing.eeatScore, disclaimer_added: !!existing.disclaimerAdded, ymyl_required: ymyl, status: existing.status, write_step: existing.writeStep, step_status: existing.stepStatus, has_placeholder: existingHasPlaceholder, placeholder_section_count: existingHasPlaceholder ? 1 : 0 };
        }
      }

      // Acquire project author ctx.userId
      const categoryId = kw.categoryId ? Number(kw.categoryId) : (await db.select({ cid: projectsTable.categoryId }).from(projectsTable).where(eq(projectsTable.id, Number(kw.projectId))).limit(1)).at(0)?.cid ?? 1;

      let pkgInsertId: number | undefined;
      {
        const [rprow] = await db.select({ id: rpTable.id }).from(rpTable).where(eq(rpTable.keywordId, kw.id)).limit(1);
        pkgInsertId = rprow?.id;
      }

      // ============================================================
      // ⭐⭐⭐⭐⭐ MENU #1 STREAMING WRITE P0 CRITICAL: 3 NEW CONTEXT INJECT
      // ============================================================
      // C1: 3-TIER KEYWORD CONTEXT (Pillar → Cluster → Supporting hierarchy sibling keywords)
      //     Pillar tier self-write: pillar_keyword_text = self, cluster_siblings = all tier=cluster same project, supporting_peers = all tier=supporting children of those clusters
      type TierCtx = { pillar_keyword_text: string | null; cluster_siblings: string[]; supporting_peers: string[] };
      const threeTierCtx: TierCtx = { pillar_keyword_text: null, cluster_siblings: [], supporting_peers: [] };
      try {
        if (kw.tier === 'pillar') {
          // PILLAR TIER: pillar_keyword_text = self, cluster_siblings = all tier=cluster same project limit 10, supporting_peers = all tier=supporting same project limit 20
          threeTierCtx.pillar_keyword_text = kw.keywordText;
          if (kw.projectId) {
            const clAll = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'cluster'))).limit(10);
            threeTierCtx.cluster_siblings = clAll.map(r => r.t).filter(Boolean);
            const spAll = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'supporting'))).limit(20);
            threeTierCtx.supporting_peers = spAll.map(r => r.t).filter(Boolean);
          }
        } else if (kw.projectId && kw.clusterId) {
          // Cluster / Supporting tier with clusterId → standard hierarchy same cluster
          const [pillarr] = await db.select({ text: keywordsTable.keywordText }).from(keywordsTable)
            .where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'pillar'), eq(keywordsTable.clusterId, Number(kw.clusterId))))
            .limit(1);
          if (pillarr?.text) threeTierCtx.pillar_keyword_text = pillarr.text;
          const clSibs = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable)
            .where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'cluster'), eq(keywordsTable.clusterId, Number(kw.clusterId))))
            .limit(20);
          threeTierCtx.cluster_siblings = clSibs.map(r => r.t).filter(t => t && t !== kw.keywordText).slice(0, 10);
          const spPeers = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable)
            .where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'supporting'), eq(keywordsTable.clusterId, Number(kw.clusterId))))
            .limit(30);
          threeTierCtx.supporting_peers = spPeers.map(r => r.t).filter(t => t && t !== kw.keywordText).slice(0, 15);
        } else if (kw.projectId) {
          // No clusterId yet: fallback global project-level hierarchy
          const clAll = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'cluster'))).limit(8);
          const spAll = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'supporting'))).limit(15);
          threeTierCtx.cluster_siblings = clAll.map(r => r.t).filter(Boolean);
          threeTierCtx.supporting_peers = spAll.map(r => r.t).filter(Boolean);
          const pillAll = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kw.projectId)), eq(keywordsTable.tier, 'pillar'))).limit(1);
          if (pillAll[0]?.t) threeTierCtx.pillar_keyword_text = pillAll[0].t;
        }
      } catch { /* ignore context query errors keep fallback empty */ }

      // C2: OUTLINE OVERRIDE FROM STEP 2 (if user already generated H1..H6 via AI Outline Editor cur===1)
      let outlineOverride: any = null;
      try {
        // FIRST try write_articles.outlineJson row for this existing article (draft existing already opened in editor)
        if (kw.projectId) {
          const [existingArt] = await db.select({ id: articles.id }).from(articles)
            .where(and(eq(articles.projectId, Number(kw.projectId)), eq(articles.keywordId, kw.id))).limit(1);
          if (existingArt?.id) {
            const [waRow] = await db.select({ o: writeArticles.outlineJson }).from(writeArticles)
              .where(eq(writeArticles.articleId, Number(existingArt.id))).limit(1);
            if (waRow?.o) {
              const parsed = typeof waRow.o === 'string' ? JSON.parse(waRow.o) : waRow.o;
              if (parsed && Array.isArray(parsed.sections) && parsed.sections.length >= 3 && !outlineIsGenericTemplate(parsed)) outlineOverride = parsed;
            }
          }
        }
        // SECOND fallback: check keywords.outline_json custom column if exists (NO ALTER, skip safely)
      } catch { /* keep null fallback uses static buildOutline default */ }

      // C3: DENSITY TARGETS — Priority 1: Keyword Cluster Planner (cluster siblings & supporting peers)
      // We removed SERP related_searches because they often produce excessively long garbage strings that break the article.
      const TARGET_DENSITY_PCT_WRITER = 2;
      const longtailPriority = threeTierCtx.cluster_siblings || [];
      const lsiPriority = threeTierCtx.supporting_peers || [];
      
      const densityTargets = {
        main_keywords: [kw.keywordText],
        longtail_keywords: longtailPriority.filter((v, i, a) => a.indexOf(v) === i && v.trim().length > 0).slice(0, 5),
        lsi_keywords: lsiPriority.filter((v, i, a) => a.indexOf(v) === i && v.trim().length > 0).slice(0, 5),
        max_pct: TARGET_DENSITY_PCT_WRITER,
      };

      // ── P0 TARGET WORD COUNT → DYNAMIC SECTION LENGTH ──
      const writerWordTarget = Number(input.targetWordCount ?? 0) > 0 ? Number(input.targetWordCount) : 3500;

      // WP-B2 (CRITICAL): REQUIRE Research Package BEFORE writing draft (otherwise 100% generic / empty LLM output)
      // EXCEPTION: Allow when input.outlineSections has >=3 sections (user has already generated AI Outline from Step3, baked H1/H2/H3 topics from SERP context) OR force=true emergency regeneration
      const hasSerp = Array.isArray(pkgLite.serp_top10) && pkgLite.serp_top10.length >= 1;
      const hasOverview = String(pkgLite.ai_overview || '').trim().length >= 80;
      const bypassPkgCheck = !!input.force || (Array.isArray(input.outlineSections) && input.outlineSections.length >= 3);
      if (!bypassPkgCheck && (!hasSerp || !hasOverview)) {
        const missing: string[] = [];
        if (!hasSerp) missing.push('SERP Organic Results (serp_top10 = 0 rows)');
        if (!hasOverview) missing.push('AI Overview Summary (ai_overview < 80 chars)');
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `ยังไม่มีข้อมูล Research สำหรับคีย์เวิร์ดนี้ (ขาด: ${missing.join(' + ')}) — กรุณาไปรัน "วิจัยคีย์เวิร์ด / Research" ให้สำเร็จก่อนเริ่มเขียนบทความ. หากคุณเพิ่งรัน Research เมื่อสักครู่ โปรดรอประมาณ 10 วินาที แล้วลองกดอีกครั้ง`,
        });
      }

      // Write workflow step 5: mark running
      const start = Date.now();

      // Generate draft using service (INJECT 3 NEW CONTEXTS: tier hierarchy + step2 outline + density targets + TARGET WORD COUNT)
      let out;
      try {
        out = await ArticleWriterService.writeDraft(ctx, pkgLite, clusterTopic, ymyl, Number(kw.projectId), threeTierCtx, outlineOverride, densityTargets, finalModelCreate, writerWordTarget);
      } catch (e: any) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message || 'Failed to generate draft content.' });
      }
      const durationMs = Date.now() - start;

      // Insert articles row + write_articles workflow row, upsert duplicate keyword
      let articleId: number;
      const [existingArt] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.projectId, Number(kw.projectId)), eq(articles.keywordId, kw.id))).limit(1);
      const d = out.draft;
      if (existingArt) {
        await db.update(articles).set({
          title: d.title, metaTitle: d.meta_title, metaDescription: d.meta_description,
          content: out.markdown_content, categoryId, status: 'draft', updatedAt: new Date(), authorId: Number(authorId),
        }).where(eq(articles.id, existingArt.id));
        articleId = existingArt.id;
      } else {
        const ins = await db.insert(articles).values({
          projectId: Number(kw.projectId), keywordId: kw.id, authorId: Number(authorId), categoryId,
          title: d.title, metaTitle: d.meta_title, metaDescription: d.meta_description,
          content: out.markdown_content, status: 'draft',
        });
        articleId = extractInsertId(ins);
        if (!articleId) {
          const [sel] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.projectId, Number(kw.projectId)), eq(articles.keywordId, kw.id))).limit(1);
          if (sel) articleId = sel.id;
        }
      }
      if (!articleId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to persist articles row (no insertId returned).' });

      // Update keyword written status
      await db.update(keywordsTable).set({ status: 'written' }).where(eq(keywordsTable.id, kw.id));

      // Persist write_articles workflow row step 8 = done draft + eeat_score
      const outlineJsonStr = JSON.stringify(out.outline);
      const clusterIdOrNull = kw.clusterId ? Number(kw.clusterId) : null;
      // WP-B1: Use step_status_override from writeDraft — placeholder sections → stepStatus='fail' (NOT false success)
      const resolvedStepStatus = ((out as any).step_status_override || 'done') as 'done' | 'pending' | 'running' | 'fail';
      const placeholderCount = Number((out as any).placeholder_section_count || 0);
      const hasPlaceholder = !!(out as any).has_placeholder;
      const errorMsgForDb = hasPlaceholder ? `WARN: ${placeholderCount} section(s) = AUTO PLACEHOLDER (LLM 5/5 exhausted). User MUST edit manually before publish.` : null;
      try {
        await db.insert(writeArticles).values({
          articleId,
          researchPackageId: pkgInsertId,
          clusterId: clusterIdOrNull,
          teamId,
          wordCount: Number(out.word_count_total),
          outlineJson: outlineJsonStr,
          disclaimerAdded: out.disclaimer_added ? 1 : 0,
          eeatScore: Math.min(100, Math.max(0, out.eeat_score_est)),
          citationsCount: Number(out.citations_count_total),
          writeStep: 8,
          stepStatus: resolvedStepStatus,
          errorMsg: errorMsgForDb,
        }).onDuplicateKeyUpdate({
          set: {
            writeStep: 8, stepStatus: resolvedStepStatus, wordCount: Number(out.word_count_total),
            eeatScore: Math.min(100, Math.max(0, out.eeat_score_est)),
            citationsCount: Number(out.citations_count_total), disclaimerAdded: out.disclaimer_added ? 1 : 0,
            outlineJson: outlineJsonStr, researchPackageId: pkgInsertId, errorMsg: errorMsgForDb, updatedAt: new Date(),
          },
        });
      } catch (e: any) {
        console.warn('[write.createDraft] write_articles upsert fail:', String(e?.message ?? e).slice(0, 220));
      }

      return {
        ok: true, traceId, phase2Ready: true, from_existing: false,
        draft_id: articleId,
        write_article_id: 0,
        duration_ms: durationMs,
        title: d.title,
        meta: { meta_title: d.meta_title, meta_description: d.meta_description },
        content: out.markdown_content,
        word_count_total: out.word_count_total,
        eeat_score: Math.min(100, Math.max(0, out.eeat_score_est)),
        citations_count: out.citations_count_total,
        disclaimer_added: out.disclaimer_added,
        ymyl_required: out.ymyl_required,
        placeholder_section_count: placeholderCount,
        has_placeholder: hasPlaceholder,
        step_status: resolvedStepStatus,
        write_step: 8,
      };
    }),

  getDraft: protectedProcedure
    .input(z.object({ draftId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db.select({
        id: articles.id, title: articles.title, content: articles.content, status: articles.status,
        projectId: articles.projectId, keywordId: articles.keywordId, categoryId: articles.categoryId,
        metaTitle: articles.metaTitle, metaDescription: articles.metaDescription, authorId: articles.authorId,
        createdAt: articles.createdAt, updatedAt: articles.updatedAt,
        wa_id: writeArticles.id, wordCount: writeArticles.wordCount, eeatScore: writeArticles.eeatScore,
        disclaimerAdded: writeArticles.disclaimerAdded, citationsCount: writeArticles.citationsCount,
        writeStep: writeArticles.writeStep, stepStatus: writeArticles.stepStatus, errorMsg: writeArticles.errorMsg,
        wa_outlineJson: writeArticles.outlineJson,
      }).from(articles).leftJoin(writeArticles, eq(writeArticles.articleId, articles.id)).where(eq(articles.id, input.draftId)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `Draft ${input.draftId} not found.` });
      if (row.projectId) await assertProjectAccess(ctx, Number(row.projectId), { minRole: 'member' }, TRPCError);

      // Load research package (SERP real data) for this draft keyword → pass to WritePage Frontend for Step2 LSI/LT real list
      let pkgLite: ResearchPackageLite = { keyword_text: '', serp_top10: [], paa_questions: [], ai_overview: '', citation_pool: [], is_ymyl: false, ymyldisclaimer_required: false, keyword_id: 0, project_id: 0 };
      try {
        if (row.keywordId) {
          const [kwRow] = await db.select({ id: keywordsTable.id, projectId: keywordsTable.projectId, tier: keywordsTable.tier, clusterId: keywordsTable.clusterId, keywordText: keywordsTable.keywordText }).from(keywordsTable).where(eq(keywordsTable.id, Number(row.keywordId))).limit(1);
          if (kwRow) {
            let pillarKwId = Number(kwRow.id);
            if (kwRow.tier !== 'pillar' && kwRow.clusterId) {
              const [pkw] = await db.select({ id: keywordsTable.id }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kwRow.projectId)), eq(keywordsTable.tier, 'pillar'), eq(keywordsTable.clusterId, Number(kwRow.clusterId ?? 0)))).limit(1);
              if (pkw) pillarKwId = Number(pkw.id);
            }
            const [pkgRow] = await db.select({ pkg: rpTable.packageJson }).from(rpTable).where(eq(rpTable.keywordId, pillarKwId)).limit(1);
            if (pkgRow?.pkg) {
              try {
                const parsed = typeof pkgRow.pkg === 'string' ? JSON.parse(pkgRow.pkg) : pkgRow.pkg;
                (pkgLite as any) = { ...pkgLite, ...(parsed ?? {}) };
              } catch { /* keep fallback */ }
            }
          }
        }
      } catch { /* ignore SERP load fail */ }

      // ── 3-TIER CLUSTER CONTEXT (KCP → Write Page Context Passing) ──
      // When user clicks เขียน from KCP → editor sidebar shows Pillar/Cluster/Supporting hierarchy + peer keywords in same cluster (H1/H2/H3 placements) so user knows what to write.
      let cluster_context: any = null;
      try {
        if (row.keywordId) {
          const [focusKw] = await db.select({
            id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier, clusterId: keywordsTable.clusterId,
            intentSuggestion: keywordsTable.intentSuggestion, difficulty: keywordsTable.difficulty, searchVolume: keywordsTable.searchVolume,
          }).from(keywordsTable).where(eq(keywordsTable.id, Number(row.keywordId))).limit(1);
          if (focusKw) {
            let siblings: any[] = [];
            let clusterName: string | null = null;
            let clusterId: number | null = null;
            if (focusKw.clusterId) {
              clusterId = Number(focusKw.clusterId);
              siblings = await db.select({
                id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier, intentSuggestion: keywordsTable.intentSuggestion,
              }).from(keywordsTable).where(eq(keywordsTable.clusterId, clusterId)).orderBy(keywordsTable.tier, keywordsTable.id).limit(100);
              const [clsRow] = await db.select({ name: clusters.name }).from(clusters).where(eq(clusters.id, clusterId)).limit(1);
              clusterName = clsRow?.name ?? null;
            }
            let pillarKw: any = null;
            const pillars = await db.select({
              id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier, clusterId: keywordsTable.clusterId,
            }).from(keywordsTable).where(and(
              eq(keywordsTable.projectId, Number(row.projectId)),
              eq(keywordsTable.tier, 'pillar' as any),
            )).limit(20);
            if (pillars.length) {
              if (clusterId) {
                const samePillar = pillars.find(p => p.clusterId === clusterId);
                pillarKw = samePillar ?? pillars[0];
              } else {
                pillarKw = pillars[0];
              }
            }
            cluster_context = {
              focus_keyword: { id: focusKw.id, keyword: focusKw.keywordText, tier: focusKw.tier, intent: focusKw.intentSuggestion, kd: focusKw.difficulty, sv: focusKw.searchVolume },
              cluster: clusterId ? { id: clusterId, name: clusterName } : null,
              same_cluster_keywords: siblings.map(s => ({ id: s.id, keyword: s.keywordText, tier: s.tier, intent: s.intentSuggestion })),
              pillar_keyword: pillarKw ? { id: pillarKw.id, keyword: pillarKw.keywordText, tier: pillarKw.tier } : null,
              project_id: row.projectId,
            };
          }
        }
      } catch (e: any) {
        console.warn("[getDraft] cluster_context fetch best-effort skipped:", String(e?.message ?? e).slice(0, 100));
        cluster_context = null;
      }

      // =============== 🔴 OUTLINE LOADER BANNED GUARD (getDraft L3): ถ้า cached outline generic → ส่ง NULL บังคับ FE สร้างใหม่ ===============
      let cachedOutline: any = null;
      try {
        if (row.wa_outlineJson) {
          const parsed = typeof row.wa_outlineJson === 'string' ? JSON.parse(row.wa_outlineJson) : row.wa_outlineJson;
          if (parsed && Array.isArray(parsed.sections) && parsed.sections.length >= 3 && !outlineIsGenericTemplate(parsed)) {
            cachedOutline = parsed;
          }
        }
      } catch { /* parse fail → keep null fallback → FE จะ generateOutline ใหม่เองอัตโนมัติ */ }

      return {
        ok: true,
        draft: {
          id: row.id, title: row.title, content: row.content, status: row.status, keyword_id: row.keywordId,
          category_id: row.categoryId, project_id: row.projectId, author_id: row.authorId,
          meta_title: row.metaTitle ?? '', meta_description: row.metaDescription ?? '',
          created_at: row.createdAt, updated_at: row.updatedAt,
        },
        workflow: row.wa_id ? {
          write_article_id: row.wa_id, word_count: row.wordCount, eeat_score: row.eeatScore,
          disclaimer_added: !!row.disclaimerAdded, citations_count: row.citationsCount,
          write_step: row.writeStep, step_status: row.stepStatus, error_msg: row.errorMsg ?? null,
          outline: cachedOutline, // ถ้า cached outline เป็น Generic → field นี้จะเป็น NULL = FE จะ call generateOutline endpoint เองอัตโนมัติ ไม่ต้องกด Force
          has_placeholder: row.stepStatus === 'fail',
        } : null,
        cluster_context,
        serp_research: {
          organic_top10: Array.isArray(pkgLite?.serp_top10) ? pkgLite.serp_top10.slice(0, 10) : [],
          related_searches: Array.isArray((pkgLite as any)?.related_searches) ? (pkgLite as any).related_searches.slice(0, 30) : [],
          people_also_search: Array.isArray((pkgLite as any)?.people_also_search) ? (pkgLite as any).people_also_search.slice(0, 30) : [],
          paa_questions: Array.isArray(pkgLite?.paa_questions) ? pkgLite.paa_questions.slice(0, 20) : [],
          citation_pool: Array.isArray(pkgLite?.citation_pool) ? pkgLite.citation_pool.slice(0, 50) : [],
          ai_overview: typeof (pkgLite as any)?.ai_overview === 'string' ? (pkgLite as any).ai_overview.slice(0, 6000) : '',
        },
      };
    }),

  publish: protectedProcedure
    .input(z.object({ draftId: z.number().int().positive(), unpublish: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db.select({ id: articles.id, projectId: articles.projectId, status: articles.status }).from(articles).where(eq(articles.id, input.draftId)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `Draft ${input.draftId} not found.` });
      if (!row.projectId) throw new TRPCError({ code: 'BAD_REQUEST', message: '[NO_PROJECT_ID] article row orphan.' });
      await assertProjectAccess(ctx, Number(row.projectId), { minRole: 'admin' }, TRPCError);
      const targetStatus = input.unpublish ? 'draft' : 'published';
      await db.update(articles).set({ status: targetStatus, updatedAt: new Date() }).where(eq(articles.id, input.draftId));
      try {
        await db.update(writeArticles).set({
          writeStep: input.unpublish ? 9 : 10,
          stepStatus: 'done',
          updatedAt: new Date(),
        }).where(eq(writeArticles.articleId, input.draftId));
      } catch { /* ignore */ }
      return {
        ok: true,
        draft_id: input.draftId,
        new_status: targetStatus,
        message: targetStatus === 'published' ? '✅ บทความตีพิมพ์สำเร็จ (EEAT verified workflow step 10)' : 'บทความย้อนกลับเป็นฉบับร่างแล้ว',
        write_step: targetStatus === 'published' ? 10 : 9,
      };
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive(), limit: z.number().int().positive().max(100).default(20), status: z.enum(['draft','published']).optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx, input.projectId, { minRole: 'member' }, TRPCError);
      const where: any[] = [eq(articles.projectId, input.projectId)];
      if (input.status) where.push(eq(articles.status, input.status));
      const rows = await db.select({
        id: articles.id, title: articles.title, status: articles.status, keywordId: articles.keywordId,
        updatedAt: articles.updatedAt, authorId: articles.authorId,
        wordCount: writeArticles.wordCount, eeatScore: writeArticles.eeatScore,
      }).from(articles).leftJoin(writeArticles, eq(writeArticles.articleId, articles.id)).where(and(...where)).orderBy(desc(articles.updatedAt)).limit(input.limit);
      return { ok: true, count: rows.length, items: rows };
    }),

  saveDraft: protectedProcedure
    .input(z.object({
      draftId: z.number().int().positive(),
      title: z.string().max(500).optional(),
      content: z.string().max(200000).optional(),
      metaTitle: z.string().max(200).optional().or(z.null()),
      metaDescription: z.string().max(600).optional().or(z.null()),
      wordCount: z.number().int().min(0).max(500000).optional(),
      eeatScore: z.number().int().min(0).max(100).optional(),
      citationsCount: z.number().int().min(0).max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const traceId = NEW_UUID();
      const [row] = await db.select({
        id: articles.id, projectId: articles.projectId, status: articles.status, authorId: articles.authorId,
      }).from(articles).where(eq(articles.id, input.draftId)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `Draft ${input.draftId} not found.` });
      if (!row.projectId) throw new TRPCError({ code: 'BAD_REQUEST', message: '[NO_PROJECT_ID] article orphan row.' });
      await assertProjectAccess(ctx, Number(row.projectId), { minRole: 'member' }, TRPCError);

      const updates: any = {};
      if (typeof input.title === 'string') updates.title = input.title;
      if (typeof input.content === 'string') updates.content = input.content;
      if (typeof input.metaTitle !== 'undefined') updates.metaTitle = input.metaTitle;
      if (typeof input.metaDescription !== 'undefined') updates.metaDescription = input.metaDescription;
      updates.updatedAt = new Date();

      if (Object.keys(updates).length > 0) {
        await db.update(articles).set(updates).where(eq(articles.id, input.draftId));
      }

      // Upsert write_articles workflow step tracking (no ALTER SQL: reuse cols)
      const waUpdates: any = {};
      if (typeof input.wordCount === 'number') waUpdates.wordCount = input.wordCount;
      if (typeof input.eeatScore === 'number') waUpdates.eeatScore = Math.min(100, Math.max(0, input.eeatScore));
      if (typeof input.citationsCount === 'number') waUpdates.citationsCount = input.citationsCount;
      if (Object.keys(waUpdates).length > 0) {
        waUpdates.updatedAt = new Date();
        try {
          await db.insert(writeArticles).values({
            articleId: input.draftId,
            teamId: await resolveTeamIdForSettings(ctx),
            wordCount: waUpdates.wordCount ?? 0,
            eeatScore: waUpdates.eeatScore,
            citationsCount: waUpdates.citationsCount ?? 0,
            writeStep: 5,
            stepStatus: 'running',
          }).onDuplicateKeyUpdate({ set: waUpdates });
        } catch (e: any) {
          // fallback: old rows might exist — just update the existing one
          try {
            await db.update(writeArticles).set(waUpdates).where(eq(writeArticles.articleId, input.draftId));
          } catch (e2: any) {
            console.warn('[saveDraft] write_articles upsert+update both fail:', String(e2?.message || e2).slice(0, 120));
          }
        }
      }

      return {
        ok: true,
        traceId,
        draft_id: input.draftId,
        saved_at: new Date(),
        message: '✅ บันทึกสำเร็จ (workflow step 5 running editing)',
        changed_cols: Object.keys(updates).length + Object.keys(waUpdates).length,
      };
    }),

  delete: protectedProcedure
    .input(z.object({
      draftId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const traceId = NEW_UUID();
      const [row] = await db.select({
        id: articles.id,
        projectId: articles.projectId,
        title: articles.title,
      }).from(articles).where(eq(articles.id, input.draftId)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `บทความ id=${input.draftId} ไม่พบ` });
      if (!row.projectId) throw new TRPCError({ code: 'BAD_REQUEST', message: '[NO_PROJECT_ID] article orphan row.' });
      await assertProjectAccess(ctx, Number(row.projectId), { minRole: 'member' }, TRPCError);
      const delWa = await db.delete(writeArticles).where(eq(writeArticles.articleId, input.draftId));
      const delArt = await db.delete(articles).where(eq(articles.id, input.draftId));
      const rowCount = Number((delArt as any)?.rowCount ?? (delArt as any)?.affectedRows ?? 0);
      return {
        ok: true,
        traceId,
        deleted_article_id: input.draftId,
        affected_rows: rowCount,
        deleted_workflow_rows: Number((delWa as any)?.rowCount ?? (delWa as any)?.affectedRows ?? 0),
        message: rowCount > 0 ? `✅ ลบบทความ #${input.draftId} เรียบร้อย (${String(row.title || '').slice(0, 60)})` : `⚠️ บทความ id=${input.draftId} ไม่พบเพื่อลบ`,
      };
    }),

  generateOutline: protectedProcedure
    .input(z.object({
      keywordId: z.number().int().positive().optional(),
      draftId: z.number().int().positive().optional(),
      keyword: z.string().min(1).max(255).optional(),
      category: z.string().max(120).optional(),
      intent: z.string().max(120).optional(),
      contentType: z.string().max(120).optional(),
      force: z.boolean().default(false),
      model: z.string().max(120).optional(),
      targetWordCount: z.number().int().min(500).max(20000).optional(),
    }).refine(i =>
      Number(i.keywordId ?? 0) > 0 || Number(i.draftId ?? 0) > 0 || (typeof i.keyword === 'string' && i.keyword.trim().length > 0),
      { message: 'ต้องระบุ keywordId หรือ draftId หรือ keyword text อย่างน้อย 1 อย่าง' }
    ))
    .mutation(async ({ ctx, input }) => {
      const traceId = NEW_UUID();
      const teamSettings = await resolveTeamSettings(ctx);
      const runtimeProvider = String(teamSettings.llmProvider || 'openrouter').toLowerCase();
      // ── SANITIZE SELECTED MODEL: Cross-Provider ID prefix fix
      // OpenRouter = must have provider/model prefix (anthropic/xxx, openai/xxx, google/xxx)
      // Single Provider (openai/anthropic/google) = raw NO prefix (claude-xxx, gpt-xxx, gemini-xxx)
      function sanitizeModelId(selected: string | undefined, provider: string): string {
        const raw = String(selected || '').trim();
        const fallback = (PROVIDER_DEFAULT_MODELS as any)[provider] || (PROVIDER_DEFAULT_MODELS as any).openrouter;
        if (!raw) return fallback;
        // Single Provider → Strip "provider/" prefix if present
        if (provider !== 'openrouter' && raw.includes('/')) {
          const stripped = raw.split('/').slice(1).join('/');
          return stripped ? stripped : fallback;
        }
        // OpenRouter → NEEDS prefix; if missing prefix, fallback server default (avoid 400 Invalid Model)
        if (provider === 'openrouter' && !raw.includes('/')) return fallback;
        return raw;
      }
      const sanitizedModel = sanitizeModelId(input.model, runtimeProvider);

      // ── FRESH START GUARD: Resolve keywordId from raw keyword when user starts from /write without URL params
      let resolvedKeywordId: number = Number(input.keywordId ?? 0);
      let resolvedDraftId: number = Number(input.draftId ?? 0);
      if (resolvedKeywordId === 0 && resolvedDraftId === 0 && typeof input.keyword === 'string' && input.keyword.trim().length > 0) {
        const kwText = input.keyword.trim();
        // Step A: Try to find existing keyword by exact text match
        try {
          const [existingKw] = await db.select({
            id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier,
            projectId: keywordsTable.projectId, categoryId: keywordsTable.categoryId, clusterId: keywordsTable.clusterId,
          }).from(keywordsTable).where(eq(keywordsTable.keywordText, kwText)).limit(1);
          if (existingKw) {
            resolvedKeywordId = Number(existingKw.id);
          }
        } catch (_e) { /* lookup failed, continue to create path */ }

        if (resolvedKeywordId === 0) {
          // Step B: No existing keyword → find user's default project/category and INSERT
          let defaultProjectId: number = 0;
          let defaultCategoryId: number = 0;
          let defaultClusterId: number = 0;
          try {
            // Resolve teamId from existing helper
            const tId = await resolveTeamIdForSettings(ctx);
            // Find any project for this team (first one)
            try {
              const [anyProj] = await db.select({ id: projectsTable.id }).from(projectsTable).limit(1);
              defaultProjectId = anyProj?.id ? Number(anyProj.id) : 1;
            } catch (_e) { defaultProjectId = 1; }
            // Find any category (first one) - skip name match to avoid column mismatch errors
            try {
              const [anyCat] = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1);
              defaultCategoryId = anyCat?.id ? Number(anyCat.id) : 1;
            } catch (_e) { defaultCategoryId = 1; }
            // Find any cluster for the project (first one)
            try {
              if (defaultProjectId > 0) {
                const [anyClus] = await db.select({ id: clusters.id }).from(clusters).where(eq(clusters.projectId, defaultProjectId)).limit(1);
                defaultClusterId = anyClus?.id ? Number(anyClus.id) : 0;
              }
            } catch (_e) { defaultClusterId = 0; }
          } catch (_e) { defaultProjectId = 1; defaultCategoryId = 1; defaultClusterId = 0; }
          // Map intent suggestion enum
          const intentRaw = String(input.intent || 'informational').toLowerCase();
          let intentSuggestion: 'commercial' | 'informational' | 'navigational' | 'transactional' = 'informational';
          if (intentRaw === 'commercial') intentSuggestion = 'commercial';
          else if (intentRaw === 'transactional') intentSuggestion = 'transactional';
          else if (intentRaw === 'navigational') intentSuggestion = 'navigational';
          // INSERT the new keyword using $returningId (mariadb driver syntax)
          try {
            const insertedIds = await db.insert(keywordsTable).values({
              clusterId: defaultClusterId || 0,
              projectId: defaultProjectId,
              categoryId: defaultCategoryId,
              keywordText: kwText,
              intentSuggestion,
              status: 'pending',
              tier: 'supporting',
              isTarget: 0,
            }).$returningId();
            if (Array.isArray(insertedIds) && insertedIds.length && insertedIds[0]?.id) {
              resolvedKeywordId = Number(insertedIds[0].id);
            }
          } catch (insertErr) {
            // Last resort: try find the keyword again (maybe it was inserted by concurrent request)
            try {
              const [retryKw] = await db.select({ id: keywordsTable.id }).from(keywordsTable)
                .where(eq(keywordsTable.keywordText, kwText)).limit(1);
              if (retryKw?.id) resolvedKeywordId = Number(retryKw.id);
            } catch (_retryErr) { /* ignore */ }
          }
        }
      }

      // ── FINAL GUARD: Ensure we have at least one valid ID after all resolution paths
      if (resolvedKeywordId === 0 && resolvedDraftId === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'ไม่สามารถค้นหาหรือสร้าง Keyword ได้ กรุณาเลือกคีย์เวิร์ดจาก Keyword Cluster Planner หรือเพิ่มรายการใหม่' });
      }

      let kwRow: any, projId: number | undefined, catId: number | undefined, draftRowRef: any = null;
      if (resolvedDraftId > 0) {
        const [r] = await db.select({
          id: articles.id, projectId: articles.projectId, categoryId: articles.categoryId, keywordId: articles.keywordId, title: articles.title, status: articles.status,
        }).from(articles).where(eq(articles.id, resolvedDraftId)).limit(1);
        if (!r) throw new TRPCError({ code: 'NOT_FOUND', message: `draftId ${resolvedDraftId} not found.` });
        draftRowRef = r;
        projId = Number(r.projectId);
        catId = Number(r.categoryId ?? 0) || undefined;
        const [kw] = await db.select({ id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier, projectId: keywordsTable.projectId, categoryId: keywordsTable.categoryId, clusterId: keywordsTable.clusterId }).from(keywordsTable).where(eq(keywordsTable.id, Number(r.keywordId ?? 0))).limit(1);
        kwRow = kw ?? { id: 0, keywordText: r.title ?? '(no keyword)', tier: 'supporting', projectId: projId, categoryId: catId, clusterId: 0 };
      } else {
        const [kw] = await db.select({ id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier, projectId: keywordsTable.projectId, categoryId: keywordsTable.categoryId, clusterId: keywordsTable.clusterId }).from(keywordsTable).where(eq(keywordsTable.id, resolvedKeywordId)).limit(1);
        if (!kw) throw new TRPCError({ code: 'NOT_FOUND', message: `keywordId ${resolvedKeywordId} not found.` });
        kwRow = kw;
        projId = Number(kw.projectId);
        catId = Number(kw.categoryId ?? 0) || undefined;
      }
      if (!projId) throw new TRPCError({ code: 'BAD_REQUEST', message: '[NO_PROJECT_ID] keyword/project missing FK.' });
      await assertProjectAccess(ctx, Number(projId), { minRole: 'member' }, TRPCError);
      const teamId = await resolveTeamIdForSettings(ctx);

      // =============== 🔴 GUARD DEPRECATED: NOW USES TOP-FILE GLOBAL outlineIsGenericTemplate() ===============
      // (OLD local 8-substring list + helpers DELETED 2026-09-16 — mismatch root cause of 60วันไม่คืบหน้า)
      // All 3 call sites below now call GLOBAL 16-substring outlineIsGenericTemplate (see L105)

      // Existing outline lookup (ถ้ามี banned substring → ทิ้ง cache ไปเลย ถือว่า INVALID ไม่สนใจ !force อีกต่อไป)
      let existingOutline: any = null;
      if (draftRowRef && !input.force) {
        const [wa] = await db.select({ outline: writeArticles.outlineJson }).from(writeArticles).where(eq(writeArticles.articleId, Number(draftRowRef.id))).limit(1);
        if (wa?.outline) {
          try { existingOutline = typeof wa.outline === 'string' ? JSON.parse(wa.outline) : wa.outline; } catch { existingOutline = null; }
          if (outlineIsGenericTemplate(existingOutline)) existingOutline = null;
        }
      }

      const sectionSchema = z.object({ heading_level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), heading_text: z.string().min(2).max(255), word_target_min: z.number().int().positive().default(200), word_target_max: z.number().int().default(0), key_points: z.array(z.string().min(0)).default([]) });
      const outSchema = z.object({ title: z.string().min(2).max(255).optional(), sections: z.array(sectionSchema).min(4) });

      function buildStaticOutline(kwText: string, serp: any[], faqs: any[], isYmyl: boolean): { title: string; sections: any[] } {
        const title = `คู่มือ ${kwText} ปี 2569 — ข้อมูลเชิงลึกทันสมัย มีหลักฐานอ้างอิง (EEAT)`;
        let sections: any[] = [
          { heading_level: 1, heading_text: title, word_target_min: 0, key_points: [] },
        ];
        // H2 #1: ใช้ชื่อจริง จาก SERP Top 3 title — FALLBACK 100% SAFE NON-BANNED (ห้ามใช้ คืออะไร บทนำและบริบท เด็ดขาด)
        const s0safe = `${kwText} — สิ่งที่คุณต้องทราบก่อนตัดสินใจปี 2569`;
        const s0title = serp?.[0]?.title ? String(serp[0].title).slice(0, 160).trim() : s0safe;
        if (headingContainsGeneric(s0title)) {
          // ถ้า SERP title ตัวเอง (เว็บไซต์อื่น) มี Banned substring ในชื่อ → ใช้ safe fallback แทน (ยึดกฎ user ไม่ยอมให้เจอแม้แต่จากเว็บอื่น)
          sections.push({ heading_level: 2, heading_text: s0safe, word_target_min: 250, key_points: serp.slice(0, 3).map((r: any, i) => `[${i+1}] ${String(r.title ?? '').slice(0, 150)} — ${String(r.snippet ?? '').slice(0, 150)}`).filter(Boolean) });
        } else {
          sections.push({ heading_level: 2, heading_text: s0title, word_target_min: 250, key_points: serp.slice(0, 3).map((r: any, i) => `[${i+1}] ${String(r.title ?? '').slice(0, 150)} — ${String(r.snippet ?? '').slice(0, 150)}`).filter(Boolean) });
        }
        // H2 #2-H2 #4: ดึงชื่อมาจาก SERP rank 2,3,4 title จริง = ไม่เหมือนกันทุกคีย์ (ตรงตาม complaint user)
        for (let i = 1; i <= 3; i++) {
          const ref = serp?.[i];
          if (ref?.title) {
            let t = String(ref.title).slice(0, 180).trim();
            // SAFETY FILTER: ถ้า SERP title ของเว็บอื่น มี substring ติด Banned list → ไม่เอาชื่อนั้น ใช้ safe generic แทน (zero tolerance)
            if (headingContainsGeneric(t)) {
              t = `ประเด็นหลักที่ ${i} เกี่ยวกับ ${kwText} จากผลการค้นหาจริง`;
            }
            sections.push({ heading_level: 2, heading_text: t, word_target_min: 250, key_points: [ `อ้างอิง ${i+1}: ${String(ref.snippet ?? '').slice(0, 200)}`, `แหล่งที่มา: ${String(ref.url ?? '').slice(0, 150)}` ] });
          }
        }
        // H2 จาก PAA FAQ ถ้ามี (1 H2 ครอบ FAQ) — ส่วนนี้ไม่มีคำว่า FAQ เป็นภาษาไทย ปลอดภัยต่อ 16 banned
        if (Array.isArray(faqs) && faqs.length >= 1) {
          const faqH2: any = { heading_level: 2, heading_text: `คำถามที่พบบ่อยเกี่ยวกับ ${kwText} (จาก Google จริง)`, word_target_min: 250, key_points: [] };
          faqs.slice(0, 4).forEach((p: any, i: number) => {
            faqH2.key_points.push(`Q${i+1}: ${String(p.question ?? '').slice(0, 180)} → A: ${String(p.snippet ?? '').slice(0, 180)}`);
            if (i < 2) {
              let pq = String(p.question ?? `คำถาม ${i+1}`).slice(0, 180);
              if (headingContainsGeneric(pq)) pq = `ประเด็นย่อยที่น่าสนใจ ${i+1} ของ ${kwText}`;
              sections.push({ heading_level: 3, heading_text: pq, word_target_min: 120, key_points: [String(p.snippet ?? 'คำตอบเชิงลึกอ้างอิงจาก SERP').slice(0, 200)] });
            }
          });
          sections.splice(2 + Math.min(3, (serp?.length ?? 0)), 0, faqH2);
        }
        // YMYL Disclaimer — ปลอดภัย ไม่อยู่ใน 16 banned
        if (isYmyl) sections.push({ heading_level: 2, heading_text: `ข้อควรระวัง / คำเตือนความเสี่ยง (${kwText})`, word_target_min: 250, key_points: ['เงื่อนไขความเสี่ยง 5 ข้อ', 'ข้อจำกัด / ไม่รับประกันผลลัพธ์', 'ขอคำแนะนำจากผู้เชี่ยวชาญก่อนดำเนินการ'] });
        // H2 สุดท้าย — 100% SAFE NO BANNED: ห้ามใช้ สรุปและคำแนะนำที่สำคัญ / (Key Takeaways)
        sections.push({ heading_level: 2, heading_text: `บทเรียนและข้อเสนอแนะสุดท้ายสำหรับ ${kwText} ปี 2569`, word_target_min: 250, key_points: serp.slice(0, 3).map((r: any) => `บทเรียนสำคัญจาก SERP: ${String(r.snippet ?? r.title ?? '').slice(0, 180)}`).filter(Boolean) });
        // H3 supplement ต้อง ≥ 2 ตามกฎเก่า (จะได้ไม่ fallback ซ้ำ)
        const h3Count = sections.filter((s: any) => Number(s.heading_level) === 3).length;
        if (h3Count < 2) {
          const ref5 = serp?.[4] ?? serp?.[1];
          const ref6 = serp?.[5] ?? serp?.[2];
          if (ref5?.title) {
            let t5 = String(ref5.title).slice(0, 180);
            if (headingContainsGeneric(t5)) t5 = `เคสจริงที่ 1 การใช้ ${kwText} และผลลัพธ์`;
            sections.splice(4, 0, { heading_level: 3, heading_text: t5, word_target_min: 120, key_points: [String(ref5.snippet ?? '').slice(0, 200)] });
          }
          if (ref6?.title) {
            let t6 = String(ref6.title).slice(0, 180);
            if (headingContainsGeneric(t6)) t6 = `เคสจริงที่ 2 การใช้ ${kwText} และผลลัพธ์`;
            sections.splice(5, 0, { heading_level: 3, heading_text: t6, word_target_min: 120, key_points: [String(ref6.snippet ?? '').slice(0, 200)] });
          }
        }
        // Hard min 9 sections guard
        let extraIdx = 6;
        while (sections.length < 9 && extraIdx < 10 && serp?.[extraIdx]?.title) {
          let te = String(serp[extraIdx].title).slice(0, 180);
          if (headingContainsGeneric(te)) te = `ข้อมูลเชิงลึกอันดับ ${extraIdx+1} เกี่ยวกับ ${kwText}`;
          sections.splice(sections.length - 1, 0, { heading_level: 2, heading_text: te, word_target_min: 250, key_points: [String(serp[extraIdx].snippet ?? '').slice(0, 200)] });
          extraIdx++;
        }
        if (sections.length < 9) {
          // 100% SAFE PAD HEADINGS (VERIFIED ZERO OCCURRENCE IN 16 BANNED LIST):
          const safePads: any[] = [
            { heading_level: 2, heading_text: `ประเด็นสำคัญที่ต้องทราบเกี่ยวกับ ${kwText} ก่อนตัดสินใจ`, word_target_min: 250, key_points: [] },
            { heading_level: 2, heading_text: `ข้อเสีย / ข้อจำกัดของ ${kwText} ที่แทบไม่มีใครบอก`, word_target_min: 250, key_points: [] },
            { heading_level: 2, heading_text: `ข้อสังเกตใหม่ 2569 เกี่ยวกับ ${kwText} จากแหล่งข้อมูลจริง`, word_target_min: 250, key_points: [] },
            { heading_level: 3, heading_text: `เคสจริงประยุกต์ใช้ ${kwText} และผลลัพธ์ที่ได้`, word_target_min: 120, key_points: [] },
            { heading_level: 3, heading_text: `ตัวอย่างการใช้งาน ${kwText} ในสถานการณ์จริง`, word_target_min: 120, key_points: [] },
          ];
          for (const pad of safePads) { if (sections.length >= 9) break; sections.splice(sections.length - 1, 0, pad); }
        }

        // =============== 🔴 FINAL NUCLEAR ZERO-TOLERANCE VALIDATION LOOP ===============
        // ถ้าผ่านข้างบนยังไงก็ตาม วนลูปเช็คทุก heading; ถ้าเจอ banned → replace ทีละอันด้วย SAFE GENERIC จนกว่าจะผ่าน 0
        // (ควรจะไม่เกิดขึ้นในทางปฏิบัติ แต่เป็น Belt + Suspenders 3 ชั้น)
        let safetyLoop = 0;
        while (safetyLoop < 5 && outlineIsGenericTemplate({ title, sections })) {
          safetyLoop++;
          const safeFallbackH2 = [
            `ภาพรวมและประเด็นหลักของ ${kwText} ปี 2569`,
            `ข้อมูลสำคัญที่ต้องทราบเกี่ยวกับ ${kwText}`,
            `การวิเคราะห์เชิงลึกของ ${kwText} จากแหล่งอ้างอิงจริง`,
            `ข้อดีข้อเสียและข้อจำกัดของ ${kwText}`,
            `บทเรียนและข้อเสนอแนะสุดท้ายสำหรับ ${kwText}`,
          ];
          const safeFallbackH3 = [
            `รายละเอียดย่อยที่ 1 ของ ${kwText}`,
            `รายละเอียดย่อยที่ 2 ของ ${kwText}`,
            `รายละเอียดย่อยที่ 3 ของ ${kwText}`,
          ];
          let fbh2 = 0, fbh3 = 0;
          for (let si = 0; si < sections.length; si++) {
            const sec = sections[si];
            if (!sec) continue;
            const ht = String(sec.heading_text ?? '');
            if (Number(sec.heading_level) === 1) continue; // H1 ปลอดภัย ตรวจเฉพาะ H2+
            if (headingContainsGeneric(ht)) {
              if (Number(sec.heading_level) === 2) {
                sections[si] = { ...sec, heading_text: safeFallbackH2[fbh2 % safeFallbackH2.length] };
                fbh2++;
              } else {
                sections[si] = { ...sec, heading_text: safeFallbackH3[fbh3 % safeFallbackH3.length] };
                fbh3++;
              }
            }
          }
        }
        return { title, sections: sections.slice(0, 14) };
      }

      let catName = '';
      if (catId) {
        const [c] = await db.select({ name: categoriesTable.name }).from(categoriesTable).where(eq(categoriesTable.id, Number(catId))).limit(1);
        catName = c?.name ?? '';
      }
      const catNameTrim = String(catName || '').trim();
      const isCatYmyl = /(YMYL|คาสิโน|พนัน|สุขภาพ|การแพทย์|ยา|การเงิน|การลงทุน|หุ้น|กองทุน|ประกัน|สินเชื่อ)/i.test(catNameTrim);

      if (!existingOutline) {
        // Pkg evidence for context (pillar's research pkg if cluster/supporting)
        let serpTop10: any[] = [], paa: any[] = [], aiOverview = '';
        let relatedSearches: string[] = [], peopleAlsoSearch: string[] = [];
        {
          let pillarKwId = Number(kwRow.id);
          if (kwRow.tier !== 'pillar' && kwRow.clusterId) {
            const [pkw] = await db.select({ id: keywordsTable.id }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(projId)), eq(keywordsTable.tier, 'pillar'), eq(keywordsTable.clusterId, Number(kwRow.clusterId ?? 0)))).limit(1);
            if (pkw) pillarKwId = Number(pkw.id);
          }
          const [pkgRow] = await db.select({ pkg: rpTable.packageJson }).from(rpTable).where(eq(rpTable.keywordId, pillarKwId)).limit(1);
          if (pkgRow?.pkg) {
            try {
              const p = typeof pkgRow.pkg === 'string' ? JSON.parse(pkgRow.pkg) : pkgRow.pkg;
              if (Array.isArray(p?.serp_top10)) serpTop10 = p.serp_top10.slice(0, 10);
              if (Array.isArray(p?.paa_questions)) paa = p.paa_questions.slice(0, 6);
              if (typeof p?.ai_overview === 'string') aiOverview = p.ai_overview.slice(0, 2400);
              if (Array.isArray(p?.related_searches)) relatedSearches = p.related_searches.slice(0, 12);
              if (Array.isArray(p?.people_also_search)) peopleAlsoSearch = p.people_also_search.slice(0, 12);
            } catch { /* ignore parse fail */ }
          }
        }
        // Fallback brand voice if any
        let bvPrelude = '';
        // ── P0 TARGET WORD COUNT → DYNAMIC OUTLINE SIZE ──
        const wordTarget = Number(input.targetWordCount ?? 0) > 0 ? Number(input.targetWordCount) : 3500;
        const h2Ideal = Math.max(3, Math.min(18, Math.round(wordTarget / 380)));
        const h2Min = Math.max(3, Math.round(h2Ideal * 0.78));
        const h2Max = Math.max(h2Min + 1, Math.round(h2Ideal * 1.22));
        const avgWordsPerH2 = Math.max(180, Math.round((wordTarget * 0.92) / Math.max(1, h2Ideal)));
        const avgWordsPerH3 = Math.max(90, Math.round(avgWordsPerH2 * 0.55));
        const wordBudgetLine = `USER EXPLICIT TARGET ARTICLE LENGTH: ${wordTarget.toLocaleString()} WORDS TOTAL. Translate this into outline sizing: GENERATE ${h2Min}-${h2Max} H2 SECTIONS (ideal ~${h2Ideal}) so body + metadata + wrap naturally hits ~${wordTarget.toLocaleString()} words. H2 word_target_min=${avgWordsPerH2} each, H3 word_target_min=${avgWordsPerH3} each. DO NOT make a tiny 3-H2 outline for a 4500-word article (that forces keyword stuffing). Do not exceed ${h2Max} H2s either.`;
        try {
          const { LlmService } = await import('../services/llmClient.js');
          const llm = await LlmService.forContext(ctx);
          const system = `${wordBudgetLine}\n\nYou are a Thai/English SEO Outline Generator. STRICT JSON OUTPUT ONLY NO FENCES. Output {sections:[{heading_level:1-6, heading_text, word_target_min, key_points:string[]}]}. Language must match the keyword language (Thai if Thai characters present). CREATIVE FREEDOM + EVIDENCE-BASED GUIDELINES ONLY (NOT FIXED MINIMUMS — FOCUS ON QUALITY OVER QUANTITY): H1 heading_level=1 ONCE at index 0. H2 sections (heading_level=2): Create ${h2Min}-${h2Max} H2 sections (target H2 count = ${h2Ideal}) — use however many the SERP evidence justifies within this range to hit ${wordTarget.toLocaleString()} total words. H3 subsections: Sprinkle PAA questions as H3 subsections under major H2 topics whenever they naturally fit (no hard minimum). Word targets MANDATORY: H2=~${avgWordsPerH2} words each (word_target_min=${avgWordsPerH2}), H3=~${avgWordsPerH3} words each (word_target_min=${avgWordsPerH3}) (adjust to fit topic). key_points = 2-5 actionable SERP-informed bullets per section that match user intent. NO markdown. NO trailing commas. ${isCatYmyl ? 'IMPORTANT YMYL CATEGORY: ADD AT LEAST ONE EXTRA H2 SECTION "ข้อควรระวัง / คำเตือนความเสี่ยง" SOMEWHERE IN THE MIDDLE (AFTER How-to LIKE SECTION).' : ''}\n\nMANDATORY ABSOLUTE RULE (ZERO EXCEPTIONS): EVERY H2/H3 MUST BE EVIDENCE-BASED FROM SERP — NO GENERIC TEMPLATES. Method: (1) Copy/paraphrase the EXACT titles from SERP organic rank 1-5 directly into H2 heading_text. (2) Use real PAA questions as H3 subsections. Make the outline UNIQUE for every keyword using real Google results. ห้ามใช้ชื่อหัวข้อครอบจักรวาลที่ซ้ำกันทุกบทความ — อ้างอิงตามหลักฐาน SERP เท่านั้น\n\n═══════════════════════════════════════════════\n[HEADING PSYCHOLOGY 4 TECHNIQUES — NON-NEGOTIABLE FOR ALL H2 HEADINGS (ห้ามหัวข้อน่าเบื่อแบบรายงานวิชาการ)]\n  T1 BENEFIT-DRIVEN: เปลี่ยนจากนามธรรม → ผลลัพธ์ที่จับต้องได้ (ตั้งชื่อว่าผู้อ่านจะได้อะไรกลับไป ไม่ใช่แค่ \"ความสำคัญของ X\" แต่ต้องเป็น \"X อย่างไรให้ได้ผล A และไม่เกิดปัญหา B\")\n  T2 NUMBERS / CHECKLISTS / TIMEBOX: ใส่ตัวเลขหรือกรอบเวลาที่ชัดเจน เช่น \"เช็กลิสต์ 5 จุด\", \"3 นาที\" , \"ปี 2569\", \"อันดับ 1–3\" เพื่อให้หัวข้อมี Specifics จับต้องได้\n  T3 PAIN POINTS / HIDDEN MISTAKES: จี้จุดเจ็บหรือข้อผิดพลาดที่คนมองข้ามที่เกี่ยวข้องกับหัวข้อ เช่น \"ทำไม X ถึงล้มเหลวเสมอ?\", \"เปิดเบื้องหลังข้อผิดพลาด 3 อย่างที่คนทำผิดทุกครั้ง\"\n  T4 CURIOSITY TRIGGER: ใช้คำถามปลายเปิด หรือประโยค hook ที่คนค้นหาคิดถามตัวเองอยู่แล้ว เช่น \"X แบบไหนถูกใจ Search Engine จริงๆ?\", \"มีเทคนิคลับที่แทบไม่มีใครบอกไหมว่า...\"\n[HEADING BLACKLIST VERBATIM — ห้ามมีคำเหล่านี้ใน H2/H3 heading_text แม้แต่ 1 คำ (0 TOLERANCE — ทางเดียวคือ Regenerate):]\n  ❌ บทนำ | บทสรุป | ข้อดีและข้อเสีย | ข้อดี-ข้อเสีย | ความสำคัญของ | ความสำคัญ | ปัจจัยที่ส่งผลต่อ | ปัจจัยที่เกี่ยวข้อง\n[H2 vs H3 STRUCTURE DISTINCTION]:\n  • H2 = ประเด็นหลักที่ชวนคลิก (ใช้ T1-T4 ข้างบน), มี Keyword หลักซ่อนอยู่แนบเนียน (ไม่ยัดกลืนไปกับ hook/ประโยคคำถาม)\n  • H3 = ขั้นตอนปฏิบัติการหรือมิติย่อยกระชับ สั้น ชี้เฉพาะเจาะจง ชวนกดอ่านต่อ (ไม่ต้องยาวเหมือน H2)\n[A/B STYLE VARIATIONS REQUIREMENT — EVERY H2 MUST COVER 2 STYLES INSIDE heading_text GENERATION]:\n  สำหรับคิดหัวข้อ H2 ทุกอัน ให้ AI เลือก 1 ใน 2 สไตล์ (สลับกันไม่ซ้ำ Style ติดต่อกัน):\n    ✦ Style A — How-To / แก้ปัญหาตรงจุด (เน้น Pain Point + วิธีแก้ + ผลลัพธ์)\n    ✦ Style B — Curiosity / ผลลัพธ์ / เช็กลิสต์ตัวเลข (เน้น Numbers + Curiosity Trigger + Benefit)\n═══════════════════════════════════════════════`;
          const serpHeadlines = serpTop10.length > 0
            ? serpTop10.map((r, i) => `${i + 1}. TIT: ${r.title ?? ''}  SNIP: ${String(r.snippet ?? '').slice(0, 200)}`).filter(Boolean).join('\n')
            : '(no SERP data yet — generate a general but authoritative outline)';
          const peopleAsk = paa.length > 0 ? paa.map((p, i) => `${i + 1}. Q: ${p.question ?? ''}  A: ${String(p.snippet ?? '').slice(0, 180)}`).filter(Boolean).join('\n') : '';
          const realLongtails = relatedSearches.length > 0 ? `\n\nLONGTAIL REAL (google related searches):\n${relatedSearches.slice(0, 8).join('\n')}` : '';
          const realLSI = peopleAlsoSearch.length > 0 ? `\n\nLSI REAL (people also search):\n${peopleAlsoSearch.slice(0, 8).join('\n')}` : '';
          const user = `CATEGORY: ${catName || 'General'}\n\n[CONTENT STRATEGIST ROLE HEADING GENERATION — USER VERBATIM TEMPLATE (ต้องปฏิบัติตามทุกประการ)]\nหน้าที่ของคุณคือ Content Strategist ระดับมืออาชีพ ช่วยวางโครงร่างบทความ (Outline) ภายใต้หัวข้อใหญ่: \"${kwRow.keywordText}\"\nกลุ่มเป้าหมายคือ: ผู้ที่ค้นหา keyword \"${kwRow.keywordText}\" บน Google (คนทั่วไป / นักการตลาด / เจ้าของธุรกิจตามธรรมชาติของหัวข้อ)\nKeyword หลักที่ต้องมี: \"${kwRow.keywordText}\"\n\n[HEADING 4 IRON RULES (บังคับ 100% ไม่มีข้อยกเว้น)]\n1. ห้ามใช้คำทื่อๆ ซ้ำซาก BLACKLIST (ข้อใดข้อหนึ่งติด = ผลลัพธ์ไม่ผ่าน): ห้ามมีคำว่า \"บทนำ\", \"บทสรุป\", \"ข้อดีและข้อเสีย\", \"ข้อดี-ข้อเสีย\", \"ความสำคัญของ\", \"ความสำคัญ\", \"ปัจจัยที่ส่งผลต่อ\", \"ปัจจัยที่เกี่ยวข้อง\" ในชื่อ H2/H3 แม้แต่ 1 ตำแหน่ง\n2. คุมสัดส่วน H2 VS H3: \n   • H2 = ประเด็นหลัก ชวนคลิก ใช้ T1 Benefit / T2 Numbers / T3 Pain / T4 Curiosity (สลับ Style ไม่ซ้ำกัน 2-3 อันดับแรก)\n   • H3 = ขั้นตอนปฏิบัติการ หรือมิติย่อยกระชับ ชี้เฉพาะเจาะจง ชวนอ่านต่อ\n3. Keyword ผสมแนบเนียน: ไม่ยัด Keyword ทับๆ แต่ให้กลืนไปกับประโยคบอกเล่า หรือคำถาม Hook\n4. H2 ใส่ Heartbeat เนื้อหา: ใต้ heading_text 2-3 ประเด็นย่อย (key_points) เล่าเรื่องอะไรได้บ้าง เพื่อเตรียม Body Generation ต่อไป\n\nTARGET TOTAL ARTICLE LENGTH (MANDATORY RESPECT): ${wordTarget.toLocaleString()} WORDS → ${h2Min}-${h2Max} H2 sections (ideal ${h2Ideal}), H2≈${avgWordsPerH2}w, H3≈${avgWordsPerH3}w.\n\nSERP TOP10 (ORGANIC TITLES + SNIPPETS EVIDENCE):\n${serpHeadlines}\n${peopleAsk ? `\\nPEOPLE_ALSO_ASK (from SERP real questions):\n${peopleAsk}` : ''}${realLongtails}${realLSI}${aiOverview ? `\\n\\nSERP OVERVIEW SUMMARY:\n${aiOverview}` : ''}\n\nGUIDELINES (PRIORITY #1 = MATCH TOTAL ${wordTarget.toLocaleString()} WORD BUDGET + QUALITY EVIDENCE):\n1. MUST HAVE EXACTLY 1 HEADING_LEVEL=1 (H1) at index 0 of sections array (H1 is required, everything else flexible). H1 word_target_min=0.\n2. H2 sections (heading_level=2): BUILD EXACTLY ${h2Min}-${h2Max} H2 sections (TARGET H2 COUNT = ${h2Ideal}) to hit article total ~${wordTarget.toLocaleString()} words — NATURAL SERP evidence fit WITHIN THIS RANGE. If 4500-word target → DO NOT stop at 3-4 H2, that is TOO FEW and forces stuffing. word_target_min EVERY H2 = ${avgWordsPerH2}.\n3. H3 subsections (heading_level=3): Sprinkle PAA questions as H3 subsections UNDER RELEVANT H2 topics whenever PAA fits that H2 naturally. If PAA empty → ~1 H3 per 2-3 H2 minimum so article structure has depth. word_target_min EVERY H3 = ${avgWordsPerH3}.\n4. EVIDENCE-BASED H2 ONLY (PRIMARY ZERO-TOLERANCE RULE — DO NOT VIOLATE): Copy/paraphrase actual SERP organic rank 1-5 TITLES into H2 heading_text DIRECTLY then REWRITE using Heading Psychology T1-T4 + Style A/B Alternate (ยังคงรู้เรื่องเดิม แต่ตั้งชื่อใหม่น่าอ่าน ไม่ซ้ำกับเว็บอื่น). H2 heading_text MUST be real topics from SERP evidence — NO generic template headings.\n5. FAQ: If PAA list >=3 then sprinkle PAA questions as H3 subsections under relevant H2. If PAA<3 then skip FAQ entirely is fine.\n6. NEVER return only 1 or 2 sections total. Minimum = 3 sections total (at least H1 + 2 other headings H2/H3 combined). TOTAL valid sections MUST be >= H1+${h2Min}+2 (roughly).\n7. word_target_min PER SECTION: H1=0, EVERY H2 = ${avgWordsPerH2}, EVERY H3 = ${avgWordsPerH3}. This is mandatory so the writer step distributes ${wordTarget.toLocaleString()} words evenly across sections WITHOUT over-stuffing any single section.\n8. title field in root = SEO catchy H1 string 40-60 chars including keyword and year 2569.\n9. Each section key_points MUST reference actual EVIDENCE from the SERP_TOP10 snippets and PAA answers above with concrete evidence citations (e.g., [SERP1], [PAA2]). Generate 3-5 key_points per H2, 2-3 per H3.`;
          const parsed = await llm.chatStructured(system + (bvPrelude || ''), user, outSchema, { maxTokens: 4096, temperature: 0.2, model: sanitizedModel });
          existingOutline = { sections: Array.isArray(parsed?.sections) ? parsed.sections : [], title: parsed?.title ?? kwRow.keywordText };
          const secs: any[] = Array.isArray(existingOutline.sections) ? existingOutline.sections : [];
          const countH1 = secs.filter((s: any) => Number(s?.heading_level) === 1).length;
          const countH2 = secs.filter((s: any) => Number(s?.heading_level) === 2).length;
          const countH3 = secs.filter((s: any) => Number(s?.heading_level) === 3).length;
          const totalValid = secs.filter((s: any) => Number(s?.heading_level) >= 1 && Number(s?.heading_level) <= 6).length;
          // 🟢 AUDIT PLAN RELAX: Accept LLM output freely if JSON is valid + H1 exists + MINIMUM 3 sections total (H1 + 2 others) + NO Generic banned headings
          //    OLD: countH2>=5 AND countH3>=2 AND totalValid>=9 (rigid floor → static swap → 3-4 outline every keyword)
          //    NEW: only fail on catastrophic issues (no H1 / fewer than 3 total sections / generic detected) → NEVER swap to static for count mismatch
          const passed = (countH1 === 1) && (totalValid >= 3) && (!outlineIsGenericTemplate(existingOutline));
          // 🚨 DELETED: !passed → buildStaticOutline override (L877-881 OLD BLOCK). We ONLY fall back to static on:
          //    (A) LLM throws an error (catch block below), OR (B) Generic Banned 16 substrings detected (LAST-MILE GUARD below)
          //    We NO LONGER throw away perfectly valid LLM output just because countH2 is 4 instead of 5 (that's 90% of the bug!).
        } catch (e: any) {
          const staticBuilt = buildStaticOutline(kwRow.keywordText, serpTop10, paa, isCatYmyl);
          existingOutline = staticBuilt;
        }
        // FINAL LAST-MILE GUARD (Belt and Suspenders — NON-NEGOTIABLE 16 BANNED SUBSTRINGS):
        // ถึงแม้ LLM จะส่งผ่านทุกเงื่อนไข แต่ถ้าเจอ Banned headings ก็ยังต้อง static ทิ้งทันที (ไม่รอด)
        if (outlineIsGenericTemplate(existingOutline)) {
          existingOutline = buildStaticOutline(kwRow.keywordText, serpTop10, paa, isCatYmyl);
        }
      }

      // Persist: upsert writeArticles if draftRowRef exists
      if (draftRowRef?.id) {
        const json = typeof existingOutline === 'string' ? existingOutline : JSON.stringify(existingOutline);
        try {
          await db.insert(writeArticles).values({ articleId: Number(draftRowRef.id), teamId, outlineJson: json, writeStep: 2, stepStatus: 'done', wordCount: 0 }).onDuplicateKeyUpdate({ set: { outlineJson: json, writeStep: 2, stepStatus: 'done', updatedAt: new Date() } });
        } catch (e2: any) { try { await db.update(writeArticles).set({ outlineJson: json, writeStep: 2, stepStatus: 'done', updatedAt: new Date() }).where(eq(writeArticles.articleId, Number(draftRowRef.id))); } catch {} }
      }
      return { ok: true, traceId, outline: existingOutline, persisted: !!draftRowRef?.id, sections_count: existingOutline?.sections?.length ?? 0 };
    }),

  rewriteSection: protectedProcedure
    .input(z.object({
      draftId: z.number().int().positive(),
      sectionHeading: z.string().min(1).max(500),
      currentText: z.string().min(1).max(50000),
      projectId: z.number().int().positive().optional(),
      model: z.string().max(120).optional(),
      threeTierCtx: z.object({
        pillar_keyword_text: z.string().max(500).nullable(),
        cluster_siblings: z.array(z.string().max(500)).default([]),
        supporting_peers: z.array(z.string().max(500)).default([]),
      }).optional().nullable(),
      densityTargets: z.object({
        main_keywords: z.array(z.string().max(500)).default([]),
        longtail_keywords: z.array(z.string().max(500)).default([]),
        lsi_keywords: z.array(z.string().max(500)).default([]),
        max_pct: z.number().min(0).max(20).default(2),
      }).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const traceId = NEW_UUID();
      // ── SANITIZE SELECTED MODEL (Cross-Provider ID prefix guard)
      const teamSettingsRewrite = await resolveTeamSettings(ctx);
      const runtimeProviderRewrite = String(teamSettingsRewrite.llmProvider || 'openrouter').toLowerCase();
      function sanitizeModelIdRewrite(selected: string | undefined, provider: string): string {
        const raw = String(selected || '').trim();
        const fallback = (PROVIDER_DEFAULT_MODELS as any)[provider] || (PROVIDER_DEFAULT_MODELS as any).openrouter;
        if (!raw) return fallback;
        if (provider !== 'openrouter' && raw.includes('/')) {
          const stripped = raw.split('/').slice(1).join('/');
          return stripped ? stripped : fallback;
        }
        if (provider === 'openrouter' && !raw.includes('/')) return fallback;
        return raw;
      }
      const finalModelRewrite = sanitizeModelIdRewrite(input.model, runtimeProviderRewrite);
      const [artRow] = await db.select({
        id: articles.id, projectId: articles.projectId, keywordId: articles.keywordId, categoryId: articles.categoryId,
      }).from(articles).where(eq(articles.id, input.draftId)).limit(1);
      if (!artRow) throw new TRPCError({ code: 'NOT_FOUND', message: `Draft ${input.draftId} not found.` });
      const projId = Number(artRow.projectId ?? input.projectId ?? 0);
      if (!projId) throw new TRPCError({ code: 'BAD_REQUEST', message: '[NO_PROJECT_ID] article orphan row.' });
      await assertProjectAccess(ctx, projId, { minRole: 'member' }, TRPCError);

      let kwRow: any = null;
      if (artRow.keywordId) {
        const [kw] = await db.select({
          id: keywordsTable.id, keywordText: keywordsTable.keywordText, tier: keywordsTable.tier,
          projectId: keywordsTable.projectId, clusterId: keywordsTable.clusterId,
        }).from(keywordsTable).where(eq(keywordsTable.id, Number(artRow.keywordId))).limit(1);
        kwRow = kw;
      }

      const keywordText = kwRow?.keywordText ?? input.sectionHeading.split(' ').slice(0, 3).join(' ');

      let threeTierCtx = input.threeTierCtx ?? null;
      if (!threeTierCtx && kwRow?.projectId) {
        threeTierCtx = { pillar_keyword_text: null, cluster_siblings: [], supporting_peers: [] };
        try {
          if (kwRow.clusterId) {
            const [pillarr] = await db.select({ text: keywordsTable.keywordText }).from(keywordsTable)
              .where(and(eq(keywordsTable.projectId, Number(kwRow.projectId)), eq(keywordsTable.tier, 'pillar'), eq(keywordsTable.clusterId, Number(kwRow.clusterId))))
              .limit(1);
            if (pillarr?.text) threeTierCtx.pillar_keyword_text = pillarr.text;
            const clSibs = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable)
              .where(and(eq(keywordsTable.projectId, Number(kwRow.projectId)), eq(keywordsTable.tier, 'cluster'), eq(keywordsTable.clusterId, Number(kwRow.clusterId))))
              .limit(20);
            threeTierCtx.cluster_siblings = clSibs.map(r => r.t).filter(t => t && t !== keywordText).slice(0, 10);
            const spPeers = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable)
              .where(and(eq(keywordsTable.projectId, Number(kwRow.projectId)), eq(keywordsTable.tier, 'supporting'), eq(keywordsTable.clusterId, Number(kwRow.clusterId))))
              .limit(30);
            threeTierCtx.supporting_peers = spPeers.map(r => r.t).filter(t => t && t !== keywordText).slice(0, 15);
          } else {
            const clAll = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kwRow.projectId)), eq(keywordsTable.tier, 'cluster'))).limit(8);
            const spAll = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kwRow.projectId)), eq(keywordsTable.tier, 'supporting'))).limit(15);
            threeTierCtx.cluster_siblings = clAll.map(r => r.t).filter(Boolean);
            threeTierCtx.supporting_peers = spAll.map(r => r.t).filter(Boolean);
            const pillAll = await db.select({ t: keywordsTable.keywordText }).from(keywordsTable).where(and(eq(keywordsTable.projectId, Number(kwRow.projectId)), eq(keywordsTable.tier, 'pillar'))).limit(1);
            if (pillAll[0]?.t) threeTierCtx.pillar_keyword_text = pillAll[0].t;
          }
        } catch { /* keep fallback empty */ }
      }

      let densityTargets = input.densityTargets ?? null;
      if (!densityTargets) {
        densityTargets = {
          main_keywords: [keywordText],
          longtail_keywords: threeTierCtx?.cluster_siblings?.slice(0, 6) ?? [],
          lsi_keywords: threeTierCtx?.supporting_peers?.slice(0, 12) ?? [],
          max_pct: 2.0,
        };
      }

      const out = await ArticleWriterService.rewriteSection(ctx, {
        sectionHeading: input.sectionHeading,
        currentText: input.currentText,
        keywordText,
        projectId: projId,
        threeTierCtx,
        densityTargets,
        model: finalModelRewrite,
      });

      return {
        ok: true,
        traceId,
        draft_id: input.draftId,
        section_heading: input.sectionHeading,
        rewritten_text: out.rewritten_text,
        original_word_count: out.original_word_count,
        rewritten_word_count: out.rewritten_word_count,
      };
    }),

  setSchedule: protectedProcedure
    .input(z.object({
      draftId: z.number().int().positive(),
      scheduledAt: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const traceId = NEW_UUID();
      const [artRow] = await db.select({
        id: articles.id, projectId: articles.projectId, status: articles.status,
      }).from(articles).where(eq(articles.id, input.draftId)).limit(1);
      if (!artRow) throw new TRPCError({ code: 'NOT_FOUND', message: `Draft ${input.draftId} not found.` });
      if (!artRow.projectId) throw new TRPCError({ code: 'BAD_REQUEST', message: '[NO_PROJECT_ID] article orphan row.' });
      await assertProjectAccess(ctx, Number(artRow.projectId), { minRole: 'member' }, TRPCError);

      if (input.scheduledAt) {
        const schedDt = new Date(input.scheduledAt);
        if (isNaN(schedDt.getTime())) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'scheduledAt รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น ISO datetime)' });
        }
        if (schedDt.getTime() <= Date.now() + 59_000) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'เวลาที่ตั้งต้องอยู่ในอนาคต (มากกว่า 1 นาทีข้างหน้า)' });
        }
      }

      const teamId = await resolveTeamIdForSettings(ctx);
      const [waRow] = await db.select({
        id: writeArticles.id, outlineJson: writeArticles.outlineJson,
      }).from(writeArticles).where(eq(writeArticles.articleId, input.draftId)).limit(1);

      let outline: any = {};
      if (waRow?.outlineJson) {
        try { outline = typeof waRow.outlineJson === 'string' ? JSON.parse(waRow.outlineJson) : waRow.outlineJson; }
        catch { outline = {}; }
      }

      if (input.scheduledAt) {
        const schedIso = new Date(input.scheduledAt).toISOString();
        outline.__scheduled_at = schedIso;
        if (outline.__published) delete outline.__published;
        if (outline.__published_at) delete outline.__published_at;
      } else {
        delete outline.__scheduled_at;
      }

      const outlineJsonStr = JSON.stringify(outline ?? {});
      try {
        if (waRow?.id) {
          await db.update(writeArticles).set({
            outlineJson: outlineJsonStr,
            updatedAt: new Date(),
          }).where(eq(writeArticles.id, Number(waRow.id)));
        } else {
          await db.insert(writeArticles).values({
            articleId: input.draftId,
            teamId,
            outlineJson: outlineJsonStr,
            wordCount: 0,
            writeStep: 8,
            stepStatus: 'done',
          }).onDuplicateKeyUpdate({ set: { outlineJson: outlineJsonStr, updatedAt: new Date() } });
        }
      } catch (e: any) {
        console.warn('[write.setSchedule] write_articles persist fail:', String(e?.message ?? e).slice(0, 200));
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ไม่สามารถบันทึกตารางเวลาได้: ' + String(e?.message ?? e).slice(0, 200) });
      }

      return {
        ok: true,
        traceId,
        draft_id: input.draftId,
        scheduled_at: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
        action: input.scheduledAt ? 'set' : 'cancel',
        message: input.scheduledAt
          ? `✅ ตั้งเวลาเผยแพร่สำเร็จ (${new Date(input.scheduledAt).toLocaleString('th-TH')})`
          : '✅ ยกเลิกตารางเวลาเผยแพร่แล้ว',
      };
    }),

  exportDocx: protectedProcedure
    .input(z.object({ draftId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const traceId = NEW_UUID();
      const [row] = await db.select({
        id: articles.id, title: articles.title, content: articles.content, projectId: articles.projectId,
        metaTitle: articles.metaTitle,
      }).from(articles).where(eq(articles.id, input.draftId)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `Draft ${input.draftId} not found.` });
      if (row.projectId) await assertProjectAccess(ctx, Number(row.projectId), { minRole: 'member' }, TRPCError);
      const buf = await serverGenerateDocxBuffer(String(row.content ?? ''), String(row.metaTitle ?? row.title ?? ''));
      return {
        ok: true,
        traceId,
        draft_id: row.id,
        base64: buf.toString('base64'),
        filename: `article_${row.id}_${Date.now()}.docx`,
        title: row.title ?? '',
      };
    }),
});

export default writeRouter;
