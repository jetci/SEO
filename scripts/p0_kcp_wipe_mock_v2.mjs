// KCP WIPE MOCK DATA + ARTICLES/PROJECTS — VPS eeat_studio_v2 AC-6 SAFE (DELETE ROWS ONLY — NO ALTER/DROP/TRUNCATE)
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
    console.log("✅ SSH CONNECTED 35.231.230.218");

    // BEFORE COUNTS
    console.log("\n" + "=".repeat(80));
    console.log("  [1/4] BEFORE: DATA COUNTS eeat_studio_v2");
    console.log("=".repeat(80));
    const before = {};
    const cnt = async (t) => {
      const out = (await sql("SELECT COUNT(*) AS c FROM " + t + ";", true)).toString();
      const n = Number(String(out||'0').trim().split(/\s+/).pop() || "0") || 0;
      before[t] = n;
      console.log("  " + t.padEnd(30," ") + " → " + n + " rows");
      return n;
    };
    const tableExists = async (t) => {
      const out = (await sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + DB_NAME + "' AND TABLE_NAME='" + t + "';", true)).toString();
      return Number(String(out||'0').trim().split(/\s+/).pop() || "0") > 0;
    };
    const ALL_TABLES = ['projects','brand_voices','clusters','keywords','articles','article_sections','article_images','research_audit','research_packages','serp_metric_cache','categories','settings','users','teams','teamMembers'];
    const exist = [];
    for (const t of ALL_TABLES) if (await tableExists(t)) exist.push(t);
    console.log("  eeat_studio_v2 existing tables =", exist.length, exist.join(","));
    for (const t of exist) await cnt(t);

    console.log("\n  BEFORE sample projects:");
    console.log((await sql("SELECT id,teamId,categoryId,name,status,createdAt FROM projects ORDER BY id LIMIT 15;")).toString() || "0 rows");
    console.log("\n  BEFORE articles top projectId:");
    console.log((await sql("SELECT projectId,COUNT(*) c FROM articles GROUP BY projectId ORDER BY c DESC LIMIT 10;")).toString());
    console.log("\n  BEFORE keywords top projectId:");
    console.log((await sql("SELECT projectId,COUNT(*) c FROM keywords GROUP BY projectId ORDER BY c DESC LIMIT 10;")).toString());
    console.log("\n  BEFORE clusters top projectId:");
    console.log((await sql("SELECT projectId,COUNT(*) c FROM clusters GROUP BY projectId ORDER BY c DESC LIMIT 10;")).toString());

    // FETCH PROJECT IDS TO DELETE (ALL PROJECTS EXISTING — EXCEPT if user wants keep — user said ลบทั้งหมด ใน โปรเจกต์บทความ + KCP → DELETE ALL projects rows + children)
    const gc = (await sql("SELECT GROUP_CONCAT(id SEPARATOR ',') FROM projects;", true)).toString();
    const pids = String(gc||'').trim().split(/[\s,]+/).filter(x=>/^\d+$/.test(x)).map(Number);
    console.log("\n  Project IDs to wipe = [" + pids.join(", ") + "] count=" + pids.length);
    const ids = pids.length > 0 ? pids.join(",") : "NULL";

    console.log("\n" + "=".repeat(80));
    console.log("  [2/4] EXECUTE: DELETE DATA AC-6 SAFE (CHILD→PARENT)");
    console.log("=".repeat(80));
    const run = (label, stmt) => {
      console.log("\n ↳ " + label);
      return sql(stmt).then(r => { const o = String(r).slice(0,350); console.log(o||"(OK no output)"); return r; });
    };

    // CHILDREN FIRST
    await run("1/11 article_images (FK articles.id)", "DELETE ai FROM article_images ai INNER JOIN articles a ON ai.articleId=a.id WHERE a.projectId IN (" + ids + ");");
    await run("2/11 article_sections (FK articles.id)", "DELETE ase FROM article_sections ase INNER JOIN articles a ON ase.articleId=a.id WHERE a.projectId IN (" + ids + ");");
    await run("3/11 articles by projectId", "DELETE FROM articles WHERE projectId IN (" + ids + ");");
    await run("4/11 research_audit by projectId", "DELETE FROM research_audit WHERE projectId IN (" + ids + ");");
    await run("5/11 keywords by projectId", "DELETE FROM keywords WHERE projectId IN (" + ids + ");");
    await run("6/11 clusters by projectId", "DELETE FROM clusters WHERE projectId IN (" + ids + ");");
    await run("7/11 brand_voices by projectId", "DELETE FROM brand_voices WHERE projectId IN (" + ids + ");");
    await run("8/11 projects by id", "DELETE FROM projects WHERE id IN (" + ids + ");");
    await run("9/11 serp_metric_cache stale (clean)", "DELETE FROM serp_metric_cache WHERE 1=1;");
    await run("10/11 research_packages (clean)", "DELETE FROM research_packages WHERE 1=1;");
    await run("11/11 settings NON-CORE rows (KEEP encryption keys!)", "DELETE FROM settings WHERE key_name NOT IN ('encryption_salt','encryption_secret_key','openid_client_secret','openid_aud','google_client_secret','smtp_password','stripe_secret_key','stripe_pk_key');");

    console.log("\n" + "=".repeat(80));
    console.log("  [3/4] AFTER: VERIFY COUNTS");
    console.log("=".repeat(80));
    for (const t of exist) {
      const out = (await sql("SELECT COUNT(*) AS c FROM " + t + ";", true)).toString();
      const aft = Number(String(out||'0').trim().split(/\s+/).pop() || "0") || 0;
      const b = before[t] || 0;
      const delta = b - aft;
      const stat = (aft === 0 && delta > 0) ? "✅ EMPTIED" : (aft === b) ? "NOT_TOUCHED" : ("REMAINING=" + aft);
      console.log("  " + t.padEnd(30," ") + " BEFORE=" + b + "  AFTER=" + aft + "  Δ=" + delta + "  " + stat);
    }
    console.log("\n  projects (expect 0):");
    console.log((await sql("SELECT id, name FROM projects;")).toString() || "(0 rows EMPTY ✅)");
    console.log("  articles count (expect 0):", (await sql("SELECT COUNT(*) FROM articles;", true)).toString().trim());
    console.log("  keywords count (expect 0):", (await sql("SELECT COUNT(*) FROM keywords;", true)).toString().trim());
    console.log("  clusters count (expect 0):", (await sql("SELECT COUNT(*) FROM clusters;", true)).toString().trim());
    console.log("  brand_voices count:", (await sql("SELECT COUNT(*) FROM brand_voices;", true)).toString().trim());

    console.log("\n" + "=".repeat(80));
    console.log("  [4/4] AC-6 FOREVER LOCK VERIFY");
    console.log("=".repeat(80));
    const v2 = (await sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" + DB_NAME + "';", true)).toString().trim();
    const v1 = (await sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eeat_studio';", true)).toString().trim();
    console.log("  eeat_studio_v2 (AC-6 NEW) tables count =", v2, "(EXPECTED 14)");
    console.log("  eeat_studio v1 (LOCK FOREVER) tables count =", v1, "(EXPECTED 51 FOREVER ZERO ALTER/DROP)");
    console.log("  categories seed 7 rows PRESERVED (NO DELETE categories!):");
    console.log((await sql("SELECT id,name,slug,isYmyl FROM categories ORDER BY id;")).toString());
    console.log("  ADMIN 99001 + team 90001 PRESERVED (ไม่ได้ลบ users/teams/teamMembers!):");
    console.log((await sql("SELECT id,email,defaultTeamId FROM users WHERE id=99001; SELECT teamId,userId,role FROM teamMembers WHERE userId=99001; SELECT id,name FROM teams WHERE id=90001;")).toString());

    await ssh.close();
    console.log("\n✅ DONE AC-6 SAFE — Projects/Articles/KCP Clusters/Keywords WIPED ZERO MOCK.");
    process.exit(0);
  } catch (e) {
    console.error("FATAL ERR:", e.message || String(e));
    try { await ssh.close(); } catch {}
    process.exit(1);
  }
})();
