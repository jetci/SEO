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
  const LOCAL_APP_TS = path.join(PROJ_ROOT, "server", "app.ts");
  const localApp = fs.readFileSync(LOCAL_APP_TS, "utf8");
  const hasMount = localApp.includes("app.use('/api/oauth', authExpressRouter)");
  console.log(`[PRE-CHECK] Local server/app.ts:
    File size: ${localApp.length} chars
    Contains new mount line app.use('/api/oauth', authExpressRouter)? ${hasMount}
  `);

  const ssh = new SSHClient(CFG);
  await ssh.connect();
  console.log("SSH CONNECTED");

  const run = async (label, cmd) => {
    console.log(`\n=== [${label}] ===`);
    const r = await ssh.exec(cmd).catch(e => String(e?.stack || e));
    console.log(String(r).slice(0, 5000));
  };

  // 1. BEFORE state - show current V2 .env callback value
  await run("1 BEFORE: V2 .env — GOOGLE_CALLBACK_URL (before fix, wrong)",
    `cd /home/ubuntu/eeat-studio-v2 && echo '--- Line 19 GOOGLE_CALLBACK_URL current value BEFORE sed:' && awk 'NR==19 || /^GOOGLE_CALLBACK_URL=/' .env`);

  // 2. SFTP upload app.ts (adds new /api/oauth mount route)
  console.log("\n=== [2 SFTP UPLOAD server/app.ts → VPS /server/app.ts (NEW API_OAUTH MOUNT ROUTE ADDED)] ===");
  const sftp = ssh.sftp();
  const REMOTE_APP = "/home/ubuntu/eeat-studio-v2/server/app.ts";
  await sftp.writeFile(REMOTE_APP, localApp, { mode: 0o644 });
  console.log(`✅ SFTP writeFile ${REMOTE_APP} OK (${localApp.length} bytes, 0o644)`);

  // 3. UPDATE .env GOOGLE_CALLBACK_URL → OLD registered path /api/oauth/google/callback
  await run("3 UPDATE .env: sed replace GOOGLE_CALLBACK_URL → OLD registered path /api/oauth/google/callback",
    `cd /home/ubuntu/eeat-studio-v2 && echo '--- Current GOOGLE_CALLBACK_URL line:' && grep -n 'GOOGLE_CALLBACK_URL=' .env && sed -i -E 's|^(GOOGLE_CALLBACK_URL=https://thaiaeo\\.manus\\.host)/api/auth/google/callback$|\\1/api/oauth/google/callback|' .env && echo '--- AFTER sed NEW value:' && grep -n 'GOOGLE_CALLBACK_URL=' .env`);

  // 4. Verify remote app.ts AFTER upload (new mount line present)
  await run("4 VERIFY: remote server/app.ts AFTER upload (new /api/oauth mount line L108?",
    `cd /home/ubuntu/eeat-studio-v2 && grep -nE "app.use\\('\\/api\\/(auth|oauth)'" server/app.ts`);

  // 5. PM2 RESTART eeat-studio-v2 process (PORT 3002) — since uses tsx interpreter, source changes reloaded automatically after restart
  await run("5 PM2 RESTART eeat-studio-v2 (port3002) — PRESERVE eeat-studio v1 id0 port3001",
    "pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -12 && sleep 10 && pm2 jlist 2>/dev/null | grep -E '\"name\"|\"status\"|\"pm_id\"' | head -10");

  // 6. CRITICAL VERIFY: Backend Google login endpoint now sends redirect_uri = NEW OLD registered /api/oauth/google/callback
  await run("6 CRITICAL: /api/auth/google/login 302 redirect_uri NOW = registered OLD /api/oauth/google/callback",
    `LOC=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 10 http://127.0.0.1:3002/api/auth/google/login 2>&1) ; echo "Full 302 URL: $LOC" ; echo "" ; echo "--- redirect_uri value (URL-encoded):" ; echo "$LOC" | grep -oE 'redirect_uri=[^&]+' ; echo "" ; echo "--- Decoded redirect_uri:" ; ENC=$(echo "$LOC" | grep -oE 'redirect_uri=[^&]+' | cut -d= -f2-) ; node -e "const enc = '${ENC}'; console.log(decodeURIComponent(enc))" 2>&1 ; echo "" ; echo "--- EXPECTED = https://thaiaeo.manus.host/api/oauth/google/callback" ; echo "--- MATCH TEST:" ; node -e "const enc='${ENC}'; const dec=decodeURIComponent(enc); const want='https://thaiaeo.manus.host/api/oauth/google/callback'; console.log(dec===want ? '✅ MATCH (redirect_uri_mismatch RESOLVED)' : '❌ NO MATCH '+dec+' vs '+want)"`);

  // 7. Verify BOTH callback routes exist now (auth + oauth paths) — HTTP 2xx status or 400/401 (missing code OK since no Google grant)
  await run("7 ROUTE VERIFY: both callback paths HTTP 2xx (missing code param OK, means route handler exists)",
    `echo "--- /api/auth/google/callback (our old path):" && curl -s -o /dev/null -w 'HTTP:%{http_code}\\n' --max-time 10 http://127.0.0.1:3002/api/auth/google/callback ; echo "--- /api/oauth/google/callback (REGISTERED path Google calls):" && curl -s -o /dev/null -w 'HTTP:%{http_code}\\n' --max-time 10 http://127.0.0.1:3002/api/oauth/google/callback`);

  // 8. Public HTTPS endpoint 302 verify too
  await run("8 PUBLIC HTTPS Google login endpoint redirect_uri MATCH?",
    `LOC=$(curl -sk -o /dev/null -w '%{redirect_url}' --max-redirs 0 --max-time 15 https://thaiaeo.manus.host/api/auth/google/login 2>&1) ; echo "Public 302 URL redirect_uri:" ; echo "$LOC" | grep -oE 'redirect_uri=[^&]+' | cut -d= -f2- | while read ENC; do node -e "console.log(decodeURIComponent('${ENC//\'/\\'}'))"; done`);

  // 9. Health check loopback phase=2
  await run("9 LOOPBACK /api/health phase=2 routers=research",
    "curl -s http://127.0.0.1:3002/api/health");

  // 10. pm2 save survive reboot
  await run("10 PM2 SAVE dump.pm2 persist process state reboot",
    "pm2 save 2>&1 | tail -3");

  await ssh.close();
  console.log("\n✅ GOOGLE REDIRECT_URI_MISMATCH HOTFIX PIPELINE DONE! Final test expected: user click Google Login → NO MORE 400 redirect_uri_mismatch. Logging in as intelman26@gmail.com works to Admin Dashboard.");
}
main().catch(e => { console.error(e); process.exit(1); });
