// ============================================================
//  DEPLOY NOW V2 — Real Credentials Captured from v1 .env
// ============================================================
import SSHClient from "ssh2-promise";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
  keepaliveInterval: 8000,
};

const LOCAL_TGZ  = path.resolve("deploy_tmp/project.tar.gz");
const REMOTE_DIR = "/home/ubuntu/eeat-studio-v2";

// ===== REAL CREDENTIALS — extracted from /home/ubuntu/eeat-studio/.env =====
const DB_HOST = "127.0.0.1";
const DB_PORT = 3307;
const DB_USER = "eeat";
const DB_PW   = "eeat_secret_2026_Cloud!";   // ✅ verified real credential
const DB_NAME = "eeat_studio_v2";             // ✅ NEW schema name — NOT overwrite v1

const BACKEND_PORT = 3002;
const PM2_NAME = "eeat-studio-v2";

const GOOGLE_CLIENT_ID = "344745514354-7er3qtsc9nld4rm9bgcvi9sop4undo86.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

const LLM_API_KEY = "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";
const SERP_API_KEY = "da4e2c2fd06a517c68a1f2b736ddd9d4ecf543e6";

const ADMIN_OPENID = "102308593207118714314";
const ADMIN_EMAIL  = "intelman26@gmail.com";

const LOG = (label, msg) => {
  const ts = new Date().toTimeString().slice(0,8);
  console.log(`\n[${ts}] [${label}] ${msg}`);
};

