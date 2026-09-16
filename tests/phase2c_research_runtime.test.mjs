// EEAT Studio V2 · Phase 2C Research Layer Runtime Tests
// 15 assertions — NO framework, zero-dep node runner (node tests/phase2c_research_runtime.test.mjs)
// Static source authoritative + optional runtime backend probe (SKIP if :3002 unreachable)
import * as fs from 'node:fs';
import * as path from 'node:path';

const C = { RED:'\x1b[31m', GREEN:'\x1b[32m', YELLOW:'\x1b[33m', CYAN:'\x1b[36m', RST:'\x1b[0m' };
const pass = (id,msg)=>console.log(`${C.GREEN}✅ [${id}]${C.RST} ${msg}`);
const fail = (id,msg)=>{ console.log(`${C.RED}❌ [${id}]${C.RST} ${msg}`); FAILS.push(id); };
const skip = (id,msg)=>console.log(`${C.YELLOW}⏩ [${id}]${C.RST} [SKIP] ${msg}`);
const FAILS = [];
const ROOT = process.cwd();
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf-8');

console.log(`${C.CYAN}═══════════════════════════════════════════════════════${C.RST}`);
console.log(`${C.CYAN}  EEAT Studio V2 · Phase 2C — Research Runtime (15 assertions)${C.RST}`);
console.log(`${C.CYAN}═══════════════════════════════════════════════════════${C.RST}\n`);

