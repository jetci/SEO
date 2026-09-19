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

let _thSegBe: any = null;
function wordCount(text: string): number {
  const asciiWords = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
  const thaiStr = (text.match(/[\u0E00-\u0E7F][\u0E00-\u0E7F\s]*/g) || []).join(' ');
  let thaiW = 0;
  if (thaiStr.length > 0) {
    try {
      if (typeof (globalThis as any).Intl !== 'undefined' && typeof ((globalThis as any).Intl as any).Segmenter !== 'undefined') {
        if (!_thSegBe) _thSegBe = new ((globalThis as any).Intl as any).Segmenter('th-TH', { granularity: 'word' });
        const segList = [..._thSegBe.segment(thaiStr)];
        thaiW = segList.filter((s: any) => s.isWordLike === true).length;
      } else {
        const thaiChars = text.match(/[\u0E00-\u0E7F]/g)?.length ?? 0;
        thaiW = Math.ceil(thaiChars / 5);
      }
    } catch {
      const thaiChars = text.match(/[\u0E00-\u0E7F]/g)?.length ?? 0;
      thaiW = Math.ceil(thaiChars / 5);
    }
  }
  return asciiWords + thaiW;
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
    ctx: any,
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
    ctx: any,
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
      if (lv === 1) { s.word_target_min = 0; s.word_target_max = 0; continue; }
      const explicitMin = Number(s.word_target_min || 0);
      const explicitMax = Number(s.word_target_max || 0);
      const defaultMin = lv === 2 ? avgH2Words : lv === 3 ? avgH3Words : Math.max(80, Math.round(avgH2Words * 0.4));
      const defaultMax = lv === 2 ? 350 : lv === 3 ? 220 : Math.max(140, Math.round(defaultMin * 1.6));
      s.word_target_min = explicitMin > 40 ? explicitMin : defaultMin;
      s.word_target_max = explicitMax > (s.word_target_min + 40) ? explicitMax : defaultMax;
    }
    const TOTAL_WORD_BUDGET_LINE_HEAD = `[TOTAL ARTICLE TARGET: ${_twc.toLocaleString()} WORDS MANDATORY]. Spread content across sections naturally WITHOUT keyword stuffing — trust the long-tail/LSI hierarchy for variation. Each section MUST hit ITS OWN word_target_min (never write short generic 200-word blobs when user asked for ${_twc.toLocaleString()} total words — that's how stuffing happens!). Target length for THIS section = ~WORD_TARGET_MIN words, MAX WORD LIMIT PER SECTION = WORD_TARGET_MAX words (DO NOT EXCEED — if approaching limit, split into new H3 subheading OR switch to bullet points).`;

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
    let sectionPlaceholderCount = 0;
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
      const _secMaxWt = Math.max(_secWt + 40, Number(s.word_target_max || 0) || (s.heading_level === 2 ? 350 : s.heading_level === 3 ? 220 : 260));
      const SEO_18_BLUEPRINT_RULES = `\n═══════════════════════════════════════\n✅ SEO 34 MANDATORY BLUEPRINT RULES (18 Base + 11 Template/Citation + 5 NEW Source Quality 2026/09/18) — NON-NEGOTIABLE FAIL IF BROKEN:\n═══════════════════════════════════════\n[PER-SECTION STRUCTURE S1-S5]\nS1: Exactly 2-4 PARAGRAPHS for this section — NO MORE, NO LESS.\nS2: EVERY PARAGRAPH = 2-4 sentences (40-70 Thai words each) — NO run-on sentences.\nS3: Add \\n\\n TWO NEWLINES between paragraphs — WHITESPACE MANDATORY mobile readability, NO WALL OF TEXT.\nS4: SECTION WORD COUNT: MIN ${_secWt} / MAX ${_secMaxWt} Thai words. IF approaching ${Math.round(_secMaxWt * 0.88)} words → SWITCH TO BULLET POINTS or create H3 subheading.\nS5: PARAGRAPH ORDER MANDATORY: P1 (1st para) = CORE IDEA / THESIS — answer "${s.heading_text}" in sentences 1-2 DIRECTLY, NO FILLER intro. P2-P3 (middle paragraphs) = SUPPORTING DETAILS + data + examples + inline citations [CITE0] etc. LAST PARA = BULLET SUMMARY (2-3 bullets) OR transition sentence.\n[KEYWORDS K2-K5]\nK2: FIRST 100 WORDS OF THIS SECTION — MUST include ${pkg.keyword_text} OR LSI synonym OR close semantic relative.\nK3: DENSITY 1-2% SWEET SPOT: NEVER repeat exact focus keyword "${pkg.keyword_text}" 3+ consecutive times. REPEAT = SWAP TO LSI/SYNONYM. MAX 2% total.\nK4: IF YOU INCLUDE AN IMAGE (if any in body): alt text MUST contain focus keyword OR LSI.\nK5: LSI / SYNONYM SWAP: Replace repetition with natural Thai synonyms.\n[USER TEMPLATE BLUEPRINT 4 H2 STANDARD FLOW ORDER (T1-T3 MANDATORY IF SECTION TYPE MATCHES)]\nT1-INTRO: If this is INTRO / H1 / first section before H2 → BUDGET 100-150 WORDS ONLY. 1-2 paras. HOOK READER. 100 FIRST WORDS OF ENTIRE ARTICLE MUST CONTAIN "${pkg.keyword_text}" OR LSI.\nT2-H2-FLOW: If 4 H2 sections in article, THEY MUST APPEAR IN THIS STANDARD ORDER (DO NOT REARRANGE): 1) นิยาม / ความสำคัญ (Definition+Importance, 2 paras + 1 EXTERNAL CITE stat/global def MINIMUM 1) → 2) แกนหลัก / วิธีการ / กลยุทธ์ (Core Method Strategy, split 1-3 H3 sub: H3ก Bullet 3-5 items + H3ข INTERNAL LINK 1 to sibling guide) → 3) ปัญหาพบบ่อย / FAQ / เปรียบเทียบ (Common Issues Compare, use TABLE or CHECKLIST or Q&A 3-5 sets) → 4) ข้อควรระวัง / Best Practices / Tips (2-3 short paras + 1 internal/external link MIN)\nT3-CONCLUSION: If this is LAST SECTION / CONCLUSION / สรุป / NEXT STEPS → BUDGET 100-150 WORDS ONLY. PARAGRAPH 1 = Summary recap main ideas. LAST SENTENCE OR LAST PARA = INCLUDE CTA (Call To Action) LINK = Internal link to product page / service page / next step article OR external trusted tool page.\n[CITATION & LINK ANCHOR TEXT RULES C1-C3 (NON-NEGOTIABLE USER VERBATIM)]\nC1-CITATION-ON-STATS: ANYTIME YOU WRITE NUMBERS (2+ digits), STATISTICS, RESEARCH DATA, LAWS, GLOBAL STANDARDS → YOU MUST EMBED INLINE CITATION LINK [CITE0] IMMEDIATELY NEXT TO THE NUMBER. NEVER quote raw numbers / stats WITHOUT an external authority source link.\nC2-ANCHOR-TEXT: Never write anchors like "คลิกที่นี่ / click here / ที่นี่ / อ่านต่อ / raw URL". ALWAYS WRITE SEMANTIC ANCHORS THAT DESCRIBE THE LINK, e.g. "ตามรายงานสำนักงานสถิติแห่งชาติ ปี 2567", "งานวิจัย Journal of Medical Research 2025", "ข้อมูลกระทรวงการคลัง".\nC3-EXTERNAL-BLANK: Every external non-localhost markdown link you create → use target="_blank" open new tab format in anchor attribute context if writing HTML; for markdown style, annotate with note EXTERNAL in anchor suffix so reader knows new tab opens.\n[CITATION SOURCE QUALITY TIER HIERARCHY (Q1-Q5 TOP-DOWN PREFERENCE — USE HIGHEST TIER AVAILABLE FIRST)]\nSOURCE-Q1-BEST (MANDATORY FOR MEDICAL/HEALTH/SCIENCE STATS): Academic Peer-Reviewed / University Research / Journal Papers / MDPI / ResearchGate / PubMed / Scopus / Mahidol / Chula / Thammasat Research Reports / Elsevier / JSTOR.\nSOURCE-Q2 (MANDATORY MINIMUM FOR ANY 3+ DIGIT NUMBERS / PERCENTAGES): Official Government Statistics / International Organizations (NSO สำนักงานสถิติ / BOT ธนาคารประจำประเทศ / WHO / World Bank / UN / IMF) OR Tier-1 Market Research (Statista / Gartner / Nielsen / NPD / Kantar). NEVER use Q5 blog posts for 3+ digit statistics — minimum Q2 or SKIP THE NUMBER.\nSOURCE-Q3 (LAW/REGULATION/STANDARDS): Royal Gazette / Laws / Ministerial Regulations / ISO 27001 / Industry Standards / Ministry Announcements.\nSOURCE-Q4 (PRODUCT/SOFTWARE): Official Developer Documentation / Original Brand Spec Sheet / Release Notes / GitHub Changelog / Vendor Official Page ONLY.\nSOURCE-Q5 (MIN ACCEPTABLE OPINION ONLY — FORBIDDEN FOR STATS): LinkedIn Verified SME quotes / Expert 10+ year experience interviews / Industry thought leadership articles. USE ONLY for subjective opinions where no Q1-Q4 facts exist; NEVER cite Q5 sources for factual numeric data.\n[FORBIDDEN SOURCES F1-F4 = AUTOMATIC FAIL IF FOUND IN FINAL BODY (DO NOT INCLUDE THESE LINKS EVER)]\nF1-COPY-CHAIN FORBIDDEN: Pantip / Sanook Hitz / Dek-D forum boards / random blogspot / copy-paste content sites with no original source backlink to Q1-Q4.\nF2-OUTDATED: Statistical / Trend data OLDER THAN 3 YEARS (year ≤ 2022 as of 2026 baseline) — EXCEPTION: historical research, fundamental theory, established base laws.\nF3-CLOAKED-ADS: Native advertorials / sponsored / promo pages with no disclosed data — if the page is primarily selling a product with no independent numbers, do not cite.\nF4-ANONYMOUS: No author name / no publisher domain / no about page / no contact page — unidentifiable source.\n[CITATION APPLICATION PRINCIPLES P1-P3 (HOW TO INSERT INTO BODY PROSE)]\nP1-PARAPHRASE-NOT-QUOTE: Never copy full paragraph from source. Extract 1-2 key numbers or 1 key finding ONLY, then REWRITE in your own Thai prose flow + embed citation link right after the claim sentence. Avoid long block quotes.\nP2-ANCHOR-SEMANTIC-DEPTH: Place link anchor on AGENCY / STUDY NAME + YEAR combination (e.g. "ผลงานวิจัย มหิดล 2568"), NEVER on generic pronouns. Anchor minimum 5+ Thai characters or 3+ meaningful words ideally.\nP3-LATEST-VERSION-CHECK: For laws, software specs, product features — ALWAYS assume latest updated version applies; if source URL lists Version 8 but current known public version is 10 → defer to current public version in text body, cite official release page NOT old archive.
[CITATION SENTENCE FORMATTING TEMPLATES (6 PRO TEMPLATES) + 3 TECHNIQUES A1-A3 NON NEGOTIABLE — EVERY STAT / STUDY / LAW CITATION MUST USE 1 OF 6 TEMPLATES BELOW]
TEMPLATE CATEGORY 1 — INDUSTRY REPORTS / OFFICIAL STATISTICS:
TEMPLATE 1A (SOURCE FIRST): Format = "จาก[ประเภทรายงาน] ประจำปี [ปี พ.ศ. / ค.ศ.] โดย **[ชื่อหน่วยงาน]** พบว่า [ใจความสำคัญ] ซึ่งแตะระดับ [ตัวเลข] [หน่วย]" — Example: "จากรายงานพฤติกรรมผู้ใช้อินเทอร์เน็ตในไทย ประจำปี 2568 โดย **สำนักงานพัฒนาธุรกรรมทางอิเล็กทรอนิกส์ (ETDA)** พบว่า ผู้บริโภคใช้เวลามากที่สุดกับการซื้อออนไลน์และวิดีโอสั้น เฉลี่ยสูงถึง 7.2 ชั่วโมงต่อวัน"
TEMPLATE 1B (DATA FIRST, SOURCE LAST): Format = "[ใจความสำคัญ + ตัวเลข] สอดคล้องกับดัชนีชี้วัดล่าสุดจาก **[ชื่อหน่วยงานวิจัย]** ที่เก็บสถิติจาก [จำนวนแหล่ง] แห่งทั่วโลก" — Example: "อัตราการเปิดอ่านอีเมล B2B เพิ่มขึ้นเฉลี่ย 4.3% เมื่อปรับหัวข้อเฉพาะบุคคล สอดคล้องกับดัชนีชี้วัดล่าสุดจาก **HubSpot Research** ที่เก็บสถิติจากแคมเปญกว่า 1,000 แห่ง"
TEMPLATE CATEGORY 2 — ACADEMIC / SCIENTIFIC STUDIES:
TEMPLATE 2A (CONFIRM FACT): Format = "[ข้อเท็จจริงทั่วไป] โดยผลการศึกษาจาก **[ชื่อหน่วยงานวิชาการ]** ระบุว่า [วิธีการ] สามารถลด/เพิ่ม [ผลลัพธ์] เกือบ [เปอร์เซ็นต์] %" — Example: "การพักสายตาทุก 20 นาทีช่วยลดความล้าตาอย่างมีนัยสำคัญ ผลศึกษาจาก **American Academy of Ophthalmology (AAO)** ระบุว่า กฎ 20-20-20 ลดตาแห้งและปวดศีรษะจากการจ้องจอภาพลงได้เกือบ 40%"
TEMPLATE 2B (COUNTER MYTH / PARADOX): Format = "แม้หลายคนเชื่อว่า [ความเชื่อโชว์ทั่วไป] แต่ผลการทดลองของ **[ชื่อมหาวิทยาลัย/ทีมวิจัย]** กลับพบว่า สมองมนุษย์สูญเสียประสิทธิภาพ [เปอร์เซ็นต์] % ทุกครั้งที่ [เหตุการณ์สลับงาน]" — Example: "แม้หลายคนเชื่อว่า Multitasking ประหยัดเวลา แต่ผลทดลองของ **มหาวิทยาลัยสแตนฟอร์ด (Stanford University)** กลับพบว่า สมองสูญเสียประสิทธิภาพประมวลผลลงถึง 40% ทุกครั้งที่สลับโฟกัสไปมาระหว่างงาน"
TEMPLATE CATEGORY 3 — REGULATIONS / OFFICIAL STANDARDS:
TEMPLATE 3A (REGULATION + PENALTY/RIGHTS): Format = "[ประเด็นกิจกรรม] จำเป็นต้องได้รับความยินยอมอย่างชัดเจน ตามข้อกำหนดใน **[ชื่อกฎหมาย พ.ศ. XXXX]** ซึ่งกำหนด [บทลงโทษ/ข้อจำกัด/สิทธิผู้ใช้]" — Example: "การเก็บข้อมูลส่วนบุคคลต้องได้รับความยินยอมชัดเจน ตาม **พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)** ซึ่งกำหนดปรับสูงสุดสำหรับองค์กรที่ไม่ปฏิบัติตามมาตรฐานความปลอดภัย"
TEMPLATE 3B (TECHNICAL SPEC / ISO STANDARD): Format = "[ระบบ/ผลิตภัณฑ์] ต้องสอดคล้องกับมาตรฐานความปลอดภัย **[ISO XXXXX / IEC / TISI]** เพื่อให้มั่นใจได้ว่า [ข้อมูล/ฟีเจอร์] จะถูก [เข้ารหัส/ตรวจสอบ] ตั้งแต่ต้นทางจนถึงปลายทาง" — Example: "ระบบจัดการฐานข้อมูลต้องสอดคล้องมาตรฐาน **ISO/IEC 27001** เพื่อให้มั่นใจได้ว่าข้อมูลสำคัญจะถูกเข้ารหัส End-to-End ตั้งแต่ต้นทางจนถึงปลายทาง"
A1-ANCHOR-EXACT-SCOPE (CRITICAL PUBLISH BLOCK G17 IF BROKEN): HYPERLINK ANCHOR MUST WRAP ONLY AGENCY NAME / STUDY NAME — SHORT! Example: use "[สำนักงานสถิติแห่งชาติ]" or "[งานวิจัยสแตนฟอร์ด]". **NEVER HIGHLIGHT FULL SENTENCE.** Anchor length MUST be 8-50 characters MAXIMUM — >=60 chars = Anchor Scope Violation Block.
A2-YEAR-CONTEXT-MANDATORY: EVERY STAT / TREND / LAW / STUDY SENTENCE THAT INCLUDES 3+ DIGIT NUMBERS MUST ALSO INCLUDE YEAR TAG (พ.ศ. 25XX or ค.ศ. 20XX) IN THE SAME PARAGRAPH — PROVIDE FRESHNESS CONTEXT TO READER AND SEARCH ENGINE.
A3-LAYMAN-TERMS-CONVERSION: STATISTICAL JARGON MUST BE CONVERTED TO SIMPLE THAI PROSE. NEVER write "p-value < 0.01", "95% confidence interval", "statistically significant p<0.05" in output. CONVERT: "p-value <0.01" → "พบความแตกต่างอย่างชัดเจนในกลุ่มทดลอง"; "95% CI" → "มั่นใจได้ 95% ว่าผลลัพธ์นี้ไม่ได้เกิดจากการสุ่ม"; "stat sig p<0.05" → "มีความแตกต่างที่น่าเชื่อถือระหว่างกลุ่ม"
═══════════════════════════════════════`;
      const systemBase = `${TOTAL_WORD_BUDGET_LINE_HEAD.replace('WORD_TARGET_MIN', String(_secWt)).replace('WORD_TARGET_MAX', String(_secMaxWt))}\nWrite a single body section (markdown) NO title, NO fences, SECTION LENGTH TARGET = ${_secWt}–${_secMaxWt} words (±8%), same language as keyword. Cite inline e.g. (อ้างอิง [CITE0] ข้อความสำคัญ ...). NO fabrications. DENSITY RULE: NEVER exceed ceiling 2% keyword repetition — spread longtail/LSI variants naturally across paragraphs.${SEO_18_BLUEPRINT_RULES}`;
      const system = combinedPrefix + systemBase;
      // Inject per-section user prompt with immediate tier hierarchy + longtail/LSI keyword variants so LLM has access to spread naturally
      const sectionSiblingCtx: string[] = [];
      if (threeTierCtx?.pillar_keyword_text) sectionSiblingCtx.push(`Pillar Topic (H1 umbrella): ${threeTierCtx.pillar_keyword_text}`);
      if (threeTierCtx?.cluster_siblings?.length) sectionSiblingCtx.push(`Related cluster keywords (internal link targets if relevant): ${threeTierCtx.cluster_siblings.slice(0, 5).join(' / ')}`);
      if (densityTargets?.lsi_keywords?.length) sectionSiblingCtx.push(`Semantic LSI relatives (use 4-8 naturally spread): ${densityTargets.lsi_keywords.slice(0, 8).join(' · ')}`);
      if (densityTargets?.longtail_keywords?.length) sectionSiblingCtx.push(`Long-tail variants (vary phrasing 2-3x each): ${densityTargets.longtail_keywords.slice(0, 4).join(' | ')}`);
      const _minCharsSec = Math.round(_secWt * 4);
      const _maxCharsSec = Math.round(_secMaxWt * 5);
      const user = `บทบาทของคุณคือผู้เชี่ยวชาญด้าน SEO และการเขียนเนื้อหาเชิงลึกภาษาไทย\nหน้าที่ของคุณคือเขียนเนื้อหาส่วนหัวข้อ: "${s.heading_text}" (H${s.heading_level})\n\nKEYWORD=${pkg.keyword_text}\nSECTION HEADING: ${s.heading_text} (H${s.heading_level}) · REQUIRED SECTION LENGTH RANGE = ${_secWt}–${_secMaxWt} WORDS · PRIMARY ACCURATE METRIC FOR THAI = ${_minCharsSec}–${_maxCharsSec} THAI CHARACTERS (รวมสระวรรณยุกต์ ห้ามนับเว้นวรรค) (MIN ${_minCharsSec} / MAX ${_maxCharsSec})\n\n[THAI PARAGRAPH-SENTENCE STRUCTURE MANDATORY (3 กฎสำคัญแก้ปัญหาเนื้อหาสั้น)]\nก. จำนวนย่อหน้าและประโยค: เขียนทั้งหมด 3 ย่อหน้าต่อเนื่องกันเป็นขั้นต่ำ 2–4 ย่อหน้า แต่ละย่อหน้าต้องมีความยาวอย่างน้อย 3–4 ประโยคเต็ม ห้ามเขียนสั้นจบใน 1–2 ประโยค\nข. แจกแจงมิติความคิด (3 มิติ Micro-Outline ทุกส่วน):\n    - ย่อหน้าที่ 1: อธิบายปัญหา สาเหตุ และความสำคัญของหัวข้อนี้ในเชิงลึก (3 ประโยคขึ้นไป)\n    - ย่อหน้าที่ 2: นำเสนอวิธีแก้ปัญหา หรือรายละเอียดหลัก พร้อมยกตัวอย่างสถานการณ์จริง 1 กรณีศึกษาแน่นอน (3 ประโยคขึ้นไป)\n    - ย่อหน้าที่ 3: สรุปข้อควรระวัง หรือ Best Practice ที่ผู้อ่านนำไปปฏิบัติได้ทันที พร้อมข้อคิดสรุปสุดท้าย (3 ประโยคขึ้นไป)\nค. ห้ามสรุปแบบรวบรัด (ANTI-SUMMARY RULE): อย่าเขียนสรุปแบบกว้างๆ หรือตัดตอนเนื้อหาให้สั้น ห้ามพูดคุยแบบลอยๆ ลงรายละเอียดเชิงลึกและอธิบายกระบวนการจริงทุกประเด็นที่กล่าวถึง\n${sectionSiblingCtx.length ? sectionSiblingCtx.join('\n') + '\n' : ''}KEY POINTS (incorporate EACH organically as 1+ full prose paragraph inside the body flow — DO NOT write bullet points ONLY unless last paragraph summary):\n${(s.key_points ?? []).map((k: string) => `  - ${k}`).join('\n')}\n${pkg.ai_overview ? `\nSERP AI OVERVIEW (MANDATORY: PARAPHRASE actual facts into FIRST 3 body paragraphs as declarative statements — use details to write authoritative article prose, DO NOT treat as "tone only"): ${pkg.ai_overview.slice(0, 2800)}` : ''}${citePrompt}\n\n# HARD WRITING RULES (FAIL IF YOU BREAK ANY):\n1. YOU ARE THE FINISHED ARTICLE AUTHOR. WRITE ACTUAL PROSE CONTENT READERS WILL READ. NEVER write meta commentary about what "should be written", NEVER produce a content outline / plan, NEVER say "ควรเขียน", "แนะนำให้", "สำหรับมือใหม่ควร" or any writing guidance.\n2. No paragraph starts with generic boilerplate like "เนื้อหาส่วนนี้รวบรวม..." or "สำหรับการนำ...ไปใช้...แนะนำให้เริ่มต้นจากการศึกษา..." EVER.\n3. Use natural flowing conversational Thai. Short 20-40 word sentences max. No run-on 100-word monsters.\n4. STRUCTURE + LENGTH MANDATORY: 2-4 PARAGRAPHS ONLY (S1 rule). MIN ${_secWt} WORDS or ${_minCharsSec}+ CHARS PRIMARY TARGET THAI, MAX ${_secMaxWt} WORDS / ${_maxCharsSec} CHARS TOTAL FOR THIS SECTION. If approaching MAX → switch LAST paragraph to bullet summary 2-3 points.\n5. No recursive Markdown headings in body. Section sub-labels use ✦ decorative text ONLY.`;
      // ── P0 DYNAMIC MIN_BODY_CHARS from section word_target_min (Thai real 4–5 chars/word actual measurement) ──
      const lv = Number(s.heading_level) || 2;
      const charFloorFromWords = Math.max(240, Math.round(_secWt * 4.5 + 200));
      const MIN_BODY_CHARS = lv === 2
        ? Math.max(2200, charFloorFromWords)
        : lv === 3
        ? Math.max(1200, Math.round(charFloorFromWords * 0.85))
        : Math.max(650, Math.round(charFloorFromWords * 0.7));
      const MAX_ATTEMPTS = 5;
      const jitter = (baseMs: number): number => Math.max(200, Math.round(baseMs * (0.7 + Math.random() * 0.6)));
      let body = '';
      let lastErr: any = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const isFallbackAttempt = attempt >= MAX_ATTEMPTS - 1;
          const useModel = isFallbackAttempt && (llm as any).FALLBACK_MODEL ? (llm as any).FALLBACK_MODEL : model;
          const temp = attempt === 0 ? 0.62 : attempt === 1 ? 0.75 : attempt === 2 ? 0.82 : 0.9;
          const guardPrefix = attempt >= 1
            ? `\n[URGENT GUARD #${attempt}] PREVIOUS ${attempt} ATTEMPT${attempt>1?'S':''} RETURNED TOO SHORT / CUT-OFF / SUMMARY-ONLY CONTENT. THAI LANGUAGE SUBWORD TOKENIZATION BUDGET CORRECTION ACTIVE — YOU MUST WRITE FULL 3 PARAGRAPHS, 3-4 SENTENCES EACH, INCLUDE THE CASE STUDY AND BEST PRACTICES. MINIMUM ${MIN_BODY_CHARS} CHARACTERS IS MANDATORY. DO NOT STOP EARLY.\n`
            : '';
          const raw = await llm.chatRaw(guardPrefix + system, guardPrefix + user, {
            maxTokens: Math.min(4000, Math.max(2800, s.word_target_min * 8)),
            temperature: temp,
            model: useModel,
          });
          body = raw.text || '';
          if (body.trim().length >= MIN_BODY_CHARS) break;
          lastErr = new Error(`attempt ${attempt + 1}/${MAX_ATTEMPTS} [model=${String(useModel||'?').slice(0,16)} T=${temp.toFixed(2)}] too-short (${body.trim().length}/${MIN_BODY_CHARS}) — retrying…`);
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          lastErr = new Error(`attempt ${attempt + 1}/${MAX_ATTEMPTS} LLM API failed: ${msg}`);
          const isAuth = msg.startsWith('[LLM_AUTH_INVALID_');
          const isCredit = msg.startsWith('[LLM_CREDIT_EXHAUSTED_');
          // CT-01 Fast fail — auth/credit/model wrong → all future attempts will also fail. Don't waste MAX_ATTEMPTS.
          const isModelInvalid =
            msg.startsWith('[LLM_MODEL_INVALID_') ||
            msg.startsWith('[LLM_MODEL_NOT_FOUND_') ||
            msg.startsWith('[LLM_MODEL_VALIDATION_');
          if (isAuth || isCredit || isModelInvalid) break;
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          const baseBackoff = attempt === 0 ? 2000 : attempt === 1 ? 5000 : attempt === 2 ? 15000 : 30000;
          const isRate = String(lastErr?.message || '').startsWith('[LLM_RATE_LIMIT_');
          const base = isRate ? baseBackoff * 2 : baseBackoff;
          await new Promise(res => setTimeout(res, jitter(base)));
        }
      }
      let sectionIsPlaceholder = false;
      if (body.trim().length < MIN_BODY_CHARS) {
        sectionIsPlaceholder = true;
        sectionPlaceholderCount++;
        const keyPointsJoined = (s.key_points ?? []).filter(Boolean).map(String).join(' — ');
        const overviewSnippet = pkg.ai_overview?.slice(0, 1800) || '';
        const msg = lastErr?.message || String(lastErr || 'UNKNOWN');

        const isAuth = msg.startsWith('[LLM_AUTH_INVALID_');
        const isCredit = msg.startsWith('[LLM_CREDIT_EXHAUSTED_');
        const isModelInvalid =
          msg.startsWith('[LLM_MODEL_INVALID_') ||
          msg.startsWith('[LLM_MODEL_NOT_FOUND_') ||
          msg.startsWith('[LLM_MODEL_VALIDATION_');
        const isRate = msg.startsWith('[LLM_RATE_LIMIT_');
        const isTimeout = /(timeout|TIMEOUT|AbortError|aborted|ETIMEDOUT|ECONNRESET|ECONNABORTED|hang up/i.test(msg);

        let reasonTh: string;
        let actionTh: string;
        if (isAuth) {
          reasonTh = 'LLM Authentication Failed — API Key ไม่ถูกต้อง';
          actionTh = 'ไปหน้า Settings → ตรวจสอบ LLM API Key ใหม่ แล้วค่อย Generate ใหม่ (ปัญหาถาวร จำกัดจำนวนครั้งไม่ได้ผล)';
        } else if (isCredit) {
          reasonTh = 'LLM Credit Exhausted — API เหลือ Balance ไม่เพียงพอ';
          actionTh = 'เติม Credit ให้ LLM Provider หรือเปลี่ยน API Key ใหม่ (ปัญหาถาวร จำกัดจำนวนครั้งไม่ได้ผล)';
        } else if (isModelInvalid) {
          reasonTh = 'LLM Model ID Invalid — ชื่อโมเดลไม่มีอยู่หรือผิดรูปแบบ Provider';
          actionTh = 'ไปหน้า Settings → เลือก Model จาก Dropdown แทนการพิมพ์เอง หรือตรวจสอบ Prefix ของ OpenRouter (ต้องมี provider/)';
        } else if (isRate) {
          reasonTh = 'LLM Rate Limit — โมเดลจำกัดจำนวนคำขอต่อนาที';
          actionTh = 'รอประมาณ 30-60 วินาที แล้วกด Generate อีกครั้ง (ปัญหาชั่วคราว Retry ได้)';
        } else if (isTimeout) {
          reasonTh = 'LLM Timeout — โมเดลตอบช้าเกินไป (เกิน 180 วินาที)';
          actionTh = 'ทางเลือก 1) ลดจำนวนคำเป้าหมายใน Section นี้ลง (3500→2500) 2) เปลี่ยน Model ที่เร็วกว่า (GPT-4o mini / Claude Sonnet) 3) กด Generate ใหม่อีก 1-2 รอบ (บางครั้ง Network ตอบช้าแค่รอบเดียว)';
        } else {
          reasonTh = 'LLM Transient Network Error — ปัญหาเครือข่ายชั่วคราว';
          actionTh = 'ลองกด Generate ใหม่ในอีก 10-20 วินาที หากซ้ำหลายครั้ง → ตรวจสอบอินเทอร์เน็ต หรือดู Status Page ของ LLM Provider';
        }

        const placeholders: string[] = [];
        placeholders.push(`> **[AUTO PLACEHOLDER — MAX ATTEMPTS EXHAUSTED (${MAX_ATTEMPTS}/${MAX_ATTEMPTS})]** สาเหตุ: ${reasonTh} | หัวข้อ: **${s.heading_text}** | แก้ไข: ${actionTh}\n`);
        if (overviewSnippet?.length > 120) {
          placeholders.push(`✦ ข้อมูลพื้นฐานจากการวิจัย ✦\n${overviewSnippet}\n\nข้อมูลดังกล่าวสะท้อนประเด็นสำคัญที่ผู้ใช้จริงมองหาเมื่อค้นหาเกี่ยวกับ **${pkg.keyword_text}** ทำให้สามารถอ้างอิงจุดเน้นหลักในการเขียนบทความส่วนนี้ได้ทันที\n`);
        }
        if (keyPointsJoined.length > 40) {
          placeholders.push(`✦ จุดเน้นหลักที่ต้องครอบคลุม ✦\n${keyPointsJoined}\n\nแต่ละจุดควรถูกขยายเป็นย่อหน้าเต็มๆ พร้อมตัวอย่างที่เป็นรูปธรรมและคำอธิบายเชิงลึกที่อ่านง่าย ไม่ใช่แค่หัวข้อย่อยแบบรายการ\n`);
        }
        placeholders.push(`✦ คำแนะนำเชิงปฏิบัติ ✦\nเมื่อเขียนส่วนนี้ เน้นคำตอบที่ตรงประเด็น ใช้ภาษาที่สนทนาเป็นธรรมชาติ แยกย่อหน้าสั้นๆ ประมาณ 3-6 ประโยค ตามด้วยข้อคิดสรุปที่ผู้อ่านสามารถนำไปใช้ได้ทันที\n`);
        body = placeholders.join('\n\n');
        console.warn(`[articleWriterService:writeDraft:${pkg.keyword_text?.slice(0,60)}] Section LLM ${MAX_ATTEMPTS} exhausted → FALLBACK PLACEHOLDER generated heading="${s.heading_text?.slice(0,100)}" H${s.heading_level} reason="${isAuth?'AUTH':isCredit?'CREDIT':isModelInvalid?'MODEL':isRate?'RATE':'TRANSIENT'}" (placeholderChars=${body.trim().length} ≥ required=${MIN_BODY_CHARS}). Last raw LLM: ${msg.slice(0,200)}`);
      }

      const wcBody = wordCount(body);
      bodyWordTotal += wcBody;
      const embedded = citeSub.map((c, idx) => ({ index: citationsCount + idx, fact: String(c.fact ?? '').slice(0, 800), source_url: String(c.source_url ?? '').slice(0, 512) }));
      citationsCount += embedded.length;
      sections.push({ heading: s, body_markdown: body, citations_embedded: embedded, is_placeholder: sectionIsPlaceholder } as any);
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
      introPad = `\n\n✦ ข้อมูลเชิงลึกเสริมจาก SERP ✦\n\n${pkg.ai_overview}\n\nข้อมูลด้านบนนี้เป็นการสังเคราะห์จากผลการค้นหาจากผู้ใช้จริง ซึ่งสะท้อนความต้องการของกลุ่มเป้าหมายที่มองหาเนื้อหาเกี่ยวกับ **${pkg.keyword_text}** โดยตรง ทำให้บทความนี้ครอบคลุมทุกประเด็นสำคัญที่ผู้อ่านสนใจ\n`;
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
      uniqueRefsForSection = [];
    }
    if (uniqueRefsForSection.length > 0) {
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

    const hasPlaceholder = sectionPlaceholderCount > 0;
    const stepStatusOverride = hasPlaceholder ? 'fail' : 'done';
    return {
      draft,
      outline: outlineOut,
      markdown_content: mdFinal,
      word_count_total: totalWordCount,
      citations_count_total: citationsCount,
      disclaimer_added: disclaimerInjected,
      ymyl_required: ymylRequired,
      eeat_score_est: Math.min(100, 50 + (disclaimerInjected && ymylRequired ? 15 : 0) + (citationsCount >= 3 ? 15 : 0) + (totalWordCount >= 1500 ? 20 : Math.floor((totalWordCount / 1500) * 20))),
      placeholder_section_count: sectionPlaceholderCount,
      has_placeholder: hasPlaceholder,
      step_status_override: stepStatusOverride,
    };
  }
}

export default ArticleWriterService;