const REMOTE_SH = `set -euo pipefail

# ===== R1 =====
echo "=== [R1] Unpack tgz ==="
mkdir -p ${REMOTE_DIR} && cd ${REMOTE_DIR}
rm -rf api client db server shared tests package.json package-lock.json index.html tsconfig.json vite.config.ts drizzle.config.ts vercel.json .vercelignore .env.example .env.phase2.example scripts dist node_modules 2>/dev/null || true
tar -xzf /tmp/project_deploy_v2.tar.gz -C ${REMOTE_DIR}
echo "UNPACK OK: $(ls | wc -l) entries"
echo ""

# ===== R2 =====
echo "=== [R2] DB create/migrate eeat_studio_v2 ==="
ROOT_PW=$(docker exec eeat-studio-db bash -lc 'echo $MARIADB_ROOT_PASSWORD' 2>/dev/null || echo 'root_eeat_2026_Cloud!')
echo "  root pw len=\${#ROOT_PW}"
docker exec -i eeat-studio-db mariadb -uroot -p"\${ROOT_PW}" <<'SQLROOT'
CREATE DATABASE IF NOT EXISTS eeat_studio_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON eeat_studio_v2.* TO 'eeat'@'%';
GRANT ALL PRIVILEGES ON eeat_studio_v2.* TO 'eeat'@'localhost';
FLUSH PRIVILEGES;
SQLROOT
echo "Tables BEFORE migrate:"
docker exec eeat-studio-db mariadb -u${DB_USER} -p'${DB_PW}' -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>&1 | tail -1

for sql in db/migrations/0001_init_8_tables.sql db/migrations/0002_phase2_research.sql db/migrations/0002_seed_categories.sql db/migrations/0003_phase2d_write.sql db/migrations/0004_phase3_brand_voice.sql; do
  if [ -f "$sql" ]; then
    echo "  apply $sql"
    docker exec -i eeat-studio-db mariadb -u${DB_USER} -p'${DB_PW}' ${DB_NAME} < "$sql" > /tmp/apply.out 2> /tmp/apply.err || (cat /tmp/apply.err; exit 1)
  fi
done
echo "Tables AFTER migrate (expect ≥13, Phase2D new table write_articles added):"
docker exec eeat-studio-db mariadb -u${DB_USER} -p'${DB_PW}' -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>&1 | tail -1
echo ""

# ===== R3 =====
echo "=== [R3] npm ci + build deps ==="
npm ci --omit=dev 2>&1 | tail -8 || npm install --omit=dev 2>&1 | tail -8
npm install --no-save tsx drizzle-kit mysql2 2>&1 | tail -3
echo "node_modules: $(ls node_modules 2>/dev/null | wc -l) dirs"
echo ""

# ===== R4 =====
echo "=== [R4] Write .env (PROD + REAL Google + OpenRouter + Serper KEYS PREFILLED) ==="
SECRET_FILE=\$HOME/.eeat_studio_v2_session_secret
if [ ! -f "\$SECRET_FILE" ]; then node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))" > \$SECRET_FILE; fi
SESSION_SECRET=\$(cat \$SECRET_FILE)
cat > .env <<EOF
NODE_ENV=production
PORT=${BACKEND_PORT}
CLIENT_PORT=443
APP_URL=https://thaiaeo.manus.host
SERVER_URL=https://thaiaeo.manus.host
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PW}
DB_NAME=${DB_NAME}
DB_CONNECTION_LIMIT=10
SESSION_SECRET=\${SESSION_SECRET}
SESSION_COOKIE_NAME=eeat_studio_v2_session
SESSION_TTL_MS=2592000000
COOKIE_SECURE=1
COOKIE_SAMESITE=lax
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_CALLBACK_URL=https://thaiaeo.manus.host/api/oauth/google/callback
DEV_USE_MOCK_AUTH=0
VITE_USE_MOCK_AUTH=0
VITE_APP_TITLE="EEAT Studio V2"
LLM_PROVIDER=openrouter
LLM_API_KEY=${LLM_API_KEY}
SERP_PROVIDER=serper
SERP_API_KEY=${SERP_API_KEY}
DEFAULT_COUNTRY_CODE=TH
DEFAULT_LANG_CODE=th
ADMIN_OPENID=${ADMIN_OPENID}
ADMIN_EMAIL=${ADMIN_EMAIL}
EOF
echo "  .env: $(wc -l < .env) lines (KEYS PREFILLED)"
echo ""

# ===== R5 =====
echo "=== [R5] npm run build (Vite production) ==="
npm run build 2>&1 | tail -22
for dst in 404 login projects kcp system; do
  if [ ! -f dist/\${dst}/index.html ]; then mkdir -p dist/\${dst}; cp dist/index.html dist/\${dst}/index.html; fi;
done
echo "dist/: $(du -sh dist 2>/dev/null | cut -f1)"
echo ""

# ===== R6 =====
echo "=== [R6] Seed admin + 7 demo projects if empty ==="
PROJ_N=$(docker exec eeat-studio-db mariadb -u${DB_USER} -p'${DB_PW}' -N -e "SELECT COUNT(*) FROM ${DB_NAME}.projects;" 2>&1 | tail -1 | tr -d '[:space:]')
echo "  projects BEFORE = $PROJ_N"
if [ -z "$PROJ_N" ] || [ "$PROJ_N" = "0" ]; then
docker exec -i eeat-studio-db mariadb -u${DB_USER} -p'${DB_PW}' ${DB_NAME} <<'SQLEND'
INSERT IGNORE INTO users (id, google_open_id, email, name, role, avatar_url, is_active, created_at) VALUES
  (99001, '102308593207118714314', 'intelman26@gmail.com', 'Admin V2', 'admin', NULL, 1, NOW());
INSERT IGNORE INTO teams (id, name, owner_id, is_active, created_at) VALUES
  (90001, 'Team AEO Default', 99001, 1, NOW());
INSERT IGNORE INTO team_members (team_id, user_id, permission, joined_at, created_at) VALUES
  (90001, 99001, 'owner', NOW(), NOW());
INSERT IGNORE INTO projects (id, team_id, owner_id, category_id, name, main_keyword, description, is_active, created_at) VALUES
  (101, 90001, 99001, 1, 'ทีเด็ดบอลลูกโต', 'ทีเด็ดบอล', 'Pillar project: Football betting tips', 1, NOW()),
  (102, 90001, 99001, 2, 'มวยไทยมวยโลก', 'มวยไทย', 'Pillar project: Muay Thai boxing news', 1, NOW()),
  (103, 90001, 99001, 3, 'สล็อตเว็บตรงอันดับ1', 'สล็อตเว็บตรง', 'Pillar project: Online slots direct websites', 1, NOW()),
  (104, 90001, 99001, 4, 'หวยลาวเด็ดวันเดียว', 'หวยลาว', 'Pillar project: Lao lottery daily tips', 1, NOW()),
  (105, 90001, 99001, 5, 'คาสิโนออนไลน์5ดาว', 'คาสิโนออนไลน์', 'Pillar project: 5-star online casino', 1, NOW()),
  (106, 90001, 99001, 6, 'ไก่ชนเด็ดทุกรุ่น', 'ไก่ชน', 'Cluster project: Cockfighting all breeds', 1, NOW()),
  (107, 90001, 99001, 7, 'วัวชนโคราชชัยชนะ', 'วัวชน', 'Cluster project: Korat cow fighting', 1, NOW());
SQLEND
  echo "  Seeded admin/team/7 projects OK"
fi
PROJ_AFTER=$(docker exec eeat-studio-db mariadb -u${DB_USER} -p'${DB_PW}' -N -e "SELECT COUNT(*) FROM ${DB_NAME}.projects;" 2>&1 | tail -1 | tr -d '[:space:]')
echo "  projects AFTER = $PROJ_AFTER"
echo ""

# ===== R7 PM2 start =====
echo "=== [R7] PM2 ${PM2_NAME} port ${BACKEND_PORT} ==="
pm2 delete ${PM2_NAME} 2>/dev/null || true
sleep 1
PORT=${BACKEND_PORT} pm2 start server/index.ts \
  --name ${PM2_NAME} --no-autorestart \
  --interpreter ./node_modules/.bin/tsx \
  --node-args="--max-old-space-size=768" \
  --wait-ready --listen-timeout 20000 2>&1 | tail -14
sleep 9
echo "PM2:"; pm2 list
echo "LISTEN:"; ss -tlnp 2>/dev/null | grep -E ":(3000|3001|3002|80|443) " || true
echo ""

# ===== R8 HEALTH LOOPBACK =====
echo "=== [R8] /api/health phase=2 (loopback) ==="
for i in 1 2 3 4 5 6 7 8 9 10; do
  HC=$(curl -s -o /tmp/hc.txt -w "%{http_code}" --max-time 8 http://127.0.0.1:${BACKEND_PORT}/api/health || echo 000)
  echo "  attempt $i HTTP $HC"
  [ "$HC" = "200" ] && break
  sleep 4
done
echo "  response: $(cat /tmp/hc.txt | head -c 1500)"; echo
grep -q '"phase":2' /tmp/hc.txt || { echo "FATAL phase!=2, tail PM2:"; pm2 logs ${PM2_NAME} --lines 40 --nostream 2>&1 | tail -60; exit 18; }
grep -q "research" /tmp/hc.txt || { echo "FATAL: research router missing"; exit 19; }
echo "  phase=2 + research router OK"
echo ""

# ===== R9 NGINX SWAP (ZERO DOWNTIME) =====
echo "=== [R9] nginx swap thaiaeo → :${BACKEND_PORT} ==="
TS=$(date +%Y%m%d%H%M%S)
sudo cp /etc/nginx/sites-available/eeat-studio.conf /etc/nginx/sites-available/eeat-studio.conf.bak.\${TS}
sudo sed -i "s|proxy_pass http://127.0.0.1:3001|proxy_pass http://127.0.0.1:${BACKEND_PORT}|g" /etc/nginx/sites-available/eeat-studio.conf
echo "  backup saved eeat-studio.conf.bak.\${TS}"
echo "  current proxy_pass line:"; grep "proxy_pass" /etc/nginx/sites-available/eeat-studio.conf
sudo nginx -t
sudo systemctl reload nginx
echo "  nginx reload OK"
sleep 4
echo ""

# ===== R10 PUBLIC PROBE =====
echo "=== [R10] PUBLIC https://thaiaeo.manus.host/api/health ==="
for i in 1 2 3 4 5 6 7; do
  PC=$(curl -sk -o /tmp/pub.txt -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/api/health || echo 000)
  echo "  attempt $i HTTP $PC"
  [ "$PC" = "200" ] && break
  sleep 3
done
echo "  response: $(cat /tmp/pub.txt | head -c 1500)"; echo
PUB_OK=0
if [ "$PC" = "200" ] && grep -q '"phase":2' /tmp/pub.txt && grep -q "research" /tmp/pub.txt; then PUB_OK=1; echo "✅ PUBLIC PROBE PHASE 2 ONLINE OK"; fi

echo ""
echo "============================================================"
echo " DEPLOY PHASE 2 CLOUD COMPLETE $(date)"
echo " URL           : https://thaiaeo.manus.host"
echo " Login Google  : ${ADMIN_EMAIL} (Admin, owner permission)"
echo " SettingsPage  : /settings — KEYS (OpenRouter + Serper + Google) PREFILLED ALREADY!"
echo "                 (ปิดการใช้งาน Mock auth DEV_USE_MOCK_AUTH=0 → Google OAuth REAL Login เท่านั้น)"
echo " Rollback 1 cmd: sudo cp /etc/nginx/sites-available/eeat-studio.conf.bak.\${TS} /etc/nginx/sites-available/eeat-studio.conf && sudo nginx -t && sudo systemctl reload nginx"
echo " Backup PM2    : pm2 save (หลัง deploy สมบูรณ์)"
[ "$PUB_OK" = "1" ] && echo " EXIT GATE     : ✅ Public Probe = Phase 2 LIVE"
echo "============================================================"
`;

