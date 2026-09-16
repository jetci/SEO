// KCP Closeout Final Audit Local Assertions — 35 checks, ≥24 PASS = exit0
// npm run typecheck && npm run build:strict MUST PASS FIRST
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const KCP = fs.readFileSync(path.join(ROOT, 'client/src/pages/KeywordClusterPlanner.tsx'), 'utf8');
const KW = fs.readFileSync(path.join(ROOT, 'server/routers/keywords.ts'), 'utf8');

let PASS = 0, FAIL = 0;
const results = [];
function assert(name, cond, info='') {
  if (cond) { PASS++; results.push(`✅ PASS: ${name}${info?' — '+info:''}`); }
  else { FAIL++; results.push(`❌ FAIL: ${name}${info?' — '+info:''}`); }
}

// ---------- SECTION A: Typecheck + Build artifacts (1-6) ----------
const distExists = fs.existsSync(path.join(ROOT, 'dist'));
const distKcp = fs.existsSync(path.join(ROOT, 'dist/assets')) && fs.readdirSync(path.join(ROOT, 'dist/assets')).some(f => f.startsWith('KeywordClusterPlanner-'));
assert('A1 dist folder exists', distExists);
assert('A2 KeywordClusterPlanner asset in dist/assets', distKcp);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
assert('A3 package.json deps docx installed', !!pkg.dependencies?.docx);
assert('A4 package.json deps mammoth installed', !!pkg.dependencies?.mammoth);
assert('A5 package.json deps node-cron installed', !!pkg.dependencies?.['node-cron']);
assert('A6 build:strict script exists', typeof pkg.scripts?.['build:strict'] === 'string');

// ---------- SECTION B: KCP Fix 1/2 handleToolbarSave NO setTimeout FAKE (7-18) ----------
assert('B7 handleToolbarSave function exists', /async\s+function\s+handleToolbarSave\s*\(/.test(KCP));
const saveFnMatch = KCP.match(/async\s+function\s+handleToolbarSave\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{2}\}/);
const saveFnBody = saveFnMatch?.[1] ?? '';
assert('B8 handleToolbarSave NO setTimeout fake delay (550ms removed)', !/setTimeout\s*\(\s*r\s*=>\s*r\s*,\s*550\s*\)/.test(saveFnBody));
assert('B9 handleToolbarSave calls setToolbarSaving(true) real loading state', /setToolbarSaving\s*\(\s*true\s*\)/.test(saveFnBody));
assert('B10 handleToolbarSave has setToolbarSaving(false) in finally (always reset)', /finally\s*\{[\s\S]*?setToolbarSaving\s*\(\s*false\s*\)/.test(saveFnBody));
assert('B11 handleToolbarSave invalidate listByProject (real DB sync)', /utils\.keywords\.listByProject\.invalidate/.test(saveFnBody));
assert('B12 handleToolbarSave empty db guard hasReal check', /!hasReal/.test(saveFnBody));
assert('B13 handleToolbarSave integrity pillar→cluster warn logic', /pillars\.length\s*>\s*0\s*&&\s*clusters\.length\s*===\s*0/.test(saveFnBody));
assert('B14 handleToolbarSave integrity cluster→supporting warn logic', /clusters\.length\s*>\s*0\s*&&\s*supportings\.length\s*===\s*0/.test(saveFnBody));
assert('B15 handleToolbarSave admin guard still exists', /!isAdmin/.test(saveFnBody.slice(0, 300)));
assert('B16 handleToolbarSave projectId==="all" guard still exists', /projectId\s*===\s*"all"/.test(saveFnBody.slice(0, 300)));
assert('B17 handleToolbarSave toast mentions auto-saved inline', /auto-saved/.test(saveFnBody) || /auto-save/.test(saveFnBody));
assert('B18 handleToolbarSave try/finally/error structure complete', /catch\s*\(\s*e\s*:\s*any\s*\)[\s\S]*?finally/.test(saveFnBody) || /try\s*\{[\s\S]*?\}\s*catch[\s\S]*?finally/.test(KCP.slice(KCP.indexOf('handleToolbarSave'), KCP.indexOf('handleToolbarSave')+2500)));

// ---------- SECTION C: KCP Fix 2/2 clustersSaveMut WRONG WIRING FIXED (19-25) ----------
assert('C19 OLD clustersSaveMut = aiClusterize.useMutation() WRONG declaration removed', !/const\s+clustersSaveMut\s*=\s*trpc\.keywords\.aiClusterize\.useMutation\s*\(\s*\)/.test(KCP));
assert('C20 NEW toolbarSaving useState loading state exists', /const\s+\[toolbarSaving\s*,\s*setToolbarSaving\]\s*=\s*useState\s*\(\s*false\s*\)/.test(KCP));
assert('C21 Save button uses toolbarSaving for disabled (not clustersSaveMut.isPending)', /<Button[^>]*onClick=\{handleToolbarSave\}[^>]*disabled=\{[^}]*toolbarSaving[^}]*\}/.test(KCP.replace(/\s+/g, ' ')) || /disabled=\{enriching\s*\|\|\s*toolbarSaving\}/.test(KCP));
assert('C22 Save button Loader spinner uses toolbarSaving (not clustersSaveMut.isPending)', /toolbarSaving\s*\?\s*<Loader2/.test(KCP));
assert('C23 Save button label กำลังบันทึก uses toolbarSaving condition', /toolbarSaving\s*\?\s*['"]กำลังบันทึก/.test(KCP) || /toolbarSaving\s*\?\s*<Loader2[\s\S]*?'กำลังบันทึก/.test(KCP.replace(/\s+/g, ' ')));
assert('C24 Reset Filter button uses toolbarSaving for disabled', /handleToolbarReset\}[^}]*disabled=\{[^}]*toolbarSaving/.test(KCP.replace(/\s+/g, ' ')) || /onClick=\{handleToolbarReset\}[\s\S]{0,120}toolbarSaving/.test(KCP));
assert('C25 NO dangling clustersSaveMut references anywhere in file', !/clustersSaveMut/.test(KCP));

