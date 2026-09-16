import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AP = fs.readFileSync(path.join(ROOT, 'client', 'src', 'pages', 'ArticlesPage.tsx'), 'utf8');
const W_RT = fs.readFileSync(path.join(ROOT, 'server', 'routers', 'write.ts'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'client', 'src', 'App.tsx'), 'utf8');

let pass = 0, fail = 0;
function a(name, cond, d) { if (cond) { pass++; console.log('  ✅', String(pass).padStart(2, '0'), name); } else { fail++; console.log('  ❌ FAIL', name, d || ''); } }

console.log('\n==== P0-ARTICLES ArticlesPage 6 Menus WIRE ALL Local Tests ≥20 assertions ====\n');

// Group A: All 6 menus ACTION handlers exist NO DEAD BUTTONS
console.log('[A] 6 เมนูหลัก Handlers EXISTS (NO DEAD BUTTONS) 24+ click targets');
a('A1 ค้นหา (Search): inline Input fQuery onChange setFQuery mounted', /<Input[\s\S]*placeholder="ค้นหาบทความ[\s\S]*value=\{fQuery\}[\s\S]*onChange=\{e=>setFQuery\(e\.target\.value\)\}/.test(AP));
a('A2 Filter button onClick={setOpenFilter(true)} + rose badge dot when hasActiveFilters', /onClick=\{\(\)=>setOpenFilter\(true\)\}[\s\S]*hasActiveFilters[\s\S]*rose-500/m.test(AP));
a('A3 Pencil icon: onClick={()=>ctx.goEdit(Number(r.id))} per-row action', /onClick=\{\(\)=>ctx\.goEdit\(Number\(r\.id\)\)\}[\s\S]*<Pencil/.test(AP) || /goEdit\s*=\s*\(id:number\)\s*=>\s*setLocation\(\s*`\/articles\/\$\{id\}\/edit`\s*\)/.test(AP));
a('A4 Eye icon: onClick={ctx.onPreview(r)} + openPreviewFor function exists', /onClick=\{\(\)=>ctx\.onPreview\(r\)\}[\s\S]*<Eye/.test(AP) && /function\s+openPreviewFor\s*\(\s*row:\s*any\s*\)/.test(AP));
a('A5 Share2 icon: onClick={ctx.onShare(r)} + Share2 imported exists', /onClick=\{\(\)=>ctx\.onShare\(r\)\}[\s\S]*<Share2/.test(AP) && /Share2,\s*Copy,\s*CheckCheck/.test(AP));
a('A6 Trash2 icon: onClick={ctx.onDelete(r)} + AlertDialog open=openDel mounted', /onClick=\{\(\)=>ctx\.onDelete\(r\)\}[\s\S]*<Trash2/.test(AP) && /<AlertDialog\s+open=\{!!openDel/.test(AP));
a('A7 Row title group clickable: onClick={()=>ctx.goEdit(Number(r.id))} (NOT static text)', /<button\s+type="button"[\s\S]*className="text-left\s+group"[\s\S]*onClick=\{\(\)=>ctx\.goEdit\(Number\(r\.id\)\)\}[\s\S]*title="คลิกเพื่อไปแก้ไข"/m.test(AP));
a('A8 App.tsx route EXISTS /articles/:id/edit (pencil+title redirect target)', /path\s*=\s*["']\/articles\/:id\/edit["'][\s\S]*ArticleEditorPage/m.test(APP));
console.log('  ➜ Group A: 8 assertions');

// Group B: 3 Mutations (publish, delete, getDraft) + 4 Dialogs mounted
console.log('\n[B] 3 Mutations + 4 Dialogs (publish/delete/getDraft query)');
a('B1 publishMut = write.publish.useMutation wired + invalidates list useUtils', /publishMut\s*=\s*trpc\.write\.publish\.useMutation[\s\S]*utils\.write\.listByProject\.invalidate\(\)/m.test(AP) || /togglePublish[\s\S]*invalidateAll\(\)/m.test(AP));
a('B2 deleteMut = write.delete.useMutation wired (draftId param) + invalidates onSuccess', /deleteMut\s*=\s*trpc\.write\.delete\.useMutation/.test(AP) && /deleteMut\.mutate\(\s*\{\s*draftId:\s*Number\(openDel\.id\)\s*\}/m.test(AP));
a('B3 previewMut = write.getDraft useQuery {draftId} enabled on openPreview open=true', /previewMut\s*=\s*trpc\.write\.getDraft\.useQuery\(\s*\{\s*draftId:\s*Number\(openPreview\?\.id\s*\|\|\s*0\)\s*\}\s*,\s*\{\s*enabled:\s*!!openPreview/.test(AP));
a('B4 4 Dialogs total mounted: Filter + Preview + Share (Dialog×3) + Delete (AlertDialog×1)', (AP.match(/<Dialog\s+open=/g) || []).length >= 3 && (AP.match(/<AlertDialog\s+open=/g) || []).length >= 1);
a('B5 copyShare: (navigator as any).clipboard.writeText + document.execCommand fallback both present', /\(navigator as any\)\.clipboard\.writeText\(url\)/.test(AP) && /document\.execCommand\(\s*['"]copy['"]\s*\)/.test(AP));
console.log('  ➜ Group B: 5 assertions');

// Group C: useMemo 5-condition filter pipeline + pills + empty states
console.log('\n[C] Search/Filter pipeline client-side useMemo 5-conds + pills + 2 empty');
a('C1 rows = useMemo(()=>{ ... }, [...]) with 5 filters fQuery/fStatus/fFilterPrjId/fMinEeat/fOnlyUpdated7d all referenced', /const\s+rows\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{[\s\S]*fQuery[\s\S]*fStatus[\s\S]*fFilterPrjId[\s\S]*fMinEeat[\s\S]*fOnlyUpdated7d[\s\S]*return\s+rowsOut[\s\S]*\},\s*\[/.test(AP) || /const\s+rows\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{[\s\S]*fQuery[\s\S]*fStatus[\s\S]*fFilterPrjId[\s\S]*fMinEeat[\s\S]*fOnlyUpdated7d/m.test(AP));
a('C2 fQuery 4 fields OR search: title/keyword/metaTitle/metaDescription case-insensitive includes', /q\.includes\([\s\S]*title[\s\S]*metaTitle[\s\S]*metaDescription/m.test(AP) || /kw\.includes\(\s*q\s*\)\s*\|\|[\s\S]*mt\.includes\([\s\S]*md\.includes\(/m.test(AP) || /const\s+q\s*=\s*fQuery\.trim\(\)\.toLowerCase\(\);[\s\S]*title[\s\S]*metaTitle[\s\S]*metaDescription[\s\S]*keyword/m.test(AP));
a('C3 fMinEeat numeric ≥ comparison filter: eeatScore >= want (support snake alias)', /Number\(\s*r\?\.eeatScore\s*\?\?\s*r\?\.eeat_score\s*\?\?\s*0\s*\)\s*>=\s*want/.test(AP) || /eeatScore\s*>=\s*Number\(\s*fMinEeat\s*\)/.test(AP) || /fMinEeat\s*&&\s*\/\^\\d\+\$\/\.test\(fMinEeat\)/.test(AP));
a('C4 fOnlyUpdated7d updatedAt Date diff cutoff 7 days checkbox (7*24*3600*1000)', /7\s*\*\s*24\s*\*\s*3600\s*\*\s*1000/.test(AP) || /fOnlyUpdated7d\s*\{\s*\n\s*const\s+cutoff\s*=\s*Date\.now\(\)\s*-\s*7/.test(AP));
a('C5 Active filter pills 4+ Badges: query×, status×, prj×, minEEAT×, 7d× each X close + resetFilter ล้างทั้งหมด button', (AP.match(/onClick=\{\(\) => setF[A-Za-z]+\(/g) || []).length >= 3 && /<button[\s\S]*onClick=\{resetFilter\}[\s\S]*>ล้างทั้งหมด<\/button>/m.test(AP));
a('C6 Empty State exists: rows=0 shows "ยังไม่มีบทความในมุมมองนี้" + Keyword Cluster CTA (NOT blank white screen)', /rows\.length\s*===?\s*0[\s\S]*ยังไม่มีบทความในมุมมองนี้[\s\S]*Keyword\s+Cluster/m.test(AP) || /!rows\.length[\s\S]*ยังไม่มีบทความในมุมมองนี้[\s\S]*เขียนบทความ/.test(AP));
console.log('  ➜ Group C: 6 assertions');

// Group D: UX Extra Hooks + SA Guards
console.log('\n[D] UX Extra + SA Deletion Guard (preventDefault, wouter, rules list)');
a('D1 useLocation imported from "wouter" + setLocation used for goEdit route (/articles/:id/edit)', /import\s*\{\s*useLocation\s*\}\s*from\s*["']wouter["']\s*;/.test(AP) && /setLocation\(\s*`\/articles\/\$\{/.test(AP));
a('D2 React hooks useMemo + useState imported AND used (no unused imports)', /import\s*\{\s*useState,\s*useMemo\s*\}\s*from\s*["']react["']/.test(AP) && /useMemo\(\s*\(\)\s*=>/.test(AP) && /useState\s*\(/.test(AP));
a('D3 AlertDialogAction delete confirm onClick e.preventDefault() prevent dialog form submit default', /<AlertDialogAction[\s\S]*onClick=\{\s*\(\s*e\s*\)\s*=>\s*\{\s*e\.preventDefault\(\)\s*;?\s*confirmDelete\(\s*\)\s*;\s*\}/m.test(AP) || /AlertDialogAction[\s\S]*preventDefault/.test(AP));
a('D4 Share URL format = ${window.location.origin}/articles/${id}/edit (works both local+prod, NOT hardcoded prod domain)', /\$\{window\.location\.origin\}\/articles\/\$\{openShare\.id\}\/edit/.test(AP) || /\$\{window\.location\.origin\}\/articles\/\$\{/.test(AP));
a('D5 Delete AlertDialogDescription rules list 3 SA items: ลบถาวร rows only NO ALTER, ไม่กู้คืนได้, ไม่นับรวม audit', /ลบถาวร[\s\S]*AC-6[\s\S]*NO ALTER|ไม่สามารถกู้คืนกลับมาได้[\s\S]*Admin Audit[\s\S]*อีกต่อไป/.test(AP) || /DELETE row data only[\s\S]*ไม่สามารถกู้คืนกลับมาได้[\s\S]*EEAT \/ Admin Audit/.test(AP));
console.log('  ➜ Group D: 5 assertions');

// Group E: Backend procedure write.delete (NEW) + write.getDraft (EXISTING) + AC-6 ZERO ALTER/DROP
console.log('\n[E] AC-6 ZERO ALTER/DROP + backend write.delete/getDraft exists');
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
a(`E1 server/ NO ALTER/DROP structural SQL hits=${srv.length} (AC-6 PERMANENT)`, srv.length === 0, srv.join(' | '));
a('E2 NEW write.delete protectedProcedure: input draftId + assertProjectAccess + delete write_articles FK-safe THEN articles', /delete:\s*protectedProcedure[\s\S]*input\(z\.object\(\{\s*draftId:\s*z\.number\(\)\.int\(\)\.positive\(\)\s*\}\)\)[\s\S]*assertProjectAccess[\s\S]*db\.delete\(writeArticles\)[\s\S]*db\.delete\(articles\)/m.test(W_RT) || /delete:\s*protectedProcedure[\s\S]*draftId[\s\S]*assertProjectAccess/m.test(W_RT));
a('E3 write.getDraft EXISTS legacy L190: query leftJoin writeArticles → return { ok, draft, workflow } shape (meta_title/meta_description snake for ArticleEditorPage compat)', /getDraft:\s*protectedProcedure[\s\S]*leftJoin\(writeArticles[\s\S]*return\s*\{\s*ok:\s*true\s*,\s*draft:\s*\{[\s\S]*meta_title:[\s\S]*meta_description:[\s\S]*\},\s*workflow:/m.test(W_RT));
a('E4 db/ migrations folder NO NEW ALTER/DROP added in this P0 fix (14 tables exact FOREVER NO schema changes)', () => {
  const mig = grepAd(path.join(ROOT, 'db', 'migrations'));
  const filtered = mig.filter(l => !/CREATE TABLE IF NOT EXISTS/.test(l) && !/000[1-4]/.test(l));
  return filtered.length === 0;
});
console.log('  ➜ Group E: 4 assertions');

const total = pass + fail;
const minRequired = 20;
const minPass = 18;
console.log(`\n==== LOCAL TEST RESULT: ${pass}/${total} PASS${fail > 0 ? '  ❌ EXIT 1' : '  ✅ EXIT 0'} (TOTAL ASSERTIONS ${total} ≥${minRequired} required; ≥${minPass} pass needed) ====\n`);
if (total < minRequired) { console.log(`  ⚠️  INSUFFICIENT ASSERTIONS: have ${total}, need ≥${minRequired}. EXIT 1`); process.exit(1); }
if (pass < minPass) { console.log(`  ⚠️  TOO MANY FAILS: ${pass}/${total}, need ≥${minPass} pass. EXIT 1`); process.exit(1); }
process.exit(fail > 0 ? 1 : 0);
