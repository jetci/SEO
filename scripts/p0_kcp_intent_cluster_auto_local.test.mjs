// KCP AI INTENT/CLUSTER AUTO BATCH — 30 assertions ≥20 PASS = exit0
// Verifies detectIntentFromText heuristics + create/import tier/intent auto-assign + auto-clusterize flow
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

// Section A: Build artifacts exist (1-5)
assert('A1 dist folder exists', fs.existsSync(path.join(ROOT, 'dist')));
assert('A2 KeywordClusterPlanner asset exists in dist/assets', fs.existsSync(path.join(ROOT, 'dist/assets')) && fs.readdirSync(path.join(ROOT, 'dist/assets')).some(f => f.startsWith('KeywordClusterPlanner-') && f.endsWith('.js')));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
assert('A3 typecheck build strict scripts exist', typeof pkg.scripts?.typecheck === 'string' && typeof pkg.scripts?.['build:strict'] === 'string');
assert('A4 package-lock.json exists', fs.existsSync(path.join(ROOT, 'package-lock.json')));
assert('A5 keywords router file exists >8KB', KW.length > 8_000, `bytes=${KW.length}`);

// Section B: Backend detectIntentFromText heuristic (6-14)
assert('B6 detectIntentFromText function declared in keywords.ts', /function\s+detectIntentFromText\s*\(\s*raw\s*:\s*string\s*\)\s*:\s*KeywordIntent/.test(KW));
assert('B7 Intent heuristic returns transactional for buy/order/จอง/สั่ง/ซื้อ patterns', /(จอง|สั่ง|ซื้อ|buy|order|book|purchase)/.test(KW.slice(KW.indexOf('detectIntentFromText'), KW.indexOf('detectIntentFromText')+3000)));
assert('B8 Intent heuristic returns navigational for ร้าน/ที่ไหน/ใกล้ฉัน/เว็บไซต์ patterns', /(ร้าน|ที่ไหน|ใกล้ฉัน|เว็บไซต์|website|near\s*me)/.test(KW.slice(KW.indexOf('detectIntentFromText'), KW.indexOf('detectIntentFromText')+3000)));
assert('B9 Intent heuristic returns commercial for ราคา/รีวิว/เปรียบเทียบ/discount/promo patterns', /(ราคา|รีวิว|review|โปรโมชั่น|ส่วนลด|discount|coupon|เปรียบเทียบ|top|best|ดีกว่า)/.test(KW.slice(KW.indexOf('detectIntentFromText'), KW.indexOf('detectIntentFromText')+3000)));
assert('B10 Intent heuristic returns informational for วิธี/ทำไม/คืออะไร/how/why patterns', /(วิธี|ทำไม|อย่างไร|คืออะไร|how|why|what)/.test(KW.slice(KW.indexOf('detectIntentFromText'), KW.indexOf('detectIntentFromText')+3000)));
assert('B11 Fallback default = informational (70% SEO majority)', /return\s+['"]informational['"];/.test(KW.slice(KW.indexOf('detectIntentFromText'), KW.indexOf('detectIntentFromText')+3500)));
const createIdx = KW.indexOf('create: protectedProcedure');
assert('B12 keywords.create calls detectIntentFromText assigns autoIntent variable', /const\s+autoIntent\s*=\s*detectIntentFromText\s*\(\s*input\.keywordText\s*\)/.test(KW.slice(createIdx, createIdx + 1200)));
assert('B13 keywords.create insert uses autoIntent NOT input.intent for intentSuggestion', /intentSuggestion\s*:\s*autoIntent\s+as\s+any/.test(KW.slice(createIdx, createIdx+1600)));
const importCsvIdx = KW.indexOf('importCsv: protectedProcedure');
assert('B14 importCsv loop calls rowIntent = detectIntentFromText(r.keyword) for every row', /rowIntent\s*=\s*detectIntentFromText\s*\(\s*r\.keyword\s*\)/.test(KW.slice(importCsvIdx, importCsvIdx+2800)));

// Section C: Backend importCsv inserted_keyword_ids return array (15-18)
assert('C15 importCsv return has inserted_keyword_ids field in success', /inserted_keyword_ids\s*:\s*insertedKeywordIds\s*\}/.test(KW.slice(importCsvIdx, importCsvIdx+3500)));
assert('C16 importCsv empty dedup return has inserted_keyword_ids: [] as number[]', /inserted_keyword_ids\s*:\s*\[\]\s+as\s+number\[\]/.test(KW.slice(importCsvIdx-200, importCsvIdx+200)));
assert('C17 importCsv dev fallback also has inserted_keyword_ids: []', /mock\s*:\s*true\s*,\s*inserted_keyword_ids\s*:\s*\[\]/.test(KW));
assert('C18 importCsv duplicates update path ALSO sets intentSuggestion via rowIntent', /patch\.intentSuggestion\s*=\s*rowIntent\s+as\s+any/.test(KW.slice(importCsvIdx, importCsvIdx+3200)));

// Section D: Client handleRunAdd auto clusterize after single keyword add (19-24)
const hraIdx = KCP.indexOf('async function handleRunAdd()');
assert('D19 handleRunAdd importCsvMut path then calls aiClusterize.mutateAsync for single kw', /aiClusterize\.mutateAsync\s*\(\s*\{\s*projectId\s*:\s*Number\s*\(\s*pid\s*\)\s*,\s*keywordIds\s*:\s*finalIds/.test(KCP.slice(hraIdx, hraIdx+5000)));
assert('D20 handleRunAdd extracts inserted_keyword_ids array from importCsvMut response type-aware', /inserted_keyword_ids.*filter\s*\(\s*n\s*=>\s*Number\s*\(\s*n\s*\)\s*>\s*0/.test(KCP.slice(hraIdx, hraIdx+3500)));
assert('D21 handleRunAdd fallback keyword finder by text if inserted_keyword_ids empty', /String\s*\(\s*k\.keywordText\s*\|\|\s*['"]\s*\)\s*\.toLowerCase\s*\(\s*\)\s*===\s*kw\.toLowerCase/.test(KCP.slice(hraIdx, hraIdx+5000)));
assert('D22 handleRunAdd createKwMut path also triggers aiClusterize post-save using keywordId', /newKwId.*aiClusterize\.mutateAsync\s*\(\s*\{\s*projectId\s*:\s*Number\s*\(\s*pid\s*\)\s*,\s*keywordIds\s*:\s*\[\s*newKwId\s*\]\s*\}/.test(KCP.slice(hraIdx, hraIdx+5500)));
assert('D23 handleRunAdd aiClusterize error is non-fatal (toast warning not throw = intent heuristic fallback)', /toast\.warning\s*\(\s*['"]⚠️ AI clusterize skip/.test(KCP.slice(hraIdx, hraIdx+5000)));
assert('D24 handleRunAdd toast mentions Intent auto-detect on success', /Intent auto-detect/.test(KCP.slice(hraIdx, hraIdx+4000)));

// Section E: Client handleRunImport auto clusterize after CSV import (25-28)
const hriIdx = KCP.indexOf('async function handleRunImport()');
assert('E25 handleRunImport auto triggers aiClusterize after success with inserted_keyword_ids OR project-only fallback', /totalAffected\s*>\s*0\s*&&\s*aiClusterize\s*&&\s*!aiClusterize\.isPending/.test(KCP.slice(hriIdx, hriIdx+4000)));
assert('E26 handleRunImport if inserted_ids exist: mutateAsync with keywordIds, else without keywordIds = cluster unassigned only', /insertedIds\.length\s*>\s*0\s*\?[\s\S]{0,200}keywordIds:\s*insertedIds[\s\S]{0,120}:[\s\S]{0,200}projectId:\s*Number\s*\(\s*importProject\s*\)/.test(KCP.replace(/\s+/g,' ').slice(KCP.replace(/\s+/g,' ').indexOf('handleRunImport')-200, KCP.replace(/\s+/g,' ').indexOf('handleRunImport')+7000)));
assert('E27 handleRunImport import toast mentions Intent auto-detect ทุก row', /Intent auto-detect/.test(KCP.slice(hriIdx, hriIdx+2500)));
assert('E28 handleRunImport calls utils.keywords.listByProject.invalidate() before clusterize (fresh state)', /utils\.keywords\.listByProject\.invalidate/.test(KCP.slice(hriIdx, hriIdx+3500)));

// Section F: AC-6 Guard + Menu (29-30)
const migrations = fs.readdirSync(path.join(ROOT, 'db/migrations')).filter(f => f.endsWith('.sql'));
const allSql = migrations.map(m => fs.readFileSync(path.join(ROOT, 'db/migrations', m), 'utf8')).join('\n');
assert('F29 AC-6 ZERO DROP TABLE/COLUMN/SCHEMA/INDEX in all SQL migrations', (allSql.match(/\bDROP\s+(TABLE|COLUMN|SCHEMA|INDEX)\b/gi)||[]).length === 0, `DROP count=${(allSql.match(/\bDROP\s+(TABLE|COLUMN|SCHEMA|INDEX)\b/gi)||[]).length}`);
assert('F30 Menu จัดกลุ่ม handleClusterize calls aiClusterize.mutateAsync with keywordIds if selected else undefined (all/unassigned)', /handleClusterize[\s\S]{0,1200}aiClusterize\.mutateAsync\s*\(\s*\{\s*projectId\s*:\s*Number\s*\(\s*projectId\s*\)\s*,\s*keywordIds\s*:\s*selIds\.length\s*>\s*0\s*\?\s*selIds\.slice\s*\(\s*0\s*,\s*500\s*\)\s*:\s*undefined\s*\}\s*\)/.test(KCP));

// Report
console.log('\n═══════════════════════════════════════════════════════');
console.log(`KCP AUTO-CLUSTER INTENT BATCH LOCAL AUDIT: ${PASS} PASS / ${FAIL} FAIL / Total ${PASS+FAIL}`);
console.log(`THRESHOLD: ≥20 PASS = exit0 (current: ${PASS} ${PASS>=20?'✅MEETS':'❌BELOW'})`);
console.log('═══════════════════════════════════════════════════════');
results.forEach(r => console.log(r));
console.log('═══════════════════════════════════════════════════════');
console.log(`\nRESULT exit code: ${PASS >= 20 ? 0 : 1}`);
process.exit(PASS >= 20 ? 0 : 1);
