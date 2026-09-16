// KCP Full System E2E Smoke Test — SSH to VPS, DB only (NO LLM, NO SERP cost)
// Flow: Seed 9 KW → Mock Enrich SV/KD → Mock AI 3-Tier Cluster (3P/9C/18S × 5 KW each = 150)
// Assert: counts OK, tiers OK, every cluster ≥5 KW, no FK orphans → cleanup → Exit 0 PASS
// Hard Preserve: No ALTER/DROP/TRUNCATE tables. PM2 id=0 UNTOUCHED. No LLM/Serper spend.
import { Client } from "ssh2";
const SSH = { host: '35.231.230.218', port: 22, username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt' };
const TEST_PREFIX = '[E2E KCP DeleteMe]';
const TEAM_ID = 90001;
const OWNER_ID = 99001;
const UNASSIGNED_NAME = '📋 ยังไม่ได้จัดกลุ่ม (System)';

function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$'); }

const conn = new Client();
const testSql = [];

// Step 0: Pick category_id 1 (football typically first; find a real category)
testSql.push(`SET @CAT_ID = (SELECT COALESCE(MIN(id), 1) FROM categories);`);
// Step 1: Insert test project
testSql.push(`INSERT INTO projects (team_id, owner_id, category_id, name, main_keyword, description, is_active) VALUES (${TEAM_ID}, ${OWNER_ID}, @CAT_ID, "${q(TEST_PREFIX)} ปานบอล Auto Smoke ${Date.now()}", "ปานบอลออนไลน์", "${q(TEST_PREFIX)} E2E smoke — DELETE AFTER RUN", 1);`);
testSql.push(`SET @PROJ_ID = LAST_INSERT_ID();`);
testSql.push(`SELECT @PROJ_ID AS new_test_project_id, @CAT_ID AS category_id;`);

// Step 2: Insert marker cluster
testSql.push(`INSERT IGNORE INTO clusters (project_id, name, type, parent_id, created_at) VALUES (@PROJ_ID, "${q(UNASSIGNED_NAME)}", "supporting", NULL, NOW());`);
testSql.push(`SET @MARKER_CID = (SELECT id FROM clusters WHERE project_id = @PROJ_ID AND name = "${q(UNASSIGNED_NAME)}" LIMIT 1);`);
testSql.push(`SELECT @MARKER_CID AS marker_cluster_id;`);

// Step 3: Insert 9 seed football Thai keywords
const SEEDS = [
  'ปานบอลออนไลน์', 'สมัครปานบอล', 'เว็บปานบอล', 'พนันบอลออนไลน์', 'ทีเด็ดบอลวันนี้',
  'บอลเต็ม ราคาดี', 'สเต็ปบอล วันนี้', 'โปรโมชั่น ปานบอล', 'ฝาก-ถอน ปานบอล',
];
const INTENTS = ['commercial','informational','navigational','transactional'];
for (const kw of SEEDS) {
  const intent = INTENTS[rand(0, INTENTS.length - 1)];
  testSql.push(`INSERT IGNORE INTO keywords (cluster_id, project_id, category_id, keyword_text, tier, search_volume, intent_suggestion, difficulty, is_target, status) VALUES (@MARKER_CID, @PROJ_ID, @CAT_ID, "${q(kw)}", "supporting", 0, "${intent}", 0, 0, "pending");`);
}

// Step 4: Mock Enrich SERP — update SV 100-500, KD 20-80
testSql.push(`UPDATE keywords SET search_volume = FLOOR(100 + RAND() * 401), difficulty = FLOOR(20 + RAND() * 61), intent_suggestion = CASE WHEN RAND() < 0.25 THEN "commercial" WHEN RAND() < 0.5 THEN "transactional" WHEN RAND() < 0.75 THEN "navigational" ELSE "informational" END WHERE project_id = @PROJ_ID AND keyword_text IN (${SEEDS.map(k => `"${q(k)}"`).join(',')});`);
testSql.push(`SELECT COUNT(*) AS seed_total, SUM(CASE WHEN search_volume>0 THEN 1 ELSE 0 END) seed_sv_nonzero, SUM(CASE WHEN difficulty>0 THEN 1 ELSE 0 END) seed_kd_nonzero FROM keywords WHERE project_id = @PROJ_ID AND keyword_text IN (${SEEDS.map(k => `"${q(k)}"`).join(',')});`);

// Step 5: Mock AI 3-tier clusterize — 3 pillars → 9 clusters → 18 supporting. 5 KW each = 150 total.
// Step 5a: Insert 3 pillars
const PILLAR_NAMES = ['แนวทางการลงทุนปานบอล', 'วิเคราะห์ทีเด็ดบอล', 'โปรโมชั่น/โบนัส'];
const PILLAR_VARS = ['@P1_CID', '@P2_CID', '@P3_CID'];
for (let i = 0; i < 3; i++) {
  testSql.push(`INSERT INTO clusters (project_id, name, type, parent_id, created_at) VALUES (@PROJ_ID, "${q(PILLAR_NAMES[i])}", "pillar", NULL, NOW());`);
  testSql.push(`SET ${PILLAR_VARS[i]} = LAST_INSERT_ID();`);
}
// Step 5b: 9 clusters (3 pillars × 3)
const CLUSTER_BASE = [
  ['วิธีเริ่มต้นเล่น', 'แผนการเงิน', 'กฎกติกา'],
  ['ทีเด็ดไทยลีก', 'ทีเด็ดพรีเมียร์ลีก', 'ทีเด็ดยูฟ่าแชมป์'],
  ['โบนัสสมัครใหม่', 'โปรคืนยอดเสีย', 'โปรเติมเงินรายวัน'],
];
const CLUSTER_VARS = [];
for (let p = 0; p < 3; p++) {
  for (let c = 0; c < 3; c++) {
    const vName = `@C_${p}_${c}_CID`;
    CLUSTER_VARS.push(vName);
    testSql.push(`INSERT INTO clusters (project_id, name, type, parent_id, created_at) VALUES (@PROJ_ID, "${q(CLUSTER_BASE[p][c])}", "cluster", ${PILLAR_VARS[p]}, NOW());`);
    testSql.push(`SET ${vName} = LAST_INSERT_ID();`);
  }
}
// Step 5c: 18 supporting (9 clusters × 2)
const SUPP_BASE_TEMPLATES = [
  ['คืออะไร', 'ขั้นตอนทำ'],
  ['ตารางคะแนน', 'โปรแกรมแข่ง'],
  ['วิธีเรียกร้อง', 'ข้อกำหนด'],
];
const SUPP_VARS = [];
let sIdx = 0;
for (let p = 0; p < 3; p++) {
  for (let c = 0; c < 3; c++) {
    for (let s = 0; s < 2; s++) {
      const vName = `@S_${sIdx}_CID`;
      SUPP_VARS.push(vName);
      const parentC = `@C_${p}_${c}_CID`;
      testSql.push(`INSERT INTO clusters (project_id, name, type, parent_id, created_at) VALUES (@PROJ_ID, "${q(CLUSTER_BASE[p][c] + ' - ' + SUPP_BASE_TEMPLATES[c][s])}", "supporting", ${parentC}, NOW());`);
      testSql.push(`SET ${vName} = LAST_INSERT_ID();`);
      sIdx++;
    }
  }
}

// Step 6: For ALL 30 tiers clusters (3+9+18) insert 5 distinct longtail Thai keywords each = 150 total
const ALL_CLUSTER_VARS = [...PILLAR_VARS, ...CLUSTER_VARS, ...SUPP_VARS];
const SUFFIXES = ['วันนี้', '2026', 'ใหม่', 'ฟรี', 'ที่นี่'];
let kwIdx = 0;
for (let i = 0; i < ALL_CLUSTER_VARS.length; i++) {
  const cv = ALL_CLUSTER_VARS[i];
  const tier = i < 3 ? 'pillar' : i < 12 ? 'cluster' : 'supporting';
  for (let k = 0; k < 5; k++) {
    kwIdx++;
    const kwText = `[KCP-E2E] ${TIER_LABEL(tier)} group${i+1} kw${k+1} ${SUFFIXES[k]} ${String(kwIdx).padStart(4,'0')}`;
    const intent = INTENTS[(i + k) % INTENTS.length];
    const sv = 100 + ((i * 5 + k * 37) % 400);
    const kd = 20 + ((i * 7 + k * 11) % 60);
    testSql.push(`INSERT INTO keywords (cluster_id, project_id, category_id, keyword_text, tier, search_volume, intent_suggestion, difficulty, is_target, status) VALUES (${cv}, @PROJ_ID, @CAT_ID, "${q(kwText)}", "${tier}", ${sv}, "${intent}", ${kd}, 0, "pending");`);
  }
}

function TIER_LABEL(t) { return t === 'pillar' ? 'Pill' : t === 'cluster' ? 'Clus' : 'Supp'; }

// Assertions:
testSql.push(`SELECT "@PROJ_ID" AS _var, @PROJ_ID AS v;`);
// 1. Keyword total >= 150 (150 exact + 9 seeds optional)
testSql.push(`SELECT COUNT(*) AS total_keywords FROM keywords WHERE project_id = @PROJ_ID;`);
// 2. Pillar clusters >=3, Cluster >=9, Supporting >=18
testSql.push(`SELECT type, COUNT(*) AS c FROM clusters WHERE project_id = @PROJ_ID AND id != @MARKER_CID GROUP BY type ORDER BY FIELD(type,"pillar","cluster","supporting");`);
// 3. EVERY cluster (excl marker) MIN >= 5 keywords — EXPECT 0 ROWS:
testSql.push(`SELECT "ASSERT clusters_with_<5_keywords (EXPECT 0 ROWS):" AS _;`);
testSql.push(`SELECT k.cluster_id, c.name, c.type, COUNT(*) AS kwc FROM keywords k LEFT JOIN clusters c ON c.id=k.cluster_id WHERE k.project_id=@PROJ_ID AND k.cluster_id != @MARKER_CID GROUP BY k.cluster_id, c.name, c.type HAVING COUNT(*) < 5;`);
// 4. FK orphan keywords check:
testSql.push(`SELECT "ASSERT FK_orphan_keywords (EXPECT 0):" AS _;`);
testSql.push(`SELECT COUNT(*) AS orphan_keywords FROM keywords k WHERE k.project_id=@PROJ_ID AND k.cluster_id NOT IN (SELECT id FROM clusters WHERE project_id=@PROJ_ID);`);
// 5. parent_id standardize: no 0 (only NULL or positive integer)
testSql.push(`SELECT "ASSERT clusters_parent_id_not_zero (EXPECT 0):" AS _;`);
testSql.push(`SELECT COUNT(*) AS c_parent_zero FROM clusters WHERE project_id=@PROJ_ID AND parent_id=0;`);

// Cleanup DELETE (keywords → clusters → projects; FK CASCADE helps)
testSql.push(`DELETE k FROM keywords k WHERE k.project_id = @PROJ_ID;`);
testSql.push(`DELETE c FROM clusters c WHERE c.project_id = @PROJ_ID;`);
testSql.push(`DELETE p FROM projects p WHERE p.id = @PROJ_ID;`);
testSql.push(`SELECT "POST CLEANUP verify:" AS _; SELECT COUNT(*) AS proj_remaining FROM projects WHERE id = @PROJ_ID; SELECT COUNT(*) AS clus_remaining FROM clusters WHERE project_id = @PROJ_ID; SELECT COUNT(*) AS kw_remaining FROM keywords WHERE project_id = @PROJ_ID;`);

// Build final SSH batch via MariaDB in Docker
const safeSqls = testSql.map(s => q(s));
const cmd = `sudo docker exec eeat-studio-db mariadb -t --default-character-set=utf8mb4 -ueeat -p'eeat_secret_2026_Cloud!' eeat_studio_v2 -e "${safeSqls.join('; ')}" 2>&1 | tail -200`;

let output = '';
let failed = false;
conn.on('ready', () => {
  conn.exec(cmd, { pty: true }, (err, stream) => {
    if (err) { console.error('SSH EXEC ERROR', err); process.exit(1); }
    stream.on('data', d => { output += String(d); process.stdout.write(d); });
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', (code) => {
      conn.end();
      console.log('\n\n==== ASSERTION INTERPRETATION ====');
      const linesRaw = output.split('\n');
      function pickCells(pipeLine) {
        return String(pipeLine || '').split('|').map(s => s.trim()).filter(s => s.length > 0);
      }
      function firstIntAfter(marker, windowAfter = 10, fromIdx = 0) {
        const hi = linesRaw.findIndex((l, i) => i >= fromIdx && l.includes(marker));
        if (hi < 0) return NaN;
        for (let i = hi + 1; i < Math.min(hi + 2 + windowAfter, linesRaw.length); i++) {
          const line = linesRaw[i];
          if (/^\+-/.test(line.trim())) continue;
          const cells = pickCells(line);
          for (const c of cells) {
            const n = parseInt(c, 10);
            if (Number.isFinite(n)) return n;
          }
        }
        return NaN;
      }
      const kwTotal = firstIntAfter('total_keywords', 8);
      console.log(`1. total_keywords = ${Number.isFinite(kwTotal) ? kwTotal : 'N/A'} / min 150 => ${kwTotal >= 150 ? '✅ PASS' : '❌ FAIL'}`);
      // tiers: find type / c header -> skip sep line -> parse 3 data lines (pillar/cluster/supporting)
      let p = 0, cl = 0, sv = 0;
      const th = linesRaw.findIndex(l => {
        const cells = pickCells(l);
        return cells.length >= 2 && cells[0] === 'type' && /\bc\b/.test(cells.slice(1).join(' '));
      });
      if (th >= 0) {
        for (let i = th + 1; i < Math.min(th + 9, linesRaw.length); i++) {
          const rawLine = linesRaw[i];
          if (/^\+-/.test(rawLine.trim())) continue;
          const cells = pickCells(rawLine);
          if (cells.length < 2) continue;
          const tier = String(cells[0]).toLowerCase();
          const n = parseInt(cells[cells.length - 1], 10);
          if (!Number.isFinite(n)) continue;
          if (tier === 'pillar') p = n;
          else if (tier === 'cluster') cl = n;
          else if (tier === 'supporting') sv = n;
        }
      }
      console.log(`2. tiers P=${p}/3 C=${cl}/9 S=${sv}/18 => ${p>=3&&cl>=9&&sv>=18?'✅ PASS':'❌ FAIL'}`);
      // clusters with <5 keywords: search for ASSERT header then check if a result table exists (cluster_id header). If no result table, count=0 PASS
      let kwcRows = 0;
      const lt5A = linesRaw.findIndex(l => l.includes('clusters_with_<5_keywords'));
      if (lt5A >= 0) {
        const resultHdr = linesRaw.findIndex((l, i) => i > lt5A && pickCells(l)[0] === 'cluster_id');
        if (resultHdr >= 0) {
          for (let i = resultHdr + 1; i < linesRaw.length; i++) {
            const r = linesRaw[i];
            if (/^\+-/.test(r.trim())) continue;
            const cells = pickCells(r);
            if (cells.length === 0) break;
            if (/^ASSERT|^POST |^SELECT|^_var|new_test_project|^@MARKER/.test(cells.join(' '))) break;
            const anyInt = cells.some(c => /^\d+$/.test(c));
            if (anyInt) kwcRows++;
          }
        } else {
          kwcRows = 0;
        }
      }
      console.log(`3. clusters with <5 keywords = ${kwcRows} rows (EXPECT 0) => ${kwcRows===0?'✅ PASS':'❌ FAIL'}`);
      const orph = firstIntAfter('orphan_keywords', 6);
      console.log(`4. FK orphan keywords = ${Number.isFinite(orph) ? orph : 'N/A'} (EXPECT 0) => ${orph===0?'✅ PASS':'❌ FAIL'}`);
      const pz = firstIntAfter('c_parent_zero', 6);
      console.log(`5. clusters parent_id=0 rows = ${Number.isFinite(pz) ? pz : 'N/A'} (EXPECT 0) => ${pz===0?'✅ PASS':'❌ FAIL'}`);
      // 6: cleanup verify
      const pr = firstIntAfter('proj_remaining', 8);
      const cr = firstIntAfter('clus_remaining', 8, (linesRaw.findIndex(l => l.includes('proj_remaining')) + 1));
      const kr = firstIntAfter('kw_remaining', 8, (linesRaw.findIndex(l => l.includes('clus_remaining')) + 1));
      const cleanOk = pr === 0 && cr === 0 && kr === 0;
      console.log(`6. CLEANUP OK (proj=0 clus=0 kw=0) => P=${Number.isFinite(pr)?pr:'?'} C=${Number.isFinite(cr)?cr:'?'} K=${Number.isFinite(kr)?kr:'?'} => ${cleanOk?'✅ PASS':'❌ FAIL'}`);
      const allPass = (kwTotal >= 150) && (p>=3&&cl>=9&&sv>=18) && (kwcRows===0) && (orph===0) && (pz===0) && cleanOk;
      console.log(`\n==== FINAL: ${allPass?'✅ E2E SMOKE PASS Exit=0':'❌ E2E SMOKE FAIL Exit=1'} ====`);
      process.exit(allPass ? 0 : 1);
    });
  });
}).on('error', e => { console.error('SSH connect error', e); process.exit(1); }).connect(SSH);
