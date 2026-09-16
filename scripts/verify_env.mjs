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
    console.log(String(r).slice(0, 3000));
  };

  await run("1 VPS PROD .env values (google + DEV_USE_MOCK_AUTH)",
    "cd /home/ubuntu/eeat-studio-v2 && echo '--- .env lines starting with GOOG/LLM/SERP/DEV:'; grep -E '^(GOOGLE|DEV_USE|LLM|SERP|DEFAULT_CO|DEFAULT_LA)' .env | sed 's/=.*/=*****/'");

  await run("2 backend /api/auth/google/login endpoint redirect test",
    "curl -s -o /tmp/x.txt -w 'HTTP:%{http_code}\\nLOC:%{redirect_url}\\n' -L --max-redirs 0 http://127.0.0.1:3002/api/auth/google/login ; echo '--- body first 300:'; head -c 300 /tmp/x.txt; echo");

  await ssh.close();
  console.log("\n✅ DONE ENV VERIFY");
}
main().catch(e => { console.error(e); process.exit(1); });
