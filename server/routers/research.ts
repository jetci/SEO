// EEAT Studio V2 · Research tRPC Router (Pipeline Step 2.5)
// 4 Jobs: SERP Top 10 Organic, PAA, AI Overview, Citation/Fact Pool.
// Caches in research_packages 30 days (stale-while-revalidate optional).
// Also: research.packageGet, research.status, research.runPlanForKeyword (mutation-only).
import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { protectedProcedure, TRPCError, type ProtectedCtx } from '../_core/middleware/rbac.js';
import { eq, and, gt, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { researchPackages, keywords as keywordsTable, projects as projectsTable, categories as categoriesTable } from '../../db/schema.js';
import { assertProjectAccess } from './_projectAccess.js';
import { SerpService } from '../services/serpClient.js';
import { LlmService } from '../services/llmClient.js';
import * as crypto from 'node:crypto';

function newTraceId(): string { return crypto.randomUUID(); }
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

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

type JobOk = { status: 'OK'; result: any; durationMs: number };
type JobFail = { status: 'FAIL'; err: string; durationMs: number };
type JobResult = JobOk | JobFail;

const CITATION_CATEGORIES = ['stat','definition','healthwarning','risk','rule'] as const;
const citationSchema = z.object({
  facts: z.array(z.object({
    fact: z.string().min(4),
    source_url: z.string().url().or(z.literal('')),
    category: z.enum(CITATION_CATEGORIES as unknown as [string, ...string[]]).default('definition'),
    metric_value: z.number().nullable().optional(),
  })),
});

async function jobWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<{ ok: true; value: T; durationMs: number } | { ok: false; err: string; durationMs: number }> {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, value, durationMs: Date.now() - start };
  } catch (e: any) {
    return { ok: false, err: String(e?.message ?? e).slice(0, 300), durationMs: Date.now() - start };
  } finally {
    clearTimeout(to);
  }
}

