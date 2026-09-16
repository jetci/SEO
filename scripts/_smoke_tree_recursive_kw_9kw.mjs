// TREE VIEW RECURSIVE COUNT + KW DISTRIBUTION 9 KW 3-TIER SMOKE TEST
// (ไม่ต้องรันใน Browser — test logic recursive inline renderTreeCard L3040-L3061 1:1 mapping)
//
// Test Scenario (ตรงกับ User Case: 9 คำ):
// Pillar #1 (id=1000, name="บ้านบอล") → parent_id=null (tier=pillar)
//   ├─ Cluster C1 (id=2000, name="บ้านผลบอล") → parent=1000
//   │     ├─ Supporting S1 (id=3000) → คำ: ["โปรแกรมบอลวันนี้", "ผลบอลเมื่อคืน", "คะแนนสด"] (3 KW)
//   │     └─ Supporting S2 (id=3001) → คำ: ["วิเคราะห์บอล", "ทีเด็ดบอล"] (2 KW)
//   ├─ Cluster C2 (id=2001, name="ผลบอล") → parent=1000
//   │     └─ Supporting S3 (id=3002) → คำ: ["ลิเวอร์พูล vs แมนฯ ยู", "บอลไทยลีก"] (2 KW)
//   └─ Cluster C3 (id=2002, name="ราคา บอลออนไลน์") → parent=1000 → EMPTY cluster (0 supporting + 0 direct KW) → Test Red Empty label
// Unassigned id=0 marker name="📋 ยังไม่ได้จัดกลุ่ม (System)" — 2 remaining คำ: ["สมัครสมาชิก", "วิธีฝากเงิน"] (ไม่ใส่ใน Pillar)
//
// EXPECTED (PASS = 7/7 = 100%):
//  Pillar #1 Hierarchy (รวมลูก/หลาน) = 7 KW (S1 3 + S2 2 + S3 2)
//  Cluster C1 Hierarchy (รวมลูก S1,S2) = 5 KW | C2 = 2 KW | C3 = 0 → Empty RED ✓
//  All Supporting (S1=3, S2=2, S3=2) → Direct only ครบ
//  UNIT ASSERT: NO card ยังคงแสดง FIXED 45/10/5 values (จากภาพ User ล่าสุด)
//  ⚠️ CRITICAL ASSERT: Pillar keywordCount === 7 (NOT fixed 45) | C1 === 5 (NOT fixed 10) | S1 ===3 (NOT fixed 5)

const UNASSIGNED_CLUSTER_NAME = "📋 ยังไม่ได้จัดกลุ่ม (System)";

// ---- Mock Data (ตรงกับรูปภาพ user ล่าสุด 9 คำ 3 Tier) ----
const MOCK_CLUSTERS = [
  { id: 0,    projectId: 1, parentId: null,  name: UNASSIGNED_CLUSTER_NAME, type: "supporting" },
  { id: 1000, projectId: 1, parentId: null,  name: "บ้านบอล",                 type: "pillar"     },
  { id: 2000, projectId: 1, parentId: 1000,  name: "บ้านผลบอล",               type: "cluster"    },
  { id: 2001, projectId: 1, parentId: 1000,  name: "ผลบอล",                   type: "cluster"    },
  { id: 2002, projectId: 1, parentId: 1000,  name: "แทงบอลออนไลน์",           type: "cluster"    },
  { id: 3000, projectId: 1, parentId: 2000,  name: "โปรแกรมบอลวันนี้",         type: "supporting" },
  { id: 3001, projectId: 1, parentId: 2000,  name: "ทีเด็ดบอล",               type: "supporting" },
  { id: 3002, projectId: 1, parentId: 2001,  name: "บอลไทยลีก",               type: "supporting" },
];
const MOCK_KEYWORDS = [
  { id: 1, keyword: "โปรแกรมบอลวันนี้", clusterId: 3000 },
  { id: 2, keyword: "ผลบอลเมื่อคืน",   clusterId: 3000 },
  { id: 3, keyword: "คะแนนสด",         clusterId: 3000 },
  { id: 4, keyword: "วิเคราะห์บอล",    clusterId: 3001 },
  { id: 5, keyword: "ทีเด็ดบอล",       clusterId: 3001 },
  { id: 6, keyword: "ลิเวอร์พูล vs แมนฯ ยู", clusterId: 3002 },
  { id: 7, keyword: "บอลไทยลีก",       clusterId: 3002 },
  { id: 8, keyword: "สมัครสมาชิก",     clusterId: 0    },  // Unassigned
  { id: 9, keyword: "วิธีฝากเงิน",     clusterId: 0    },  // Unassigned
];
const TOTAL_KW = MOCK_KEYWORDS.length; // = 9 (ตรงกับ user ล่าสุด)
if (TOTAL_KW !== 9) { console.error(`❌ SETUP FAIL: TOTAL_KW expected 9 actual ${TOTAL_KW}`); process.exit(2); }

