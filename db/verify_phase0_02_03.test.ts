/**
 * ──────────────────────────────────────────────────────────────
 * EEAT Studio V2 — Task 0.2+0.3 Verification Test (Step 2 Workflow)
 * ⚠️ REVISED 2026-09-08: Synced with SA agent_phase0_setup.md LINE-BY-LINE
 *   · categories: 3 NEW cols (icon, is_active, sort_order SA L57)
 *   · clusters: COMPLETE REWRITE (name, type enum pillar/cluster/supporting, parent_id self-ref SA L62-L63)
 *   · keywords: status enum(pending/written) ADDED SA L66
 *   · articles: keyword_id NULLABLE SA L68! status enum draft/published ONLY 2 values SA L68 (NOT 4 workflow_status)
 *   · users.role enum = admin/writer ONLY (NO viewer SA L46)
 *   · team_members.permission = owner/admin/member ONLY (NO read/edit SA L53)
 *   · projects.mainKeyword ADDED SA L59, nicheCategoryId → categoryId rename
 *   · categories seed 15 rows EXACT SA L79-L96 (NO เกม/รถยนต์/บ้าน/ไลฟ์สไตล์! YES บาสเกตบอล/สนุกเกอร์/ไก่ชน/วัวชน/กีฬาอื่นๆ, slug boxing=มวย other-sports=กีฬาอื่นๆ)
 * ──────────────────────────────────────────────────────────────
 * Static SQL analysis on FILES (do NOT need running DB)
 *   Exit Gate G0.2 = 8 Tables exist SQL script
 *   Exit Gate G0.3 = FK constraint + email UNIQUE + created_at guard
 *   Exit Gate G0.5 = 15 categories rows, is_ymyl 5 rows
 * RUN:
 *   npx tsx "D:\AEO\SEO V2\db\verify_phase0_02_03.test.ts"
 * ──────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const M01 = readFileSync(join(ROOT, 'db/migrations/0001_init_8_tables.sql'), 'utf-8');
const M02 = readFileSync(join(ROOT, 'db/migrations/0002_seed_categories.sql'), 'utf-8');

// Helper: strip SQL single-line (--) comments from a string block before regex check
// (prevents regex from matching comments like "REMOVED old_col" vs real column definitions)
function stripSqlComments(block: string): string {
  return block
    .replace(/--[^\n]*\n/g, '\n')            // single line -- comments
    .replace(/\/\*[\s\S]*?\*\//g, '')        /* block comments */
    .replace(/^\s*$/gm, '');                  // blank lines
}

function check(label: string, pass: boolean, info = ''): { label: string; pass: boolean; info?: string } {
  return { label, pass, info };
}
const results: Array<{ label: string; pass: boolean; info?: string }> = [];

// ─────────────────────────────────────────────────────────────
// G0.2 · 8 Tables CREATE TABLE (EXACTLY 8 — NO extras)
// ─────────────────────────────────────────────────────────────
const TABLES_EXPECTED = [
  'users','teams','team_members','categories',
  'projects','clusters','keywords','articles'
];
const regexCreate = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`([a-zA-Z0-9_]+)`/g;
const tables: string[] = [];
let m: RegExpExecArray | null;
while ((m = regexCreate.exec(M01)) !== null) tables.push(m[1]);
results.push(check(
  `[G0.2] CREATE TABLE count = ${TABLES_EXPECTED.length}`,
  tables.length === TABLES_EXPECTED.length,
  `found=${tables.join(',')}  expected=${TABLES_EXPECTED.join(',')}`,
));
for (const t of TABLES_EXPECTED) {
  results.push(check(
    `[G0.2]   Table present \`${t}\``,
    tables.includes(t),
    t,
  ));
}

