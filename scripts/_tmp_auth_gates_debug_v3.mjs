import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    const script = `
cd /home/ubuntu/eeat-studio-v2 && cat > /home/ubuntu/eeat-studio-v2/_auth_debug_tmp.cjs <<'SCRIPT_EOF'
const { ENV, IS_PROD, IS_DEV } = require("/home/ubuntu/eeat-studio-v2/server/_core/env.js");
const TEST = { openId: "102308593207118714314", password: "K9XmPq4Rtv2ZB8Lw3N!7C" };
const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || "0") === "1";
const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim();
const isAdminOpenId = String(TEST.openId || "").trim() === String(ENV.ADMIN_OPENID || "").trim();
const pwdMatch = prodDemoPwd ? (String(TEST.password || "").trim() === prodDemoPwd) : false;
console.log("=== EVAL AUTH GATES using actual server/_core/env.js ===");
console.log("IS_PROD:", JSON.stringify(IS_PROD), typeof IS_PROD);
console.log("IS_DEV:", JSON.stringify(IS_DEV), typeof IS_DEV);
console.log("ENV.NODE_ENV:", JSON.stringify(ENV.NODE_ENV));
console.log("process.env.NODE_ENV:", JSON.stringify(process.env.NODE_ENV));
console.log("prodDemoAllowed:", prodDemoAllowed, "raw:", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
console.log("prodDemoPwd.len:", prodDemoPwd.length, "equal PWD:", TEST.password === prodDemoPwd, "first3:", (prodDemoPwd||"").slice(0,3));
console.log("isAdminOpenId:", isAdminOpenId);
console.log("TEST.openId:", TEST.openId);
console.log("ENV.ADMIN_OPENID:", JSON.stringify(ENV.ADMIN_OPENID));
console.log("String ENV === PROCESS ADMIN_OID:", String(ENV.ADMIN_OPENID) === String(process.env.ADMIN_OPENID));
console.log("pwdMatch:", pwdMatch);
console.log(">>> FINAL RESULT [IS_PROD && prodDemoAllowed && isAdminOpenId && pwdMatch]:", IS_PROD && prodDemoAllowed && isAdminOpenId && pwdMatch);
SCRIPT_EOF
cd /home/ubuntu/eeat-studio-v2 && node _auth_debug_tmp.cjs 2>&1 | head -30 ; rm -f _auth_debug_tmp.cjs
`;
    const r = await execLine(ssh, script);
    console.log(r);
  } catch (e) { console.error('FAIL:', (e.message || String(e)).slice(0, 1200));
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
