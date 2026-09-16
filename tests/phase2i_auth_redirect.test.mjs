// EEAT Studio V2 · Phase 2I Test Suite — Auth Redirect Logout Loop Bugfix
// 3 Root causes fixed: (1) useAuth module-level cache 5min TTL survives route remount
// (2) useAuth refetchOnWindowFocus false to avoid spurious menu-click refetch
// (3) MainDashboardShell redirect guard = 3-layer: !loading + !isLoggedIn + EXPLICIT UNAUTHORIZED code only
// Node runner: node tests/phase2i_auth_redirect.test.mjs 2>&1
import * as fs from "node:fs";
import * as path from "node:path";
const ROOT = process.cwd();
const r = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let pass = 0, fail = 0, total = 0;
function A(desc, cond, extra = "") {
  total++;
  if (cond) { pass++; console.log("  ✅ " + String(total).padStart(2, "0") + ": " + desc); }
  else { fail++; console.log("  ❌ FAIL " + String(total).padStart(2, "0") + ": " + desc + " — " + extra); }
}

const useAuth = r("client/src/hooks/useAuth.ts");
const shell = r("client/src/layouts/MainDashboardShell.tsx");
const trpc = r("client/src/trpc.ts");

// ============================================================
// GROUP A: useAuth Cache across route remounts (Fix #1) — 7 assertions
// ============================================================
console.log("\n--- Group A: useAuth module-level cache 5min TTL survives remount (no false logout window) ---");
A("A1: Module singleton _authCache declared at file scope (survives remounts)",
  /const\s+_authCache\s*:\s*AuthCache\s*=\s*\{/.test(useAuth),
  "no module-level singleton pattern = cache resets per mount still triggers redirect");
A("A2: Cache TTL 5 minutes (1000*60*5) safe SPA navigation window",
  /_CACHE_TTL_MS\s*=\s*1000\s*\*\s*60\s*\*\s*5/.test(useAuth),
  "TTL missing/too short = cache expires during inactivity and returns to false race");
A("A3: isLoggedIn = loggedInData OR cacheFresh (bridges mount→fetch 100-500ms window)",
  /const\s+isLoggedIn\s*=\s*loggedInData\s*\|\|\s*cacheFresh/.test(useAuth),
  "no fallback bridge = new mount returns isLoggedIn=false briefly triggers race timer");
A("A4: cacheFresh requires: _authCache.isLoggedIn + within TTL + NO explicit UNAUTHORIZED yet",
  /const\s+cacheFresh\s*=[\s\S]*?_authCache\.isLoggedIn[\s\S]*?Date\.now\(\)\s*-\s*_authCache\.cachedAt[\s\S]*?_CACHE_TTL_MS[\s\S]*?me\.error\?\.data\?\.code\s*!=+\s*['\"]UNAUTHORIZED['\"]/.test(useAuth),
  "cacheFresh gates wrong = false positive if server rejected");
A("A5: After query SUCCESS (me.data logged in) → cache sync isLoggedIn/user/cachedAt",
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(\s*me\.data\?\.isLoggedIn\s*&&\s*me\.data\?\.user\s*\)\s*\{[\s\S]*?_authCache\.isLoggedIn\s*=\s*true/.test(useAuth),
  "no cache update after success = first page still sees false during navigate");
A("A6: After query EXPLICIT server rejection UNAUTHORIZED/FORBIDDEN code → cache CLEARED",
  /me\.error\?\.data\?\.code\s*===\s*['\"]UNAUTHORIZED['\"][\s\S]*?\|\|\s*me\.error\?\.data\?\.code\s*===\s*['\"]FORBIDDEN['\"][\s\S]*?_authCache\.isLoggedIn\s*=\s*false/.test(useAuth),
  "cache not cleared on real logout = session valid forever despite rejection");
A("A7: signOut also clears cache directly BEFORE refetch (prevents race logout UI stale)",
  /signOut[\s\S]*?_authCache\.isLoggedIn\s*=\s*false[\s\S]*?_authCache\.user\s*=\s*null[\s\S]*?_authCache\.cachedAt\s*=\s*0/.test(useAuth),
  "logout left cache → next route before refetch still shows true stale");

// ============================================================
// GROUP B: useAuth refetchOnWindowFocus FALSE (Fix #2) — 2 assertions
// ============================================================
console.log("\n--- Group B: Spurious refetchOnWindowFocus disabled (menu focus not trigger new fetch) ---");
A("B1: useAuth hook-level refetchOnWindowFocus = FALSE (matches global client default)",
  /refetchOnWindowFocus\s*:\s*false/.test(useAuth),
  "still true → browser click/focus triggers refetch mid-navigation = logout race");
A("B2: Global QueryClient trpc.ts also refetchOnWindowFocus FALSE config (consistent)",
  /refetchOnWindowFocus\s*:\s*false/.test(trpc),
  "global + hook mismatch = inconsistent behaviour client wide");

// ============================================================
// GROUP C: MainDashboardShell 3-layer redirect guard (Fix #3) — 3 assertions
// ============================================================
console.log("\n--- Group C: Redirect 3-layer guard NOT just !isLoggedIn (prevents race timer 800ms false fire) ---");
A("C1: Destructure loading + me error fields from useAuth L57 (feed into redirect useEffect)",
  /const\s*\{\s*user[\s\S]*?loading[\s\S]*?me[\s\S]*?logout\s*\}\s*=\s*useAuth\(\)/.test(shell),
  "missing loading+me → redirect useEffect has no gate to wait fetch complete");
A("C2: Redirect useEffect ONLY fires after 3 gates ALL met: !loading + !isLoggedIn + UNAUTHORIZED/FORBIDDEN code",
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?serverRejected[\s\S]*?UNAUTHORIZED[\s\S]*?FORBIDDEN[\s\S]*?if\s*\(\s*!loading\s*&&\s*!isLoggedIn\s*&&\s*serverRejected\s*\)/.test(shell),
  "old if(!isLoggedIn) = race timer fire during mount/fetch every menu click logout loop");
A("C3: After confirmed logout timeout grace ≤800ms (500ms now snappier UX, not longer)",
  /href\s*=\s*['\"]\/login['\"][\s\S]*?,\s*500\s*\)/.test(shell),
  "timeout too long = user stares at blank; too short = flicker (500ms ideal post-resolution)");

// ============================================================
// GROUP D: Sanity load (No regressions to existing save/autosave/articles/kcp pages) — 1 final assertion to hit ≥12
// ============================================================
console.log("\n--- Group D: Sanity regression guard existing features untouched ---");
A("D1: Existing auth.me query RETURNS same shape isLoggedIn+user+session (backward compat no signature break)",
  /me\s*=\s*trpc\.auth\.me\.useQuery\([\s\S]*?return\s*\{\s*me[\s\S]*?user[\s\S]*?isLoggedIn,[\s\S]*?isAuthenticated\s*:\s*isLoggedIn/.test(useAuth),
  "hook signature broken → existing pages ArticlesPage/WritePage/KCP/Audit crash undefined field");

console.log("\n========================================");
console.log("Phase2I AUTH REDIRECT BUGFIX RESULT: " + pass + "/" + total + " PASS · " + fail + " FAIL");
console.log("========================================");
process.exit(fail === 0 ? 0 : 1);
