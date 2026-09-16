// FINAL ROOT CAUSE PROBE VPS — ssh2-promise compatible (same as live_test)
import SSHClient from 'ssh2-promise';
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
    return s.trim();
  } catch (e) {
    return String(e?.message ?? e);
  }
}
(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok\n');
    console.log('==== FINAL ROOT CAUSE PROBE SESSION ====\n');

    // ─────────────────────────────────────────────────────
    // CHECK 1: Generate admin signed cookie inside VPS → curl direct :3002 auth.me → Set-Cookie sliding?
    // ─────────────────────────────────────────────────────
    console.log('━━━━━━━━━━ CHECK 1: Direct :3002 vs Public Nginx Set-Cookie sliding header ━━━━━━━━━━');
    const tokenSh = await sh(ssh, `cd ${DEPLOY_DIR} && node -e "
const { SignJWT } = require('jose');
require('dotenv').config({ path: './.env' });
(async () => {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  const token = await new SignJWT({ openId: '102308593207118714314', appId: 'eeat-v2', name: 'Admin Intelman' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('24h').sign(secret);
  process.stdout.write(token);
})();
"`);
    const ADMIN_TOKEN = String(tokenSh).trim();
    console.log('Signed admin token len:', ADMIN_TOKEN.length, 'non-empty:', !!ADMIN_TOKEN);
    if (ADMIN_TOKEN) {
      const cookieNameSh = await sh(ssh, `grep '^SESSION_COOKIE_NAME=' ${DEPLOY_DIR}/.env | cut -d= -f2`);
      const COOKIE_NAME = cookieNameSh || 'eeat_studio_v2_session';
      console.log('Cookie name =', COOKIE_NAME);

      const dirHeaders = await sh(ssh, `curl -skD - -o /dev/null -H "Cookie: ${COOKIE_NAME}=${ADMIN_TOKEN}" "http://127.0.0.1:3002/api/trpc/auth.me?batch=1" 2>&1 | head -30`);
      console.log('\nDIRECT :3002 HEADERS:');
      console.log(dirHeaders);
      const dirSetCookie = (dirHeaders.match(/^Set-Cookie:/gim) || []).length;
      console.log('✅ Direct :3002 Set-Cookie COUNT =', dirSetCookie, dirSetCookie ? '→ SERVER ISSUES SLIDING OK' : '→ ❌ SERVER NOT ISSUING SLIDING!');

      const pubHeaders = await sh(ssh, `curl -skD - -o /dev/null -H "Cookie: ${COOKIE_NAME}=${ADMIN_TOKEN}" "https://thaiaeo.manus.host/api/trpc/auth.me?batch=1" 2>&1 | head -30`);
      console.log('\nPUBLIC NGINX HEADERS:');
      console.log(pubHeaders);
      const pubSetCookie = (pubHeaders.match(/^Set-Cookie:/gim) || []).length;
      console.log('✅ Public Nginx Set-Cookie COUNT =', pubSetCookie, pubSetCookie ? '→ NGINX PASSES THROUGH OK' : '→ ❌ NGINX DROPS SLIDING SET-COOKIE!');

      const bodySh = await sh(ssh, `curl -sk -H "Cookie: ${COOKIE_NAME}=${ADMIN_TOKEN}" "https://thaiaeo.manus.host/api/trpc/auth.me?batch=1"`);
      console.log('\nPublic auth.me body:');
      console.log(bodySh.slice(0, 400));
      const isLoggedIn = /isLoggedIn["']?\s*:\s*true/.test(bodySh);
      console.log('✅ auth.me isLoggedIn:true?', isLoggedIn, isLoggedIn ? '→ SERVER 100% WORKING' : '→ ❌ SERVER FAIL');
    }

    // ─────────────────────────────────────────────────────
    // CHECK 2: Deployed bundle has NEW FIX markAuthCacheInvalid or OLD BUG markAuthLoggedOut in 401 handlers?
    // ─────────────────────────────────────────────────────
    console.log('\n\n━━━━━━━━━━ CHECK 2: DEPLOYED BUNDLE redirect patterns (OLD BUG vs NEW FIX) ━━━━━━━━━━');
    const assets = await sh(ssh, `ls -la ${DEPLOY_DIR}/dist/assets/*.js 2>/dev/null`);
    console.log('dist/assets/*.js:\n', assets);

    console.log('\n--- markAuthCacheInvalid count (NEW FIX PRESENCE → >0 = FIX DEPLOYED; 0 = OLD BUGGY!) ---');
    const cacheInv = await sh(ssh, `grep -c "markAuthCacheInvalid" ${DEPLOY_DIR}/dist/assets/*.js 2>/dev/null`);
    console.log(cacheInv);

    console.log('\n--- markAuthLoggedOut occurrence counts in bundle ---');
    const markCount = await sh(ssh, `grep -c "markAuthLoggedOut" ${DEPLOY_DIR}/dist/assets/*.js 2>/dev/null`);
    console.log(markCount);

    console.log('\n--- window.location.href login REDIRECT literal occurrences (actual redirect lines) ---');
    const redirectCount = await sh(ssh, `grep -c -E 'window[.]location[.]href ?= ?["'\'']/login' ${DEPLOY_DIR}/dist/assets/*.js 2>/dev/null ; echo '---LINES---' ; grep -o -n -E 'window[.]location[.]href ?= ?["'\'']/login[^"'\'']*' ${DEPLOY_DIR}/dist/assets/*.js 2>/dev/null | head -20`);
    console.log(redirectCount);

    console.log('\n--- 4-level global handlers: UNAUTHORIZED → markAuthLoggedOut (OLD BUG!) vs markAuthCacheInvalid (NEW FIX!) ---');
    const handlerCheck = await sh(ssh, `cd ${DEPLOY_DIR}/dist/assets && for f in *.js; do
  logoutCalls=$(grep -oE "UNAUTHORIZED.{0,80}markAuthLoggedOut|markAuthLoggedOut.{0,40}UNAUTHORIZED" "$f" 2>/dev/null | wc -l)
  cacheCalls=$(grep -oE "UNAUTHORIZED.{0,80}markAuthCacheInvalid|markAuthCacheInvalid.{0,40}UNAUTHORIZED" "$f" 2>/dev/null | wc -l)
  echo "$f: OLD_BUG_401_REDIRECT_PATTERN=$logoutCalls NEW_FIX_401_NO_REDIRECT_PATTERN=$cacheCalls"
done | head -10`);
    console.log(handlerCheck);
    // ROOT CAUSE IF: OLD_BUG_401_REDIRECT_PATTERN > 0 AND NEW_FIX_401_NO_REDIRECT_PATTERN = 0
    // Means: On refresh, parallel protected queries fire BEFORE auth.me resolves → UNAUTHORIZED → OLD code IMMEDIATELY markAuthLoggedOut REDIRECT to /login!

    // ─────────────────────────────────────────────────────
    // CHECK 3: dist/index.html hidden redirect?
    // ─────────────────────────────────────────────────────
    console.log('\n\n━━━━━━━━━━ CHECK 3: dist/index.html meta/script redirect hidden? ━━━━━━━━━━');
    const indexHtml = await sh(ssh, `head -60 ${DEPLOY_DIR}/dist/index.html 2>/dev/null`);
    console.log(indexHtml);
    const hiddenRedir = /http-equiv.{0,20}refresh|window[.]location[^;]*login/i.test(indexHtml);
    console.log('\n✅ Hidden redirect in index.html?', hiddenRedir ? '❌ YES → BUG' : 'NO → PASS');

    // ─────────────────────────────────────────────────────
    // CHECK 4: Express /login → 301 → /login/ plain HTML Redirecting doc?
    // ─────────────────────────────────────────────────────
    console.log('\n\n━━━━━━━━━━ CHECK 4: Express serve-static 301 trailing slash /login redirect ━━━━━━━━━━');
    const loginRoute = await sh(ssh, `curl -skD - http://127.0.0.1:3002/login 2>&1 | head -30`);
    console.log(loginRoute);
    const is301 = /301 Moved Permanently|301 Redirect/.test(loginRoute);
    const htmlDoc = /Redirecting to \/login\//.test(loginRoute);
    console.log('\n✅ /login → 301?', is301, ' Plain HTML redirect doc (NOT React)?', htmlDoc);
    if (is301 || htmlDoc) console.log('⚠️ Express static redirect:true breaks SPA fallback (minor bug but route mismatch)');

    console.log('\n\n==== PROBE COMPLETE ====');
    ssh.close?.();
  } catch (e) {
    console.error('FATAL:', e);
    process.exit(1);
  }
})();
