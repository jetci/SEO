// EEAT Studio V2 · Phase 3B Admin Audit Local Test Suite (≥14 assertions)
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
let passed = 0, failed = 0;
function a(msg, cond, g='?') {
  if (cond) { passed++; console.log('  ✅', String(passed).padStart(2,'0'), '['+g+']', msg); }
  else { failed++; console.error('  ❌ FAIL', '['+g+']', msg); }
}
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
console.log('\n==== Phase3B Admin Audit LOCAL (≥14 assertions) ====\n');

// ----------- Group A: adminRouter 5 procedures exists (5 assertions)
{
  const ad = read('server/routers/admin.ts');
  a('export const adminRouter = router(...) defined', /export\s+(const|default)\s+adminRouter\s*=\s*router\s*\(/.test(ad), 'A');
  a('procedures includes getOverview', /getOverview:\s*protectedProcedure/.test(ad), 'A');
  a('procedures includes getProjectsEEAT', /getProjectsEEAT:\s*protectedProcedure/.test(ad), 'A');
  a('procedures includes getSettingsMasked', /getSettingsMasked:\s*protectedProcedure/.test(ad), 'A');
  a('procedures includes getLlmUsageBars', /getLlmUsageBars:\s*protectedProcedure/.test(ad) && /exportCSV:\s*(protectedProcedure|query)/.test(ad), 'A');
  // exportCSV too (5th)
  a('procedures includes exportCSV (5th procedure)', /exportCSV:\s*protectedProcedure/.test(ad), 'A');
}

// ----------- Group B: RBAC admin-only ALL procedures (3 assertions)
{
  const ad = read('server/routers/admin.ts');
  const guards = ad.match(/role\s*!==\s*['"]admin['"]\s*\)?\s*throw\s+new\s+TRPCError/g) || [];
  a(`≥4 admin-only explicit role guards (got ${guards.length})`, guards.length >= 4, 'B');
  a('ADMIN_ONLY message used in UNAUTHORIZED throws', /ADMIN_ONLY/.test(ad), 'B');
  a('No protectedProcedure bypasses (no publicProcedure used)', !/publicProcedure/.test(ad), 'B');
}

// ----------- Group C: CSV UTF-8 BOM + escape (2 assertions)
{
  const ad = read('server/routers/admin.ts');
  a('utf8Bom prepends \\uFEFF (0xFEFF) FIRST char before CSV text', /utf8Bom\s*=\s*\(?[^)]*\)\s*=>\s*['"`]\\uFEFF['"`]\s*\+\s*String\(/.test(ad) || /function\s+utf8Bom[\s\S]{0,120}\\uFEFF/.test(ad), 'C');
  a('csvEscape handles double-quote wrap + quote escapes', /csvEscape[\s\S]{0,200}replace\(\s*\/\s*["']\s*\/g,\s*['"`]""['"`]\)/.test(ad) || /csvEscape[\s\S]{0,200}s\.replace\(\s*\/["']\/g\s*,\s*'""'\)/.test(ad), 'C');
}

// ----------- Group D: server/app.ts wires (3 assertions)
{
  const ap = read('server/app.ts');
  a('import adminRouter from routers/admin', /import\s*\{\s*adminRouter\s*\}\s*from\s*['"](\.\/routers\/admin|\.\.\/[^'"]*admin['"])/.test(ap), 'D');
  a('appRouter merge includes admin: adminRouter entry', /admin:\s*adminRouter,?/.test(ap), 'D');
  a('/api/health routers string array includes \'admin\'', /routers:\s*\[([^\]]*'admin'[^\]]*)\]/.test(ap), 'D');
}

// ----------- Group E: AdminAuditPage frontend wires (3 assertions, removed 403 banner)
{
  const pg = read('client/src/pages/AdminAuditPage.tsx');
  const qCount = (pg.match(/trpc\.admin\.(getOverview|getProjectsEEAT|getSettingsMasked|getLlmUsageBars|exportCSV)\.useQuery/g) || []).length;
  a(`AdminAuditPage uses ≥4 trpc.admin.useQuery (got ${qCount})`, qCount >= 4, 'E');
  a('Export CSV creates new Blob text/csv;charset=utf-8 for download', /new\s+Blob\(\s*\[[^\]]*\],\s*\{\s*type:\s*['"`]text\/csv;charset=utf-8['"`]\s*\}/.test(pg), 'E');
  a('OLD Serper 403 red warning banner REMOVED from page (no regenerate serper.dev paste chat)', !/regenerate key ใหม่จาก serper\.dev/i.test(pg) && !/Paste ลงช่องแชท/i.test(pg) && !/Serper SERP key 403 Unauthorized —/i.test(pg), 'E');
}

console.log(`\n==== Phase3B Admin Audit LOCAL TOTAL: ${passed} PASS / ${failed} FAIL / ${passed+failed} ====`);
process.exit(failed === 0 ? 0 : 1);
