import SSHClient from 'ssh2-promise';

const cfg = {
  host: '35.231.230.218',
  username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt',
  port: 22,
  readyTimeout: 15000,
  keepaliveInterval: 5000,
};

const run = async (label, cmd) => {
  process.stdout.write(`\n===== [${label}] =====\n`);
  const ssh = new SSHClient(cfg);
  try {
    const out = await ssh.exec(cmd).catch(e => e?.message ?? String(e));
    process.stdout.write(String(out).slice(0, 8000));
  } catch (e) {
    process.stdout.write(`ERROR: ${e?.message ?? String(e)}`);
  } finally {
    try { await ssh.close(); } catch {}
  }
};

const main = async () => {
  await run('1. OS / Kernel / Uptime / User', `
    echo "=== Hostname ==="; hostname;
    echo "=== OS Release ==="; cat /etc/os-release 2>/dev/null | head -6;
    echo "=== Architecture ==="; uname -a;
    echo "=== Uptime & Load ==="; uptime;
    echo "=== User & Groups ==="; id; echo "sudo test:"; sudo -n true 2>&1 && echo "OK sudo no-pass" || echo "Need password";
  `.replace(/\n\s+/g,'\n').trim());

  await run('2. CPU / RAM / Disk', `
    echo "=== CPU Cores ==="; nproc;
    echo "=== RAM ==="; free -h 2>/dev/null || vm_stat 2>/dev/null | head -10;
    echo "=== Disk usage ==="; df -h / /home 2>/dev/null;
    echo "=== Mounted ==="; lsblk 2>/dev/null | head -20;
  `.replace(/\n\s+/g,'\n').trim());

  await run('3. Node / npm / pm2 / nginx / caddy / ufw / ports', `
    set +e
    echo "=== node version ==="; node -v 2>&1
    echo "=== npm ==="; npm -v 2>&1
    echo "=== npx ==="; npx --version 2>&1
    echo "=== pm2 ==="; pm2 -v 2>&1
    echo "=== caddy ==="; caddy version 2>&1
    echo "=== nginx ==="; nginx -v 2>&1
    echo "=== docker ==="; docker --version 2>&1
    echo "=== git ==="; git --version 2>&1
    echo "=== curl / wget ==="; curl --version 2>&1 | head -1; wget --version 2>&1 | head -1
    echo "=== Open ports (listen) ==="; ss -tlnp 2>/dev/null | head -25 || netstat -tlnp 2>/dev/null | head -25
    echo "=== UFW / firewall ==="; sudo -n ufw status 2>&1 | head -10
    echo "=== systemd services ==="; systemctl --type=service --state=running 2>&1 | grep -iE "caddy|nginx|node|mysql|redis|pm2|docker" | head -15
  `.replace(/\n\s+/g,'\n').trim());

  await run('4. Home dir / existing files (thaiaeo.manus.host hints)', `
    echo "=== ls -la /home/ubuntu ==="; ls -la /home/ubuntu
    echo "=== find web roots ==="; sudo -n find /var/www -maxdepth 3 -type d 2>/dev/null | head -20
    echo "=== Caddyfile candidates ==="; sudo -n find /etc /home/ubuntu -maxdepth 5 -iname 'Caddyfile' 2>/dev/null
    echo "=== nginx sites ==="; sudo -n ls /etc/nginx/sites-enabled/ 2>/dev/null
  `.replace(/\n\s+/g,'\n').trim());

  await run('5. DNS resolution + Outbound HTTPS (verify can reach npm/vercel/google)', `
    echo "=== DNS thaiaeo.manus.host ==="; getent hosts thaiaeo.manus.host || nslookup thaiaeo.manus.host 2>&1 | head -8
    echo "=== curl registry.npmjs.org ==="; curl -sSI --max-time 8 https://registry.npmjs.org/ 2>&1 | head -6
    echo "=== curl google.com ==="; curl -sSI --max-time 8 https://www.google.com/ 2>&1 | head -4
  `.replace(/\n\s+/g,'\n').trim());
};

main().catch(e => console.error('FATAL', e)).finally(() => process.exit(0));
