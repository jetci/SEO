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
    console.log(String(r).slice(0, 4000));
  };

  // NOTE: curl from within the box (loopback localhost:3002 -> backend) and also public HTTPS
  await run("1 / [HTTP CODE EXPECT 200, NOT 404 'Cannot GET']",
    "echo '--- loopback 127.0.0.1:3002/ ---'; curl -s -o /tmp/a.txt -w 'HTTP:%{http_code}\\nContent-Type:%{content_type}\\nSize:%{size_download}\\n' http://127.0.0.1:3002/ ; echo '--- First 400 chars:'; head -c 400 /tmp/a.txt; echo");
  await run("2 /login [EXPECT 200 SPA, NOT 404]",
    "curl -s -o /tmp/a.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/login ; head -c 200 /tmp/a.txt; echo");
  await run("3 /projects",
    "curl -s -o /tmp/a.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/projects ; head -c 200 /tmp/a.txt; echo");
  await run("4 /kcp",
    "curl -s -o /tmp/a.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/kcp ; head -c 200 /tmp/a.txt; echo");
  await run("5 /settings",
    "curl -s -o /tmp/a.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/settings ; head -c 200 /tmp/a.txt; echo");
  await run("6 /system/deep/link (any deep path SPA)",
    "curl -s -o /tmp/a.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/system/abc ; head -c 200 /tmp/a.txt; echo");
  await run("7 /api/health (phase=2 research)",
    "curl -s -o /tmp/a.txt -w 'HTTP:%{http_code}\\n' http://127.0.0.1:3002/api/health ; cat /tmp/a.txt; echo");
  await run("8 PUBLIC HTTPS 443 /",
    "curl -sk -o /tmp/a.txt -w 'PUBLIC_HTTPS/ HTTP:%{http_code}\\n' https://thaiaeo.manus.host/ ; head -c 200 /tmp/a.txt; echo");
  await run("9 PUBLIC HTTPS 443 /settings",
    "curl -sk -o /tmp/a.txt -w 'PUBLIC_HTTPS/settings HTTP:%{http_code}\\n' https://thaiaeo.manus.host/settings ; head -c 200 /tmp/a.txt; echo");
  await run("10 PUBLIC HTTPS 443 /api/health FINAL",
    "curl -sk https://thaiaeo.manus.host/api/health; echo");
  await run("11 pm2 save (persist on reboot)",
    "pm2 save 2>&1 | tail -5");
  await ssh.close();
  console.log("\n✅ DONE SPA FALLBACK VERIFY");
}
main().catch(e => { console.error(e); process.exit(1); });