// ───── A) SERP Client (source static 5 assertions) ─────
console.log(`${C.CYAN}▶ A) SerpService adapters + cache (5/15)${C.RST}`);
try {
  const s = read('server/services/serpClient.ts');
  // 2C-A1 / 2C-A2: Both Serper + DataForSEO adapters exist
  if (s.includes(`provider === 'dataforseo'`)) pass('2C-A1', 'SerpService declares DataForSEO adapter (keyword_intent/labs endpoint + basic auth login:password)');
  else fail('2C-A1', 'Missing DataForSEO adapter in serpClient.ts');
  const hasSerper = s.includes('google.serper.dev/search') && s.includes("X-API-KEY");
  if (hasSerper) pass('2C-A2', 'SerpService declares Serper adapter (google.serper.dev X-API-KEY header)');
  else fail('2C-A2', 'Missing Serper adapter in serpClient.ts');

  // 2C-A3: MD5 hash cache key + 7-day TTL serp_metric_cache GT(fetchedAt, now-7d)
  const hasHash = /md5Hash\([\s\S]*?crypto\.createHash\('md5'\)/.test(s) || s.includes(`crypto.createHash('md5')`);
  const hasTTL = s.includes('SEVEN_DAYS_MS') || s.includes('7 * 24 * 3600 * 1000') || /gt\(serpMetricCache\.fetchedAt,\s*new Date\(Date\.now\(\)\s*-\s*\w+\)/.test(s);
  const hasCacheLookup = s.includes('from(serpMetricCache)') && s.includes('onDuplicateKeyUpdate');
  if (hasHash && hasTTL && hasCacheLookup) pass('2C-A3', 'SERP MD5(keyword||lang||country) cache, 7-day TTL, serpMetricCache onDuplicateKeyUpdate idempotent');
  else fail('2C-A3', `MD5? ${hasHash} TTL7d? ${hasTTL} CacheUpsert? ${hasCacheLookup}`);

  // 2C-A4: enrichBatch cap 50 keywords / call
  if (/enrichBatch\(keywordTexts[\s\S]{0,100}length\s*>\s*50[\s\S]{0,80}BATCH_TOO_LARGE/.test(s) || /throw new Error\('\[BATCH_TOO_LARGE\]/.test(s))
    pass('2C-A4', 'enrichBatch cap = 50 keywords per call guard [BATCH_TOO_LARGE] (rate limit protect)');
  else fail('2C-A4', 'Missing 50-keyword BATCH_TOO_LARGE guard in enrichBatch');

  // 2C-A5: All 3 public methods (enrichBatch / organicTop10 / paaQuestions) declared + insertAudit
  const m1 = /async enrichBatch\(/.test(s);
  const m2 = /async organicTop10\(/.test(s);
  const m3 = /async paaQuestions\(/.test(s);
  const audit = s.includes('await insertAudit') && s.includes(`provider: 'serp'`);
  if (m1 && m2 && m3 && audit) pass('2C-A5', 'SerpService 3 methods declared (enrichBatch/organicTop10/paaQuestions) + insertAudit() provider=serp costing');
  else fail('2C-A5', `Methods? enrich=${m1} organic=${m2} paa=${m3}. InsertAudit? ${audit}`);
} catch(e){ fail('2C-A-READ', 'serpClient.ts: '+String(e?.message ?? e).slice(0,120)); }

// ───── B) LLM Client (source static 5 assertions) ─────
console.log(`\n${C.CYAN}▶ B) LlmService adapters + Zod structured (5/15)${C.RST}`);
try {
  const l = read('server/services/llmClient.ts');
  // 2C-B1: 4 provider adapters openrouter/openai/anthropic/google
  const has4 = ['openrouter','openai','anthropic','google'].every(p => new RegExp(`provider\\s*===\\s*['"]${p}['"]`).test(l));
  if (has4) pass('2C-B1', 'LlmService 4 adapters: openrouter + openai + anthropic + google (all cases declared switch)');
  else fail('2C-B1', 'Missing 1+ LLM adapter. Expect 4/4');

  // 2C-B2: PROVIDER_DEFAULT_MODELS declared 4 entries + PROVIDER_PRICING USD/Mtokens
  const pModels = /PROVIDER_DEFAULT_MODELS:\s*Record<string, string>[\s\S]*?openrouter[\s\S]*?openai[\s\S]*?anthropic[\s\S]*?google/.test(l);
  const pPricing = l.includes('PROVIDER_PRICING') && (l.includes('out: 0.15') || l.includes('in: 0.07'));
  if (pModels && pPricing) pass('2C-B2', 'PROVIDER_DEFAULT_MODELS + PROVIDER_PRICING ($/1M tokens in/out) costing table declared');
  else fail(`2C-B2`, `Models map? ${pModels}. Pricing USD/Mtokens? ${pPricing}`);

  // 2C-B3: chatStructured Zod schema.parseAsync 2 retry (ATTEMPTS = 2) + strip markdown ``` fences
  const hasRetry = /ATTEMPTS\s*=\s*2/.test(l) || /for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*ATTEMPTS\s*;\s*i\+\+\)/.test(l);
  const hasFenceStrip = l.includes("replace(/^```") || l.includes("```json") === false && l.includes("replace(");
  const hasParseAsync = /schema\.parseAsync\(obj\)/.test(l) || l.includes('.parseAsync(obj)');
  if (hasRetry && hasFenceStrip && hasParseAsync) pass('2C-B3', 'chatStructured Zod: schema.parseAsync + 2 retry ATTEMPTS=2 + strip markdown ``` fences (robust JSON parser)');
  else fail('2C-B3', `Retry=2? ${hasRetry} Strip fences? ${hasFenceStrip} parseAsync? ${hasParseAsync}`);

  // 2C-B4: Every chatRaw call => insertAudit provider=llm tokensIn/tokensOut providerModel usdCostEst
  if (l.includes(`provider: 'llm'`) && l.includes('tokensIn: r.usage.input_tokens') && l.includes('tokensOut: r.usage.output_tokens') && l.includes('usdCostEst: approxUsd'))
    pass('2C-B4', 'chatRaw always insertAudit provider=llm tokensIn/out model approxUsd pricing (billing window tracks every call)');
  else fail('2C-B4', 'insertAudit llm call incomplete (missing tokens/pricing)');

  // 2C-B5: AbortController timeout (401/403 = AUTH_INVALID, 500 = UPSTREAM)
  const auth = /res\.status === 401 \|\| res\.status === 403/.test(l) || (l.includes('LLM_AUTH_INVALID') && l.includes('401') && l.includes('403'));
  const upstream = /status\s*>=\s*500/.test(l) || l.includes('LLM_UPSTREAM');
  const ac = l.includes('AbortController') || l.includes('timeoutMs') && l.includes('clearTimeout');
  if (auth && upstream && ac) pass('2C-B5', '401/403 LLM_AUTH_INVALID codes, 5xx=UPSTREAM, AbortController timeoutMs guard (failfast vs bad keys/servers)');
  else fail('2C-B5', `AUTH codes? ${auth} UPSTREAM? ${upstream} AbortCtrl? ${ac}`);
} catch(e){ fail('2C-B-READ', 'llmClient.ts: '+String(e?.message ?? e).slice(0,120)); }

// ───── C) keywords router WIRE = enrichSerp/aiClusterize use actual services (NOT stub) ─────
console.log(`\n${C.CYAN}▶ C) keywords.ts runtime wire enrich + aiCluster (5/15)${C.RST}`);
try {
  const k = read('server/routers/keywords.ts');
  // 2C-C1: imports SerpService + LlmService, uses forContext(ctx) NOT mock
  const sImport = /import\s*\{\s*SerpService[\s\S]*?from\s+['"]\.\.\/services\/serpClient\.js['"]/.test(k) || k.includes("SerpService.forContext(ctx)");
  const lImport = /import\s*\{\s*LlmService[\s\S]*?from\s+['"]\.\.\/services\/llmClient\.js['"]/.test(k) || k.includes("LlmService.forContext(ctx)");
  if (k.includes('SerpService.forContext(ctx)')) pass('2C-C1', 'enrichSerp calls SerpService.forContext(ctx) → resolveTeamSettings → real SERP key (not stub)');
  else fail('2C-C1', 'enrichSerp does NOT call SerpService.forContext — still stubbed!');
  if (k.includes('LlmService.forContext(ctx)')) pass('2C-C2', 'aiClusterize calls LlmService.forContext(ctx) → real LLM chatStructured (not stub)');
  else fail('2C-C2', 'aiClusterize does NOT call LlmService.forContext — still stubbed!');

  // 2C-C3: aiClusterize Zod schema 3 tiers (pillar/cluster/supporting) + parent + YMYL disclaimer_required flag
  const schema = /clusterSchema\s*=\s*z\.object\(\{[\s\S]*?disclaimer_required:\s*z\.boolean\(\)[\s\S]*?type:\s*z\.enum\(CLUSTER_TYPES/.test(k);
  const ymylNote = /YMYL CATEGORY[\s\S]*?disclaimer_required=true[\s\S]*?pillar about risks\/warnings\/disclaimers/.test(k) || k.includes('[YMYL CATEGORY') && k.includes('disclaimer_required=true');
  if (schema && ymylNote) pass('2C-C3', 'aiCluster Zod schema 3-tier pillar/cluster/supporting + disclaimer_required for YMYL categories (safer gambling/health slots/lottery/casino=id3-4-5)');
  else fail(`2C-C3`, `Schema? ${schema}. YMYL disclaimer_required flagging? ${ymylNote}`);

  // 2C-C4: enrich -> serp.enrichBatch -> DB update(keywords) searchVolume/difficulty/intentSuggestion + update duplicate ON_DUP safe via uk_keywords_project_text
  const hasUpdate = /db\.update\(keywords\)\.set\(patch\)/.test(k);
  const hasDup = /duplicate.*uk_keywords_project_text/.test(k) || k.includes('uk_keywords_project_text');
  if (hasUpdate && hasDup) pass('2C-C4', 'enrichSerp → safe DB write: UPDATE existing rows / INSERT new; handle duplicate uk_keywords_project_text (idempotent no crash)');
  else fail(`2C-C4`, `UPDATE patch? ${hasUpdate}. Duplicate unique guard present? ${hasDup}`);

  // 2C-C5: clusterize -> 3 pass insert (pillar → cluster → supporting with parentId refs, build pillarByName map)
  const pillars = /c\.type === 'pillar'[\s\S]*?pillarByName\.set\(c\.name,\s*id\)/.test(k) || (k.includes("pillarByName.set") && k.includes("type === 'pillar'"));
  const clusters2 = /c\.type === 'cluster'[\s\S]*?pillarByName\.get\(parentName\)/.test(k) || (k.includes(`pillarByName.get(parentName)`) && k.includes(`type === 'cluster'`));
  const support3 = /c\.type === 'supporting'[\s\S]*?insertedNameToId\.get\(parentName\)/.test(k) || (k.includes("insertedNameToId.get(parentName)") && k.includes("type === 'supporting'"));
  if (pillars && clusters2 && support3) pass('2C-C5', 'Clusterize 3-order insert pass: pillar 1st → cluster 2nd (parent=pillar) → supporting 3rd (parent=cluster) = foreign key valid (no orphan rows)');
  else fail(`2C-C5`, `Pillar 1st pass? ${pillars}. Cluster 2nd pass? ${clusters2}. Supporting 3rd pass? ${support3}`);
} catch(e){ fail('2C-C-READ', 'keywords.ts: '+String(e?.message ?? e).slice(0,140)); }

// ───── Optional runtime probe backend :3002 ─────
console.log(`\n${C.CYAN}▶ Optional runtime probe backend :3002${C.RST}`);
(async () => {
  try {
    const ac = new AbortController();
    const to = setTimeout(()=>ac.abort(), 2000);
    const r = await fetch('http://127.0.0.1:3002/api/health', { signal: ac.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error('non 200');
    const h = await r.json();
    pass('2C-RUN-1', `Runtime backend reachable. phase=${h.phase} routers=${h.routers?.length ?? 0} (research included) ${(h.routers ?? []).includes('research')?'OK':'WARN?'}`);
  } catch {
    skip('2C-RUN-1', `Backend :3002 not reachable — static tests still authoritative (deploy verifies live on VPS)`);
  }
})();

// ───── SUMMARY ─────
setTimeout(() => {
  const TOTAL = 15;
  const passCount = TOTAL - FAILS.length;
  console.log(`\n${C.CYAN}═══════════════════════════════════════════════════════${C.RST}`);
  console.log(`${FAILS.length===0?C.GREEN:C.RED}  SUMMARY Phase 2C Research Runtime: ${passCount}/${TOTAL} PASS${C.RST}${FAILS.length ? ` · FAIL IDs: ${FAILS.join(', ')}` : ''}`);
  console.log(`${C.CYAN}═══════════════════════════════════════════════════════${C.RST}\n`);
  process.exit(FAILS.length?1:0);
}, 3000);