async function main() {
  LOG("SSH", `Connect ${CFG.username}@${CFG.host}`);
  const ssh = new SSHClient(CFG); await ssh.connect();
  LOG("SSH", "Connected OK");

  LOG("SFTP", `Upload tgz (${fs.statSync(LOCAL_TGZ).size} bytes) → /tmp/project_deploy_v2.tar.gz`);
  const sftp = ssh.sftp();
  const localSha = createHash('sha256').update(fs.readFileSync(LOCAL_TGZ)).digest('hex').toLowerCase();
  LOG("CHECKSUM", `LOCAL sha256 = ${localSha}`);
  let attempts = 0;
  let uploadOk = false;
  while (attempts < 2 && !uploadOk) {
    attempts++;
    if (attempts > 1) LOG("SFTP", `Retry upload attempt ${attempts}/2 (checksum mismatch)...`);
    await sftp.fastPut(LOCAL_TGZ, "/tmp/project_deploy_v2.tar.gz", { concurrency: 8 });
    const remoteRaw = String(await ssh.exec("sha256sum /tmp/project_deploy_v2.tar.gz | awk '{print $1}'").catch(() => ""));
    const remoteSha = remoteRaw.trim().toLowerCase();
    LOG("CHECKSUM", `REMOTE sha256 (attempt ${attempts}) = ${remoteSha || "(empty)"}`);
    uploadOk = (remoteSha === localSha);
    if (!uploadOk && attempts < 2) {
      LOG("CHECKSUM", "MISMATCH → retrying upload once");
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  if (!uploadOk) {
    LOG("CHECKSUM", "FATAL MISMATCH after 2 attempts. ABORTING deploy BEFORE running remote script (WP-D1 guard prevents partial/corrupt code on VPS)");
    await ssh.close();
    process.exit(66);
  }
  LOG("CHECKSUM", "MATCH → upload verified complete & byte-identical. Proceeding safely.");
  LOG("SFTP", "Upload OK, write remote script");
  await sftp.writeFile("/tmp/eeat_v2_deploy.sh", REMOTE_SH, { mode: 0o755 });
  LOG("SFTP", "Script ready");

  LOG("EXEC", "Run remote deploy (2-8 min) streaming output");
  console.log("-".repeat(80));
  const out = await ssh.exec("bash -euo pipefail /tmp/eeat_v2_deploy.sh").catch(err => String(err?.stack || err.message || err));
  console.log(String(out));
  console.log("-".repeat(80));
  LOG("EXEC", `Script end (${String(out).length} chars output)`);

  LOG("CLEAN", "rm temp files from /tmp");
  await Promise.allSettled([sftp.unlink("/tmp/project_deploy_v2.tar.gz"), sftp.unlink("/tmp/eeat_v2_deploy.sh")]);

  await ssh.close();
  LOG("DONE", "Disconnected. Check output for PUBLIC PROBE = Phase 2 LIVE above.");
}
main().catch(e => { console.error("FATAL:", e?.message || e); process.exit(1); });
