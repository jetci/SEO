import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    // Run node on VPS that imports ENV + runs auth gates DIRECTLY using tsx (TS file)
    // Use tsx with inline import to run actual server/_core/env.ts logic
    const script = `
cd /home/ubuntu/eeat-studio-v2 && ./node_modules/.bin/tsx --no-warnings -e '
import "./server/_core/env.js"; // side-effect load ENV + exports IS_DEV/IS_PROD/ENV
const { ENV, IS_PROD } = await import("./server/_core/env.js");
const TEST = {
  openId: "102308593207118714314",
  password: "K9XmPq4Rtv2ZB8Lw3N!7C",
};
const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || "0") === "1";
const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim();
const isAdminOpenId = String(TEST.openId || "").trim() === String(ENV.ADMIN_OPENID || "").trim();
const pwdMatch = prodDemoPwd ? (String(TEST.password || "").trim() === prodDemoPwd) : false;
console.log("=== EVAL AUTH GATES USING ACTUAL server/_core/env.ts ===");
console.log("IS_PROD:", IS_PROD, typeof IS_PROD);
console.log("prodDemoAllowed:", prodDemoAllowed, "(raw env):", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
console.log("prodDemoPwd.length:", prodDemoPwd.length, "match first 3 last 3:", prodDemoPwd.slice(0,3), "...", prodDemoPwd.slice(-3), "INPUT pwd first 3 last 3:", TEST.password.slice(0,3), "...", TEST.password.slice(-3));
console.log("isAdminOpenId:", isAdminOpenId, "INPUT.OID.len:", TEST.openId.length, "ENV.ADMIN_OID.len:", String(ENV.ADMIN_OPENID).length);
console.log("INPUT.OID === ENV.OID:", TEST.openId === ENV.ADMIN_OPENID);
console.log("pwdMatch:", pwdMatch, "equal strings:", TEST.password === prodDemoPwd);
console.log("FINAL GATE: IS_PROD && 3 AND = ", IS_PROD && (prodDemoAllowed && isAdminOpenId && pwdMatch));
console.log("ENV.SESSION_SECRET first 3 last 3:", String(ENV.SESSION_SECRET||"").slice(0,3), "...", String(ENV.SESSION_SECRET||"").slice(-3), "length:", String(ENV.SESSION_SECRET||"").length);
console.log("Zod ADMIN_OPENID:", JSON.stringify(ENV.ADMIN_OPENID));
console.log("process.env.ADMIN_OPENID:", JSON.stringify(process.env.ADMIN_OPENID));
console.log("MATCH ENV vs PROCESS ADMIN_OID:", String(ENV.ADMIN_OPENID) === String(process.env.ADMIN_OPENID));
' 2>&1
`;
    const r = await execLine(ssh, script);
    console.log(r);
  } catch (e) { console.error('FAIL:', (e.message || String(e)).slice(0, 1200));
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
