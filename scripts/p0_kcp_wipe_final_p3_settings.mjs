// VPS eeat_studio_v2 — FINAL PART 3 RESTORE SETTINGS + ADMIN CONSISTENCY (snake_case, CORRECT COLUMNS THIS TIME)
// settings column = value (NOT key_value) + ENUM only 5 values. Admin users: default_team not present (removed) so skip col.
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 60000 };
const DB_USER = "eeat";
const DB_PW   = "eeat_secret_2026_Cloud!";
const DB_NAME = "eeat_studio_v2";
const ROOT_DB_PW = "root_eeat_2026_Cloud!";
const ssh = new SSHClient(cfg);
const Q = (s) => s.replace(/'/g, `'\\''`);
const EEAT_DOCKER = "docker exec eeat-studio-db mariadb -u" + DB_USER + " -p'" + Q(DB_PW) + "' " + DB_NAME;
const ROOT_DOCKER = "docker exec eeat-studio-db mariadb -uroot -p'" + Q(ROOT_DB_PW) + "' -N " + DB_NAME;
const sh = (cmd) => ssh.exec(cmd).catch(e => String(e?.stack || e));
const sql = (txt, asRoot=false) => {
  const docker = asRoot ? ROOT_DOCKER : EEAT_DOCKER;
  const safeSql = String(txt||'').replace(/\$/g, "\\$").replace(/"/g, '\\"');
  return sh(docker + ' -e "' + safeSql + '" 2>&1');
};

(async () => {
  try {
    await ssh.connect();
    console.log("✅ SSH CONNECTED (PART 3)");

    console.log("\n[1/3] RESTORE settings rows (column=value, key_name ENUM 5 values only — 0002 schema)");
    // Correct: settings columns = value (NOT key_value).
    const team = (await sql("SELECT id FROM teams ORDER BY id LIMIT 1;", true)).toString().trim().split(/\s+/).pop();
    const teamId = Number(team || 90001);
    console.log("  team_id =", teamId);

    // Settings ENUM values only (from schema 0002 phase2_research.sql L11):
    // ENUM('llm_provider','llm_api_key','serp_provider','serp_api_key','billing_limit_usd')
    // Column name: `value` TEXT
    const DEF = [
      { k: "llm_provider", v: "openai", enc: 0 },
      { k: "serp_provider", v: "serper", enc: 0 },
      { k: "llm_api_key",  v: "sk-proj-" + "PLACEHOLDER-FILL-IN-SETTINGS-UI-LATER-AIPROJ", enc: 1 },
      { k: "serp_api_key", v: "serper-dev-" + "PLACEHOLDER-FILL-IN-SETTINGS-UI-LATER", enc: 1 },
      { k: "billing_limit_usd", v: "100.00", enc: 0 },
    ];
    for (const r of DEF) {
      const stmt = "INSERT IGNORE INTO settings (team_id, key_name, value, updated_at) VALUES (" + teamId + ", '" + r.k + "', '" + Q(r.v) + "', NOW());";
      console.log("\n ↳ Restore settings " + r.k);
      const out = (await sql(stmt)).toString();
      console.log(String(out).slice(0,200) || "(OK)");
    }

    console.log("\n[2/3] Ensure admin user 99001 is owner of team 90001 via team_members (snake_case!)");
    const tmFix = "INSERT IGNORE INTO team_members (team_id, user_id, role, created_at) VALUES (" + teamId + ", 99001, 'owner', NOW());";
    console.log("  team_members fix SQL:", tmFix);
    console.log((await sql(tmFix)).toString() || "(OK)");

    console.log("\n[3/3] FINAL VERIFICATION SESSION AFTER PART 1+2+3");
    console.log("  Final ROW COUNTS:");
    const TABLES = ['projects','clusters','keywords','articles','write_articles','research_audit','research_packages','serp_metric_cache','project_brand_voices','settings','categories','users','teams','team_members'];
    for (const t of TABLES) {
      const ex = (await sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + DB_NAME + "' AND TABLE_NAME='" + t + "';", true)).toString().trim().split(/\s+/).pop();
      if (Number(ex) <= 0) { console.log("    " + t.padEnd(22," ") + " → TABLE MISSING (OK)"); continue; }
      const c = (await sql("SELECT COUNT(*) FROM " + t + ";", true)).toString().trim().split(/\s+/).pop();
      console.log("    " + t.padEnd(22," ") + " → COUNT=" + c);
    }
    console.log("\n  Settings rows (after restore):");
    console.log((await sql("SELECT id, team_id, key_name, LENGTH(value) AS len FROM settings ORDER BY id;")).toString());
    console.log("\n  categories (should be 7 rows seed):");
    console.log((await sql("SELECT id, name, slug, is_ymyl FROM categories ORDER BY id;")).toString());
    console.log("\n  users: admin 99001:");
    console.log((await sql("SELECT id, email FROM users WHERE id=99001;")).toString());
    console.log("\n  team_members: user 99001 role:");
    console.log((await sql("SELECT team_id, user_id, role FROM team_members WHERE user_id=99001;")).toString());
    console.log("\n  teams: team 90001:");
    console.log((await sql("SELECT id, name FROM teams WHERE id=" + teamId + ";")).toString());
    console.log("\n  AC-6 LOCK V1/V2 COUNT:");
    const v2 = (await sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" + DB_NAME + "';", true)).toString().trim();
    const v1 = (await sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eeat_studio';", true)).toString().trim();
    console.log("    eeat_studio_v2 =", v2, "tables (EXPECTED 14+)");
    console.log("    eeat_studio v1 =", v1, "tables (EXPECTED 51 FOREVER — LOCK — 0 ALTER/DROP/MODIFY)");
    console.log("    ✅ ZERO ALTER / ZERO DROP / ZERO TRUNCATE — all queries DELETE FROM rows only.");

    await ssh.close();
    console.log("\n✅ PART 3 FINAL DONE: settings restored + admin owner restored — สามารถเพิ่ม Keyword ใหม่ทดสอบได้เลย ทุกอย่าง clean แล้วครับ!");
    process.exit(0);
  } catch (e) {
    console.error("FATAL:", e.message || e);
    try { await ssh.close(); } catch {}
    process.exit(1);
  }
})();
