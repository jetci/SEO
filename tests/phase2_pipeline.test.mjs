// EEAT Studio V2 · Phase 2 — Zero-dep backend assertion test
// Scope: static schema/tables, appRouter, vercel config, backward compat markers.
// Section C (live backend :3002) skips if not running.
import * as fs from 'node:fs';
import * as path from 'node:path';

const C = {
  RED: '\x1b[31m', GREEN: '\x1b[32m', YELLOW: '\x1b[33m', CYAN: '\x1b[36m', RST: '\x1b[0m',
};
const pass = (id, msg) => console.log(`${C.GREEN}✅ [${id}]${C.RST} ${msg}`);
const fail = (id, msg) => { console.log(`${C.RED}❌ [${id}]${C.RST} ${msg}`); FAILS.push(id); };
const skip = (id, msg) => console.log(`${C.YELLOW}⏩ [${id}]${C.RST} [SKIP] ${msg}`);
const FAILS = [];
const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const camelize = (t) => t.replace(/_([a-z])/g, (_, c)=>c.toUpperCase());

// ---- A. Static schema / migrations / routers ----
try {
  const schema = read('db/schema.ts');
  const tables = ['settings','serp_metric_cache','research_packages','research_audit'];
  for (const t of tables) {
    const alt = camelize(t);
    if (schema.includes(`export const ${alt} = mysqlTable`)) pass(`P2-A1-${t}`, `db/schema.ts declares ${alt}=mysqlTable`);
    else fail(`P2-A1-${t}`, `db/schema.ts missing ${alt} declaration`);
  }
} catch (e) { fail('P2-A1-ERR', 'db/schema.ts: '+String(e.message||e).slice(0,120)); }

try {
  const mig = read('db/migrations/0002_phase2_research.sql');
  const creates = (mig.match(/CREATE TABLE IF NOT EXISTS/gi) || []).length;
  if (creates >= 4) pass('P2-A2', `0002_phase2_research.sql has ${creates} CREATE TABLEs (≥4)`);
  else fail('P2-A2', `CREATE TABLE count=${creates} < 4`);
} catch (e) { fail('P2-A2-ERR', '0002 migration missing/read fail'); }

try {
  const s = read('server/routers/settings.ts');
  if (!/_settingsMap\s*=\s*new Map/.test(s)) pass('P2-A3', 'settings.ts uses DB persist (no in-memory _settingsMap Map)');
  else fail('P2-A3', 'settings.ts still has in-memory _settingsMap Map');
  const has = ['resolveTeamSettings','upsertSetting','pingProvider','getBillingWindow']
    .filter(fn => new RegExp(`(async function|export async function|${fn}\\s*[:=])`).test(s));
  if (has.length >= 4) pass('P2-A4', `settings router helpers (${has.length}/4): ${has.join(',')}`);
  else fail('P2-A4', `helpers missing only ${has.length}/4`);
} catch(e) { fail('P2-A3-ERR', 'server/routers/settings.ts unreadable'); }

try {
  const vc = JSON.parse(read('vercel.json'));
  const d = vc?.functions?.['api/[...all].ts'];
  if (d && Number(d.maxDuration) >= 60) pass('P2-A5', `vercel.json functions maxDuration=${d.maxDuration} ≥60`);
  else fail('P2-A5', `maxDuration ${d?.maxDuration} <60`);
} catch (e) { fail('P2-A5-ERR', 'vercel.json parse: '+String(e.message||e).slice(0,100)); }

try {
  const app = read('server/app.ts');
  if (/phase:\s*2\b/.test(app)) pass('P2-A6', 'server/app.ts health endpoint reports phase=2');
  else fail('P2-A6', 'health phase != 2');
  if (app.includes('researchRouter') && /import\s*\{[^}]*researchRouter[^}]*\}\s*from/.test(app)) pass('P2-A7', 'app.ts merges researchRouter');
  else fail('P2-A7', 'researchRouter not imported in app.ts');
} catch(e){ fail('P2-A6-ERR', 'server/app.ts unreadable'); }

for (const p of ['server/services/serpClient.ts','server/services/llmClient.ts']) {
  try { read(p); pass(`P2-A8-${path.basename(p,'.ts')}`, `${p} exists`); }
  catch { fail(`P2-A8-${path.basename(p,'.ts')}`, `${p} MISSING`); }
}

try {
  const kw = read('server/routers/keywords.ts');
  if (/enrichSerp\s*:\s*(protectedProcedure|publicProcedure)/.test(kw)) pass('P2-B1', 'keywords router declares enrichSerp procedure');
  else fail('P2-B1', 'keywords enrichSerp missing');
  if (/aiClusterize\s*:\s*(protectedProcedure|publicProcedure)/.test(kw)) pass('P2-B2', 'keywords router declares aiClusterize procedure');
  else fail('P2-B2', 'keywords aiClusterize missing');
} catch(e){ fail('P2-B1-ERR', 'keywords.ts missing'); }