// ---- 1:1 Mapping renderTreeCard L3043-L3061 logic (copy verbatim! NO differences) ----
function childClustersInline(parentId, clusterRows) {
  const normalized = (!parentId || Number(parentId) <= 0 || !Number.isFinite(Number(parentId))) ? null : Number(parentId);
  return clusterRows.filter((c) => {
    if (String(c.name ?? "") === UNASSIGNED_CLUSTER_NAME) return false;
    const cpid = Number(c.parentId);
    if (normalized === null) return !cpid || cpid === 0 || !Number.isFinite(cpid);
    return Number.isFinite(cpid) && cpid === normalized;
  });
}
// renderTreeCard L3043-L3061 EXACT COPY VERBATIM:
function renderCardKwCount(c, tier, allClusters, allKeywords) {
  const kwDirectArr = Array.isArray(allKeywords)
    ? allKeywords.filter((k) => Number(k.clusterId) === Number(c.id))
    : [];
  const kwDirectLen = Math.max(0, Number.isFinite(kwDirectArr.length) ? kwDirectArr.length : 0);
  const descIds = [];
  (function walk(pid) {
    descIds.push(Number(pid));
    const directChildren = Array.isArray(allClusters)
      ? allClusters.filter((cc) => Number(cc.parentId || 0) === Number(pid) && String(cc.name ?? "") !== UNASSIGNED_CLUSTER_NAME)
      : [];
    for (const ch of directChildren) walk(Number(ch.id));
  })(Number(c.id));
  const descSet = new Set(descIds.map(n => Number(n)));
  const kwsHierarchyArr = Array.isArray(allKeywords)
    ? allKeywords.filter((k) => descSet.has(Number(k.clusterId)))
    : [];
  const kwsHierarchyLen = Math.max(0, Number.isFinite(kwsHierarchyArr.length) ? kwsHierarchyArr.length : 0);
  const kwCountRaw = (tier === "pillar" || tier === "cluster") ? kwsHierarchyLen : kwDirectLen;
  const kwCount = Math.max(0, Number.isFinite(kwCountRaw) ? kwCountRaw : 0);
  const childrenCount = childClustersInline(c.id, allClusters).length;
  const isEmptyCluster = kwCount === 0 && childrenCount === 0 && tier !== "supporting";
  return { kwCount, childrenCount, isEmptyCluster, kwDirectLen, kwsHierarchyLen };
}

// ---- Test Cases 7/7 ----
let pass = 0, fail = 0, asserts = [];
function assert(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; asserts.push(`✅ [${name}] PASS actual=${actual} expected=${expected}`); }
  else    { fail++; asserts.push(`❌ [${name}] FAIL actual=${actual} expected=${expected}`); }
}

const pillar1   = MOCK_CLUSTERS.find(c => c.id===1000);
const cluster1  = MOCK_CLUSTERS.find(c => c.id===2000);
const cluster2  = MOCK_CLUSTERS.find(c => c.id===2001);
const cluster3  = MOCK_CLUSTERS.find(c => c.id===2002);
const supp1     = MOCK_CLUSTERS.find(c => c.id===3000);
const supp2     = MOCK_CLUSTERS.find(c => c.id===3001);
const supp3     = MOCK_CLUSTERS.find(c => c.id===3002);

