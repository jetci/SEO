import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const file = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;

function assert(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ PASS [${String(pass).padStart(2,'0')}] ${name}`); }
  else { fail++; console.log(`  ❌ FAIL [#?] ${name}${detail ? ' — '+detail : ''}`); }
}

console.log('============================================================');
console.log(' Phase 2K · Seed Snake_case Fix · LOCAL ASSERTION SUITE');
console.log(' Target: deploy_run_now.mjs R6 + 0001 SQL + 0002 seed');
console.log('============================================================\n');

const deploy = file('scripts/deploy_run_now.mjs');
const sql0001 = file('db/migrations/0001_init_8_tables.sql');
const sql0002 = file('db/migrations/0002_seed_categories.sql');

console.log('[Group A] deploy_run_now.mjs R6 Seed SQL snake_case columns (6 assertions)');
// A1 users: google_open_id (NOT googleOpenId)
assert('A1 users INSERT: google_open_id snake column',
  deploy.includes('INSERT IGNORE INTO users (id, google_open_id, email, name, role, avatar_url, is_active, created_at)'));
// A2 users: NO defaultTeamId (column does NOT exist in 0001)
assert('A2 users: NO defaultTeamId in INSERT (not in SQL schema)',
  !deploy.includes('defaultTeamId'));
// A3 teams: owner_id snake (NOT ownerId)
assert('A3 teams INSERT: owner_id snake column',
  deploy.includes('INSERT IGNORE INTO teams (id, name, owner_id, is_active, created_at)'));
// A4 team_members: permission (NOT role) + snake team_id/user_id
assert('A4 team_members INSERT: permission enum + snake team_id/user_id',
  deploy.includes("INSERT IGNORE INTO team_members (team_id, user_id, permission, joined_at, created_at)"));
// A5 team_members: permission enum value 'owner'
assert('A5 team_members VALUE: permission=\'owner\' (NOT role owner)',
  deploy.includes("(90001, 99001, 'owner', NOW(), NOW())"));
// A6 projects: snake category_id, main_keyword, team_id, owner_id
assert('A6 projects INSERT: all snake columns (category_id/main_keyword/team_id/owner_id)',
  deploy.includes('INSERT IGNORE INTO projects (id, team_id, owner_id, category_id, name, main_keyword, description, is_active, created_at)'));

console.log('\n[Group B] 0001_init_8_tables.sql REAL column mapping (5 assertions)');
// B1 users NO defaultTeamId column
assert('B1 0001 users: NO `defaultTeamId` or `default_team_id` column',
  !/`defaultTeamId`|`default_team_id`/.test(sql0001));
// B2 users google_open_id correct
assert('B2 0001 users: `google_open_id` VARCHAR(255) exists',
  /`google_open_id`\s+VARCHAR\(255\)\s+NOT\s+NULL/.test(sql0001));
// B3 team_members `permission` ENUM('owner','admin','member')
assert('B3 0001 team_members: `permission` enum (NOT role col)',
  /`permission`\s+ENUM\('owner','admin','member'\)\s+NOT\s+NULL/.test(sql0001));
// B4 projects `main_keyword` VARCHAR(255)
assert('B4 0001 projects: `main_keyword` column exists',
  /`main_keyword`\s+VARCHAR\(255\)\s+NULL/.test(sql0001));
// B5 projects `category_id` (NOT niche_category_id)
assert('B5 0001 projects: `category_id` INT (renamed from niche_category_id)',
  /`category_id`\s+INT\s+UNSIGNED\s+NULL/.test(sql0001));

console.log('\n[Group C] 0002_seed_categories.sql + R6 projects count (4 assertions)');
// C1 0002 EXACT 7 categories id 1-7
assert('C1 0002 categories seed: EXACT 7 INSERT rows',
  (sql0002.match(/\(\d+,\s*'/g) || []).length === 7);
// C2 0002 YMYL rows=3 (is_ymyl=1 at ids 3,4,5 = สล็อต/หวย/คาสิโน):
// col4=is_ymyl=1 pattern: `(3,` ... , 1,` / `(4,` ... , 1,` / `(5,` ... , 1,` — id3-5 specific each followed by , 1, after name/slug cols
const y3 = /\(3,\s*'[^']+',\s*'[^']+',\s*1,/.test(sql0002); // สล็อต id3 ymyl=1
const y4 = /\(4,\s*'[^']+',\s*'[^']+',\s*1,/.test(sql0002); // หวย id4 ymyl=1
const y5 = /\(5,\s*'[^']+',\s*'[^']+',\s*1,/.test(sql0002); // คาสิโน id5 ymyl=1
const yGen0 = /\(1,\s*'[^']+',\s*'[^']+',\s*0,/.test(sql0002); // ฟุตบอล id1 ymyl=0
assert('C2 0002 categories: YMYL=3 rows (id3/4/5=1), id1/2/6/7=0)',
  y3 && y4 && y5 && yGen0, `y3=${y3} y4=${y4} y5=${y5} yGen0=${yGen0}`);
// C3 deploy R6 projects seed EXACT 7 rows
assert('C3 deploy R6 projects: EXACT 7 INSERT rows (101-107)',
  (deploy.match(/\(10[1-7],\s*90001,\s*99001,\s*\d/g) || []).length === 7);
// C4 deploy R6 projects start cat=1 end cat=7 team=90001 all
const projStartOK = /\(101,\s*90001,\s*99001,\s*1,/.test(deploy);
const projEndOK = /\(107,\s*90001,\s*99001,\s*7,/.test(deploy);
assert('C4 deploy R6 projects: ALL team_id=90001, category_id in (1..7)',
  projStartOK && projEndOK, `start=${projStartOK} end=${projEndOK}`);

console.log('\n[Group D] NO camelCase col leak in R6 heredoc (1 extra guard assertion)');
// D: All 11 forbidden camelCase patterns absent in R6 SQLEND block
const R6_BLOCK = deploy.match(/SQLEND\n([\s\S]*?)\nSQLEND/)?.[1] || '';
const forbidden = ['googleOpenId','defaultTeamId','avatarUrl','isActive','createdAt','updatedAt',
                   'ownerId','teamId','userId','categoryId','mainKeyword'];
const leaks = forbidden.filter(f => R6_BLOCK.includes(f));
assert('D R6 SQLEND block: ZERO camelCase column leaks (11 patterns checked)',
  leaks.length === 0, leaks.length ? 'LEAKS: ' + leaks.join(', ') : '');

console.log('\n============================================================');
console.log(` RESULT: ${pass} PASS / ${pass+fail} TOTAL` + (fail === 0 ? ' ✅ EXIT 0' : ` ❌ ${fail} FAIL → exit 1`));
console.log('============================================================');
process.exit(fail === 0 ? 0 : 1);
