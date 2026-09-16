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
    console.log(String(r).slice(0, 6000));
  };

  // O8. OLD v1 eeat-studio SERVER folder — list server folder structure
  await run("O8. SERVER structure old eeat-studio (v1) — find Google auth routes .ts files",
    `cd /home/ubuntu/eeat-studio/server && echo 'server ls:' && ls -la && echo '--- find google related files ---' && find . -maxdepth 3 -name '*.ts' -o -name '*.js' 2>/dev/null | head -50 | xargs grep -lE 'google|Google|oauth.*google|GOOGLE|redirect_uri|callback' 2>/dev/null | head -20`);

  // O9. Deep grep google route paths in old server source
  await run("O9. OLD v1 server source: grep for Router google login/callback routes + redirect_uri usage",
    `cd /home/ubuntu/eeat-studio/server && echo '--- Google Login/Callback routes (router lines): ---' && grep -rnE "google.*login|google.*callback|/oauth/google|redirect_uri|callback|google" . --include='*.ts' --include='*.js' 2>/dev/null | grep -v node_modules | head -50`);

  // O10. Run /api/oauth/google/start 302 — full  LOCATION (where does old v1 redirect_uri sends users to Google): extract callback uri)
  await run("O10. OLD v1 /api/oauth/google/start 302 LOCATION full URL — includes registered callback URI!",
    `echo 'OLD v1 /api/oauth/google/start returns: (registered Google REDIRECT URL:)'
    LOC=$(curl -s -o /dev/null -w '%{redirect_url}' --max-redirs 0 http://127.0.0.1:3001/api/oauth/google/start 2>&1) ; echo "FULL 302 URL=$LOC" ; echo "" ; echo "Extracted fields:" ; echo "$LOC" | grep -oE '(client_id|redirect_uri|scope|response_type)=[^&]+" 2>/dev/null ; echo "" ; echo "Actual decoded redirect_uri value URL decoded:" ; URIENC=$(echo "$LOC" | grep -oE 'redirect_uri=[^&]+' | cut -d= -f2-) ; python3 -c "import sys,urllib.parse; print(urllib.parse.unquote('$URIENC'))" 2>&1 || node -e "try { const q='$URIENC'; console.log(decodeURIComponent(q))" 2>&1`);

  await ssh.close();
  console.log("\n✅ O10 PROBE DONE — extracted ACTUAL registered callback URL.");
}
main().catch(e => { console.error(e); process.exit(1); });