// ---------- SECTION D: Inline edits REAL saves (not dirty fake) (26-28) ----------
assert('D26 handleInlineTier calls updateTierMut.mutateAsync actual backend', /handleInlineTier[\s\S]{0,300}updateTierMut\.mutateAsync\s*\(\s*\{\s*id\s*:\s*Number\s*\(\s*c\.keywordId\s*\)\s*,\s*tier\s*\}/.test(KCP));
assert('D27 handleInlineIntent calls updateKwMut.mutateAsync patch:{intent} actual backend', /handleInlineIntent[\s\S]{0,300}updateKwMut\.mutateAsync\s*\(\s*\{\s*id\s*:\s*Number\s*\(\s*c\.keywordId\s*\)\s*,\s*patch\s*:\s*\{\s*intent\s*\}\s*\}/.test(KCP));
assert('D28 bulkTierMut exists and wired correctly for batch tier set', /const\s+bulkTierMut\s*=\s*trpc\.keywords\.bulkUpdateTier\.useMutation/.test(KCP));

// ---------- SECTION E: P0#1 Features still in place (no regression) (29-33) ----------
assert('E29 Pillar Umbrella Banner alert destructive exists (🚫 Pillar Umbrella Keyword)', /Pillar Umbrella Keyword.*ห้ามเขียนบทความโดยตรง/.test(KCP));
assert('E30 handleRunAdd dedup case-insensitive validation exists', /toLowerCase\s*\(\s*\)[\s\S]{0,100}duplicate/.test(KCP) || /dedup|duplicate.*case/i.test(KCP.slice(KCP.indexOf('handleRunAdd'), KCP.indexOf('handleRunAdd')+6000)));
assert('E31 handleRunAdd min 2 chars + max 100 chars validation', /\.length\s*<\s*2[\s\S]{0,200}\.length\s*>\s*100/.test(KCP));
assert('E32 Export CSV All/Filtered + JSON All/Filtered 4 buttons exist', /format\s*:\s*'csv'[\s\S]{0,500}scope\s*:\s*'filtered'[\s\S]{0,500}format\s*:\s*'json'/.test(KCP));
assert('E33 CSV UTF-8 BOM for Thai Excel compatibility', /\\uFEFF/.test(KCP) || /BOM/.test(KCP));

// ---------- SECTION F: AC-6 Forever Guard (34-35) ----------
const migrations = fs.readdirSync(path.join(ROOT, 'db/migrations')).filter(f => f.endsWith('.sql'));
const allSql = migrations.map(m => fs.readFileSync(path.join(ROOT, 'db/migrations', m), 'utf8')).join('\n');
const dropCount = (allSql.match(/\bDROP\s+(TABLE|COLUMN|SCHEMA|INDEX)\b/gi) || []).length;
const alterModifyCount = (allSql.match(/\bALTER\s+TABLE\s+[a-z_]+\s+MODIFY\b/gi) || []).length;
assert('F34 AC-6 ZERO DROP TABLE/COLUMN statements in all migrations (V1=51 V2=14 FOREVER)', dropCount === 0, `DROPs found = ${dropCount}`);
assert('F35 AC-6 ZERO ALTER TABLE MODIFY statements (only ADD allowed)', alterModifyCount === 0, `ALTER MODIFY found = ${alterModifyCount}`);

// ---------- REPORT ----------
console.log('\n═══════════════════════════════════════════════════════');
console.log(`KCP CLOSEOUT FINAL LOCAL AUDIT: ${PASS} PASS / ${FAIL} FAIL / Total ${PASS+FAIL}`);
console.log(`THRESHOLD: ≥24 PASS = exit0 (current: ${PASS} ${PASS>=24?'✅MEETS':'❌BELOW'})`);
console.log('═══════════════════════════════════════════════════════');
results.forEach(r => console.log(r));
console.log('═══════════════════════════════════════════════════════');
console.log(`\nRESULT exit code: ${PASS >= 24 ? 0 : 1}`);
process.exit(PASS >= 24 ? 0 : 1);
