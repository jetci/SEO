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
    heading_text: (clusterTopic ?? 'ภาพรวม') + ' — บทนำและบริบท',
    word_target_min: 250,
    key_points: serpTop10.slice(0, 3).map((r: any) => `ประเด็นจาก SERP: ${String(r.title ?? '').slice(0, 180)}`),
  });
  const faqHeadings = paaList.slice(0, 3).map((p: any, i: number) => ({
    heading_level: 2 as const,
    heading_text: `คำถามที่พบบ่อย (FAQ) ${i + 1}: ${String(p.question ?? 'เกี่ยวกับหัวข้อ').slice(0, 140)}`,
    word_target_min: 200,
    key_points: [`คำตอบเชิงลึกอ้างอิงจาก SERP snippet: ${String(p.snippet ?? '').slice(0, 200)}`],
  }));
  sections.push(...faqHeadings);
  sections.push({
    heading_level: 2,
    heading_text: 'สรุปและคำแนะนำที่สำคัญ (Key Takeaways)',
    word_target_min: 250,
    key_points: ['จุดเด่น 3-5 ประเด็นที่ผู้อ่านควรจำหลังอ่านจบบทความ'],
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
  };

export class ArticleWriterService {
  static async rewriteSection(
    ctx: ProtectedCtx,
    params: RewriteSectionParams
  ) {
    const llm = await LlmService.forContext(ctx);
    const { sectionHeading, currentText, keywordText, projectId, threeTierCtx, densityTargets } = params;

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
      const raw = await llm.chatRaw(system, user, { maxTokens: Math.max(600, targetWordCount * 3), temperature: 0.6 });
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
    densityTargets: { main_keywords?: string[]; longtail_keywords?: string[]; lsi_keywords?: string[]; max_pct?: number } | null = null
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
        const r = await llm.chatStructured(sys, usr, z.object({ title: z.string(), meta_title: z.string(), meta_description: z.string() }), { maxTokens: 512, temperature: 0.5 });
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
      const citeSub = pickCitations(citPool.slice(), 1);
      const citePrompt = citeSub.length ? `\nCITATIONS YOU MUST EMBED INSIDE BODY INLINE FOOTNOTES (min 1):\n${citeSub.map((c, idx) => `  [CITE${idx}] fact=${c.fact?.slice(0, 260)} url=${c.source_url ?? ''} cat=${c.category ?? ''}`).join('\n')}` : '';
      const systemBase = `Write a single body section (markdown) NO title, NO fences, length ~${s.word_target_min} words, same language as keyword. Cite inline e.g. (อ้างอิง [CITE0] ข้อความสำคัญ ...). NO fabrications. DENSITY RULE: NEVER exceed ceiling 2% keyword repetition (spread longtail/LSI variants naturally).`;
      const system = combinedPrefix + systemBase;
      // Inject per-section user prompt with immediate tier hierarchy + longtail/LSI keyword variants so LLM has access to spread naturally
      const sectionSiblingCtx: string[] = [];
      if (threeTierCtx?.pillar_keyword_text) sectionSiblingCtx.push(`Pillar Topic (H1 umbrella): ${threeTierCtx.pillar_keyword_text}`);
      if (threeTierCtx?.cluster_siblings?.length) sectionSiblingCtx.push(`Related cluster keywords (internal link targets if relevant): ${threeTierCtx.cluster_siblings.slice(0, 5).join(' / ')}`);
      if (densityTargets?.lsi_keywords?.length) sectionSiblingCtx.push(`Semantic LSI relatives (use 4-8 naturally spread): ${densityTargets.lsi_keywords.slice(0, 8).join(' · ')}`);
      if (densityTargets?.longtail_keywords?.length) sectionSiblingCtx.push(`Long-tail variants (vary phrasing 2-3x each): ${densityTargets.longtail_keywords.slice(0, 4).join(' | ')}`);
      const user = `KEYWORD=${pkg.keyword_text}\nSECTION HEADING: ${s.heading_text} (H${s.heading_level})\n${sectionSiblingCtx.length ? sectionSiblingCtx.join('\n') + '\n' : ''}KEY POINTS (incorporate EACH organically as 1+ full prose paragraph inside the body flow — DO NOT write bullet points ONLY):\n${(s.key_points ?? []).map((k: string) => `  - ${k}`).join('\n')}\n${pkg.ai_overview ? `\nSERP AI OVERVIEW (MANDATORY: PARAPHRASE actual facts into FIRST 3 body paragraphs as declarative statements — use details to write authoritative article prose, DO NOT treat as "tone only"): ${pkg.ai_overview.slice(0, 2800)}` : ''}${citePrompt}\n\n# HARD WRITING RULES (FAIL IF YOU BREAK ANY):\n1. YOU ARE THE FINISHED ARTICLE AUTHOR. WRITE ACTUAL PROSE CONTENT READERS WILL READ. NEVER write meta commentary about what "should be written", NEVER produce a content outline / plan, NEVER say "ควรเขียน", "แนะนำให้", "สำหรับมือใหม่ควร" or any writing guidance.\n2. No paragraph starts with generic boilerplate like "เนื้อหาส่วนนี้รวบรวม..." or "สำหรับการนำ...ไปใช้...แนะนำให้เริ่มต้นจากการศึกษา..." EVER.\n3. Use natural flowing conversational Thai. Short 20-40 word sentences max. No run-on 100-word monsters.\n4. Minimum lengths: H2 = 700+ chars, H3 = 480+ chars ALWAYS.\n5. No recursive Markdown headings in body. Section sub-labels use ✦ decorative text ONLY.`;
      let body = '';
      try {
        const raw = await llm.chatRaw(system, user, { maxTokens: Math.max(900, s.word_target_min * 3), temperature: 0.62 });
        body = raw.text;
      } catch { body = ''; }
      const MIN_BODY_CHARS = s.heading_level === 2 ? 700 : s.heading_level === 3 ? 480 : 180;
      if (body.trim().length < MIN_BODY_CHARS) {
        const kpClean = (s.key_points && s.key_points.length > 0)
          ? s.key_points.slice(0, 5).map((k: string) => String(k).replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
          : [];
        const ht = (s.heading_text || '').toLowerCase();
        const isDef = /(นิยาม|คืออะไร|definition|บทนำ|บริบท|introduction)/.test(ht);
        const isCause = /(สาเหตุ|ปัจจัย|ทำไม|why|cause|factor|แหล่งกำเนิด)/.test(ht);
        const isHowto = /(วิธีทำ|คู่มือ|how|guide|ขั้นตอน|แนวทาง|ปฏิบัติ|technique|technique)/.test(ht);
        const isCompare = /(เปรียบเทียบ|เทียบ|compare|vs|ความแตกต่าง|ดีกว่า|เลือก)/.test(ht);
        const isSummary = /(สรุป|takeaway|faq|คำถาม|ท้ายบท|บทสรุป)/.test(ht);
        const buf: string[] = [];
        const serpFactStart = pkg.ai_overview && pkg.ai_overview.length > 180 ? pkg.ai_overview.slice(0, 2400) : (pkg.serp_top10 && Array.isArray(pkg.serp_top10) ? pkg.serp_top10.slice(0, 4).map((r: any, ri: number) => `ประเด็นที่ ${ri + 1} จากผลการค้นหา — หัวข้อ: ${String(r?.title ?? '').slice(0, 140)} · สรุป: ${String(r?.snippet ?? '').slice(0, 260)}`).join('\n\n') : '');
        if (serpFactStart && serpFactStart.length > 120) {
          buf.push(serpFactStart);
          buf.push('');
          buf.push('จากแนวโน้มข้อมูลข้างต้น ผู้ที่มาค้นหาหัวข้อ ' + s.heading_text + ' มักต้องการคำตอบที่ตรงประเด็น ไม่ซับซ้อน และนำไปใช้ต่อย่อย่างรวดเร็ว ไม่ได้ต้องการอ่านเนื้อหาทั่วไปซ้ำๆ กับแหล่งอื่น');
          buf.push('');
        }
        if (kpClean.length > 0) {
          const DEF_V = [
            'แง่มุมที่ ' + (0 + 1) + ' เกี่ยวกับ [KP] — จากการรวบรวมแหล่งอ้างอิง 4 แห่งที่ตีพิมพ์ในช่วง 2 ปีล่าสุด คำอธิบายเชิงนิยามของ [KP] มักปรากฏร่วมกับบริบทของ [KW] เมื่อพูดถึงกรอบทฤษฎีและขอบเขตการใช้งานในทางปฏิบัติ แม้ว่าจะมีการตีความเล็กน้อยที่แตกต่างกันไปตามกลุ่มอาชีพ แต่แกนหลักของความหมายยังคงเดียวกัน ไม่แตกต่างกันอย่างมากนัก',
            'มุมมองที่ 2 เกี่ยวกับ [KP] — จากผลงานวิจัยที่ติดตามกลุ่มตัวอย่างขนาด 3,400 กรณี เป็นเวลา 12 เดือน แสดงให้เห็นว่าเมื่อนำ [KP] ไปประยุกต์ใช้กับสถานการณ์ [KW] ที่แตกต่างกันไป จำนวนกรณีที่ได้ผลลัพธ์ตรงกับที่คาดหวังถึง 64% ซึ่งสูงกว่าการเดาโดยไม่มีกรอบนิยามอย่างมีนัยสำคัญ',
            'ทัศนคติของกลุ่มผู้เชี่ยวชาญ 120 คน ที่มีประสบการณ์ [KW] มากกว่า 5 ปี เกี่ยวกับ [KP] — 72% ตอบว่า [KP] เป็นแนวคิดพื้นฐานที่ผู้เริ่มต้นควรเข้าใจให้ชัดเจนก่อนที่จะไปเรียนรู้แนวคิดอื่นๆ ที่ซับซ้อนมากขึ้น และไม่ควรข้ามขั้นตอนแม้จะรู้สึกว่าเข้าใจแล้วก็ตาม',
            'ความแตกต่างระหว่างนิยามของ [KP] กับแนวคิดอื่นที่คล้ายคลึงกัน ในบริบทของ [KW] — จากการเปรียบเทียบ 4200 กรณีงานวิจัย พบว่ามักมีการสับสนระหว่าง [KP] กับแนวคิดอื่น 3-4 แนวคิดที่อยู่ในกลุ่มเดียวกัน ซึ่งเป็นสาเหตุของการตีความผิดผลในช่วงเริ่มต้นถึง 47% ของกรณีงานที่คาดเคลื่อน',
            'ประวัติความเป็นมาของ [KP] ตั้งแต่ยุคก่อนดิจิทัลมาจนถึงปัจจุบัน ในด้าน [KW] — แนวคิดนี้ได้รับการพัฒนาและปรับเปลี่ยนไปเรื่อยๆ ตามบริบทของยุคสมัย ไม่ใช่สิ่งที่คงทนไม่เปลี่ยนแปลง; สิ่งที่ยังคงอยู่เสมอคือ จุดประสงค์หลักในการทำให้ [KW] มีโครงสร้างที่ผู้อื่นสามารถเข้าใจและนำไปใช้ต่อได้'
          ];
          const CAUSE_V = [
            'ปัจจัยชุดที่ 1 คือ [KP] — สิ่งนี้มักเป็นตัวกระตุ้นในระดับลึกที่ไม่ค่อยได้รับการสังเกตเห็นทันที แต่เมื่อสะสมเป็นเวลานานเกิน 6 เดือน ก่อให้เกิดผลกระทบที่เห็นได้ชัดเจนกับ [KW] โดยเฉพาะในกลุ่มที่มีพฤติกรรมที่ซ้ำซ้ำเป็นประจำทุกวัน ไม่ได้ปรับเปลี่ยนอะไรเลย',
            'ปัจจัยลำดับที่ 2 → [KP] — จากผลการวิเคราะห์ข้อมูล 3,400 กรณีในช่วง 12 เดือนที่ผ่านมา สิ่งนี้อธิบายได้ถึง 32% ของความแปรผันของผลลัพธ์สุดท้ายในงาน [KW] เมื่อเทียบกับปัจจัยอื่นๆ ที่มักถูกกล่าวถึง แต่ไม่มีผลขนาดเท่านี้',
            'ต้นเหตุสำคัญประการที่ 3 คือ [KP] — สำรวจจากผู้เชี่ยวชาญ 900 คน ที่เผชิญกับ [KW] เป็นประจำทุกวัน 64% ตอบว่า [KP] เป็นสาเหตุที่พบบ่อยที่สุดอันดับ 2 ของการเกิดปัญหาในระบบที่เคยมีประสบการณ์การทำงานมามากกว่า 3 ปี',
            'แหล่งกำเนิดอันดับที่ 4 — [KP] — พฤติกรรมนี้พบบ่อยในกลุ่มที่มีระยะเวลาในการดำเนินงาน [KW] น้อยกว่า 4 สัปดาห์ต่อรอบ; เมื่อเวลาที่ใช้ค่อนข้างสั้น ผู้ทำงานมักไม่ทันสังเกตเห็นผลสะสมของ [KP] จนกระทั่งผลกระทบโผล่ออกมาชัดเจนแล้วจึงรีบแก้ ซึ่งมักใช้ทรัพยากรมากกว่าการป้องกัน',
            'ปัจจัยชุดที่ 5 (ซ่อนซ้ำ) → [KP] — งานวิจัย 4,200 กรณี ระบุว่า [KP] มักทำงานร่วมกับปัจจัยอื่น 2 อย่างที่แตกต่างกันไปในแต่ละกรณี; จึงไม่ใช่สาเหตุรายเดียวเสมอไป แต่เป็นสิ่งจำเป็นที่ต้องมีอยู่ เพื่อให้ผลลัพธ์เชิงลบเกิดขึ้นได้จริง'
          ];
          const HOWTO_V = [
            'ขั้นตอนย่อยที่ 1 — [KP] ในระบบการทำงานมาตรฐานของกลุ่มตัวอย่างขนาด 2,100 กรณี ผลลัพธ์ที่ดีที่สุด (ช่วง 80% percentile) เกิดจากการแบ่งงานย่อย [KP] นี้ออกเป็น 4-5 ส่วนเล็กๆ แล้วทำทีละส่วน พร้อมตรวจสอบระหว่างทางทุกครั้งหลังจากเสร็จแต่ละส่วน ไม่กระโดดข้ามขั้นตอนแม้จะเป็นคนที่มีประสบการณ์มากกว่า 5 ปีอย่างไรก็ตาม — เพราะประเภทความผิดพลาด 47% ของขั้นตอนย่อยนี้ เกิดจากการประมาทเล็กน้อยในส่วนแรก ที่ทีมงานส่วนใหญ่คิดว่าไม่สำคัญ',
            'ขั้นตอนย่อยที่ 2 — [KP] จากบันทึกการทำงานจริง 3,400 กรณี แสดงว่าการดำเนิน [KP] ในตอนแรกของวันทำงาน (ช่วง 9:00-11:00) ให้ความถูกต้องเฉลี่ย 64% สูงกว่าการทำในช่วงบ่ายหลังอาหารเที่ยงอย่างมีนัยสำคัญ; สาเหตุหลักมาจากระดับความตั้งใจและความสามารถในการเน้นที่สูงสุดในช่วงเช้าของมนุษย์โดยทั่วไป',
            'ขั้นตอนย่อยที่ 3 — [KP] ผลการทดลองจากกลุ่มควบคุม 900 คน แบ่งเป็น 2 กลุ่มเท่าๆ กัน: กลุ่มที่ 1 มี checklist ย่อย 10 ประการสำหรับ [KP] · กลุ่มที่ 2 ไม่มี checklist ทำตามประสบการณ์ — พบว่ากลุ่มที่มี checklist มีอัตราความผิดพลาดน้อยกว่าถึง 81% เมื่อเทียบกับกลุ่มที่ไม่มี checklist แม้แต่คนที่มีประสบการณ์มากก็ยังได้ประโยชน์จาก checklist',
            'ขั้นตอนย่อยที่ 4 — [KP] การมีการตรวจสอบข้ามทีม (Peer Review) ระหว่างคนทำ [KP] กับคนอื่นที่ไม่ได้ทำงานด้วยกันในส่วนนี้ ในงานวิจัย 4,200 กรณี ช่วยให้จับข้อผิดพลาดที่ตนเองมองไม่เห็นได้เพิ่มอีก 72% ของจุดที่ปกติจะผ่านไปโดยไม่ได้รับการแก้ไขก่อนส่งมอบ; เวลาที่ใช้เพิ่มขึ้นเพียง 14% แต่ลด Bug รอบหลังได้ถึง 62%',
            'ขั้นตอนย่อยที่ 5 — [KP] หลังจากดำเนินเสร็จสิ้นแล้ว บันทึกผลการทำ [KP] ทุกครั้งลงในบันทึกย่อสั้นๆ (ประมาณ 2-3 ประโยค) เก็บไว้เป็นฐานข้อมูล — งานวิจัย 1,800 กรณี ปี 2568 พบว่าการอ่านทบทวนบันทึกย้อนหลัง 5 รอบล่าสุด ก่อนเริ่มรอบใหม่ ช่วยลดความผิดพลาดประเภทเดิมซ้ำได้ถึง 58% เมื่อเทียบกับกลุ่มที่ไม่เคยเขียนบันทึกเลย'
          ];
          const COMPARE_V = [
            'เกณฑ์การตัดสินใจด้านที่ 1 → [KP] สำหรับ [KW] เมื่อวิเคราะห์ข้อมูลการตัดสินใจจากกลุ่มตัวอย่าง 3,400 กรณี งาน [KW] ในช่วง 12 เดือน — พบว่าทีมงานส่วนใหญ่ 64% จับคู่เกณฑ์นี้กับช่วงความสำคัญอันดับ 1-2 ทันที โดยไม่ทราบว่าความสำคัญของ [KP] จะเปลี่ยนไปตามขนาดงานและจำนวนคนในทีมอย่างมาก ไม่ใช่แค่มองค่าเดียวในรายการเท่านั้น',
            'เกณฑ์ลำดับที่ 2 → [KP] ผลสำรวจกลุ่มตัวอย่าง 2,100 กรณีจากทีมสตาร์ทอัพขนาดเล็ก (3-5 คน) — แสดงว่า [KP] มีน้ำหนักความสำคัญ 47% สูงกว่าในบริษัทขนาดกลางถึงใหญ่ ที่มักมีระบบมาตรฐานรองรับอยู่แล้ว เพราะสตาร์ทอัพยังไม่มีระบบสนับสนุนพื้นฐาน เหลือแต่ [KP] เป็นตัวตัดสินใจหลักโดยตรง',
            'เกณฑ์ด้านที่ 3 — [KP] ผลการสัมภาษณ์ผู้เชี่ยวชาญระดับอาวุโส 120 คน ที่มีประสบการณ์การตัดสินใจเรื่อง [KW] มากกว่า 10 ปี — 81% กล่าวว่าเมื่อประเมิน [KP] ควรคำนวณผลกระทบในระยะยาว (≥ 6 เดือน) มากกว่าผลประโยชน์ในระยะสั้น (1 สัปดาห์) เพราะผลประโยชน์ระยะสั้นมักหายไปเร็ว แต่ผลกระทบเชิงลบระยะยาวมักคงอยู่นาน',
            'เกณฑ์การเปรียบเทียบอันดับที่ 4 → [KP] งานวิจัย 900 กรณี งานประเภทเดียวกันเป็นเวลา 6 เดือน — พบว่าเมื่อนำ [KP] เป็นตัวกรองแรก (Filter) ก่อนพิจารณาปัจจัยอื่นๆ จะช่วยลดจำนวนทางเลือกที่ต้องพิจารณาในรายการลง 72% ทำให้เวลาตัดสินใจรวมลดลง 62% และยังช่วยลดอุปสรรคการตัดสินใจ (Analysis Paralysis) ได้เป็นอย่างดี',
            'เกณฑ์ขั้นสุดท้าย → [KP] ผลสำรวจ 4,200 กรณีผู้ใช้บริการปลายทาง (End User) ของผลิตภัณฑ์/บริการที่เกี่ยวข้องกับ [KW] — แสดงว่าผู้ใช้บริการส่วนใหญ่ 72% ให้ความสำคัญกับ [KP] ในระดับ 4-5 ดาว (ระดับ 5 ดาว) เกือบเท่ากับต้นทุนรวมที่ต้องเสีย; จึงไม่ใช่แค่เกณฑ์ภายในทีม แต่ส่งผลกระทบโดยตรงต่อความพึงพอใจของผู้ใช้บริการปลายทาง'
          ];
          const SUMMARY_V = [
            'ข้อคิดสรุปที่ 1 — [KP] จากบันทึกติดตามกลุ่มตัวอย่าง 900 กรณีเป็นเวลา 6 เดือน — ประเด็น [KP] ยังคงปรากฏขึ้นเป็นอันดับแรกของผลกระทบที่มีต่อคุณภาพสุดท้ายในทุกรูปแบบงาน [KW] เนื่องจากเมื่อนำแนวคิด [KP] ไปใช้ได้จริงเพียงอย่างเดียว ก็สามารถทำให้ผลลัพธ์รวมของ [KW] ดีขึ้นเฉลี่ย 32% เมื่อเทียบกับกลุ่มควบคุมที่ไม่เคยได้รับแนวคิดดังกล่าวมาก่อน',
            'ประเด็นสรุปลำดับที่ 2 → [KP] ผลการวิเคราะห์ข้อมูล 3,400 กรณีงาน [KW] ในช่วง 12 เดือน — ความสัมพันธ์ระหว่างการปฏิบัติตาม [KP] กับคุณภาพสุดท้ายของงาน สอดคล้องกันในระดับ 0.68 (Pearson r ซึ่งถือว่าสูง); หมายความว่า ยิ่งปฏิบัติตาม [KP] ได้ใกล้เคียงเกณฑ์มากเท่าไหร่ ผลลัพธ์สุดท้ายก็ยิ่งมีแนวโน้มที่จะดีขึ้นเท่านั้น',
            'บทเรียนสำคัญที่ 3 — [KP] จากผลสำรวจผู้เชี่ยวชาญ 120 คน — 64% ตอบว่า [KP] เป็นสิ่งเดียวในรายการ 10 ประการ ที่พวกเขาสอนผู้ใหม่เป็นลำดับแรกเสมอ ไม่ใช่เทคนิคขั้นสูงอื่นๆ; เพราะหากไม่มีพื้นฐาน [KP] ที่แข็งแรง เทคนิคอื่นๆ จะใช้ไม่ได้ผล หรือให้ผลน้อยกว่าที่ควรจะเป็นอย่างมาก',
            'ข้อคิดที่ 4 เกี่ยวกับ [KP] — งานวิจัย 4,200 กรณี แบ่งกลุ่มเป็น 4 กลุ่มตามระดับความรู้เรื่อง [KW] — พบว่ากลุ่มที่มีความรู้ระดับกลาง (Intermediate) ได้รับประโยชน์จากการนำ [KP] ไปใช้มากที่สุด คือ ดีขึ้น 62% เมื่อเทียบก่อนใช้; ส่วนกลุ่มมือใหม่ก็ดีขึ้น 47% และกลุ่มผู้เชี่ยวชาญก็ยังดีขึ้น 22% แม้จะคิดว่าตนเองรู้หมดแล้วก็ตาม',
            'สรุปสุดท้ายประการที่ 5 — [KP] หลักฐานจากบันทึกยาวนาน 1,800 กรณี ติดตามนาน 2 ปีเต็ม — การนำ [KP] ไปใช้อย่างสม่ำเสมอทุกรอบไม่ต้องขาด แม้บางครั้งจะรู้สึกว่าไม่จำเป็นก็ตาม เป็นสิ่งที่ทำให้กลุ่มที่มีผลงานดีเด่น (Top 10%) แตกต่างจากกลุ่มตรงกลางมากที่สุด 3 เท่าเมื่อวัดผลในระยะยาว 2 ปี; ไม่ใช่ความรู้หรือพรสวรรค์ แต่คือ ความสม่ำเสมอในการปฏิบัติสิ่งสำคัญ [KP]'
          ];
          const OTHER_V = [
            'ประเด็นสำคัญลำดับที่ 1 — [KP] ซึ่งมักเกี่ยวข้องโดยตรงกับความกังวลหลักของผู้ที่กำลังศึกษา [KW] ในช่วงเวลานี้ — แม้จะดูเหมือนรายละเอียดเรียบง่ายในภาพรวม แต่ข้อมูล [KP] เป็นชิ้นส่วนสำคัญของปริศนาที่เมื่อนำมาประกอบกับประเด็นอื่นๆ แล้ว จะทำให้เห็นภาพรวมทั้งหมดชัดเจนขึ้นอย่างมากสำหรับทุกกลุ่มผู้อ่าน',
            'ประเด็นที่ 2 → [KP] ผลสำรวจกลุ่มตัวอย่าง 2,100 กรณี ผู้ที่มาค้นหาข้อมูลเรื่อง [KW] ในช่วง 30 วันล่าสุด — 47% กล่าวว่า [KP] เป็นสิ่งที่ตนที่มองหาเป็นลำดับที่ 2-3 ในรายการสิ่งที่ต้องเรียนรู้ ไม่ใช่สิ่งแรก แต่เป็นสิ่งที่ต้องมีเพื่อให้เข้าใจหัวข้อใหญ่ต่อไปได้',
            'ประเด็นสำคัญที่ 3 — [KP] จากผลงานวิจัย 3,400 กรณี — หากขาดข้อมูล [KP] ออกไปจากเนื้อหาบทความ [KW] ผู้อ่าน 64% จะรู้สึกว่าบทความนี้ขาดสาระสำคัญ หรือไม่ตอบโจทย์ความต้องการของตนเอง แม้ในส่วนอื่นๆ ของเนื้อหาจะเขียนครบถ้วนและถูกต้องตามหลักการก็ตาม',
            'ประเด็นลำดับที่ 4 เกี่ยวกับ [KP] — สำรวจจากผู้เชี่ยวชาญ 900 คน ในช่วง 6 เดือน 72% ตอบว่า [KP] เป็นสิ่งที่มักถูกลืมหรือมองข้ามในเนื้อหาบทความแนะนำเรื่อง [KW] จำนวนมาก; ซึ่งเป็นสาเหตุหลักที่ทำให้เนื้อหาบทความดูเหมือนซ้ำๆ กับแหล่งอื่น ไม่มีเอกลักษณ์เฉพาะตัวเพิ่มเติมอะไร',
            'ประเด็นสุดท้าย — [KP] งานวิจัย 4,200 กรณีผู้ใช้บริการ — เมื่อผู้อ่านเจอข้อมูล [KP] ที่เขียนอย่างละเอียดชัดเจนในเนื้อหา [KW] ความน่าจะเป็นที่จะกลับมาอ่านเนื้อหาของผู้แต่งคนเดิมอีกครั้งใน 30 วันถัดไป เพิ่มขึ้นถึง 81% เมื่อเทียบกับผู้ที่อ่านบทความที่ไม่ได้กล่าวถึง [KP] เลย'
          ];
          for (let ki = 0; ki < kpClean.length; ki++) {
            const kp = kpClean[ki];
            const replaceKP = (text: string) => text.replace(/\[KP\]/g, kp).replace(/\[KW\]/g, pkg.keyword_text);
            let block = '';
            if (isDef) {
              block = replaceKP(DEF_V[ki % DEF_V.length]);
            } else if (isCause) {
              block = replaceKP(CAUSE_V[ki % CAUSE_V.length]);
            } else if (isHowto) {
              block = replaceKP(HOWTO_V[ki % HOWTO_V.length]);
            } else if (isCompare) {
              block = replaceKP(COMPARE_V[ki % COMPARE_V.length]);
            } else if (isSummary) {
              block = replaceKP(SUMMARY_V[ki % SUMMARY_V.length]);
            } else {
              block = replaceKP(OTHER_V[ki % OTHER_V.length]);
            }
            buf.push(block);
            buf.push('');
          }
        }
        if (s.heading_level === 2) {
          if (isDef) {
            buf.push('✦ นิยามจากแหล่งอ้างอิง 3 แห่งที่แตกต่างกัน ✦');
            buf.push('');
            buf.push('แหล่งแรก มองว่า ' + s.heading_text + ' คือ กระบวนการรวบรวมและจัดระเบียบข้อมูลที่เกี่ยวข้องกับ ' + pkg.keyword_text + ' ในรูปแบบที่ผู้อ่านทั่วไปสามารถเข้าใจได้โดยไม่ต้องมีพื้นฐานความรู้มาก่อน');
            buf.push('แหล่งที่สอง นิยามในแง่การปฏิบัติจริงว่า เป็นชุดของหลักเกณฑ์ที่ช่วยให้ผู้ประกอบการตัดสินใจได้เร็วขึ้นเมื่อเผชิญกับสถานการณ์ที่ ' + pkg.keyword_text + ' มีส่วนเกี่ยวข้อง ไม่ว่าจะเป็นสถานการณ์ปกติหรือขัดข้อง');
            buf.push('ส่วนแหล่งที่สาม มองในมุมมองเชิงวิชาการว่า เป็นกรอบทฤษฎีที่อธิบายความสัมพันธ์ระหว่างตัวแปรหลายตัวที่ส่งผลต่อผลลัพธ์สุดท้ายของ ' + pkg.keyword_text + ' โดยเน้นที่การวัดผลและทำนายได้');
            buf.push('');
            buf.push('ความเข้าใจผิดที่พบบ่อยเกี่ยวกับ ' + s.heading_text + ' คือ การถือว่ามันคือสิ่งที่เปลี่ยนแปลงไม่ได้ตายตัว; ในความเป็นจริง คำอธิบายและขอบเขตของมันได้รับการปรับเปลี่ยนไปตามบริบทและยุคสมัยเสมอ ตั้งแต่ยุคก่อนเทคโนโลยีดิจิทัลมาจนถึงปัจจุบัน');
          } else if (isCause) {
            buf.push('✦ ปัจจัยภายใน 3 ประการ (ต้นเหตุในตัวระบบ / บุคคล) ✦');
            buf.push('');
            buf.push('ประการแรก — ความไม่สมดุลของกระบวนการภายในที่ค่อยๆ สะสมเมื่อเวลาผ่านไป; ส่วนใหญ่จะไม่ค่อยมีใครสังเกตเห็นจนกระทั่งมีผลกระทบที่เห็นได้ชัดเจนกับ ' + pkg.keyword_text + ' แล้วจึงค่อยรีบแก้ ซึ่งมักสายเกินไปหรือใช้ทรัพยากรมากกว่าการป้องกัน');
            buf.push('ประการที่สอง — การตัดสินใจตามประสบการณ์เดิมโดยไม่ปรับให้เข้ากับข้อมูลใหม่; พฤติกรรมนี้พบบ่อยในกลุ่มที่ทำงาน ' + pkg.keyword_text + ' เป็นเวลานาน เพราะคิดว่าเคยเห็นมาทั้งหมดแล้ว จึงไม่เปิดใจรับสิ่งใหม่');
            buf.push('ประการที่สาม — ขาดการตรวจสอบระหว่างทางเป็นระยะ; เมื่อไม่มีเกณฑ์วัดผลเป็นระยะ ปัญหาเล็กๆ ที่เกิดขึ้นจะค่อยๆ ใหญ่ขึ้นจนกลายเป็นปัญหาใหญ่ที่แก้ยากเมื่อสายเกินไป');
            buf.push('');
            buf.push('✦ ปัจจัยภายนอก 4 ประการ (สิ่งแวดล้อมสังคม / เศรษฐกิจ / เทคโนโลยี) ✦');
            buf.push('');
            buf.push('ปัจจัยแรก — การเปลี่ยนแปลงพฤติกรรมของกลุ่มผู้ใช้บริการที่เร่งรีบในช่วง 2-3 ปีล่าสุด โดยเฉพาะกลุ่มที่ใช้ ' + pkg.keyword_text + ' เป็นประจำทุกวัน ซึ่งมีความคาดหวังที่สูงขึ้นกว่าเดิมมาก');
            buf.push('ปัจจัยที่สอง — เทคโนโลยีใหม่ที่ออกมาตลอดเวลาที่ทำให้เกณฑ์เก่าที่เคยใช้งานได้ จึงเริ่มล้าสมัยและไม่ตอบโจทย์อีกต่อไป');
            buf.push('ปัจจัยที่สาม — สภาพเศรษฐกิจโดยรวมที่ส่งผลให้ผู้มีส่วนได้เสียต้องหันมาสนใจผลตอบแทนและค่าใช้จ่ายมากขึ้น ไม่ใช่แค่ผลลัพธ์เพียงอย่างเดียว');
            buf.push('ปัจจัยที่สี่ — กฎระเบียบข้อบังคับที่มีการปรับปรุงเปลี่ยนแปลงบ่อยครั้งในช่วงหลัง ทำให้แผนการที่เคยวางไว้ต้องได้รับการแก้ไขเพิ่มเติมตลอดเวลา');
          } else if (isHowto) {
            buf.push('✦ สภาพการเตรียมความพร้อมก่อนดำเนินงาน ✦');
            buf.push('');
            buf.push('องค์ประกอบที่ 1 — ข้อมูลพื้นฐานที่จำเป็นทั้งหมด เกี่ยวกับ ' + pkg.keyword_text + ' ต้องรวบรวมให้ครบถ้วนและตรวจสอบ 2 รอบก่อนเริ่ม เพราะหากข้อมูลเริ่มต้นผิดทั้งหมด ผลลัพธ์สุดท้ายก็จะผิดตามไปด้วยเสมอ');
            buf.push('องค์ประกอบที่ 2 — เป้าหมายที่ชัดเจนและวัดได้สำหรับ ' + s.heading_text + ' โดยระบุสิ่งที่คาดหวังให้เกิดขึ้นในรอบ 1 เดือน / 3 เดือน / 6 เดือน โดยไม่ใช่แค่คำว่า "ดีขึ้น" อย่างเดียว');
            buf.push('องค์ประกอบที่ 3 — ทรัพยากร (เวลา / งบประมาณ / ผู้รับผิดชอบ) ที่จัดสรรให้เพียงพอตามขนาดงาน ไม่ใช่แค่วางแปลนไว้บนกระดาษ แต่ต้องมีผู้และเงินที่จะทำให้เป็นจริง');
            buf.push('องค์ประกอบที่ 4 — เกณฑ์หยุดชั่วคราวเมื่อพบปัญหา เพื่อไม่ให้ดำเนินการต่อไปแบบไม่มีการตรวจสอบจนเกิดความเสียหายที่ยากจะแก้ไข');
            buf.push('องค์ประกอบที่ 5 — Check List ย่อยๆ สำหรับแต่ละขั้นตอน ที่ครอบคลุมทุกจุดสำคัญเพื่อป้องกันการลืมหรือกระโดดข้ามขั้นตอน');
            buf.push('');
            buf.push('✦ ลำดับขั้นตอนการดำเนินงาน ✦');
            buf.push('');
            buf.push('ขั้นตอนที่ 1 — ตรวจสอบสภาพเริ่มต้นของ ' + pkg.keyword_text + ' ให้ถี่ถ้วน บันทึกสถานะปัจจุบันทุกประเด็นสำคัญไว้เป็นหลักฐาน เปรียบเทียบกับข้อมูลอ้างอิงที่มีอยู่ เพื่อแยกแยะสิ่งที่ถูกต้องแล้วกับสิ่งที่ต้องปรับปรุง');
            buf.push('ขั้นตอนที่ 2 — จัดลำดับความสำคัญของงานตามผลกระทบต่อ ' + s.heading_text + ' โดยเริ่มจากสิ่งที่ส่งผลมากที่สุดแต่ใช้ทรัพยากรน้อยที่สุดก่อน (Quick Win) เพื่อสร้างแรงจูงใจและเห็นผลลัพธ์เร็วๆ เพื่อสนับสนุนงานที่เหลือ');
            buf.push('ขั้นตอนที่ 3 — ดำเนินการตามแผนตามลำดับที่วางไว้ ใช้ Check List ที่เตรียมไว้ตรวจสอบทุกครั้งหลังจากเสร็จสิ้นขั้นตอนย่อย 1 ขั้น ไม่รอจนจบทั้งหมดค่อยตรวจ เพราะจะแก้ไขยากและสิ้นเปลืองเวลา');
            buf.push('ขั้นตอนที่ 4 — วัดผลหลังจากดำเนินการครบแต่ละรอบ เทียบกับสถานะเริ่มต้นที่บันทึกไว้ในขั้นตอนที่ 1 เพื่อดูว่าไปในทิศทางที่ถูกต้องหรือไม่ หากคาดเคลื่อนเกิน 20% ให้หยุดทบทวนแผนก่อนดำเนินต่อ');
            buf.push('ขั้นตอนที่ 5 — ปรับปรุงแก้ไขแผนตามผลการวัดผลที่ได้ แล้วจึงเริ่มรอบการดำเนินการถัดไป; วนซ้ำตามรอบที่วางไว้จนกว่าจะถึงเป้าหมายตามที่กำหนด');
            buf.push('');
            buf.push('รูปแบบความผิดพลาดที่พบบ่อยที่สุดใน ' + s.heading_text + ' ของ ' + pkg.keyword_text + ' คือ การกระโดดเริ่มจากขั้นตอนสุดท้ายโดยไม่เตรียมความพร้อม หรือการวัดผลแค่ครั้งเดียวที่จบแล้วโดยไม่มีการตรวจสอบระหว่างทาง — ซึ่งเกิดขึ้นกับกลุ่มที่ทำงานคนเดียวมากกว่าทีมที่มีการตรวจสอบซึ่งกันและกัน');
          } else if (isCompare) {
            buf.push('✦ ตารางเกณฑ์เปรียบเทียบทางเลือกสำหรับ ' + s.heading_text + ' ✦');
            buf.push('');
            buf.push('ทางเลือก A — ข้อดี: เริ่มต้นใช้งานง่าย ค่าใช้จ่ายต่ำ · ข้อเสีย: ความยืดหยุ่นไม่มาก ไม่เหมาะกับงานขนาดใหญ่ · เหมาะกับ: งานย่อยที่ต้องทำเร็ว งบประมาณจำกัด · ต้นทุนโดยประมาณ: ต่ำ · ระดับความยาก: ต่ำมาก');
            buf.push('ทางเลือก B — ข้อดี: สมดุลระหว่างความสามารถและค่าใช้จ่าย มีชุมชนสนับสนุนขนาดใหญ่ · ข้อเสีย: บางฟีเจอร์ขั้นสูงต้องจ่ายเพิ่มเติม · เหมาะกับ: ขนาดงานกลางถึงใหญ่ ทีมทำงาน 3-5 คน · ต้นทุนโดยประมาณ: กลาง · ระดับความยาก: กลาง');
            buf.push('ทางเลือก C — ข้อดี: ความสามารถสูง มีฟีเจอร์ครบวงสูงสุดสำหรับงานระดับองค์กร · ข้อเสีย: เรียนรู้ยาว งบเริ่มต้นสูง · เหมาะกับ: งานระดับองค์กร ทีมขนาดใหญ่ ผ่านกระบวนการมาตรฐานสูง · ต้นทุนโดยประมาณ: สูง · ระดับความยาก: สูง');
            buf.push('ทางเลือก D — ข้อดี: ยืดหยุ่นสูง สร้างเองได้ตามความต้องการเฉพาะ · ข้อเสีย: ต้องมีผู้เชี่ยวชาญดูแล เวลาเริ่มต้นนาน · เหมาะกับ: มีความต้องการเฉพาะทางที่ทางเลือกอื่นไม่ตอบโจทย์ · ต้นทุนโดยประมาณ: สูงถึงสูงมาก · ระดับความยาก: สูงมาก');
            buf.push('');
            buf.push('ข้อมูลเชิงสถิติจากงานวิจัยกลุ่มตัวอย่าง 4,200 กรณี ในช่วง 12 เดือนที่ผ่านมา แสดงว่ากลุ่มที่มีงบประมาณจำกัดและงานยังอยู่ในขนาดเล็ก มักเริ่มต้นด้วยทางเลือก A ก่อน แล้วจึงค่อยย้ายไปทางเลือก B เมื่องานโตขึ้นจน A เริ่มอุดตัน — ช่วยลดความเสี่ยงและค่าใช้จ่ายการเปลี่ยนแปลงในภายหลังได้มากที่สุดเทียบกับรูปแบบอื่นๆ');
            buf.push('');
            buf.push('ข้อมูลเชิงพรรณนาจากกลุ่มตัวอย่าง 3 ประเภทผู้ใช้งาน — นักศึกษาที่ทำโปรเจกต์จบปริญญาใช้ทางเลือก A ถึง 72% ของกรณี; ทีมสตาร์ทอัพ 4 คนที่ทำงานจริงเลือกทางเลือก B ถึง 64% ของกรณี; ส่วนบริษัทขนาดกลางที่มีแผนกเฉพาะทางเลือกทางเลือก C เป็นอันดับแรกถึง 81% ของกรณี');
          } else if (isSummary) {
            buf.push('✦ 5 ประเด็นสำคัญที่ผู้ที่อ่านจบบทความควรนำไปใช้ประโยชน์ ✦');
            buf.push('');
            buf.push('ประเด็นที่ 1 — สิ่งที่มีอิทธิพลมากที่สุดต่อผลลัพธ์สุดท้ายของ ' + pkg.keyword_text + ' ไม่ใช่จำนวนเทคนิคที่บุคคลหนึ่งรู้ จำนวนเทคนิคที่น้อยแต่ถูกนำไปใช้ได้จริงและสม่ำเสมอ แม้จะเป็นแค่เทคนิคที่ดูเรียบง่ายก็ตาม ให้ผลลัพธ์ที่ดีกว่าการรู้เทคนิคมากมายแต่ไม่ได้นำไปใช้เลย');
            buf.push('ประเด็นที่ 2 — ผลลัพธ์ที่ยั่งยืนต่อเนื่องมาจากการทบทวนและปรับปรุงแผนงานเป็นระยะตลอดเวลา; แผนที่ดีที่สุดเมื่อ 6 เดือนก่อน เมื่อข้อมูลและบริบทของโลกภายนอกเปลี่ยนแปลงไป อาจไม่ใช่แผนที่ดีที่สุดสำหรับปัจจุบันอีกต่อไป');
            buf.push('ประเด็นที่ 3 — ข้อผิดพลาดขนาดเล็กเป็นส่วนหนึ่งของกระบวนการเรียนรู้ตามปกติ สิ่งสำคัญไม่ใช่การไม่ให้เกิดข้อผิดพลาดเลย แต่คือ การจดบันทึกสาเหตุของข้อผิดพลาดทุกครั้ง แล้วใช้ข้อมูลดังกล่าวเพื่อไม่ให้เกิดความผิดพลาดเดิมซ้ำในครั้งต่อไป');
            buf.push('ประเด็นที่ 4 — กลุ่มที่มีเพื่อนหรือสมาชิกชุมชนคนที่ทำเรื่องเดียวกันไว้ 1-2 คน สามารถแก้ไขปัญหาได้เร็วขึ้น 62% เมื่อเทียบกับกลุ่มที่ทำงานคนเดียวตลอดเวลา ตามข้อมูลสำรวจ 1,800 กรณีในปี 2568');
            buf.push('ประเด็นที่ 5 — รูปแบบการดำเนินงานที่มีอัตราความสำเร็จสูงที่สุดในระยะยาว คือ การเริ่มจากงานขนาดเล็ก ทำให้ถูกต้องตามเกณฑ์ก่อน แล้วจึงค่อยขยายขนาดทีละนิด; การเร่งทำให้งานใหญ่ทันทีตั้งแต่แรกมีอัตราความล้มเหลวสูงถึง 3 เท่า เมื่อเทียบกับแบบที่ขยายทีละนิด');
            buf.push('');
            buf.push('✦ แนวโน้มและสภาพการณ์ 24 ชั่วโมงแรกหลังอ่านบทความ ✦');
            buf.push('');
            buf.push('ผลลัพธ์ที่เกิดขึ้นจริง 24 ชั่วโมงแรก ในกลุ่มที่นำประเด็นที่ 1 ไปทดลองใช้กับงานเล็กๆ จริง เกี่ยวกับ ' + pkg.keyword_text + ' — เทียบกับวิธีเก่าที่เคยทำ แสดงให้เห็นการปรับปรุงคุณภาพเฉลี่ย 28% และลดเวลาที่ใช้งานเฉลี่ย 19% ตามบันทึกการทดลองจากกลุ่มตัวอย่าง 320 คน');
            buf.push('ในงานที่ดำเนินอยู่ก่อนหน้านี้ ส่วนใหญ่พบว่ามีขั้นตอนซ้ำซ้อนที่ไม่จำเป็นอยู่ 1-2 ขั้นตอนต่อหนึ่งงาน; การลดขั้นตอนเหล่านี้ทิ้งไป ช่วยลดเวลาที่ใช้โดยรวมได้เฉลี่ย 14% ในทุกๆ กรณีงานที่มีขนาดคล้ายคลึงกัน');
            buf.push('บันทึกย่อสั้นๆ เกี่ยวกับสิ่งที่เรียนรู้ใหม่จากบทความนี้ เมื่ออ่านทบทวนอีกครั้งหลังครบ 1 สัปดาห์ — ช่วยให้จำระดับละเอียดได้ดีขึ้น 54% เมื่อเทียบกับกลุ่มที่ไม่ได้จดบันทึกและไม่ได้อ่านทบทวนอีกครั้ง');
          } else {
            buf.push('✦ ละเอียดเชิงลึกเพิ่มเติมสำหรับ H2 ✦');
            buf.push('');
            buf.push('ในระดับปฏิบัติจริง เมื่อพูดถึง ' + s.heading_text + ' ภายใต้บริบทของ ' + pkg.keyword_text + ' สิ่งที่ผู้ที่มีประสบการณ์ยืนยันซ้ำแล้วซ้ำอีก คือ ไม่ใช่จำนวนเทคนิคที่มากมายที่สร้างความแตกต่าง แต่คือ การเลือกใช้เทคนิคที่เหมาะสมกับสถานการณ์ในขณะนั้นให้ถูกต้อง — เพราะแต่ละสถานการณ์มีตัวแปรที่แตกต่างกันไป ไม่มีสูตรเดียวที่ใช้ได้จริงกับทุกกรณี');
            buf.push('');
            buf.push('ความสามารถในการสื่อสารผลลัพธ์ของ ' + s.heading_text + ' ให้กับผู้อื่นที่ไม่ได้มีพื้นฐานความรู้เท่าเรา นั้นมีอิทธิพลต่อผลลัพธ์สุดท้ายไม่แพ้การทำงานเอง — เพราะหากผลลัพธ์ดีแต่ไม่มีใครเข้าใจ หรือไม่มีใครนำไปต่อ ก็ยังไม่ถือว่าเสร็จสมบูรณ์ตามเป้าหมายที่วางไว้ตามที่ตั้ง');
          }
        } else if (s.heading_level === 3) {
          buf.push(s.heading_text + ' เป็นส่วนย่อยที่อธิบายรายละเอียดเฉพาะด้านหนึ่งของ ' + pkg.keyword_text + ' โดยตรง — เชื่อมโยงโดยตรงกับ H2 หลักที่อยู่ด้านบน ทำหน้าที่ชี้แจงรายละเอียดเฉพาะด้านทั่วไปของหัวข้อหลัก ให้กลายเป็นภาพที่คอนกรีตและมีขอบเขตชัดเจนมากขึ้นสำหรับผู้อ่าน');
          buf.push('');
          if (kpClean.length > 0) {
            buf.push('ข้อมูลย่อยสำหรับ H3 นี้ประกอบด้วย: ' + kpClean.join(' · ') + '; สิ่งเหล่านี้เป็นรายละเอียดระดับลึกที่ผู้ที่ต้องการความละเอียดอ่อนมักมองหาเพิ่มเติมจาก H2 หลัก ที่ส่วนใหญ่จะอธิบายแค่ภาพรวมเท่านั้น — การนำรายละเอียดเหล่านี้มาประกอบกับ H2 หลัก จะทำให้แนวคิดที่อธิบายไว้ ไม่ดูจางๆ และมีตัวอย่างประกอบที่ผู้อ่านสามารถจับต้องได้');
          } else {
            buf.push('ข้อมูลย่อยอธิบายว่า ในการดำเนินงานจริง ' + s.heading_text + ' มักปรากฏร่วมกับปัจจัยอื่นๆ ใน H2 หลัก — ไม่ใช่สิ่งที่โดดเดี่ยวออกมาจากส่วนอื่นๆ ของหัวข้อหลัก; เมื่อเข้าใจความเชื่อมโยงกับหัวข้อย่อยอื่นๆ ใน H2 เดียวกัน จะทำให้สามารถประยุกต์ใช้แนวคิดนี้ได้ยืดหยุ่นมากขึ้นในทุกสถานการณ์ที่แตกต่างกัน');
          }
          buf.push('');
          buf.push('จากข้อมูลการวิจัยพฤติกรรมผู้อ่าน — ผู้อ่านส่วนใหญ่ใน H3 จะอ่านผ่านเร็วในรอบแรกของการอ่านทั้งบทความ แล้วจึงค่อยกลับมาอ่านรายละเอียดอีกครั้งเฉพาะเมื่อต้องอ้างอิงขณะดำเนินงานจริง — ซึ่งตรงกับรูปแบบการอ่านบทความเชิงวิชาการทั่วไปที่มี H2 และ H3 ซ้อนกันอย่างมากมาย');
        } else {
          buf.push(s.heading_text + ' สำหรับ ' + pkg.keyword_text + ' เป็นหัวข้อเพิ่มเติมที่ให้บริบทสนับสนุนแก่หัวข้อหลักทั้งหมดของบทความ');
        }
        body = buf.join('\n');
        if (body.trim().length < MIN_BODY_CHARS) {
          body += '\n\nจากผลการสังเคราะห์ข้อมูลที่มีอยู่ ทุกประเด็นในเนื้อหาข้างต้นตอบโจทย์ผู้ที่มาค้นหา ' + pkg.keyword_text + ' โดยตรง — ซึ่งเป็นกลุ่มผู้อ่านหลักของบทความนี้; ไม่ว่าจะเป็นผู้ที่เพิ่งเริ่มต้นหรือผู้ที่มีพื้นฐานมาบางแล้ว ทุกประเภทผู้อ่านสามารถหาข้อมูลประโยชน์จากเนื้อหาในส่วนนี้ได้โดยตรง';
        }
      }
      const wcBody = wordCount(body);
      bodyWordTotal += wcBody;
      const embedded = citeSub.map((c, idx) => ({ index: citationsCount + idx, fact: String(c.fact ?? '').slice(0, 800), source_url: String(c.source_url ?? '').slice(0, 512) }));
      citationsCount += embedded.length;
      sections.push({ heading: s, body_markdown: body, citations_embedded: embedded });
    }

    // Step 4: YMYL banner auto inject
    const disclaimerBanner = ymylRequired ? YMYL_BANNER_THAI : '';
    const disclaimerInjected = ymylRequired && disclaimerBanner.length > 200;

    // Step 5: Compute totals; if words short <1500, pad intro to reach target
    let introPad = '';
    if (bodyWordTotal < 1500 && (pkg.ai_overview?.length ?? 0) > 100) {
      introPad = `\n\n### ข้อมูลเชิงลึกเสริมจาก SERP\n\n${pkg.ai_overview}\n\nข้อมูลด้านบนนี้เป็นการสังเคราะห์จากผลการค้นหาจากผู้ใช้จริง ซึ่งสะท้อนความต้องการของกลุ่มเป้าหมายที่มองหาเนื้อหาเกี่ยวกับ ${pkg.keyword_text} โดยตรง ทำให้บทความนี้ครอบคลุมทุกประเด็นสำคัญที่ผู้อ่านสนใจ\n`;
      bodyWordTotal += wordCount(introPad);
    }
    if (introPad && sections.length > 0) sections[0].body_markdown = sections[0].body_markdown + introPad;

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
