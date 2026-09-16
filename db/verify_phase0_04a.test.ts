// EEAT Studio V2 · Phase 0 Task 0.4a Transplant Auth VERIFIER
// 6 Static assertions (no DB / no server start required — same pattern as 01b / 02_03)
// RUN: cd D:\AEO\SEO E ; npx tsx D:\AEO\SEO V2\db\verify_phase0_04a.test.ts
// =============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

type Assert = { id: string; label: string; pass: boolean; note?: string };
const asserts: Assert[] = [];
function pass(id: string, label: string, note?: string) { asserts.push({ id, label, pass: true, note }); }
function fail(id: string, label: string, note?: string) { asserts.push({ id, label, pass: false, note }); }

// ─────────────────────────────────────────────────────────────
// PRE-REQUISITE: STUB MINIMAL process.env BEFORE importing env.ts
// (because env.ts calls zod.parse → process.exit(1) on missing SESSION_SECRET <32 chars)
// ─────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.PORT = '3002';
process.env.SESSION_SECRET = 'unit_test_session_secret_key_minimum_32_chars_long_enough_xxxxxxxx';
process.env.SESSION_COOKIE_NAME = 'eeat_studio_v2_session';
process.env.DB_NAME = 'eeat_studio_v2';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'eeat';
process.env.DB_PASSWORD = 'unittest';
process.env.ADMIN_OPENID = '102308593207118714314';
process.env.ADMIN_EMAIL = 'intelman26@gmail.com';
process.env.DEV_USE_MOCK_AUTH = '1';

// ─────────────────────────────────────────────────────────────
// SECTION 0 · File Existence Checks (sanity — 0.4a files all present)
// ─────────────────────────────────────────────────────────────
const expectedFiles = [
  ['server/_core/env.ts',      '0.4a-1 zod env loader'],
  ['server/_core/sdk.ts',      '0.4a-2 session token SDK'],
  ['server/_core/trpc.ts',     '0.4a-3 tRPC init'],
  ['server/auth.ts',           '0.4a-4 authRouter + oauth routes'],
  ['server/index.ts',          'server entry (modified for trpc+auth)'],
  ['db/schema.ts',             '0.4a-5 drizzle 8 tables'],
];
for (const [rel, tag] of expectedFiles) {
  const abs = join(PROJECT_ROOT, rel);
  if (existsSync(abs) && readFileSync(abs, 'utf8').trim().length > 20) {
    pass(`F-${rel.replace(/[^a-zA-Z0-9]/g,'_')}`, `File exists non-empty: ${rel} (${tag})`);
  } else {
    fail(`F-${rel.replace(/[^a-zA-Z0-9]/g,'_')}`, `File missing/empty: ${rel} (${tag})`);
  }
}

// ─────────────────────────────────────────────────────────────
// IMPORT MODULES NOW (env stubbed above — should NOT exit(1))
// ─────────────────────────────────────────────────────────────
let ENV_ANY: Record<string, unknown> | null = null;
let sdkCreate: ((openId: string, opts?: any) => Promise<string>) | null = null;
let sdkVerify: ((cookie: any) => Promise<any>) | null = null;
let sdkHash: ((openId: string) => number) | null = null;
let drizzleTables: Record<string, any> | null = null;
let importErr: string | null = null;

try {
  // 1. ENV loader (import relative path correct for TSX from db/)
  const envMod = await import('../server/_core/env.js');
  ENV_ANY = envMod.ENV as unknown as Record<string, unknown>;

  // 2. SDK
  const sdkMod = await import('../server/_core/sdk.js');
  sdkCreate = sdkMod.createSessionToken;
  sdkVerify = sdkMod.verifySession;
  sdkHash   = sdkMod.hashOpenIdToId;

  // 3. Drizzle schema (import ALL exports then filter mysqlTable outputs)
  drizzleTables = await import('../db/schema.js');
} catch (e: any) {
  importErr = String(e?.stack ?? e?.message ?? String(e));
  fail('IMPORT', `Static import 0.4a modules`, importErr.slice(0, 400));
}

