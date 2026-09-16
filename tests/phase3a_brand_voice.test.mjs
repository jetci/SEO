// EEAT Studio V2 · Phase 3A Brand Voice Local Test Suite (≥12 assertions)
// Tests: 0004 migration create-only, RBAC admin-only scrapeBrandVoice, url validation,
//        brand voice object 7 keys, upsert pattern, getBrandVoice parse JSON,
//        ArticleWriterService prepend wire + write router projectId pass.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
let passed = 0, failed = 0;
const results = [];
function assert(cond, msg, group) {
  if (cond) { passed++; results.push({ ok: true, group, msg }); }
  else { failed++; results.push({ ok: false, group, msg }); console.error('FAIL:', group, msg); }
}
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

// ---------------- Group A: 0004 Migration SQL Create-Only AC-6 (4 assertions)
{
  const mig = read('db/migrations/0004_phase3_brand_voice.sql');
  assert(!/ALTER\s+TABLE/i.test(mig), '0004 no ALTER TABLE', 'A');
  assert(!/DROP\s+(TABLE|COLUMN|INDEX)/i.test(mig), '0004 no DROP TABLE/COL/INDEX', 'A');
  assert(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?project_brand_voices`?/i.test(mig), '0004 CREATE project_brand_voices IF NOT EXISTS', 'A');
  assert(/FOREIGN\s+KEY\s*\(`?project_id`?\)\s+REFERENCES\s+`?projects`?\s*\(`?id`?\)\s+ON\s+DELETE\s+CASCADE/i.test(mig), '0004 FK project_id CASCADE projects', 'A');
}

// ---------------- Group B: projectsRouter procedures scrapeBrandVoice + getBrandVoice (5 assertions)
{
  const prj = read('server/routers/projects.ts');
  assert((() => {
           const i = prj.indexOf('scrapeBrandVoice');
           const s = prj.slice(i, i + 1000);
           return /assertProjectAccess\([^,]+,\s*[\s\S]*?minRole\s*:\s*['"]admin['"]/.test(s) ||
                  /minRole\s*[:=]\s*['"]admin['"]/.test(s);
         })(),
         'scrapeBrandVoice minRole=admin RBAC gate', 'B');
  assert(/input\s*\(\s*z\.object\([\s\S]*url:\s*z\.string\(\)[\s\S]*\.url\(\)/m.test(prj), 'scrapeBrandVoice url z.string().url() validate', 'B');
  assert(/getBrandVoice[\s\S]*?minRole\s*=\s*['"]member['"]/i.test(prj) ||
         (() => { const i = prj.indexOf('getBrandVoice'); const s = prj.slice(i, i+900); return /member/.test(s) || /assertProjectAccess\([^)]*minRole\s*:\s*['"]member['"]/.test(s); })(),
         'getBrandVoice minRole=member allowed', 'B');
  assert(/brandTone[\s\S]{0,200}primaryLang[\s\S]{0,200}targetAudience[\s\S]{0,200}keywords[\s\S]{0,200}contentDo[\s\S]{0,200}contentDont[\s\S]{0,200}contentType/.test(prj),
         'scrapeBrandVoice zod 7 keys schema present', 'B');
  assert(/(select\(\)\.from\(projectBrandVoices\)[\s\S]{0,300}(insert\(projectBrandVoices\)|update\(projectBrandVoices\))|(insert|update)[\s\S]{0,200}projectBrandVoices[\s\S]{0,500}(update|insert)[\s\S]{0,200}projectBrandVoices)/.test(prj),
         'scrapeBrandVoice UPSERT pattern (insert or update)', 'B');
}

// ---------------- Group C: ArticleWriterService brand voice wire + write router pass projectId (3 assertions)
{
  const aw = read('server/services/articleWriterService.ts');
  assert(/writeDraft\([^)]*projectId\s*\??:\s*number/.test(aw) ||
         /writeDraft\([^)]*,\s*projectId/.test(aw),
         'ArticleWriterService.writeDraft accepts projectId parameter', 'C');
  const prefixCount = (aw.match(/brandVoicePrefix\s*\?\s*brandVoicePrefix\s*:/g) || []).length;
  assert(prefixCount >= 2, `ArticleWriterService prepends brandVoicePrefix in ≥2 locations (metadata + sections) = ${prefixCount}`, 'C');
  const wt = read('server/routers/write.ts');
  assert(/ArticleWriterService\.writeDraft\([^)]*kw\.projectId[^)]*\)/.test(wt),
         'write.createDraft passes kw.projectId to ArticleWriterService.writeDraft', 'C');
}

// ---------------- Group D: schema.ts projectBrandVoices export (1 assertion)
{
  const sch = read('db/schema.ts');
  assert(/export\s+const\s+projectBrandVoices\s*=\s*mysqlTable\([\s\S]{0,200}'project_brand_voices'/.test(sch) &&
         /projectId:\s*bigint\(\s*'project_id'/.test(sch) && /voiceJson:\s*\w+\(\s*'voice_json'/.test(sch),
         'schema.ts projectBrandVoices mysqlTable snake cols project_id + voice_json', 'D');
}

console.log(`\n==== PHASE3A BRAND VOICE LOCAL: ${passed} PASS / ${failed} FAIL / ${passed+failed} TOTAL ====`);
for (const r of results) if (!r.ok) console.log('  FAIL', r.group.padEnd(3), r.msg);
process.exit(failed === 0 ? 0 : 1);
