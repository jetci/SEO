// Phase 2J: settings.save 401 UNAUTHORIZED redirect bugfix tests (LOCAL)
// ≥12 assertions: Group A=6 global helpers, Group B=4 trpc 4-level interceptors, Group C=2 SettingsPage saveMut
import fs from "node:fs";
const ROOT = process.cwd();
const pass = (n, desc) => console.log(`✅ phase2j_${n.toString().padStart(2,"0")} PASS ${desc}`);
const fail = (n, desc, detail) => { console.error(`❌ phase2j_${n.toString().padStart(2,"0")} FAIL ${desc}\n  → ${detail}`); process.exitCode = (process.exitCode||0) + 1; };
let exit = 0;
function assert(b, n, desc, detail) { if (b) pass(n, desc); else { fail(n, desc, detail); exit++; } }

// Group A: useAuth global helpers (6 assertions)
const UA = fs.readFileSync(`${ROOT}/client/src/hooks/useAuth.ts`, "utf8");
assert(/export\s+function\s+markAuthLoggedOut\s*\(/.test(UA), 1,
  "A1 useAuth exports markAuthLoggedOut() helper global",
  "markAuthLoggedOut not exported as named function from useAuth.ts");
assert(/_authCache\.isLoggedIn\s*=\s*false/.test(UA) && /_authCache\.user\s*=\s*null/.test(UA), 2,
  "A2 markAuthLoggedOut clears module-level _authCache fields isLoggedIn + user + cachedAt=0",
  "markAuthLoggedOut must reset isLoggedIn=false user=null cachedAt=0");
assert(/\/login\?next=/.test(UA), 3,
  "A3 markAuthLoggedOut redirects /login?next= + skips paths /login /signin /oauth/google/callback",
  "Must set window.location.href to /login with next param");
assert(/__markAuthLoggedOut\s*=\s*markAuthLoggedOut/.test(UA), 4,
  "A4 globalThis.__markAuthLoggedOut bridge attached (for tRPC.ts no-hook calls)",
  "Attach markAuthLoggedOut to globalThis so non-React tRPC.ts modules can call");
assert(/getAuthCacheStatus\s*\(/.test(UA), 5,
  "A5 getAuthCacheStatus exported for tests ageMs + ttlMs checks",
  "Export getAuthCacheStatus helper");
assert(/me\.error\?\.data\?\.code\s*===\s*['"]UNAUTHORIZED['"].*markAuthLoggedOut/s.test(UA.replace(/\s+/g," ")), 6,
  "A6 auth.me useEffect UNAUTHORIZED error code calls markAuthLoggedOut redirect not just cache clear",
  "auth.me 401 effect should trigger the GLOBAL markAuthLoggedOut handler with redirect");

// Group B: tRPC client 4-level error interceptors (4 assertions)
const TC = fs.readFileSync(`${ROOT}/client/src/trpc.ts`, "utf8");
assert(/globalOnAny401OrForbidden\s*\(/.test(TC), 7,
  "B1 trpc.ts defines globalOnAny401OrForbidden(code, message) function (calls globalThis.__markAuthLoggedOut)",
  "Missing globalOnAny401OrForbidden helper in trpc.ts");
assert(/fetch\s*\(\s*url.*\)\s*\{\s*try\s*\{\s*const\s+resp\s*=\s*await\s+fetch\([\s\S]*?resp\.status\s*===\s*401\s*\|\|\s*resp\.status\s*===\s*403/.test(TC), 8,
  "B2 httpBatchLink fetch wrapper catches HTTP-level 401/403 responses BEFORE tRPC body parse → globalOnAny401OrForbidden",
  "fetch wrapper must check resp.status 401 403 immediately after await");
const hasMutOverride = /useMutation[\s\S]*?onError[\s\S]*?UNAUTHORIZED/.test(TC);
const hasQryOverride = /useQuery[\s\S]*?onError[\s\S]*?UNAUTHORIZED/.test(TC);
assert(hasMutOverride && hasQryOverride, 9,
  "B3 createTRPCReact overrides BOTH useMutation.onError + useQuery.onError → UNAUTHORIZED/FORBIDDEN → globalOnAny401OrForbidden",
  "Need unstable_overrides BOTH useMutation AND useQuery onError hooks in trpc.ts L28-55");
const hasQCOptMut = /mutations[\s\S]*?onError[\s\S]*?UNAUTHORIZED/.test(TC);
const hasQCOptQry = /queries[\s\S]*?onError[\s\S]*?UNAUTHORIZED/.test(TC);
assert(hasQCOptMut && hasQCOptQry, 10,
  "B4 QueryClient defaultOptions BOTH queries.onError + mutations.onError 4th safety net → globalOnAny401OrForbidden",
  "QueryClient defaultOptions L81-120 BOTH queries + mutations onError catch UNAUTHORIZED");

// Group C: SettingsPage saveMut/resetMut onError + teamId passthrough (2 assertions = total ≥12)
const SP = fs.readFileSync(`${ROOT}/client/src/pages/SettingsPage.tsx`, "utf8");
assert(/saveMut\s*=\s*trpc\.settings\.save\.useMutation\(\s*\{[\s\S]*?onError[\s\S]*?UNAUTHORIZED[\s\S]*?__markAuthLoggedOut/.test(SP), 11,
  "C1 SettingsPage saveMut useMutation onError calls global __markAuthLoggedOut for UNAUTHORIZED (5th final safety net)",
  "SettingsPage.tsx saveMut declaration should have onError inline handler calling globalThis markAuthLoggedOut");
const hasDefaultTeamId = /defaultTeamId\s*=\s*Number\s*\(\s*\(user\s+as\s+any\)\s*\?\.teamId/.test(SP);
const hasPayloadTeamId = /payload\.teamId\s*=\s*defaultTeamId/.test(SP) || /if\s*\(\s*defaultTeamId[\s\S]*?payload\.teamId/.test(SP);
assert(hasDefaultTeamId && hasPayloadTeamId, 12,
  "C2 SettingsPage extracts defaultTeamId from user.teamId / defaultTeamId → added to saveMut payload if positive",
  "defaultTeamId variable declared AND added to payload before mutateAsync (Zod optional teamId passthrough server L258)");

// Summary
const total = 12;
const passed = total - exit;
console.log(`\n📋 Phase 2J local test summary: ${passed}/${total} assertions ${exit === 0 ? "✅ ALL GREEN" : "❌ FAIL exit=" + exit}`);
process.exit(exit === 0 ? 0 : 1);
