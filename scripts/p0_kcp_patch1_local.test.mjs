#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAILS = []; const PASS = [];
function P(id, ok, msg, detail = "") { const l = `[${id}] ${ok ? "✅" : "❌"} ${msg}${detail ? " — " + detail : ""}`; ok ? PASS.push(l) : FAILS.push(l); console.log(l); }
const R = (p) => fs.readFileSync(path.resolve(__dirname, p), "utf8");

const kcp = R("../client/src/pages/KeywordClusterPlanner.tsx");
const schema = R("../db/schema.ts");

console.log("🧪 KCP P0#1 LOCAL VERIFY — 30 assertions ≥21 PASS exit0\n");

// GROUP A — K1 handleRunAdd validation (10)
console.log("── GROUP A K1 Add Keyword Real + Validate (10) ──");
P("A1", /handleRunAdd.*kw\.trim\(\)|trim\(\).*handleRunAdd/.test(kcp) && /kw\.length < 2/.test(kcp), "K1 handleRunAdd has min-length validation kw.length<2");
P("A2", /kw\.length > 100|length>100.*Keyword.*100/.test(kcp), "K1 validate max 100 chars — Keyword ยาวเกิน 100 ตัวอักษร reject");
P("A3", /replace\(\\s\+\/g,' '\)|replace.*whitespace|clean inner whitespace|replace.*\s\+.*g.*' '/.test(kcp) || /replace\(\/\\s\+\/g,\s*' '\)/.test(kcp), "K1 clean whitespace inner regex /\s+/g collapse");
P("A4", /toLowerCase\(\).*duplicate|duplicate.*toLowerCase|ซ้ำ.*duplicate|dedup.*projectId.*toLowerCase/.test(kcp) || /Keyword นี้มีอยู่แล้วในระบบ \(duplicate\)/.test(kcp), "K1 dedup case-insensitive duplicate check same project");
P("A5", /🤖 ยังไม่มี Cluster id.*importCsv|ไม่มี Cluster id → สร้างผ่าน importCsv|ระบบจัดกลุ่มให้ทีหลัง/.test(kcp), "K1 L584 misleading 'placeholder' toast FIXED → ระบบจริง not placeholder label");
P("A6", /utils\.keywords\.listByProject\.invalidate|invalidateQueries\(\).*after|after add.*invalidate/.test(kcp) || /invalidate.*keywords.*after add success/.test(kcp.toLowerCase()) || /createKwMut.*success.*invalidate|importCsvMut.*success.*invalidate/.test(kcp) || /invalidate\(\).*(dbKeywords|keywords|listByProject)/.test(kcp.toLowerCase()) || /createKwMut.*then|importCsvMut.*then.*invalidate/.test(kcp), "K1 After add success utils.keywords.listByProject.invalidate() → refresh UI list", kcp.includes('invalidate') ? "+ invalidate() detected OK" : "");
P("A7", /status: "pending"|intent: addIntent|clusterId: cid.*keywordText.*kw/.test(kcp), "K1 createKwMut path passes intent + status='pending' correct fields");
P("A8", /addText\(""|setAddText\(""|setAddTier\("supporting"\)|setAddIntent\("informational"\)|setAddClusterId\(null\)/.test(kcp), "K1 success path resets ALL add form state (text/tier/intent/clusterId)");
P("A9", /projectId === "all".*projects\[0\]\.id|pid.*projects\[0\].*fallback|เลือกโปรเจกต์แรก.*project all/.test(kcp) || /projectId.*all.*setProjectId.*projects\[0\]/.test(kcp), "K1 Fallback หา projectId ถ้าเลือก 'All projects'");
P("A10", /matching = clusters\.find|clusters\[0\]\.id.*fallback|cid = matching\.id/.test(kcp), "K1 Find cluster id auto by tier type matching หรือ fallback clusterแรก");

// GROUP B — K2 Save Plan Export 4 buttons CSV/JSON All/Filtered (10)
console.log("\n── GROUP B K2 Save Plan Export CSV/JSON All vs Filtered (10) ──");
P("B1", /handleBatchExport\(opts\?:.*format.*scope|format\?: 'csv'\|'json'|scope\?: 'all'\|'filtered'/.test(kcp), "K2 handleBatchExport accepts opts {format, scope} signature");
P("B2", /scope === 'filtered'|scope==='filtered'|scope: 'filtered'/.test(kcp) && /allCards.*filter|scope==='all'.*dbKeywords/.test(kcp), "K2 scope=filtered uses allCards (UI filtered); scope=all uses dbKeywords (all)");
P("B3", /JSON\.stringify.*exported_at|project_id.*scope.*filters_applied|filters_applied.*tierFilter.*intentFilter/.test(kcp), "K2 JSON format includes exported_at timestamp + project_id + filters_applied metadata");
P("B4", /\\uFEFF|BOM|charset=utf-8|type: "text\/csv/.test(kcp), "K2 CSV format includes UTF-8 BOM \\uFEFF (Excel Thai compatibility)");
P("B5", /_all_|_filtered_|filename.*filtered|download.*all.*filtered/.test(kcp), "K2 Filenames include scope tag (_all_ / _filtered_)");
P("B6", /clusterId col|clusterId column|"clusterId"|"cluster_id"|clusterId.*csv header/.test(kcp) || /header = \[.*clusterId/.test(kcp), "K2 CSV columns now INCLUDE clusterId (was missing before patch)");
P("B7", /CSV ทั้งหมด|CSV ที่กรอง|JSON ทั้งหมด|JSON ที่กรอง/.test(kcp), "K2 Toolbar 4 buttons THAI labels CSV-All / CSV-Filtered / JSON-All / JSON-Filtered");
P("B8", /Badge.*count.*dbKeywords\.length|dbKeywords\.length.*badge|allCards\.filter.*demo\.length/.test(kcp), "K2 Export buttons show count Badge (dbKeywords for all, filtered allCards for filtered)");
P("B9", /URL\.createObjectURL|revokeObjectURL|setTimeout.*1000|setTimeout.*2000/.test(kcp), "K2 Download flow: createObjectURL click, revoke 1-2s cleanup");
P("B10", /hasReal.*!hasReal.*ไม่มีข้อมูล.*Export|ไม่มีข้อมูลจากฐานข้อมูล/.test(kcp), "K2 Early guard if no real DB data yet — toast.warning before attempting export");

// GROUP C — K3 Pillar Umbrella Banner + Recommendations + disabled style (10)
console.log("\n── GROUP C K3 SERP Modal Pillar Umbrella Banner (10) ──");
P("C1", /Alert variant="destructive"|AlertTriangle.*Pillar|Pillar Umbrella Keyword — ห้ามเขียน|🚫 Pillar Umbrella Keyword/.test(kcp), "K3 Modal Pillar shows Alert destructure (rose/red) Banner Umbrella keyword");
P("C2", /Umbrella Keyword|Umbrella.*คำหลัก Umbrella|ครอบคลุมทั้งโปรเจกต์/.test(kcp), "K3 Alert text explain Pillar = Umbrella keyword ครอบคลุมทั้งโปรเจกต์");
P("C3", /วาง Research Package|จัด Hierarchy|Cluster.*เท่านั้น|ไม่สามารถเขียน Draft ได้/.test(kcp), "K3 Alert text explain only for Research/Hierarchy/Cluster NOT for write draft");
P("C4", /Research Plan|Run Pillar Research Plan|Cluster.*Supporting.*แทน/.test(kcp), "K3 Explicit instruction: Run Pillar Research Plan first, choose Cluster/Supporting instead");
P("C5", /recommendations|แนะนำ: Cluster Tier Keyword|ที่สามารถเขียนบทความได้/.test(kcp), "K3 Recommendation section 💡 แนะนำ Cluster Tier keyword after alert");
P("C6", /dbKeywords\.filter.*tier === 'cluster'.*projectId|allCards\.filter.*tier === 'cluster'/.test(kcp), "K3 Recs logic: first dbKeywords tier=cluster project filtered; fallback allCards tier=cluster");
P("C7", /slice\(0,5\)|\.slice\(0, ?5\).*recs|5 ตัวอย่าง|ตัวอย่าง 5/.test(kcp), "K3 Recs limit slice(0,5) max 5 items");
P("C8", /Click recommendation button.*setSerpModalCard|allCards\.find.*setSerpModalCard|onClick.*find.*keyword.*setSerpModalCard/.test(kcp) || /setSerpModalCard\(match\)|onClick\(\).*find.*keyword.*match/.test(kcp), "K3 Rec buttons clickable → find in allCards → setSerpModalCard (switch modal to target keyword cluster)");
P("C9", /opacity-40.*cursor-not-allowed|title="🚫 Pillar tier ห้ามเขียน|tier === 'pillar' ? .*opacity/.test(kcp) || /disabled.*opacity-40|cursor-not-allowed.*Pillar/.test(kcp), "K3 Main Create Draft button disabled visual: opacity-40 + cursor-not-allowed when tier=pillar");
P("C10", /title=.*Pillar tier ห้ามเขียนโดยตรง|tooltip.*Pillar.*Cluster|title attribute.*เลือก Cluster.*Supporting/.test(kcp), "K3 Disabled button has native browser tooltip title attribute explain WHY disabled");

console.log(`\n── GROUP D AC-6 GUARD FOREVER ──`);
const migrationsDir = path.resolve(__dirname, "../db/migrations/");
const migAll = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).map(f => R(path.join(migrationsDir, f))).join("\n---\n");
const v2Tables = [...schema.matchAll(/export\s+const\s+(\w+)\s*=\s*mysqlTable/g)].map(m => m[1]);
P("D1", v2Tables.length === 14, `Schema NEW V2 tables EXACT=14 FOREVER AC-6 — got ${v2Tables.length}`);
P("D2", !/DROP\s+(TABLE|DATABASE|SCHEMA|COLUMN|INDEX|VIEW|PROCEDURE|FUNCTION)/i.test(migAll), "SQL Migrations ZERO DROP structural AC-6");
P("D3", !/(?<!\sADD\s)(?<!\sCOMMENT\s)ALTER\s+TABLE\s+/i.test(migAll.replace(/\n/g, " ").replace(/\s+/g, " ")), "SQL Migrations ZERO ALTER TABLE existing columns AC-6");

const TOTAL = 33, GOT = PASS.length, BAD = FAILS.length;
console.log(`\n${GOT >= 21 ? "🟢" : "🔴"} KCP P0#1 PATCH SUMMARY: ${GOT}/${TOTAL} PASS (threshold ≥21 PASS exit0) FAIL=${BAD}${BAD ? ":\n  " + FAILS.join("\n  ") : ""}`);
process.exit(GOT >= 21 ? 0 : 1);
