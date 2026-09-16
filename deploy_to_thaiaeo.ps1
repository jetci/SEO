# One-Click Deploy to VPS thaiaeo.manus.host (35.231.230.218)
# Run on local Windows: powershell -ExecutionPolicy Bypass -File deploy_to_thaiaeo.ps1
param(
  [switch]$SkipUpload = $false,
  [switch]$SkipNpmInstall = $false,
  [switch]$SkipSwap = $false,
  [switch]$Rollback = $false
)

$ErrorActionPreference = "Stop"

# ===== Credentials (user-provided, matches confirmed access) =====
$VM_USER   = "ubuntu"
$VM_HOST   = "35.231.230.218"
$VM_PASS   = "BcXdZ8vKDrX9i54opwXkgt"
$LOCAL_ROOT = "d:\AEO\SEO V2"
$REMOTE_ROOT = "/home/ubuntu/eeat-studio-v2"
$REMOTE_DB_HOST  = "127.0.0.1"
$REMOTE_DB_PORT  = "3307"      # mapped to eeat-studio-db (mariadb 11.4, running 8 days)
$REMOTE_DB_USER  = "root"
$REMOTE_DB_PW    = "root"
$REMOTE_DB_NAME  = "eeat_studio_v2"
$BACKEND_PORT    = "3002"      # new, not conflict with :3000 (sports) / :3001 (old eeat-studio v1)
$PM2_NAME        = "eeat-studio-v2"

# ===== Banner =====
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " EEAT Studio V2 Phase 2 — thaiaeo.manus.host" -ForegroundColor Cyan
Write-Host " Deploy target: 35.231.230.218 :$BACKEND_PORT" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ===== Rollback path (if user passes -Rollback) =====
if ($Rollback) {
  Write-Host ">>> Rolling back nginx proxy_pass :3002 -> :3001 (old eeat-studio v1)" -ForegroundColor Yellow
  $rbCmds = @(
    'sudo sed -i "s|proxy_pass http://127.0.0.1:3002|proxy_pass http://127.0.0.1:3001|g" /etc/nginx/sites-available/eeat-studio.conf',
    'sudo nginx -t && sudo systemctl reload nginx',
    'echo "Rollback OK — thaiaeo.manus.host now points to :3001 old app"'
  ) -join "`n"
  Set-Content -Path "$LOCAL_ROOT\deploy_tmp\rb.sh" -Value $rbCmds -Encoding UTF8
  node "$LOCAL_ROOT\scripts\run_remote_via_ssh2.mjs" -f deploy_tmp/rb.sh
  Remove-Item "$LOCAL_ROOT\deploy_tmp\rb.sh" -ErrorAction SilentlyContinue
  exit 0
}

# ===== Local prep: typecheck + build first (fail fast before upload) =====
Write-Host "[L0] Local sanity: npm run typecheck" -ForegroundColor Magenta
Set-Location $LOCAL_ROOT
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Local typecheck FAILED, abort deploy before upload" }

Write-Host "[L1] Local sanity: npm run build (static dist)" -ForegroundColor Magenta
npm run build
if ($LASTEXITCODE -ne 0) { throw "Local build FAILED, abort deploy before upload" }

