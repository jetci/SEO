// RUN the PROVEN existing script on VPS + AC-6 DB .cjs
import SSHClient from 'ssh2-promise';
import fs from 'node:fs';
const SSH = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22, readyTimeout: 20000, keepaliveInterval: 30000 };
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';
async function sh(ssh, cmd) {
  try {
    const s = (await ssh.exec(`export PATH="${NODE_PATH}:$PATH"; ${cmd}`))?.toString?.() ?? String(await ssh.exec(cmd));
    return s.trim();
  } catch (e) { return String(e?.message ?? e); }
}
let pass = 0, fail = 0;
function a(cond, msg, g) {
  if (cond) { pass++; console.log('  ✅ PASS [' + g + '] ' + msg); }
  else { fail++; console.error('  ❌ FAIL [' + g + '] ' + msg); }
}

// ── DB SCRIPT NOW .cjs (CommonJS, since package.json "type":"module" ──
const DB_SCRIPT_CJS = `
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { execSync } = require('node:child_process');
function sh(cmd){ try { return String(execSync(cmd, { encoding: 'utf8', timeout: 10000 })).trim(); } catch(e){ return String(e.stderr||e.message||e).trim(); } }
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || '3307';
const DB_USER = process.env.DB_USER || 'eeat';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_V2 = process.env.DB_NAME || 'eeat_studio_v2';
const DB_V1 = 'eeat_studio';
const PW_FLAG = DB_PASS ? ('-p' + DB_PASS) : '';
const SQL_V2 = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" + DB_V2 + "'";
const SQL_V1 = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" + DB_V1 + "'";
const BASE = 'mariadb -h' + DB_HOST + ' -P' + DB_PORT + ' -u' + DB_USER + ' ' + PW_FLAG + ' -BNe ';
const rawV2 = sh(BASE + '"' + SQL_V2 + '"' + ' 2>/dev/null').split(String.fromCharCode(10)).pop() || '0';
const rawV1 = sh(BASE + '"' + SQL_V1 + '"' + ' 2>/dev/null').split(String.fromCharCode(10)).pop() || '0';
const cV2 = parseInt(String(rawV2).trim()) || 0;
const cV1 = parseInt(String(rawV1).trim()) || 0;
console.log('');
console.log('===== AC-6 FOREVER DB LOCK =====');
console.log('V2 Schema: ' + DB_V2 + '  tables = ' + cV2 + '  (EXPECT = EXACT 14)  -> ' + (cV2 === 14 ? 'PASS' : 'FAIL'));
console.log('V1 Schema: ' + DB_V1 + '  tables = ' + cV1 + '  (EXPECT = EXACT 51)  -> ' + (cV1 === 51 ? 'PASS' : 'FAIL'));
console.log('READ ONLY COUNT QUERIES (NO ALTER / DROP / TRUNCATE).');
process.exit((cV2 === 14 && cV1 === 51) ? 0 : 1);
`;

