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

  // 1. CAT full .env file on VPS line-by-line — see if VITE_ lines actually exist (may have CRLF line endings greps missed, or sed problem)
  await run("1 FULL .env contents (with line numbers — MASK VALUES manually)",
    `cd /home/ubuntu/eeat-studio-v2 && awk '{printf "[%03d] %s\\n", NR, $0}' .env | sed -E 's/(=).*$/\\1****MASKED****/'`);

  // 2. Replace mysql command with mariadb command (correct path inside eeat-studio-db container)
  await run("2 DB settings table using mariadb binary instead of mysql",
    `sudo docker exec eeat-studio-db mariadb -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT id, team_id, llm_provider, serp_provider, country_code, lang_code, llm_api_key IS NOT NULL AS llm_key_set, serp_api_key IS NOT NULL AS serp_key_set, updated_at FROM eeat_studio_v2.settings;' 2>&1`);

  // 3. Count all tables + seed in eeat_studio_v2
  await run("3 DB seed counts using mariadb binary",
    `sudo docker exec eeat-studio-db mariadb -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT "users_count" AS metric, COUNT(*) AS value FROM eeat_studio_v2.users UNION ALL SELECT "teams_count", COUNT(*) FROM eeat_studio_v2.teams UNION ALL SELECT "projects_count", COUNT(*) FROM eeat_studio_v2.projects UNION ALL SELECT "categories_count", COUNT(*) FROM eeat_studio_v2.categories UNION ALL SELECT "clusters_count", COUNT(*) FROM eeat_studio_v2.keyword_clusters UNION ALL SELECT "keywords_count", COUNT(*) FROM eeat_studio_v2.keywords UNION ALL SELECT "settings_count", COUNT(*) FROM eeat_studio_v2.settings UNION ALL SELECT "old_v1_schema_tables", COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA="eeat_studio" UNION ALL SELECT "new_v2_schema_tables", COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA="eeat_studio_v2";' 2>&1`);

  // 4. Login bundle: search actual VITE_USE_MOCK_AUTH resolved literal value (build inline replacement) — because Vite inlines so grep for the conditional
  await run("4 Login bundle googleLoginEnabled CONDITION inline literal (VITE_ inline replaced)",
    `cd /home/ubuntu/eeat-studio-v2/dist/assets && echo 'Searching for String("0")==="0" pattern (VITE inlined 0):' && grep -c 'String("0")==="0"' Login-*.js && echo 'Searching for String("1")==="0" pattern (would disable):' && grep -c 'String("1")==="0"' Login-*.js || echo 'Pattern slightly different — search entire login bundle:' && grep -oE 'String\\([^)]+\\)===\\\"0\\\"' Login-*.js | head -5`);

  // 5. Bonus: list all nginx listens + proxy_pass (verify swap and services)
  await run("5 Nginx nginx -t syntax + proxy_pass values",
    `sudo nginx -t 2>&1; echo '--- proxy_pass lines in eeat-studio.conf:'; sudo grep -n 'proxy_pass' /etc/nginx/sites-available/eeat-studio.conf`);

  await ssh.close();
  console.log("\n✅ DONE: Follow-up verification complete.");
}
main().catch(e => { console.error(e); process.exit(1); });