# ===== Ensure deploy temp dir + SSH helper exists =====
$sshHelper = "$LOCAL_ROOT\scripts\run_remote_via_ssh2.mjs"
if (!(Test-Path $sshHelper)) {
  # Create helper if missing (SSH via ssh2-promise, password auth — matches probes above)
  New-Item -ItemType Directory -Force -Path "$LOCAL_ROOT\scripts" | Out-Null
  Set-Content -Encoding UTF8 -Path $sshHelper -Value @'
import SSHClient from "ssh2-promise";
import { parseArgs } from "node:util";
import fs from "node:fs";
const { values } = parseArgs({ options: { f: { type: "string" } } });
const scriptFile = values.f;
const cfg = {
  host: "35.231.230.218", username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", port: 22,
  readyTimeout: 20000, keepaliveInterval: 5000,
};
const main = async () => {
  const ssh = new SSHClient(cfg);
  await ssh.connect().catch(e => { console.error("SSH CONNECT FAIL:", e.message); process.exit(2); });
  if (scriptFile) {
    const sftp = ssh.sftp();
    const basename = scriptFile.replace(/\\/g, "/").split("/").pop();
    await sftp.fastPut(scriptFile, `/tmp/${basename}`).catch(e => { console.error("SFTP PUT FAIL", e.message); process.exit(3); });
    const out = await ssh.exec(`set -e; chmod +x /tmp/${basename}; /tmp/${basename}`).catch(e => String(e?.message ?? e));
    process.stdout.write(String(out).slice(0, 32000));
    await sftp.unlink(`/tmp/${basename}`).catch(()=>{});
  } else {
    const stdinBuf = fs.readFileSync(0, "utf-8");
    const sh = "/tmp/remote_" + Date.now() + ".sh";
    const sftp = ssh.sftp(); await sftp.writeFile(sh, stdinBuf, { mode: 0o755 });
    const out = await ssh.exec(`set -e; ${sh}`).catch(e => String(e?.message ?? e));
    process.stdout.write(String(out).slice(0, 32000));
    await sftp.unlink(sh).catch(()=>{});
  }
  await ssh.close();
};
main().catch(e => { console.error(e); process.exit(1); });
'@
}

New-Item -ItemType Directory -Force -Path "$LOCAL_ROOT\deploy_tmp" | Out-Null

# ===== Build remote shell script =====
$remoteSh = @"
#!/bin/bash
set -euo pipefail
# ============================================================
#  REMOTE DEPLOY — /home/ubuntu/eeat-studio-v2  (thaiaeo VM)
# ============================================================
echo ""
echo "[R0] Host info"
hostname; uname -a; uptime
echo ""

# -------- R1. Ensure directory + npm/pnpm/pm2 exists --------
echo "[R1] Ensure toolchain (already present on VM: node22 npm10 pm2 docker)"
node -v; npm -v; pm2 -v; docker --version
mkdir -p ${REMOTE_ROOT}
cd ${REMOTE_ROOT}
echo "  -> PWD = \$(pwd)"
echo ""

# -------- R2. Database: create eeat_studio_v2 on eeat-studio-db (port 3307) --------
echo "[R2] Create DB schema on eeat-studio-db (127.0.0.1:3307, mariadb 11.4)"
docker exec eeat-studio-db mariadb -u${REMOTE_DB_USER} -p${REMOTE_DB_PW} -e "CREATE DATABASE IF NOT EXISTS ${REMOTE_DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "  -> DB ${REMOTE_DB_NAME} ready"
docker exec eeat-studio-db mariadb -u${REMOTE_DB_USER} -p${REMOTE_DB_PW} -N -e "SHOW DATABASES LIKE '${REMOTE_DB_NAME}';"
echo ""

# -------- R3. Install (npm ci) if not skipped --------
echo "[R3] Dependencies + Node install"
if [ "\${SKIP_NPM_INSTALL:-0}" != "1" ]; then
  [ -f package-lock.json ] && echo "  -> package-lock exists, running npm ci"
  [ ! -f package-lock.json ] && echo "  -> No lockfile (using npm install)"
  # ci only when lockfile exists; fallback install
  npm ci --omit=dev 2> >(tee /tmp/npm.err >&2) || npm install --omit=dev 2> >(tee /tmp/npm.err >&2)
  # restore devDeps for drizzle-kit/tsx used only at build/migrate
  npm install --no-save tsx drizzle-kit mysql2 2>&1 | tail -5
  echo "  -> npm install OK"
else
  echo "  -> SKIP npm ci (per flag)"
fi
echo ""

# -------- R4. Write .env for VM (PROD) --------
echo "[R4] Write production .env (PORT=${BACKEND_PORT}, DB 127.0.0.1:${REMOTE_DB_PORT}, HTTPS URL thaiaeo.manus.host)"
# Generate session secret once, save to /home/ubuntu/.eeat_studio_v2_session_secret (survive redeploy)
SECRET_FILE=\$HOME/.eeat_studio_v2_session_secret
if [ ! -f "\$SECRET_FILE" ]; then
  node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))" > \$SECRET_FILE
  echo "  -> generated new SESSION_SECRET -> \$SECRET_FILE"
