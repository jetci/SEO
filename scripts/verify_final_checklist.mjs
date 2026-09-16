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

  // ==========================
  // GROUP A: DB VERIFICATION (correct table names from schema.ts)
  // ==========================

  // A1. List ALL 12 tables in eeat_studio_v2 schema
  await run("A1. eeat_studio_v2 schema — 12 tables names (from db/schema.ts: users teams team_members categories projects clusters keywords articles settings serp_metric_cache research_packages research_audit)",
    `sudo docker exec eeat-studio-db mariadb -uroot -p'root_eeat_2026_Cloud!' -e 'SHOW TABLES FROM eeat_studio_v2;' 2>&1`);

  // A2. Count rows per table
  await run("A2. Seed data row counts per table (expect: 1 admin user, 1 team, 1 team_member, 7 categories, 7 projects)",
    `sudo docker exec eeat-studio-db mariadb -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT "users" AS tbl, COUNT(*) AS c FROM eeat_studio_v2.users UNION ALL SELECT "teams", COUNT(*) FROM eeat_studio_v2.teams UNION ALL SELECT "team_members", COUNT(*) FROM eeat_studio_v2.team_members UNION ALL SELECT "categories", COUNT(*) FROM eeat_studio_v2.categories UNION ALL SELECT "projects", COUNT(*) FROM eeat_studio_v2.projects UNION ALL SELECT "clusters", COUNT(*) FROM eeat_studio_v2.clusters UNION ALL SELECT "keywords", COUNT(*) FROM eeat_studio_v2.keywords UNION ALL SELECT "articles", COUNT(*) FROM eeat_studio_v2.articles UNION ALL SELECT "settings", COUNT(*) FROM eeat_studio_v2.settings UNION ALL SELECT "serp_metric_cache", COUNT(*) FROM eeat_studio_v2.serp_metric_cache UNION ALL SELECT "research_packages", COUNT(*) FROM eeat_studio_v2.research_packages UNION ALL SELECT "research_audit", COUNT(*) FROM eeat_studio_v2.research_audit;' 2>&1`);

  // A3. Settings EAV structure — list ALL setting rows
  await run("A3. Settings table FULL CONTENTS (EAV key_name rows — llm_provider serp_provider country_code lang_code keys + values masked)",
    `sudo docker exec eeat-studio-db mariadb -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT id, team_id, key_name, CASE WHEN key_name LIKE "%_api_key" THEN CONCAT(LEFT(value, 8), "...") ELSE value END AS value_masked, updated_at FROM eeat_studio_v2.settings ORDER BY team_id, key_name;' 2>&1`);

  // A4. ZERO OVERWRITE GUARANTEE — old v1 schema eeat_studio table count still = 51
  await run("A4. ZERO OVERWRITE GUARANTEE — OLD eeat_studio (V1 LEGACY) table count SHOULD = 51 exactly (never modified)",
    `sudo docker exec eeat-studio-db mariadb -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT COUNT(*) AS old_eeat_studio_v1_tables_MUST_BE_51 FROM information_schema.TABLES WHERE TABLE_SCHEMA="eeat_studio"; SELECT COUNT(*) AS new_eeat_studio_v2_tables_MUST_BE_12 FROM information_schema.TABLES WHERE TABLE_SCHEMA="eeat_studio_v2";' 2>&1`);

  // A5. Admin user row (verification ADMIN_OPENID match)
  await run("A5. Admin user row in users table — google_open_id should match ADMIN_OPENID '102308593207118714314' (masked email/avatar)",
    `sudo docker exec eeat-studio-db mariadb -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT id, google_open_id, CONCAT(LEFT(email,4), "****@", SUBSTRING_INDEX(email, "@", -1)) AS email_masked, name, role, avatar_url IS NOT NULL AS avatar_set, is_active, DATE(created_at) AS created_day FROM eeat_studio_v2.users WHERE role="admin" LIMIT 5;' 2>&1`);

  // ==========================
  // GROUP B: LOGIN PAGE + GOOGLE BUTTON VISIBILITY (AFTER REBUILD — FINAL CONFIRM)
  // ==========================

  // B1. Public HTTPS /login HTML + grep button markers in HTML source (SSR / index.html shell)
  await run("B1. PUBLIC /login page — curl HTML source + markers",
    `curl -skL -o /tmp/login_final.html -w 'HTTP:%{http_code} SIZE:%{size_download}\\n' https://thaiaeo.manus.host/login ; echo '--- HTML file saved ---'`);

  // B2. Login BUNDLE JS — grep markers after client rebuild
  await run("B2. Login JS bundle AFTER rebuild — VERIFY BUTTON VISIBILITY MARKERS EXIST (text, svg, endpoint)",
    `cd /home/ubuntu/eeat-studio-v2/dist/assets && B=$(ls Login-*.js 2>/dev/null | head -1) ; echo "Bundle name: $B" ; echo "=== Google Login button text 'ดำเนินการด้วย Google': $(grep -c 'ดำเนินการด้วย Google' $B 2>/dev/null || echo 0) matches (expect 1+)" ; echo "=== Google SVG EA4335 red fill: $(grep -c '#EA4335' $B 2>/dev/null || echo 0) matches (expect 1+)" ; echo "=== Auth endpoint /api/auth/google/login CORRECT (not old wrong /api/oauth/google/start): $(grep -c '/api/auth/google/login' $B 2>/dev/null || echo 0) matches (expect 1+)" ; echo "=== OLD WRONG ENDPOINT /api/oauth/google/start SHOULD BE 0: $(grep -c '/api/oauth/google/start' $B 2>/dev/null || echo 0) OLD (MUST BE 0!)"`);

  // B3. Backend Google login endpoint FINAL check 302 redirect to accounts.google.com
  await run("B3. BACKEND Google /api/auth/google/login endpoint — redirect 302 to accounts.google.com with REAL client_id, correct redirect_uri callback",
    `curl -s -o /dev/null -w 'HTTP:%{http_code}\\n' --max-time 10 http://127.0.0.1:3002/api/auth/google/login ; LOC=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 10 http://127.0.0.1:3002/api/auth/google/login) ; echo "LOC=$LOC" ; echo -n "client_id matches known ID? " ; echo "$LOC" | grep -q '344745514354-7er3qtsc9nld4rm9bgcvi9sop4undo86.apps.googleusercontent.com' && echo "✅ MATCH" || echo "❌ NO MATCH" ; echo -n "redirect_uri=https://thaiaeo.manus.host/api/auth/google/callback ? " ; echo "$LOC" | grep -q 'redirect_uri=https%3A%2F%2Fthaiaeo.manus.host%2Fapi%2Fauth%2Fgoogle%2Fcallback' && echo "✅ MATCH" || echo "❌ NO MATCH" ; echo -n "scope=openid email profile ? " ; echo "$LOC" | grep -q 'scope=openid+email+profile' && echo "✅ MATCH" || echo "❌ NO MATCH"`);

  // ==========================
  // GROUP C: PERSISTENCE + OTHERS
  // ==========================

  // C1. PM2 persist process list (reboot survives)
  await run("C1. pm2 save process dump (persist eeat-studio-v2 latest process config survive reboot)",
    "pm2 save 2>&1 | tail -5");

  // C2. Nginx backup exists (rollback <5s guarantee) + swap target 3002
  await run("C2. Nginx ROLLBACK GUARANTEE: timestamp backup file exists + current proxy_pass is port 3002 (v2)",
    "echo '--- Rollback backup exists (datestamped)? ---' ; sudo ls -la /etc/nginx/sites-available/eeat-studio.conf.bak.* 2>&1 || echo '(warning: no backup found)' ; echo '--- Current proxy_pass target line in active eeat-studio.conf ---' ; sudo grep -n 'proxy_pass' /etc/nginx/sites-available/eeat-studio.conf ; echo '--- nginx -t syntax validate ---' ; sudo nginx -t 2>&1");

  await ssh.close();
  console.log("\n✅ DONE: FINAL VERIFICATION CHECKLIST COMPLETE — results above for user-facing acceptance report.");
}
main().catch(e => { console.error(e); process.exit(1); });
