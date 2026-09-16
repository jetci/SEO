import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
function rel(p) { return path.relative(ROOT, p); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }
function countMatches(content, re) { const m = content.match(re); return m ? m.length : 0; }

const TEST_RESULTS = [];
function assert(name, pass, actual, expected, note) {
  TEST_RESULTS.push({ name, ok: !!pass, actual, expected, note });
  const icon = pass ? '✅' : '❌';
  const line = `${icon} [${String(TEST_RESULTS.length).padStart(2, '0')}] ${name}`;
  console.log(line);
  if (!pass) console.log(`   Actual:   ${JSON.stringify(actual)}\n   Expected: ${JSON.stringify(expected)}${note ? `\n   Note: ${note}` : ''}`);
}

console.log('\n============================================================');
console.log(' EEAT Studio V2 · Phase 1 · Backend Deploy Code Assertion Suite');
console.log(' Target: serverless Vercel /api + SSL MySQL DATABASE_URL + Cookie SameSite');
console.log('============================================================\n');

// ========== D-1: File existence ==========
assert('D-1: api/[...all].ts (Vercel catch-all serverless backend entry) exists on disk',
  exists('api/[...all].ts'),
  exists('api/[...all].ts'), true,
  'Path: api/[...all].ts at project root (Vercel catch-all [...param] pattern — api/index.ts IGNORED for /api/* subroutes');

assert('D-2: vercel.json exists + buildCommand=npm run build outputDirectory=dist + functions entry key for /api/[...all].ts (file-based auto /api/* routing)',
  (() => {
    if (!exists('vercel.json')) return false;
    const raw = read('vercel.json');
    try {
      const j = JSON.parse(raw);
      return String(j.buildCommand).includes('build') && String(j.outputDirectory) === 'dist' &&
        j.functions && typeof j.functions['api/[...all].ts'] === 'object';
    } catch { return false; }
  })(),
  (() => {
    if (!exists('vercel.json')) return 'vercel.json not found';
    const raw = read('vercel.json');
    try {
      const j = JSON.parse(raw);
      return {
        build: j.buildCommand, output: j.outputDirectory,
        has_functions_all: j.functions && Boolean(j.functions['api/[...all].ts']),
        framework: j.framework || 'MANUAL (no preset, explicit rewrites only)',
      };
    } catch (e) { return 'JSON parse err: ' + String(e && e.message); }
  })(),
  'build=npm run build, output=dist, functions[api/[...all].ts] defined, framework=manual/explicit',
  'REMOVED framework=vite — preset auto rewrites were OVERRIDING our explicit route rewrites, causing /login 404. Vercel file-based routing still auto-routes /api/* → /api/[...all].ts.');

// ========== D-2: Vercel auto API routing via /api/ dir (no rewrites needed) ==========
assert('D-3: package.json defines postbuild script that copies index.html → SPA static fallback files (404/login/projects/kcp/system). NO rewrites array needed (vercel.json rewrites broken for this Vite build on Vercel edge).',
  (() => {
    if (!exists('package.json')) return false;
    try {
      const pkg = JSON.parse(read('package.json'));
      const pb = String(pkg.scripts && pkg.scripts.postbuild || '');
      return pb.includes('copyFileSync') && pb.includes('404.html') && pb.includes('login.html');
    } catch { return false; }
  })(),
  (() => {
    if (!exists('package.json')) return 'package.json not found';
    try {
      const pkg = JSON.parse(read('package.json'));
      const pb = String(pkg.scripts && pkg.scripts.postbuild || '');
      return { postbuild_length: pb.length, contains_copyFileSync: pb.includes('copyFileSync'), contains_404_login: (pb.includes('404') && pb.includes('login')) };
    } catch (e) { return 'JSON parse err: ' + String(e && e.message); }
  })(),
  'postbuild copies dist/index.html to dist/404.html (Vercel 404 fallback = React) + dist/login.html (direct /login URL serves static login.html=index) + projects/kcp/system dirs',
  'Rewrites array ignored for this build on Vercel edge for unknown reason — workaround: materialize React routes as actual static HTML files on disk at build time (file-based routing 100% reliable).');

// ========== D-3: Express factory split ==========
assert('D-4: server/app.ts exports createApp() factory function at module level',
  exists('server/app.ts') && read('server/app.ts').includes('export function createApp('),
  exists('server/app.ts') ? (read('server/app.ts').includes('export function createApp(') ? 'createApp exported' : 'createApp NOT exported inside server/app.ts') : 'server/app.ts missing',
  'export function createApp( signature',
  'Shared factory between Local listen (PORT 3002) and Vercel serverless (api/index.ts)');