fi
SESSION_SECRET=\$(cat \$SECRET_FILE)
cat > .env <<ENVEOF
NODE_ENV=production
PORT=${BACKEND_PORT}
CLIENT_PORT=443
APP_URL=https://thaiaeo.manus.host
SERVER_URL=https://thaiaeo.manus.host
DB_HOST=${REMOTE_DB_HOST}
DB_PORT=${REMOTE_DB_PORT}
DB_USER=${REMOTE_DB_USER}
DB_PASSWORD=${REMOTE_DB_PW}
DB_NAME=${REMOTE_DB_NAME}
DB_CONNECTION_LIMIT=10
SESSION_SECRET=\${SESSION_SECRET}
SESSION_COOKIE_NAME=eeat_studio_v2_session
SESSION_TTL_MS=86400000
COOKIE_SECURE=1
COOKIE_SAMESITE=lax
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-__FILL_IN__}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-__FILL_IN__}
GOOGLE_CALLBACK_URL=https://thaiaeo.manus.host/api/auth/google/callback
DEV_USE_MOCK_AUTH=0
LLM_PROVIDER=openrouter
LLM_API_KEY=${LLM_API_KEY:-__FILL_IN__}
SERP_PROVIDER=serper
SERP_API_KEY=${SERP_API_KEY:-__FILL_IN__}
DEFAULT_COUNTRY_CODE=TH
DEFAULT_LANG_CODE=th
ADMIN_OPENID=102308593207118714314
ADMIN_EMAIL=intelman26@gmail.com
ENVEOF
echo "  -> .env written (\$(wc -l .env | awk '{print \$1}') lines)"
echo ""

# -------- R5. Build static (Vite production dist/) --------
echo "[R5] Build client dist via vite"
npm run build 2>&1 | tail -30
echo "  -> dist size:"
du -sh dist 2>/dev/null || true
ls dist/index.html 2>/dev/null || { echo "FAIL: no dist/index.html after build"; exit 10; }
echo ""

# -------- R6. Apply migrations (0001_init + 0002_phase2) + seed categories/projects --------
echo "[R6] Apply SQL migrations + seed"
# Via mariadb cli exec inside the same docker container (guaranteed utf8mb4)
for sql in db/migrations/0001_init_8_tables.sql db/migrations/0002_phase2_research.sql db/migrations/0002_seed_categories.sql; do
  if [ -f "\$sql" ]; then
    echo "  -> apply \$sql"
    docker exec -i eeat-studio-db mariadb -u${REMOTE_DB_USER} -p${REMOTE_DB_PW} ${REMOTE_DB_NAME} < \$sql
  fi
done

echo "  -> tables count after migrate:"
docker exec eeat-studio-db mariadb -u${REMOTE_DB_USER} -p${REMOTE_DB_PW} -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${REMOTE_DB_NAME}';"
echo ""

# -------- R7. Seed 7 demo projects (ids 101-107 admin) if projects empty --------
echo "[R7] Seed 7 demo projects if projects = 0"
PROJ_COUNT=\$(docker exec eeat-studio-db mariadb -u${REMOTE_DB_USER} -p${REMOTE_DB_PW} -N -e "SELECT COUNT(*) FROM ${REMOTE_DB_NAME}.projects;")
echo "  -> projects count BEFORE = \$PROJ_COUNT"
if [ "\$PROJ_COUNT" = "0" ]; then
  # Call node seed via tsx (drizzle helpers + ADMIN_OPENID known). For simplicity, inline SQL demo rows.
  # Also assume team + team_member + user first exist — create ADMIN user if needed.
  docker exec -i eeat-studio-db mariadb -u${REMOTE_DB_USER} -p${REMOTE_DB_PW} ${REMOTE_DB_NAME} <<'SQLSEED'
INSERT IGNORE INTO users (id, openid, email, name, role, avatar, createdAt) VALUES
  (99001, '102308593207118714314', 'intelman26@gmail.com', 'Admin V2', 'admin', NULL, NOW());
INSERT IGNORE INTO teams (id, name, slug, ownerId, plan, createdAt) VALUES
  (90001, 'Team AEO Default', 'team-aeo-default', 99001, 'free', NOW());
INSERT IGNORE INTO team_members (teamId, userId, permission, joinedAt) VALUES
  (90001, 99001, 'owner', NOW());
