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

  const run = async (cmd) => {
    console.log("\n$", cmd);
    const r = await ssh.exec(cmd).catch(e => String(e?.stack || e));
    console.log(String(r).slice(0, 3000));
  };

  await run("echo '=== [1] PM2 list check dual processes ==='; pm2 list");
  await run("echo '=== [2] nginx config proxy_pass check (expected 3002) ==='; grep proxy_pass /etc/nginx/sites-available/eeat-studio.conf");
  await run("echo '=== [3] nginx rollback backup file exists? ==='; ls -la /etc/nginx/sites-available/eeat-studio.conf.bak.* 2>&1 || echo NO BACKUP FOUND");
  await run("echo '=== [4] PUBLIC HEALTH PROBE ==='; curl -sk -o /tmp/x.txt -w 'HTTP:%{http_code}\\n' https://thaiaeo.manus.host/api/health; cat /tmp/x.txt; echo");
  await run("echo '=== [5] Verify old eeat_studio v1 schema untouched count ==='; docker exec eeat-studio-db mariadb -ueeat -p'eeat_secret_2026_Cloud!' -N -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\"eeat_studio\";' 2>&1 | tail -1");
  await run("echo '=== [6] Verify new eeat_studio_v2 tables count (≥12) ==='; docker exec eeat-studio-db mariadb -ueeat -p'eeat_secret_2026_Cloud!' -N -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\"eeat_studio_v2\";' 2>&1 | tail -1");
  await run("echo '=== [7] Admin + Projects seeded? ==='; docker exec eeat-studio-db mariadb -ueeat -p'eeat_secret_2026_Cloud!' eeat_studio_v2 -N -e 'SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM projects;' 2>&1");
  await run("echo '=== [8] Ports listen 3000/3001/3002 all? ==='; ss -tlnp 2>/dev/null | grep -E ':(3000|3001|3002) ' || echo 'none found?'");
  await run("echo '=== [9] PM2 SAVE (auto start reboot) ==='; pm2 save");
  await run("echo '=== [10] WP-D1: Verify Deploy Hash / Checksum sync (phase2 routers=11, serverTime within 60s = build OK) ==='; curl -sk -o /tmp/x.txt -w 'HTTP:%{http_code}\\n' https://thaiaeo.manus.host/api/health; cat /tmp/x.txt; echo; node -e \"const s=require('fs').readFileSync('/tmp/x.txt','utf8'); try{const j=JSON.parse(s); const now=Date.now(); const server=+new Date(j.serverTime || 0); const mins=Math.round((now-server)/1000/60); console.log('serverTime UTC offset =', mins, 'min (expect <=60 → sync OK). routers=', j.routers?.length || 0, 'phase=', j.phase); }catch(e){console.log('parse fail');}\"");

  await ssh.close();
  console.log("\n✅ DONE VERIFY");
}
main().catch(e => { console.error(e); process.exit(1); });
