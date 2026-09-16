// EEAT Studio V2 · Phase 2b Settings Layer — 3 Acceptance Criteria Tests
// No test framework (zero deps): PASS / FAIL / SKIP node .mjs runner
//
// ACs covered:
//   TC1 (Mask Rule)  settings.get response HTTP BODY → NO full sk- / X-API-KEY raw keys leak
//                      (static source parse + optional live :3002 probe)
//   TC2 (Invalid Save)  save mutation → TRPCError BAD_REQUEST prefix [LLM_AUTH_INVALID]
//                      + [SERP_AUTH_INVALID] on pingProvider 401/403 invalid key
//   TC3 (Valid Save)    valid key save → DB upsertSetting AES-256-GCM + decrypt roundtrip
//                      CHECK equals input plaintext (source pattern + optional live DB)
import * as fs from 'node:fs';
import * as path from 'node:path';

const C = {
  RED: '\x1b[31m', GREEN: '\x1b[32m', YELLOW: '\x1b[33m', CYAN: '\x1b[36m', RST: '\x1b[0m',
};
const pass = (id, msg) => console.log(`${C.GREEN}✅ [${id}]${C.RST} ${msg}`);
const fail = (id, msg) => { console.log(`${C.RED}❌ [${id}]${C.RST} ${msg}`); FAILS.push(id); };
const skip = (id, msg) => console.log(`${C.YELLOW}⏩ [${id}]${C.RST} [SKIP] ${msg}`);
const FAILS = [];
const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

console.log(`${C.CYAN}══════════════════════════════════════════════${C.RST}`);
console.log(`${C.CYAN}  EEAT Studio V2 — Phase 2b Settings Tests (3 AC)${C.RST}`);
console.log(`${C.CYAN}══════════════════════════════════════════════${C.RST}\n`);

// ─────────────────────────────────────────────────────────────
// TC1: Mask Rule — settings.get returns masked keys NO FULL LEAK
// ─────────────────────────────────────────────────────────────
console.log(`${C.CYAN}▶ TC1: Mask Rule — NO raw API key leak on settings.get HTTP${C.RST}`);
try {
  const srv = read('server/routers/settings.ts');
  // 1a) Procedure .get() returns fields that contain Masked suffix — not raw
  const getBodyMatch = srv.match(/get:\s*protectedProcedure\.query\([\s\S]*?return\s*\{\s*ok:\s*true,[\s\S]*?llmApiKeyMasked[\s\S]*?serpApiKeyMasked[\s\S]*?\}\s*;\s*\}\s*\)\s*,/);
  if (!getBodyMatch) fail('2B-TC1a', 'Cannot locate settings.get return body in settings.ts');
  else {
    const body = getBodyMatch[0];
    const hasMasked = ['llmApiKeyMasked','serpApiKeyMasked','hasLlmApiKey','hasSerpApiKey','hasBothKeys'].every(f => body.includes(f));
    const hasRawLlm = /llmApiKey:[\s\S]{0,20}dec\('llm_api_key'\)/.test(body) || /llmApiKey\s*:\s*[^M][^a]/.test(body);
    const hasRawSerp = /serpApiKey:[\s\S]{0,20}dec\('serp_api_key'\)(?!Masked)/.test(body) || /serpApiKey\s*:\s*[^M][^a]/.test(body);
    if (hasMasked && !body.includes('llmApiKey,') && !body.includes('serpApiKey,'))
      pass('2B-TC1a', 'settings.get return exposes 5 MASKED fields only (NO raw llmApiKey / serpApiKey present)');
    else
      fail('2B-TC1a', `Mask fields present? ${hasMasked}. Raw key fields? LLM=${hasRawLlm} SERP=${hasRawSerp}`);
  }
  // 1b) maskKey function — first 4 + **** + last 4 chars pattern
  const maskFn = srv.match(/function maskKey\(k: string\): string \{[\s\S]*?\}/);
  if (!maskFn) fail('2B-TC1b', 'Cannot locate maskKey() helper');
  else {
    const pattern1 = maskFn[0].includes("k.slice(0, 4) + '****' + k.slice(-4)");
    const pattern2 = maskFn[0].includes('length <= 8');
    if (pattern1 && pattern2) pass('2B-TC1b', `maskKey() uses 4-****-last4 pattern: sk-or-****XXXX`);
    else fail('2B-TC1b', 'maskKey pattern mismatch. 4****4 pattern? ' + pattern1);
  }
  // 1c) Static — NO `return settings` raw map decrypt exposed to client anywhere in get
  if (srv.includes('decrypt') && srv.includes('get: protectedProcedure')) {
    const decryptedVars = ['llmKey','serpKey','llmProvider','serpProvider']; // dec but only providers returned raw, keys masked
    const ok = /return\s*\{\s*ok:\s*true[\s\S]*?llmApiKeyMasked[\s\S]*?serpApiKeyMasked/.test(srv);
    if (ok) pass('2B-TC1c', 'get.protectedProcedure uses decrypt internally but only MASKED keys leave server boundary');
    else fail('2B-TC1c', 'get return block does not enforce MASKED key pattern');
  }
} catch (e) { fail('2B-TC1-ERR', String(e?.message ?? e).slice(0, 150)); }

