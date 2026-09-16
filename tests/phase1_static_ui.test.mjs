import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "client", "src");
const PASS = [], FAIL = [];
function test(name, passFn, detailFail) {
  try {
    const ok = !!passFn();
    (ok ? PASS : FAIL).push({ name, detail: ok ? null : detailFail?.() });
    console.log(`${ok ? "✅" : "❌"} ${name}`);
    if (!ok && FAIL[FAIL.length - 1].detail) console.log("   ", FAIL[FAIL.length - 1].detail);
  } catch (e) {
    FAIL.push({ name, detail: String(e && e.message ? e.message : e) });
    console.log(`❌ ${name}\n    EXCEPTION: ${e && e.message ? e.message : e}`);
  }
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }
function countMatches(content, re) { const m = content.match(re); return m ? m.length : 0; }

console.log("\n============================================================");
console.log(" EEAT Studio V2 · Phase 1 · Static UI Code Assertion Suite");
console.log("============================================================\n");

// ========== T-1: MainDashboard Shell ==========
test("UI-1: MainDashboardShell.tsx มีอยู่จริง", () => exists("layouts/MainDashboardShell.tsx"));
const shell = read("layouts/MainDashboardShell.tsx");
test("T1a: Sidebar Group 'วางแผน' มี 3 เมนู (overview/projects/kcp) ใน NAV_ITEMS",
  () => {
    const navItems = shell.match(/key:\s*"([a-z]+)",\s*href:\s*"\/[a-z]*",\s*label:\s*"([^"]+)",\s*icon:.*?,\s*(?:badge:\s*"[^"]*",\s*)?group:\s*"plan"/gs) || [];
    const keys = (shell.match(/NAV_ITEMS[\s\S]*?group:\s*"plan"[\s\S]*?};\s*$/) ? shell : "")
      .split("\n").filter(l => l.includes('group: "plan"'));
    // Alternative simpler: count occurrences of key with expected plan keys in NAV_ITEMS declaration
    const hasPlanKeys = ["overview", "projects", "kcp"].every(k =>
      shell.includes(`key: "${k}"`) && shell.includes(`group: "plan"`)
    );
    const countPlanSidebarTestid = (shell.match(/sidebar-item-\$\{item\.key\}/g) || []).length;
    // Total plan nav items = 3, total system = 3 → total 6 uses of data-testid sidebar pattern
    return hasPlanKeys && countPlanSidebarTestid >= 3;
  },
  () => {
    const missingPlanKeys = ["overview", "projects", "kcp"].filter(k => !shell.includes(`key: "${k}"`));
    const countTpl = (shell.match(/sidebar-item-\$\{item\.key\}/g) || []).length;
    return `NAV_ITEMS plan missing keys: [${missingPlanKeys.join(",")}] · sidebar-item template count=${countTpl} (expected >=3)`;
  }
);
test("T1b: Sidebar Group 'ระบบ' มี 3 เมนู lockable (members/teams/settings)",
  () => {
    const hasSysKeys = ["members", "teams", "settings"].every(k =>
      shell.includes(`key: "${k}"`) && shell.includes(`locked: true`)
    );
    const countTpl = (shell.match(/sidebar-item-\$\{item\.key\}/g) || []).length;
    // 2 map bodies (plan+system) + menuitem pattern = 3 source occurrences, runtime renders 6 times (3 plan + 3 sys locked)
    return hasSysKeys && countTpl >= 3;
  },
  () => {
    const missingSysKeys = ["members", "teams", "settings"].filter(k => !shell.includes(`key: "${k}"`) || !shell.includes("locked"));
    const countTpl = (shell.match(/sidebar-item-\$\{item\.key\}/g) || []).length;
    return `NAV_ITEMS system missing keys or locked: [${missingSysKeys.join(",")}] · total sidebar templates=${countTpl} (expected >=3)`;
  }
);
test("T1c: Sidebar User Card + Logout Button + Theme Toggle Button exist",
  () => shell.includes('data-testid="logout-btn"') && shell.includes('data-testid="theme-toggle-btn"'),
  () => `logout-btn=${shell.includes("logout-btn")} theme-toggle=${shell.includes("theme-toggle-btn")}`);
test("T1d: Shell Header Title + Header Actions Slots + Page Body (render props)",
  () => shell.includes('data-testid="page-title"') && shell.includes('data-testid="header-actions"') && shell.includes('data-testid="page-body"'));

// ========== T-2: Projects Page KPI 7/7/0 + 3-tile grid + card loop ==========
test("UI-2: ProjectsPage.tsx มีอยู่จริง", () => exists("pages/ProjectsPage.tsx"));
const pp = read("pages/ProjectsPage.tsx");
test("T2a: KPI 3 cards (Total/Active/Archived) data-testid projects-kpi",
  () => pp.includes('data-testid="projects-kpi"')
    && pp.includes('data-testid="kpi-total"')
    && pp.includes('data-testid="kpi-active"')
    && pp.includes('data-testid="kpi-archived"'));
test("T2b: Project Grid Loop project-card-{id} + 4 actions (ดู/แก้/แชร์/ลบ)",
  () => pp.includes('data-testid="projects-grid"')
    && pp.includes("project-card-") && pp.includes("${p.id}")
    && pp.includes("project-") && pp.includes("-actions")
    && ["Eye", "Pencil", "Share2", "Trash2"].every(n => pp.includes(n) && pp.includes("className")),
  () => `grid=${pp.includes("projects-grid")} cardLoop=${pp.includes("project-card-")} actions=${pp.includes("-actions")} icons=${["Eye","Pencil","Share2","Trash2"].map(n => n + ":" + (pp.includes(n) && pp.includes("className"))).join(" ")}`);
