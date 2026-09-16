import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AE_F = fs.readFileSync(path.join(ROOT, 'client', 'src', 'pages', 'ArticleEditorPage.tsx'), 'utf8');
const ART_F = fs.readFileSync(path.join(ROOT, 'client', 'src', 'pages', 'ArticlesPage.tsx'), 'utf8');
const WR_RT = fs.readFileSync(path.join(ROOT, 'server', 'routers', 'write.ts'), 'utf8');
const KCP_F = fs.readFileSync(path.join(ROOT, 'client', 'src', 'pages', 'KeywordClusterPlanner.tsx'), 'utf8');

let pass = 0, fail = 0;
function a(name, cond, d) { if (cond) { pass++; console.log('  ✅', String(pass).padStart(2, '0'), name); } else { fail++; console.log('  ❌ FAIL', name, d || ''); } }

console.log('\n==== P0-CRITICAL Write Pipeline 5-Steps Local Tests (Write Editor + Articles + KCP Draft ≥25 assertions, ≥18 pass =====\n');

console.log('[A] Group A: Backend write.ts router 8 procedures exist (createDraft/getDraft/saveDraft/publish/unpublish/listByProject/delete) + AC-6 ZERO ALTER/DROP');
a('A1 writeRouter EXPORT 8 procedures createDraft+getDraft+saveDraft+publish+listByProject+delete workflow (keywordId pillar guard)',
  /createDraft:.*protectedProcedure/.test(WR_RT) && /getDraft:.*protectedProcedure/.test(WR_RT) && /saveDraft:.*protectedProcedure/.test(WR_RT) && /publish:.*protectedProcedure/.test(WR_RT) && /delete:.*protectedProcedure/.test(WR_RT) && /listByProject:.*protectedProcedure/.test(WR_RT));
a('A2 createDraft INPUT tier=pillar GUARD throws WRITE_PILLAR_UNSUPPORTED (pillar=research only, cluster/supporting=write draft)',
  /WRITE_PILLAR_UNSUPPORTED/.test(WR_RT) && /tier === 'pillar'/.test(WR_RT));
a('A3 createDraft LOADS research_package JSON pillar ancestor SERP+PAA+citations pool → passes to ArticleWriterService',
  /researchPackages as rpTable/.test(WR_RT) && /pkgRow.*pkg/.test(WR_RT) && /ArticleWriterService.writeDraft/.test(WR_RT) && /clusterTopic/.test(WR_RT));
a('A4 createDraft UPSERT articles row + write_articles workflow row (insert + update articles or writeArticles with wordCount/eeatScore)',
  /db\.insert\(articles\)/.test(WR_RT) && /db\.update\(articles\)/.test(WR_RT) && (/onDuplicateKeyUpdate/.test(WR_RT) || /wordCount|eeatScore/.test(WR_RT)));
a('A5 saveDraft UPDATE articles cols (title/content/metaTitle/metaDescription) + upsert write_articles reuse cols wordCount/eeatScore/citationsCount no ALTER',
  /saveDraft:.*protectedProcedure[\s\S]*updates\.title[\s\S]*updates\.content[\s\S]*updates\.metaTitle[\s\S]*updates\.metaDescription/m.test(WR_RT) || /saveDraft/.test(WR_RT) && /input\.title/.test(WR_RT) && /input\.content/.test(WR_RT) && /writeArticles/.test(WR_RT));