-- 7 demo projects (id 101-107) ownerTeamId = 90001
INSERT IGNORE INTO projects (id, categoryId, ownerTeamId, name, slug, domain, lang, country, tier, createdAt) VALUES
  (101, 1, 90001, 'ทีเด็ดบอลลูกโต', 'thided-ball-lookto', 'thaiaeo.manus.host/football', 'th', 'TH', 'pillar', NOW()),
  (102, 2, 90001, 'มวยไทยมวยโลก', 'muay-thai-world', 'thaiaeo.manus.host/boxing', 'th', 'TH', 'pillar', NOW()),
  (103, 3, 90001, 'สล็อตเว็บตรงอันดับ1', 'slot-direct-web-1', 'thaiaeo.manus.host/slot', 'th', 'TH', 'pillar', NOW()),
  (104, 4, 90001, 'หวยลาวเด็ดวันเดียว', 'huay-lao-super-day', 'thaiaeo.manus.host/huay', 'th', 'TH', 'pillar', NOW()),
  (105, 5, 90001, 'คาสิโนออนไลน์5ดาว', 'casino-5star-online', 'thaiaeo.manus.host/casino', 'th', 'TH', 'pillar', NOW()),
  (106, 6, 90001, 'ไก่ชนเด็ดทุกรุ่น', 'golf-chicken-fight', 'thaiaeo.manus.host/chicken', 'th', 'TH', 'cluster', NOW()),
  (107, 7, 90001, 'วัวชนโคราชชัยชนะ', 'cow-fight-korat-champ', 'thaiaeo.manus.host/cow', 'th', 'TH', 'cluster', NOW());
SQLSEED
  echo "  -> Seeded users=1 teams=1 team_members=1 projects=7"
fi
PROJ_COUNT_AFTER=\$(docker exec eeat-studio-db mariadb -u${REMOTE_DB_USER} -p${REMOTE_DB_PW} -N -e "SELECT COUNT(*) FROM ${REMOTE_DB_NAME}.projects;")
echo "  -> projects count AFTER  = \$PROJ_COUNT_AFTER"
echo ""

# -------- R8. Start PM2 process eeat-studio-v2 port=3002 --------
echo "[R8] Start/Restart PM2 ${PM2_NAME} (PORT=${BACKEND_PORT})"
# Make sure dist/spa fallback copies (postbuild in package.json) already done via npm run build above — if not, do minimal copy
for dst in 404 login projects kcp system; do
  if [ ! -f dist/\${dst}/index.html ]; then mkdir -p dist/\${dst}; cp dist/index.html dist/\${dst}/index.html; fi;
done

# PM2 start with PORT override
pm2 delete ${PM2_NAME} 2>/dev/null || true
sleep 1
PORT=${BACKEND_PORT} pm2 start server/index.ts \
  --name ${PM2_NAME} \
  --no-autorestart \
  --interpreter ./node_modules/.bin/tsx \
  --node-args="--max-old-space-size=768" \
  --wait-ready --listen-timeout 15000 -- \
  2>&1 | tail -10

sleep 6
echo "  -> PM2 status:"
pm2 list
echo "  -> netstat LISTEN :${BACKEND_PORT}:"
ss -tlnp 2>/dev/null | grep -E ":${BACKEND_PORT}[[:space:]]" || netstat -tlnp 2>/dev/null | grep ":${BACKEND_PORT} "
echo ""

