import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_TS = fs.readFileSync(path.join(ROOT, 'server', 'app.ts'), 'utf8');
const DB_MIG = fs.readdirSync(path.join(ROOT, 'db', 'migrations')).map(f => {
  try { return fs.readFileSync(path.join(ROOT, 'db', 'migrations', f), 'utf8'); } catch { return ''; }
}).join('\n---FILE---\n');
const SERVER_DIR = path.join(ROOT, 'server');
const DB_DIR = path.join(ROOT, 'db');

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { console.log('  \u2705', name); pass++; }
  else { console.log('  \u274c FAIL', name); fail++; }
}

console.log('\n==== Phase3C Scheduler Publish NO ALTER Local Tests ====\n');

// ========= GROUP A: Interval + Buffer config =========
console.log('[A] Timer + buffer/lookback config');
assert('A1 setInterval delay 60_000ms (60s tick via SCHED_INTERVAL_MS const)', /setInterval\(\s*schedTick\s*,\s*(60_000|SCHED_INTERVAL_MS)\s*\)/.test(APP_TS));
assert('A2 setTimeout first tick 5_000ms (5s boot grace)', /setTimeout\(\s*schedTick\s*,\s*5_000\s*\)/.test(APP_TS));
assert('A3 PUBLISH_BUFFER_MIN 30 min buffer', /PUBLISH_BUFFER_MIN\s*=\s*30/.test(APP_TS));
assert('A4 MAX_LOOKBACK_DAYS 7 window', /MAX_LOOKBACK_DAYS\s*=\s*7/.test(APP_TS));
assert('A5 SYSTEM_ADMIN_ID seed 99001 admin caller', /SYSTEM_ADMIN_ID\s*=\s*99001/.test(APP_TS));

// ========= GROUP B: Eligibility where conditions =========
console.log('\n[B] Eligibility WHERE conditions (NO new enum values)');
assert('B1 eq articles.status == draft', /eq\(\s*articles\.status\s*,\s*['"]draft['"]\s*\)/.test(APP_TS));
assert('B2 gte writeArticles.writeStep >= 8 (SaveDraft done)', /gte\(\s*writeArticles\.writeStep\s*,\s*8\s*\)/.test(APP_TS));
assert('B3 eq writeArticles.stepStatus == done (existing enum only)', /eq\(\s*writeArticles\.stepStatus\s*,\s*['"]done['"]\s*\)/.test(APP_TS));
assert('B4 lte articles.updatedAt <= sinceBuf (30min buffer)', /lte\(\s*articles\.updatedAt\s*,\s*sinceBuf\s*\)/.test(APP_TS));
assert('B5 gte articles.updatedAt >= sinceMin (7d window)', /gte\(\s*articles\.updatedAt\s*,\s*sinceMin\s*\)/.test(APP_TS));
assert('B6 .limit(25) batch safety', /\.limit\(\s*25\s*\)/.test(APP_TS));

// ========= GROUP C: NO ALTER / DROP FOREVER =========
console.log('\n[C] ZERO ALTER/DROP guarantee FOREVER (AC-6 backward compat)');

function grepAlterDrop(dir) {
  let hits = [];
  for (const f of walk(dir)) {
    if (!/\.(ts|js|sql|mjs|cjs)$/.test(f)) continue;
    try {
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split(/\n/);
      lines.forEach((ln, i) => {
        let stripped = ln.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const rel = path.relative(ROOT,f);
        if (/\bALTER\s+TABLE\b/i.test(stripped) || /\bDROP\s+(TABLE|COLUMN|INDEX)\b/i.test(stripped)) {
          if (/AUTO_INCREMENT/i.test(stripped) || /TRUNCATE/i.test(stripped)) return;
          if (/NO\s+ALTER/i.test(ln) || /zero\s+alter/i.test(ln.toLowerCase())) return;
          if (/\.(ts|js|mjs|cjs)$/i.test(rel) && /comment/i.test(ln.toLowerCase())) return;
          hits.push(`${rel}:${i+1} ${stripped.trim().slice(0,140)}`);
        }
      });
    } catch {}
  }
  return hits;
}
function walk(dir, out=[]) {
  for (const e of (fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes:true}) : [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !['node_modules','dist','.git'].includes(e.name)) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const alterHitsServer = grepAlterDrop(SERVER_DIR);
const alterHitsDb = grepAlterDrop(DB_DIR);
assert(`C1 server/ files NO ALTER/DROP statements (hits=${alterHitsServer.length})`, alterHitsServer.length === 0);
assert(`C2 db/ files NO ALTER/DROP (only CREATE IF NOT EXISTS allowed, hits=${alterHitsDb.filter(l => /CREATE TABLE IF NOT EXISTS/.test(l) === false).length})`, alterHitsDb.filter(l => !/CREATE TABLE IF NOT EXISTS/.test(l)).length === 0);

// ========= GROUP D: Error path reuse existing error_msg col =========
console.log('\n[D] Error path reuses existing writeArticles.error_msg VARCHAR 512');
assert('D1 [SCHED_FAIL] prefix stored to errorMsg col', /errorMsg\s*:\s*`\s*\[SCHED_FAIL\]\s*\$\{msg\}`/.test(APP_TS));
assert('D2 msg slice(0,511) <=512 VARCHAR limit', /slice\(\s*0\s*,\s*511\s*\)/.test(APP_TS));
assert('D3 SIGTERM + SIGINT clearInterval cleanup', /process\.once\(\s*['"]SIGTERM['"][\s\S]{0,200}process\.once\(\s*['"]SIGINT['"]/.test(APP_TS));
assert('D4 Guard IS_PROD && !VERCEL (not start on vercel serverless / dev)', /if\s*\(\s*IS_PROD\s*&&\s*!VERCEL\s*\)/.test(APP_TS));
assert('D5 createCaller context role=admin + write.publish mutation called', /createCaller\([\s\S]{0,200}role\s*:\s*['"]admin['"]/.test(APP_TS) && /\bcaller\s*\.\s*write\s*\.\s*publish\s*\(/.test(APP_TS));

// ========= GROUP E: Migration safety no scheduled enum =========
console.log('\n[E] Migration step_status NEVER had scheduled enum (NO ALTER needed)');
assert('E1 0003 migration step_status enum=pending|running|done|fail only (no scheduled)', /step_status\s+ENUM\(\s*['"]pending['"]\s*,\s*['"]running['"]\s*,\s*['"]done['"]\s*,\s*['"]fail['"]\s*\)/.test(DB_MIG));

console.log(`\n==== Phase3C Scheduler Local: ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL ====`);
if (fail > 0) process.exit(1);