export const researchRouter = router({
  status: protectedProcedure
    .input(z.object({ keywordId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [kw] = await db.select({ tier: keywordsTable.tier, projectId: keywordsTable.projectId, keywordText: keywordsTable.keywordText }).from(keywordsTable).where(eq(keywordsTable.id, input.keywordId)).limit(1);
      if (!kw) throw new TRPCError({ code: 'NOT_FOUND', message: `Keyword ${input.keywordId} not found.` });
      await assertProjectAccess(ctx, Number(kw.projectId), { minRole: 'member' }, TRPCError);
      const [pkg] = await db.select().from(researchPackages).where(eq(researchPackages.keywordId, input.keywordId)).limit(1);
      if (!pkg) return { ok: true, status: 'EMPTY', fromCache:false, ageDays:null, keyword: kw };
      const ageMs = Date.now() - new Date(pkg.lastUpdatedAt as any).getTime();
      const ageDays = ageMs / (24*3600*1000);
      return { ok: true, status: ageDays > 30 ? 'STALE' : 'FRESH', fromCache: true, ageDays, keyword: kw, package_id: pkg.id };
    }),
  enrichSerp: protectedProcedure
    .input(z.object({ seed: z.string().min(1).max(200), gl: z.string().min(2).max(8).default('th'), hl: z.string().min(2).max(8).default('th'), num: z.number().int().min(1).max(100).default(20) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const s = await SerpService.forContext(ctx);
        const organicWrapped = await s.organicTop10(String(input.seed).trim(), input.hl, input.gl) as any;
        const organicRaw = Array.isArray(organicWrapped?.organic) ? organicWrapped.organic : [];
        const relatedSearches = Array.isArray(organicWrapped?.relatedSearches) ? organicWrapped.relatedSearches : [];
        const peopleAlsoSearch = Array.isArray(organicWrapped?.peopleAlsoSearch) ? organicWrapped.peopleAlsoSearch : [];
        const paaRaw = await s.paaQuestions(String(input.seed).trim(), input.hl, input.gl);
        const organic = organicRaw.slice(0, Math.max(1, Math.min(100, Number(input.num) || 20))).map((r: any) => ({ url: r.url || '', title: r.title || '', snippet: r.snippet || '', domainAuthority: Number(r.domainAuthority) || 30, estimatedWordCount: Number(r.estimatedWordCount) || 0 }));
        const paa = paaRaw.map((r: any) => ({ question: r.question || '', snippet: r.snippet || '', urlSource: r.urlSource || '' }));
        return { ok: true, organic, paa, related_searches: relatedSearches.slice(0, 30), people_also_search: peopleAlsoSearch.slice(0, 30), knowledge_graph: null, search_info: { seed: input.seed, gl: input.gl, hl: input.hl, num: input.num }, trace_id: newTraceId() };
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 240);
        return { ok: false, organic: [], paa: [], related_searches: [], people_also_search: [], knowledge_graph: null, search_info: { seed: input.seed, gl: input.gl, hl: input.hl, num: input.num }, trace_id: newTraceId(), error: msg };
      }
    }),

  getPackage: protectedProcedure
    .input(z.object({ keywordId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [kw] = await db.select({ tier: keywordsTable.tier, projectId: keywordsTable.projectId, keywordText: keywordsTable.keywordText }).from(keywordsTable).where(eq(keywordsTable.id, input.keywordId)).limit(1);
      if (!kw) throw new TRPCError({ code: 'NOT_FOUND', message: 'Keyword not found.' });
      await assertProjectAccess(ctx, Number(kw.projectId), { minRole: 'member' }, TRPCError);
      const [pkg] = await db.select().from(researchPackages).where(eq(researchPackages.keywordId, input.keywordId)).limit(1);
      if (!pkg) return { ok: true, package: null, keyword: kw };
      try {
        const json = typeof pkg.packageJson === 'string' ? JSON.parse(pkg.packageJson) : (pkg.packageJson as any);
        return { ok: true, package: { ...json, id: pkg.id, duration_ms: pkg.durationMs, from_cache: !!pkg.fromCache, created_at: pkg.createdAt, last_updated_at: pkg.lastUpdatedAt }, keyword: kw };
      } catch (e: any) {
        return { ok: false, package: null, keyword: kw, error: 'PACKAGE_JSON_INVALID' };
      }
    }),

  runPlanForKeyword: protectedProcedure
    .input(z.object({ keywordId: z.number().int().positive(), forceRebuild: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const traceId = newTraceId();
      const [kw] = await db.select().from(keywordsTable).where(eq(keywordsTable.id, input.keywordId)).limit(1);
      if (!kw) throw new TRPCError({ code: 'NOT_FOUND', message: `Keyword ${input.keywordId} not found.` });
      if (kw.tier !== 'pillar') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '[NOT_PILLAR_TIER] runPlanForKeyword requires a pillar tier keyword (tier=pillar). Run clustering first.' });
      }
      await assertProjectAccess(ctx, Number(kw.projectId), { minRole: 'member' }, TRPCError);
      const [proj] = await db.select({ id: projectsTable.id, categoryId: projectsTable.categoryId }).from(projectsTable).where(eq(projectsTable.id, Number(kw.projectId))).limit(1);
      const [cat] = proj ? await db.select({ isYmyl: categoriesTable.isYmyl, name: categoriesTable.name }).from(categoriesTable).where(eq(categoriesTable.id, Number(proj.categoryId))).limit(1) : [] as any;

      // Return cached if fresh and no force
      if (!input.forceRebuild) {
        const [cached] = await db.select().from(researchPackages).where(and(eq(researchPackages.keywordId, input.keywordId), gt(researchPackages.lastUpdatedAt, new Date(Date.now() - THIRTY_DAYS_MS)))).limit(1);
        if (cached) {
          let data: any = {};
          try { data = typeof cached.packageJson === 'string' ? JSON.parse(cached.packageJson) : cached.packageJson; } catch {}
          return { ok: true, traceId, research_package_id: cached.id, jobs_status: data.jobs_status, duration_ms: Number(cached.durationMs ?? 0), from_cache: true, package: data };
        }
      }

      const startWall = Date.now();
      const serp = await SerpService.forContext(ctx);
      const llm = await LlmService.forContext(ctx);

      // Job 4.1 SERP Top 10 Organic
      const j41 = await jobWithTimeout(() => serp.organicTop10(kw.keywordText), 45000);
      const job41: JobResult = j41.ok ? { status: 'OK', result: j41.value, durationMs: j41.durationMs } : { status:'FAIL', err: j41.err, durationMs: j41.durationMs };
      const serpWrapped: any = job41.status === 'OK' ? job41.result : {};
      const serpTop10 = Array.isArray(serpWrapped?.organic) ? serpWrapped.organic : [];
      const relatedSearches: string[] = Array.isArray(serpWrapped?.relatedSearches) ? serpWrapped.relatedSearches : [];
      const peopleAlsoSearch: string[] = Array.isArray(serpWrapped?.peopleAlsoSearch) ? serpWrapped.peopleAlsoSearch : [];

      // Job 4.2 PAA Questions
      const j42 = await jobWithTimeout(() => serp.paaQuestions(kw.keywordText), 35000);
      const job42: JobResult = j42.ok ? { status:'OK', result:j42.value, durationMs:j42.durationMs } : { status:'FAIL', err:j42.err, durationMs: j42.durationMs };
      const paaList = job42.status === 'OK' ? job42.result : [];

      // Job 4.3 AI Overview (LLM) — summarize serp snippets + PAA
      let job43: JobResult = { status: 'FAIL', err: 'NO_DATA', durationMs: 0 };
      let aiOverview = '';
      {
        const snippets: string[] = [
          ...(Array.isArray(serpTop10) ? serpTop10.map((r:any) => `[${r.title}] ${r.snippet}`) : []),
          ...(Array.isArray(paaList) ? paaList.map((p:any) => `Q:${p.question} A:${p.snippet}`) : []),
        ];
        if (snippets.length > 0) {
          const j43raw = await jobWithTimeout(async () => {
            const system = `You are a concise Thai/English SEO research assistant. Write a 200-300 word summary of what the search intent is about for the keyword, based solely on provided SERP snippets (do not invent facts). Language: detect from keyword ${kw.keywordText}.`;
            const user = `KEYWORD: ${kw.keywordText}\n---\nSERP Snippets:\n${snippets.join('\n---\n').slice(0, 6000)}`;
            const r = await llm.chatRaw(system, user, { maxTokens: 800, temperature: 0.3 });
            return r.text;
          }, 45000);
          if (j43raw.ok) {
            job43 = { status:'OK', result: j43raw.value, durationMs: j43raw.durationMs };
            aiOverview = j43raw.value;
          } else {
            job43 = { status:'FAIL', err: j43raw.err, durationMs: j43raw.durationMs };
          }
        }
      }

      // Job 4.4 Citation / Fact Pool LLM structured output
      let job44: JobResult = { status:'FAIL', err:'NO_DATA', durationMs:0 };
      let citationPool: any[] = [];
      const ymyl = !!cat?.isYmyl;
      {
        const urlSourcePairs: {text:string; url:string}[] = [];
        if (Array.isArray(serpTop10)) serpTop10.forEach((r:any) => urlSourcePairs.push({ text: `${r.title}. ${r.snippet}`, url: r.url || '' }));
        if (Array.isArray(paaList)) paaList.forEach((p:any) => urlSourcePairs.push({ text:`Q:${p.question}. ${p.snippet}`, url: p.urlSource || '' }));
        if (urlSourcePairs.length > 0) {
          const sys = `You extract factual citations ONLY from text source provided. NO INVENTIONS.${ymyl ? '\nYMYL / Gambling category: MUST include at least 3 entries with category=healthwarning or=risk explaining risks of gambling/loss.' : ''}.\nOutput JSON {"facts":[{fact,source_url,category,metric_value}]}.`;
          const usr = `KEYWORD: ${kw.keywordText}\nSOURCES:\n${urlSourcePairs.slice(0, 20).map((s, i) => `[${i+1}] url=${s.url}\nText: ${s.text}`).join('\n\n').slice(0, 9000)}`;
          const j44raw = await jobWithTimeout(() => llm.chatStructured(sys, usr, citationSchema, { maxTokens: 4096, temperature: 0.1 }), 60000);
          if (j44raw.ok) {
            const facts = Array.isArray((j44raw.value as any).facts) ? (j44raw.value as any).facts : [];
            // Enforce YMYL minimum 3 fact entries — if not enough, generate synthetic warning stubs (WITH EXPLICIT disclaimer auto-generated — do not hallucinate URLs)
            let finalFacts = facts;
            if (ymyl && finalFacts.filter((f:any)=>f.category==='healthwarning'||f.category==='risk').length < 3) {
              const warnings = [
                { fact: 'การพนันอาจก่อให้เกิดความเสี่ยงทางการเงินอย่างมาก และอาจนำไปสู่หนี้สินที่รุนแรง หากเล่นเกินขีดจำกัด', source_url: '', category:'risk' as const },
                { fact: 'พนันออนไลน์เป็นกิจกรรมที่มีความเสี่ยง ไม่ควรเล่นด้วยเงินที่ผู้เล่นไม่สามารถสูญเสียได้ ควรกำหนดงบประมาณที่ชัดเจน', source_url: '', category:'healthwarning' as const },
                { fact: 'ไม่แนะนำให้บุคคลอายุน้อยกว่า 20 ปี หรือผู้ที่มีประวัติเสพติดพนัน เข้าถึงหรือเล่นพนันในรูปแบบใดๆ', source_url: '', category:'healthwarning' as const },
              ];
              finalFacts = [...finalFacts, ...warnings];
            }
            citationPool = finalFacts;
            job44 = { status:'OK', result: finalFacts, durationMs: j44raw.durationMs };
          } else {
            job44 = { status:'FAIL', err: j44raw.err, durationMs: j44raw.durationMs };
            if (ymyl) {
              citationPool = [
                { fact:'การพนันมีความเสี่ยง หากเล่นผิดวิธีจะก่อให้เกิดปัญหาทางการเงิน', source_url:'', category:'risk' },
                { fact:'กำหนดงบการเล่น และยุติเมื่อถึงวงเงินที่วางไว้ เพื่อหลีกเลี่ยงหนี้สิน', source_url:'', category:'healthwarning' },
                { fact:'หากท่านรู้สึกว่าการพนันสร้างความเสียหาย แนะนำให้ปรึกษาผู้เชี่ยวชาญทันที', source_url:'', category:'healthwarning' },
              ];
            }
          }
        } else if (ymyl) {
          // YMYL but no SERP data → ensure hardcoded guardrail warnings
          citationPool = [
            { fact:'การพนันมีความเสี่ยงทางการเงินอย่างมาก', source_url:'', category:'risk' },
            { fact:'พนันอาจก่อให้เกิดความติดหรือปัญหาสุขภาพจิต', source_url:'', category:'healthwarning' },
            { fact:'ควรตรวจสอบกฎหมายพนันในเขตปกครองของท่านก่อนเล่น', source_url:'', category:'rule' },
          ];
          job44 = { status:'OK', result: citationPool, durationMs: 0 };
        }
      }

      const jobs_status = { job4_1_serp: job41, job4_2_paa: job42, job4_3_overview: job43, job4_4_citations: job44 };
      const pkg = {
        jobs_status,
        keyword_id: input.keywordId,
        keyword_text: kw.keywordText,
        project_id: kw.projectId,
        category: cat?.name ?? null,
        is_ymyl: ymyl,
        serp_top10: serpTop10,
        related_searches: relatedSearches.slice(0, 30),
        people_also_search: peopleAlsoSearch.slice(0, 30),
        paa_questions: paaList,
        ai_overview: aiOverview,
        citation_pool: citationPool,
        ymyldisclaimer_required: ymyl,
        generated_at: new Date().toISOString(),
        trace_id: traceId,
      };
      const json = JSON.stringify(pkg);
      const durationMs = Date.now() - startWall;

      let researchPackageId: number|undefined;
      try {
        const ins = await db.insert(researchPackages)
          .values({ keywordId: input.keywordId, projectId: Number(kw.projectId), packageJson: json, fromCache: 0, durationMs })
          .onDuplicateKeyUpdate({ set: { packageJson: json, fromCache: 0, durationMs, lastUpdatedAt: new Date() } });
        researchPackageId = extractInsertId(ins);
      } catch (e: any) {
        console.warn('[research.runPlanForKeyword] persist pkg failed:', String(e?.message ?? e).slice(0,160));
      }
      if (!researchPackageId) {
        const [sel] = await db.select({ id: researchPackages.id }).from(researchPackages).where(eq(researchPackages.keywordId, input.keywordId)).limit(1);
        if (sel) researchPackageId = Number(sel.id);
      }

      return {
        ok: true,
        traceId,
        research_package_id: researchPackageId ?? null,
        jobs_status,
        duration_ms: durationMs,
        from_cache: false,
        package: pkg,
      };
    }),
});

export default researchRouter;