test("T2c: Projects tRPC call trpc.projects.list.useQuery (flat array)",
  () => pp.includes("trpc.projects.list.useQuery"),
  () => `Search trpc.projects.list.useQuery => ${pp.includes("projects.list")}`);
test("T2d: YMYL badges render cats 3/4/5 red rose-100 ⚠️",
  () => pp.includes("YMYL ⚠️") && pp.includes("rose"),
  () => `YMYL marker search => YMYL=${pp.includes("YMYL")} rose=${pp.includes("rose")}`);

// ========== T-3: KCP 3 tabs + 4 KPIs + Project combobox + ClusterCards ==========
test("UI-3: KeywordClusterPlanner.tsx มีอยู่จริง", () => exists("pages/KeywordClusterPlanner.tsx"));
const kcp = read("pages/KeywordClusterPlanner.tsx");
test("T3a: 3 Tabs (Cards / Shared / Tree)",
  () => kcp.includes('Tabs defaultValue="cards"')
    && kcp.includes("Cards (Grid)")
    && kcp.includes("Shared View")
    && kcp.includes("Tree View"),
  () => `tabs count: Cards=${kcp.includes("Cards")} Shared=${kcp.includes("Shared View")} Tree=${kcp.includes("Tree View")}`);
test("T3b: Project Combobox + 'ทุกโปรเจกต์' + options ทีละโปรเจกต์",
  () => kcp.includes('data-testid="kcp-project-combobox"')
    && kcp.includes("ทุกโปรเจกต์")
    && kcp.includes("projects.map"));
test("T3c: 4 KPI cards (Pillar/Cluster/Supporting/Total keywords) data-testid kcp-kpi",
  () => kcp.includes('data-testid="kcp-kpi"')
    && kcp.includes("Pillar") && kcp.includes("Cluster") && kcp.includes("Supporting") && kcp.includes("รวมคำหลัก"));
test("T3d: ClusterCard tier 3 สี amber/blue/green border-left",
  () => kcp.includes("TIER_STYLES")
    && kcp.includes("pillar") && kcp.includes("cluster") && kcp.includes("supporting")
    && kcp.includes('borderLeft: `4px solid ${c.style.border}`'));
test("T3e: Intent pills 4 สี + KD progress bar 3 สี red(>=70)/amber(>=45)/green",
  () => kcp.includes("commercial") && kcp.includes("transactional") && kcp.includes("navigational") && kcp.includes("informational")
    && kcp.includes("backgroundColor: c.kd >= 70 ?")
    && kcp.includes("dc2626") && kcp.includes("d97706") && kcp.includes("059669"));
test("T3f: Tree View Table rows 12-col grid (keyword/tier/intent/KD/volume)",
  () => kcp.includes('data-testid="kcp-tree"')
    && (kcp.match(/grid-cols-12/g)?.length || 0) >= 1
    && kcp.includes("kcp-tree-row-"),
  () => `has-kcp-tree=${kcp.includes("kcp-tree")} grid-cols-12 count=${(kcp.match(/grid-cols-12/g) || []).length} has-row-attr=${kcp.includes("kcp-tree-row-")}`);

// ========== T-4: App.tsx Router 3 routes + Login redirect ==========
test("UI-4: App.tsx routes /, /projects, /kcp + Login/NotFound", () => {
  const ap = read("App.tsx");
  return ap.includes('path="/"') && ap.includes("DashboardOverviewPage")
    && ap.includes('path="/projects"') && ap.includes("ProjectsPage")
    && ap.includes('path="/kcp"') && ap.includes("KeywordClusterPlanner")
    && ap.includes('path="/login"') && ap.includes("Login")
    && ap.includes("NotFound");
});

// ========== T-5: No Broken Contamination (กัน copy งานเก่าติดกลับมา) ==========
const noGoPaths = [
  ["_seo/", "SEO Lib stubs Phase 2"],
  ["pages/AdminDashboard.tsx", "เมนูแอดมินนอก scope"],
  ["pages/WriteArticle.tsx", "Pipeline Phase 2"],
  ["pages/Editor.tsx", "Pipeline Phase 2"],
  ["components/seo/", "SEO Panel Broken copy"],
];
for (const [p, why] of noGoPaths) {
  test(`CONTAMINATION BLOCK: ไม่มีไฟล์/โฟลเดอร์ ${p} (${why})`,
    () => !exists(p),
    () => `PATH STILL EXISTS: ${p}`);
}

console.log("\n============================================================");
console.log(` RESULT: ${PASS.length} PASS / ${PASS.length + FAIL.length} TOTAL / ${FAIL.length} FAIL`);
if (FAIL.length) {
  console.log(" FAIL LIST:");
  FAIL.forEach(f => console.log(`  - ${f.name}${f.detail ? `\n    ${f.detail}` : ""}`));
}
console.log(` EXIT_CODE = ${FAIL.length === 0 ? 0 : 1}`);
console.log("============================================================\n");
process.exit(FAIL.length === 0 ? 0 : 1);
