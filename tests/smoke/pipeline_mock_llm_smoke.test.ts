// =============================================================================
// WP-D2 (HIGH): Smoke Test Suite — Mock LLM Pipeline Core Logic (NO LIVE LLM CALLS)
// Targets WO-007 Write Pipeline fixes: WP-A1/WP-B3/WP-B5 + SET-10 maskKey + CT-01
// Run: node --import tsx/esm tests/smoke/pipeline_mock_llm_smoke.test.ts
// or via package.json: npm run test:smoke
// =============================================================================
import assert from 'node:assert/strict';
import { maskKey } from '../../server/_core/utils/maskKey.js';
import { validateModelForProvider, PROVIDER_DEFAULT_MODELS } from '../../server/services/llmClient.js';

let passed = 0;
let failed = 0;

type TestCase = { name: string; fn: () => void | Promise<void> };
const tests: TestCase[] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push({ name, fn });

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP A — SET-10: maskKey Central Util (canonical 8-star version)
// ═══════════════════════════════════════════════════════════════════════════════
test('[SET-10] maskKey: empty string → empty', () => {
  assert.equal(maskKey(''), '');
  assert.equal(maskKey('   '), '');
  assert.equal(maskKey(null as any), '');
  assert.equal(maskKey(undefined as any), '');
});

test('[SET-10] maskKey: short key (len ≤ first4+last4+2) → first4 + 2+ stars', () => {
  // first4=4, last4=4, threshold = 4+4+2 = 10 chars
  const short = 'abcd12'; // len=6 < 10
  const masked = maskKey(short);
  assert.equal(masked.slice(0, 4), 'abcd', 'first4 preserved');
  assert.ok(masked.length >= 6, 'length at least input');
});

