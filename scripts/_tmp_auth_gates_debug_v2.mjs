import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    const script = `
cd /home/ubuntu/eeat-studio-v2 && cat > /tmp/_auth_debug.cjs <<'SCRIPT_EOF'
const { ENV, IS_PROD, IS_DEV } = require("./server/_core/env.js");
const TEST = { openId: "102308593207118714314", password: "K9XmPq4Rtv2ZB8Lw3N!7C" };
(async () => {
  const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || "0") === "1";
  const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim();
  const isAdminOpenId = String(TEST.openId || "").trim() === String(ENV.ADMIN_OPENID || "").trim();
  const pwdMatch = prodDemoPwd ? (String(TEST.password || "").trim() === prodDemoPwd) : false;
  console.log("=== EVAL AUTH GATES server/_core/env.js require ===");
  console.log("IS_PROD:", JSON.stringify(IS_PROD), typeof IS_PROD);
  console.log("IS_DEV:", JSON.stringify(IS_DEV), typeof IS_DEV);
  console.log("ENV.NODE_ENV:", JSON.stringify(ENV.NODE_ENV));
  console.log("process.env.NODE_ENV:", JSON.stringify(process.env.NODE_ENV));
  console.log("prodDemoAllowed:", prodDemoAllowed, "raw ALLOW_PROCESS:", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
  console.log("prodDemoPwd.len:", prodDemoPwd.length, "match:", TEST.password === prodDemoPwd, "pwd first 3:", (prodDemoPwd||"").slice(0,3));
  console.log("isAdminOpenId:", isAdminOpenId, "INPUT OID:", TEST.openId, "ENV ADMIN_OID:", String(ENV.ADMIN_OPENID));
  console.log("pwdMatch:", pwdMatch);
  console.log("ENV.ADMIN_OPENID === process.env.ADMIN_OPENID:", String(ENV.ADMIN_OPENID) === String(process.env.ADMIN_OPENID));
  console.log("FINAL IS_PROD && 3 AND:", IS_PROD && prodDemoAllowed && isAdminOpenId && pwdMatch);
  console.log("ENV.SESSION_SECRET.len:", String(ENV.SESSION_SECRET||"").length);
})();
SCRIPT_EOF
node /tmp/_auth_debug.cjs 2>&1 | head -50
`;
    const r = await execLine(ssh, script);
    console.log(r);
  } catch (e) { console.error('FAIL:', (e.message || String(e)).slice(0, 1200));
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
