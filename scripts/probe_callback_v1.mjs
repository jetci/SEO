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

  // O5. OLD v1 eeat-studio source: what Google callback routes exist?
  await run("O5. OLD v1 eeat-studio app source code — grep Google callback route path (to figure actual registered URL)",
    `cd /home/ubuntu/eeat-studio && echo '--- project structure ---' && ls -la && echo '--- grep google/callback route path in all server source: ---' && grep -rnE 'google/callback|/callback.*google|callback.*URL|callbackUrl|redirect_uri|oauth.*callback' . --include='*.ts' --include='*.js' --include='*.mjs' 2>/dev/null | head -40 ; echo '--- grep OAUTH_SERVER_URL usage to see what external auth it calls: ---' && grep -rnE 'OAUTH_SERVER_URL|google-oauth-production' . --include='*.ts' --include='*.js' 2>/dev/null | head -25`);

  // O6. Try common callback paths on OLD running v1 eeat-studio app port 3001 (actually working)
  await run("O6. RUNNING old eeat-studio port 3001: probe common callback + google start endpoints",
    `echo '--- /api/auth/google/login 301/302 v1 ---' && curl -s -o /dev/null -w 'HTTP:%{http_code}\\nLOC:%{redirect_url}\\n' --max-redirs 0 http://127.0.0.1:3001/api/auth/google/login 2>&1 | head -1 ; echo '--- /auth/google/login ---' && curl -s -o /dev/null -w 'HTTP:%{http_code}\\nLOC:%{redirect_url}\\n' --max-redirs 0 http://127.0.0.1:3001/auth/google/login 2>&1 | head -1 ; echo '--- /api/oauth/google/start ---' && curl -s -o /dev/null -w 'HTTP:%{http_code}\\nLOC:%{redirect_url}\\n' --max-redirs 0 http://127.0.0.1:3001/api/oauth/google/start 2>&1 | head -1 ; echo '--- /api/google/callback ---' && curl -s -o /dev/null -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3001/api/google/callback 2>&1 ; echo '--- /api/auth/google/callback ---' && curl -s -o /dev/null -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3001/api/auth/google/callback 2>&1`);

  // O7. Also check nginx config for any other server blocks or additional domains/paths that handle Google auth
  await run("O7. Nginx all sites-enabled: grep any server_name/location/callback to find possible registered callback paths",
    `sudo grep -rnE 'server_name|location.*callback|location.*oauth|location.*google|proxy_pass|callback' /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>&1 | head -60`);

  await ssh.close();
  console.log("\n✅ O5-O7 probe for actual registered callback done.");
}
main().catch(e => { console.error(e); process.exit(1); });