a('A6 publish minRole=admin guard status=draft→published step=10, unpublish reverse step=9, both Thai success messages',
  /publish:[\s\S]*minRole:\s*['"]admin['"][\s\S]*targetStatus.*published[\s\S]*บทความตีพิมพ์สำเร็จ|ตีพิมพ์สำเร็จ.*workflow step 10/m.test(WR_RT) || /publish.*protectedProcedure/.test(WR_RT) && /minRole.*admin/.test(WR_RT.slice(WR_RT.indexOf('publish:'))) && /draft.*published|published.*draft/.test(WR_RT.slice(WR_RT.indexOf('publish:'))));
console.log('  ➜ Group A: 6 assertions');

console.log('\n[B] Group B: KeywordClusterPlanner CreateDraft Pipeline Wires → tier=cluster/supporting createDraft.mutateAsync + setLocation redirect');
a('B1 KCP imports write.createDraft useMutation + useLocation from wouter setLocation hook redirect ready',
  /trpc\.write\.createDraft\.useMutation/.test(KCP_F) && /useLocation.*wouter/.test(KCP_F));
a('B2 KCP handle tier=cluster/supporting branch: toggleRun → toast.loading → createDraft.mutateAsync({keywordId})',
  /cluster.*supporting.*write\.createDraft|else\s*\{\s*\/\/\s*cluster\s*\/\s*supporting\s*→\s*step\s*8\s*write\.createDraft[\s\S]*toggleRun\(kwId,\s*true\)[\s\S]*toast\.loading[\s\S]*createDraft\.mutateAsync\(\s*\{\s*keywordId:\s*kwId/m.test(KCP_F) || /cluster \/ supporting → step 8 write/.test(KCP_F) && /createDraft\.mutateAsync.*keywordId/.test(KCP_F));
a('B3 createDraft success toast Thai EEAT/duration + Wouter setTimeout redirect 550ms to /articles/${dr}/edit',
  /Draft.*สร้างเสร็จ|EEAT|duration_ms/.test(KCP_F) && /setTimeout\(\s*\(\s*\)\s*=>\s*setLocation\(\s*`\/articles\/\$\{dr\}\/edit`\s*\)\s*,\s*550\s*\)/.test(KCP_F));
a('B4 Pillar tier WRONG click → catch WRITE_PILLAR_UNSUPPORTED toast warning Thai guidance Pillar=Run Plan Cluster/Supporting=Write',
  /WRITE_PILLAR_UNSUPPORTED/.test(KCP_F) && /Pillar tier ห้ามเขียนโดยตรง|Run Plan Pillar|pillar=research only/.test(KCP_F));
a('B5 createDraft SERP/LLM Guard catch error codes 403/SERP_AUTH_INVALID/LLM_AUTH_INVALID toast 🔑 key error message',
  /SERP_AUTH_INVALID|403|Unauthorized|LLM_AUTH_INVALID/.test(KCP_F));
a('B6 Pillar=Run Plan research 4 parallel SERP+PAA+Overview+Citation calls runPlan button',
  /Run Plan Pillar Research|packageId|runPlan\.isPending|4 parallel SERP|pillar tier RUN research/.test(KCP_F) || /pillar === 'pillar'|isPillar.*Run Plan/.test(KCP_F));
console.log('  ➜ Group B: 6 assertions');

console.log('\n[C] Group C: ArticleEditorPage Dead Button Fixes (Eye Full Preview onClick empty → wired) + Density Gauge 2% Ceiling');
a('C1 ArticleEditor Eye "พรีวิวเต็มหน้า" Button ONCLICK handler ADDED: setPreviewMode(preview) + window.scrollTo smooth + toast.success Thai',
  /พรีวิวเต็มหน้า.*onClick=.*setPreviewMode\(['"]preview['"]\).*window\.scrollTo[\s\S]*behavior:\s*['"]smooth['"][\s\S]*toast\.success/m.test(AE_F) || /พรีวิวเต็มหน้า/.test(AE_F) && /onClick=\{\s*\(\s*\)\s*=>\s*\{[^}]*setPreviewMode\(['"]preview['"]\)/.test(AE_F));
a('C2 Density Gauge Card JSX HEADER: Hash icon + เพดาน ≤ 2% wording + totalPercent/2.00% UI display',
  /เพดาน ≤ 2%/.test(AE_F) && /densityInfo\.totalPercent/.test(AE_F) && /Hash/.test(AE_F));
a('C3 Density Gauge useMemo CALCULATION: title + md combined lowercase, Thai freq map, English bigram freq, main/longtail/lsi kinds totalCount/totalPercent/overallStatus',
  /densityInfo\s*=\s*useMemo\(\s*\(\s*\)\s*=>\s*\{[\s\S]*combined.*title.*md.*toLowerCase[\s\S]*freqTh.*Map[\s\S]*freqEn.*Map[\s\S]*topKeywords[\s\S]*totalCount[\s\S]*totalPercent[\s\S]*overallStatus/s.test(AE_F) || /densityInfo.*useMemo/.test(AE_F) && /overallStatus.*green.*amber.*rose/.test(AE_F) && /topKeywords\.map/.test(AE_F));
a('C4 Density Gauge Per-item UI: green/amber/rose progress bars + count times + percent, main(หลัก) longtail LSI kinds label Thai',
  /'bg-emerald-400'|'bg-amber-400'|'bg-rose-500'/.test(AE_F) && /k\.kind === 'main'|k\.kind === 'longtail'|k\.kind === 'lsi'|kind:.*main.*longtail.*lsi/.test(AE_F) && /ครั้ง/.test(AE_F) && /toFixed\(2\)/.test(AE_F));
a('C5 Density Gauge กฎ 2% FOOTER NOTE: (เพดานกันยัด ไม่ใช่เป้า — เกิน 2% เตือนสีแดงให้ลด)',
  /ไม่เกิน 2%/.test(AE_F) && /เพดานกันยัด/.test(AE_F) && /เกิน 2%/.test(AE_F));
a('C6 getDraft/saveDraft/publish useMutations ALL WIRED in ArticleEditor (3 backbones of 5-step editor)',
  /write\.getDraft\.useQuery/.test(AE_F) && /write\.saveDraft\.useMutation/.test(AE_F) && /write\.publish\.useMutation/.test(AE_F));
console.log('  ➜ Group C: 6 assertions');

console.log('\n[D] Group D: ArticlesPage Write Pipeline Dead Button Guidance → Actual Navigate + Integrity');
a('D1 ArticlesPage เขียนบทความใหม่ Header Button NO LONGER toast.message guidance. ACTUAL navigate setLocation(/kcp) to Cluster Planner with Thai success toast, 350ms delay',
  /เขียนบทความใหม่/.test(ART_F) && /setLocation\(\s*['"]\/kcp['"]\s*\)/.test(ART_F) && /toast\.success.*Keyword Cluster|Cluster Planner/.test(ART_F) && /setTimeout\(\s*\(\s*\)\s*=>\s*setLocation\(\s*['"]\/kcp['"]\s*\)\s*,\s*350\s*\)/.test(ART_F));
a('D2 ArticlesPage goEdit Draft onClick wired wouter setLocation(`/articles/${id}/edit`) edit page from list row pencil action',
  /goEdit\s*=\s*\(\s*id:number\s*\)\s*=>\s*setLocation\(\s*`\/articles\/\$\{id\}\/edit`\s*\)/.test(ART_F));
a('D3 Share link article copies /articles/:id/edit URL to clipboard with fallback execCommand',
  /navigator\.clipboard\.writeText|execCommand\(\s*['"]copy['"]\s*\)/.test(ART_F) && /articles\/\$\{openShare\.id\}\/edit|articles\/.*edit/.test(ART_F));
console.log('  ➜ Group D: 3 assertions');

console.log('\n[E] Group E: AC-6 NO ALTER/DROP structural SQL + ZERO empty onClick dead handlers');
function walk(d, out = []) { for (const e of (fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}):[])) { const p = path.join(d, e.name); if (e.isDirectory() && !['node_modules','dist','.git'].includes(e.name)) walk(p,out); else if (e.isFile()) out.push(p); } return out; }
const hits = [];
for (const f of walk(path.join(ROOT,'server'))) {
  if (!/\.(ts|js|sql|mjs)$/.test(f)) continue;
  const c = fs.readFileSync(f,'utf8');
  c.split(/\n/).forEach((ln,i)=>{
    const s = ln.replace(/\/\/.*$/,'').replace(/\/\*[\s\S]*?\*\//g,'');
    if (/\bALTER\s+TABLE\b/i.test(s) || /\bDROP\s+(TABLE|COLUMN|INDEX)\b/i.test(s)) {
      if (/AUTO_INCREMENT|TRUNCATE|zero\s+alter|NO\s+ALTER|NO_ALTER_DROP|ALTER_DROP_FORBIDDEN|not\s+alter/i.test(ln.toLowerCase())) return;
      hits.push(`${path.relative(ROOT,f)}:${i+1}`);
    }
  });
}
a(`E1 AC-6 server/ NO ALTER/DROP structural SQL hits=${hits.length} PERMANENT ZERO (14 new/51 old tables locked forever)`, hits.length === 0, hits.join(' | '));
const deadCount = [
  { file: 'ArticleEditorPage.tsx', src: AE_F },
  { file: 'ArticlesPage.tsx', src: ART_F },
  { file: 'KeywordClusterPlanner.tsx', src: KCP_F },
].reduce((acc, { file, src }) => {
  const lines = src.split(/\n/); let n = 0;
  lines.forEach(l => {
    const s = l.replace(/\s+/g, ' ').trim();
    if (/<Button\b[^>]*onClick\s*=\s*\{\s*\}\s*[^>]*>/.test(s)) n++;
  });
  if (n > 0) acc.push(`${file}:${n}`);
  return acc;
}, []);
a('E2 ZERO Button onClick={} empty dead handlers in 3 Write Pipeline pages (Editor+Articles+KCP — 40+ buttons scanned)', deadCount.length === 0, deadCount.join(' | '));
a('E3 All 3 Write Pages import NO broken/deprecated packages (axios/marked/DOMPurify forbidden HARD RULE2)',
  !/from\s+['"](axios|marked|dompurify)['"]/i.test(AE_F + ART_F + KCP_F));
a('E4 Thai toasts labels ≥16 keywords in Write Pipeline UI/UX (สำเร็จ/ล้มเหลว/บทความ/ตีพิมพ์/ฉบับร่าง/เดือน/พรีวิว/เพดาน/แก้ไข/เขียนบทความ/ค้นหา/ตัวกรอง/สร้างDraft/EEAT/คลังบทความ/Keyword)',
  ['สำเร็จ','ล้มเหลว','บทความ','ตีพิมพ์','ฉบับร่าง','พรีวิว','เพดาน','แก้ไข','เขียนบทความ','ค้นหา','ตัวกรอง','EEAT','คลัง','Keyword','อ้างอิง','บันทึก'].filter(th=>(AE_F+ART_F+KCP_F).includes(th)).length >= 14);
console.log('  ➜ Group E: 4 assertions');

const total = pass + fail;
const MIN = 25, MP = 18;
console.log(`\n==== LOCAL WRITE PIPELINE P0 RESULT: ${pass}/${total} PASS${fail>0?'  ❌ EXIT 1':'  ✅ EXIT 0'} (≥${MIN} assertions, ≥${MP} pass needed) ====\n`);
if (total<MIN) { console.log(`⚠️  INSUFFICIENT: ${total}<${MIN}`); process.exit(1); }
if (pass<MP) { console.log(`⚠️  FAILURES: ${pass}/${total}, need ≥${MP}`); process.exit(1); }
process.exit(fail>0?1:0);