// ─────────────────────────────────────────────────────────────
// G0.3 · FK constraints + email UNIQUE
// ─────────────────────────────────────────────────────────────
const fkCount = (M01.match(/CONSTRAINT\s+`fk_/g) || []).length;
results.push(check(
  `[G0.3] FK Constraints ≥ 15`,
  fkCount >= 15,
  `found FK count=${fkCount}`,
));
results.push(check(
  `[G0.3] users.email UNIQUE (uk_users_email)`,
  /UNIQUE\s+KEY\s+[`(]?uk_users_email[`)]?\s*\([`]?email[`]?\)/.test(M01),
  'SA G0.3 email UNIQUE requirement',
));
results.push(check(
  `[G0.3] users.google_open_id UNIQUE`,
  /UNIQUE\s+KEY\s+[`(]?uk_users_google_open_id[`)]?\s*\([`]?google_open_id[`]?\)/.test(M01),
  'Google OAuth dedup',
));
results.push(check(
  `[G0.3] team_members UNIQUE(team_id,user_id)`,
  /UNIQUE\s+KEY\s+[`(]?uk_team_members[`)]?\s*\([`]?team_id[`]?\s*,\s*[`]?user_id[`]?\)/.test(M01),
  'No dup member SA L54',
));

// ─────────────────────────────────────────────────────────────
// 2513 Bug Guard: ALL 8 tables → created_at NOT NULL DEFAULT CURRENT_TIMESTAMP()
// ─────────────────────────────────────────────────────────────
let badDateTables: string[] = [];
for (const t of TABLES_EXPECTED) {
  const reStr =
    'CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+`' + t + '`\\s*\\((.*?)\\)\\s*ENGINE=';
  const re = new RegExp(reStr, 's');
  const blockM = M01.match(re);
  if (!blockM) { badDateTables.push(t + ':BLOCK_NOT_FOUND'); continue; }
  const hasLine = /`created_at`\s+DATETIME\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP\(\)/.test(blockM[1]);
  if (!hasLine) badDateTables.push(t);
}
results.push(check(
  `[G0.4] 2513 Bug Guard: created_at NOT NULL DEFAULT CURRENT_TIMESTAMP() — ALL ${TABLES_EXPECTED.length} tables`,
  badDateTables.length === 0,
  badDateTables.length ? 'FAILED tables=' + badDateTables.join(',') : 'ALL TABLES PASS',
));

// ─────────────────────────────────────────────────────────────
// ✅ SA L46 FIX: users.role enum = admin/writer ONLY (NO viewer!)
// ─────────────────────────────────────────────────────────────
const usersRoleEnumOK = M01.includes("ENUM('admin','writer')") && !M01.includes("ENUM('admin','writer','viewer')") && !M01.includes("'viewer'");
results.push(check(
  `[SA-L46] users.role ENUM = admin/writer ONLY (NO viewer removed — FIXED 2026-09-08)`,
  usersRoleEnumOK,
  usersRoleEnumOK ? 'SA L46 COMPLIANT' : 'FAIL — user role enum still has viewer or not admin/writer',
));

// ─────────────────────────────────────────────────────────────
// ✅ SA L53 FIX: team_members.permission enum = owner/admin/member ONLY (NO read/edit!)
// NOTE: Check ONLY team_members CREATE TABLE block (NOT whole M01 comments!)
// ─────────────────────────────────────────────────────────────
const teamBlockM = M01.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`team_members`\s*\((.*?)\)\s*ENGINE=/s);
const teamBlockRaw = teamBlockM ? teamBlockM[1] : '';
const teamBlock = stripSqlComments(teamBlockRaw);  // ← strip comments BEFORE check
const teamPermEnumOK = /`permission`\s+ENUM\('owner','admin','member'\)/.test(teamBlock) && !teamBlock.includes("'edit'") && !teamBlock.includes("'read'");
results.push(check(
  `[SA-L53] team_members.permission ENUM = owner/admin/member ONLY (NO read/edit removed — FIXED 2026-09-08)`,
  teamPermEnumOK,
  teamPermEnumOK ? 'SA L53 COMPLIANT (scope=team_members block ONLY, comments stripped)' : `FAIL — teamBlock enum check fail. hasOwnerAdminMember=${/`permission`\s+ENUM\('owner','admin','member'\)/.test(teamBlock)}, noEdit=${!teamBlock.includes("'edit'")}, noRead=${!teamBlock.includes("'read'")}`,
));

// ─────────────────────────────────────────────────────────────
// ✅ SA L57 FIX: categories table +3 NEW cols (icon, is_active, sort_order)
// ─────────────────────────────────────────────────────────────
const catHasIcon = /`icon`\s+VARCHAR\(64\)\s+NULL/.test(M01);
const catHasIsActive = /`is_active`\s+TINYINT\(1\)\s+NOT\s+NULL\s+DEFAULT\s+1/.test(M01);
const catHasSortOrder = /`sort_order`\s+INT\s+NOT\s+NULL\s+DEFAULT\s+0/.test(M01);
results.push(check(
  `[SA-L57] categories: +3 NEW COLUMNS (icon + is_active(default true) + sort_order) — ALL PRESENT`,
  catHasIcon && catHasIsActive && catHasSortOrder,
  `icon=${catHasIcon?'Y':'N'} is_active=${catHasIsActive?'Y':'N'} sort_order=${catHasSortOrder?'Y':'N'}`,
));

// ─────────────────────────────────────────────────────────────
// ✅ SA L59 FIX: projects.main_keyword ADDED + niche_category_id → category_id RENAME
// NOTE: Check ONLY projects CREATE TABLE block (NOT whole M01 comments!)
// ─────────────────────────────────────────────────────────────
const projBlockM = M01.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`projects`\s*\((.*?)\)\s*ENGINE=/s);
const projBlock = stripSqlComments(projBlockM ? projBlockM[1] : '');  // ← strip comments BEFORE check
const projHasMainKw = /`main_keyword`\s+VARCHAR\(255\)\s+NULL/.test(projBlock);
const projHasCatId = /`category_id`\s+INT\s+UNSIGNED\s+NULL/.test(projBlock);
const projNoOldNiche = !/niche_category_id/.test(projBlock);  // OLD name must be GONE (only within block, no comments!)
results.push(check(
  `[SA-L59] projects: main_keyword ADDED + category_id RENAME (niche_category_id REMOVED)`,
  projHasMainKw && projHasCatId && projNoOldNiche,
  `main_keyword=${projHasMainKw?'Y':'N'} category_id=${projHasCatId?'Y':'N'} old_niche_GONE(scope=block comments-stripped)=${projNoOldNiche?'Y':'N'}`,
));

// ─────────────────────────────────────────────────────────────
// ✅ SA L62-L63 FIX: clusters table TOTAL REWRITE — TREE struct (name, type enum, parent_id self-ref)
// REMOVED OLD COLS: pillar_keyword, cluster_main, user_intent, search_volume_monthly, difficulty_score, status, created_by
// NOTE: Check ONLY clusters CREATE TABLE block + FK constraints section (NOT comments!)
// ─────────────────────────────────────────────────────────────
const clustBlockM = M01.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`clusters`\s*\((.*?)\)\s*ENGINE=/s);
const clustBlock = stripSqlComments(clustBlockM ? clustBlockM[1] : '');  // ← strip comments BEFORE check
const clustHasName = /`name`\s+VARCHAR\(255\)\s+NOT\s+NULL/.test(clustBlock);
const clustHasType = /`type`\s+ENUM\('pillar','cluster','supporting'\)\s+NOT\s+NULL\s+DEFAULT\s+'supporting'/.test(clustBlock);
const clustHasParentId = /`parent_id`\s+BIGINT\s+UNSIGNED\s+NULL/.test(clustBlock) && /CONSTRAINT\s+`fk_clusters_parent_id`\s+FOREIGN\s+KEY\s+\(`parent_id`\)\s+REFERENCES\s+`clusters`\s+\(`id`\)/.test(M01);
// Old cols scope = clusters block ONLY (comments stripped)
const clustNoOldPillar = !/pillar_keyword/.test(clustBlock) && !/cluster_main/.test(clustBlock) && !/user_intent/.test(clustBlock) && !/difficulty_score/.test(clustBlock) && !/created_by/.test(clustBlock);
results.push(check(
  `[SA-L62-63] clusters: TREE STRUCTURE REWRITE (name + type enum + parent_id self-ref). Old flat cols (pillar_keyword etc.) REMOVED`,
  clustHasName && clustHasType && clustHasParentId && clustNoOldPillar,
  `name=${clustHasName?'Y':'N'} typeEnum=${clustHasType?'Y':'N'} parentIdSelfRef=${clustHasParentId?'Y':'N'} oldFlatColsGONE(scope=clusters block comments-stripped)=${clustNoOldPillar?'Y':'N'}`,
));

// ─────────────────────────────────────────────────────────────
// ✅ SA L66 FIX: keywords.status column ADDED — enum(pending/written default pending)
// ─────────────────────────────────────────────────────────────
const kwHasStatus = /keywords`[^;]*`status`\s+ENUM\('pending','written'\)\s+NOT\s+NULL\s+DEFAULT\s+'pending'/s.test(M01);
results.push(check(
  `[SA-L66] keywords: status column ADDED enum(pending/written, default pending) — FIXED 2026-09-08`,
  kwHasStatus,
  kwHasStatus ? 'SA L66 COMPLIANT' : 'FAIL — status enum missing/wrong in keywords table',
));

// ─────────────────────────────────────────────────────────────
// ✅ SA L68-L69 FIX (Articles MAJOR FIX):
//   1) keyword_id → NULLABLE! (was NOT NULL violation)
//   2) status enum = draft/published ONLY 2 values! (workflow_status REMOVED writing/review GONE)
//   3) REMOVED NOT SA cols: cluster_id, outline_json, word_count, published_at
// ─────────────────────────────────────────────────────────────

// keyword_id NULLABLE check (NOT "NOT NULL" → in articles block)
const artBlockM = M01.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`articles`\s*\((.*?)\)\s*ENGINE=/s);
const artBlock = stripSqlComments(artBlockM ? artBlockM[1] : '');  // ← strip comments BEFORE check (no "writing/review GONE" comment match!)
const kwIdNullable = /`keyword_id`\s+BIGINT\s+UNSIGNED\s+NULL/.test(artBlock) && !/`keyword_id`\s+BIGINT\s+UNSIGNED\s+NOT\s+NULL/.test(artBlock);
const artStatus2Values = /`status`\s+ENUM\('draft','published'\)\s+NOT\s+NULL\s+DEFAULT\s+'draft'/.test(artBlock);
// workflow_status check: ONLY articles block + column definitions (not COMMENT strings in table options → already captured inside ENGINE= in regex block)
const noWorkflowStatus = !/workflow_status/.test(artBlock);  // scope=articles create block ONLY (comments stripped)
const noWritingReview = !/writing/.test(artBlock) && !/review/.test(artBlock);  // articles block comments-stripped
const noExtraArticleCols = !/cluster_id`/.test(artBlock) && !/outline_json/.test(artBlock) && !/word_count/.test(artBlock) && !/published_at/.test(artBlock);

results.push(check(
  `[SA-L68] articles FIXES (4 in 1): keyword_id=NULLABLE + status=draft/published(2 values ONLY) + workflow_status GONE + no EXTRA COLS`,
  kwIdNullable && artStatus2Values && noWorkflowStatus && noWritingReview && noExtraArticleCols,
  `kwIdNullable=${kwIdNullable?'Y':'N'} status2values=${artStatus2Values?'Y':'N'} workflowStatus_GONE(comments-stripped)=${noWorkflowStatus?'Y':'N'} no_writing/review(block comments-stripped)=${noWritingReview?'Y':'N'} extraColsGONE(block)=${noExtraArticleCols?'Y':'N'}`,
));

// articles 3 FK non-null + keyword_id NULLABLE (SA L68 explicit: keyword_id is nullable!)
const ART_FK_NONNULL = ['project_id','author_id','category_id'];
let badArticleFk: string[] = [];
for (const col of ART_FK_NONNULL) {
  const colReStr = '`' + col + '`\\s+(BIGINT|INT)\\s+UNSIGNED\\s+NOT\\s+NULL';
  const re = new RegExp(colReStr);
  if (!re.test(artBlock)) badArticleFk.push(col + ':NOT_NULL_MISSING');
  const fkReStr = 'CONSTRAINT\\s+`fk_articles_' + col + '`';
  const fkRe = new RegExp(fkReStr);
  if (!fkRe.test(M01)) badArticleFk.push(col + ':FK_CONSTRAINT_MISSING');
}
// keyword_id: nullable test + FK constraint MUST exist
if (!/CONSTRAINT\s+`fk_articles_keyword_id`/.test(M01)) badArticleFk.push('keyword_id:FK_CONSTRAINT_MISSING');
results.push(check(
  `[SA-L68] articles FK: project/author/category NOT NULL · keyword_id NULLABLE · ALL 4 FK constraints exist`,
  badArticleFk.length === 0,
  badArticleFk.length ? 'FAILED cols=' + badArticleFk.join(',') : 'PASS ALL 4',
));

// ─────────────────────────────────────────────────────────────
// Task 0.3 G0.5 SEED CATEGORIES 7 ROWS EXACT (ใบสั่งงานล่าสุด 2026-09-08)
// ✅ 7 หมวด EXACT: ฟุตบอล/มวย/สล็อต/หวย/คาสิโน/ไก่ชน/วัวชน
// ✅ YMYL 3 rows: สล็อต/หวย/คาสิโน (ตัดการเงิน/สุขภาพออก)
// ✅ slug boxing(มวย) — NO "กีฬาอื่นๆ" / "other-sports"
// ✅ PURGED ALL 12 OLD: เกม/รถยนต์/บ้าน/ไลฟ์สไตล์/การเงิน/สุขภาพ/บาส/สนุกเกอร์/อาหาร/ท่องเที่ยว/เทคโน/กีฬาอื่นๆ
// ─────────────────────────────────────────────────────────────
const insertMatches = M02.match(/\(\d+,\s*'[^']*',\s*'[^']*',\s*[01],\s*'[^']*',\s*[01],\s*\d+,\s*'[^']*'\)/g) || [];
results.push(check(
  `[G0.5] Categories seed rows = 7 (EXACT ใบสั่งงานล่าสุด 2026-09-08, new cols icon/is_active/sort_order matched)`,
  insertMatches.length === 7,
  `found=${insertMatches.length} pattern=NEW 8-col INSERT (id,name,slug,is_ymyl,icon,is_active,sort_order,description)`,
));
const ymyCount = insertMatches.filter(r => /,\s*1,\s*'[^']*',\s*[01],\s*\d+/.test(r)).length;
results.push(check(
  `[G0.5] Categories is_ymyl=1 count = 3 (สล็อต/หวย/คาสิโน ONLY — ตัดการเงิน/สุขภาพออกตามใบสั่งงานล่าสุด)`,
  ymyCount === 3,
  `found is_ymyl=1 count=${ymyCount}`,
));
const YMYL_NAMES = ['สล็อต','หวย','คาสิโน'];
for (const n of YMYL_NAMES) {
  const hasYmy = new RegExp(`\\(\\d+,\\s*'${n}',\\s*'[^']*',\\s*1,`).test(M02);
  results.push(check(`[G0.5]   YMYL row present "${n}" → is_ymyl=1`, hasYmy, n));
}

// ✅ ใบสั่งงานล่าสุด: General = 4 rows (ฟุตบอล, มวย, ไก่ชน, วัวชน)
const SA_GENERAL4 = ['ฟุตบอล','มวย','ไก่ชน','วัวชน'];
for (const n of SA_GENERAL4) {
  const has = new RegExp(`\\(\\d+,\\s*'${n}',`).test(M02);
  results.push(check(`[G0.5-SA]   General row (7 หมวด) present "${n}"`, has, n));
}
// ✅ PURGE CHECK: ALL 12 old categories MUST ABSENT
//   OLD 4 v1 (เกม/รถยนต์/บ้าน/ไลฟ์สไตล์) + 8 ที่ตัดออกจาก 15 (การเงิน/สุขภาพ/บาสเกตบอล/สนุกเกอร์/อาหาร/ท่องเที่ยว/เทคโนโลยี/กีฬาอื่นๆ)
const OLD_BAD_NAMES = [
  'เกม','รถยนต์','บ้านและที่อยู่อาศัย','ไลฟ์สไตล์',
  'การเงิน','สุขภาพ','บาสเกตบอล','สนุกเกอร์','อาหาร','ท่องเที่ยว','เทคโนโลยี','กีฬาอื่นๆ'
];
let oldStillExists: string[] = [];
for (const n of OLD_BAD_NAMES) {
  if (new RegExp(`\\(\\d+,\\s*'${n}',`).test(M02)) oldStillExists.push(n);
}
results.push(check(
  `[SA 2026-09-08 PURGE] 12 หมวดเก่า ALL REMOVED (เกม/รถยนต์/บ้าน/ไลฟ์สไตล์/การเงิน/สุขภาพ/บาส/สนุกเกอร์/อาหาร/ท่องเที่ยว/เทคโน/กีฬาอื่นๆ)`,
  oldStillExists.length === 0,
  oldStillExists.length ? 'PURGE FAIL still has: ' + oldStillExists.join(',') : 'ALL 12 PURGED ✅',
));
// Slug correctness: มวย slug=boxing (NOT muay-thai)
const muayBoxing = /'มวย',\s*'boxing'/.test(M02);
const muayNotMuayThai = !/'มวย',\s*'muay-thai'/.test(M02);
const noOtherSports = !/'กีฬาอื่นๆ',\s*'other-sports'/.test(M02) && !/'อื่นๆ',/.test(M02);
results.push(check(
  `[SA SLUG] มวย slug=boxing ✓ (NOT muay-thai!) + กีฬาอื่นๆ REMOVED ✓`,
  muayBoxing && muayNotMuayThai && noOtherSports,
  `มวย=boxing:${muayBoxing?'Y':'N'} muay!=muay-thai:${muayNotMuayThai?'Y':'N'} no-other-sports:${noOtherSports?'Y':'N'}`,
));

// ─────────────────────────────────────────────────────────────
// REPORT
// ─────────────────────────────────────────────────────────────
const TOTAL = results.length;
const PASSED = results.filter(r => r.pass).length;
const FAILED = TOTAL - PASSED;
const W = 110;
console.log('\n' + '═'.repeat(W));
console.log(' EEAT Studio V2 · Task 0.2 (Schema) + 0.3 (Seed) Static Verification Report v2 [SA COMPLIANT EDITION 2026-09-08]');
console.log(` Time: ${new Date().toISOString()}`);
console.log(` Checkpoints: ${TABLES_EXPECTED.length} tables · 5 schema fixes · 7 seed SA LINE-BY-LINE checks`);
console.log('═'.repeat(W));
for (const r of results) {
  const sym = r.pass ? '✅' : '❌';
  console.log(`  ${sym}  ${r.pass ? 'PASS' : 'FAIL'} · ${r.label}`);
  if (r.info) console.log(`       └─ ${r.info}`);
}
console.log('─'.repeat(W));
const pct = ((PASSED/TOTAL)*100).toFixed(1);
console.log(`  TOTAL: ${TOTAL} · ✅ PASS: ${PASSED} · ❌ FAIL: ${FAILED}  ·  ${pct}%  (100% = exit)`);
console.log('─'.repeat(W));
if (FAILED === 0) {
  console.log('  🎉 Task 0.2+0.3 PASS 100% · SA LINE-BY-LINE COMPLIANT (5 Non-Compliance Resolved 2026-09-08)');
  console.log('  Ready → 0.4a Auth / 0.4b RBAC / 0.4c Teams / 0.4d Settings / G0.1 Server START');
  console.log('═'.repeat(W) + '\n');
  process.exit(0);
} else {
  console.log(`  ❌ Task 0.2+0.3 FAIL (${FAILED} FAILED) — Fix SQL then re-run verify script`);
  console.log('═'.repeat(W) + '\n');
  process.exit(1);
}