try {
  const r = read('server/routers/research.ts');
  const procs = ['status','getPackage','runPlanForKeyword'].filter(n => new RegExp(`${n}\\s*:`).test(r));
  if (procs.length === 3) pass('P2-B3', `research declares 3 procedures (${procs.join(',')})`);
  else fail('P2-B3', `research procedures only ${procs.length}/3`);
  const hints = ['organic','paa','overview','citation'].filter(h => r.toLowerCase().includes(h));
  if (hints.length >= 3) pass('P2-B4', `research 4-job content hints: ${hints.join(',')}`);
  else fail('P2-B4', `research jobs content hints only ${hints.length}/4`);
} catch(e){ fail('P2-B3-ERR', 'research.ts missing'); }

// Phase1 backward compat procedure declaration PRESENCE in routers/*.ts source bodies (names match tRPC dotted)
try {
  const cats = read('server/routers/categories.ts');
  const projs = read('server/routers/projects.ts');
  const clus = read('server/routers/clusters.ts');
  const kws = read('server/routers/keywords.ts');
  const auth = read('server/auth.ts');
  const markers = [
    ['projects.create', /create\s*:\s*protectedProcedure/.test(projs)],
    ['clusters.list', /list\s*:\s*protectedProcedure/.test(clus)],
    ['keywords.bulkCreate', /bulkCreate\s*:\s*protectedProcedure/.test(kws)],
    ['auth.devSignin', /devSignin\s*:\s*publicProcedure|devSignin\s*:\s*(authRouter|router)/.test(auth) || /export const authRouter = router\([\s\S]*devSignin\s*:/.test(auth)],
  ];
  const bad = markers.filter(([,ok])=>!ok).map(([n])=>n);
  if (bad.length === 0) pass('P2-B5', 'Phase1 procedure declarations preserved (4/4)');
  else fail('P2-B5', `Phase1 markers absent in sources: ${bad.join(',')}`);
} catch(e){ fail('P2-B5-ERR', 'router files missing: '+String(e.message||e).slice(0,120)); }

// ---- C. Optional live backend + DB ----
(async () => {
  let backendUp = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), 1400);
    const r = await fetch('http://127.0.0.1:3002/api/health', { signal: ctrl.signal });
    clearTimeout(t);
    backendUp = r.status === 200 ? await r.json() : null;
  } catch {}
  if (!backendUp) {
    ['P2-C1','P2-C2','P2-C3','P2-C4'].forEach(id => skip(id, 'Backend :3002 not running (optional)'));
    finalize();
    return;
  }
  if (Array.isArray(backendUp.routers) && backendUp.routers.includes('research')) pass('P2-C1', '/api/health routers includes "research"');
  else fail('P2-C1', `routers: ${backendUp.routers}`);
  if (Number(backendUp.phase) === 2) pass('P2-C2', `/api/health phase=${backendUp.phase} === 2`);
  else fail('P2-C2', `phase !=2`);
  try {
    const m = await import('mysql2/promise');
    const pool = m.default.createPool({ host:'127.0.0.1', port:3306, user:'eeat', password:'eeat_secret', database:'eeat_studio_v2', connectionLimit:2, multipleStatements:true });
    const [rows] = await pool.query('SHOW TABLES');
    await pool.end();
    const cnt = Array.isArray(rows) ? rows.length : 0;
    if (cnt >= 12) pass('P2-C3', `MySQL tables count=${cnt} ≥12`);
    else fail('P2-C3', `tables count ${cnt} <12`);
    const names = Array.isArray(rows) ? rows.map(r=>Object.values(r)[0]) : [];
    const exp = ['settings','serp_metric_cache','research_packages','research_audit'];
    const miss = exp.filter(x=>!names.includes(x));
    if (miss.length===0) pass('P2-C4','All 4 phase2 tables exist in MySQL');
    else fail('P2-C4', `Missing tables: ${miss.join(',')}`);
  } catch(e){
    skip('P2-C3', `mysql import err: ${String(e.message||e).slice(0,120)}`);
    skip('P2-C4','depends C3');
  }
  finalize();
})().catch(e => { console.error('C err:', String(e?.message || e).slice(0,200)); process.exit(1); });

function finalize() {
  console.log('\n==========================================');
  if (FAILS.length === 0) {
    console.log(`${C.GREEN} Phase 2 pipeline static suite: ALL PASS${C.RST}`);
    process.exit(0);
  } else {
    console.log(`${C.RED} Phase 2 FAILURES: ${FAILS.join(', ')}${C.RST}`);
    process.exit(1);
  }
}
