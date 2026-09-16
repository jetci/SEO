#!/usr/bin/env node
// Phase 2G Tests — SA-aligned Menu / 6-Stepper / Keyword Density ≤2% Gauge / 3 Gold Ideas UI
// 14 assertions total: A Menu+Routes 6, B WritePage Stepper+Density 5, C Gold Ideas+Placeholder Pages 3
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('d:/AEO/SEO V2');
const shellSrc = fs.readFileSync(path.join(ROOT, 'client/src/layouts/MainDashboardShell.tsx'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'client/src/App.tsx'), 'utf8');
const writeSrc = fs.readFileSync(path.join(ROOT, 'client/src/pages/WritePage.tsx'), 'utf8');
const researchSrc = fs.readFileSync(path.join(ROOT, 'client/src/pages/KeywordResearchPage.tsx'), 'utf8');
const auditSrc = fs.readFileSync(path.join(ROOT, 'client/src/pages/AdminAuditPage.tsx'), 'utf8');

let pass = 0, fail = 0, total = 14;

function A(name, cond, why = '') {
  if (cond) { pass++; console.log(`  ✅ A${pass.toString().padStart(2, '0')}: ${name}`); }
  else { fail++; console.log(`  ❌ A${(pass + fail).toString().padStart(2, '0')}: ${name}${why ? ' → ' + why : ''}`); }
}
function B(name, cond, why = '') {
  if (cond) { pass++; console.log(`  ✅ B${(pass).toString().padStart(2, '0')}: ${name}`); }
  else { fail++; console.log(`  ❌ B${(pass + fail).toString().padStart(2, '0')}: ${name}${why ? ' → ' + why : ''}`); }
}
function C(name, cond, why = '') {
  if (cond) { pass++; console.log(`  ✅ C${(pass).toString().padStart(2, '0')}: ${name}`); }
  else { fail++; console.log(`  ❌ C${(pass + fail).toString().padStart(2, '0')}: ${name}${why ? ' → ' + why : ''}`); }
}

console.log('========================================');
console.log('Phase 2G: Menu + 6-Stepper + Density Gauge Tests (14 assertions)');
console.log('========================================\n');
console.log('--- Group A: Menu NAV_ITEMS + App.tsx Routes Wire ---');

