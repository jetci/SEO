import mysql from "mysql2/promise";
import "dotenv/config";

const DB_CFG = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "eeat",
  password: process.env.DB_PASSWORD || "eeat_secret",
  database: process.env.DB_NAME || "eeat_studio_v2",
};

const TEST_RESULTS = [];
function assert(name, pass, actual, expected, note) {
  TEST_RESULTS.push({ name, ok: !!pass, actual, expected, note });
  const icon = pass ? "✅" : "❌";
  const line = `${icon} [${String(TEST_RESULTS.length).padStart(2, "0")}] ${name}`;
  console.log(line);
  if (!pass) console.log(`   Actual:   ${JSON.stringify(actual)}\n   Expected: ${JSON.stringify(expected)}${note ? `\n   Note: ${note}` : ""}`);
}

async function main() {
  console.log("\n============================================================");
  console.log(" EEAT Studio V2 · Phase 1 · DB SQL KPI Test Suite");
  console.log(` Target: ${DB_CFG.host}:${DB_CFG.port}/${DB_CFG.database} user=${DB_CFG.user}`);
  console.log("============================================================\n");

  const conn = await mysql.createConnection(DB_CFG);

  // ========== T-0: DB Connection ==========
  const [rowVer] = await conn.query("SELECT VERSION() AS v");
  const mysqlVer = (rowVer[0] || {}).v;
  assert("DB Connection + MySQL 8.x", String(mysqlVer || "").startsWith("8."), mysqlVer, "8.0.x");

  // ========== T-1: Users + Admin owner ==========
  const [users] = await conn.query("SELECT id, email, google_open_id, role FROM users WHERE role='admin'");
  const admin = (users || []).find(u => u.email === "intelman26@gmail.com");
  assert("Users: Admin intelman26@gmail.com exists", !!admin, ">= 1 row", { email: "intelman26@gmail.com", role: "admin" });
  assert("Users: Admin openId matches constant (102308593207118714314)", admin && admin.google_open_id === "102308593207118714314", admin ? admin.google_open_id : null, "102308593207118714314", "Login Dev Signin Hardmap");

  // ========== T-2: Categories 7 rows (SA EXACT YMYL=3) ==========
  const [cats] = await conn.query("SELECT id, name, slug, is_ymyl, is_active FROM categories ORDER BY id ASC");
  const catsArr = cats || [];
  assert("Categories: row count = 7 (ฟุตบอล/มวย/สล็อต/หวย/คาสิโน/ไก่ชน/วัวชน)", catsArr.length === 7, catsArr.length, 7);
  const EXPECTED_CATS = [
    { id: 1, name: "ฟุตบอล", slugs: ["football"], ymyl: 0 },
    { id: 2, name: "มวย", slugs: ["boxing", "muaythai"], ymyl: 0 },
    { id: 3, name: "สล็อต", slugs: ["slot", "slots"], ymyl: 1 },
    { id: 4, name: "หวย", slugs: ["lottery", "lotto"], ymyl: 1 },
    { id: 5, name: "คาสิโน", slugs: ["casino"], ymyl: 1 },
    { id: 6, name: "ไก่ชน", slugs: ["chicken_fight", "cockfighting"], ymyl: 0 },
    { id: 7, name: "วัวชน", slugs: ["bull_fight", "bullfighting"], ymyl: 0 },
  ];
  catsArr.forEach((c, idx) => {
    const e = EXPECTED_CATS[idx];
    if (e) {
      const slugOk = e.slugs.includes(String(c.slug || "").toLowerCase());
      assert(`Category #${c.id}: ${e.name} slug=${c.slug} (accept: [${e.slugs.join("|")}]) ymyl=${e.ymyl}`,
        c.name === e.name && slugOk && Number(c.is_ymyl) === e.ymyl,
        { name: c.name, slug: c.slug, ymyl: c.is_ymyl }, e);
    }
  });
  const ymylCount = catsArr.filter(c => Number(c.is_ymyl) === 1).length;
  assert("Categories: YMYL count = 3 (สล็อต หวย คาสิโน)", ymylCount === 3, ymylCount, 3, "YMYL ตาม SA Order YMYL=3 ไม่ใช่ 5");

  // ========== T-3: Projects 7 demo (IDs 101-107, owner=1 team=1, 1 ต่อ 1 cat) ==========
  const [projs] = await conn.query(`
    SELECT id, name, owner_id, team_id, category_id, is_active, created_at
    FROM projects WHERE id BETWEEN 101 AND 107 ORDER BY id ASC
  `);
  const projsArr = projs || [];
  assert("Projects: Demo IDs 101-107 = 7 แถว (KPI 7/7/0)", projsArr.length === 7, projsArr.length, 7);
  const uniqueOwners = new Set(projsArr.map(p => Number(p.owner_id)));
  const uniqueTeams = new Set(projsArr.map(p => Number(p.team_id)));
  assert("Projects: owner_id=1 ทุกโปรเจกต์ (Admin Intelman)", [...uniqueOwners].join(",") === "1", [...uniqueOwners], [1]);
  assert("Projects: team_id=1 ทุกโปรเจกต์ (ทีมเริ่มต้น)", [...uniqueTeams].join(",") === "1", [...uniqueTeams], [1]);
  const uniqueCats = new Set(projsArr.map(p => Number(p.category_id)));
  assert("Projects: 7 unique category_ids (1-7 ไม่ซ้ำ)", uniqueCats.size === 7 && [...uniqueCats].every(c => c >= 1 && c <= 7), [...uniqueCats].sort(), "[1,2,3,4,5,6,7]");
  const total = projsArr.length;
  const active = projsArr.filter(p => Number(p.is_active) !== 0).length;
  const archived = total - active;
  assert("Projects KPI: Total=7 Active=7 Archived=0 (KPI 7/7/0)", total === 7 && active === 7 && archived === 0,
    { total, active, archived }, { total: 7, active: 7, archived: 0 }, "Projects KPI Dashboard+Projects page must match");

  // ========== T-4: created_at ปีไม่ใช่ 2513 ==========
  projsArr.forEach(p => {
    const year = new Date(p.created_at).getFullYear();
    assert(`Project #${p.id}: created_at year != 2513 (ประวัติเวลาไทยผิด)`, year !== 2513 && year > 2020 && year < 2100, year, "2024-2029");
  });

  // ========== T-5: RBAC team_members id=1 user=1 team=1 owner ==========
  const [tm] = await conn.query("SELECT user_id, team_id, permission FROM team_members WHERE id=1");
  const tmRow = (tm || [])[0];
  assert("RBAC: team_members id=1 user=1 team=1 permission=owner",
    tmRow && Number(tmRow.user_id) === 1 && Number(tmRow.team_id) === 1 && tmRow.permission === "owner",
    tmRow, { user_id: 1, team_id: 1, permission: "owner" });

  await conn.end();

  console.log("\n============================================================");
  const pass = TEST_RESULTS.filter(r => r.ok).length;
  const fail = TEST_RESULTS.filter(r => !r.ok).length;
  console.log(` RESULT: ${pass} PASS / ${TEST_RESULTS.length} TOTAL / ${fail} FAIL`);
  console.log(` EXIT_CODE = ${fail === 0 ? 0 : 1}`);
  console.log("============================================================\n");
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(err => { console.error("FATAL:", err && err.message ? err.message : err); process.exit(1); });
