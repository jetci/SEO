// ============================================================
// P0 Auth Refresh Bug — LOCAL Assertions Test
// FIX INVENTORY:
//   A (Client): trpc.ts global 401/FORBIDDEN -> __markAuthCacheInvalid NOT redirect
//   B (Client): useAuth.ts exports markAuthCacheInvalid + globalThis bridge
//   C (Server): trpc.ts createContext -> sliding touchSessionCookie (each valid request)
//   D (Server): auth.ts devSignin + Google callback -> unified sessionCookieOptions domain
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const useAuth = fs.readFileSync(path.join(ROOT, 'client/src/hooks/useAuth.ts'), 'utf8');
const trpc = fs.readFileSync(path.join(ROOT, 'client/src/trpc.ts'), 'utf8');
const srvTrpc = fs.readFileSync(path.join(ROOT, 'server/_core/trpc.ts'), 'utf8');
const auth = fs.readFileSync(path.join(ROOT, 'server/auth.ts'), 'utf8');

let passed = 0, failed = 0;
const results = [];
function a(cond, msg, g = '?') {
  if (cond) { passed++; results.push({ ok: true, g, msg }); console.log('  ✅', String(passed).padStart(2, '0'), '[' + g + ']', msg); }
  else { failed++; results.push({ ok: false, g, msg }); console.error('  ❌ FAIL', '[' + g + ']', msg); }
}

console.log('P0 Auth Refresh Bug Local Assertions\n');

// ---- Group A: Client Fix 1a (Race no redirect on 401) ----
{
  const G = 'A';
  a(/export\s+function\s+markAuthCacheInvalid/.test(useAuth), `A1 useAuth.ts EXPORT markAuthCacheInvalid (clear cache NO redirect)`, G);
  a(/globalThis\s+as\s+any\)\.__markAuthCacheInvalid\s*=\s*markAuthCacheInvalid/.test(useAuth), 'A2 globalThis.__markAuthCacheInvalid bridge attached', G);
  a(/markAuthCacheInvalid\(prefix\s*\+\s*suffix\)/.test(trpc), 'A3 trpc.ts globalOnAny401OrForbidden calls __markAuthCacheInvalid NOT markAuthLoggedOut', G);
  // Ensure OLD markAuthLoggedOut NOT called within globalOnAny401OrForbidden inside trpc.ts anymore!
  const funcBody = trpc.match(/function\s+globalOnAny401OrForbidden[\s\S]*?^}/m)?.[0] ?? '';
  a(!/__markAuthLoggedOut/.test(funcBody), 'A4 globalOnAny401OrForbidden BODY has NO __markAuthLoggedOut (redirect removed!)', G);
  a(/NO\s+redirect/.test(trpc) || /NEVER\s+CALLS\s+markAuthLoggedOut/.test(trpc), 'A5 Comment asserts: NO redirect from tRPC layer. Redirect only useAuth me query effect', G);
}

// ---- Group B: useAuth.ts redirect still guarded by AUTH.ME EXPLICIT code (not global!) ----
{
  const G = 'B';
  a(/me\.error\?\.data\?\.code\s*===\s*['"]UNAUTHORIZED['"]/.test(useAuth), 'B1 useAuth redirect ONLY via auth.me useEffect explicit server error code', G);
  a(/markAuthLoggedOut\(.*UNAUTHORIZED/.test(useAuth), 'B2 me error explicit UNAUTHORIZED code THEN decides markAuthLoggedOut redirect', G);
  a(/serverRejected\s*=[\s\S]*?UNAUTHORIZED[\s\S]*?FORBIDDEN[\s\S]*?!loading\s*&&\s*!isLoggedIn\s*&&\s*serverRejected/m.test(fs.readFileSync(path.join(ROOT, 'client/src/layouts/MainDashboardShell.tsx'), 'utf8')), 'B3 MainDashboardShell L87 redirect guard requires loading+isLoggedIn+serverRejected ALL conditions', G);
}

// ---- Group C: Server trpc.ts createContext -> Sliding touchSessionCookie ----
{
  const G = 'C';
  a(/export\s+async\s+function\s+touchSessionCookie/.test(srvTrpc), 'C1 touchSessionCookie export sliding renewal helper', G);
  a(/createSessionToken\(session\.openId[\s\S]*?name:\s*session\.name/.test(srvTrpc), 'C2 touchSessionCookie -> createSessionToken NEW signed JWT with name', G);
  a(/res\.cookie\(ENV\.SESSION_COOKIE_NAME\s*,\s*freshToken/.test(srvTrpc), 'C3 touchSessionCookie Set-Cookie maxAge=24h httpOnly path=/', G);
  a(/if\s*\(\s*session\s*\)\s*touchSessionCookie\(res\s*,\s*session\s*\)/.test(srvTrpc), 'C4 createContext() after valid verify → calls touchSessionCookie EVERY valid request → sliding 24h refresh', G);
  a(/sessionCookieDomain\([\s\S]*?new\s+URL\(ENV\.APP_URL\)[\s\S]*?host/.test(srvTrpc), 'C5 sessionCookieDomain helper derives hostname from APP_URL (fix host-only gap)', G);
  a(/IP.*skip.*domain|localhost|127\.0\.0\.1.*skip/.test(srvTrpc) || /skip domain=/.test(srvTrpc) || /domain=.*for IP/.test(srvTrpc), 'C6 IP/localhost safe: domain attribute undefined (skip for IPs)', G);
}

// ---- Group D: auth.ts unified sessionCookieOptions consistency ----
{
  const G = 'D';
  a(/function\s+sessionCookieOptions\(expiresMs/.test(auth), 'D1 sessionCookieOptions helper centralized', G);
  a(/domain\s*\?\s*\{\s*domain\s*\}\s*:\s*\{\}/.test(auth), 'D2 options include site-wide domain (derived APP_URL) like createContext', G);
  a(/ctx\.res\.cookie\(ENV\.SESSION_COOKIE_NAME\s*,\s*token\s*,\s*sessionCookieOptions\(expiresMs\)\)/.test(auth), 'D3 devSignin uses sessionCookieOptions (consistent)', G);
  a(/res\.cookie\(ENV\.SESSION_COOKIE_NAME\s*,\s*sessionToken\s*,\s*sessionCookieOptions\(expiresMs\)\)/.test(auth), 'D4 Google OAuth callback uses sessionCookieOptions (consistent)', G);
}

// ---- Group E: Regression guard (old Phase 2J markAuthLoggedOut NOT DELETED - still exported for useAuth) ----
{
  const G = 'E';
  a(/export\s+function\s+markAuthLoggedOut/.test(useAuth), 'E1 markAuthLoggedOut still exported for REAL auth.me confirmed dead session redirect', G);
  a(/globalThis\s+as\s+any\)\.__markAuthLoggedOut\s*=\s*markAuthLoggedOut/.test(useAuth), 'E2 globalThis.__markAuthLoggedOut bridge intact (for actual logout flows)', G);
}

console.log(`\n==== P0 Auth Refresh Bug Local: ${passed} PASS / ${failed} FAIL / TOTAL ${passed + failed} ====`);
for (const r of results) if (!r.ok) console.log('  FAIL', String(r.g).padEnd(2), r.msg);
process.exit(failed === 0 ? 0 : 1);