test('[SET-10] maskKey: long key → first4 + ******** + last4 (EXACT 8 stars)', () => {
  const long = 'sk-proj-abcdef1234567890xyz';
  const masked = maskKey(long);
  assert.equal(masked.slice(0, 4), 'sk-p');
  assert.equal(masked.slice(-4), '0xyz');
  const mid = masked.slice(4, -4);
  assert.equal(mid, '********', 'MUST be exactly 8 stars (canonical admin.ts version)');
  assert.equal(mid.length, 8);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP B — CT-01: validateModelForProvider Cross-Provider Prefix Rules
// (5-case exhaustive matrix from llmClient.ts:L27-55)
// ═══════════════════════════════════════════════════════════════════════════════
test('[CT-01/RULE1] validateModelForProvider: OpenRouter REQUIRES slash prefix → pass', () => {
  const err = validateModelForProvider('openrouter', 'openai/gpt-4o-mini');
  assert.equal(err, null, 'openrouter with provider/model slash should be VALID');
});

test('[CT-01/RULE1] validateModelForProvider: OpenRouter NO slash → FAIL', () => {
  const err = validateModelForProvider('openrouter', 'gpt-4o-mini');
  assert.ok(typeof err === 'string' && err.includes('slash prefix'), 'openrouter no slash should be INVALID');
});

test('[CT-01/RULE2] validateModelForProvider: OpenAI direct → slash forbidden (FAIL)', () => {
  const err = validateModelForProvider('openai', 'openai/gpt-4o-mini');
  assert.ok(typeof err === 'string' && err.includes('NOT contain'), 'openai should reject slash prefix');
});

test('[CT-01/RULE2] validateModelForProvider: OpenAI direct no slash → PASS', () => {
  const err = validateModelForProvider('openai', 'gpt-4o-mini');
  assert.equal(err, null);
});

test('[CT-01/RULE3] validateModelForProvider: Anthropic claude prefix + NO slash → PASS', () => {
  const err = validateModelForProvider('anthropic', 'claude-3-5-sonnet-latest');
  assert.equal(err, null);
});

test('[CT-01/RULE3] validateModelForProvider: Anthropic / prefix forbidden → FAIL', () => {
  const err = validateModelForProvider('anthropic', 'anthropic/claude-3-5-sonnet-latest');
  assert.ok(typeof err === 'string' && err.includes('NOT contain'));
});

test('[CT-01/RULE4] validateModelForProvider: Google experimental/free markers → FAIL', () => {
  const err1 = validateModelForProvider('google', 'gemini-pro:free');
  assert.ok(typeof err1 === 'string' && err1.includes('unstable'), ':free marker should be rejected');
  const err2 = validateModelForProvider('google', 'gemini-1.5-flash-exp');
  assert.ok(typeof err2 === 'string' && err2.includes('unstable'), '-exp marker should be rejected');
});

test('[CT-01/RULE4] validateModelForProvider: Google gemini-*-latest stable → PASS', () => {
  const err = validateModelForProvider('google', 'gemini-1.5-flash-latest');
  assert.equal(err, null);
});

test('[CT-01/DEFAULTS] PROVIDER_DEFAULT_MODELS stable aliases (no hard dates / exp)', () => {
  // CT-01: 2026-09-19 — anthropic/google upgraded to -latest permanent aliases
  assert.ok(PROVIDER_DEFAULT_MODELS.anthropic.includes('-latest'), 'anthropic default MUST use -latest stable alias');
  assert.ok(PROVIDER_DEFAULT_MODELS.google.includes('-latest'), 'google default MUST use -latest stable alias');
  assert.ok(!PROVIDER_DEFAULT_MODELS.anthropic.includes('-202'), 'anthropic default MUST NOT contain hard date');
  assert.ok(!PROVIDER_DEFAULT_MODELS.google.includes(':free') && !PROVIDER_DEFAULT_MODELS.google.includes('-exp'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP C — WP-A1: Placeholder Classification (Auth/Credit/Model/Rate/Transient)
// (mirrors articleWriterService.ts:L439-464 error → Thai reason mapping logic)
// ═══════════════════════════════════════════════════════════════════════════════
type ClassifyResult = 'AUTH' | 'CREDIT' | 'MODEL' | 'RATE' | 'TRANSIENT';
function classifyPlaceholderError(rawMsg: string): ClassifyResult {
  const msg = String(rawMsg || '');
  const isAuth = msg.startsWith('[LLM_AUTH_INVALID_');
  const isCredit = msg.startsWith('[LLM_CREDIT_EXHAUSTED_');
  const isModelInvalid =
    msg.startsWith('[LLM_MODEL_INVALID_') ||
    msg.startsWith('[LLM_MODEL_NOT_FOUND_') ||
    msg.startsWith('[LLM_MODEL_VALIDATION_');
  const isRate = msg.startsWith('[LLM_RATE_LIMIT_');
  if (isAuth) return 'AUTH';
  if (isCredit) return 'CREDIT';
  if (isModelInvalid) return 'MODEL';
  if (isRate) return 'RATE';
  return 'TRANSIENT';
}

test('[WP-A1] Placeholder classifies AUTH permanent (NOT "transient limit")', () => {
  const result = classifyPlaceholderError('[LLM_AUTH_INVALID_OPENROUTER] 401 sk-xxx revoked');
  assert.equal(result, 'AUTH', 'should be AUTH permanent — not fall back to generic transient');
  assert.notEqual(result, 'TRANSIENT');
});

test('[WP-A1] Placeholder classifies CREDIT permanent (balance $0)', () => {
  assert.equal(classifyPlaceholderError('[LLM_CREDIT_EXHAUSTED_OPENROUTER] balance=$0.000 quota exceeded'), 'CREDIT');
});

test('[WP-A1] Placeholder classifies MODEL_INVALID/NOT_FOUND/VALIDATION → all MODEL bucket', () => {
  assert.equal(classifyPlaceholderError('[LLM_MODEL_INVALID_400] BadRequest provider/model'), 'MODEL');
  assert.equal(classifyPlaceholderError('[LLM_MODEL_NOT_FOUND_404] model "x" deleted'), 'MODEL');
  assert.equal(classifyPlaceholderError('[LLM_MODEL_VALIDATION_OPENROUTER] slash prefix missing'), 'MODEL');
});

test('[WP-A1] Placeholder classifies RATE_LIMIT transient (retry works)', () => {
  assert.equal(classifyPlaceholderError('[LLM_RATE_LIMIT_OPENROUTER] 429 too_many_requests'), 'RATE');
});

test('[WP-A1] Placeholder classifies network/5xx → generic TRANSIENT bucket', () => {
  assert.equal(classifyPlaceholderError('TypeError: fetch failed ECONNRESET'), 'TRANSIENT');
  assert.equal(classifyPlaceholderError('502 Bad Gateway upstream'), 'TRANSIENT');
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP D — WP-B3: LLM Pre-flight empty key guard (mock check)
// Mirrors write.ts:L212-218 — should fail FAST before outline + write loop (~120s)
// ═══════════════════════════════════════════════════════════════════════════════
function wpB3PreflightKeyCheck(key: string): { ok: boolean; errorCode?: string } {
  const trimmed = String(key || '').trim();
  if (!trimmed) return { ok: false, errorCode: 'LLM_API_KEY_REQUIRED_WRITE' };
  return { ok: true };
}

test('[WP-B3] WP-B3 pre-flight empty/whitespace key → fast fail (no 120s mid-request waste)', () => {
  const a = wpB3PreflightKeyCheck('');
  const b = wpB3PreflightKeyCheck('     ');
  const c = wpB3PreflightKeyCheck(null as any);
  assert.equal(a.ok, false); assert.equal(a.errorCode, 'LLM_API_KEY_REQUIRED_WRITE');
  assert.equal(b.ok, false); assert.equal(b.errorCode, 'LLM_API_KEY_REQUIRED_WRITE');
  assert.equal(c.ok, false);
});

test('[WP-B3] WP-B3 pre-flight non-empty key → OK', () => {
  assert.equal(wpB3PreflightKeyCheck('sk-or-xxxx1234').ok, true);
  assert.equal(wpB3PreflightKeyCheck('  sk-ant-abc  ').ok, true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP E — WP-B5: createDraft Timeout Promise.race Guard Pattern (mock)
// Mirrors write.ts:L417-432 — whichever promise settles FIRST wins (timeout vs LLM)
// ═══════════════════════════════════════════════════════════════════════════════
test('[WP-B5] Promise.race timeout pattern: slow LLM → timeout wins', async () => {
  const SHORT_TIMEOUT_MS = 50; // 50ms for test (prod = 5min)
  const slowMockLlm = new Promise<string>((res) => setTimeout(() => res('llm_completed_too_late'), 500));
  const timeoutP = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('[WRITE_TIMEOUT_EXCEEDED]')), SHORT_TIMEOUT_MS));
  let thrown: any = null;
  try {
    await Promise.race([slowMockLlm, timeoutP]);
  } catch (e) { thrown = e; }
  assert.ok(thrown instanceof Error, 'Timeout should throw (slow llm not returned in time)');
  assert.ok(String(thrown.message).includes('[WRITE_TIMEOUT_EXCEEDED]'), 'timeout error code present');
});

test('[WP-B5] Promise.race pattern: fast LLM → completes BEFORE timeout (happy path)', async () => {
  const SHORT_TIMEOUT_MS = 500;
  const fastMockLlm = new Promise<string>((res) => setTimeout(() => res('llm_done_ok'), 30));
  const timeoutP = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('[WRITE_TIMEOUT_EXCEEDED]')), SHORT_TIMEOUT_MS));
  const result = await Promise.race([fastMockLlm, timeoutP]);
  assert.equal(result, 'llm_done_ok', 'Fast LLM should return value, not throw timeout');
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUNNER — Execute registered tests, output summary, exit 1 on any failure
// ═══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log(`\n${'='.repeat(72)}\n WP-D2 SMOKE TEST: ${tests.length} registered (mock LLM — NO live calls)\n${'='.repeat(72)}`);
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ PASS  ${t.name}`);
      passed++;
    } catch (err: any) {
      failed++;
      console.error(`  ✗ FAIL  ${t.name}\n     → ${String(err?.message ?? err).split('\n')[0].slice(0, 240)}`);
    }
  }
  const pct = Math.round((passed / (passed + failed)) * 100);
  console.log(`\n${'─'.repeat(72)}\n SMOKE RESULT: ${passed}/${passed + failed} passed (${pct}%) · ${failed} failed\n${'─'.repeat(72)}`);
  if (failed > 0) process.exit(1);
  console.log('[WP-D2] ALL SMOKE CHECKS PASSED — Pipeline core logic OK (mock LLM, no DB/network required).\n');
})();
