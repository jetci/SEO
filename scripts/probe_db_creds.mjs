// Quick probe: get mysql credentials from the 2 running mariadb docker containers
// (ports 3306 sports-eeat-mysql, 3307 eeat-studio-db)
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", port: 22, readyTimeout: 20000 };
const sh = `set +e
echo "========= 1. eeat-studio-db (port 3307) container env ========="
docker inspect eeat-studio-db 2>&1 \
  | grep -E "MYSQL_|container name|Image.*mariadb|Mariadb|/var/lib/mysql" \
  | head -40
echo ""
echo "========= 2. sports-eeat-mysql (port 3306) container env ========="
docker inspect sports-eeat-mysql 2>&1 \
  | grep -E "MYSQL_|container name|Image.*mariadb|Mariadb|/var/lib/mysql" \
  | head -40
echo ""
echo "========= 3. existing eeat-studio (v1 old PM2 app) env ========="
pm2 env 0 2>&1 | grep -iE "DB_|DATABASE|MYSQL|SESSION|PORT|URL" | head -40
echo ""
echo "========= 4. /home/ubuntu/eeat-studio (v1 old) .env ========="
ls -la /home/ubuntu/eeat-studio 2>&1 | head -20
cat /home/ubuntu/eeat-studio/.env 2>/dev/null | head -80
cat /home/ubuntu/eeat-studio/start.sh 2>/dev/null | head -40
`;
(async () => {
  const ssh = new SSHClient(cfg); await ssh.connect();
  process.stdout.write(await ssh.exec(sh).catch(e => String(e.message || e)));
  await ssh.close();
})().catch(e => { console.error(e); process.exit(1); });