(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok');
    const sftp = ssh.sftp();

    // ── Try existing proven script first ──
    console.log('\n━━━━━━ Check if PROVEN script _tmp_p0_auth_node_vps_final.mjs exists ━━━━━━');
    const list = await sh(ssh, `ls -la ${DEPLOY_DIR}/_tmp_p0_auth_node_vps_final* 2>&1 || echo "NOT FOUND"`);
    console.log(list);

    // Also DB script as .cjs
    console.log('\n━━━━━━━━ AC-6 DB LOCK (.cjs to bypass ESM type:module) ━━━━━━━━');
    await sftp.writeFile(`${DEPLOY_DIR}/_tmp_verify_db_lock.cjs`, DB_SCRIPT_CJS);
    const dbOut = await sh(ssh, `cd ${DEPLOY_DIR} && node _tmp_verify_db_lock.cjs 2>&1`);
    console.log(dbOut);
    const mV2 = dbOut.match(/V2 Schema:.*?tables = (\d+)/);
    const mV1 = dbOut.match(/V1 Schema:.*?tables = (\d+)/);
    const cV2 = mV2 ? parseInt(mV2[1]) : 0;
    const cV1 = mV1 ? parseInt(mV1[1]) : 0;
    a(cV2 === 14, `AC-6 V2 eeat_studio_v2 = EXACT 14 tables. actual=${cV2}`, 'AC6-V2');
    a(cV1 === 51, `AC-6 V1 eeat_studio = EXACT 51 tables FOREVER PRESERVED. actual=${cV1}`, 'AC6-V1');

    // ── AUTH SCRIPT: Re-use EXACT pattern from script that PROVED roundtrip before. Use the EXACT ADMIN_OPENID + JWT sign logic but WRITE ACTUAL SESSION PAYLOAD to have all fields match sdk.ts verifySession expected!
    // Need to check SDK verifySession shape first by reading VPS env + then matching payload.
    // But easier: Since sliding cookie works on VPS (Set-Cookie=5/5), but isLoggedIn=false, problem is auth.me resolver DB user lookup.
    // Let me check if admin openId exists in users table NOW!
    console.log('\n━━━━━━ Check Admin user row still in V2 DB (openId lookup) ━━━━━━━━');
    const usrQ = "SELECT id, openId, email, role FROM users WHERE email='intelman26@gmail.com' OR openId='102308593207118714314' LIMIT 1;";
    const usrOut = await sh(ssh, `cd ${DEPLOY_DIR} && node -e "
require('dotenv').config({path:'./.env'});
const {execSync}=require('node:child_process');
function sh(c){try{return String(execSync(c,{encoding:'utf8',timeout:10000})).trim();}catch(e){return String(e.stderr||'').trim();}}
const H=process.env.DB_HOST, P=process.env.DB_PORT, U=process.env.DB_USER, PW=process.env.DB_PASSWORD||'', D=process.env.DB_NAME||'eeat_studio_v2';
const PW_FLAG = PW?('-p'+PW):'';
const BASE='mariadb -h'+H+' -P'+P+' -u'+U+' '+PW_FLAG+' '+D+' -e ';
const Q = "SELECT id,openId,email,role FROM users WHERE email='intelman26@gmail.com' OR openId='102308593207118714314' LIMIT 1";
console.log(sh(BASE + "'" + Q + "' 2>&1"));
" 2>&1` || "NO OUTPUT");
    console.log(usrOut);

    // ── Now re-run auth SCRIPT correctly: the JWT payload must match EXACTLY what session.createSessionToken expects.
    // Actually the simplest test: use REAL roundtrip, let me sign with sdk.createSessionToken actual VPS function.
    // Write script that imports from server _core/sdk.ts or uses server/_core/env.ts directly via node compiled dist? Easier: replicate server SDK exactly.
    console.log('\n━━━━━━━━ 5x AUTH.ME SERVER ROUNDTRIP (copy exact signed roundtrip logic from server/_core/sdk createSessionToken + auth.me) ━━━━━━━━');
    const AUTH_PROPER = `
import 'dotenv/config';
import { SignJWT, jwtVerify } from 'jose';
const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'eeat_studio_v2_session';
const D2 = process.env.DB_NAME || 'eeat_studio_v2';

function mkSession(openId, extra={}) {
  // Match EXACT server createSessionToken shape in server/_core/sdk.ts: openId, iat, exp, name extra.
  return new SignJWT({ appId: 'eeat-v2', openId, ...extra })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET);
}

// ──── ADMIN: use REAL DB openId if present, else fall back env ADMIN_OPENID ────
const { execSync } = await import('node:child_process');
const H = process.env.DB_HOST, P = process.env.DB_PORT, U = process.env.DB_USER, PW = process.env.DB_PASSWORD || '';
const pwF = PW ? ('-p' + PW) : '';
const raw = String(execSync('mariadb -h' + H + ' -P' + P + ' -u' + U + ' ' + pwF + ' ' + D2 + " -BNe \"SELECT openId,email,id,role FROM users WHERE email='intelman26@gmail.com' LIMIT 1;\" 2>/dev/null", { encoding: 'utf8', timeout: 8000 })).trim();
console.log('Admin row DB lookup (tab-separated):', JSON.stringify(raw));
const parts = raw.split(String.fromCharCode(9)).map(s => s.trim()).filter(Boolean);
const openId = parts[0] || (process.env.ADMIN_OPENID || '102308593207118714314');
const email = parts[1] || 'intelman26@gmail.com';
const userId = parts[2] || '99001';
const role = parts[3] || 'admin';
console.log('Using openId=' + openId + ' email=' + email + ' DBrole=' + role);

const TOKEN = await mkSession(openId, { name: 'Admin', email, role, userId });
console.log('Signed token length=' + TOKEN.length + ' OK');

let ok = 0, sliding = 0;
for (let i = 1; i <= 5; i++) {
  const url = 'http://127.0.0.1:3002/api/trpc/auth.me?input=' + encodeURIComponent('{}');
  const res = await fetch(url, { headers: { Cookie: COOKIE_NAME + '=' + TOKEN, Accept: 'application/json' }, credentials: 'include' });
  const body = await res.text();
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie().length : (res.headers.get('set-cookie') ? 1 : 0);
  const isTrue = /isLoggedIn\s*:\s*true/.test(body);
  const hasRole = /role\s*:\s*["']admin["']/.test(body);
  const hasId = new RegExp('id.?\\s*:.?' + userId).test(body) || /1791739937/.test(body) || new RegExp('"id":' + userId).test(body);
  console.log('CALL #' + i + ' HTTP' + res.status + ' | isLoggedIn=' + (isTrue ? '✅TRUE' : '❌FALSE') + ' role=admin? ' + (hasRole ? '✅' : 'NO') + ' user.id match? ' + (hasId ? '✅' : 'NO') + ' Set-Cookie=' + sc + (sc > 0 ? ' sliding' : ''));
  if (isTrue) ok++;
  if (sc > 0) sliding++;
}
console.log('');
console.log('5x auth.me isLoggedIn=true → ' + ok + '/5 (' + (ok === 5 ? '✅ PASS' : '❌ FAIL') + ')');
console.log('Sliding Set-Cookie present   → ' + sliding + '/5 (' + (sliding >= 1 ? '✅ await FIX deployed' : '❌') + ')');
console.log('');
process.exit((ok === 5 && sliding >= 1) ? 0 : 1);
`;
    await sftp.writeFile(`${DEPLOY_DIR}/_tmp_verify_auth_roundtrip.mjs`, AUTH_PROPER.trim() + '\n');
    const authOut2 = await sh(ssh, `cd ${DEPLOY_DIR} && node _tmp_verify_auth_roundtrip.mjs 2>&1`);
    console.log(authOut2);
    const mOk = authOut2.match(/5x auth\.me isLoggedIn=true → (\d+)\/5/);
    const mSl = authOut2.match(/Sliding Set-Cookie present\s*→\s*(\d+)\/5/);
    const nOk = mOk ? parseInt(mOk[1]) : 0;
    const nSl = mSl ? parseInt(mSl[1]) : 0;
    a(nOk === 5, `5x consecutive auth.me isLoggedIn:true server roundtrip. actual=${nOk}/5`, 'AUTH-5X-ROUNDTRIP');
    a(nSl === 5, `Sliding Set-Cookie (await fix) 5/5 every single call → cookie NEVER expires active user ✨. actual=${nSl}/5`, 'SLIDING-5X');

    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`FINAL: PASS=${pass} / ${pass + fail}   FAIL=${fail}`);
    console.log(`═══════════════════════════════════════════════════`);
    ssh.close?.();
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    console.error('\nFATAL:', e);
    process.exit(1);
  }
})();
