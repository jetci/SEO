// ============================================================
// P0 Auth Refresh Bug — STEP 4B NGINX + ROOT CAUSE VERIFICATION
// Also inspect: useAuth.ts L198 loading calculation (third clause)
// ============================================================
import SSHClient from 'ssh2-promise';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SSH = {
  host: '35.231.230.218',
  username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt',
  port: 22,
  readyTimeout: 20000,
  keepaliveInterval: 30000,
};
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';

async function sh(ssh, cmd) {
  try {
    const s = (await ssh.exec(`export PATH="${NODE_PATH}:$PATH"; ${cmd}`))?.toString?.() ??
      String(await ssh.exec(cmd));
    return s;
  } catch (e) {
    return String(e?.message ?? e);
  }
}

let passed = 0, failed = 0;
function a(cond, msg, g = '?') {
  if (cond) { passed++; console.log('  ✅', String(passed).padStart(2, '0'), '[' + g + ']', msg); }
  else { failed++; console.error('  ❌ FAIL', '[' + g + ']', msg); }
}

(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok\n');

    // ========== NGINX CONFIG ==========
    console.log('============= NGINX CONFIG FULL DUMP =============');
    const nginxFile = await sh(ssh, `cat /etc/nginx/sites-available/eeat-studio.conf`);
    console.log(nginxFile);
    console.log('============= END NGINX CONFIG =============\n');

    // ========== NGINX -t syntax OK check ==========
    const nginxTest = await sh(ssh, `sudo nginx -t 2>&1`);
    const nginxSyntaxOk = /syntax is ok/.test(nginxTest) && /test is successful/.test(nginxTest);
    a(nginxSyntaxOk, `N1. sudo nginx -t syntax OK: ${nginxSyntaxOk ? 'YES' : 'NO — fix required'}`, 'N');
    console.log('[nginx -t output]', nginxTest.split('\n').slice(0, 5).join(' | '), '\n');

    // ========== CURL NGINX / (no cookie) — check NO 302 redirect to /login ==========
    console.log('============= NGINX HEADERS ROOT / (curl -I -L -k) =============');
    const rootHeaders = await sh(ssh, `curl -skI -L --max-redirs 3 https://127.0.0.1/ 2>&1 | head -30`);
    console.log(rootHeaders);
    console.log('============= END =============\n');
    const rootHas302Login = /302\s+Found.*location:\s*\/login/is.test(rootHeaders + '\n' +
      await sh(ssh, `curl -skI -L --max-redirs 3 https://127.0.0.1/ 2>&1`));
    a(!rootHas302Login,
      `N2. Root GET / NO nginx 302 redirect to /login. Has redirect=${rootHas302Login}`, 'N');

    // ========== CURL NGINX /kcp /projects /settings /write — NO redirect /login ==========
    console.log('============= NGINX HTTP status routes =============');
    for (const route of ['/', '/kcp', '/projects', '/settings', '/login', '/api/health', '/api/trpc/auth.me']) {
      const status = await sh(ssh, `curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1${route} 2>&1`);
      console.log(`  ${route.padEnd(24)} → HTTP ${status}`);
    }
    console.log('============= END =============\n');

    // ========== /login route check — what does it return? HTML SPA fallback? ==========
    const loginHtml = await sh(ssh, `curl -sk https://127.0.0.1/login 2>&1 | head -c 800`);
    const loginReturnsSPA = /<!doctype html>/i.test(loginHtml) || /<div id="root"/i.test(loginHtml) || /<script/i.test(loginHtml);
    a(loginReturnsSPA, `N3. /login returns SPA fallback HTML (correct) actual_first200="${String(loginHtml).slice(0, 200).replace(/\n/g,' ')}"`, 'N');

    // ========== CRITICAL CHECK: useAuth L198 loading rule + MAIN DASHBOARD redirect guard ==========
    console.log('\n============= CRITICAL ROOT CAUSE SCENARIO ANALYSIS =============');
    console.log('PRIOR EVIDENCE REVIEW:');
    console.log('  • SERVER + NGINX /api/trpc/auth.me WITH signed cookie → HTTP 200 isLoggedIn=true role=admin (100% PASS)');
    console.log('  • No cookie → isLoggedIn=false UNAUTHORIZED code = NEVER (auth.me always HTTP 200 → NO ERROR CODE)');
    console.log('  • markAuthLoggedOut ONLY when me.error.code === UNAUTHORIZED/FORBIDDEN → NEVER FIRES');
    console.log('  • MainDashboard L93 redirect ONLY if (!loading && !isLoggedIn && serverRejected)');
    console.log('    → serverRejected = me.error.code UNAUTHORIZED/FORBIDDEN → NEVER TRUE (server 200 always)');
    console.log('  → BUT user sees /login on refresh. HOW?');
    console.log('');
    console.log('🔍 3 SUSPECTS LEFT (ranked):');
    console.log('');
    console.log('🥇 SUSPECT #1 [95%]: useAuth L198 3RD CLAUSE loading INFINITE LOOP:');
    console.log('     loading = me.isLoading || me.isFetching || (!loggedInData && !cacheFresh && !me.error)');
    console.log('   → Cold refresh: cacheFresh=false ALWAYS (cache reset cold start)');
    console.log('   → auth.me returns 200 OK {isLoggedIn:true user:admin} → loggedInData=true');
    console.log('   → !true && false && !undefined = false → loading OK');
    console.log('   BUT PARALLEL QUERIES RACE WINDOW:');
    console.log('     projects.list/categories.list fire BEFORE auth.me → protected → 401 UNAUTHORIZED');
    console.log('     → trpc L95 Query onError: code=UNAUTHORIZED → globalOnAny401OrForbidden → __markAuthCacheInvalid');
    console.log('     → cacheFresh = false (ALREADY COLD SO NO CHANGE but...) — THEN:');
    console.log('     → AUTH.ME FINALLY RETURNS isLoggedIn=true → loggedInData=true');
    console.log('     → loading = false || false || (!true && ...) → FALSE — loading goes to FALSE ✅.');
    console.log('');
    console.log('🥈 SUSPECT #2 [5%]: LOGIN PAGE AUTO-REDIRECT ON COLD START MOUNT (if isLoggedIn=true && !loading → redirect HOME → WORSE BACKFIRE if cookie missing)');
    console.log('   → Login.tsx: NO reverse redirect (L220-522 no window.location.href if isLoggedIn=true) → missing this check OK.');
    console.log('');
    console.log('🥉 SUSPECT #3 [0.5%]: HIDDEN NGINX COOKIE FILTER (proxy_cookie_path OR invalid_chars strip):');
    console.log('   → Server cookie Set-Cookie (sliding 24h) on SPA fallback /kcp / routes HTML response NOT sent to browser!');
    console.log('   → Browser login once has cookie (from Google callback). But refresh → sliding Set-Cookie NEVER arrives → cookie NEVER renewed! Wait 24h only? No user reports EVERY refresh → cookie survives refresh just fine.');
    console.log('');
    console.log('🎯 MOST LIKELY ACTUAL ROOT CAUSE (new hypo based on code patterns):');
    console.log('   MainDashboardShell L93 condition looks bulletproof BUT Login.tsx MOUNTS INSIDE Route /login path. When App first hydrates after F5 hard refresh:');
    console.log('     1. URL = thaiaeo.manus.host/kcp');
    console.log('     2. Browser F5 GET /kcp → nginx → serve SPA index.html (fallback). URL bar still /kcp');
    console.log('     3. JS parse: wouter router → read URL pathname = "/kcp". Switch route /kcp → KeywordClusterPlanner → MainDashboardShell');
    console.log('     4. MainDashboardShell useAuth runs + projects.list/categories.list parallel queries');
    console.log('     5. Within 50ms: protected queries 401 → markAuthCacheInvalid. Still loading=true.');
    console.log('     6. 500ms LATER: auth.me finally RETURNS → isLoggedIn=true');
    console.log('     7. BUT WAIT: IS THERE A RACE WHERE loading=false BEFORE loggedInData=true UPDATE EFFECT RUNS?');
    console.log('        → NO: React state updates are batched. loggedInData=true + loading flip = SAME event loop tick');
    console.log('');
    console.log('   → BUT! Login.tsx uses useAuth hook TOO. It has no reverse redirect if already logged in!');
    console.log('     Suppose browser URL shows /login and user F5s... OK but user says "Login once → F5 /home → /login again"');
    console.log('     This means /home REDIRECTED to /login somehow. Where?');
    console.log('');
    console.log('✅ MOST LIKELY [after ruling out server+nginx completely]:');
    console.log('   useAuth hook in Login.tsx: cold cache + auth.me fires BEFORE MainDashboard; auth.me returns 200 OK guest; NO redirect.');
    console.log('   Wait: Are routes ("/" + "/login") BOTH matching on refresh? Does wouter Switch /login accidentally fire on root?');
    console.log('   App.tsx L35-57 Switch order: /login → / → /dashboard → /projects → ... → NotFound');
    console.log('   URL = / → match Route "/" (DashboardOverviewPage). NEVER matches /login. OK no problem.');
    console.log('');
    console.log('💡 NEXT ACTION [INSTRUMENT]:');
    console.log('   Inject debug loggers ONLY (no logic change):');
    console.log('   A. useAuth.ts: console.log every render + state change.');
    console.log('   B. MainDashboardShell L92 redirect condition log BEFORE setTimeout + AFTER setTimeout actually redirects.');
    console.log('   C. Login.tsx mount/unmount + isLoggedIn status log.');
    console.log('   D. window.addEventListener(beforeunload) → log; overwrite window.location setter with Proxy to log WHO is changing href=/login.');
    console.log('   Build & deploy instrumented → user F5 ONCE → send console log screenshot/video.');
    console.log('============= END CRITICAL ANALYSIS =============\n');

    // ========== Check what cookie attributes sliding set actually sets on REAL nginx ==========
    console.log('============= REAL NGINX /api/trpc/auth.me Set-Cookie header with valid cookie =============');
    const signAndHeader = `
cd ${DEPLOY_DIR} && export PATH="${NODE_PATH}:$PATH" && node -e '
const { SignJWT } = require("jose");
require("dotenv").config();
const openId = process.env.ADMIN_OPENID;
const tokP = new Promise((res, rej) => {
  new SignJWT({ openId, appId: "eeat-studio-v2", name: "Admin Intelman" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor(Date.now()/1000)+86400)
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET))
    .then(res).catch(rej);
});
tokP.then(tok => {
  process.stdout.write(tok);
}).catch(e => { console.error("TOKFAIL:" + String(e.message||e).slice(0,200)); process.exit(1); });
' > /tmp/final_tok.txt 2>/tmp/final_tok_err.txt
TOKEN=$(cat /tmp/final_tok.txt)
CNAME=$(grep -E '^SESSION_COOKIE_NAME=' ${DEPLOY_DIR}/.env | cut -d'=' -f2-)
CNAME=\${CNAME:-eeat_studio_v2_session}
echo "COOKIE_HEADERS_NGINX_BEGIN"
curl -skD - -o /dev/null -H "Cookie: \${CNAME}=\${TOKEN}" https://thaiaeo.manus.host/api/trpc/auth.me 2>/dev/null | grep -iE '^(HTTP/|Set-Cookie:|server:|strict-transport)' || true
echo "COOKIE_HEADERS_NGINX_END"
echo "SET_COOKIE_COUNT=$(curl -skD - -o /dev/null -H "Cookie: \${CNAME}=\${TOKEN}" https://thaiaeo.manus.host/api/trpc/auth.me 2>/dev/null | grep -c -iE '^Set-Cookie:')"
`;
    const nginxCookieHeaderOutput = await sh(ssh, signAndHeader);
    console.log(nginxCookieHeaderOutput);

    // Parse set-cookie count
    const setCookieCountMatch = nginxCookieHeaderOutput.match(/SET_COOKIE_COUNT=(\d+)/);
    const setCookieCount = setCookieCountMatch ? Number(setCookieCountMatch[1]) : -1;
    a(setCookieCount >= 1,
      `N4. Nginx public URL /api/trpc/auth.me Set-Cookie sliding renewal header PRESENT actual count=${setCookieCount} (≥1 PASS = sliding cookie reaches browser)`, 'N');
    const setCookieLine = nginxCookieHeaderOutput.split('COOKIE_HEADERS_NGINX_BEGIN')[1]?.split('COOKIE_HEADERS_NGINX_END')[0] ?? '';
    if (setCookieCount >= 1) {
      console.log('   Set-Cookie actual line:', setCookieLine.match(/Set-Cookie:[^\r\n]+/i)?.[0] ?? '', '\n');
    }

    // ========== PARSE useAuth.ts loading 3rd clause correctness (REGEX static assertion) ==========
    const useAuth = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'hooks', 'useAuth.ts'), 'utf8');
    const loadingLine = useAuth.match(/loading:\s*([^\n]+)/)?.[1] ?? '';
    console.log('============= STATIC LOADING LINE CHECK useAuth.ts L198 =============');
    console.log('  useAuth loading line:', loadingLine?.trim() || 'NOT FOUND');
    // Check third clause: if (!loggedInData && !cacheFresh && !me.error) → buggy infinite loading when server returns guest status 200 OK with NO error code
    const hasThirdClause = /!loggedInData\s*&&\s*!cacheFresh\s*&&\s*!me\.error/.test(loadingLine);
    console.log('  Has buggy 3rd clause (infinite loading guest)?', hasThirdClause ? 'YES' : 'NO');
    console.log('  Risk: If user ACTUALLY guest (isLoggedIn=false, no error), L stays true forever → MainDashboard !loading guard NEVER true →');
    console.log('        Guest user stuck forever, no redirect to /login! But opposite bug = user gets kicked to /login every refresh.');
    console.log('  → NOT our current bug (we are kicked TOO MANY TIMES, not stuck infinitely). So 3rd clause is NOT root cause of refresh kick.');
    console.log('============= END LOADING CHECK =============\n');

    console.log(`\n==== TOTAL NGINX + ROOT CAUSE: ${passed} PASS / ${failed} FAIL / TOTAL ${passed + failed} ====`);
    for (let i = 0; i < 1; i++) { /* noop */ }
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error('\nABORTED:', String(e?.message || e).slice(0, 1000), e?.stack || '');
    process.exit(2);
  } finally {
    try { if (ssh) await ssh.close(); } catch { /* ignore */ }
  }
})();
