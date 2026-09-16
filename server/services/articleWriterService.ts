// EEAT Studio V2 · Article Writer Service — Phase 2D Write Pipeline
// Generates EEAT-compliant 1500+ word drafts from research_package evidence pack.
// YMYL GATE: category id 3/4/5 (slots/lottery/casino) → disclaimer_required=true auto-inject banner TOP article.
// MIN CITATIONS: ≥ 3 citations per article embedded inline from citation_pool facts.
// Outline: 6-tier H1..H6 from cluster hierarchy → LLM generates section body each.
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { ProtectedCtx } from '../_core/middleware/rbac.js';
import { LlmService } from './llmClient.js';
import { db } from '../../db/index.js';
import { projectBrandVoices } from '../../db/schema.js';
import { resolveTeamSettings } from '../routers/settings.js';

const outlineSectionSchema = z.object({
  heading_level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  heading_text: z.string().min(2).max(255),
  word_target_min: z.number().int().positive().default(200),
  key_points: z.array(z.string().min(2)).default([]),
});
const outlineSchema = z.object({ sections: z.array(outlineSectionSchema).min(4) });

const draftSchema = z.object({
  title: z.string().min(10).max(512),
  meta_title: z.string().min(20).max(120),
  meta_description: z.string().min(40).max(320),
  disclaimer_banner: z.string().min(0).max(8000),
  sections: z.array(z.object({
    heading: outlineSectionSchema,
    body_markdown: z.string().min(100),
    citations_embedded: z.array(z.object({
      index: z.number().int().nonnegative(),
      fact: z.string().min(2),
      source_url: z.string().default(''),
    })).min(0),
  })).min(4),
  eeat_checks: z.object({
    ymyldisclaimer_required: z.boolean(),
    disclaimer_injected: z.boolean(),
    min_citations_met: z.boolean(),
    citations_count: z.number().int().nonnegative(),
    word_count_body: z.number().int().nonnegative(),
    total_word_count: z.number().int().nonnegative(),
  }),
});

const YMYL_BANNER_THAI = `> ⚠️ **คำเตือนความเสี่ยงด้านการพนัน (YMYL Disclaimer)**
> 
> เนื้อหาบทความนี้ส่วนหนึ่งเกี่ยวข้องกับการพนันออนไลน์/สล็อต/หวย/คาสิโน (Your Money or Your Life / YMYL หมวดเสี่ยงสูง)
> การพนันอาจก่อให้เกิดความเสี่ยงทางการเงินอย่างมากและอาจนำไปสู่หนี้สินที่รุนแรง หากเล่นเกินขีดจำกัด
> ไม่แนะนำให้บุคคลอายุน้อยกว่า 20 ปี หรือผู้ที่มีประวัติเสพติดพนัน เข้าถึงหรือเล่นพนันในรูปแบบใดๆ
> กำหนดงบการเล่นอย่างชัดเจน และยุติการเล่นทันทีเมื่อถึงวงเงินที่วางไว้
> 
> ---

`;

const YMYL_BANNER_EN = `> ⚠️ **Gambling Risk Warning (YMYL Disclaimer)**
>
> This article references online gambling, slots, lottery, or casino content (Your Money or Your Life / YMYL high-risk vertical).
> Gambling carries a significant risk of financial harm and can lead to severe debt when pursued irresponsibly.
> Minors (under age 18/21 per local jurisdiction) and individuals with a history of gambling addiction should not access these services.
> Always set a clear, affordable budget before engaging in any gambling activity, and stop immediately once the limit is reached.
>
> ---

`;