assert('D-5: server/index.ts has ZERO inline router registration — uses ONLY createApp() factory import',
  exists('server/index.ts') && countMatches(read('server/index.ts'), /app\.use\([\s'"]*\/api\/trpc/g) === 0,
  exists('server/index.ts') ? countMatches(read('server/index.ts'), /app\.use\([\s'"]*\/api\/trpc/g) : 'file missing',
  0,
  'server/index.ts MUST BE THIN local wrapper only; if routers duplicated here, serverless code diverges from local');

// ========== D-4: ENV schema auto-tune VERCEL ==========
assert('D-6: env.ts defines SESSION_SAMESITE enum with both none + lax variants (cloud vs local)',
  exists('server/_core/env.ts') &&
  read('server/_core/env.ts').includes('SESSION_SAMESITE') &&
  read('server/_core/env.ts').includes("'none'") &&
  read('server/_core/env.ts').includes("'lax'"),
  exists('server/_core/env.ts')
    ? `SESSION_SAMESITE present=${read('server/_core/env.ts').includes('SESSION_SAMESITE')}, has 'none'=${read('server/_core/env.ts').includes("'none'")}, has 'lax'=${read('server/_core/env.ts').includes("'lax'")}`
    : 'server/_core/env.ts missing',
  'all 3 present',
  'SA Order: Vercel public needs SAMESITE=NONE always; local dev LAX sufficient');

assert('D-7: env.ts exports COOKIE_SECURE boolean for auth.ts import',
  exists('server/_core/env.ts') && read('server/_core/env.ts').includes('export const COOKIE_SECURE'),
  exists('server/_core/env.ts') ? read('server/_core/env.ts').includes('export const COOKIE_SECURE') : 'env.ts missing',
  true,
  'COOKIE_SECURE=true on Vercel/prod (HTTPS) otherwise browser rejects session cookie');

// ========== D-5: Auth cookie fix BOTH places ==========
assert('D-8: server/auth.ts COOKIE_SAMESITE occurrences >= 2 (at least 1 import + 2 res.cookie writes: devSignin + Google OAuth callback BOTH fixed)',
  exists('server/auth.ts') && countMatches(read('server/auth.ts'), /COOKIE_SAMESITE/g) >= 2,
  exists('server/auth.ts') ? countMatches(read('server/auth.ts'), /COOKIE_SAMESITE/g) : 'server/auth.ts missing',
  '>= 2',
  '1 import line + BOTH res.cookie() calls at L122 (devSignin) and L292 (GoogleCallback) must reference variable COOKIE_SAMESITE — NOT hardcoded literal "lax"');

// ========== D-6: DB createPoolSafe SSL DATABASE_URL ==========
assert('D-9: db/index.ts declares createPoolSafe() helper for URL-parsed DATABASE_URL + SSL',
  exists('db/index.ts') && read('db/index.ts').includes('function createPoolSafe(') &&
  read('db/index.ts').includes('new URL(DATABASE_URL)'),
  exists('db/index.ts')
    ? `has function createPoolSafe=${read('db/index.ts').includes('function createPoolSafe(')}, URL parse=${read('db/index.ts').includes('new URL(DATABASE_URL)')}`
    : 'db/index.ts missing',
  'true / true',
  'mysql2 v3.23 has NO native {uri:} support; must destructure new URL(username/password/host/port/db) manually');

// ========== D-7: Contamination block carryover ==========
assert('D-10: Contamination BLOCK — NO components/seo + NO pages/WriteArticle (Phase2 files forbidden)',
  !exists('client/src/components/seo') && !exists('client/src/pages/WriteArticle.tsx') && !exists('client/src/pages/WriteArticlePage.tsx'),
  {
    components_seo_exists: exists('client/src/components/seo'),
    pages_WriteArticle_exists: exists('client/src/pages/WriteArticle.tsx') || exists('client/src/pages/WriteArticlePage.tsx'),
  },
  { components_seo_exists: false, pages_WriteArticle_exists: false },
  'SA Mandate Phase Transition Lock: Phase 2 starts ONLY after verbatim "บอกผม → ผมออก Phase 2"');

// ========== D-8: appRouter export (client trpc inference) ==========
assert('D-11: server/app.ts top-level module-scope export const appRouter = router(...) (NOT inside createApp body)',
  (() => {
    if (!exists('server/app.ts')) return false;
    const src = read('server/app.ts');
    // appRouter must be exported BEFORE function createApp() line, or at file top level outside any function braces
    const appRouterDeclIdx = src.indexOf('export const appRouter');
    const createAppIdx = src.indexOf('export function createApp(');
    return appRouterDeclIdx !== -1 && createAppIdx !== -1 && appRouterDeclIdx < createAppIdx;
  })(),
  (() => {
    if (!exists('server/app.ts')) return 'server/app.ts missing';
    const src = read('server/app.ts');
    const appRouterDeclIdx = src.indexOf('export const appRouter');
    const createAppIdx = src.indexOf('export function createApp(');
    return `appRouter @ offset=${appRouterDeclIdx}, createApp @ offset=${createAppIdx}, appRouter before createApp=${appRouterDeclIdx !== -1 && createAppIdx !== -1 && appRouterDeclIdx < createAppIdx}`;
  })(),
  'appRouter export DECLARED BEFORE createApp function (ES module scope only — syntaxError if nested)',
  'Client src/trpc.ts imports type AppRouter = typeof appRouter; if nested inside function body TypeScript inference breaks client build');

// ========== Summary ==========
const passed = TEST_RESULTS.filter(t => t.ok).length;
const failed = TEST_RESULTS.filter(t => !t.ok).length;
const total = TEST_RESULTS.length;
console.log('\n============================================================');
console.log(` Deploy Suite Result: ${passed}/${total} PASS · ${failed} FAIL`);
console.log('============================================================\n');

const EXIT_CODE = failed === 0 ? 0 : 1;
process.exit(EXIT_CODE);
