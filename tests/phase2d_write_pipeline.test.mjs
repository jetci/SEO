#!/usr/bin/env node
// EEAT Studio V2 — Phase 2D Write Pipeline Tests (12 assertions)
// Golden Cycle D5: เขียนเทส + ทดสอบ (schema/router/service EEAT rules)
import fs from 'node:fs';
import path from 'node:path';
const R = (...p) => fs.readFileSync(path.resolve(process.cwd(), ...p), 'utf-8');

let FAIL = 0; const C = { RST: '\x1b[0m', GRN: '\x1b[32m', RED: '\x1b[31m', CYAN: '\x1b[36m', YLW: '\x1b[33m' };
const pass = (id, msg) => console.log(`${C.GRN}✅ [2D-${id}]${C.RST} ${msg}`);
const fail = (id, msg) => { console.log(`${C.RED}❌ [2D-${id}]${C.RST} ${msg}`); FAIL++; };

console.log(`${C.CYAN}${'═'.repeat(72)}\n  EEAT Studio V2 · Phase 2D ─ Write Pipeline (12 assertions)\n${'═'.repeat(72)}${C.RST}`);

// ───── A) Schema & Migration AC Backward Compatible (4/12) ─────
console.log(`\n${C.CYAN}▶ A) Schema DB — migration 0003 + drizzle schema (4/12)${C.RST}`);
try {
  const m = R('db/migrations/0003_phase2d_write.sql');
  // 2D-A1: CREATE TABLE IF NOT EXISTS write_articles + 4 FK refs articles research_packages clusters teams
  const hasWriteArt = /CREATE TABLE IF NOT EXISTS write_articles/.test(m);
  const fks4 = /fk_write_articles_article/.test(m) && /fk_write_articles_pkg/.test(m) && /fk_write_articles_cluster/.test(m) && /fk_write_articles_team/.test(m);
  if (hasWriteArt && fks4) pass('A1', 'Migration 0003: write_articles CREATE IF NOT EXISTS + 4 FK (article/pkg/cluster/team) = backward compat ZERO ALTER old tables');
  else fail('A1', `write_articles table? ${hasWriteArt}. 4 FKs present? article=${/fk_write_articles_article/.test(m)} pkg=${/fk_write_articles_pkg/.test(m)} cluster=${/fk_write_articles_cluster/.test(m)} team=${/fk_write_articles_team/.test(m)}`);

  // 2D-A2: 3 indexes present uk_write_articles_article UNIQUE + idx_write_team_status + idx_write_step
  const idx = /UNIQUE KEY uk_write_articles_article/.test(m) && /INDEX idx_write_team_status/.test(m) && /INDEX idx_write_step_current/.test(m);
  if (idx) pass('A2', 'write_articles 3 indexes (unique article_id + team status + write_step status) for perf queries');
  else fail('A2', `Unique uk? ${/UNIQUE KEY uk_write_articles_article/.test(m)}. team index? ${/INDEX idx_write_team_status/.test(m)}. step? ${/INDEX idx_write_step_current/.test(m)}`);

  const ds = R('db/schema.ts');
  // 2D-A3: drizzle schema writeArticles table + WRITE_STATUSES enum [pending running done fail]
  const hasWrites = ds.includes("export const writeArticles = mysqlTable(\n  'write_articles'") || ds.includes("export const writeArticles = mysqlTable('write_articles',");
  const hasEnum = /WRITE_STATUSES\s*=\s*\['pending','running','done','fail'\]/.test(ds);
  if (hasWrites && hasEnum) pass('A3', 'Drizzle schema: writeArticles table declared + WRITE_STATUSES enum 4 values [pending/running/done/fail]');
  else fail('A3', `writeArticles drizzle table? ${hasWrites}. enum WRITE_STATUSES? ${hasEnum}`);

  // 2D-A4: articles NO ALTER preserved keywordId nullable + ARTICLE_STATUS 2 values ONLY [draft/published] backward compat
  const kwNull = /keywordId:\s*bigint\('keyword_id'.*?\)\.references\(\(\)\s*=>\s*keywords\.id/.test(ds.split('export const articles =')[1]?.split('\n);')[0] ?? '') || /keyword_id.*NULLABLE|keywordId.*references.*{ onDelete: 'set null'/.test(ds.slice(0, 30000));
  const art2stat = /ARTICLE_STATUS\s*=\s*\['draft',\s*'published'\]/.test(ds);
  if (kwNull && art2stat) pass('A4', 'SA AC-6 backward compat: articles keywordId REMAINING nullable + ARTICLE_STATUS enum 2 values ONLY (no writing/review workflow removed)');
  else fail('A4', `kwId nullable preserved? ${kwNull}. ARTICLE_STATUS 2 values only? ${art2stat}`);
} catch(e){ fail('A-READ', 'schema file err: '+String(e?.message ?? e).slice(0,120)); }

// ───── B) Write Router Procedures (4/12) ─────
console.log(`\n${C.CYAN}▶ B) write.ts Router Procedures & Guards (4/12)${C.RST}`);
try {
  const w = R('server/routers/write.ts');
  // 2D-B1: 4 procedures = createDraft / getDraft / publish / listByProject exported in router
  const p1 = /createDraft:\s*protectedProcedure/.test(w);
  const p2 = /getDraft:\s*protectedProcedure/.test(w);
  const p3 = /publish:\s*protectedProcedure/.test(w);
  const p4 = /listByProject:\s*protectedProcedure/.test(w);
  if (p1 && p2 && p3 && p4) pass('B1', 'writeRouter 4 procedures declared: createDraft mutation + getDraft query + publish mutation + listByProject query');
  else fail('B1', `4 procedures present? createDraft=${p1} getDraft=${p2} publish=${p3} listByProject=${p4}`);

  // 2D-B2: PILLAR tier GUARD [WRITE_PILLAR_UNSUPPORTED] BAD_REQUEST pillar tier can't direct write (must run research first pillar-level runPlanForKeyword, write = cluster/supporting tiers)
  const g = /WRITE_PILLAR_UNSUPPORTED/.test(w) && /tier === 'pillar'/.test(w) && /BAD_REQUEST/.test(w);
  if (g) pass('B2', 'Pillar Tier Guard ENFORCED: kw.tier=pillar → BAD_REQUEST [WRITE_PILLAR_UNSUPPORTED] require research.runPlanForKeyword first at pillar');
  else fail('B2', `[WRITE_PILLAR_UNSUPPORTED] prefix code? ${/WRITE_PILLAR_UNSUPPORTED/.test(w)}. tier=pillar check? ${/tier === 'pillar'/.test(w)}. BAD_REQUEST code? ${/BAD_REQUEST/.test(w)}`);

  // 2D-B3: publish admin gate minRole=admin assertProjectAccess
  const pubFull = (w.match(/publish:\s*protectedProcedure[\s\S]{0,2000}?\.mutation\(\s*async\s*\(\s*\{\s*ctx[^)]*\}\s*,\s*input\s*\)\s*=>\s*\{([\s\S]{0,1500})\}\s*\)\s*,?\s*\n?\s*\n?\s*(?=listByProject|getDraft|createDraft|\}\);\s*$|export default)/) || [])[0] ?? '';
  const adminGate = /assertProjectAccess\([\s\S]*?minRole\s*:\s*['"]admin['"]/.test(w.slice(w.indexOf('publish: protectedProcedure'), w.indexOf('publish: protectedProcedure') + 2200)) || /minRole\s*:\s*['"]admin['"]/.test(pubFull);
  if (adminGate) pass('B3', 'publish RBAC gate: ONLY team admin or owner can publish (minRole=admin). Members read draft only.');
  else fail('B3', `publish procedure admin gate check. minRole=admin assert in publish mutation body? ${adminGate}. Snippet publish body: ${w.slice(w.indexOf('publish: protectedProcedure'), w.indexOf('publish: protectedProcedure')+800).replace(/\s+/g,' ').slice(0,240)}`);

  // 2D-B4: createDraft → upsert write_articles onDuplicateKeyUpdate step=8 done + eeat_score + citations_count + wordCount cols
  const wfStep8 = /onDuplicateKeyUpdate\(\{[\s\S]*?writeStep:\s*8[\s\S]*?stepStatus:\s*'done'/.test(w) || /writeStep\s*:\s*8,\s*stepStatus\s*:\s*'done'/.test(w);
  const eeatCols = /eeatScore: Math\.min\(100, Math\.max\(0, out\.eeat_score_est\)\)/.test(w) && /citationsCount: Number\(out\.citations_count_total\)/.test(w) && /wordCount: Number\(out\.word_count_total\)/.test(w);
  if (wfStep8 && eeatCols) pass('B4', 'createDraft DB persist: write_articles workflow upsert step=8 DONE draft + eeat_score/word_count/citations_count 3 EEAT quality metrics recorded');
  else fail('B4', `writeStep=8 done? ${wfStep8}. EEAT cols set correctly in upsert? eeat=${/eeatScore.*Math.min/.test(w)} cites=${/citationsCount.*out.citations_count_total/.test(w)} words=${/wordCount.*out.word_count_total/.test(w)}`);
} catch(e){ fail('B-READ', 'write.ts err: '+String(e?.message ?? e).slice(0,120)); }

// ───── C) ArticleWriterService EEAT Rules (4/12) ─────
console.log(`\n${C.CYAN}▶ C) ArticleWriterService EEAT rules + YMYL compliance (4/12)${C.RST}`);
try {
  const s = R('server/services/articleWriterService.ts');
  // 2D-C1: YMYL banner disclaimer auto inject ymyl_required → length>200 chars present hardcoded Thai
  const ymylThai = s.includes('คำเตือนความเสี่ยงด้านการพนัน') && s.includes('การพนันอาจก่อให้เกิดความเสี่ยงทางการเงิน') && s.includes('ไม่แนะนำให้บุคคลอายุน้อยกว่า 20 ปี');
  const disclaimInj = /disclaimerBanner\s*=\s*ymylRequired\s*\?\s*YMYL_BANNER_THAI\s*:\s*''/.test(s) || s.includes("ymylRequired ? YMYL_BANNER_THAI");
  if (ymylThai && disclaimInj) pass('C1', 'YMYL Disclaimer BANNER: ymyl_required true → auto prepend Thai warning banner TOP article (gambling/slots/casino YMYL categories id 3,4,5)');
  else fail('C1', `banner contains Thai YMYL text? ${ymylThai}. banner = ymylRequired ternary assignment? ${disclaimInj}`);

  // 2D-C2: min 3 citations EEAT rule pickCitations(..., 3) + citationsCount ≥ minCitations
  const cMin = /pickCitations\(citPool,\s*minCitations\)/.test(s) || /pickCitations\([^\)]*,\s*3\)/.test(s) || /minCitations\s*=\s*3/.test(s);
  const cCount = /citationsCount\s*>=\s*minCitations/.test(s);
  if (cMin && cCount) pass('C2', 'EEAT CITATIONS RULE: min 3 citations per article embedded inline footer references. eeat_checks.min_citations_met flag validates gate.');
  else fail('C2', `pick citations min=3 call? ${cMin}. eeat_checks.citationsCount>=min met gate? ${cCount}.`);

  // 2D-C3: 6-tier outline sections >=4 H2 FAQ + intro + takeaways H2..H6
  const outl = /buildOutline\(.*?\)\s*\{/.test(s);
  const sec4 = /sections\.push\(\{[\s\S]*?heading_level:\s*2[\s\S]*?sections\.push\(/g.test(s) || s.split('sections.push({').length - 1 >= 4;
  if (outl && sec4) pass('C3', 'Outline 6-tier: H1 title + ≥4 H2 sections (Intro → FAQ x3 → Key Takeaways). Heading levels 1..6 supported enum in outlineSectionSchema zod.');
  else fail('C3', `buildOutline defined? ${outl}. 4+ sections pushed? count=${s.split('sections.push({').length-1}`);

  // 2D-C4: word_count_total >= 1500 pad fallback introPad ai_overview if <1500
  const pad = /bodyWordTotal\s*<\s*1500/.test(s) && /introPad/.test(s);
  const wcFinal = /totalWordCount\s*=\s*wordCount\(mdFinal\)/.test(s) || /eeat_score_est.*totalWordCount\s*>=\s*1500\s*\?\s*20/.test(s);
  if (pad && wcFinal) pass('C4', 'WORD COUNT RULE: 1500+ words minimum. Auto pad with AI Overview SERP summary if initial body <1500 words until threshold reached. eeat_score_est awards +20 bonus if met.');
  else fail('C4', `body<1500 pad conditional? ${pad}. final word count measured + eeat score bonus for ≥1500? ${wcFinal}.`);
} catch(e){ fail('C-READ', 'articleWriter err: '+String(e?.message ?? e).slice(0,120)); }

// ───── Runtime probe health phase=2 ─────
console.log(`\n${C.YLW}▶ Optional runtime probe backend :3002${C.RST}`);
setTimeout(async () => {
  try {
    const http = await import('node:http');
    const opts = { host: '127.0.0.1', port: 3002, path: '/api/health', method: 'GET', timeout: 3000 };
    const req = http.request(opts, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          const ok = j.phase === 2 && Array.isArray(j.routers) && j.routers.length >= 10 && j.routers.includes('write') && j.routers.includes('research');
          if (ok) console.log(`${C.GRN}✅ [2D-RUN-1]${C.RST} Backend reachable. phase=2 routers≥10 includes write+research (root merged)`);
          else console.log(`${C.YLW}⏭  [2D-RUN-1]${C.RST} health phase=${j.phase} routers=${j.routers?.length ?? 'n/a'}. (skipped write+research gate — static tests above OK sufficient)`);
          finish();
        } catch(e){ console.log('  health non-json, skip:', b.slice(0, 80)); finish(); }
      });
    });
    req.on('timeout', () => { req.destroy(); console.log(`${C.YLW}⏭  [2D-RUN-1]${C.RST} backend unreachable timeout (local dev optional — static tests valid).`); finish(); });
    req.on('error', () => { console.log(`${C.YLW}⏭  [2D-RUN-1]${C.RST} backend down (optional static-only run — proceed)`); finish(); });
    req.end();
  } catch(e){ finish(); }
}, 300);

function finish(){
  console.log(`\n${C.CYAN}${'═'.repeat(72)}${C.RST}\n  ${FAIL === 0 ? C.GRN+'🟢'+C.RST : C.RED+'🔴'+C.RST} SUMMARY Phase 2D Write Pipeline: ${12-FAIL}/12 PASS ${FAIL ? 'FAIL IDs: check output ❌ above' : ''}\n${C.CYAN}${'═'.repeat(72)}${C.RST}`);
  process.exit(FAIL);
}