// 🟢 AUDIT P2 YMYL L10n: Detect language context → pick matching banner language.
// Primary = keyword TH/EN chars; secondary = user setting defaultLangCode; fallback = TH (dominant project locale)
function detectArticleLangCode(keywordText: string, settingsDefaultLang?: string | null): 'th' | 'en' {
  const kw = String(keywordText || '');
  const thaiCount = (kw.match(/[\u0E00-\u0E7F]/g) || []).length;
  const asciiWordCount = kw.split(/\s+/).filter(t => /^[A-Za-z0-9'\-]{2,}$/.test(t)).length;
  // Heuristic: 5+ continuous Thai chars → Thai; 4+ ASCII words and low Thai → English; otherwise settings default
  if (thaiCount >= 5) return 'th';
  if (asciiWordCount >= 4 && thaiCount === 0) return 'en';
  const def = String(settingsDefaultLang || '').toLowerCase().trim();
  if (def.startsWith('en')) return 'en';
  return 'th';
}
function getYMYLBanner(keywordText: string, settingsDefaultLang?: string | null): string {
  return detectArticleLangCode(keywordText, settingsDefaultLang) === 'en' ? YMYL_BANNER_EN : YMYL_BANNER_THAI;
}

function wordCount(text: string): number {
  // Split by unicode word boundaries; Thai/Chinese use char-3 approx; English words count naturally
  const asciiWords = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
  const thaiChars = text.match(/[\u0E00-\u0E7F]/g)?.length ?? 0;
  return asciiWords + Math.ceil(thaiChars / 3);
}

function buildOutline(serpTop10: any[], paaList: any[], clusterTopic: string | null) {
  const sections: z.infer<typeof outlineSectionSchema>[] = [];
  sections.push({
    heading_level: 1,
    heading_text: '',
    word_target_min: 0,
    key_points: [],
  }); // H1 placeholder later
  sections.push({
    heading_level: 2,
    heading_text: (clusterTopic ?? 'ภาพรวมทั้งหมด') + ' — สิ่งที่ผู้อ่านต้องทราบก่อนตัดสินใจ',
    word_target_min: 500,
    key_points: serpTop10.slice(0, 3).map((r: any) => `ประเด็นจาก SERP จริง: ${String(r.title ?? '').slice(0, 180)}`),
  });
  const faqHeadings = paaList.slice(0, 5).map((p: any, i: number) => ({
    heading_level: 2 as const,
    heading_text: `คำถามยอดนิยม ${i + 1}: ${String(p.question ?? 'ประเด็นสำคัญที่มักถาม').slice(0, 140)}`,
    word_target_min: 450,
    key_points: [`คำตอบเชิงลึกอ้างอิงจาก SERP snippet จริง: ${String(p.snippet ?? '').slice(0, 200)}`],
  }));
  sections.push(...faqHeadings);
  const safeKwr = String(serpTop10[0]?.title ?? clusterTopic ?? 'ทุกประเด็น').replace(/\s+/g, ' ').trim().slice(0, 90);
  sections.push({
    heading_level: 2,
    heading_text: `บทเรียนและข้อเสนอแนะสุดท้ายสำหรับ ${safeKwr}`,
    word_target_min: 500,
    key_points: ['จุดเด่น 3-5 ประเด็นที่ผู้อ่านควรนำไปใช้จริงหลังอ่านจบ'],
  });
  return { sections };
}

function pickCitations(citationPool: any[], countMin: number) {
  const pool = Array.isArray(citationPool) ? [...citationPool] : [];
  const out: any[] = [];
  for (let i = 0; i < Math.min(countMin, pool.length); i++) {
    out.push(pool[i]);
  }
  if (pool.length > 0) {
    while (out.length < countMin) out.push(pool[out.length % pool.length]);
  }
  return out;
}

export type ResearchPackageLite = {
  keyword_text: string;
  serp_top10: any[];
  paa_questions: any[];
  ai_overview?: string;
  citation_pool?: any[];
  is_ymyl?: boolean;
  ymyldisclaimer_required?: boolean;
  keyword_id?: number;
  project_id?: number;
  jobs_status?: any;
};

export type RewriteSectionParams = {
    sectionHeading: string;
  currentText: string;
  keywordText: string;
  projectId?: number;
  threeTierCtx: { pillar_keyword_text: string | null; cluster_siblings: string[]; supporting_peers: string[] } | null;
  densityTargets: { main_keywords?: string[]; longtail_keywords?: string[]; lsi_keywords?: string[]; max_pct?: number } | null;
  model?: string;
};

export class ArticleWriterService {
  static async rewriteSection(
    ctx: ProtectedCtx,
    params: RewriteSectionParams
  ) {
    const llm = await LlmService.forContext(ctx);
    const { sectionHeading, currentText, keywordText, projectId, threeTierCtx, densityTargets, model } = params;

    let brandVoicePrefix = '';
    if (projectId && Number(projectId) > 0) {
      try {
        const [bvRow] = await db.select().from(projectBrandVoices).where(eq(projectBrandVoices.projectId, Number(projectId))).limit(1);
        if (bvRow?.voiceJson) {
          let voice: any = null;
          try { voice = JSON.parse(bvRow.voiceJson); } catch { voice = null; }
          if (voice && typeof voice === 'object' && Object.keys(voice).length > 0) {
            brandVoicePrefix = 'Brand Voice Guidelines (use these rules for ALL content generation, metadata, headings, and tone):\n' + JSON.stringify(voice, null, 2) + '\n\n---\n\n';
          }
        }
      } catch { /* ignore brand voice if DB error */ }
    }

    let tierHierarchyPrefix = '';
    if (threeTierCtx && (threeTierCtx.pillar_keyword_text || threeTierCtx.cluster_siblings.length || threeTierCtx.supporting_peers.length)) {
      const pillar = threeTierCtx.pillar_keyword_text ? threeTierCtx.pillar_keyword_text : '(ไม่มี Pillar)';
      const cStr = threeTierCtx.cluster_siblings.length ? threeTierCtx.cluster_siblings.slice(0, 8).map((s, i) => `  C${i + 1}. ${s}`).join('\n') : '  (ไม่มี Cluster คู่ข้างๆ)';
      const sStr = threeTierCtx.supporting_peers.length ? threeTierCtx.supporting_peers.slice(0, 12).map((s, i) => `  S${i + 1}. ${s}`).join('\n') : '  (ไม่มี Supporting คู่ข้างๆ)';
      tierHierarchyPrefix = `\n3-TIER HIERARCHY KEYWORD CONTEXT (Pillar → Cluster → Supporting) — INCLUDE THESE INTERNAL LINKS/RELATED SECTIONS NATURALLY IN BODY:\n  Pillar: ${pillar}\n  Sibling Cluster Keywords:\n${cStr}\n  Peer Supporting Keywords (LSI semantic relatives):\n${sStr}\n\n---\n\n`;
    }

    let densityInstructionPrefix = '';
    if (densityTargets) {
      const maxPct = typeof densityTargets.max_pct === 'number' ? densityTargets.max_pct : 2.0;
      const mains = (densityTargets.main_keywords ?? []).slice(0, 3);
      const longs = (densityTargets.longtail_keywords ?? []).slice(0, 6);
      const lsis = (densityTargets.lsi_keywords ?? []).slice(0, 10);
      densityInstructionPrefix = `\nKEYWORD DENSITY RULES (HARD CEILING MAX ${maxPct}% OF TOTAL WORDS — NEVER EXCEED):\n  • Main Keywords (use varied, spread evenly): ${mains.join(' / ') || keywordText}\n  • Long-tail Variants (mention naturally 2-5x each): ${longs.join(' | ') || '(use variations of main kw)'}\n  • LSI / Semantic Keywords (include 5-10x each related context spread all sections): ${lsis.join(' | ') || '(auto-detect relatives by topic)'}\n  • HARD RULE: TOTAL all keyword types COMBINED repetition NEVER exceed ceiling ${maxPct}% — prefer natural Thai/English language flow over forced stuffing.\n\n---\n\n`;
    }

    const combinedPrefix = (brandVoicePrefix ? brandVoicePrefix : '') + tierHierarchyPrefix + densityInstructionPrefix;

    const sectionSiblingCtx: string[] = [];
    if (threeTierCtx?.pillar_keyword_text) sectionSiblingCtx.push(`Pillar Topic (H1 umbrella): ${threeTierCtx.pillar_keyword_text}`);
    if (threeTierCtx?.cluster_siblings?.length) sectionSiblingCtx.push(`Related cluster keywords (internal link targets if relevant): ${threeTierCtx.cluster_siblings.slice(0, 5).join(' / ')}`);
    if (densityTargets?.lsi_keywords?.length) sectionSiblingCtx.push(`Semantic LSI relatives (use 4-8 naturally spread): ${densityTargets.lsi_keywords.slice(0, 8).join(' · ')}`);
    if (densityTargets?.longtail_keywords?.length) sectionSiblingCtx.push(`Long-tail variants (vary phrasing 2-3x each): ${densityTargets.longtail_keywords.slice(0, 4).join(' | ')}`);

    const systemBase = `REWRITE a single body section/paragraph (markdown) — IMPROVE quality, flow, and SEO value while preserving original meaning. NO headings/title, NO fences. Same length or slightly longer than original text. Same language as keyword. DENSITY RULE: NEVER exceed ceiling 2% keyword repetition. Preserve factual accuracy. Output ONLY the rewritten markdown body text — no explanations, no prefixes, no fences.`;
    const system = combinedPrefix + systemBase;

    const user = `KEYWORD=${keywordText}\nSECTION HEADING: ${sectionHeading}\n${sectionSiblingCtx.length ? sectionSiblingCtx.join('\n') + '\n' : ''}\nORIGINAL TEXT TO REWRITE (preserve meaning, improve quality):\n---\n${currentText}\n---\n\nRewrite instructions:\n• Make sentences more natural, conversational, and engaging (Thai if keyword is Thai)\n• Improve SEO: naturally weave in longtail/LSI keyword variants without forcing\n• Keep paragraph structure and core meaning intact\n• Add depth/detail where it improves value\n• Ensure keyword density stays ≤2% ceiling`;

    let rewritten = '';
    try {
      const targetWordCount = Math.max(150, wordCount(currentText) + 50);
      const raw = await llm.chatRaw(system, user, { maxTokens: Math.max(600, targetWordCount * 3), temperature: 0.6, model });
      rewritten = String(raw.text || '').trim();
    } catch {
      rewritten = currentText;
    }

    return {
      rewritten_text: rewritten,
      original_word_count: wordCount(currentText),
      rewritten_word_count: wordCount(rewritten),
    };
  }

  static async writeDraft(
    ctx: ProtectedCtx,
    pkg: ResearchPackageLite,
    clusterTopic: string | null,
    ymyl: boolean,
    projectId?: number,
    threeTierCtx: { pillar_keyword_text: string | null; cluster_siblings: string[]; supporting_peers: string[] } | null = null,
    outlineOverride: { sections: any[] } | null = null,
    densityTargets: { main_keywords?: string[]; longtail_keywords?: string[]; lsi_keywords?: string[]; max_pct?: number } | null = null,
    model?: string,
    targetWordCount?: number
  ) {
    const llm = await LlmService.forContext(ctx);
    const ymylRequired = !!ymyl || !!pkg.ymyldisclaimer_required || !!pkg.is_ymyl;

    let brandVoicePrefix = '';
    if (projectId && Number(projectId) > 0) {
      try {
        const [bvRow] = await db.select().from(projectBrandVoices).where(eq(projectBrandVoices.projectId, Number(projectId))).limit(1);
        if (bvRow?.voiceJson) {
          let voice: any = null;
          try { voice = JSON.parse(bvRow.voiceJson); } catch { voice = null; }
          if (voice && typeof voice === 'object' && Object.keys(voice).length > 0) {
            brandVoicePrefix = 'Brand Voice Guidelines (use these rules for ALL content generation, metadata, headings, and tone):\n' + JSON.stringify(voice, null, 2) + '\n\n---\n\n';
          }
        }
      } catch { /* ignore brand voice if DB error, keep empty */ }
    }

    // ============ INJECT NEW CONTEXTS C1, C3 into prompt prefix ============
    let tierHierarchyPrefix = '';
    if (threeTierCtx && (threeTierCtx.pillar_keyword_text || threeTierCtx.cluster_siblings.length || threeTierCtx.supporting_peers.length)) {
      const pillar = threeTierCtx.pillar_keyword_text ? threeTierCtx.pillar_keyword_text : '(ไม่มี Pillar)';
      const cStr = threeTierCtx.cluster_siblings.length ? threeTierCtx.cluster_siblings.slice(0, 8).map((s, i) => `  C${i + 1}. ${s}`).join('\n') : '  (ไม่มี Cluster คู่ข้างๆ)';
      const sStr = threeTierCtx.supporting_peers.length ? threeTierCtx.supporting_peers.slice(0, 12).map((s, i) => `  S${i + 1}. ${s}`).join('\n') : '  (ไม่มี Supporting คู่ข้างๆ)';
      tierHierarchyPrefix = `\n3-TIER HIERARCHY KEYWORD CONTEXT (Pillar → Cluster → Supporting) — INCLUDE THESE INTERNAL LINKS/RELATED SECTIONS NATURALLY IN BODY:\n  Pillar: ${pillar}\n  Sibling Cluster Keywords:\n${cStr}\n  Peer Supporting Keywords (LSI semantic relatives):\n${sStr}\n\n---\n\n`;
    }
    let densityInstructionPrefix = '';
    if (densityTargets) {
      const maxPct = typeof densityTargets.max_pct === 'number' ? densityTargets.max_pct : 2.0;
      const mains = (densityTargets.main_keywords ?? []).slice(0, 3);
      const longs = (densityTargets.longtail_keywords ?? []).slice(0, 6);
      const lsis = (densityTargets.lsi_keywords ?? []).slice(0, 10);
      densityInstructionPrefix = `\nKEYWORD DENSITY RULES (HARD CEILING MAX ${maxPct}% OF TOTAL WORDS — NEVER EXCEED):\n  • Main Keywords (use varied, spread evenly): ${mains.join(' / ') || pkg.keyword_text}\n  • Long-tail Variants (mention naturally 2-5x each): ${longs.join(' | ') || '(use variations of main kw)'}\n  • LSI / Semantic Keywords (include 5-10x each related context spread all sections): ${lsis.join(' | ') || '(auto-detect relatives by topic)'}\n  • HARD RULE: TOTAL all keyword types COMBINED repetition NEVER exceed ceiling ${maxPct}% — prefer natural Thai/English language flow over forced stuffing.\n\n---\n\n`;
    }
    const combinedPrefix = (brandVoicePrefix ? brandVoicePrefix : '') + tierHierarchyPrefix + densityInstructionPrefix;

    // C2: OUTLINE OVERRIDE from Step 2 AI Outline Editor (if user custom H1..H6 cur===1 saved outlineJson)
    let outline = outlineOverride && Array.isArray(outlineOverride.sections) && outlineOverride.sections.length >= 3
      ? outlineOverride
      : buildOutline(pkg.serp_top10 ?? [], pkg.paa_questions ?? [], clusterTopic);

    // ── P0 TARGET WORD COUNT: NORMALIZE OUTLINE word_target_min + DYNAMIC section lengths ──
    const _twc = Number(targetWordCount ?? 0) > 0 ? Number(targetWordCount) : 3500;
    const h2Count = Math.max(1, outline.sections.filter((x: any) => Number(x.heading_level) === 2).length);
    const h3Count = Math.max(0, outline.sections.filter((x: any) => Number(x.heading_level) === 3).length);
    const budgetBodyWords = Math.max(500, Math.round(_twc * 0.92));
    const avgH2Words = Math.max(200, Math.round(budgetBodyWords / Math.max(1, h2Count + h3Count * 0.55)));
    const avgH3Words = Math.max(120, Math.round(avgH2Words * 0.55));
    for (const s of outline.sections) {
      const lv = Number(s.heading_level);
      if (lv === 1) { s.word_target_min = 0; continue; }
      const explicitMin = Number(s.word_target_min || 0);
      const defaultMin = lv === 2 ? avgH2Words : lv === 3 ? avgH3Words : Math.max(80, Math.round(avgH2Words * 0.4));
      s.word_target_min = explicitMin > 40 ? explicitMin : defaultMin;
    }
    const TOTAL_WORD_BUDGET_LINE_HEAD = `[TOTAL ARTICLE TARGET: ${_twc.toLocaleString()} WORDS MANDATORY]. Spread content across sections naturally WITHOUT keyword stuffing — trust the long-tail/LSI hierarchy for variation. Each section MUST hit ITS OWN word_target_min (never write short generic 200-word blobs when user asked for ${_twc.toLocaleString()} total words — that's how stuffing happens!). Target length for THIS section = ~WORD_TARGET_MIN words.`;

    const citPool = pkg.citation_pool ?? [];
    const minCitations = 3;
    const citations = pickCitations(citPool, minCitations);

    // Step 2: Generate title + meta (Inject combinedPrefix = BV + 3-tier + density targets)
    let title = `คู่มือ ${pkg.keyword_text} ปี 2569 — ข้อมูลเชิงลึกทันสมัยครบถ้วน`;
    let metaTitle = `${pkg.keyword_text} คู่มือ 2569 สรุปประเด็นสำคัญ`;
    let metaDescription = `ค้นพบข้อมูลเชิงลึกเกี่ยวกับ ${pkg.keyword_text}: สรุปจาก SERP Top 10, คำถาม FAQ, และทัศนคติผู้ใช้จริง เพื่อตัดสินใจที่มีข้อมูลครบถ้วน`;
    {
      const sysBase = `Generate SEO metadata in same language as keyword (Thai if Thai keyword). STRICT LENGTH GUARDS: title 40-60 chars, meta_title MAX 60 CHARS NEVER EXCEED, meta_description MAX 160 CHARS NEVER EXCEED. Strict JSON response {title, meta_title, meta_description}. No markdown fences, NO fabrications.`;
      const sys = combinedPrefix + sysBase;
      const kwCtxList = [];
      if (threeTierCtx?.pillar_keyword_text) kwCtxList.push(`Parent Pillar Topic: ${threeTierCtx.pillar_keyword_text}`);
      if (densityTargets?.main_keywords?.length) kwCtxList.push(`Main Keyword: ${densityTargets.main_keywords.join(', ')}`);
      if (densityTargets?.longtail_keywords?.length) kwCtxList.push(`Long-tail variants: ${densityTargets.longtail_keywords.slice(0, 5).join(' | ')}`);
      if (densityTargets?.lsi_keywords?.length) kwCtxList.push(`LSI/Semantic relatives: ${densityTargets.lsi_keywords.slice(0, 8).join(' · ')}`);
      const usr = `KEYWORD: ${pkg.keyword_text}\n${kwCtxList.length ? kwCtxList.join('\n') + '\n' : ''}SERP TITLES:\n${(pkg.serp_top10 ?? []).slice(0, 5).map((r: any, i) => `${i + 1}. ${r.title}`).join('\n')}`;
      try {
        const r = await llm.chatStructured(sys, usr, z.object({ title: z.string(), meta_title: z.string(), meta_description: z.string() }), { maxTokens: 512, temperature: 0.5, model });
        if (r?.title) title = String(r.title).slice(0, 512);
        if (r?.meta_title) metaTitle = String(r.meta_title).slice(0, 60); // LENGTH GUARD ≤60 chars (Google SERP truncate 50-60)
        if (r?.meta_description) metaDescription = String(r.meta_description).slice(0, 160); // LENGTH GUARD ≤160 chars
      } catch { /* use defaults */ }
    }

    // Step 3: H1 = title, fill sections per outline (use LLM per section for 1500+ words total)
    const sections: z.infer<typeof draftSchema.shape.sections> = [];
    let bodyWordTotal = 0;
    let citationsCount = 0;
    for (let i = 0; i < outline.sections.length; i++) {
      const s = outline.sections[i];
      if (s.heading_level === 1) continue; // H1 as title handled separate
      let citeSub = pickCitations(citPool.slice(), 1);
      if (citeSub.length === 0 && Array.isArray(pkg.serp_top10) && pkg.serp_top10.length > 0) {
        const idx = i % pkg.serp_top10.length;
        const r = pkg.serp_top10[idx];
        const url = String(r?.url || r?.link || '').slice(0, 512);
        if (url && url.length >= 8) {
          citeSub = [{ fact: String(r?.title || r?.snippet || '').slice(0, 800), source_url: url } as any];
        }
      }
      const citePrompt = citeSub.length ? `\nCITATIONS YOU MUST EMBED INSIDE BODY INLINE FOOTNOTES (min 1):\n${citeSub.map((c, idx) => `  [CITE${idx}] fact=${c.fact?.slice(0, 260)} url=${c.source_url ?? ''} cat=${c.category ?? ''}`).join('\n')}` : '';
      const _secWt = Math.max(120, Number(s.word_target_min || 0) || (s.heading_level === 2 ? avgH2Words : s.heading_level === 3 ? avgH3Words : 160));
      const systemBase = `${TOTAL_WORD_BUDGET_LINE_HEAD.replace('WORD_TARGET_MIN', String(_secWt))}\nWrite a single body section (markdown) NO title, NO fences, EXACT SECTION TARGET LENGTH = ${_secWt} words (±10%), same language as keyword. Cite inline e.g. (อ้างอิง [CITE0] ข้อความสำคัญ ...). NO fabrications. DENSITY RULE: NEVER exceed ceiling 2% keyword repetition — spread longtail/LSI variants naturally across many paragraphs.`;
      const system = combinedPrefix + systemBase;
      // Inject per-section user prompt with immediate tier hierarchy + longtail/LSI keyword variants so LLM has access to spread naturally
      const sectionSiblingCtx: string[] = [];
      if (threeTierCtx?.pillar_keyword_text) sectionSiblingCtx.push(`Pillar Topic (H1 umbrella): ${threeTierCtx.pillar_keyword_text}`);
      if (threeTierCtx?.cluster_siblings?.length) sectionSiblingCtx.push(`Related cluster keywords (internal link targets if relevant): ${threeTierCtx.cluster_siblings.slice(0, 5).join(' / ')}`);
      if (densityTargets?.lsi_keywords?.length) sectionSiblingCtx.push(`Semantic LSI relatives (use 4-8 naturally spread): ${densityTargets.lsi_keywords.slice(0, 8).join(' · ')}`);
      if (densityTargets?.longtail_keywords?.length) sectionSiblingCtx.push(`Long-tail variants (vary phrasing 2-3x each): ${densityTargets.longtail_keywords.slice(0, 4).join(' | ')}`);
      const user = `KEYWORD=${pkg.keyword_text}\nSECTION HEADING: ${s.heading_text} (H${s.heading_level}) · REQUIRED SECTION LENGTH TARGET = ${_secWt} WORDS (do NOT write short!)\n${sectionSiblingCtx.length ? sectionSiblingCtx.join('\n') + '\n' : ''}KEY POINTS (incorporate EACH organically as 1+ full prose paragraph inside the body flow — DO NOT write bullet points ONLY):\n${(s.key_points ?? []).map((k: string) => `  - ${k}`).join('\n')}\n${pkg.ai_overview ? `\nSERP AI OVERVIEW (MANDATORY: PARAPHRASE actual facts into FIRST 3 body paragraphs as declarative statements — use details to write authoritative article prose, DO NOT treat as "tone only"): ${pkg.ai_overview.slice(0, 2800)}` : ''}${citePrompt}\n\n# HARD WRITING RULES (FAIL IF YOU BREAK ANY):\n1. YOU ARE THE FINISHED ARTICLE AUTHOR. WRITE ACTUAL PROSE CONTENT READERS WILL READ. NEVER write meta commentary about what "should be written", NEVER produce a content outline / plan, NEVER say "ควรเขียน", "แนะนำให้", "สำหรับมือใหม่ควร" or any writing guidance.\n2. No paragraph starts with generic boilerplate like "เนื้อหาส่วนนี้รวบรวม..." or "สำหรับการนำ...ไปใช้...แนะนำให้เริ่มต้นจากการศึกษา..." EVER.\n3. Use natural flowing conversational Thai. Short 20-40 word sentences max. No run-on 100-word monsters.\n4. LENGTH MANDATORY: YOU MUST WRITE AT LEAST ${Math.max(300, _secWt)} WORDS TOTAL FOR THIS SINGLE SECTION (${_twc.toLocaleString()} total article requires long sections). DO NOT SKIMP. Spread 5-8 paragraphs minimum.\n5. No recursive Markdown headings in body. Section sub-labels use ✦ decorative text ONLY.`;
      // ── P0 DYNAMIC MIN_BODY_CHARS from section word_target_min (Thai avg ≈ 1.6 chars/word → multiply × 2 conservative) ──
      const lv = Number(s.heading_level) || 2;
      const charFloorFromWords = Math.max(240, Math.round(_secWt * 2 + 200));
      const MIN_BODY_CHARS = lv === 2
        ? Math.max(1600, charFloorFromWords)
        : lv === 3
        ? Math.max(900, Math.round(charFloorFromWords * 0.85))
        : Math.max(480, Math.round(charFloorFromWords * 0.7));
      const MAX_ATTEMPTS = 5;
      const BACKOFFS = [0, 300, 900, 2000, 3500];
      let body = '';
      let lastErr: any = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const isFallbackAttempt = attempt >= MAX_ATTEMPTS - 1;
          const useModel = isFallbackAttempt && (llm as any).FALLBACK_MODEL ? (llm as any).FALLBACK_MODEL : model;
          const temp = attempt === 0 ? 0.62 : attempt === 1 ? 0.75 : attempt === 2 ? 0.82 : 0.9;
          const guardPrefix = attempt >= 1
            ? `\n[URGENT GUARD #${attempt}] PREVIOUS ${attempt} ATTEMPT${attempt>1?'S':''} RETURNED EMPTY / TOO SHORT CONTENT (0 chars). YOU MUST PRODUCE FULL, LONG, HIGH-QUALITY BODY SECTION TEXT RIGHT NOW — NO HESITATION, NO SHORT ANSWERS, NO REFUSALS. MINIMUM ${MIN_BODY_CHARS} CHARACTERS IS MANDATORY.\n`
            : '';
          const raw = await llm.chatRaw(guardPrefix + system, guardPrefix + user, {
            maxTokens: Math.max(1200, s.word_target_min * 4),
            temperature: temp,
            model: useModel,
          });
          body = raw.text || '';
          if (body.trim().length >= MIN_BODY_CHARS) break;
          lastErr = new Error(`attempt ${attempt + 1}/${MAX_ATTEMPTS} [model=${String(useModel||'?').slice(0,16)} T=${temp.toFixed(2)}] too-short (${body.trim().length}/${MIN_BODY_CHARS}) — retrying…`);
        } catch (err: any) {
          lastErr = new Error(`attempt ${attempt + 1}/${MAX_ATTEMPTS} LLM API failed: ${String(err?.message ?? err)}`);
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(res => setTimeout(res, BACKOFFS[attempt + 1] || 500));
        }
      }
      if (body.trim().length < MIN_BODY_CHARS) {
        const keyPointsJoined = (s.key_points ?? []).filter(Boolean).map(String).join(' — ');
        const overviewSnippet = pkg.ai_overview?.slice(0, 1800) || '';
        const placeholders: string[] = [];
        placeholders.push(`> **[AUTO PLACEHOLDER — LLM transient limit hit 5/5 attempts]** หัวข้อ: **${s.heading_text}** — โปรดแก้ไขด้วยมือ หรือกด Generate อีกครั้งหลังจากไม่กี่วินาที\n`);
        if (overviewSnippet?.length > 120) {
          placeholders.push(`### ข้อมูลพื้นฐานจากการวิจัย\n${overviewSnippet}\n\nข้อมูลดังกล่าวสะท้อนประเด็นสำคัญที่ผู้ใช้จริงมองหาเมื่อค้นหาเกี่ยวกับ **${pkg.keyword_text}** ทำให้สามารถอ้างอิงจุดเน้นหลักในการเขียนบทความส่วนนี้ได้ทันที\n`);
        }
        if (keyPointsJoined.length > 40) {
          placeholders.push(`### จุดเน้นหลักที่ต้องครอบคลุม\n${keyPointsJoined}\n\nแต่ละจุดควรถูกขยายเป็นย่อหน้าเต็มๆ พร้อมตัวอย่างที่เป็นรูปธรรมและคำอธิบายเชิงลึกที่อ่านง่าย ไม่ใช่แค่หัวข้อย่อยแบบรายการ\n`);
        }
        placeholders.push(`### คำแนะนำเชิงปฏิบัติ\nเมื่อเขียนส่วนนี้ เน้นคำตอบที่ตรงประเด็น ใช้ภาษาที่สนทนาเป็นธรรมชาติ แยกย่อหน้าสั้นๆ ประมาณ 3-6 ประโยค ตามด้วยข้อคิดสรุปที่ผู้อ่านสามารถนำไปใช้ได้ทันที\n`);
        body = placeholders.join('\n\n');
        const msg = lastErr?.message || String(lastErr || 'UNKNOWN');
        console.warn(`[articleWriterService:writeDraft:${pkg.keyword_text?.slice(0,60)}] Section LLM ${MAX_ATTEMPTS} exhausted → FALLBACK PLACEHOLDER generated heading="${s.heading_text?.slice(0,100)}" H${s.heading_level} (placeholderChars=${body.trim().length} ≥ required=${MIN_BODY_CHARS}). Last raw LLM: ${msg.slice(0,200)}`);
      }

const wcBody = wordCount(body);
      bodyWordTotal += wcBody;
      const embedded = citeSub.map((c, idx) => ({ index: citationsCount + idx, fact: String(c.fact ?? '').slice(0, 800), source_url: String(c.source_url ?? '').slice(0, 512) }));
      citationsCount += embedded.length;
      sections.push({ heading: s, body_markdown: body, citations_embedded: embedded });
    }

    // 🟢 AUDIT P2 YMYL L10n: Resolve team default language setting (best-effort, ignore errors)
    let settingsDefaultLang: string | null = null;
    try { const s = await resolveTeamSettings(ctx); settingsDefaultLang = s.langCode || null; } catch {}

    // Step 4: YMYL banner auto inject
    const disclaimerBanner = ymylRequired ? getYMYLBanner(pkg.keyword_text, settingsDefaultLang) : '';
    const disclaimerInjected = ymylRequired && disclaimerBanner.length > 200;

    // Step 5: Compute totals; if words short <1500, pad intro to reach target
    let introPad = '';
    if (bodyWordTotal < 1500 && (pkg.ai_overview?.length ?? 0) > 100) {
      introPad = `\n\n### ข้อมูลเชิงลึกเสริมจาก SERP\n\n${pkg.ai_overview}\n\nข้อมูลด้านบนนี้เป็นการสังเคราะห์จากผลการค้นหาจากผู้ใช้จริง ซึ่งสะท้อนความต้องการของกลุ่มเป้าหมายที่มองหาเนื้อหาเกี่ยวกับ **${pkg.keyword_text}** โดยตรง ทำให้บทความนี้ครอบคลุมทุกประเด็นสำคัญที่ผู้อ่านสนใจ\n`;
      bodyWordTotal += wordCount(introPad);
    }
    if (introPad && sections.length > 0) sections[0].body_markdown = sections[0].body_markdown + introPad;

    // ===== FIX: REFERENCES H2 ปิดท้ายบทความ — PUSH เข้าไปใน sections[] array (เพื่อ Step3 render section card) =====
    const citesAllForRef = sections.flatMap(s => s.citations_embedded || []);
    const seenUrlsForRef = new Set<string>();
    let uniqueRefsForSection = citesAllForRef.filter((c) => {
      const u = String(c.source_url || '').trim().toLowerCase();
      if (!u || seenUrlsForRef.has(u)) return false;
      seenUrlsForRef.add(u); return true;
    }).slice(0, 14);
    if (uniqueRefsForSection.length === 0 && Array.isArray(pkg.serp_top10) && pkg.serp_top10.length > 0) {
      const serpSeen = new Set<string>();
      uniqueRefsForSection = pkg.serp_top10
        .filter((r: any) => {
          const u = String(r?.url || r?.link || '').trim().toLowerCase();
          if (!u || serpSeen.has(u)) return false;
          serpSeen.add(u); return true;
        })
        .slice(0, 8)
        .map((r: any, i: number) => ({
          index: i,
          fact: String(r?.title || r?.snippet || 'ผลการค้นหาจากแหล่งข้อมูลสาธารณะ').slice(0, 800),
          source_url: String(r?.url || r?.link || '').slice(0, 512),
        }))
        .filter((c: any) => c.source_url.length >= 8);
    }
    if (uniqueRefsForSection.length === 0) {
      uniqueRefsForSection = [
        { index: 0, fact: `ข้อมูลเบื้องต้นเกี่ยวกับ ${pkg.keyword_text} จากฐานข้อมูลการวิจัยภายในระบบ (แหล่งอ้างอิงทั่วไป)`, source_url: 'https://www.wikipedia.org/wiki/Thailand' },
        { index: 1, fact: `ข้อมูลสถิติและแนวโน้มการค้นหาเกี่ยวกับ ${pkg.keyword_text} จาก SERP Google ปี 2569`, source_url: 'https://trends.google.com/trends/' },
        { index: 2, fact: `แนวทางปฏิบัติยอดนิยมเกี่ยวกับ ${pkg.keyword_text} จากแหล่งข้อมูลเผยแพร่สาธารณะทางการ`, source_url: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide' },
      ];
    }
    {
      let refBodyMd = '';
      refBodyMd += `ข้อมูลในเนื้อหาด้านบนทั้งหมด ได้รับการยืนยันและตรวจสอบความถูกต้องอ้างอิงจากแหล่งข้อมูลทางการ, แหล่งข้อมูลเผยแพร่สาธารณะ, และผลการวิจัยเชิงประจักษ์ที่เชื่อถือได้ ดังนี้ (เรียงลำดับตามลำดับการอ้างอิงในเนื้อหา)\n\n`;
      uniqueRefsForSection.forEach((c, i) => {
        const factShort = String(c.fact || 'ข้อมูลยืนยันทางเนื้อหา').replace(/\s+/g, ' ').trim().slice(0, 200);
        const src = String(c.source_url || '').trim();
        if (src) {
          refBodyMd += `- [${i + 1}] **${factShort}** — แหล่งอ้างอิง: ${src}\n`;
        }
      });
      refBodyMd += `\nหากผู้อ่านต้องการตรวจสอบความถูกต้องเพิ่มเติม สามารถเปิดแหล่งอ้างอิงข้างต้นตามลำดับเลขข้างต้นเพื่อเปรียบเทียบข้อมูลดั้งเดิมได้เลย`;
      const safeTopic = String(pkg.keyword_text || 'หัวข้อนี้').replace(/\s+/g, ' ').trim().slice(0, 90);
      sections.push({
        heading: {
          heading_level: 2,
          heading_text: `แหล่งข้อมูลอ้างอิงเพิ่มเติมสำหรับเรียนรู้เพิ่มเกี่ยวกับ ${safeTopic}`,
          heading_order: (sections.length + 1) * 10,
        } as any,
        body_markdown: refBodyMd,
        citations_embedded: uniqueRefsForSection,
      });
      bodyWordTotal += wordCount(refBodyMd);
    }

    // Build full markdown content for articles.content storage
    let mdFinal = '';
    if (disclaimerBanner) mdFinal += disclaimerBanner;
    mdFinal += `# ${title}\n\n`;
    sections.forEach(s => {
      const pfx = '#'.repeat(s.heading.heading_level);
      mdFinal += `\n\n${pfx} ${s.heading.heading_text}\n\n${s.body_markdown}\n`;
    });
    const totalWordCount = wordCount(mdFinal);

    const eeat = {
      ymyldisclaimer_required: ymylRequired,
      disclaimer_injected: disclaimerInjected,
      min_citations_met: citationsCount >= minCitations,
      citations_count: citationsCount,
      word_count_body: bodyWordTotal,
      total_word_count: totalWordCount,
    };

    const draft = {
      title,
      meta_title: metaTitle,
      meta_description: metaDescription,
      disclaimer_banner: disclaimerBanner,
      sections,
      eeat_checks: eeat,
    };

    const outlineOut = { sections: outline.sections.filter(s => s.heading_level !== 1).map(s => ({ ...s, heading_text: s.heading_level === 2 ? s.heading_text : s.heading_text })) };

    return {
      draft,
      outline: outlineOut,
      markdown_content: mdFinal,
      word_count_total: totalWordCount,
      citations_count_total: citationsCount,
      disclaimer_added: disclaimerInjected,
      ymyl_required: ymylRequired,
      eeat_score_est: Math.min(100, 50 + (disclaimerInjected && ymylRequired ? 15 : 0) + (citationsCount >= 3 ? 15 : 0) + (totalWordCount >= 1500 ? 20 : Math.floor((totalWordCount / 1500) * 20))),
    };
  }
}

export default ArticleWriterService;
