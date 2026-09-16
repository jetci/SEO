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

  // O1. OLD v1 eeat-studio .env — GOOGLE_CALLBACK_URL (registered in Google Console — MUST use EXACT same!)
  await run("O1. OLD v1 eeat-studio .env: Google OAuth registered callback URL (EXACT registered in Google Console!)",
    `cd /home/ubuntu/eeat-studio && echo '--- LINE NUMBERS + V1 .env: ---' && awk '{printf "[%03d] %s\\n", NR, $0}' .env | grep -iE 'GOOGLE|CALLBACK|REDIRECT|CLIENT' | sed -E 's/(=).*$/\\1****MASKED****/' ; echo '--- Show raw values lines (unmask URLs only):' && grep -iE 'GOOGLE|CALLBACK|REDIRECT' .env 2>&1 | sed -E 's/(CLIENT_SECRET|PASS|KEY)=.*/\\1=***HIDDEN***/'`);

  // O2. NEW v2 eeat-studio-v2 .env — OUR CURRENT callback URL
  await run("O2. NEW v2 eeat-studio-v2 .env: OUR callback URL (CURRENT",
    `cd /home/ubuntu/eeat-studio-v2 && echo '--- V2 .env Google lines:' && awk '{printf "[%03d] %s\\n", NR, $0}' .env | grep -iE 'GOOGLE|CALLBACK|REDIRECT' | sed -E 's/(=).*$/\\1****MASKED****/' && echo '--- Real value unmasked URL lines:' && grep -iE 'GOOGLE|CALLBACK|REDIRECT' .env 2>&1 | sed -E 's/(CLIENT_SECRET|PASS|KEY)=.*/\\1=***HIDDEN***/'`);

  // O3. DIFF side-by-side old vs new callback URIs
  await run("O3. EXACT callback value COMPARISON (old v1 vs new v2 — characters by character diff, MUST be EXACT SAME)",
    `OLD=$(cd /home/ubuntu/eeat-studio && grep -iE '^GOOGLE_CALLBACK_URL=' .env | head -1 | cut -d= -f2-) ; NEW=$(cd /home/ubuntu/eeat-studio-v2 && grep -iE '^GOOGLE_CALLBACK_URL=' .env | head -1 | cut -d= -f2-) ; echo "OLD V1 REGISTERED CALLBACK:  [$OLD]" ; echo "NEW V2 OUR CURRENT CALLBACK: [$NEW]" ; if [ "$OLD" = "$NEW" ]; then echo '✅ MATCH'; else echo '❌❌❌ MISMATCH — THIS IS THE ROOT CAUSE!'; echo '--- DIFF ---'; diff <(echo -n "$OLD") <(echo -n "$NEW") || true; fi`);

  // O4. Current Google login endpoint 302 redirect_uri as emitted NOW (before fix)
  await run("O4. CURRENT backend /api/auth/google/login 302 redirect_uri AS-IS (before fix)",
    `LOC=$(curl -s -o /dev/null -w '%{redirect_url}' http://127.0.0.1:3002/api/auth/google/login 2>&1) ; echo "Current V2 redirect_uri IN USE NOW:" ; echo "$LOC" | grep -oE 'redirect_uri=[^&]+'`);

  await ssh.close();
  console.log("\n✅ O1 probe done.");
}
main().catch(e => { console.error(e); process.exit(1); });