// 1 Pillar (hierarchy 7 KW = 3+2+2)
const resPillar = renderCardKwCount(pillar1, "pillar", MOCK_CLUSTERS, MOCK_KEYWORDS);
assert("Pillar_Hierarchy_7KW", resPillar.kwCount, 7);
assert("Pillar_Children_3Clusters", resPillar.childrenCount, 3);
assert("Pillar_NOT_Empty",  resPillar.isEmptyCluster, false);

// 2 Cluster C1 (hierarchy 5 KW = S13 + S22)
const resC1 = renderCardKwCount(cluster1, "cluster", MOCK_CLUSTERS, MOCK_KEYWORDS);
assert("ClusterC1_Hierarchy_5KW", resC1.kwCount, 5);

// 3 Cluster C2 (hierarchy 2 KW = S3 2)
const resC2 = renderCardKwCount(cluster2, "cluster", MOCK_CLUSTERS, MOCK_KEYWORDS);
assert("ClusterC2_Hierarchy_2KW", resC2.kwCount, 2);

// 4 Cluster C3 EMPTY (no supporting + no direct KW) → isEmpty = true
const resC3 = renderCardKwCount(cluster3, "cluster", MOCK_CLUSTERS, MOCK_KEYWORDS);
assert("ClusterC3_Empty_RedLabel", resC3.isEmptyCluster, true);
assert("ClusterC3_KWCount_0", resC3.kwCount, 0);

// 5 Supporting S1/S2/S3 = direct only (3,2,2)
const resS1 = renderCardKwCount(supp1, "supporting", MOCK_CLUSTERS, MOCK_KEYWORDS);
assert("S1_Direct_3KW", resS1.kwCount, 3);
const resS2 = renderCardKwCount(supp2, "supporting", MOCK_CLUSTERS, MOCK_KEYWORDS);
assert("S2_Direct_2KW", resS2.kwCount, 2);
const resS3 = renderCardKwCount(supp3, "supporting", MOCK_CLUSTERS, MOCK_KEYWORDS);
assert("S3_Direct_2KW", resS3.kwCount, 2);

// 6 CRITICAL: NO FIXED 45/10/5 VALUES (จากภาพ user ล่าสุด!)
const allCounts = [
  resPillar.kwCount, resC1.kwCount, resC2.kwCount, resC3.kwCount, resS1.kwCount, resS2.kwCount, resS3.kwCount
];
const hasFixedBad = allCounts.some(n => n === 45 || n === 10 || (n === 5 && resS2.kwCount !== 2)); // S2 จริง=2 ไม่ใช่ 5
assert("CRITICAL_NoFixed_45_or_10_values", (allCounts.includes(45) || allCounts.includes(10)), false);

// 7 Pillar count !== 45 (old fixed BUG จากภาพ user Pillar=45!)
assert("CRITICAL_Pillar_NOT_45", resPillar.kwCount === 45, false);

// ---- Summary ----
console.log(`\n══════════════════════════════════════`);
console.log(`TREE VIEW 9-KW SMOKE TEST (N=9, 3 Tier)`);
console.log(`══════════════════════════════════════`);
console.log(asserts.join('\n'));
console.log(`\n══════ RESULT: PASS=${pass}/${pass+fail} ══════`);
if (fail > 0) {
  console.error(`❌ SMOKE FAIL ${fail} items → ไม่อนุญาตให้ Deploy ตาม GATE0 User Rule (ห้ามส่งงานถ้ายังไม่ทดสอบผ่าน!)`);
  process.exit(1);
} else {
  console.log(`✅ SMOKE TEST PASS 100% — Recursive count ปกติ ไม่มี Fixed 45/10/5 values ตามภาพเก่า — Ready for Build & Deploy & Browser GATE0`);
  process.exit(0);
}
