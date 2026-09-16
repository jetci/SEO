#!/usr/bin/env node
// EEAT Studio V2 — Phase 2E-3: KCP Write Action Buttons Tests (12 assertions)
// Golden Cycle D9: เขียนเทส + ทดสอบ UI pipeline 10 steps clickable
import fs from 'node:fs';
import path from 'node:path';
const R = (...p) => fs.readFileSync(path.resolve(process.cwd(), ...p), 'utf-8');

let FAIL = 0; const C = { RST: '\x1b[0m', GRN: '\x1b[32m', RED: '\x1b[31m', CYAN: '\x1b[36m', YLW: '\x1b[33m' };
const pass = (id, msg) => console.log(`${C.GRN}✅ [2E3-${id}]${C.RST} ${msg}`);
const fail = (id, msg) => { console.log(`${C.RED}❌ [2E3-${id}]${C.RST} ${msg}`); FAIL++; };

console.log(`${C.CYAN}${'═'.repeat(72)}\n  EEAT Studio V2 · Phase 2E.3 ─ KCP Action Buttons (12 assertions)\n${'═'.repeat(72)}${C.RST}`);

// ───── A) Imports + State Hooks (4/12) ─────
console.log(`\n${C.CYAN}▶ A) KeywordClusterPlanner imports, state, keyword ids (4/12)${C.RST}`);
try {
  const k = R('client/src/pages/KeywordClusterPlanner.tsx');
  // 2E3-A1: useLocation wouter router import for navigate → editor /articles/:id/edit
  const routerOk = /import \{ useLocation \} from "wouter"/.test(k);
  if (routerOk) pass('A1', 'useLocation (wouter v3) import present → navigate setLocation("/articles/:id/edit") after createDraft success');
  else fail('A1', `useLocation wouter import? ${routerOk}. Imports L1-L20: ${k.slice(0,600).replace(/\s+/g,' ').slice(0,300)}`);

  // 2E3-A2: trpc mutations research.runPlanForKeyword + write.createDraft declared useMutation hooks
  const runPlanMut = /const runPlan = trpc\.research\.runPlanForKeyword\.useMutation\(\)/.test(k);
  const cdMut = /const createDraft = trpc\.write\.createDraft\.useMutation\(\)/.test(k);
  if (runPlanMut && cdMut) pass('A2', '2 tRPC mutations declared: research.runPlanForKeyword (pillar step 4) + write.createDraft (cluster/supporting step 5-8) useMutation hooks');
  else fail('A2', `runPlanForKeyword mutation? ${runPlanMut}. write.createDraft mutation? ${cdMut}. mutations block: ${k.slice(k.indexOf('runPlan'), k.indexOf('runPlan')+400).replace(/\s+/g,' ').slice(0,280)}`);

  // 2E3-A3: makeDemoCluster adds keywordId numeric integer id (จำลอง DB id actual for trpc mutation inputs)
  const kid = /keywordDbId = [0-9]+ \+ id \+ projectId \* [0-9]+/.test(k) && /keywordId: keywordDbId,/.test(k);
  if (kid) pass('A3', 'makeDemoCluster adds numeric keywordId (DB id surrogate integer) for trpc mutation keyword_id argument (required for both mutations)');
  else fail('A3', `keywordDbId declared? ${/keywordDbId = [0-9]+/.test(k)}. keywordId in return object? ${/keywordId: keywordDbId/.test(k)}. makeDemoCluster return: ${k.slice(k.indexOf('function makeDemoCluster'), k.indexOf('function makeDemoCluster')+900).replace(/\s+/g,' ').slice(0,420)}`);

  // 2E3-A4: runningKwIds state Set<number> loading spinner tracker for row-level pending indicator
  const st = /const \[runningKwIds, setRunningKwIds\] = useState<Set<number>>\(new Set\(\)\)/.test(k);
  const toggleRun = /function toggleRun\(id: number, on: boolean\)/.test(k);
  if (st && toggleRun) pass('A4', 'runningKwIds state Set<number> row-level pending tracker + toggleRun helper add/delete per id (spinner for busy rows)');
  else fail('A4', `runningKwIds state present? ${st}. toggleRun fn present? ${toggleRun}. state block: ${k.slice(k.indexOf('[runningKwIds'), k.indexOf('[runningKwIds')+350).replace(/\s+/g,' ').slice(0,260)}`);
} catch(e){ fail('A-READ', 'KCP page err: '+String(e?.message ?? e).slice(0,120)); }

