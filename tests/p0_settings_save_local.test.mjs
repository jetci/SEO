import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SP = fs.readFileSync(path.join(ROOT, 'client', 'src', 'pages', 'SettingsPage.tsx'), 'utf8');
const S_RT = fs.readFileSync(path.join(ROOT, 'server', 'routers', 'settings.ts'), 'utf8');

let pass = 0, fail = 0;
function a(name, cond, d) { if (cond) { pass++; console.log('  ✅', String(pass).padStart(2, '0'), name); } else { fail++; console.log('  ❌ FAIL', name, d || ''); } }

console.log('\n==== P0-SETTINGS Save/Country/Lang 4 BUGFIX Local Tests ≥18 assertions ====\n');

// Group A: CRITICAL B1 fixes — llmApiKey→optional empty, keep existing, no overwrite (5)
console.log('[A] B1 CRITICAL: settings.save llmApiKey → OPTIONAL/empty, keep existing keys when not passed');
a('A1 Zod schema LLM key no longer required min(10): z.string().default("") (not .min(10))', /save:[\s\S]*input\(z\.object\(\{[\s\S]*llmApiKey:\s*z\.string\(\)\.default\(['"]['"]\)/m.test(S_RT) && !/llmApiKey:\s*z\.string\(\)\.min\(\s*10[\s\S]*LLM API key required/.test(S_RT));
a('A2 Mutation logic loads existing keys BEFORE ping+upsert: loadSettingsForTeam(teamId) called pre-save', /save:[\s\S]*\.mutation\(async[\s\S]*\{[\s\S]*const existing\s*=\s*await loadSettingsForTeam\(teamId\)/m.test(S_RT));
a('A3 useNewLlmKey guard ≥10 chars only triggers ping when new key provided NOT empty', /const useNewLlmKey\s*=\s*\(typeof input\.llmApiKey\s*===\s*['"]string['"][\s\S]*trim\(\)\.length\s*>=\s*10\)/.test(S_RT));
a('A4 Only upsert llm_api_key DB row IF new key provided (preserve existing encrypted when empty)', /if\s*\(useNewLlmKey\)\s*\{[\s\S]*encLlm\s*=\s*encryptValue\(input\.llmApiKey\.trim\(\)\)[\s\S]*await upsertSetting\([\s\S]*'llm_api_key'[\s\S]*encLlm[\s\S]*\)[\s\S]*\}[\s\S]*else[\s\S]*\{[\s\S]*encLlm\s*=\s*existing\.get\([\s\S]*llm_api_key/.test(S_RT));
a('A5 Validate ping SKIPPED when using existing keys (useNew* var gated inside validatePing)', /input\.validatePing\)[\s\S]*\{[\s\S]*if\s*\(useNewLlmKey\)[\s\S]*\{[\s\S]*pingProvider\([\s\S]*llm[\s\S]*\}\s*else[\s\S]*if\s*\(useNewSerpKey\)/m.test(S_RT) || /input\.validatePing\)[\s\S]*if\s*\(useNewLlmKey\)[\s\S]*pingProvider[\s\S]*if\s*\(useNewSerpKey\)[\s\S]*pingProvider/m.test(S_RT));
console.log('  ➜ Group A: 5 assertions');

// Group B: B2 countryCode + langCode COMPLETE pipeline (zod→ping-skip→upsert keys) (4)
console.log('\n[B] B2 country/lang FULL PIPELINE: Zod schema accept → upsert settings keys country_code/lang_code');
a('B1 Zod schema countryCode length(2) default TH + langCode min(2) max(10) default th BOTH present', /countryCode:\s*z\.string\(\)\.length\(\s*2[\s\S]*default\(\s*['"]TH['"]\s*\)[\s\S]*langCode:\s*z\.string\(\)\.min\(\s*2[\s\S]*\.max\(\s*10[\s\S]*default\(\s*['"]th['"]\s*\)/m.test(S_RT));
a('B2 Server country_code + lang_code keys upsertSetting calls BOTH inside save mutation', /await upsertSetting\(teamId\s*,\s*['"]country_code['"][\s\S]*encCountry[\s\S]*\)[\s\S]*await upsertSetting\(teamId\s*,\s*['"]lang_code['"][\s\S]*encLang[\s\S]*\)/m.test(S_RT));
a('B3 Frontend handleSave payload EXPLICITLY includes countryCode + langCode from form state (no undefined omitted)', /handleSave\(\s*\)[\s\S]*const payload:\s*any\s*=\s*\{[\s\S]*countryCode:\s*form\.countryCode\s*,[\s\S]*langCode:\s*form\.langCode\s*,/m.test(SP));
a('B4 Return shape save includes keys.countryCode + keys.langCode (feedback to frontend)', /return\s*\{\s*ok:\s*true\s*,\s*saved:\s*true[\s\S]*keys:\s*\{[\s\S]*countryCode:\s*input\.countryCode[\s\S]*langCode:\s*input\.langCode[\s\S]*\}/m.test(S_RT));
console.log('  ➜ Group B: 4 assertions');

// Group C: B3 settings.get returns country/lang → frontend onSuccess prefill form (3)
console.log('\n[C] B3 settings.get → frontend setForm prefill country/lang from DB');
a('C1 settings.get query reads country_code + lang_code via decryptValue dec() map', /const countryCode\s*=\s*dec\(\s*['"]country_code['"]\s*\)\s*\|\|\s*['"]TH['"][\s\S]*const langCode\s*=\s*dec\(\s*['"]lang_code['"]\s*\)\s*\|\|\s*['"]th['"]/m.test(S_RT));
a('C2 settings.get return settings obj includes countryCode + langCode fields (not masked)', /return\s*\{\s*ok:\s*true\s*,\s*teamId\s*,[\s\S]*settings:\s*\{[\s\S]*countryCode\s*,[\s\S]*langCode\s*,[\s\S]*\}/m.test(S_RT));
a('C3 Frontend onSuccess setForm countryCode + langCode both from (data.settings as any).countryCode/langCode', /settings\.get\.useQuery\([\s\S]*onSuccess:\s*\(\s*data\s*\)\s*=>[\s\S]*setForm\(\s*f\s*=>\s*\([\s\S]*countryCode:\s*\(data\.settings as any\)\.countryCode\s*\|\|\s*f\.countryCode\s*,[\s\S]*langCode:\s*\(data\.settings as any\)\.langCode\s*\|\|\s*f\.langCode/m.test(SP));
console.log('  ➜ Group C: 3 assertions');

// Group D: B4 role consistency admin/owner BOTH save + reset + ROUNDTRIP verify gated (4)
console.log('\n[D] B4 Role save (admin|owner) BOTH; resetKey minRole→admin; LLM_REQUIRED guard first save');
a('D1 save assertTeamAccess minRole admin (owner IS higher → both pass)', /save:[\s\S]*\.mutation\(async[\s\S]*\{[\s\S]*await assertTeamAccess\(\s*ctx[\s\S]*teamId[\s\S]*\{\s*minRole:\s*['"]admin['"]/m.test(S_RT));
a('D2 resetKey OLD minRole owner → CHANGED to admin (both owner|admin can delete keys; NOT ONLY owner)', /resetKey:[\s\S]*\.mutation\(async[\s\S]*\{[\s\S]*await assertTeamAccess\(\s*ctx[\s\S]*teamId[\s\S]*\{\s*minRole:\s*['"]admin['"]\s*\}/m.test(S_RT) && !/resetKey:[\s\S]*\.mutation[\s\S]*assertTeamAccess[\s\S]*minRole:\s*['"]owner['"]/m.test(S_RT));
a('D3 First-time use: NO existing key AND NO new key → BAD_REQUEST [LLM_API_KEY_REQUIRED] Thai toast catchable', /if\s*\(\s*!useNewLlmKey\s*&&\s*!hasExistingLlm\s*\)\s*\{[\s\S]*throw new TRPCError\(\s*\{\s*code:\s*['"]BAD_REQUEST['"][\s\S]*LLM_API_KEY_REQUIRED/.test(S_RT));
a('D4 Roundtrip encrypt/decrypt verify ONLY when NEW llm key upserted (gated if useNewLlmKey → no false negative empty key)', /if\s*\(useNewLlmKey\)\s*\{[\s\S]*const decCheck\s*=\s*decryptValue\([\s\S]*encLlm[\s\S]*!\)[\s\S]*decCheck\s*!==\s*input\.llmApiKey\.trim\(\)[\s\S]*FAI?LED/m.test(S_RT));
console.log('  ➜ Group D: 4 assertions');

// Group E: UX toast feedback + AC-6 NO ALTER/DROP (2 + extra 2 = 4)
console.log('\n[E] UX toast feedback keysUpdated | [LLM_API_KEY_REQUIRED] toast catch AC-6 NO ALTER');
a('E1 save.onSuccess return includes keysUpdated obj (llmApiKey, serpApiKey booleans)', /keysUpdated:\s*\{\s*llmApiKey:\s*useNewLlmKey\s*,\s*serpApiKey:\s*useNewSerpKey\s*,?\s*\}/.test(S_RT));
a('E2 Frontend toast success description JOIN 4 parts (LLM/SERP KEY new|existing + Country + Lang)', /const up\s*=\s*\(res as any\)\.keysUpdated[\s\S]*const parts[\s\S]*if\s*\(up\.llmApiKey\)\s*parts\.push\([\s\S]*อัปเดต LLM Key[\s\S]*ใช้ต้นฉบับ[\s\S]*up\.serpApiKey[\s\S]*อัปเดต SERP Key[\s\S]*Default Country[\s\S]*Default Language/m.test(SP));
a('E3 Frontend catch toast [LLM_API_KEY_REQUIRED] distinct Thai error message (line 185/186)', /msg\.includes\(\s*["']\[LLM_API_KEY_REQUIRED\]["']\s*\)[\s\S]*กรุณาใส่ LLM API Key อย่างน้อยครั้งแรก/.test(SP) || /\[LLM_API_KEY_REQUIRED\]\s*\)\s*\{[\s\S]*กรุณาใส่ LLM API Key อย่างน้อยครั้งแรก/.test(SP) || /กรุณาใส่ LLM API Key อย่างน้อยครั้งแรก/.test(SP) && /LLM_API_KEY_REQUIRED/.test(SP));
function walk(d, out = []) { for (const e of (fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}):[])) { const p = path.join(d, e.name); if (e.isDirectory() && !['node_modules','dist','.git'].includes(e.name)) walk(p,out); else if (e.isFile()) out.push(p); } return out; }
const hits = [];
for (const f of walk(path.join(ROOT,'server'))) {
  if (!/\.(ts|js|sql|mjs)$/.test(f)) continue;
  const c = fs.readFileSync(f,'utf8');
  c.split(/\n/).forEach((ln,i)=>{
    const s = ln.replace(/\/\/.*$/,'').replace(/\/\*[\s\S]*?\*\//g,'');
    if (/\bALTER\s+TABLE\b/i.test(s) || /\bDROP\s+(TABLE|COLUMN|INDEX)\b/i.test(s)) {
      if (/AUTO_INCREMENT|TRUNCATE|zero\s+alter|NO\s+ALTER/i.test(ln.toLowerCase())) return;
      hits.push(`${path.relative(ROOT,f)}:${i+1}`);
    }
  });
}
a(`E4 AC-6 server/ NO ALTER/DROP structural SQL hits=${hits.length} PERMANENT ZERO`, hits.length === 0, hits.join(' | '));
console.log('  ➜ Group E: 4 assertions');

const total = pass + fail;
const MIN = 18, MP = 16;
console.log(`\n==== LOCAL TEST RESULT: ${pass}/${total} PASS${fail>0?'  ❌ EXIT 1':'  ✅ EXIT 0'} (≥${MIN} assertions, ≥${MP} pass needed) ====\n`);
if (total<MIN) { console.log(`⚠️  INSUFFICIENT: ${total}<${MIN}`); process.exit(1); }
if (pass<MP) { console.log(`⚠️  FAILURES: ${pass}/${total}, need ≥${MP}`); process.exit(1); }
process.exit(fail>0?1:0);
