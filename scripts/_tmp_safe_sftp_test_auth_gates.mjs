import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    const sftp = ssh.sftp();
    // 100% SAFE: Write TS file directly to VPS via SFTP — ZERO bash parsing of the password string!
    const testContent = `
// ZERO BASH — File written via SFTP, no string escaping.
import { ENV, IS_PROD, IS_DEV } from './server/_core/env.js';
const TEST = {
  openId: "102308593207118714314",
  password: "K9XmPq4Rtv2ZB8Lw3N!7C",
  email: "intelman26@gmail.com",
  name: "Admin",
  role: "admin",
};
const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1';
const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim();
const isAdminOpenId = String(TEST.openId || '').trim() === String(ENV.ADMIN_OPENID || '').trim();
const pwdMatch = prodDemoPwd ? (String(TEST.password || '').trim() === prodDemoPwd) : false;
console.log("=== FINAL AUTH GATE TEST (ZERO BASH SAFE FILE MODE) ===");
console.log("IS_PROD:", IS_PROD, "ENV.NODE_ENV:", ENV.NODE_ENV);
console.log("prodDemoAllowed:", prodDemoAllowed, "raw ALLOW_PROCESS:", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
console.log("prodDemoPwd.length:", prodDemoPwd.length, "password JSON:", JSON.stringify(prodDemoPwd));
console.log("input TEST.password:", JSON.stringify(TEST.password), "len:", TEST.password.length);
console.log("PWD EQUAL?", TEST.password === prodDemoPwd);
console.log("isAdminOpenId:", isAdminOpenId, "inputOID:", TEST.openId.length, "ENV.OID:", String(ENV.ADMIN_OPENID).length);
console.log("pwdMatch:", pwdMatch);
const FINAL = IS_PROD && prodDemoAllowed && isAdminOpenId && pwdMatch;
console.log(">>> FINAL RESULT (should be true):", FINAL);
if (!FINAL) {
  // Print per-char codes to detect hidden diffs
  const p1 = TEST.password; const p2 = prodDemoPwd;
  console.log("\n--- PER-CHAR password DIFF (len:", p1.length, "vs", p2.length, ") ---");
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const c1 = p1.charCodeAt(i) || -1; const c2 = p2.charCodeAt(i) || -1;
    if (c1 !== c2) { console.log("  MISMATCH @i="+i, "INPUT="+c1+"("+p1[i]+") PROCESS="+c2+"("+p2[i]+")"); break; }
  }
}
`.trim();
    // Write via SFTP 100% safe no bash
    await sftp.writeFile(`${REMOTE_ROOT}/_test_auth_gates_safe.ts`, testContent);
    console.log('✅ SAFE test file written via SFTP at VPS /home/ubuntu/eeat-studio-v2/_test_auth_gates_safe.ts (password in FILE only, no bash touched!)');
    // Guard pid0
    const jl1 = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jl1); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`GUARD BEFORE: V1 pid0=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅' : '❌'}`);
    // Run with tsx IN PROJECT CWD (loads correct .env) - NO PASSWORD IN CMD LINE!
    const out = await execLine(ssh, `cd ${REMOTE_ROOT} && timeout 30 ./node_modules/.bin/tsx --no-warnings _test_auth_gates_safe.ts 2>&1 | head -40`);
    console.log(`\n${out}`);
    // Clean up temp test
    try { await sftp.unlink(`${REMOTE_ROOT}/_test_auth_gates_safe.ts`); } catch {}
  } catch (e) { console.error('FAIL:', (e.message || String(e)).slice(0, 800));
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
