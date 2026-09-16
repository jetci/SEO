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

  // 1. Simple B2 count verification (no bash conditionals, just raw grep counts)
  await run("1 SIMPLE B2: Login bundle raw grep counts (NO bash conditionals, direct counts)",
    `cd /home/ubuntu/eeat-studio-v2/dist/assets && B=$(ls Login-*.js | head -1) && echo "BUNDLE: $B — built timestamp: $(stat -c '%y' $B 2>/dev/null || ls -la $B)" && echo "" && echo "--- [Button TEXT 'ดำเนินการด้วย Google'] ---" && grep -o 'ดำเนินการด้วย Google' $B | wc -l && echo "--- [SVG EA4335 red fill '#EA4335'] ---" && grep -o '#EA4335' $B | wc -l && echo "--- [CORRECT endpoint: '/api/auth/google/login'] ---" && grep -o '/api/auth/google/login' $B | wc -l && echo "--- [OLD WRONG endpoint '/api/oauth/google/start' (MUST BE 0!)] ---" && grep -o '/api/oauth/google/start' $B | wc -l`);

  // 2. Settings fallback from .env (DB settings has 0 rows) — check backend settings router code to see how it returns env defaults
  await run("2 Settings Router: backend loopback HTTP get settings endpoint (tRPC via HTTP POST or GET health)",
    "cd /home/ubuntu/eeat-studio-v2 && echo '--- .env defaults for settings: ---' && grep -E '^(LLM_PROVIDER|SERP_PROVIDER|DEFAULT_COUNTRY_CODE|DEFAULT_LANG_CODE)=' .env && echo '' && echo '--- Testing if tRPC /trpc/settings.get HTTP endpoint exists (loopback): ---' && curl -s -X POST -H 'Content-Type: application/json' -o /tmp/trpc.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/trpc/settings.get --data '{}' 2>&1 && echo 'Response body (500 chars):' && head -c 500 /tmp/trpc.txt; echo ''");

  // 3. Public /login page + 302 Google redirect via public to simulate actual browser user click
  await run("3 PUBLIC HTTPS simulate browser flow: /login → (user click) → /api/auth/google/login 302 redirect",
    "echo '--- Step 3a: PUBLIC /login page HTTP status 200 ---' && curl -skL -o /dev/null -w '/login HTTP:%{http_code}\\n' https://thaiaeo.manus.host/login && echo '--- Step 3b: PUBLIC /api/auth/google/login endpoint (user click button redirect) → should 302 to Google ---' && curl -skL -o /dev/null -w 'google/login HTTP:%{http_code} LOC:%{redirect_url}\\n' --max-redirs 0 https://thaiaeo.manus.host/api/auth/google/login 2>&1 | head -c 500; echo ''");

  await ssh.close();
  console.log("\n✅ Mini final verification complete.");
}
main().catch(e => { console.error(e); process.exit(1); });
