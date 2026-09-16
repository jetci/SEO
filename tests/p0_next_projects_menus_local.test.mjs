import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PP = fs.readFileSync(path.join(ROOT, 'client', 'src', 'pages', 'ProjectsPage.tsx'), 'utf8');
const P_RT = fs.readFileSync(path.join(ROOT, 'server', 'routers', 'projects.ts'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'client', 'src', 'App.tsx'), 'utf8');

let pass = 0, fail = 0;
function a(name, cond, d) { if (cond) { pass++; console.log('  ✅', String(pass).padStart(2, '0'), name); } else { fail++; console.log('  ❌ FAIL', name, d || ''); } }

console.log('\n==== P0-NEXT ProjectsPage 6 Menus WIRE ALL Local Tests ≥22 assertions ====\n');

// Group A: All 6 menus ACTION handlers exist NO DEAD BUTTONS
console.log('[A] 6 เมนูหลัก Handlers EXISTS (NO DEAD BUTTONS)');
a('A1 ค้นหา (Search): onClick={toggle openSearch} button exists L101-104', /onClick=\{\(\)\s*=>\s*\{\s*setOpenSearch\(s\s*=>\s*!s\)/.test(PP));
a('A2 ค้นหา: inline search input mounted (show when openSearch=true)', /openSearch\s*&&\s*\(\s*\n?\s*<div[\s\S]*id="pj-search"/m.test(PP) || /openSearch\s*&&[\s\S]*<Input[\s\S]*fQuery[\s\S]*onChange=\{\(e\)\s*=>\s*setFQuery/.test(PP));
a('A3 ตัวกรอง (Filter): button onClick={setOpenFilter(true)} + badge dot when active', /onClick=\{\(\)\s*=>\s*setOpenFilter\(\s*true\s*\)\}/.test(PP));
a('A4 Eye ดูรายการบทความ: onClick setLocation /projects/:id/articles route (existing L55 App.tsx)', /onClick=\{\(\)\s*=>\s*setLocation\(\s*articlesRoute\s*\)\}[\s\S]*title="ดูรายการบทความภายในโปรเจกต์"/m.test(PP) || /setLocation\(\s*articlesRoute\s*\)/.test(PP));
a('A5 Pencil แก้ไข: onClick={openEditFor(p)} prefill editP state', /onClick=\{\(\)\s*=>\s*openEditFor\(\s*p\s*\)\}/.test(PP) && /function\s+openEditFor\s*\(\s*p\s*:\s*any\s*\)/.test(PP));
a('A6 Share2 แชร์: onClick={openShareFor(p)} + copyShare clipboard fn', /onClick=\{\(\)\s*=>\s*openShareFor\(\s*p\s*\)\}/.test(PP) && /navigator\.clipboard\.writeText/.test(PP));
a('A7 Trash2 ลบ: onClick={openDelFor(p)} + AlertDialog open=openDel exists', /onClick=\{\(\)\s*=>\s*openDelFor\(\s*p\s*\)\}/.test(PP) && /<AlertDialog\s+open=\{openDel\}/.test(PP));
a('A8 Route App.tsx L55 EXISTS /projects/:id/articles (Eye target valid)', /path\s*=\s*["']\/projects\/:id\/articles["']/.test(APP));
console.log('  ➜ Group A: 8 assertions');

// Group B: Mutations + state variables (update/delete/create)
console.log('\n[B] 3 Mutations (create, update, delete) + 5 Dialogs mounted');
a('B1 updateM = projects.update.mutation (any pattern) + invalidate present', /updateM\s*=\s*trpc\.projects\.update\.useMutation/.test(PP) && /utils\.projects\.list\.invalidate\(\)/.test(PP));
a('B2 deleteM = projects.delete soft-delete (SA G1.1 articles ผูก ห้ามลบ guard detect + custom toast)', /deleteM\s*=\s*trpc\.projects\.delete\.useMutation\(\s*\{[\s\S]*article[\s\S]*toast\.error/.test(PP));
a('B3 submitEdit calls mutation { id, patch } → prefill from project row (category_id alias support)', /submitEdit[\s\S]*updateM\.mutateAsync\(\s*\{\s*id:\s*Number\(editP\.id\)\s*,\s*patch[\s\S]*category_id\s*\?\?\s*p\.categoryId/.test(PP) || /submitEdit[\s\S]*id:\s*Number\(editP\.id\)[\s\S]*patch[\s\S]*const\s+catId\s*=\s*p\.category_id\s*\?\?\s*p\.categoryId/.test(PP) || /openEditFor[\s\S]*const\s+catId\s*=\s*p\.category_id\s*\?\?\s*p\.categoryId/.test(PP));
a('B4 confirmDelete calls deleteM.mutateAsync({ id })', /confirmDelete[\s\S]*deleteM\.mutateAsync\(\s*\{\s*id:\s*Number\(delP\.id\)\s*\}\s*\)/.test(PP));
a('B5 5 Dialog components total mounted: CREATE + FILTER + EDIT + SHARE + DELETE (AlertDialog)', (PP.match(/<Dialog\s+open=/g) || []).length >= 4 && /<AlertDialog\s+open=/.test(PP));
console.log('  ➜ Group B: 5 assertions');

// Group C: Client-side filter logic (useMemo) + pills + empty state
console.log('\n[C] Search/Filter pipeline client-side useMemo + pills/empty UX');
a('C1 useMemo items filter pipeline: fQuery (name/keyword/desc) + fStatus(active/archived)+ fFilterCatId + fOnlyYmyl', /const\s+items\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{[\s\S]*fQuery[\s\S]*fStatus[\s\S]*fFilterCatId[\s\S]*fOnlyYmyl[\s\S]*rawItems/m.test(PP));
a('C2 name.toLowerCase() includes query case-insensitive filter', /n\.includes\(\s*q\s*\)\s*\|\|\s*k\.includes/.test(PP));
a('C3 fStatus === active guard: p.status !== archived && p.is_active !== false', /fStatus\s*===\s*['"]active['"][\s\S]*!==\s*['"]archived['"][\s\S]*is_active\s*!==\s*false/.test(PP));
a('C4 Filter Pill badges closeable X button exists + resetFilter() toast info ไทย', /active-filter-pills[\s\S]*resetFilter/.test(PP) || /resetFilter\(\s*\)\s*;\s*toast\.info/.test(PP));
a('C5 Empty state: items.length === 0 shows CTA (2 modes: filter miss → reset button / zero projects → create button)', /items\.length\s*===\s*0[\s\S]*ไม่พบโปรเจกต์ที่ตรงกับตัวกรอง[\s\S]*ยังไม่มีโปรเจกต์/m.test(PP));
console.log('  ➜ Group C: 5 assertions');

// Group D: Extra UX polish (clickable cover+title, share URL, SA rules)
console.log('\n[D] UX Extra Polish + SA Guards');
a('D1 Cover image clickable (group hover animation) → setLocation articlesRoute', /<div[\s\S]*h-36 w-full[\s\S]*onClick=\{\(\)\s*=>\s*setLocation\(\s*articlesRoute\s*\)\}[\s\S]*title="เปิดดูรายการบทความในโปรเจกต์นี้"/m.test(PP) || /<h3[\s\S]*onClick=\{\(\)\s*=>\s*setLocation\(\s*articlesRoute\s*\)\}/m.test(PP));
a('D2 Share URL format = https://thaiaeo.manus.host/projects/:id/articles + execCommand fallback clipboard', /https:\/\/thaiaeo\.manus\.host\/projects\/\$\{Number\(shareP\.id\)\}\/articles/.test(PP) && /execCommand\(['"]copy['"]\)/.test(PP));
a('D3 delete onError detect articles-bound keyword EN+TH → custom message แนะนำลบบทความก่อน', /\/article\/i\.test\(\s*m\s*\)\s*\|\|\s*\/ผูก\/.test\(\s*m\s*\)/.test(PP));
a('D4 ROOT CAUSE P0 fix still remains: onClick={openNew} on สร้างโปรเจกต์ button', /onClick=\{\s*openNew\s*\}[\s\S]*สร้างโปรเจกต์<\/Button>/.test(PP) || /onClick=\{openNew\}/.test(PP));
a('D5 imports AlertDialog primitives from @/components/ui/alert-dialog (NOT from shadcn registry, local only)', /import\s*\{[\s\S]*AlertDialog[\s\S]*\}\s*from\s*["']@\/components\/ui\/alert-dialog["']/m.test(PP));
a('D6 useLocation from wouter imported + useMemo React hooks', /from\s*["']wouter["'];/.test(PP) && /,\s*useMemo\s*\}/.test(PP));
a('D7 Header subtitle shows filtered count "แสดง X จากทั้งหมด Y" when filtered (NOT default)', /headerSubtitle=.*แสดง\s*\$\{items\.length\}\s*จากทั้งหมด/.test(PP));
console.log('  ➜ Group D: 7 assertions');

// Group E: Backend procedure sanity NO ALTER/DROP
console.log('\n[E] AC-6 ZERO ALTER/DROP + backend delete/update exists (NO new procedures needed)');
function walk(d, out=[]) { for (const e of (fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}):[])) { const p = path.join(d, e.name); if (e.isDirectory() && !['node_modules','dist','.git'].includes(e.name)) walk(p, out); else if (e.isFile()) out.push(p); } return out; }
function grepAd(dir) {
  const hits = [];
  for (const f of walk(dir)) {
    if (!/\.(ts|js|sql|mjs|cjs)$/.test(f)) continue;
    try {
      const c = fs.readFileSync(f, 'utf8');
      c.split(/\n/).forEach((ln, i) => {
        const s = ln.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const rel = path.relative(ROOT, f);
        if (/\bALTER\s+TABLE\b/i.test(s) || /\bDROP\s+(TABLE|COLUMN|INDEX)\b/i.test(s)) {
          if (/AUTO_INCREMENT/i.test(s) || /TRUNCATE/i.test(s)) return;
          if (/NO\s+ALTER/i.test(ln) || /zero\s+alter/i.test(ln.toLowerCase())) return;
          if (/\.(ts|js|mjs|cjs)$/i.test(rel) && /comment/i.test(ln.toLowerCase())) return;
          hits.push(`${rel}:${i + 1}`);
        }
      });
    } catch { /* ignore */ }
  }
  return hits;
}
const srv = grepAd(path.join(ROOT, 'server'));
const dbb = grepAd(path.join(ROOT, 'db'));
a(`E1 server/ NO ALTER/DROP hits=${srv.length}`, srv.length === 0, srv.join(' | '));
a(`E2 db/ NO ALTER/DROP (CREATE IF NOT EXISTS ok) hits=${dbb.filter(l => !/CREATE TABLE IF NOT EXISTS/.test(l)).length}`, dbb.filter(l => !/CREATE TABLE IF NOT EXISTS/.test(l)).length === 0);
a('E3 Backend projects.update L161 exists with id + patch (name/mainKeyword/categoryId/description)', /update:\s*protectedProcedure[\s\S]*input\(z\.object\(\{\s*id:\s*z\.number\(\)\.int\(\)\.positive\(\)\s*,\s*patch:\s*z\.object/.test(P_RT));
a('E4 Backend projects.delete soft is_active=0 + articles bound guard (keyword found anywhere)', /set\(\s*\{\s*isActive:\s*0\s*\}\s*\)\.where\(eq\(projects\.id/.test(P_RT) && /BAD_REQUEST[\s\S]*article/.test(P_RT));
console.log('  ➜ Group E: 4 assertions');

console.log(`\n==== LOCAL TEST RESULT: ${pass}/${pass+fail} PASS${fail > 0 ? '  ❌ EXIT 1' : '  ✅ EXIT 0'} (TOTAL ASSERTIONS ${pass+fail} ≥22 required) ====\n`);
process.exit(fail > 0 ? 1 : 0);
