import SSHClient from "ssh2-promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJ_ROOT = path.resolve(__dirname, "..");

const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};
const ROOT_PW = "root_eeat_2026_Cloud!";
const EEAT_PW = "eeat_secret_2026_Cloud!";
const DB_USER = "eeat";
const DB_NAME = "eeat_studio_v2";

async function main() {
  const ssh = new SSHClient(CFG);
  await ssh.connect();
  console.log("✅ SSH CONNECTED");

  const run = async (label, cmd) => {
    console.log("\n" + "=".repeat(70));
    console.log("  " + label);
    console.log("=".repeat(70));
    const out = (await ssh.exec(cmd).catch(e => String(e?.stack || e)));
    console.log(String(out).slice(0, 6000));
    return out;
  };

  // === UPLOAD SQL files ===
  const sftp = ssh.sftp();
  const sqlP2 = fs.readFileSync(path.join(PROJ_ROOT, "db", "migrations", "0002_phase2_research.sql"), "utf8");
  const sqlSeed = fs.readFileSync(path.join(PROJ_ROOT, "db", "migrations", "0002_seed_categories.sql"), "utf8");
  await sftp.writeFile("/tmp/p2.sql", sqlP2, { mode: 0o644 });
  await sftp.writeFile("/tmp/seed.sql", sqlSeed, { mode: 0o644 });
  console.log("✅ SQL uploaded to /tmp/p2.sql + /tmp/seed.sql");

  const EEAT = `-u${DB_USER} -p'${EEAT_PW}' ${DB_NAME}`;
  const ROOT_DB = `-uroot -p'${ROOT_PW}'`;
  const EXEC_EEAT = `docker exec -i eeat-studio-db mariadb ${EEAT}`;
  const EXEC_ROOT = `docker exec eeat-studio-db mariadb ${ROOT_DB}`;

  await run("PRE1 BEFORE: eeat_studio_v2 tables count (expected =12)",
    `echo BEFORE_COUNT; ${EXEC_ROOT} -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>&1 | tail -1`);

  await run("PRE2 BEFORE: tables list + categories count",
    `echo TABLES_BEFORE:; ${EXEC_EEAT} -e "SHOW TABLES;" 2>&1 | tail -20; echo CATEGORIES_BEFORE_COUNT:; ${EXEC_EEAT} -N -e "SELECT COUNT(*) FROM categories;" 2>&1 | tail -1`);

  await run("STEP3 Apply 0002_phase2_research.sql (idempotent CREATE IF NOT EXISTS 4 tables)",
    `${EXEC_EEAT} < /tmp/p2.sql 2>&1 | tail -15; echo TABLES_AFTER_CREATE:; ${EXEC_EEAT} -e "SHOW TABLES;" 2>&1 | grep -iE 'settings|serp|research|categories'`);

  await run("STEP4 Verify settings COLUMNS + UNIQUE team_id+key_name",
    `echo settings COLUMNS:; ${EXEC_EEAT} -e "SHOW COLUMNS FROM settings;" 2>&1 | tail -10; echo settings INDEX:; ${EXEC_EEAT} -e "SHOW INDEX FROM settings;" 2>&1 | tail -6; echo key_name ENUM values:; ${EXEC_ROOT} -N -e "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='settings' AND COLUMN_NAME='key_name';" 2>&1 | tail -2`);

  await run("STEP5 Apply 0002_seed_categories.sql 7 rows idempotent TRUNCATE+INSERT",
    `${EXEC_EEAT} < /tmp/seed.sql 2>&1 | tail -5; echo CATEGORIES_SEEDED_7 ROWS:; ${EXEC_EEAT} -e "SELECT id,name,slug,is_ymyl FROM categories ORDER BY id;" 2>&1 | tail -10`);

  await run("STEP6 FINAL COUNTS: eeat_studio_v2 new count (expected ≥16), old eeat_studio v1 count MUST=51 ZERO-OVERWRITE",
    `echo FINAL_eeat_studio_v2_TABLE_COUNT=; ${EXEC_ROOT} -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>&1 | tail -2; echo ALL_v2_TABLES:; ${EXEC_EEAT} -e "SHOW TABLES;" 2>&1 | tail -20; echo ZERO_OVERWRITE_OLD_eeat_studio_V1_TABLE_COUNT_EXPECTED_51=; ${EXEC_ROOT} -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eeat_studio';" 2>&1 | tail -2`);

  await run("STEP7 PM2 dual process: eeat-studio+v2 BOTH online ZERO-OVERWRITE",
    "pm2 jlist 2>/dev/null | grep -oE '\"name\":\"eeat-studio(-v2)?\"|\"status\":\"[a-z]+\"' | head -14");

  await run("STEP8 Health phase=2, router list includes research BEFORE deploy new code (should be OK)",
    `for i in 1 2 3 4 5; do H=\$(curl -s -o /tmp/hc.txt -w "%{http_code}" --max-time 7 http://127.0.0.1:3002/api/health || echo 000); echo attempt \$i HTTP \$H; [ "\$H" = "200" ] && break; sleep 3; done; cat /tmp/hc.txt | head -c 300`);

  await ssh.close();
  console.log("\n✅ W1 Migration 4 tables (settings/serp_metric_cache/research_packages/research_audit) + W2 Seed 7 categories DONE");
}
main().catch(e => { console.error(e); process.exit(1); });
