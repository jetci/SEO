import SSHClient from "ssh2-promise";

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

  // Step 1: Show current .env line count + content summary BEFORE
  await run("1 BEFORE: VPS .env — line count + grep VITE lines",
    "cd /home/ubuntu/eeat-studio-v2 && echo 'Line count:' && wc -l .env && echo 'VITE lines present (expect empty before fix):' && grep -n '^VITE_' .env || echo '(no VITE_ lines yet — MATCHING BUG CONFIRMED)' && echo 'DEV_USE_MOCK_AUTH line position:' && grep -n '^DEV_USE_MOCK_AUTH' .env");

  // Step 2: INJECT missing VITE_USE_MOCK_AUTH=0 + VITE_APP_TITLE lines AFTER DEV_USE_MOCK_AUTH line
  // sed insert lines after the line that starts with DEV_USE_MOCK_AUTH=0
  await run("2 INSERT missing VITE lines into .env (after DEV_USE_MOCK_AUTH=0 line) — overwrite mode with tmp file",
    `cd /home/ubuntu/eeat-studio-v2 && awk '
/^DEV_USE_MOCK_AUTH=/ { print; print "VITE_USE_MOCK_AUTH=0"; print "VITE_APP_TITLE=EEAT Studio V2"; next }
1' .env > .env.tmp && wc -l .env && wc -l .env.tmp && mv -f .env.tmp .env && chmod 600 .env && echo 'OK lines injected'`);

  // Step 3: Validate AFTER
  await run("3 AFTER: VPS .env — line count + VITE lines present NOW",
    "cd /home/ubuntu/eeat-studio-v2 && echo 'Line count (should be +2 from before):' && wc -l .env && echo 'All VITE_ lines NOW:' && grep -nE '^(VITE_|DEV_USE_MOCK_AUTH|VITE_APP_TITLE)' .env");

  // Step 4: REBUILD CLIENT (Vite production build with new .env so VITE_ vars actually embedded)
  await run("4 REBUILD: npm run build client Vite production with VITE_USE_MOCK_AUTH=0 env present",
    "cd /home/ubuntu/eeat-studio-v2 && echo 'Build start — env VITE_USE_MOCK_AUTH:' && grep VITE_USE_MOCK_AUTH .env && timeout 220 npm run build 2>&1 | tail -30");

  // Step 5: Postbuild copy SPA fallbacks
  await run("5 POSTBUILD: copy index.html to /login /projects /kcp /settings etc (SPA 404 fix)",
    "cd /home/ubuntu/eeat-studio-v2 && for dst in 404 login projects kcp settings system; do if [ ! -f dist/${dst}/index.html ]; then mkdir -p dist/${dst}; cp dist/index.html dist/${dst}/index.html; echo \"Copied to dist/${dst}/\"; fi; done && echo 'Dist folder:' && ls dist/ && du -sh dist/");

  // Step 6: Verify bundle actually contains VITE inlined 0 — Login bundle search
  await run("6 VERIFY: Login bundle again after rebuild (check for Google markers still present)",
    "cd /home/ubuntu/eeat-studio-v2/dist/assets && LOGIN_BUNDLE=$(ls Login-*.js | head -1) && echo \"Using Login bundle: $LOGIN_BUNDLE\" && echo 'Button TEXT count:' && grep -c 'ดำเนินการด้วย Google' $LOGIN_BUNDLE && echo 'SVG EA4335 count:' && grep -c '#EA4335' $LOGIN_BUNDLE && echo 'Auth endpoint correct path /api/auth/google/login:' && grep -c '/api/auth/google/login' $LOGIN_BUNDLE");

  // Step 7: PM2 RESTART eeat-studio-v2 process (reload server code with new env + rebuilt dist)
  await run("7 PM2 RESTART: eeat-studio-v2 process (PORT 3002) — NO touch old eeat-studio (v1 port 3001)",
    "pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -15 && sleep 8 && pm2 list 2>&1 | head -20");

  // Step 8: Health check loopback after restart
  await run("8 HEALTH CHECK: loopback localhost:3002/api/health (phase=2, routers include research)",
    "curl -s -o /tmp/hc2.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/api/health && cat /tmp/hc2.txt && echo && grep -q '\"phase\":2' /tmp/hc2.txt && echo '✅ phase=2 OK' && grep -q 'research' /tmp/hc2.txt && echo '✅ research router OK'");

  // Step 9: PUBLIC HTTPS health
  await run("9 PUBLIC FINAL: curl https://thaiaeo.manus.host/ → 200 index.html (NOT 404)",
    "curl -sk -o /tmp/pub.html -w 'PUBLIC_HTTPS HTTP:%{http_code}\\n' https://thaiaeo.manus.host/ && echo 'First 300 chars:' && head -c 300 /tmp/pub.html && echo");

  await ssh.close();
  console.log("\n✅ DONE: ENV injection + rebuild + restart hotfix complete.");
}
main().catch(e => { console.error(e); process.exit(1); });
