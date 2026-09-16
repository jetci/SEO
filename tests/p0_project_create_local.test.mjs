import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PP = fs.readFileSync(path.join(ROOT, 'client', 'src', 'pages', 'ProjectsPage.tsx'), 'utf8');
const P_RT = fs.readFileSync(path.join(ROOT, 'server', 'routers', 'projects.ts'), 'utf8');
const C_RT = fs.readFileSync(path.join(ROOT, 'server', 'routers', 'categories.ts'), 'utf8');
const T_RT = fs.readFileSync(path.join(ROOT, 'server', 'routers', 'teams.ts'), 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { console.log('  ✅', name); pass++; }
  else { console.log('  ❌ FAIL', name, detail || ''); fail++; }
}

console.log('\n==== P0 Bug Fix: ปุ่ม สร้างโปรเจกต์ + Dialog Form Local Tests ====\n');

// ========= GROUP A: ProjectsPage UI Wire (onClick + Dialog) =========
console.log('[A] ปุ่ม + Dialog WIRE existence');
assert('A1 ปุ่ม สร้างโปรเจกต์ มี onClick={openNew} handler (ROOT CAUSE FIX)', /<Button[^>]*className="[^"]*!bg-\[#b45309\][^"]*"[^>]*onClick=\{openNew\}/.test(PP));
assert('A2 import { Dialog, DialogContent, ... } primitives mounted', /import\s*\{\s*Dialog[^}]*\}\s*from\s*["']@\/components\/ui\/dialog["']/.test(PP));
assert('A3 Dialog component mounted contains title สร้างโปรเจกต์ใหม่ (THAI)', /DialogTitle[^>]*>สร้างโปรเจกต์ใหม่</.test(PP));
assert('A4 Label ชื่อโปรเจกต์ required * exists (form field)', /Label[^>]*>ชื่อโปรเจกต์\s*<span[^>]*>\*<\/span>\s*<\/Label>/.test(PP));
assert('A5 Select หมวดหมู่ + categories.map render options from cats.data', /SelectContent>[\s\S]*catOptions\.map\(/m.test(PP) || /SelectContent>[\s\S]*\(cats\.data\s*\|\|\s*\[\)\) as any\[\]\.map/m.test(PP));
assert('A6 Textarea คำอธิบายโปรเจกต์ maxLength 10000', /Textarea[\s\S]*id="pj-desc"[\s\S]*maxLength=\{10000\}/m.test(PP));

// ========= GROUP B: State + Mutation + teamId auto resolve =========
console.log('\n[B] tRPC Mutation + teamId auto resolve');
assert('B1 useState openCreate declared for dialog toggle', /const\s+\[openCreate\s*,\s*setOpenCreate\]\s*=\s*useState\(\s*false\s*\)/.test(PP));
assert('B2 trpc.teams.list useQuery to auto resolve firstTeamId', /trpc\.teams\.list\.useQuery/.test(PP) && /firstTeamId\s*=/.test(PP));
assert('B3 trpc.categories.list useQuery flat array (no nested wrapper)', /trpc\.categories\.list\.useQuery/.test(PP));
assert('B4 trpc.projects.create.useMutation declared with onSuccess/onError', /trpc\.projects\.create\.useMutation\(\s*\{[\s\S]*onSuccess[\s\S]*onError[\s\S]*\}\s*\)/m.test(PP));
assert('B5 submitCreate passes REQUIRED teamId (INT positive) to mutation', /createM\.mutateAsync\(\s*\{[\s\S]*teamId:\s*firstTeamId[\s\S]*\}/m.test(PP));
assert('B6 name.trim() validation BEFORE submit prevent Zod BAD_REQUEST', /const\s+name\s*=\s*fName\.trim\(\)\s*;\s*if\s*\(\s*!name\s*\)\s*\{\s*toast\.error\(\s*['"]กรุณากรอกชื่อโปรเจกต์['"]/.test(PP));
assert('B7 onSuccess toast.success ไทย + utils.projects.list.invalidate() refresh KPI', /toast\.success\(\s*`✅ สร้างโปรเจกต์สำเร็จ/.test(PP) && /utils\.projects\.list\.invalidate\(\)/.test(PP));
assert('B8 onError toast.error ไทย slice 120 char', /toast\.error\(\s*`สร้างโปรเจกต์ล้มเหลว: \$\{String\(err\?\.message/.test(PP));
assert('B9 Submit button disabled when loading OR name empty guard double submit', /<Button[^>]*type="submit"[^>]*disabled=\{createM\.isLoading\s*\|\|\s*!fName\.trim\(\)\}/.test(PP));
assert('B10 Loader2 spin animation when createM.isLoading', /Loader2[^}]*animate-spin/.test(PP));
assert('B11 Dialog onOpenChange LOCKED when createM.isLoading (prevent mid-submit close)', /onOpenChange=\{\(v\)\s*=>\s*\{\s*if\s*\(\s*!createM\.isLoading\s*\)/.test(PP));

// ========= GROUP C: Backend Zod + ownerId NOT NULL + Drizzle snake map =========
console.log('\n[C] Backend projects.create sanity (NO CHANGES NEEDED verify)');
assert('C1 projects.create Zod schema teamId INT POSITIVE REQUIRED', /teamId:\s*z\.number\(\)\.int\(\)\.positive\(\)/.test(P_RT));
assert('C2 projects.create Zod name min+max REQUIRED (literal or PROJECT_NAME const)', /name:\s*z\.string\(\)\.min\(\s*(1|PROJECT_NAME_MIN)\s*\)\.max\(\s*(255|PROJECT_NAME_MAX)\s*\)/.test(P_RT));
assert('C3 insert values ownerId = userId (NOT NULL satisfy drizzle)', /ownerId:\s*userId/.test(P_RT));
assert('C4 isActive = 1 set on create project default', /isActive:\s*1/.test(P_RT));
assert('C5 categories.list return flat array rows as any[] (NOT wrapped)', /return\s+rows\s+as\s+any\[\]/.test(C_RT));
assert('C6 teams.list wrapped { ok: true, teams: withPerm } shape (matches frontend .teams?.[0]?.id)', /return\s*\{\s*ok:\s*true[\s\S]*teams:\s*(rows|withPerm)[\s\S]*\}/m.test(T_RT));

// ========= GROUP D: AC-6 NO ALTER/DROP structural FOREVER =========
console.log('\n[D] AC-6 ZERO ALTER/DROP structural check after fix');
function walk(dir, out=[]) {
  for (const e of (fs.existsSync(dir) ? fs.readdirSync(dir,{withFileTypes:true}) : [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !['node_modules','dist','.git'].includes(e.name)) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
function grepAlterDrop(dir) {
  let hits = [];
  for (const f of walk(dir)) {
    if (!/\.(ts|js|sql|mjs|cjs)$/.test(f)) continue;
    try {
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split(/\n/);
      lines.forEach((ln, i) => {
        const stripped = ln.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const rel = path.relative(ROOT,f);
        if (/\bALTER\s+TABLE\b/i.test(stripped) || /\bDROP\s+(TABLE|COLUMN|INDEX)\b/i.test(stripped)) {
          if (/AUTO_INCREMENT/i.test(stripped) || /TRUNCATE/i.test(stripped)) return;
          if (/NO\s+ALTER/i.test(ln) || /zero\s+alter/i.test(ln.toLowerCase())) return;
          if (/\.(ts|js|mjs|cjs)$/i.test(rel) && /comment/i.test(ln.toLowerCase())) return;
          hits.push(`${rel}:${i+1}`);
        }
      });
    } catch {}
  }
  return hits;
}
const serverHits = grepAlterDrop(path.join(ROOT,'server'));
const dbHits = grepAlterDrop(path.join(ROOT,'db'));
assert(`D1 server/ NO ALTER/DROP hits=${serverHits.length}`, serverHits.length === 0, serverHits.join(' | '));
assert(`D2 db/ NO ALTER/DROP (allow CREATE IF NOT EXISTS) hits=${dbHits.filter(l=>!/CREATE TABLE IF NOT EXISTS/.test(l)).length}`, dbHits.filter(l=>!/CREATE TABLE IF NOT EXISTS/.test(l)).length === 0, dbHits.join(' | '));

// ========= GROUP E: Form labels 100% THAI (95% Thai rule) =========
console.log('\n[E] UX Text THAI majority validation');
assert('E1 Dialog title สร้างโปรเจกต์ใหม่', /สร้างโปรเจกต์ใหม่/.test(PP));
assert('E2 Label หมวดหมู่ + Keyword หลัก + คำอธิบายโปรเจกต์', /หมวดหมู่/.test(PP) && /Keyword หลัก/.test(PP) && /คำอธิบายโปรเจกต์/.test(PP));
assert('E3 ปุ่ม cancel=ยกเลิก submit=สร้างโปรเจกต์ / loading=กำลังสร้าง...', /ยกเลิก<\/Button>/.test(PP) && /\{createM\.isLoading\s*\?\s*'กำลังสร้าง\.\.\.'\s*:\s*'สร้างโปรเจกต์'\}/.test(PP));
assert('E4 Toast error ไม่พบทีม toast ไทย', /ไม่พบทีมที่คุณเป็นสมาชิก/.test(PP));

console.log(`\n==== LOCAL TEST RESULT: ${pass}/${pass+fail} PASS${fail>0?'  ❌ EXIT 1':'  ✅ EXIT 0'} ====\n`);
process.exit(fail > 0 ? 1 : 0);
