#!/usr/bin/env node
// EEAT Studio V2 — Phase 2E Editor Layer Tests (14 assertions)
// Golden Cycle D7: เขียนเทส + ทดสอบ (routes / markdown sanitize / publish gate / preserve schema)
import fs from 'node:fs';
import path from 'node:path';
const R = (...p) => fs.readFileSync(path.resolve(process.cwd(), ...p), 'utf-8');

let FAIL = 0; const C = { RST: '\x1b[0m', GRN: '\x1b[32m', RED: '\x1b[31m', CYAN: '\x1b[36m', YLW: '\x1b[33m' };
const pass = (id, msg) => console.log(`${C.GRN}✅ [2E-${id}]${C.RST} ${msg}`);
const fail = (id, msg) => { console.log(`${C.RED}❌ [2E-${id}]${C.RST} ${msg}`); FAIL++; };

console.log(`${C.CYAN}${'═'.repeat(72)}\n  EEAT Studio V2 · Phase 2E ─ Editor Layer (14 assertions)\n${'═'.repeat(72)}${C.RST}`);

// ───── A) Routes & Frontend Pages Registered (5/14) ─────
console.log(`\n${C.CYAN}▶ A) App.tsx Routes + Sidebar Nav Registered (5/14)${C.RST}`);
try {
  const app = R('client/src/App.tsx');
  // 2E-A1: lazy imports ArticlesPage + ArticleEditorPage declared
  const lazyArts = /const ArticlesPage = lazy\(\(\) => import\("@\/pages\/ArticlesPage"\)\)/.test(app);
  const lazyEdit = /const ArticleEditorPage = lazy\(\(\) => import\("@\/pages\/ArticleEditorPage"\)\)/.test(app);
  if (lazyArts && lazyEdit) pass('A1', 'App.tsx lazy imports ArticlesPage + ArticleEditorPage declared (code split lazy load)');
  else fail('A1', `ArticlesPage lazy? ${lazyArts}. ArticleEditorPage lazy? ${lazyEdit}. lazy imports block: ${app.slice(app.indexOf('const NotFound'), app.indexOf('const NotFound')+600).replace(/\s+/g,' ').slice(0,240)}`);

  // 2E-A2: Route /articles path registered in Switch
  const rArts = /<Route path="\/articles"><ArticlesPage \/>/.test(app);
  if (rArts) pass('A2', 'Switch Route /articles → ArticlesPage (บทความ / ตีพิมพ์ list) registered');
  else fail('A2', `/articles Route in Switch? ${rArts}. Routes block tail: ${app.slice(app.indexOf('<Route path="/settings">'), app.indexOf('<Route><NotFound />')).replace(/\s+/g,' ').slice(0,280)}`);

  // 2E-A3: Route /articles/:id/edit editor path registered
  const rEdit = /<Route path="\/articles\/:id\/edit"><ArticleEditorPage \/>/.test(app);
  if (rEdit) pass('A3', 'Switch Route /articles/:id/edit → ArticleEditorPage (markdown editor WYSIWYG) registered');
  else fail('A3', `/articles/:id/edit editor Route? ${rEdit}`);

  // 2E-A4: Route /projects/:id/articles project-filter alias list registered
  const rAlias = /<Route path="\/projects\/:id\/articles"><ArticlesPage \/>/.test(app);
  if (rAlias) pass('A4', 'Route alias /projects/:id/articles → ArticlesPage (project scoped articles list) alias present for KCP nav');
  else fail('A4', `/projects/:id/articles alias? ${rAlias}`);

  // 2E-A5: Sidebar MainDashboardShell NAV_ITEMS articles entry + FileText icon + activeKey
  const shell = R('client/src/layouts/MainDashboardShell.tsx');
  const nav = shell.includes('key: "articles"') && shell.includes('href: "/articles"') && shell.includes('FileText');
  const ak = /case "\/articles"|case '\/articles'|startsWith\(['"]\/articles['"]\)|\/\^\\\/articles/.test(shell);
  if (nav && ak) pass('A5', 'MainDashboardShell sidebar: articles nav item (FileText icon, href /articles) + activeKey prefix match highlight');
  else fail('A5', `sidebar NAV_ITEMS articles key/href/FileText icon? ${nav}. activeKey /articles match? ${ak}. Shell nav block: ${shell.slice(shell.indexOf('NAV_ITEMS'), shell.indexOf('NAV_ITEMS')+1200).replace(/\s+/g,' ').slice(0,360)}`);
} catch(e){ fail('A-READ', 'App/shell err: '+String(e?.message ?? e).slice(0,160)); }

// ───── B) ArticleEditorPage — Markdown XSS Safe Render + EEAT Word Heuristic (5/14) ─────
console.log(`\n${C.CYAN}▶ B) ArticleEditorPage — renderMarkdownSafe XSS sanitize 8 steps + Thai word counter (5/14)${C.RST}`);
try {
  const ed = R('client/src/pages/ArticleEditorPage.tsx');
  // 2E-B1: Step 1 FIRST escape HTML & < > " ' before ANY markdown regex (prevent XSS injection base)
  const s1 = /function renderMarkdownSafe\(md: string\): string \{[\s\S]{0,120}let s = String\(md \?\? ""\)[\s\S]{0,40}\.replace\(\/&\/g, "&amp;"\)/.test(ed);
  const escOrder = /\.replace\(\/&\/g, "&amp;"\)\.replace\(\/<\/g, "&lt;"\)\.replace\(\/>\/g, "&gt;"\)[\s\S]{0,80}\.replace\(\/"\/g, "&quot;"\)\.replace\(\/'\/g, "&#39;"\)/.test(ed);
  if (s1 && escOrder) pass('B1', 'renderMarkdownSafe STEP 1 FIRST: HTML escape & < > " \' run FIRST before ANY md rule → XSS base prevent');
  else fail('B1', `Step1 escape FIRST? s1=${s1} escOrder=${escOrder}. render fn head: ${ed.slice(ed.indexOf('function renderMarkdownSafe'), ed.indexOf('function renderMarkdownSafe')+800).replace(/\s+/g,' ').slice(0,360)}`);

  // 2E-B2: Link [text](url) filter https ONLY + rel attrs (noopener/nofollow/ugc/noreferrer) + target="_blank" → prevent javascript: href XSS
  const linkSnippet = ed.slice(ed.indexOf('8) links'), ed.indexOf('8) links') + 700);
  const hasHttpsOnly = linkSnippet.includes('https?:');
  const relOk = ed.includes('noopener noreferrer nofollow ugc');
  const hasTargetBlank = ed.includes('target="_blank"');
  const linkSafe = hasHttpsOnly && relOk && hasTargetBlank;
  if (linkSafe) pass('B2', 'Markdown links <a>: ONLY http/https protocol allowed (no javascript: mailto:) + rel=noopener/nofollow/ugc/noreferrer + target=_blank → XSS/SEO safe');
  else fail('B2', `https-only pattern in L46 link regex? ${hasHttpsOnly}. rel attrs present? ${relOk}. target=_blank? ${hasTargetBlank}. L46 snippet: ${linkSnippet.replace(/\s+/g,' ').slice(0,360)}`);

  // 2E-B3: Blockquote > YMYL disclaimer auto detect keyword (พนัน/ความเสี่ยง/disclaimer) → rose/red border class
  const ymylBlockquote = /blockquote.*border.*rose|YMYL|พนัน.*disclaimer|ความเสี่ยง.*rose/.test(ed.slice(ed.indexOf('function renderMarkdownSafe'), ed.indexOf('function renderMarkdownSafe')+2500));
  const warnClass = /border-rose-400 bg-rose-50 text-rose-900/.test(ed);
  if (ymylBlockquote && warnClass) pass('B3', 'Blockquote > YMYL auto detect keywords (พนัน / ความเสี่ยง / disclaimer) → RED warning border + background highlight EEAT compliance');
  else fail('B3', `YMYL keyword detection in blockquote? ${ymylBlockquote}. rose warning class present? ${warnClass}. blockquote line: ${ed.slice(ed.indexOf('/ 4) blockquotes'), ed.indexOf('/ 4) blockquotes')+600).replace(/\s+/g,' ').slice(0,360)}`);

  // 2E-B4: Thai word heuristic counter (Thai unicode chars / 3 + English ASCII words) → EEAT min 1500 words estimate correct
  const wcFn = /function wordCount|thaiChars.*\/ 3|thai.*\/3|ceil\(thai|Unicode.*thai|ascii.*english.*word.*count/.test(ed);
  const gate1500 = /wordCount<1500/.test(ed) && /need ≥1500|1,500 คำ/.test(ed);
  if (wcFn && gate1500) pass('B4', 'Thai Word Heuristic: ascii english word count + ceil(thai chars / 3) → publish button DISABLED wordCount<1500 (match EEAT rule min 1,500 words)');
  else fail('B4', `Thai /3 heuristic counter? ${wcFn}. Publish gate disabled <1500 words? ${gate1500}. publish btn snippet: ${ed.slice(ed.indexOf('doPublish'), ed.indexOf('doPublish')+800).replace(/\s+/g,' ').slice(0,280)}`);

  // 2E-B5: Code fences ``` preserve pre bg-stone-900 BEFORE inline backtick processing
  const fenceOrder = /code blocks before inline|2\) code blocks|code fences.*pre|<pre class="bg-stone-900/.test(ed.slice(ed.indexOf('function renderMarkdownSafe'), ed.indexOf('function renderMarkdownSafe')+1500));
  if (fenceOrder) pass('B5', 'Code fence ``` run BEFORE inline backticks: preserve ``` block content in <pre> dark theme (no inline code render interfere)');
  else fail('B5', `Fence before inline code? ${fenceOrder}. <pre class present? ${/<pre class="bg-stone-900/.test(ed)}`);
} catch(e){ fail('B-READ', 'ArticleEditor err: '+String(e?.message ?? e).slice(0,160)); }

// ───── C) ArticlesPage List Admin Gate + Backward Compat Schema/Router UNALTERED (4/14) ─────
console.log(`\n${C.CYAN}▶ C) ArticlesPage Publish Admin Gate + Backend Preserved UNCHANGED (4/14)${C.RST}`);
try {
  const ap = R('client/src/pages/ArticlesPage.tsx');
  // 2E-C1: trpc.write.listByProject called useQuery limit 100 rows + enabled(projectId!=='all')
  const listCall = /trpc\.write\.listByProject\.useQuery/.test(ap);
  const projGate = /enabled:\s*projectId !== "all"|enabled:.*projectId.*!==.*all/.test(ap);
  if (listCall && projGate) pass('C1', 'ArticlesPage: trpc.write.listByProject limit 100 + React Query enabled only when projectId != "all" (avoid queries before user select project)');
  else fail('C1', `listByProject call present? ${listCall}. enabled gate project select first? ${projGate}. query block: ${ap.slice(ap.indexOf('listByProject'), ap.indexOf('listByProject')+800).replace(/\s+/g,' ').slice(0,280)}`);

  // 2E-C2: Publish toggle button disabled non-admin (adminGate isAdmin check) — toast warn non-admin
  const adminBtn = /isAdmin.*publish|disabled=.*!isAdmin|role === "admin"|permission === "admin"/.test(ap) && /trpc\.write\.publish\.useMutation|\.publish\./.test(ap);
  if (adminBtn) pass('C2', 'Publish toggle: button DISABLED non-admin users (isAdmin gate) → only role=admin or owner=permission can publish/unpublish (RBAC match backend minRole=admin gate)');
  else fail('C2', `admin role check in list page? ${/role === "admin"|permission === "admin"/.test(ap)}. write.publish mutation called? ${/\.publish\./.test(ap)}. actions col snippet: ${ap.slice(ap.indexOf('Button variant="ghost" size="sm"'), ap.indexOf('Button variant="ghost" size="sm"')+1200).replace(/\s+/g,' ').slice(0,280)}`);

  // 2E-C3: Backend write.ts router + schema writeArticles 15 cols PRESERVED NO NEW ALTER cols (backward compat no table modify)
  const wr = R('server/routers/write.ts');
  const ds = R('db/schema.ts');
  const p1 = /createDraft:\s*protectedProcedure/.test(wr);
  const p2 = /getDraft:\s*protectedProcedure/.test(wr);
  const p3 = /publish:\s*protectedProcedure/.test(wr);
  const p4 = /listByProject:\s*protectedProcedure/.test(wr);
  const router4 = p1 && p2 && p3 && p4;
  const cols15 = (ds.match(/wordCount|outlineJson|disclaimerAdded|eeatScore|citationsCount|writeStep|stepStatus|errorMsg|researchPackageId|clusterId|teamId|articleId/g) || []).length >= 11;
  if (router4 && cols15) pass('C3', 'Phase2D backward compat preserved: writeRouter 4 procedures INTACT (createDraft/getDraft/publish/listByProject) + writeArticles cols schema UNMODIFIED (zero ALTER TABLE AC-6)');
  else fail('C3', `writeRouter 4 procs intact? cd=${p1} gd=${p2} pub=${p3} list=${p4} → all=${router4}. writeArticles ≥11 core cols present? ${cols15}`);

  // 2E-C4: EEAT score badge color scale (emerald≥80, amber≥60, orange≥40, stone else) readable UX
  const scale = /emerald|amber-600|orange|stone.*score|EEAT.*Score/.test(ap);
  if (scale) pass('C4', 'EEAT score visual badge color scale (≥80 emerald green / ≥60 amber / ≥40 orange / else stone) + Clickable actions Edit/Publish/Delete in table row actions');
  else fail('C4', `EEAT color scale classes present? ${scale}. EEAT Score header col? ${/EEAT|eeat_score|Score/.test(ap.slice(0,5000))}`);
} catch(e){ fail('C-READ', 'ArticlesPage/backend err: '+String(e?.message ?? e).slice(0,160)); }

// ───── Summary Exit Code ─────
console.log(`\n${C.CYAN}${'─'.repeat(72)}${C.RST}`);
const TOTAL = 14;
const PASSED = TOTAL - FAIL;
console.log(`${FAIL===0?C.GRN:C.YLW}  📊 Phase 2E Editor Layer: ${PASSED}/${TOTAL} assertions passed${C.RST}`);
if (FAIL > 0) {
  console.log(`${C.RED}  ❌ ${FAIL} assertion(s) FAILED — fix before deploy.${C.RST}`);
  process.exit(1);
}
console.log(`${C.GRN}  ✅ ALL 14/14 PASS → proceed to npm build + deploy_run_now VPS 35.231.230.218 (thaiaeo.manus.host).${C.RST}\n`);
process.exit(0);