A('A1 NAV_ITEMS 10 items (6 plan + 4 system groups):',
  shellSrc.split('const NAV_ITEMS: NavItem[] = [')[1]?.split('];')[0]?.match(/\{ key:\s*["']/g)?.length === 10,
  'count { key: occurrences inside NAV_ITEMS array must = 10');

A('A2 Group plan CORRECT SA ORDER: overview=1 → projects=2 → research=3 → kcp=4 → write=5 → articles=6:',
  (() => {
    const block = shellSrc.split('const NAV_ITEMS: NavItem[] = [')[1]?.split('];')[0] ?? '';
    const keys = [...block.matchAll(/key:\s*["']([^"']+)["']/g)].map(m => m[1]);
    return keys.slice(0, 6).join(',') === 'overview,projects,research,kcp,write,articles';
  })(),
  'must match SA workflow order exactly (Search research BEFORE kcp/write)');

A('A3 Research route: badge="NEW" + icon Search (lucide) imported:',
  /badge:\s*["']NEW["'][\s\S]*?group:\s*["']plan["'][\s\S]*?key:\s*["']research["']/.test(shellSrc) ||
  /key:\s*["']research["'][^}]*badge:\s*["']NEW["']/.test(shellSrc) &&
  /import\s*\{[^}]*Search[^}]*\}\s*from\s*["']lucide-react["']/.test(shellSrc));

A('A4 Write route: PenLine icon + badge="SA" (mockup_write_5steps blueprint):',
  /key:\s*["']write["'][^}]*badge:\s*["']SA["']/.test(shellSrc) ||
  /badge:\s*["']SA["'][^}]*key:\s*["']write["']/.test(shellSrc),
  'WritePage เป็น SA blueprint ต้องมี badge SA ติดที่ Nav');

A('A5 App.tsx 3 Lazy imports wire: KeywordResearchPage, WritePage, AdminAuditPage:',
  /lazy\(\(\)\s*=>\s*import\(["']@\/pages\/KeywordResearchPage["']\)\)/.test(appSrc) &&
  /lazy\(\(\)\s*=>\s*import\(["']@\/pages\/WritePage["']\)\)/.test(appSrc) &&
  /lazy\(\(\)\s*=>\s*import\(["']@\/pages\/AdminAuditPage["']\)\)/.test(appSrc),
  '3 ใหม่ routes ต้อง import lazy ตาม App.tsx convention');

A('A6 App.tsx Switch 3 routes /research /write /audit paths present:',
  /<Route\s+path=["']\/research["']>/.test(appSrc) &&
  /<Route\s+path=["']\/write["']>/.test(appSrc) &&
  /<Route\s+path=["']\/audit["']>/.test(appSrc),
  '3 ใหม่ routes ต้องถูกประกาศใน Switch component');

console.log('\n--- Group B: WritePage 6-Step Stepper + Keyword Density ≤2% Core SA ---');

B('B1 STEPS 6 entries length=6: id order input → outline → write → assemble → review → preview:',
  (() => {
    const block = writeSrc.split('const STEPS: StepDef[] = [')[1]?.split('];')[0] ?? '';
    const ids = [...block.matchAll(/id:\s*["']([^"']+)["']/g)].map(m => m[1]);
    return ids.length === 6 && ids.join(',') === 'input,outline,write,assemble,review,preview';
  })(),
  '6-step stepper ต้อง match SA mockup 6 steps order');

B('B2 Density ceiling algorithm: DENSITY_PCT_MAX = 2 + ceilingMax = ceil(words * 2 / 100):',
  /const\s+DENSITY_PCT_MAX\s*=\s*2/.test(writeSrc) &&
  /Math\.ceil\(\s*\(\s*\(\s*wordCount\s*\|\|\s*2180\s*\)\s*\*\s*DENSITY_PCT_MAX\s*\)\s*\/\s*100\s*\)/.test(writeSrc),
  'SA L251 formula: 2% ของทั้งหมด → ceiling = ceil(words * 2 / 100)');

B('B3 Density pass vs over color: emerald-600 (pass <2%) / rose-600 (fail >2%) bar className toggle:',
  /densityPass\s*\?\s*["']bg-emerald-600["']\s*:\s*["']bg-rose-600["']/.test(writeSrc),
  'bar ต้องเปลี่ยนสีตาม pass/fail threshold 2%');

B('B4 Density Card outer border & bg toggle: emerald (pass) / rose (fail) Card className:',
  /densityPass\s*\?\s*["']!border-emerald-200\s+!bg-emerald-50/.test(writeSrc) ||
  /densityPass\s*\?\s*["'][^"']*!border-emerald-200[^"']*["']\s*:\s*["'][^"']*!border-rose-200/.test(writeSrc),
  'Card container ต้องมีกรอบ+bg เหมาะสมกับสถานะ pass/fail');

B('B5 Warning text when over ceiling: "เกินเพดาน → ต้องลดการใช้ซ้ำ" (SA L265 warning):',
  /เกินเพดาน\s*→\s*ต้องลด/.test(writeSrc) || /ต้องลดการใช้ซ้ำ/.test(writeSrc),
  'ผ่านไม่ได้ต้องมีข้อความเตือนผู้ใช้ลด keyword duplicate');

console.log('\n--- Group C: 3 Gold Ideas UI (reference_openseo_sam.md) + Placeholder Shells ---');

C('C1 Gold #3 AI Model selector 3 cards: Claude Sonnet / GPT-4o mini / Gemini 1.5 Flash:',
  /anthropic\/claude-3\.5-sonnet/.test(writeSrc) &&
  /openai\/gpt-4o-mini/.test(writeSrc) &&
  /google\/gemini-1\.5-flash/.test(writeSrc),
  'Sam L53-L58: 3 AI model เลือกต่างกัน → tone ไม่เหมือน AI generic');

C('C2 Gold #2 Sources 4 rows DEMO_SOURCES DA ≥ 35 (maxbet/sportingnews/analys/johnnybet) + refresh button:',
  /domain:\s*["']maxbet\.club["'][\s\S]{0,120}da:\s*42/.test(writeSrc) &&
  /domain:\s*["']sportingnews\.com["'][\s\S]{0,120}da:\s*89/.test(writeSrc) &&
  /ดึง\s*Sources\s*ใหม่/.test(writeSrc),
  'Sam L45-L51: Sources ก่อนเขียน → root cause EEAT 0 = no citation แก้ที่นี่');

C('C3 Placeholder shells data: Research seed="สล็อตออนไลน์" + Audit 4 KPIs 12/3/7/248:',
  /useState\(\s*["']สล็อตออนไลน์["']\s*\)/.test(researchSrc) &&
  /label:\s*["']ผู้ใช้ทั้งหมด["'][^}]*val:\s*["']12["']/.test(auditSrc) &&
  /label:\s*["']ทีมงาน["'][^}]*val:\s*["']3["']/.test(auditSrc) &&
  /label:\s*["']โปรเจกต์["'][^}]*val:\s*["']7["']/.test(auditSrc) &&
  /label:\s*["']บทความทั้งหมด["'][^}]*val:\s*["']248["']/.test(auditSrc),
  'KeywordResearch seed=สล็อตออนไลน์ + AdminAudit KPIs 12 users/3 teams/7 projects/248 articles');

console.log('\n========================================');
console.log(`RESULT: ${pass}/${total} PASS · ${fail} FAIL`);
console.log('========================================');
if (fail > 0) {
  console.log('\n❌ วนซ้ำปรับปรุงแก้ไขก่อน → golden cycle loop: fix → rerun test');
  process.exit(1);
} else {
  console.log('\n✅ ผ่าน 14/14 assertions → ทดสอบ build + deploy VPS ต่อ');
  process.exit(0);
}
