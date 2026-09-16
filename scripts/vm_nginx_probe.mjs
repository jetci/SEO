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
  await run('N1. nginx sports-eeat-writer (ports 80/443 config)', `
    echo "=== nginx sites-enabled ==="; ls -la /etc/nginx/sites-enabled/
    echo "=== /etc/nginx/sites-enabled/sports-eeat-writer content (150 lines) ==="
    sudo -n cat /etc/nginx/sites-enabled/sports-eeat-writer 2>/dev/null | head -n 150
  `.replace(/\n\s+/g,'\n').trim());

  await run('N2. nginx eeat-studio.conf (current thaiaeo host)', `
    echo "=== /etc/nginx/sites-enabled/eeat-studio.conf (150 lines) ==="
    sudo -n cat /etc/nginx/sites-enabled/eeat-studio.conf 2>/dev/null | head -n 150
  `.replace(/\n\s+/g,'\n').trim());

  await run('N3. PM2 running apps (eeat-studio old services?)', `
    set +e
    echo "=== pm2 list ==="
    pm2 list 2>&1
    echo "=== pm2 describe latest ==="
    pm2 describe 0 2>&1 | head -40
    echo "=== pm2 env EEAT Studio ports? ==="
    ss -tlnp | grep -E "node|3000|3001|3002|8080"
  `.replace(/\n\s+/g,'\n').trim());

  await run('N4. MySQL Docker container 3306/3307 status (eeat-studio-mysql)', `
    set +e
    echo "=== docker ps -a ==="
    docker ps -a 2>&1
    echo "=== mysql docker env (pw/db/user?) ==="
    docker inspect eeat-studio-mysql 2>&1 | grep -iE "MYSQL_|container name|image:" | head -30
    echo "=== try show db names on 3306 ==="
    docker exec eeat-studio-mysql 2>&1 mysql -uroot -proot -e "SHOW DATABASES;" 2>&1 | head -20
    echo "=== try show db names on 3307 ==="
    docker ps --format '{{.Names}}' | grep -v "^$" | head -5
  `.replace(/\n\s+/g,'\n').trim());
};

main().catch(e => console.error('FATAL', e)).finally(() => process.exit(0));