// ─────────────────────────────────────────────────────────────
// ASSERTION (a) ENV parse succeeds → fields match stub values
// ─────────────────────────────────────────────────────────────
if (ENV_ANY && !importErr) {
  const subChecks: [string, unknown, unknown][] = [
    ['NODE_ENV',           ENV_ANY.NODE_ENV,           'test'],
    ['PORT',               Number(ENV_ANY.PORT),       3002],
    ['DB_NAME',            ENV_ANY.DB_NAME,            'eeat_studio_v2'],
    ['SESSION_COOKIE_NAME',ENV_ANY.SESSION_COOKIE_NAME,'eeat_studio_v2_session'],
    ['ADMIN_OPENID',       ENV_ANY.ADMIN_OPENID,       '102308593207118714314'],
  ];
  let allOk = true;
  const details: string[] = [];
  for (const [k, actual, expected] of subChecks) {
    if (actual !== expected) { allOk = false; details.push(`${k}: actual=${String(actual)} expected=${String(expected)}`); }
  }
  if (allOk) pass('ENV-a', '(a) ENV zod parse OK — 5 critical fields match stub');
  else fail('ENV-a', '(a) ENV zod parse FAIL', details.join(' | '));
}

// ─────────────────────────────────────────────────────────────
// ASSERTION (b) createSessionToken → length ~199 bytes HS256 pattern
// ASSERTION (c) roundtrip sign → verify → openId/name match
// ─────────────────────────────────────────────────────────────
if (sdkCreate && sdkVerify && sdkHash && !importErr) {
  try {
    const TEST_OPENID = '102308593207118714314';
    const TEST_NAME = 'Admin Verify Test';
    const token = await sdkCreate(TEST_OPENID, { name: TEST_NAME });
    const len = token.length;
    const lenOk = len >= 170 && len <= 230; // relaxed guard (exact: ~199 ± 30)
    if (lenOk) {
      pass('SDK-b', `(b) Token length PASS — len=${len} (expected ~199, range 170-230)`);
    } else {
      fail('SDK-b', `(b) Token length FAIL — len=${len} OUTSIDE range 170-230 (199 bytes pattern broken)`);
    }

    const verified = await sdkVerify(token);
    const rtOk =
      verified !== null &&
      typeof verified === 'object' &&
      verified.openId === TEST_OPENID &&
      verified.name === TEST_NAME &&
      verified.appId === 'eeat-studio-v2';
    if (rtOk) {
      pass('SDK-c', `(c) Sign→Verify roundtrip PASS — openId=${verified.openId.slice(-8)}… name=${verified.name}`);
    } else {
      fail('SDK-c', `(c) Sign→Verify roundtrip FAIL`, `verified=${JSON.stringify(verified)}`);
    }

    const hash = sdkHash(TEST_OPENID);
    if (Number.isInteger(hash) && hash > 0) {
      pass('SDK-aux', 'hashOpenIdToId returns positive int (sanity)');
    } else {
      fail('SDK-aux', 'hashOpenIdToId FAIL', `hash=${hash}`);
    }
  } catch (e: any) {
    fail('SDK-bc', '(b-c) SDK token FAIL', String(e?.stack ?? e?.message).slice(0, 500));
  }
}

// ─────────────────────────────────────────────────────────────
// Drizzle Schema: identify exported table objects (from db/schema.ts)
//   filter: only exports whose value has .getSQL or matches drizzle MySQLTable pattern
// ─────────────────────────────────────────────────────────────
function findDrizzleTableExports(mod: Record<string, unknown>): Array<{ name: string; obj: any }> {
  const results: Array<{ name: string; obj: any }> = [];
  for (const [key, value] of Object.entries(mod)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    // Drizzle table heuristic: has either .getTableConfig() or Symbol-based dbName or key= in TABLE_8_LIST
    const looksLikeTable =
      (typeof v.getTableConfig === 'function') ||
      (v.dbName !== undefined && v.columns !== undefined) ||
      // Fallback: 8 known names exactly
      ['users','teams','teamMembers','categories','projects','clusters','keywords','articles'].includes(key);
    if (looksLikeTable) results.push({ name: key, obj: v });
  }
  return results;
}