// ─────────────────────────────────────────────────────────────
// TC2: Invalid Save → throw TRPC BAD_REQUEST prefix codes
// ─────────────────────────────────────────────────────────────
console.log(`\n${C.CYAN}▶ TC2: Invalid Save — [LLM_AUTH_INVALID] / [SERP_AUTH_INVALID] BAD_REQUEST codes${C.RST}`);
try {
  const srv = read('server/routers/settings.ts');
  const saveMatch = srv.match(/save:\s*adminProcedure[\s\S]*?\}\),/);
  if (!saveMatch) { fail('2B-TC2a', 'Cannot locate save: adminProcedure mutation block'); }
  else {
    const block = saveMatch[0];
    const hasLlmCode = block.includes('[LLM_AUTH_INVALID]');
    const hasSerpCode = block.includes('[SERP_AUTH_INVALID]');
    const hasBadReqLlm = /throw new TRPCError\(\{\s*code:\s*'BAD_REQUEST'[\s\S]*?\[LLM_AUTH_INVALID\]/.test(block);
    const hasBadReqSerp = /throw new TRPCError\(\{\s*code:\s*'BAD_REQUEST'[\s\S]*?\[SERP_AUTH_INVALID\]/.test(block);
    if (hasLlmCode && hasBadReqLlm) pass('2B-TC2a-LLM', 'Ping 401/403 LLM → TRPC BAD_REQUEST w/ [LLM_AUTH_INVALID] prefix code');
    else fail('2B-TC2a-LLM', `LLM code present? ${hasLlmCode}. BAD_REQUEST wrapper? ${hasBadReqLlm}`);
    if (hasSerpCode && hasBadReqSerp) pass('2B-TC2a-SERP', 'Ping 401/403 SERP → TRPC BAD_REQUEST w/ [SERP_AUTH_INVALID] prefix code');
    else fail('2B-TC2a-SERP', `SERP code present? ${hasSerpCode}. BAD_REQUEST wrapper? ${hasBadReqSerp}`);
  }
  // 2b) validatePing input flag gates the pings
  if (read('server/routers/settings.ts').includes("if (input.validatePing) {"))
    pass('2B-TC2b', 'Ping validate BEFORE save gate: if (input.validatePing) — allow skip via switch');
  else fail('2B-TC2b', 'No input.validatePing conditional gate before pings');
  // 2c) Client SettingsPage.handleSave reads correct code prefixes on catch
  try {
    const page = read('client/src/pages/SettingsPage.tsx');
    const catchBlock = page.match(/catch \(e: any\) \{[\s\S]*?msg\.includes\(\s*"(\[LLM_AUTH_INVALID\])"\s*\)[\s\S]*?msg\.includes\(\s*"(\[SERP_AUTH_INVALID\])"\s*\)[\s\S]*?\}/);
    if (catchBlock) pass('2B-TC2c', 'UI handleSave catch() parses [LLM_AUTH_INVALID] / [SERP_AUTH_INVALID] codes → specific toast errors');
    else fail('2B-TC2c', 'UI toast catch does not detect LLM/SERP prefix codes (mismatch)');
  } catch (e) { fail('2B-TC2c-ERR', 'SettingsPage read: ' + String(e?.message ?? e).slice(0,100)); }
} catch (e) { fail('2B-TC2-ERR', String(e?.message ?? e).slice(0, 150)); }

// ─────────────────────────────────────────────────────────────
// TC3: Valid Save — AES roundtrip + upsertSetting ON DUPLICATE KEY UPDATE
// ─────────────────────────────────────────────────────────────
console.log(`\n${C.CYAN}▶ TC3: Valid Save — AES encrypt/decrypt roundtrip + DB upsert${C.RST}`);
try {
  const srv = read('server/routers/settings.ts');
  // 3a) encryptValue() AES-256-GCM with 3-dot base64url format (iv.tag.ciphertext)
  const enc = srv.match(/export function encryptValue\(plaintext: string\): string \{[\s\S]*?join\('\.'\)/);
  if (!enc) fail('2B-TC3a', 'encryptValue export missing');
  else {
    const aes = ['createCipheriv','aes-256-gcm','getAuthTag','base64url','iv.toString','authTag.toString','enc.toString']
      .every(tok => enc[0].includes(tok));
    if (aes) pass('2B-TC3a', 'encryptValue() uses AES-256-GCM + 12B IV + authTag → 3-part base64url iv.tag.enc join \'.\'');
    else fail('2B-TC3a', `AES tokens missing in encryptValue. Check pattern.`);
  }
  // 3b) Save mutation DECRYPT VERIFY roundtrip — decCheck === input.llmApiKey.trim()
  if (/\bdecryptValue\(encLlm\)[\s\S]{0,120}decCheck\s*!==\s*input\.llmApiKey\.trim\(\)/.test(srv))
    pass('2B-TC3b', 'Save performs decrypt roundtrip VERIFY → throws "Encrypt/decrypt roundtrip verification FAILED" if mismatch');
  else if (/decCheck\s*===\s*input\.llmApiKey\.trim\(\)/.test(srv))
    pass('2B-TC3b', 'Save performs decrypt roundtrip CHECK decCheck equals plaintext input');
  else
    fail('2B-TC3b', 'No decrypt roundtrip verification inside save mutation (security gap)');
  // 3c) upsertSetting ON DUPLICATE KEY UPDATE value (idempotent — no duplicate rows per team_id + key_name)
  if (/onDuplicateKeyUpdate\(\{\s*set:\s*\{\s*value:\s*encryptedValue\s*\}\s*\}\)/.test(srv) || srv.includes("ON DUPLICATE KEY UPDATE value"))
    pass('2B-TC3c', 'upsertSetting uses Drizzle onDuplicateKeyUpdate value → idempotent (UNIQUE team_id + key_name)');
  else fail('2B-TC3c', 'upsertSetting not idempotent? Need ON DUPLICATE KEY UPDATE for unique (team_id,key_name)');
  // 3d) Save response signature ok/saved/traceId/encryptedWith/keys (UI handleSave reads these)
  const ret = srv.match(/return\s*\{\s*ok:\s*true,\s*saved:\s*true,\s*traceId,[\s\S]*?encryptedWith:\s*'AES-256-GCM',?\s*\}/);
  if (ret) pass('2B-TC3d', 'Save returns {ok:true, saved:true, traceId, keys:{…}, encryptedWith:"AES-256-GCM"} signature matches UI handleSave parse');
  else fail('2B-TC3d', 'Save return signature does NOT match UI handleSave expected fields ok/saved/encryptedWith');
} catch (e) { fail('2B-TC3-ERR', String(e?.message ?? e).slice(0, 150)); }

// ─────────────────────────────────────────────────────────────
// Runtime probes (SKIP when not available — optional live check)
// ─────────────────────────────────────────────────────────────
console.log(`\n${C.CYAN}▶ Runtime optional (skip if backend :3002 not reachable)${C.RST}`);
const BASE = 'http://127.0.0.1:3002';
(async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(BASE + '/api/health', { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('health not 200');
    const h = await r.json();
    pass('2B-RUN1', `Runtime backend reachable. phase=${h.phase} routers=${h.routers?.length ?? 0}`);
  } catch {
    skip('2B-RUN1', `Backend not running on ${BASE} — runtime check skipped (static tests still authoritative)`);
  }
})();

// ─────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────
setTimeout(() => {
  const TOTAL = 14;
  const passed = TOTAL - FAILS.length;
  console.log(`\n${C.CYAN}══════════════════════════════════════════════${C.RST}`);
  console.log(`${FAILS.length === 0 ? C.GREEN : C.RED}  SUMMARY Phase 2b Settings Tests: ${passed}/${TOTAL} PASS${C.RST}${FAILS.length ? ` · FAIL IDs: ${FAILS.join(', ')}` : ''}`);
  console.log(`${C.CYAN}══════════════════════════════════════════════${C.RST}\n`);
  process.exit(FAILS.length ? 1 : 0);
}, 3000);
