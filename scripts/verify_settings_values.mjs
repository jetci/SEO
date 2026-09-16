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

  // 1. Check PROD .env default settings values (mask sensitive keys, show provider/country/language only as non-masked)
  await run("1 PROD .env Settings Keys (masked): provider/country/language = SHOW; api_keys = MASK",
    `cd /home/ubuntu/eeat-studio-v2 && echo '--- Non sensitive config lines (providers, country, language):' && grep -E '^(LLM_PROVIDER|SERP_PROVIDER|DEFAULT_COUNTRY|DEFAULT_LANGUAGE)=' .env && echo '--- Sensitive keys PRESENCE check (masked values):' && grep -E '^(LLM_API_KEY|SERP_API_KEY|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET)=' .env | sed 's/=.*/=***NON_EMPTY_MASKED***/' && echo '--- DEV_USE_MOCK_AUTH (server):' && grep -E '^DEV_USE_MOCK_AUTH=' .env && echo '--- VITE_USE_MOCK_AUTH (client build time):' && grep -E '^VITE_USE_MOCK_AUTH=' .env`);

  // 2. Database eeat_studio_v2.settings table rows (if seeded during deploy R6)
  await run("2 DB settings table: eeat_studio_v2.settings contents (via MariaDB docker exec)",
    `sudo docker exec eeat-studio-db mysql -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT id, team_id, llm_provider, serp_provider, country_code, lang_code, llm_api_key IS NOT NULL AS llm_key_present, serp_api_key IS NOT NULL AS serp_key_present, created_at FROM eeat_studio_v2.settings;' 2>&1`);

  // 3. Also check teams/projects/users seed rows exist
  await run("3 DB validation: users (admin count), teams, projects counts",
    `sudo docker exec eeat-studio-db mysql -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT "users" AS tbl, COUNT(*) AS n FROM eeat_studio_v2.users UNION ALL SELECT "teams", COUNT(*) FROM eeat_studio_v2.teams UNION ALL SELECT "projects", COUNT(*) FROM eeat_studio_v2.projects UNION ALL SELECT "categories", COUNT(*) FROM eeat_studio_v2.categories UNION ALL SELECT "settings", COUNT(*) FROM eeat_studio_v2.settings;' 2>&1`);

  // 4. Old v1 DB must NOT be touched — eeat_studio (old v1) table count unchanged still = 51 (zero overwrite guarantee)
  await run("4 ZERO OVERWRITE GUARANTEE: OLD v1 eeat_studio schema table count MUST STILL BE 51 (not modified)",
    `sudo docker exec eeat-studio-db mysql -uroot -p'root_eeat_2026_Cloud!' -e 'SELECT COUNT(*) AS old_v1_schema_tables_count_should_be_51 FROM information_schema.TABLES WHERE TABLE_SCHEMA="eeat_studio";' 2>&1`);

  // 5. Dual PM2 processes online (eeat-studio v1 port 3001 + eeat-studio-v2 v2 port 3002) both running zero downtime
  await run("5 PM2 dual process status (zero downtime guarantee)",
    "pm2 jlist 2>/dev/null | grep -E '\"name\"|\"pm_id\"|\"status\"|\"port\"' | head -30 || pm2 list 2>&1");

  await ssh.close();
  console.log("\n✅ DONE: Settings + DB + Zero Overwrite verification complete.");
}
main().catch(e => { console.error(e); process.exit(1); });
