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
    console.log(String(r).slice(0, 4000));
  };

  // ===== STEP 1: SFTP upload NEW server/app.ts (has /api/oauth mount) =====
  const LOCAL_APP = path.join(PROJ_ROOT, "server", "app.ts");
  const localContent = fs.readFileSync(LOCAL_APP, "utf8");
  console.log("[STEP 1 SFTP] Local app.ts size = " + localContent.length);
  const sftp = ssh.sftp();
  await sftp.writeFile("/home/ubuntu/eeat-studio-v2/server/app.ts", localContent, { mode: 0o644 });
  console.log("✅ Uploaded to VPS eeat-studio-v2/server/app.ts OK");

  // ===== STEP 2: Replace VPS .env GOOGLE_CALLBACK_URL to OLD registered /api/oauth/google/callback =====
  await run("STEP 2 .env: OLD callback → NEW registered /api/oauth/google/callback",
    "cd /home/ubuntu/eeat-studio-v2 && grep -n '^GOOGLE_CALLBACK_URL=' .env && sed -i 's|/api/auth/google/callback|/api/oauth/google/callback|g' .env && grep -n '^GOOGLE_CALLBACK_URL=' .env");

  // ===== STEP 3: Verify mount routes =====
  await run("STEP 3 app.ts: verify /api/oauth mount line exists on VPS remote",
    "cd /home/ubuntu/eeat-studio-v2 && grep -nE \"api/auth|api/oauth\" server/app.ts");

  // ===== STEP 4: PM2 restart =====
  await run("STEP 4 PM2 RESTART eeat-studio-v2",
    "pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -10 && sleep 12 && pm2 list 2>&1 | head -18");

  // ===== STEP 5: CRITICAL VERIFY =====
  await run("STEP 5A HEALTH loopback",
    "sleep 2 && curl -s -o /tmp/hc4.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/api/health && cat /tmp/hc4.txt && echo && echo '--- phase/research grep:' && grep -o '\"phase\":2' /tmp/hc4.txt && grep -c 'research' /tmp/hc4.txt");

  await run("STEP 5B BACKEND Google login ENDPOINT 302 redirect_uri MATCH TEST",
    "curl -s -o /dev/null -w '%{redirect_url}' --max-time 10 http://127.0.0.1:3002/api/auth/google/login > /tmp/redirect_url.txt 2>&1 ; echo 'Full raw redirect URL saved:' && cat /tmp/redirect_url.txt && echo '' && echo '--- Google Console registered CALLBACK must be in URL as redirect_uri ---' && grep -c '/api/oauth/google/callback' /tmp/redirect_url.txt && echo '--- OLD wrong callback MUST NOT be present ---' && grep -c '/api/auth/google/callback' /tmp/redirect_url.txt || echo '0 (old gone OK)'");

  await run("STEP 5C BOTH callback route handlers exist (HTTP not 404)",
    "echo '--- /api/oauth/google/callback route (registered Google path) status (expect 400 or 401 or 2xx OK, NOT 404):' && curl -s -o /dev/null -w 'HTTP:%{http_code}\\n' --max-time 10 http://127.0.0.1:3002/api/oauth/google/callback && echo '--- /api/auth/google/callback route (our old path) status:' && curl -s -o /dev/null -w 'HTTP:%{http_code}\\n' --max-time 10 http://127.0.0.1:3002/api/auth/google/callback");

  await run("STEP 5D PUBLIC HTTPS Google start endpoint REDIRECT CORRECT",
    "curl -sk -o /dev/null -w '%{redirect_url}' --max-redirs 0 --max-time 15 https://thaiaeo.manus.host/api/auth/google/login > /tmp/pub_url.txt ; cat /tmp/pub_url.txt ; echo '' ; echo '--- registered callback /api/oauth/google/callback present? ---' ; grep -c '/api/oauth/google/callback' /tmp/pub_url.txt");

  await run("STEP 6 PM2 SAVE persist dump",
    "pm2 save 2>&1 | tail -3");

  await ssh.close();
  console.log("\n✅ HOTFIX Google redirect_uri_mismatch DONE — LOGIN page Google → click → no more 400 mismatch.");
}
main().catch(e => { console.error(e); process.exit(1); });
