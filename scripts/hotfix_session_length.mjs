import SSHClient from "ssh2-promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJ_ROOT = path.resolve(__dirname, "..");

const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};

async function main() {
  const ssh = new SSHClient(CFG);
  await ssh.connect();
  console.log("SSH CONNECTED");

  const run = async (label, cmd) => {
    console.log(`\n=== [${label}] ===`);
    const r = await ssh.exec(cmd).catch(e => String(e?.stack || e));
    console.log(String(r).slice(0, 5000));
  };

  // ===== STEP 1: SFTP upload NEW auth.ts (fixed length bounds 180-360) =====
  const LOCAL_AUTH = path.join(PROJ_ROOT, "server", "auth.ts");
  const authContent = fs.readFileSync(LOCAL_AUTH, "utf8");
  const len112match = authContent.includes("token.length > 360");
  const len285match = authContent.includes("sessionToken.length > 360");
  console.log(`[PRE] auth.ts: L112 fixed=${len112match} L285 fixed=${len285match}`);
  if (!len112match || !len285match) { console.error("Local auth.ts has not both fixes — ABORT"); process.exit(9); }
  const sftp = ssh.sftp();
  await sftp.writeFile("/home/ubuntu/eeat-studio-v2/server/auth.ts", authContent, { mode: 0o644 });
  console.log("✅ SFTP upload auth.ts OK (fixed length bounds L112 + L285 = 180-360)");

  // ===== STEP 2: Verify remote auth.ts AFTER upload =====
  await run("STEP 2 VPS remote auth.ts AFTER upload: verify length bounds lines",
    "cd /home/ubuntu/eeat-studio-v2 && grep -nE 'token\\.length|sessionToken\\.length' server/auth.ts");

  // ===== STEP 3: PM2 restart eeat-studio-v2 (tsx auto-reloads source after restart) =====
  await run("STEP 3 PM2 RESTART eeat-studio-v2",
    "pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -12 && sleep 12 && pm2 jlist 2>/dev/null | grep -E '\"name\"|\"status\"|\"pm_id\"' | head -10");

  // ===== STEP 4: Health check phase=2 =====
  await run("STEP 4 HEALTH loopback phase=2",
    "curl -s http://127.0.0.1:3002/api/health 2>&1 | head -c 300");

  // ===== STEP 5: Try generate INLINE dev session token → capture real length (since cookie file in VPS project dir node_modules works) =====
  await run("STEP 5: Generate inline token AT VPS eeat-studio-v2 folder (uses node_modules jose installed) → SEE REAL LENGTH",
    `cd /home/ubuntu/eeat-studio-v2 && node --import tsx -e "
import { SignJWT } from 'jose';
import { readFileSync } from 'fs';
const env = readFileSync('.env','utf8');
const sec = (env.match(/^SESSION_SECRET=(.*)$/m) || [])[1] || '';
const uid = (env.match(/^ADMIN_OPENID=(.*)$/m) || [])[1] || '102308593207118714314';
const key = new TextEncoder().encode(sec);
async function t(){
  for (const name of ['', 'Admin V2', 'Admin V2 Very Long Display Name Up To 40 Chars Test']) {
    const tk = await new SignJWT({ openId:uid, appId:'eeat-studio-v2', name })
      .setProtectedHeader({alg:'HS256', typ:'JWT'})
      .setExpirationTime(Math.floor((Date.now()+86400000)/1000))
      .sign(key);
    console.log('name=\"'+name+'\" length='+tk.length+' valid? '+(tk.length>=180&&tk.length<=360?'✅ PASS IN 180-360':'❌ FAIL OUT OF BOUNDS'));
  }
}
t().catch(e=>console.error(e.message || e));
" 2>&1`);

  // ===== STEP 6: Google login redirect_uri is still /api/oauth/google/callback (old registered) =====
  await run("STEP 6: Google 302 redirect_uri still OLD registered /api/oauth/google/callback",
    "LOC=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 10 http://127.0.0.1:3002/api/auth/google/login 2>&1) ; echo \"$LOC\" | grep -oE 'redirect_uri=[^&]+'");

  // ===== STEP 7: Public start endpoint =====
  await run("STEP 7 PUBLIC: Google login HTTPS 302",
    "curl -sk -o /dev/null -w 'HTTP:%{http_code} ' --max-time 15 --max-redirs 0 https://thaiaeo.manus.host/api/auth/google/login 2>&1");

  await run("STEP 8 PM2 SAVE persist reboot",
    "pm2 save 2>&1 | tail -3");

  await ssh.close();
  console.log("\n✅ HOTFIX SESSION TOKEN LENGTH 272 ERROR → LIFT BOUNDS → DONE!");
}
main().catch(e => { console.error(e); process.exit(1); });
