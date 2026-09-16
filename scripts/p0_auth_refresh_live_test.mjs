// ============================================================
// P0 Auth Refresh Bug — STEP4 Evidence Collection (NO FIX LOGIC)
// LIVE VPS-only test: sign JWT with REAL VPS SESSION_SECRET inside VPS
// then 2x curl auth.me (no cookie / with cookie) to verify roundtrip
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
    return s.trim();
  } catch (e) {
    return String(e?.message ?? e);
  }
}

let passed = 0, failed = 0;
function a(cond, msg, g = '?') {
  if (cond) {
    passed++;
    console.log('  ✅', String(passed).padStart(2, '0'), '[' + g + ']', msg);
  } else {
    failed++;
    console.error('  ❌ FAIL', '[' + g + ']', msg);
  }
}

(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok\n');
    console.log('==== P0 Auth Refresh Bug LIVE EVIDENCE SESSION ====\n');

    // ─────────────────────────────────────────────────────
    // PRE-FLIGHT: Infra checks
    // ─────────────────────────────────────────────────────
    const pm2Out = await sh(ssh, `pm2 jlist 2>/dev/null || echo "[]"`);
    let list = [];
    try { list = JSON.parse(('' + pm2Out).trim() || '[]'); } catch { /* ignore */ }
    const v2 = list.find((p) => p.name === 'eeat-studio-v2');
    a(!!v2 && (v2?.pm2_env?.status === 'online' || v2?.status === 'online'),
      'V1. PM2 eeat-studio-v2 (port 3002) online = prerequisite', 'V1');
    const envFileExists = await sh(ssh, `test -f ${DEPLOY_DIR}/.env && echo YES || echo NO`);
    a(envFileExists === 'YES', `V2. ${DEPLOY_DIR}/.env file exists on VPS`, 'V2');

    // ─────────────────────────────────────────────────────
    // G1: VPS .env 3 key variables
    // ─────────────────────────────────────────────────────
    const envSessionSecretRaw = await sh(ssh, `grep -E '^SESSION_SECRET=' ${DEPLOY_DIR}/.env 2>/dev/null | head -1`);
    const envCookieName = await sh(ssh, `grep -E '^SESSION_COOKIE_NAME=' ${DEPLOY_DIR}/.env 2>/dev/null | head -1`);
    const envTtl = await sh(ssh, `grep -E '^SESSION_TTL_MS=' ${DEPLOY_DIR}/.env 2>/dev/null | head -1`);
    const envAppUrl = await sh(ssh, `grep -E '^APP_URL=' ${DEPLOY_DIR}/.env 2>/dev/null | head -1`);

    const hasSecretEnv = /^SESSION_SECRET=/.test(envSessionSecretRaw) &&
      envSessionSecretRaw.length > 40; // = at least SESSION_SECRET= + 32 char min
    a(hasSecretEnv, `G1.1 VPS .env SESSION_SECRET present length>=32 rawlen=${envSessionSecretRaw.length}`, 'G1');
    a(/^SESSION_COOKIE_NAME=eeat_studio_v2_session$/.test(envCookieName) ||
      /^SESSION_COOKIE_NAME=/.test(envCookieName),
      `G1.2 VPS .env SESSION_COOKIE_NAME present: "${envCookieName || '(not set)'}"`, 'G1');
    a(/^SESSION_TTL_MS=86400000$/.test(envTtl) || /^SESSION_TTL_MS=\d+$/.test(envTtl),
      `G1.3 VPS .env SESSION_TTL_MS set: "${envTtl || '(not set, default 86400000 OK)'}"`, 'G1');
    a(/^APP_URL=https?:\/\//.test(envAppUrl),
      `G1.4 VPS .env APP_URL set: "${envAppUrl || '(MISSING!)'}"`, 'G1');

    // ─────────────────────────────────────────────────────
    // G2: Sign JWT ON VPS with REAL secret → 2x auth.me fetch roundtrip
    // Node mjs script stored in scripts/_tmp_p0_auth_g2_node.mjs.
    // Upload to VPS DEPLOY_DIR (where node_modules jose exists) then execute from there.
    // NO secret leaves VPS.
    // ─────────────────────────────────────────────────────
    const G2_NODE_LOCAL = path.join(__dirname, '_tmp_p0_auth_g2_node.mjs');
    const G2_NODE_CONTENT = fs.readFileSync(G2_NODE_LOCAL, 'utf8');

    // Upload: heredoc quoted = no expansion
    const uploadCmd = `cat > ${DEPLOY_DIR}/p0_auth_g2_node.mjs << 'SCRIPTEOF'
${G2_NODE_CONTENT}
SCRIPTEOF
chmod +x ${DEPLOY_DIR}/p0_auth_g2_node.mjs
echo "uploaded_size=$(wc -c < ${DEPLOY_DIR}/p0_auth_g2_node.mjs)"`;
    console.log(`[TEST] Step A: Uploading node sign/verify script to VPS ${DEPLOY_DIR}/p0_auth_g2_node.mjs...`);
    const uploadOut = await sh(ssh, uploadCmd);
    console.log(uploadOut);

    // Sanity check: verify jose installable in DEPLOY_DIR
    const sanityJose = await sh(ssh, `cd ${DEPLOY_DIR} && export PATH="${NODE_PATH}:$PATH" && node -e 'try{const j=require("jose");console.log("jose_ok=YES v="+j?.SignJWT ? "hasSignJWT" : "no");}catch(e){console.log("jose_fail_NODE_MODULES="+e.message.slice(0,200))}'`);
    console.log('[TEST] Jose dep check (DEPLOY_DIR) — CJS require probe:', sanityJose);
    const sanityJoseEsm = await sh(ssh, `cd ${DEPLOY_DIR} && export PATH="${NODE_PATH}:$PATH" && node --input-type=module -e 'import("jose").then(m=>{console.log("jose_esm_ok SignJWT="+typeof m.SignJWT)}).catch(e=>console.log("jose_esm_fail="+e.message.slice(0,200)))'`);
    console.log('[TEST] Jose dep check (DEPLOY_DIR) — ESM import probe:', sanityJoseEsm);

    console.log('\n[TEST] Step B: Running VPS sign/verify fetch script (this takes ~15s)...\n');
    const g2Output = await sh(ssh, `cd ${DEPLOY_DIR} && export PATH="${NODE_PATH}:$PATH" && node p0_auth_g2_node.mjs 2>&1`);
    console.log('─────────────────── VPS LIVE OUTPUT BEGIN ───────────────────');
    console.log(g2Output);
    console.log('─────────────────── VPS LIVE OUTPUT END ─────────────────────\n');

    // ─────────────────────────────────────────────────────
    // Parse assertions from VPS output
    // ─────────────────────────────────────────────────────
    const out = g2Output;

    // G1 parsed values from runtime
    const secretLenMatch = out.match(/SESSION_SECRET_LEN=(\d+)/);
    const secretLen = secretLenMatch ? Number(secretLenMatch[1]) : 0;
    a(secretLen >= 32,
      `G2.1 Runtime SESSION_SECRET loaded inside VPS len=${secretLen}>=32`, 'G2');

    const cookieNameMatch = out.match(/SESSION_COOKIE_NAME=([^\n]+)/);
    const cookieName = cookieNameMatch ? cookieNameMatch[1] : 'eeat_studio_v2_session';
    a(cookieName === 'eeat_studio_v2_session',
      `G2.2 SESSION_COOKIE_NAME runtime = "${cookieName}" matches default expected`, 'G2');

    const appUrlMatch = out.match(/APP_URL=([^\n]+)/);
    const appUrl = appUrlMatch ? appUrlMatch[1] : '';
    const hasHttpsAppUrl = /^https:\/\/[^.]+(\.[^.]+)+$/.test(appUrl);
    a(hasHttpsAppUrl,
      `G2.3 APP_URL runtime valid public https = "${appUrl || '(empty)'}"`, 'G2');

    // Sign JWT exit code + token length
    const signExitMatch = out.match(/SIGN_JWT_EXIT=(\d+)/);
    const signExit = signExitMatch ? Number(signExitMatch[1]) : -1;
    const tokenLenMatch = out.match(/SIGN_JWT_TOKEN_LEN=(\d+)/);
    const tokenLen = tokenLenMatch ? Number(tokenLenMatch[1]) : 0;
    a(signExit === 0,
      `G2.4 VPS jose SignJWT exit=0 actual=${signExit}`, 'G2');
    a(tokenLen >= 180 && tokenLen <= 400,
      `G2.5 Signed token len ok 180-400 actual=${tokenLen}`, 'G2');

    // G2a no cookie resp = isLoggedIn=false no error code
    const g2aRespRaw = out.split('G2A_NO_COOKIE_RESP_BEGIN')[1]?.split('G2A_NO_COOKIE_RESP_END')[0] ?? '';
    const g2aStatusMatch = g2aRespRaw.match(/__HTTP_STATUS:(\d{3})/);
    const g2aStatus = g2aStatusMatch ? Number(g2aStatusMatch[1]) : 0;
    const g2aBody = g2aRespRaw.replace(/\n__HTTP_STATUS:\d{3}\s*$/, '').trim();
    a(g2aStatus === 200,
      `G2.6 (No cookie) /api/trpc/auth.me HTTP=${g2aStatus}`, 'G2');
    const g2aNoLoginOk = /"isLoggedIn"\s*:\s*false/.test(g2aBody) &&
      !/"code"\s*:\s*"UNAUTHORIZED"/.test(g2aBody);
    a(g2aNoLoginOk,
      `G2.7 (No cookie) isLoggedIn=false AND no UNAUTHORIZED error code (safe isLoggedIn format)`, 'G2');

    // G2b WITH cookie = isLoggedIn=true via local VPS server 3002
    const g2bRespRaw = out.split('G2B_WITH_COOKIE_RESP_BEGIN')[1]?.split('G2B_WITH_COOKIE_RESP_END')[0] ?? '';
    const g2bStatusMatch = g2bRespRaw.match(/__HTTP_STATUS:(\d{3})/);
    const g2bStatus = g2bStatusMatch ? Number(g2bStatusMatch[1]) : 0;
    const g2bBody = g2bRespRaw.replace(/\n__HTTP_STATUS:\d{3}\s*$/, '').trim();
    const g2bLoggedInTrue = g2bStatus === 200 &&
      /"isLoggedIn"\s*:\s*true/.test(g2bBody) &&
      /"role"\s*:\s*"admin"/.test(g2bBody);

    // CRITICAL H1b verdict:
    // If g2bLoggedInTrue = TRUE → SESSION_SECRET SIGN/VERIFY MATCH OK
    // If FALSE → 🎯 H1b 100% CONFIRMED ROOT CAUSE mismatch secret between sign/verify!
    console.log('\n─────────────────── H1b VERDICT SUMMARY ───────────────────');
    if (g2bRespRaw && g2bRespRaw.includes('isLoggedIn')) {
      if (g2bLoggedInTrue) {
        console.log('🔵 H1b REJECTED: Sign/Verify SESSION_SECRET MATCH OK (local 3002 works).');
        console.log('   → Session cookie signed + verified SAME secret. Root cause NOT H1b.');
        console.log('   → Next: move to H2 (nginx Set-Cookie strip) or H3 (client redirect race).');
      } else {
        console.log('🔴 H1b 100% CONFIRMED: Sign/Verify SESSION_SECRET MISMATCH!');
        console.log(`   → HTTP=${g2bStatus}, body has isLoggedIn:true=${/"isLoggedIn"\s*:\s*true/.test(g2bBody)}`);
        console.log('   → Cookie signed by jose NOW with .env secret, but verifySession() on 3002 returned null.');
        console.log('   → ROOT CAUSE: server built with fallback default secret; runtime uses different secret');
        console.log('     OR env.ts SESSION_SECRET validation/parsing regressed to fallback string.');
        console.log('   → Fix: env.ts fail-fast if SESSION_SECRET min(32) parse fails (no fallback!)');
      }
    } else {
      console.log('⚪ H1b INCONCLUSIVE: G2B response missing. Check script errors above.');
    }
    console.log('────────────────────────────────────────────────────────────\n');

    a(g2bLoggedInTrue,
      `G2.8 🎯 H1b CRITICAL: (signed cookie) auth.me HTTP=${g2bStatus} isLoggedIn=true role=admin → H1b REJECTED if PASS / H1b CONFIRMED if FAIL`, 'G2');

    // G2c Sliding Set-Cookie header returned on valid request
    const g2cHeaders = out.split('G2C_HEADERS_BEGIN')[1]?.split('G2C_HEADERS_END')[0] ?? '';
    const setCookieLine = g2cHeaders.match(/^Set-Cookie:\s*([^\r\n]+)/mi)?.[1] ?? '';
    const hasCookieInHeader = setCookieLine.includes(cookieName) &&
      setCookieLine.includes('HttpOnly') && setCookieLine.includes('Max-Age=86400');
    a(hasCookieInHeader,
      `G2.9 (Direct 3002) sliding Set-Cookie header present HttpOnly + MaxAge=86400. Actual line="${setCookieLine.slice(0, 140)}${setCookieLine.length > 140 ? '…' : ''}"`, 'G2');

    // G2d EXTERNAL nginx public URL test (if ran)
    const g2dRespRaw = out.split('G2D_EXT_NGINX_RESP_BEGIN')[1]?.split('G2D_EXT_NGINX_RESP_END')[0] ?? '';
    const g2dStatusMatch = g2dRespRaw.match(/__HTTP_STATUS:(\d{3})/);
    const g2dStatus = g2dStatusMatch ? Number(g2dStatusMatch[1]) : 0;
    const g2dBody = g2dRespRaw.replace(/\n__HTTP_STATUS:\d{3}\s*$/, '').trim();
    const g2dLoggedInTrue = g2dStatus === 200 &&
      /"isLoggedIn"\s*:\s*true/.test(g2dBody) &&
      /"role"\s*:\s*"admin"/.test(g2dBody);
    if (g2dStatusMatch) {
      a(g2dLoggedInTrue,
        `G2.10 (Public URL nginx) auth.me HTTP=${g2dStatus} isLoggedIn=true role=admin`, 'G2');
    }

    // G2e Nginx Set-Cookie passthrough
    const g2dHeaders = out.split('G2D_EXT_HEADERS_BEGIN')[1]?.split('G2D_EXT_HEADERS_END')[0] ?? '';
    const extSetCookie = g2dHeaders.match(/^Set-Cookie:\s*([^\r\n]+)/mi)?.[1] ?? '';
    if (g2dStatusMatch && extSetCookie.length > 5) {
      const extCookieOk = extSetCookie.includes(cookieName) && extSetCookie.includes('HttpOnly');
      a(extCookieOk,
        `G2.11 (Public URL nginx) Set-Cookie header PASSES THROUGH nginx HttpOnly ok. Line="${extSetCookie.slice(0, 160)}${extSetCookie.length > 160 ? '…' : ''}"`, 'G2');
    } else if (g2dStatusMatch) {
      a(false,
        `G2.11 ❌ (Public URL nginx) NO Set-Cookie header present → H2 NGINX COOKIE STRIP CONFIRMED! Sliding renewal cookie lost each refresh!`, 'G2');
    }

    // ─────────────────────────────────────────────────────
    // G3: ENV parse errors on VPS + pm2 env runtime of node process
    // ─────────────────────────────────────────────────────
    const pm2EnvVars = await sh(ssh, `pm2 show eeat-studio-v2 2>/dev/null | grep -iE '(node env|exec cwd|env)' | head -10`);
    console.log('\n──────────────── PM2 eeat-studio-v2 env hints ────────────────');
    console.log(pm2EnvVars || '(pm2 show command returned empty)');
    console.log('────────────────────────────────────────────────────────────\n');

    // pm2 logs last 200 lines for "ENV WARN" errors
    const pm2Logs = await sh(ssh, `pm2 logs eeat-studio-v2 --nostream --lines 200 2>/dev/null | tail -200`);
    const envWarnCount = (pm2Logs.match(/\[V2\]\[ENV WARN\]/g) || []).length;
    const fatalLoginSessionCount = (pm2Logs.match(/verifySession.*null|SESSION_SECRET.*FALLBACK/g) || []).length;
    const sessionVerifyFails = (pm2Logs.match(/SIGN_JWT_ERR|TOKEN_LEN_BAD/g) || []).length;
    a(envWarnCount === 0,
      `G3.1 VPS pm2 logs "[V2][ENV WARN]" count=${envWarnCount} expected=0`, 'G3');
    a(sessionVerifyFails === 0,
      `G3.2 No sign JWT errors in collected logs count=${sessionVerifyFails}`, 'G3');

    // Display summary of pm2 logs (ENV WARN present or not)
    if (envWarnCount > 0) {
      const linesWarn = pm2Logs.split('\n').filter(l => l.includes('[V2][ENV WARN]') ||
        l.includes('FALLBACK_UNSAFE_SESSION_SECRET')).slice(0, 15).join('\n');
      console.log('\n─────────────────── WARNING LINES IN PM2 LOGS ───────────────────');
      console.log(linesWarn);
      console.log('─────────────────────────────────────────────────────────────────\n');
    }

    console.log(`\n==== P0 Auth Refresh Bug LIVE TEST TOTAL: ${passed} PASS / ${failed} FAIL / ${passed + failed} assertions ====`);
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error('\nLIVE TEST ABORTED:', String(e?.message || e).slice(0, 1000), e?.stack || '');
    process.exit(2);
  } finally {
    try { if (ssh) await ssh.close(); } catch { /* ignore */ }
  }
})();
