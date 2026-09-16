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

  // Step 1: Public HTTPS /login page — curl full HTML source (handle 301 redirect to /login/ via -L)
  await run("1 PUBLIC /login HTML source fetch",
    "curl -skL -o /tmp/login.html -w 'HTTP:%{http_code} SIZE:%{size_download}\\n' https://thaiaeo.manus.host/login ; echo '--- File saved to /tmp/login.html ---'; ls -la /tmp/login.html");

  // Step 2: Search for Google Login button TEXT marker (L492: "ดำเนินการด้วย Google")
  await run("2 Grep button text marker: 'ดำเนินการด้วย Google'",
    "if grep -q 'ดำเนินการด้วย Google' /tmp/login.html; then echo '✅ FOUND Google Login button text in HTML'; grep -c 'ดำเนินการด้วย Google' /tmp/login.html; else echo '❌ MISSING: Google button text NOT found in HTML'; fi");

  // Step 3: Search for Google SVG icon marker (L490: fill=\"#EA4335\" red path fill)
  await run("3 Grep Google SVG icon marker: '#EA4335'",
    "if grep -q '#EA4335' /tmp/login.html; then echo '✅ FOUND Google SVG EA4335 red fill marker'; grep -c '#EA4335' /tmp/login.html; else echo '⚠️  SVG marker NOT directly in index HTML — checking client bundled JS instead'; fi");

  // Step 4: If SVG/button not in index HTML (React hydration = client-side render), find the Login-*.js bundle and grep markers
  await run("4 Find Login page JS bundle in dist/assets",
    "cd /home/ubuntu/eeat-studio-v2 && ls -la dist/assets/ 2>/dev/null | grep -i 'login' || echo 'No direct Login-*.js found — listing all JS bundles:' && ls dist/assets/*.js 2>/dev/null | head -20");

  await run("5 Search ALL bundled JS for Google button markers (client-side rendered)",
    "cd /home/ubuntu/eeat-studio-v2/dist/assets && for f in *.js; do if grep -q 'ดำเนินการด้วย Google' \"$f\"; then echo \"✅ Button TEXT found in: $f\"; grep -c 'ดำเนินการด้วย Google' \"$f\"; fi; if grep -q '#EA4335' \"$f\"; then echo \"✅ SVG EA4335 found in: $f\"; fi; done ; echo '--- Search done ---'");

  // Step 5: CRITICAL — Verify VITE_USE_MOCK_AUTH embedded value in client build (must be "0", not "1")
  await run("6 Verify VITE_USE_MOCK_AUTH value in bundled JS (must be '0' for button to show)",
    "cd /home/ubuntu/eeat-studio-v2/dist/assets && echo 'Looking for VITE_USE_MOCK_AUTH string in bundles:' ; grep -rn 'VITE_USE_MOCK_AUTH' *.js 2>/dev/null || echo 'No direct VITE_USE_MOCK_AUTH var — checking for usage pattern (googleLoginEnabled logic):' ; grep -rn 'USE_MOCK_AUTH\\|googleLoginEnabled' *.js 2>/dev/null | head -5");

  // Step 6: Also confirm backend endpoint still works (sanity check curl 302 redirect)
  await run("7 Backend Google login endpoint 302 redirect (sanity)",
    "curl -s -o /dev/null -w 'HTTP:%{http_code}\\nLOC:%{redirect_url}\\n' http://127.0.0.1:3002/api/auth/google/login");

  await ssh.close();
  console.log("\n✅ DONE: Login DOM visibility verification script complete.");
}
main().catch(e => { console.error(e); process.exit(1); });
