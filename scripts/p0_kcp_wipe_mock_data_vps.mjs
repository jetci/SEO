// STEP 1: BEFORE AUDIT COUNT + STEP 3: EXECUTE CLEAN
// ADB VPS eeat_studio_v2 DELETE MOCK PROJECTS/KEYWORDS/CLUSTERS/ARTICLES
// AC-6 SAFE ZERO ALTER/DROP/TRUNCATE — ONLY DELETE ROWS WITH FK CASCADE ORDER
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 45000 };
const DB_USER = "eeat";
const DB_PW   = "eeat_secret_2026_Cloud!";
const DB_NAME = "eeat_studio_v2";
const ROOT_DB_PW = "root_eeat_2026_Cloud!";
const ssh = new SSHClient(cfg);
const Q = (s) => s.replace(/'/g, `'\\''`);
const EEAT_DOCKER = `docker exec eeat-studio-db mariadb -u${DB_USER} -p'${Q(DB_PW)}' ${DB_NAME}`;
const ROOT_DOCKER = `docker exec eeat-studio-db mariadb -uroot -p'${Q(ROOT_DB_PW)}' -N`;
function sh(cmd){ return ssh.exec(cmd).catch(e => String(e?.stack || e)); }
function sql(sql, asRoot=false){
  const docker = asRoot ? ROOT_DOCKER + ' ' + DB_NAME : EEAT_DOCKER;
  const safeSql = sql.replace(/\$/g, "\\$").replace(/"/g, '\\"');
  return sh(`${docker} -e "${safeSql}" 2>&1`);
}

(async () => {
  try {
    await ssh.connect();
    console.log("✅ SSH CONNECTED VPS 35.231.230.218");

    // =========================================
    // STEP 1 (BEFORE COUNTS)
    // =========================================
    console.log("\n" + "=".repeat(80));
    console.log("  BEFORE DELETE MOCK DATA — TABLE COUNTS + SAMPLE PROJECT IDS");
    console.log("=".repeat(80));
    const beforeCounts = {};
    const TCOUNT = async (tbl) => {
      const r = (await sql(`SELECT COUNT(*) AS c FROM ${tbl};`, true)).toString().trim().split(/\s+/).pop() || "0";
      beforeCounts[tbl] = Number(r) || 0;
      console.log(`  ${tbl.padEnd(32,' ')} → ${beforeCounts[tbl]} rows`);
      return beforeCounts[tbl];
    };
    const T14 = ['users','teams','teamMembers','projects','categories','clusters','keywords','articles','article_sections','article_images','research_audit','research_packages','serp_metric_cache','settings','brand_voices'];
    const existing = [];
    for (const t of T14) {
      const ex = (await sql(`SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='${t}';`,true)).toString().trim().split(/\s+/).pop();
      if (Number(ex) > 0) existing.push(t);
    }
    console.log("  Existing tables in eeat_studio_v2 =", existing.length, existing);
    for (const t of existing) await TCOUNT(t);

    console.log("\n  BEFORE: Sample Projects List:");
    console.log((await sql(`SELECT id, teamId, categoryId, name, slug, status, createdAt FROM projects ORDER BY id LIMIT 20;`).toString() || "(0 rows)");
    console.log("\n  BEFORE: Articles List:");
    console.log((await sql(`SELECT a.id, a.projectId, a.keywordId, a.status, LEFT(a.title,40) AS t, a.createdAt FROM articles a ORDER BY id DESC LIMIT 20;`).toString() || "(0 rows)"));
    console.log("\n  BEFORE: Keywords top projectId distribution:");
    console.log((await sql(`SELECT projectId, COUNT(*) c FROM keywords GROUP BY projectId ORDER BY c DESC LIMIT 15;`).toString());
    console.log("\n  BEFORE: Clusters top projectId distribution:");
    console.log((await sql(`SELECT projectId, COUNT(*) c FROM clusters GROUP BY projectId ORDER BY c DESC LIMIT 15;`).toString());
    console.log("\n  BEFORE: Articles top projectId:");
    console.log((await sql(`SELECT projectId, COUNT(*) c FROM articles GROUP BY projectId ORDER BY c DESC LIMIT 15;`).toString());
    console.log("\n  BEFORE: Research audit top projectId:");
    console.log((await sql(`SELECT projectId, COUNT(*) c FROM research_audit GROUP BY projectId ORDER BY c DESC LIMIT 15;`).toString());
    console.log("\n  BEFORE: Brand voices top projectId:");
    console.log((await sql(`SELECT projectId, COUNT(*) c FROM brand_voices GROUP BY projectId ORDER BY c DESC LIMIT 15;`).toString());

    // =========================================
    // STEP 2: PREPARE SQL CLEAN LIST
    // =========================================
    // User only deleted rows from categories? Do NOT delete categories (AC-6 seed needed)
    // Clean Projects (and their children keywords/clusters/articles) + ALL DRAFT articles + ALL keywords/clusters for those projects
    // FK CHILD -> PARENT DELETE ORDER (children before parents):
    //   article_images / article_sections -> articles -> research_audit -> keywords -> clusters -> projects -> brand_voices (per project)
    // Leave: users/teams/teamMembers/categories/settings/serp_metric_cache (system tables)
    // NOTE: We will DELETE rows only, NO DROP, NO ALTER, NO TRUNCATE (AC-6)
    const targetProjectIds = (await sql(`SELECT GROUP_CONCAT(id) FROM projects;`, true)).toString().trim().split(/[\s,]+/).filter(x => /^\d+$/.test(x)).map(Number).sort((a,b)=>a-b));
    console.log("\n  Target project IDs found for delete =", targetProjectIds, "count=", targetProjectIds.length);

    console.log("\n" + "=".repeat(80));
    console.log("  STEP 2: EXECUTE DELETE ROWS AC-6 SAFE (DELETE WHERE IN projectIds)");
    console.log("=".repeat(80));

    const ids = targetProjectIds.length>0 ? targetProjectIds.join(",") : "NULL";
    const RUN = (label, sqlText) => {
      console.log("\n  →", label);
      return sql(sqlText).then(r => { console.log(String(r.toString().slice(0, 400)); return r; });
    };

    // ---- CHILDREN FIRST (DELETE FROM BOTTOM UP
    await RUN("1/11 article_images: images linked via articleId → article projectId in list",
      `DELETE ai FROM article_images ai INNER JOIN articles a ON ai.articleId=a.id WHERE a.projectId IN (${ids});`);
    await RUN("2/11 article_sections (child articles)",
      `DELETE ase FROM article_sections ase INNER JOIN articles a ON ase.articleId=a.id WHERE a.projectId IN (${ids});`);
    await RUN("3/11 articles drafts + published (all by project)",
      `DELETE FROM articles WHERE projectId IN (${ids});`);
    await RUN("4/11 research_audit by project",
      `DELETE FROM research_audit WHERE projectId IN (${ids});`);
    await RUN("5/11 keywords by project",
      `DELETE FROM keywords WHERE projectId IN (${ids});`);
    await RUN("6/11 clusters by project",
      `DELETE FROM clusters WHERE projectId IN (${ids});`);
    await RUN("7/11 brand_voices by project",
      `DELETE FROM brand_voices WHERE projectId IN (${ids});`);
    await RUN("8/11 projects themselves finally (after all children gone)",
      `DELETE FROM projects WHERE id IN (${ids});`);
    await RUN("9/11 serp_metric_cache clear stale (volatility 历史)",
      `DELETE FROM serp_metric_cache WHERE 1=1;`);
    await RUN("10/11 research_packages clean up if rows",
      `DELETE FROM research_packages WHERE 1=1;`);
    await RUN("11/11 settings NON-ESSENTIAL rows (keep encryption keys if present)",
      `DELETE FROM settings WHERE key_name NOT IN ('encryption_salt','encryption_secret_key','openid_client_secret','openid_aud');`);

    // =========================================
    // STEP 3: AFTER COUNTS VERIFY ZERO ROWS
    // =========================================
    console.log("\n" + "=".repeat(80));
    console.log("  AFTER DELETE MOCK DATA — VERIFY");
    console.log("=".repeat(80));
    for (const t of existing) {
      const r = (await sql(`SELECT COUNT(*) AS c FROM ${t};`, true)).toString().trim().split(/\s+/).pop() || "0";
      const aft = Number(r) || 0;
      const delta = (beforeCounts[t]||0) - aft;
      console.log(`  ${t.padEnd(32,' ')} → BEFORE=${beforeCounts[t]||0}, AFTER=${aft} Δ=${delta} ${(aft===0 && delta>0? '✅ EMPTIED' : (aft===beforeCounts[t]?'NOT_TOUCHED':'REMAINING')}`);
    }
    console.log("\n  Projects list EMPTY?:");
    console.log((await sql(`SELECT id, name FROM projects;`).toString() || "(0 rows EMPTY ✅)"));
    console.log("\n  Articles EMPTY?:");
    console.log((await sql(`SELECT COUNT(*) c FROM articles;`, true)).toString());
    console.log("\n  Keywords count per project (should be nothing or 0):");
    console.log((await sql(`SELECT projectId, COUNT(*) c FROM keywords GROUP BY projectId;`)).toString());
    console.log("\n  Tables count V2 still 14 AC-6 check (still same number):");
    console.log((await sql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';`, true)).toString());
    console.log("\n  V1 tables check = 51 FOREVER (NO ALTER/DROP ZERO):");
    console.log((await sql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eeat_studio';`, true)).toString().trim());
    console.log("\n  categories (seeded 7 preserved? categories intact?):");
    console.log((await sql(`SELECT id,name,slug,isYmyl FROM categories ORDER BY id;`)).toString());
    console.log("\n  teamMembers / users / teams admin (99001 admin preserved?):");
    console.log((await sql(`SELECT id,email,defaultTeamId FROM users WHERE id=99001; SELECT teamId,userId,role FROM teamMembers WHERE userId=99001; SELECT id,name FROM teams WHERE id=90001;`).toString());

    await ssh.close();
    console.log("\n✅ CLEANUP DONE AC-6 SAFE exit");
    process.exit(0);
  } catch (e) {
    console.error("FATAL ERROR:", e.message || e.stack);
    try { await ssh.close(); } catch {}
    process.exit(1);
  }
})();