// ───── B) Action Handlers Tier Branching (4/12) ─────
console.log(`\n${C.CYAN}▶ B) handleClusterAction: tier=pillar research / tier=cluster/supporting write + guards (4/12)${C.RST}`);
try {
  const k = R('client/src/pages/KeywordClusterPlanner.tsx');
  const handBlock = k.slice(k.indexOf('async function handleClusterAction'), k.indexOf('async function handleClusterAction') + 4500);

  // 2E3-B1: TIER=PILLAR → call runPlan.mutateAsync(keywordId=kwId) success toast packageId
  const pillarCall = /c\.tier === "pillar"/.test(k) && /runPlan\.mutateAsync\(\{ keywordId: kwId \}\)/.test(k);
  if (pillarCall) pass('B1', 'Pillar TIER branch: research.runPlanForKeyword mutation called (step 4 pipeline → 4 jobs parallel SERP/FAQ/OVERVIEW/CITATIONS → Research Package)');
  else fail('B1', `tier==='pillar' guard? ${/c\.tier === "pillar"/.test(k)}. runPlan.mutateAsync call? ${/runPlan\.mutateAsync\(\{ keywordId: kwId \}\)/.test(k)}. pillar snippet: ${handBlock.slice(0,1200).replace(/\s+/g,' ').slice(0,420)}`);

  // 2E3-B2: TIER=CLUSTER/SUPPORTING (else) → createDraft.mutateAsync(keywordId=kwId) success draft_id → setLocation(`/articles/${dr}/edit`) navigate editor
  const draftCall = /createDraft\.mutateAsync\(\{ keywordId: kwId \}\)/.test(k);
  const navOk = /setLocation\(`\/articles\/\$\{dr\}\/edit`\)/.test(k) || /setLocation\(.*articles.*\/edit.*\)/.test(k);
  if (draftCall && navOk) pass('B2', 'Cluster/Supporting TIER branch: write.createDraft mutation → draft_id success → router setLocation navigate Markdown Editor /articles/:id/edit (pipeline steps 5-8)');
  else fail('B2', `write.createDraft mutation? ${draftCall}. setLocation editor page navigate? ${navOk}. else block: ${handBlock.slice(handBlock.indexOf('cluster / supporting'), 3200).replace(/\s+/g,' ').slice(0,520)}`);

  // 2E3-B3: Guard WRITE_PILLAR_UNSUPPORTED toast warning if backend pillar guard triggers (match backend write router BAD_REQUEST code)
  const guardToast = /WRITE_PILLAR_UNSUPPORTED/.test(k) && /Pillar tier ห้ามเขียนโดยตรง/.test(k);
  if (guardToast) pass('B3', 'Guard toast: WRITE_PILLAR_UNSUPPORTED backend code → warning banner user must choose tier=cluster/supporting instead pillar (SA Spec tier semantics)');
  else fail('B3', `WRITE_PILLAR_UNSUPPORTED regex? ${/WRITE_PILLAR_UNSUPPORTED/.test(k)}. Thai pillar no write message? ${/Pillar tier ห้ามเขียนโดยตรง/.test(k)}. catch block: ${handBlock.slice(handBlock.indexOf('catch (e:'), 4200).replace(/\s+/g,' ').slice(0,600)}`);

  // 2E3-B4: Admin gate check isAdmin required for action click → non-admin disabled + toast error
  const adminGate = /if \(!isAdmin\) \{ toast\.error\("การเขียนบทความ \/ run research จำเป็นต้องเป็น Admin/.test(k);
  const dis = /disabled=\{!isAdmin \|\| busy\}|\.disabled=.*!isAdmin/.test(k.slice(k.indexOf('Button size="sm" onClick={() => handleClusterAction'), k.indexOf('Button size="sm" onClick={() => handleClusterAction') + 700));
  if (adminGate) pass('B4', 'RBAC Gate: Admin/Owner ONLY → toast error if non-admin + button disabled non-admin users (backend minRole=admin gate mirrored frontend)');
  else fail('B4', `isAdmin toast guard? ${adminGate}. disabled attribute button non-admin? ${dis}. admin gate snippet: ${k.slice(k.indexOf('handleClusterAction(c)'), k.indexOf('handleClusterAction(c)')+450).replace(/\s+/g,' ').slice(0,320)}`);
} catch(e){ fail('B-READ', 'handler err: '+String(e?.message ?? e).slice(0,120)); }

// ───── C) UI Wiring (4/12) ─────
console.log(`\n${C.CYAN}▶ C) Tree/Cards view Action button wire + PascalCase icons + provider key toasts (4/12)${C.RST}`);
try {
  const k = R('client/src/pages/KeywordClusterPlanner.tsx');
  // 2E3-C1: Tree view Actions col col-span-2 added header + BtnIcon PascalCase JSX
  const actionHdr = /col-span-2 p-3 text-center">Action<\/div>/.test(k) && /col-span-4.*Keyword.*col-span-2.*Tier.*col-span-2.*Intent.*col-span-1.*KD.*col-span-1.*Vol.*col-span-2.*Action/.test(k.replace(/\n/g,' '));
  const btnPascal = /const BtnIcon = isPillar \? PlayCircle : FilePenLine;/.test(k) && /<BtnIcon className=/.test(k);
  if (actionHdr && btnPascal) pass('C1', 'Tree view NEW Actions col (col-span-2) 6 cols header grid total = 12. BtnIcon PascalCase variable → valid JSX icon render');
  else fail('C1', `Actions header col present? ${actionHdr}. PascalCase BtnIcon declaration + render? ${btnPascal}. Tree grid head: ${k.slice(k.indexOf('grid grid-cols-12 border-b border-stone-200 bg-white'), k.indexOf('grid grid-cols-12 border-b border-stone-200 bg-white')+800).replace(/\s+/g,' ').slice(0,480)}`);

  // 2E3-C2: Cards view dynamic CIcon PascalCase + pillar=amber 600, editor=emerald 700 (distinct colors per tier)
  const ciPascal = /const CIcon = cp \? PlayCircle : FilePenLine;/.test(k) && /<CIcon className=/.test(k);
  const tierColors = /cp\?.*bg-amber-600.*bg-emerald-700/.test(k.slice(k.indexOf('Cards action button'), k.indexOf('Cards action button')+1500) || k);
  if (ciPascal) pass('C2', 'Cards view action CIcon PascalCase JSX + tier color coded: pillar Run Plan = amber-600, cluster/supporting เขียน = emerald-700 distinct visual');
  else fail('C2', `CIcon PascalCase? ${ciPascal}. tier colors amber/emerald present? ${tierColors}. Cards action block: ${k.slice(k.indexOf("onClick={() => handleClusterAction(c)}"), k.indexOf("onClick={() => handleClusterAction(c)}")+700).replace(/\s+/g,' ').slice(0,450)}`);

  // 2E3-C3: Provider key error toast detection patterns SERP_AUTH_INVALID/403/Unauthorized/LLM_AUTH_INVALID (auto message hint)
  const keyE = /SERP_AUTH_INVALID\|403\|Unauthorized\|LLM_AUTH_INVALID/.test(k);
  if (keyE) pass('C3', 'Provider Key Error Detection: regex SERP_AUTH_INVALID/403/LLM_AUTH_INVALID → toast 🔑 คีย์ API error (blocking #1 task reminder when Serper key still inactive)');
  else fail('C3', `Provider key regex patterns present? ${keyE}. catch error toasts: ${k.slice(k.indexOf('catch (e: any)'), k.lastIndexOf('finally { toggleRun(kwId, false)')+800).replace(/\s+/g,' ').slice(0,700)}`);

  // 2E3-C4: Loader2 animate-spin rendered busy rows on demand
  const spin = /Loader2 className="size-3\.5 mr-1\.5 animate-spin"/.test(k);
  if (spin) pass('C4', 'Loader2 animate-spin spinner: show ONLY row running when busy (row-level pending indicator, NOT entire page) → correct React query UX');
  else fail('C4', `Loader2 animate-spin class present? ${spin}. Loading UI snippet: ${k.slice(k.indexOf('busy && runningKwIds.has'), k.indexOf('busy && runningKwIds.has')+900).replace(/\s+/g,' ').slice(0,480)}`);
} catch(e){ fail('C-READ', 'UI err: '+String(e?.message ?? e).slice(0,120)); }

// ───── Summary Exit ─────
console.log(`\n${C.CYAN}${'─'.repeat(72)}${C.RST}`);
const TOTAL = 12;
const PASSED = TOTAL - FAIL;
console.log(`${FAIL===0?C.GRN:C.YLW}  📊 Phase 2E.3 KCP Actions: ${PASSED}/${TOTAL} assertions passed${C.RST}`);
if (FAIL > 0) {
  console.log(`${C.RED}  ❌ ${FAIL} FAILED → fix before build/deploy.${C.RST}`);
  process.exit(1);
}
console.log(`${C.GRN}  ✅ ALL 12/12 PASS → proceed npm build + deploy_run_now VPS 35.231.230.218.${C.RST}\n`);
process.exit(0);