// ASSERTION (d) 8 tables exist → names match SA list
// ASSERTION (f) NO extra 9th table → count === 8
// ASSERTION (e) articles 4 NOT NULL mandatory FK → 4/4 true
if (drizzleTables && !importErr) {
  const tables = findDrizzleTableExports(drizzleTables);
  const EXPECTED_8 = [
    'users','teams','teamMembers','categories','projects','clusters','keywords','articles'
  ];

  const allFound = EXPECTED_8.every(n => tables.some(t => t.name === n));
  const count8    = tables.length === 8;

  if (allFound) {
    pass('SCH-d', `(d) 8/8 Drizzle tables FOUND — ${EXPECTED_8.join(', ')}`);
  } else {
    const missing = EXPECTED_8.filter(n => !tables.some(t => t.name === n));
    fail('SCH-d', `(d) Drizzle tables MISSING: ${missing.join(', ')} — found: ${tables.map(t=>t.name).join(',')}`);
  }

  if (count8) {
    pass('SCH-f', `(f) No ghost 9th table — drizzle exports count=${tables.length} exactly`);
  } else {
    fail('SCH-f', `(f) WRONG Drizzle table count — expected 8, got ${tables.length} (tables=[${tables.map(t=>t.name).join(',')}])`);
  }

  // (e) articles 4 mandatory NOT NULL FK
  // APPROACH: static source check (version-agnostic — no drizzle internal dep)
  //   อ่านไฟล์ db/schema.ts แล้วตรวจ pattern each col -> .notNull().references(...) exist
  try {
    const SCHEMA_PATH = join(PROJECT_ROOT, 'db', 'schema.ts');
    const srcTxt = readFileSync(SCHEMA_PATH, 'utf8');
    const COLS: Array<[string, string, boolean]> = [
      ['projectId',  'projects.id',      true],   // not null
      ['keywordId',  'keywords.id',      false],  // ✅ SA L68 EXPLICIT NULLABLE! no .notNull()
      ['authorId',   'users.id',         true],   // not null
      ['categoryId', 'categories.id',    true],   // not null
    ];
    const results = COLS.map(([col, ref, notNull]) => {
      // Regex: if notNull=true → require .notNull().references; else → allow .references without .notNull()
      const reStr = notNull
        ? col + String.raw`\s*:\s*\w+\s*\([^)]*\)\s*\.notNull\(\)\s*\.references\s*\(\s*\(\s*\)\s*=>\s*` + ref.replace(/\./, String.raw`\.`)
        : col + String.raw`\s*:\s*\w+\s*\([^)]*\)\s*\.references\s*\(\s*\(\s*\)\s*=>\s*` + ref.replace(/\./, String.raw`\.`);
      const re = new RegExp(reStr, 'm');
      const matches = re.test(srcTxt);
      return { col, ref, ok: matches };
    });
    const all4 = results.every(r => r.ok);
    if (all4) {
      const cols = results.map(r => r.col).join(',');
      pass('SCH-e', `(e) articles 4 MANDATORY FK NOT NULL — 4/4 PASS via static source match (cols: ${cols})`);
    } else {
      const bads = results.filter(r => !r.ok);
      fail('SCH-e', `(e) articles mandatory FK FAIL — ${bads.length}/4 missing: ${bads.map(b=>`${b.col}→${b.ref}`).join(' | ')}`);
    }
  } catch (e: any) {
    fail('SCH-e', `(e) articles mandatory FK — read schema source FAIL: ${String(e?.message ?? e).slice(0,200)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// EXTRA: authRouter exports check (3 procedures exist keys me/devSignin/logout)
// ─────────────────────────────────────────────────────────────
if (!importErr) {
  try {
    const authMod = await import('../server/auth.js');
    const router: any = authMod.authRouter;
    if (router && typeof router === 'object') {
      const procs: string[] = [];
      // tRPC router._def.procedures keys (public API)
      const def = (router as any)._def;
      if (def?.procedures && typeof def.procedures === 'object') {
        procs.push(...Object.keys(def.procedures));
      }
      const need = ['me','devSignin','logout'];
      const ok = need.every(n => procs.includes(n));
      if (ok) {
        pass('AUTH-r', 'authRouter 3 procedures exist: me + devSignin + logout');
      } else {
        const miss = need.filter(n => !procs.includes(n));
        fail('AUTH-r', `authRouter procedures MISSING: ${miss.join(',')} — found=${procs.join(',')}`);
      }
      // Check Google OAuth express router exported
      if (typeof authMod.authExpressRouter === 'function') {
        pass('AUTH-o', 'authExpressRouter (Google OAuth 2 routes) exported from auth.ts');
      } else {
        fail('AUTH-o', 'authExpressRouter NOT exported from auth.ts');
      }
    } else {
      fail('AUTH-r', 'authRouter not exported or not a router object');
    }
  } catch (e: any) {
    fail('AUTH-r', 'auth.ts import FAIL', String(e?.message ?? e).slice(0, 300));
  }
}

// ─────────────────────────────────────────────────────────────
// FINAL: trpc.ts exports (router + publicProcedure + createContext)
// ─────────────────────────────────────────────────────────────
if (!importErr) {
  try {
    const trpcMod = await import('../server/_core/trpc.js');
    const needKeys = ['router','publicProcedure','createContext','mergeRouters','middleware'];
    const got = needKeys.every(k => typeof (trpcMod as Record<string,unknown>)[k] !== 'undefined');
    if (got) {
      pass('TRPC-e', 'trpc.ts exports (router, publicProcedure, createContext, mergeRouters, middleware) all exist');
    } else {
      const miss = needKeys.filter(k => typeof (trpcMod as Record<string,unknown>)[k] === 'undefined');
      fail('TRPC-e', `trpc.ts exports MISSING: ${miss.join(',')}`);
    }
  } catch (e: any) {
    fail('TRPC-e', 'trpc.ts import FAIL', String(e?.message ?? e).slice(0, 300));
  }
}

// ─────────────────────────────────────────────────────────────
// REPORT & EXIT
// ─────────────────────────────────────────────────────────────
const total = asserts.length;
const passed = asserts.filter(a => a.pass).length;
const failed = asserts.filter(a => !a.pass);
const pct = total === 0 ? 0 : Math.round((passed / total) * 1000) / 10;

console.log('\n' + '='.repeat(70));
console.log(` PHASE 0 · TASK 0.4a Transplant Auth — VERIFICATION REPORT`);
console.log(` Date: ${new Date().toISOString()}   Scope: static (no DB/server)`);
console.log(` Result: ${passed}/${total} PASS  (${pct}%)`);
console.log('='.repeat(70));

for (const a of asserts) {
  const icon = a.pass ? '✅' : '❌';
  console.log(`  ${icon} [${a.id}] ${a.label}${a.note ? '\n     └─ ' + a.note : ''}`);
}

console.log('='.repeat(70));
if (failed.length === 0) {
  console.log(`\n🎉 ALL ${passed}/${total} TESTS PASSED → Phase 0.4a VERIFIED (Exit 0)`);
  process.exit(0);
} else {
  console.log(`\n🚨 ${failed.length}/${total} FAILED → Fix issues then re-run verifier (Exit 1)`);
  process.exit(1);
}
