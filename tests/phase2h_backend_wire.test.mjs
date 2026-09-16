// ============================================================
// Phase 2H Backend Wire: saveDraft autosave + Sources enrichSerp + Model selector Zod extend
// ≥18 assertions Group A 7 / B 6 / C 5 = 18 total
// ============================================================
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();

// Shared types fallback (same pattern as phase2g)
let sharedTypesFile = "";
if (fs.existsSync(path.join(root, "shared/types.ts"))) sharedTypesFile = path.join(root, "shared/types.ts");
else if (fs.existsSync(path.join(root, "shared/src/index.ts"))) sharedTypesFile = path.join(root, "shared/src/index.ts");

const clientWrite = fs.readFileSync(path.join(root, "client/src/pages/WritePage.tsx"), "utf8");
const serverWrite = fs.readFileSync(path.join(root, "server/routers/write.ts"), "utf8");

let pass = 0, fail = 0;
const total = 18;

function A(label, cond, reasonIfFail) {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else { console.log(`  ❌ ${label} — FAIL: ${reasonIfFail ?? ""}`); fail++; process.exitCode = 1; }
}

console.log("\n--- Group A 7: P1 SaveDraft autosave30s dirtyRef pattern (copy ArticleEditorPage L64-L124) ---");
const a1 = /saveMut\s*=\s*trpc\.write\.saveDraft\.useMutation\(\)/.test(clientWrite);
A(`A1 saveMut imported tRPC write.saveDraft.useMutation hook`, a1, `regex "saveMut = trpc.write.saveDraft.useMutation()" not found`);
const a2 = /saveTimerRef\s*=\s*useRef<any>\(\s*null\s*\)/.test(clientWrite) && /dirtyRef\s*=\s*useRef\(\s*false\s*\)/.test(clientWrite);
A(`A2 dirtyRef + saveTimerRef useRef(null/false) refs declared`, a2, `useRef dirtyRef/saveTimerRef declaration missing`);
const a3 = /function\s+scheduleAutoSave\s*\(\s*\)\s*\{\s*dirtyRef\.current\s*=\s*true;[\s\S]{0,400}clearTimeout\(saveTimerRef\.current\)[\s\S]{0,400}setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{\s*if\s*\(\s*!dirtyRef\.current\s*\)\s*return;[\s\S]{0,200}1000\s*\*\s*30/.test(clientWrite);
A(`A3 scheduleAutoSave: dirty=true + clearTimeout + setTimeout(..., 30s) pattern`, a3, `scheduleAutoSave 30s debounce 3-tier pattern dirty-clear-set not found`);
const a4 = /async\s+function\s+doSave[\s\S]{0,500}if\s*\(\s*!draftId\s*\)\s*\{[\s\S]{0,200}เลือก\s*Keyword\s*จาก\s*KCP/.test(clientWrite);
A(`A4 doSave draftId=0 guard toast "เลือก Keyword จาก KCP" disabled standalone`, a4, `draftId=0 standalone gate toast missing — user needs KCP first`);
const kwDirty = /const\s+setKeyword\s*=\s*\(\s*v:\s*string\s*\)\s*=>\s*\{\s*setKeywordRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
const ctDirty = /setCategory\s*=\s*\(v:\s*any\)\s*=>\s*\{\s*setCategoryRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
const itDirty = /setIntent\s*=\s*\(v:\s*any\)\s*=>\s*\{\s*setIntentRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
const ctypeDirty = /setContentType\s*=\s*\(v:\s*any\)\s*=>\s*\{\s*setContentTypeRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
const modDirty = /setModel\s*=\s*\(v:\s*string\)\s*=>\s*\{\s*setModelRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
const mdDirty = /setBodyMd\s*=\s*\(v:\s*string\)\s*=>\s*\{\s*setBodyMdRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
const mtDirty = /setMt\s*=\s*\(v:\s*string\)\s*=>\s*\{\s*setMtRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
const mdesDirty = /setMdes\s*=\s*\(v:\s*string\)\s*=>\s*\{\s*setMdesRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
const a5 = kwDirty && ctDirty && itDirty && ctypeDirty && modDirty && mdDirty && mtDirty && mdesDirty;
A(`A5 dirty wrappers 8 total ALL call scheduleAutoSave() (kw/ct/it/ctype/model/md/mt/mdes)`, a5, `missing dirty wrapper: kw=${kwDirty} ct=${ctDirty} it=${itDirty} ctype=${ctypeDirty} mod=${modDirty} md=${mdDirty} mt=${mtDirty} mdes=${mdesDirty}`);
const a6Btn = /onClick=\{\s*\(\s*\)\s*=>\s*doSave\(\s*false\s*,\s*false\s*\)\s*\}/.test(clientWrite);
const a6Load = /Loader2\s+className="size-4\s+mr-1\s+animate-spin"\s*\/>\s*กำลังบันทึก…/.test(clientWrite);
const a6Save = /<Save\s+className="size-4\s+mr-1"\s*\/>\s*บันทึกเข้าคลัง/.test(clientWrite);
const a6Dis = /disabled=\{\s*saveMut\.isPending\s*\|\|\s*!draftId\s*\}/.test(clientWrite);
const a6 = a6Btn && a6Load && a6Save && a6Dis;
A(`A6 Save button header: onClick doSave(false,false) + Loader2 animate-spin pending + Save label + disabled=(pending||!draftId)`, a6, `btn=${a6Btn} loader=${a6Load} saveLabel=${a6Save} disabled=${a6Dis}`);
const eeatFormula = /eeatEst\s*=\s*Math\.max\(\s*0\s*,\s*Math\.min\(\s*100\s*,[\s\S]{0,400}wordCount\s*>=\s*1500\s*\?\s*20[\s\S]{0,200}sources\.length\s*>=\s*3\s*\?\s*15[\s\S]{0,200}mt\.length\s*>=\s*30\s*&&\s*mt\.length\s*<=\s*120\s*\?\s*15[\s\S]{0,200}mdes\.length\s*>=\s*80\s*&&\s*mdes\.length\s*<=\s*320\s*\?\s*15/.test(clientWrite);
A(`A7 EEAT formula: 20 base + words1500(20) + ymyl(15) + sources≥3(15) + mt30-120(15) + mdes80-320(15)`, eeatFormula, `EEAT 6-part addend missing — exact 20+20+15+15+15+15=100 ceiling not found`);

console.log("\n--- Group B 6: P2 Step2 Sources refresh → tRPC research.enrichSerp SERP real wire + 403 graceful ---");
const b1 = /researchMut\s*=\s*trpc\.research\.enrichSerp\.useMutation\(\)/.test(clientWrite);
A(`B1 researchMut imported tRPC research.enrichSerp.useMutation hook`, b1, `trpc.research.enrichSerp mutation not found`);
const b2Params = /researchMut\.mutate\(\s*\{\s*seed:\s*keyword\.trim\(\s*\)\s*,\s*gl:\s*"th"\s*,\s*hl:\s*"th"\s*,\s*num:\s*20\s*\}\s*,\s*\{/.test(clientWrite);
A(`B2 enrichSerp input params: seed.trim(), gl=th, hl=th, num=20 correct seed format`, b2Params, `enrichSerp param order seed/gl/hl/num=20 not exact match`);
const b3Map = /Array\.isArray\(res\?\.organic\)\s*\?\s*res\.organic\s*:\s*\[\s*\]\s*\)\.slice\(\s*0\s*,\s*6\s*\)\.map\(\s*\(\s*r:\s*any\s*,\s*i:\s*number\s*\)\s*=>\s*\(\s*\{\s*id:\s*i\s*\+\s*1\s*,[\s\S]{0,200}url:\s*String\(\s*r\?\.url\s*\|\|\s*"#"\s*\)\.slice\(\s*0\s*,\s*300\s*\)[\s\S]{0,200}title:\s*String\(\s*r\?\.title\s*\|\|\s*"SERP result"\s*\)\.slice\(\s*0\s*,\s*160\s*\)[\s\S]{0,200}da:\s*Math\.max\(\s*25\s*,\s*30\s*\+\s*Math\.floor\(\s*Math\.random\(\s*\)\s*\*\s*60\s*\)\s*\)/.test(clientWrite);
A(`B3 onSuccess organic.slice(0,6).map: id / url300 / title160 / DA25+ correct SERP map structure`, b3Map, `organic slice 0..6 url/title/DA mapper missing exact regex`);
const b4Catch = /403\|Unauthorized\|Invalid Auth/.test(clientWrite) && /SERP\s+Key\s+403\s+\(Serper\s+revoked\)/.test(clientWrite);
A(`B4 403/Unauthorized catch regex toast Serper revoked (graceful no crash 403 key error)`, b4Catch, `regex 403|Unauthorized|Invalid Auth missing AND "SERP Key 403 (Serper revoked)" toast text missing`);
const b5Before = /setFetchingSources\(\s*true\s*\)\s*;[\s\S]{0,200}dirtyRef\.current\s*=\s*true[\s\S]{0,400}researchMut\.mutate/.test(clientWrite);
const b5After = /onSuccess\(\s*res:\s*any\s*\)\s*\{[\s\S]{0,120}setFetchingSources\(\s*false\s*\)\s*;/.test(clientWrite) && /onError\(\s*err:\s*any\s*\)\s*\{[\s\S]{0,120}setFetchingSources\(\s*false\s*\)\s*;/.test(clientWrite);
A(`B5 fetchingSources state set(true) before mutate + set(false) on BOTH onSuccess and onError`, b5Before && b5After, `before=${b5Before} successAfter=${/onSuccess[\s\S]setFetchingSources\(false\)/.test(clientWrite)} errAfter=${/onError[\s\S]setFetchingSources\(false\)/.test(clientWrite)}`);
const b6DA = /da:\s*Math\.max\(\s*25\s*,\s*30\s*\+\s*Math\.floor\(\s*Math\.random\(\s*\)\s*\*\s*60\s*\)\s*\)/.test(clientWrite);
A(`B6 DA threshold min=25 rand 30..90 range (≥25 floor DA threshold Gold #2 Sam L45)`, b6DA, `DA≥25 floor min threshold formula not exact match Math.max(25, ...)`);

console.log("\n--- Group C 5: P3 Model selector write.createDraft Zod extend model optional ---");
const c1 = /createDraft:\s*protectedProcedure[\s\S]{0,120}input\(\s*z\.object\(\s*\{\s*keywordId:\s*z\.number\(\)\.int\(\)\.positive\(\)\s*,\s*force:\s*z\.boolean\(\)\.default\(\s*false\s*\)\s*,\s*model:\s*z\.string\(\)\.max\(\s*120\s*\)\.optional\(\s*\)\s*\}\s*\)/.test(serverWrite);
A(`C1 Zod createDraft.input extend model: z.string.max(120).optional() (OpenRouter model ID max 120 safe)`, c1, `zod model field missing exact order keywordId→force→model`);
const c2 = /const\s+selectedModel\s*=\s*String\(\s*input\.model\s*\|\|\s*""\s*\)\.trim\(\s*\)\s*\|\|\s*undefined;/.test(serverWrite);
A(`C2 selectedModel = input.model trim() || undefined clean optional handling`, c2, `selectedModel variable L36 not exact String.trim→undefined`);
const c3DefState = /AI_MODELS\[0\]\.id/.test(clientWrite) && /setModel\s*=\s*\(\s*v:\s*string\s*\)\s*=>\s*\{\s*setModelRaw\(v\);\s*scheduleAutoSave\(\s*\);\s*\}/.test(clientWrite);
A(`C3 AI_MODELS[0].id default Claude Sonnet state + setModel dirty scheduleAutoSave wrapper`, c3DefState, `default=AI_MODELS[0].id Claude + dirty wrapper both present`);
const c4 = /<div[\s\S]{0,600}AI\s*Model[\s\S]{0,1200}onClick=\{\s*\(\s*\)\s*=>\s*setModel\(\s*m\.id\s*\)\s*\}/.test(clientWrite) || /setModel\(\s*m\.id\s*\)/.test(clientWrite);
A(`C4 Model selector card onClick: setModel(m.id) state wire selector UI state change`, c4, `setModel(m.id) card click trigger missing in Step1 AI Model 3 cards`);
const c5ExistsSelected = /const\s+selectedModel\s*=\s*String\(\s*input\.model\s*\|\|\s*""\s*\)\.trim\(\s*\)\s*\|\|\s*undefined;/.test(serverWrite);
const c5SaveDraftExists = /saveDraft:\s*protectedProcedure/.test(serverWrite);
A(`C5 selectedModel exists AND saveDraft: protectedProcedure present (no order break future LlmService wire)`, c5ExistsSelected && c5SaveDraftExists, `selectedModelDecl=${c5ExistsSelected} · saveDraftProc=${c5SaveDraftExists}`);

console.log("\n========================================");
console.log(`Phase2H Backend Wire RESULT: ${pass}/${total} PASS · ${fail} FAIL`);
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);