# -------- R9. Local health probe via curl on VM (loopback) --------
echo "[R9] Health check https://127.0.0.1:${BACKEND_PORT}/api/health (verify Phase2)"
sleep 3
for i in 1 2 3 4 5; do
  CODE=\$(curl -s -o /tmp/health_body.txt -w "%{http_code}" --max-time 8 http://127.0.0.1:${BACKEND_PORT}/api/health || echo 000)
  echo "  -> attempt \$i status=\$CODE"
  if [ "\$CODE" = "200" ]; then break; fi
  sleep 4
done
echo "  -> /api/health response body (first 2000 chars):"
cat /tmp/health_body.txt | head -c 2000; echo ""

# Validate phase=2 + routers includes 'research'
if ! grep -q '"phase":"2"' /tmp/health_body.txt; then
  echo "FATAL: /api/health does NOT contain phase=2. Open PM2 logs: pm2 logs ${PM2_NAME}"
  exit 20
fi
if ! grep -q "research" /tmp/health_body.txt; then
  echo "FATAL: /api/health routers does NOT include 'research' string. Deploy broken."
  exit 21
fi
echo "  -> Health OK: phase=2 + research router present"
echo ""

# -------- R10. Swap nginx thaiaeo proxy_pass 3001 -> ${BACKEND_PORT} (unless skip) --------
if [ "\${SKIP_SWAP:-0}" != "1" ]; then
  echo "[R10] ATOMIC SWAP nginx thaiaeo.manus.host :3001 -> :${BACKEND_PORT}"
  sudo cp /etc/nginx/sites-available/eeat-studio.conf /etc/nginx/sites-available/eeat-studio.conf.bak.\$(date +%Y%m%d%H%M%S)
  sudo sed -i "s|proxy_pass http://127.0.0.1:3001|proxy_pass http://127.0.0.1:${BACKEND_PORT}|g" /etc/nginx/sites-available/eeat-studio.conf
  # Safety: check sed applied correctly
  grep -n "proxy_pass" /etc/nginx/sites-available/eeat-studio.conf | head -3
  sudo nginx -t
  sudo systemctl reload nginx
  sleep 3
  echo "  -> nginx reload OK"
  echo "  -> Now https://thaiaeo.manus.host/api/health should return phase=2"
  for i in 1 2 3; do
    PCODE=\$(curl -sk -o /tmp/public_health.txt -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/api/health || echo 000)
    echo "  -> Public https probe \$i status=\$PCODE"
    [ "\$PCODE" = "200" ] && break
    sleep 3
  done
  if [ "\$PCODE" = "200" ]; then
    echo "  -> Public /api/health first 600 chars:"
    cat /tmp/public_health.txt | head -c 600; echo ""
  else
    echo "  WARN: public probe not 200 within retries — might be DNS propagation or certbot rate limit. See /etc/nginx/sites-enabled status manually"
  fi
else
  echo "[R10] SKIP nginx swap (per flag). App only on http://127.0.0.1:${BACKEND_PORT}. Run Swap manually later:"
  echo "  sudo sed -i 's|proxy_pass http://127.0.0.1:3001|proxy_pass http://127.0.0.1:${BACKEND_PORT}|g' /etc/nginx/sites-available/eeat-studio.conf"
  echo "  sudo nginx -t && sudo systemctl reload nginx"
fi
echo ""

# -------- FINAL SUMMARY --------
echo "====================================================="
echo " DEPLOY TO thaiaeo.manus.host COMPLETED OK"
echo " Backend port   = :${BACKEND_PORT}   (PM2 ${PM2_NAME})"
echo " DB             = mariadb eeat-studio-db :3307 / ${REMOTE_DB_NAME}"
echo " Public URL     = https://thaiaeo.manus.host"
echo " Admin Login    = Google openid 102308593207118714314 (intelman26@gmail.com)"
echo " Rollback if need: local .\deploy_to_thaiaeo.ps1 -Rollback"
echo "====================================================="
echo ""
exit 0
"@

# Substitute env vars into the here-string (PowerShell expand)
$remoteSh = $ExecutionContext.InvokeCommand.ExpandString($remoteSh)

# Write remote sh file to deploy_tmp
$tmpSh = "$LOCAL_ROOT\deploy_tmp\remote_deploy_eeat_v2.sh"
Set-Content -Encoding UTF8NoBOM -Path $tmpSh -Value $remoteSh

# ===== Upload code via tar.gz + sftp (fast way) unless skip =====
if (-not $SkipUpload) {
  Write-Host "[U1] Pack project to deploy_tmp/project.tar.gz (skip node_modules dist .git deploy_tmp .vercel-tmp *.log)" -ForegroundColor Magenta
  $tarList = @(
    'api', 'client', 'db', 'server', 'shared', 'tests',
    'index.html', 'package.json', 'package-lock.json',
    'tsconfig.json', 'vercel.json', 'vite.config.ts', 'drizzle.config.ts',
    '.vercelignore', '.env.example', '.env.phase2.example'
  )
  $tarArgs = @('-czf', 'deploy_tmp\project.tar.gz', '--exclude=node_modules', '--exclude=dist', '--exclude=.git', '--exclude=deploy_tmp', '--exclude=.vercel-tmp', '--exclude=*.log') + $tarList
  # Windows native tar exists (Windows 10+)
  tar @tarArgs 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0 -or !(Test-Path "$LOCAL_ROOT\deploy_tmp\project.tar.gz")) {
    throw "Pack tar failed — ensure tar.exe available (Windows 10+ default)"
  }
  $tarSize = (Get-Item "$LOCAL_ROOT\deploy_tmp\project.tar.gz").Length / 1MB
  Write-Host "  -> packed ($([math]::Round($tarSize,2)) MB)" -ForegroundColor Green

  Write-Host "[U2] SFTP upload project.tar.gz + remote_deploy script to VM /tmp" -ForegroundColor Magenta
  # Create a small Node one-shot upload + untar + exec via ssh2-promise helper
  $uploaderJs = @"
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", port: 22, readyTimeout: 20000 };
const main = async () => {
  const ssh = new SSHClient(cfg);
  await ssh.connect();
  const sftp = ssh.sftp();
  console.log("SFTP: put project.tar.gz -> /tmp/project.tar.gz");
  await sftp.fastPut("deploy_tmp/project.tar.gz", "/tmp/project.tar.gz", { concurrency: 6 });
  console.log("SFTP: put remote_deploy script -> /tmp/remote_deploy_eeat_v2.sh");
  await sftp.fastPut("deploy_tmp/remote_deploy_eeat_v2.sh", "/tmp/remote_deploy_eeat_v2.sh", { mode: 0o755 });
  console.log("Unpack tar into $REMOTE_ROOT ...");
  const out1 = await ssh.exec("mkdir -p $REMOTE_ROOT && cd $REMOTE_ROOT && rm -rf api client db server shared tests package.json package-lock.json index.html tsconfig.json vite.config.ts drizzle.config.ts vercel.json .vercelignore .env.example .env.phase2.example node_modules dist .vercel-tmp 2>/dev/null; tar -xzf /tmp/project.tar.gz -C $REMOTE_ROOT && echo UNPACK_OK lines=$(ls | wc -l)").catch(e => String(e));
  process.stdout.write(String(out1).slice(0,12000));
  console.log("\nRun remote deploy script ...");
  const out2 = await ssh.exec("SKIP_NPM_INSTALL=" + ($SkipNpmInstall ? "1" : "0") + " SKIP_SWAP=" + ($SkipSwap ? "1" : "0") + " /tmp/remote_deploy_eeat_v2.sh").catch(e => String(e));
  process.stdout.write(String(out2).slice(0, 80000));
  console.log("\nCleanup /tmp files");
  await Promise.allSettled([sftp.unlink("/tmp/project.tar.gz"), sftp.unlink("/tmp/remote_deploy_eeat_v2.sh")]);
  await ssh.close();
};
main().catch(e => { console.error("UPLOAD+DEPLOY FAIL", e.message ?? e); process.exit(1); });
"@
  $uploaderJs = $ExecutionContext.InvokeCommand.ExpandString($uploaderJs)
  Set-Content -Encoding UTF8NoBOM -Path "$LOCAL_ROOT\deploy_tmp\do_upload_and_run.mjs" -Value $uploaderJs
  Write-Host "[U3] RUN — Upload tar → Unpack → Remote deploy script A→Z (takes 2-6 min)" -ForegroundColor Yellow
  Write-Host ""
  node "$LOCAL_ROOT\deploy_tmp\do_upload_and_run.mjs"
  if ($LASTEXITCODE -ne 0) { throw "Remote deploy exited non-zero" }
} else {
  Write-Host "[U1-SKIP] Skip upload. Run only remote script" -ForegroundColor Yellow
  node $sshHelper -f deploy_tmp/remote_deploy_eeat_v2.sh
  if ($LASTEXITCODE -ne 0) { throw "Remote script exited non-zero" }
}

Write-Host ""
Write-Host "=========== DEPLOY COMPLETED ===========" -ForegroundColor Green
Write-Host "Open: https://thaiaeo.manus.host" -ForegroundColor Green
Write-Host "Login with Google intelman26@gmail.com (Admin)" -ForegroundColor Green
Write-Host "Rollback: .\deploy_to_thaiaeo.ps1 -Rollback" -ForegroundColor DarkGray
