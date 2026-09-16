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
  // 0. READ LOCAL Login.tsx (CORRECT version — L347 /api/auth/google/login)
  const LOCAL_LOGIN = path.join(PROJ_ROOT, "client", "src", "pages", "Login.tsx");
  const localContent = fs.readFileSync(LOCAL_LOGIN, "utf8");
  const localCorrectCount = (localContent.match(/\/api\/auth\/google\/login/g) || []).length;
  const localOldWrongCount = (localContent.match(/\/api\/oauth\/google\/start/g) || []).length;
  console.log(`[PRE-CHECK] Local Login.tsx:
    Local file exists: ${fs.existsSync(LOCAL_LOGIN)}
    Local size: ${localContent.length} chars
    Correct endpoint /api/auth/google/login COUNT: ${localCorrectCount} (EXPECT ≥1)
    Old WRONG endpoint /api/oauth/google/start COUNT: ${localOldWrongCount} (EXPECT 0)
  `);
  if (localOldWrongCount !== 0 || localCorrectCount < 1) {
    console.error("FATAL: LOCAL Login.tsx IS NOT CORRECT VERSION. ABORT SFTP.");
    process.exit(10);
  }
  console.log("✅ Local Login.tsx IS CORRECT (has new endpoint, no old). Proceeding SFTP upload.");

  const ssh = new SSHClient(CFG);
  await ssh.connect();
  console.log("SSH CONNECTED");

  const run = async (label, cmd) => {
    console.log(`\n=== [${label}] ===`);
    const r = await ssh.exec(cmd).catch(e => String(e?.stack || e));
    console.log(String(r).slice(0, 5000));
  };

  // 1. BEFORE: Check what VPS remote Login.tsx contains (OLD WRONG expected confirmed)
  await run("1 BEFORE: VPS remote Login.tsx — verify WRONG endpoint presence BEFORE upload",
    `cd /home/ubuntu/eeat-studio-v2/client/src/pages && echo 'Remote Login.tsx size:' && wc -c Login.tsx && echo 'Correct endpoint /api/auth/google/login count:' && grep -c '/api/auth/google/login' Login.tsx || echo 0 && echo 'OLD WRONG endpoint /api/oauth/google/start count:' && grep -c '/api/oauth/google/start' Login.tsx || echo 0`);

  // 2. SFTP upload LOCAL correct Login.tsx OVERWRITE VPS remote
  console.log("\n=== [2 SFTP UPLOAD: Local Login.tsx → VPS /client/src/pages/Login.tsx] ===");
  const sftp = ssh.sftp();
  const REMOTE_PATH = "/home/ubuntu/eeat-studio-v2/client/src/pages/Login.tsx";
  await sftp.writeFile(REMOTE_PATH, localContent, { mode: 0o644 });
  console.log(`✅ SFTP writeFile done to remote: ${REMOTE_PATH} (${localContent.length} bytes, 0o644)`);

  // 3. AFTER: Verify VPS remote Login.tsx NOW matches correct content
  await run("3 AFTER: VPS remote Login.tsx content verify POST upload",
    `cd /home/ubuntu/eeat-studio-v2/client/src/pages && echo 'Remote Login.tsx size AFTER upload:' && wc -c Login.tsx && echo 'Correct endpoint /api/auth/google/login count (expect ≥1):' && grep -c '/api/auth/google/login' Login.tsx && echo 'OLD WRONG endpoint /api/oauth/google/start count (expect 0):' && (grep -c '/api/oauth/google/start' Login.tsx || echo 0)`);

  // 4. REBUILD CLIENT — Vite production build with correct Login.tsx source
  await run("4 REBUILD: Vite npm run build client POST SFTP upload + correct env",
    "cd /home/ubuntu/eeat-studio-v2 && echo 'Build start (with VITE_USE_MOCK_AUTH=0 in .env):' && grep VITE_USE_MOCK_AUTH .env && timeout 240 npm run build 2>&1 | tail -30");

  // 5. Postbuild copy SPA 404 fallbacks
  await run("5 POSTBUILD: copy index.html to route subfolders (SPA 404 fix deep links)",
    "cd /home/ubuntu/eeat-studio-v2 && for dst in 404 login projects kcp settings system; do mkdir -p dist/${dst}; cp -f dist/index.html dist/${dst}/index.html; done; echo 'Postbuild copies done.'; du -sh dist/");

  // 6. PM2 RESTART eeat-studio-v2 (port 3002) — DO NOT TOUCH eeat-studio (v1 id0 port3001)
  await run("6 PM2 RESTART: eeat-studio-v2 (port 3002) — PRESERVE eeat-studio (v1 id0 3001)",
    "pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -12 && sleep 8 && echo 'PM2 status:' && pm2 jlist 2>/dev/null | grep -E '\"name\":\"|\"status\"|\"pm_id\"' | head -12");

  // 7. Health check loopback + public
  await run("7 HEALTH CHECK: loopback + public endpoints",
    "echo '--- loopback /api/health phase=2 ---' && curl -s -o /tmp/hc3.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/api/health && cat /tmp/hc3.txt && echo && grep -q '\"phase\":2' /tmp/hc3.txt && echo '✅ phase=2 OK' ; echo '--- PUBLIC HTTPS / (login HTML shell) ---' && curl -sk -o /tmp/pub3.html -w 'HTTP:%{http_code} len:%{size_download}\\n' https://thaiaeo.manus.host/ && head -c 200 /tmp/pub3.html");

  // 8. FINAL CRITICAL VERIFY B2: Login bundle endpoint counts after new rebuild
  await run("8 FINAL B2: Login bundle POST-rebuild — endpoint correctness (MUST be CORRECT=1, OLD WRONG=0)",
    `cd /home/ubuntu/eeat-studio-v2/dist/assets && B=$(ls Login-*.js 2>/dev/null | head -1) && echo "Latest Login bundle: $B (just rebuilt)" && echo "" && echo "--- Google button text 'ดำเนินการด้วย Google' ---" && C=$(grep -c 'ดำเนินการด้วย Google' $B 2>/dev/null || echo 0); echo "Count=$C (expect ≥1)"; [ "$C" -ge 1 ] && echo "✅ PASS TEXT" || echo "❌ FAIL TEXT" && echo "" && echo "--- Google SVG EA4335 fill ---" && S=$(grep -c '#EA4335' $B 2>/dev/null || echo 0); echo "Count=$S (expect ≥1)"; [ "$S" -ge 1 ] && echo "✅ PASS SVG" || echo "❌ FAIL SVG" && echo "" && echo "--- CORRECT ENDPOINT /api/auth/google/login ---" && CE=$(grep -c '/api/auth/google/login' $B 2>/dev/null || echo 0); echo "Count=$CE (expect ≥1)"; [ "$CE" -ge 1 ] && echo "✅✅✅ PASS CORRECT ENDPOINT (critical fix target)" || echo "❌❌❌ FAIL CORRECT ENDPOINT" && echo "" && echo "--- OLD WRONG ENDPOINT /api/oauth/google/start (MUST BE 0!) ---" && OE=$(grep -c '/api/oauth/google/start' $B 2>/dev/null || echo 0); echo "Count=$OE (EXPECT STRICT 0)"; [ "$OE" -eq 0 ] && echo "✅✅✅ PASS OLD WRONG PURGED (critical — no old endpoint remnant)" || echo "❌❌❌ FAIL OLD WRONG STILL EXISTS!"`);

  // 9. Backend endpoint check (302 redirect)
  await run("9 BACKEND endpoint sanity: Google login 302 redirect (after PM2 restart)",
    "curl -s -o /dev/null -w 'HTTP:%{http_code}\\n' --max-time 8 http://127.0.0.1:3002/api/auth/google/login ; LOC=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 8 http://127.0.0.1:3002/api/auth/google/login) ; echo \"LOC (first 180 chars): ${LOC:0:180}\" ; echo -n 'MATCHES CLIENT_ID + CALLBACK_URI + SCOPE? ' ; echo \"$LOC\" | grep -q 'client_id=344745514354-7er3qtsc9nld4rm9bgcvi9sop4undo86.apps.googleusercontent.com' && echo \"$LOC\" | grep -q 'redirect_uri=https%3A%2F%2Fthaiaeo.manus.host%2Fapi%2Fauth%2Fgoogle%2Fcallback' && echo \"$LOC\" | grep -q 'scope=openid+email+profile' && echo '✅ ALL MATCH' || echo '❌ MISMATCH'");

  // 10. pm2 save (process persist reboot)
  await run("10 PM2 SAVE: persist process state dump survive reboot",
    "pm2 save 2>&1 | tail -3");

  await ssh.close();
  console.log("\n✅ DONE: SFTP upload Login.tsx → rebuild client → PM2 restart HOTFIX PIPELINE COMPLETE. Verify B2 results above!");
}
main().catch(e => { console.error(e); process.exit(1); });
