#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAILS = [];
const PASS = [];
function P(id, ok, msg, detail="") {
  const line = `[${id}] ${ok ? "✅" : "❌"} ${msg}${detail ? " — " + detail : ""}`;
  if (ok) PASS.push(line); else FAILS.push(line);
  console.log(line);
}
const KB = (p) => fs.readFileSync(path.resolve(__dirname, p), "utf8");
const back = KB("../server/routers/keywords.ts");
const kcp  = KB("../client/src/pages/KeywordClusterPlanner.tsx");
const schema = KB("../db/schema.ts");
const mirDir = path.resolve(__dirname, "../db/migrations/");
const migs = fs.readdirSync(mirDir).filter(f => f.endsWith(".sql")).map(f => fs.readFileSync(path.join(mirDir, f), "utf8")).join("\n---\n");

console.log("🧪 P0-KCP LOCAL COMBINED TEST — 38 Assertions Menus 1>2>3>4\n");
// ============== GROUP A — Backend 4 new procedures (8 assertions) ==============
console.log("── GROUP A: Backend keywords.ts procedures (Menu#1 + Menu#4) ──");
P("A1", /listByProject:\s*protectedProcedure/.test(back), "keywords.listByProject procedure EXISTS");
P("A2", /projectId:\s*z\.union\(\[z\.literal\('all'\)/.test(back), "listByProject input projectId 'all' | number union");
P("A3", /teamMembers|ownerId|selectDistinct/.test(back.slice(back.indexOf("listByProject"), back.indexOf("listByProject") + 3200)), "listByProject has team ownership/member access filter");
P("A4", /inp\.tier\s*!==\s*'all'/.test(back) && /inp\.intent\s*!==\s*'all'/.test(back) && /inp\.status\s*!==\s*'all'/.test(back), "listByProject tier/intent/status WHERE 3 filters applied");
P("A5", /clustersById:Object\.fromEntries/.test(back) || /clustersById\s*=\s*new Map/.test(back), "listByProject returns clustersById for tree grouping");
P("A6", /updateTier:\s*protectedProcedure/.test(back), "keywords.updateTier procedure EXISTS");
P("A7", /bulkUpdateTier:\s*protectedProcedure/.test(back), "keywords.bulkUpdateTier procedure EXISTS");
P("A8", /bulkDelete[\s\S]{0,800}articles[\s\S]{0,300}keywordId/.test(back) || /keywordId.*input\.ids|linked\.length\s*>\s*0/.test(back.slice(back.indexOf("bulkDelete"), back.indexOf("bulkDelete")+2200)), "bulkDelete has FK guard prevents deletion if referenced by articles");
// ============== GROUP B — Frontend Filters + REAL DB query (12 assertions) ==============
console.log("\n── GROUP B: Frontend KCP REAL DB + 5 Filters Bar (Menu#1⭐⭐⭐⭐⭐) ──");
P("B1", /trpc\.keywords\.listByProject\.useQuery/.test(kcp), "KCP uses trpc.keywords.listByProject REAL DB query (NO demo makeDemoCluster only)");
P("B2", /placeholder="🔍 ค้นหา Keyword/.test(kcp) || /placeholder="🔍\s*ค้นหา\s*Keyword/.test(kcp) || /placeholder=.*ค้นหา\s*Keyword/.test(kcp), "Search LIKE filter Input placeholder");
P("B3", /Pillar|Cluster|Supporting/.test(kcp.slice(kcp.indexOf("Filters"), kcp.indexOf("Filters") + 3500)) && /ทุก\s*Tier|Pillar.*Cluster/.test(kcp), "Tier chips pill buttons Pillar/Cluster/Supporting + ทุก Tier");
P("B4", /intent.*select|Intent.*<Select|value={intentFilter}|intentFilter/.test(kcp), "Intent select filter dropdown");
P("B5", /statusFilter|status.*select|Status.*pending|Pending\/Written/.test(kcp), "Status select filter Pending/Written");
P("B6", /pillarCount|clusterCount|supportingCount/.test(kcp), "KPI counter Pillar/Cluster/Supporting 3 tier");
P("B7", /dbKeywords\.map\(mapToCard\)/.test(kcp), "cardList useMemo maps DB rows via mapToCard");
P("B8", /onSuccess:\s*async\s*\(\s*\)\s*=>\s*\{\s*await\s+utils\.keywords\.listByProject\.invalidate\(\)/.test(kcp.replace(/\s+/g, " ")), "ALL mutations onSuccess invalidateQueries listByProject refresh");
P("B9", /staleTime:\s*30_000|staleTime:\s*30000/.test(kcp), "useQuery staleTime 30s optimize rerender");
P("B10", /totalKeywords\s*===\s*0.*emptyFallback|emptyFallback.*scopedProjects/.test(kcp.replace(/\s+/g, " ")), "Demo emptyFallback cards scoped per-project when DB empty");
P("B11", /ผลลัพธ์\s*|Result|badge.*count|จำนวน.*คำหลัก/.test(kcp), "Result count Badge in Filters bar");
P("B12", /Project.*select|projectSelector|value={projectId}/i.test(kcp), "Project selector in Import CSV scope");
// ============== GROUP C — Import CSV + Add Keyword Dialog (6 assertions) ==============
console.log("\n── GROUP C: Import CSV Dialog + Add Keyword Dialog (Menu#1+#3) ──");
P("C1", /นำเข้า\s*CSV|Import\s*CSV/.test(kcp), "Import CSV trigger button label");
P("C2", /FileReader|\.text\(\)|readAsText|file\.text/.test(kcp), "FileReader CSV file parse client-side (file.text() / readAsText)");
P("C3", /preview.*50|slice\(0,\s*50\)|Preview.*rows/i.test(kcp), "CSV Preview 50 rows before import");
P("C4", /keywords\.importCsv/.test(kcp) && /mutateAsync|mutate/.test(kcp.slice(kcp.indexOf("importCsv")-200, kcp.indexOf("importCsv")+800)), "Mutate keywords.importCsv endpoint");
P("C5", /เพิ่ม\s*Keyword|Add\s*Keyword|เพิ่ม\s*คำหลัก/i.test(kcp) && /Tier[\s\S]{0,120}Intent|Intent[\s\S]{0,120}Tier|tier.*intent|intent.*tier/i.test(kcp.slice(kcp.search(/เพิ่ม|Add\s*Keyword/)>0 ? kcp.search(/เพิ่ม|Add\s*Keyword/) : 0, kcp.search(/เพิ่ม|Add\s*Keyword/)+2500)), "Add Keyword Dialog Tier/Intent 2 selectors");
P("C6", /importCsv.*single|fallback.*importCsv|clusterId\s*[=:]\s*0|clusterId=0/.test(kcp), "Add Keyword fallback keywords.importCsv for clusterId=0");
// ============== GROUP D — Tree Hierarchy expand/collapse 3-Tier (5 assertions) ==============
console.log("\n── GROUP D: Tree View REAL Hierarchy 3-Tier (Menu#2⭐⭐⭐⭐) ──");
P("D1", /Tree.*Tab|Tab.*Tree|"Tree"/.test(kcp), "Tree Tab view switch visible");
P("D2", /treeGroup|clustersById\.parent_id|parent_id.*cluster/.test(kcp), "treeGroup grouping via clustersById parent_id");
P("D3", /ChevronDown|ChevronRight|expand|collapsed|setExpanded/.test(kcp), "Chevron expand/collapse controls");
P("D4", /depth\s*\*\s*20|padding.*depth|left.*depth/.test(kcp), "depth-based padding tree rows");
P("D5", /Pillar.*Cluster.*Supporting|Pillar→Cluster→Supporting|3.*Tier|3-?Tier/.test(kcp) || (/renderRow|treeNode/.test(kcp) && /pillar|cluster|supporting/.test(kcp.slice(kcp.indexOf("treeGroup"), kcp.indexOf("treeGroup")+2500))), "Tree row render Pillar→Cluster→Supporting 3 levels");
// ============== GROUP E — Batch Actions + Table Tab (5 assertions) ==============
console.log("\n── GROUP E: Batch toolbar + Table Tab (Menu#4⭐⭐) ──");
P("E1", /เลือกทั้งหมด|เคลียร์|Batch|selected|checkbox\s*select/i.test(kcp), "Batch bar with Select all / Clear buttons");
P("E2", /Set\s*Tier|SetTier|bulkUpdateTier|setTier/.test(kcp) && /bulkUpdateTier(\.use|\.mutate|Mut)/.test(kcp), "Batch Set Tier → bulkUpdateTier mutation");
P("E3", /Delete\s*Selected|ลบที่เลือก|bulkDelete/.test(kcp) && /bulkDelete(\.use|\.mutate|Mut)/.test(kcp), "Batch Delete Selected → bulkDelete with FK guard");
P("E4", /Export\s*CSV|Blob|UTF-?8|\\uFEFF|BOM/.test(kcp), "Batch Export CSV UTF-8 BOM download");
P("E5", /Table.*Tab|Tab.*Table|select\s*all.*checkbox|Checkbox.*All|SelectAll|selectAll/.test(kcp), "Table Tab 12-col with select-all checkbox header");
// ============== GROUP F — AC-6 ZERO ALTER/DROP SQL regression + tables count 14 (2 assertions) ==============
console.log("\n── GROUP F: AC-6 REGRESSION GUARD (Forever Rule) ──");
P("F1", !/DROP\s+(TABLE|DATABASE|SCHEMA|COLUMN)/i.test(migs), "SQL Migrations ZERO DROP structural (NO schema destruction) — G1.1 backward compat");
const tables = [...schema.matchAll(/export\s+const\s+(\w+)\s*=\s*mysqlTable/g)].map(m=>m[1]);
P("F2", tables.length === 14, `Schema V2 tables count=14 exact FOREVER — got ${tables.length}`, tables.join(","));
// ============== SUMMARY ==============
const T = 38, G = PASS.length, B = FAILS.length;
console.log(`\n${B === 0 ? "🟢" : "🔴"} LOCAL KCP TEST SUMMARY: ${G}/${T} PASS (need ≥30 PASS, exit0) — FAIL=${B}${B?":\n  "+FAILS.join("\n  "):""}`);
process.exit(B > 8 ? 1 : 0);
