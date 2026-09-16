// KCP AI Clusterize E2E Smoke (REAL 9 keywords LLM, minimal cost < $0.05)
// Flow: Seed 9 THAI KW → aiClusterize mutation → 6 assertions → cleanup
// Critical assertions (ROOT CAUSE BUG ที่ผู้ใช้เตือน): assigned_keywords == total_input == 9 (0 unassigned)
import { Client } from 'ssh2';
const SSH = { host: '35.231.230.218', port: 22, username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt' };
const TEAM_ID = 90001;
const OWNER_ID = 99001;
const UNASSIGNED_NAME = '📋 ยังไม่ได้จัดกลุ่ม (System)';
const TEST_PREFIX = '[E2E-AIClust9 DeleteMe]';
function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$'); }

const SEED_KW_9 = [
  'สอน ตลาดหลักทรัพย์ มือใหม่',
  'คอร์ส seo ให้ ธุรกิจ ขนาดเล็ก',
  'ร้านกาแฟ สุขุมวิท ราคาถูก ใจกลางเมือง',
  'วิธีขี่จักรยาน เผาผลาญ แคลอรี',
  'ดูดวง เสริมดวง ประจำวัน วันจันทร์',
  'เทคนิค ตีแบดมินตัน สำหรับ มือใหม่',
  'ส่วนผสม แกงเขียวหวาน ใส่กะเพรา',
  'ปลูกผักสลัด บนชานเรือน เมืองที่มีฝนตก',
  'วิธีถ่ายรูป สวยๆ ด้วยมือถือ อินสตาแกรม ครีเอเตอร์'
];

const conn = new Client();
const allSql = [];
allSql.push(`SET @CAT_ID = (SELECT COALESCE(MIN(id), 1) FROM categories);`);
allSql.push(`SET @PROJ_ID = (SELECT COALESCE(MIN(p.id), 0) FROM projects p WHERE p.team_id = ${TEAM_ID} AND p.name NOT LIKE '%DeleteMe%');`);
allSql.push(`SELECT @PROJ_ID AS target_project_id, @CAT_ID AS category_id;`);
allSql.push(`INSERT IGNORE INTO clusters (project_id, name, type, parent_id, created_at) VALUES (@PROJ_ID, "${q(UNASSIGNED_NAME)}", "supporting", NULL, NOW());`);
allSql.push(`SET @MARKER_CID = (SELECT id FROM clusters WHERE project_id = @PROJ_ID AND name = "${q(UNASSIGNED_NAME)}" LIMIT 1);`);
for (const kw of SEED_KW_9) {
  allSql.push(`DELETE FROM keywords WHERE project_id = @PROJ_ID AND keyword_text = "${q(kw)}";`);
  allSql.push(`INSERT INTO keywords (cluster_id, project_id, category_id, keyword_text, tier, search_volume, intent_suggestion, difficulty, is_target, status) VALUES (@MARKER_CID, @PROJ_ID, @CAT_ID, "${q(kw)}", "supporting", ${800+Math.floor(Math.random()*2000)}, "informational", ${20+Math.floor(Math.random()*60)}, 0, "pending");`);
}
allSql.push(`SELECT COUNT(*) AS seed_inserted FROM keywords k WHERE k.project_id = @PROJ_ID AND k.keyword_text IN (${SEED_KW_9.map(k=>`"${q(k)}"`).join(',')});`);
allSql.push(`SET @KW_IDS_RAW = (SELECT GROUP_CONCAT(k.id ORDER BY k.id SEPARATOR ',') FROM keywords k WHERE k.project_id = @PROJ_ID AND k.keyword_text IN (${SEED_KW_9.map(k=>`"${q(k)}"`).join(',')}));`);
allSql.push(`SELECT @KW_IDS_RAW AS keyword_ids_csv;`);

const safeSqls = allSql.map(s => q(s));
const setupCmd = `sudo docker exec eeat-studio-db mariadb -t --default-character-set=utf8mb4 -ueeat -p'eeat_secret_2026_Cloud!' eeat_studio_v2 -e "${safeSqls.join('; ')}" 2>&1 | tail -80`;

let out = '';
conn.on('ready', () => {
  conn.exec(setupCmd, { pty: true }, (err, stream) => {
    if (err) { console.error('SSH setup err', err); process.exit(1); }
    stream.on('data', d => { out += String(d); process.stdout.write(d); });
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', (setupCode) => {
      if (setupCode !== 0) { console.log(`\n❌ SETUP DB EXIT=${setupCode}`); conn.end(); process.exit(1); }
      const lines = out.split('\n');
      const pickCells = (l) => String(l || '').split('|').map(s=>s.trim()).filter(Boolean);
      const cellAfter = (label, preferredColIdx = 0) => {
        let hi = -1, col = preferredColIdx;
        for (let i = 0; i < lines.length; i++) {
          const cells = pickCells(lines[i]);
          const ci = cells.indexOf(label);
          if (ci >= 0) { hi = i; col = preferredColIdx; break; }
        }
        if (hi < 0) return null;
        for (let i = hi + 1; i < Math.min(hi + 10, lines.length); i++) {
          const ln = lines[i];
          if (/^\+-/.test(ln.trim())) continue;
          const cells = pickCells(ln);
          if (cells.length === 0) continue;
          const idx = (col >= 0 && col < cells.length) ? col : (cells.length - 1);
          return cells[idx];
        }
        return null;
      };
      const projStr = cellAfter('target_project_id', 0);
      const projId = parseInt(String(projStr ?? '0').trim(), 10) || 0;
      const kwCsv = String(cellAfter('keyword_ids_csv', 0) ?? '').trim();
      const kwIds = kwCsv.split(',').map(x=>parseInt(x.trim(),10)).filter(Number.isFinite).filter(n=>n>0);
      console.log(`\n==== DB PREP RESULT ====`);
      console.log(`project_id = ${projId}  (raw="${projStr}")`);
      console.log(`keyword_ids = ${kwCsv}  (len=${kwIds.length})`);
      if (kwIds.length < 6 || projId < 1) {
        console.log(`\n❌ PREP FAIL: proj=${projId}, kwCount=${kwIds.length} (<6). ABORT.`);
        tryRunCleanup(conn);
      } else {
        uploadRunnerThenCall(conn, projId, kwIds);
      }
    });
  });
}).on('error', e => { console.error('SSH connect', e); process.exit(1); }).connect(SSH);

function uploadRunnerThenCall(sshConn, projectId, kwIds) {
  const runPath = `/home/ubuntu/eeat-studio-v2`;
  const runnerRel = `tmp/_e2e_aiclust_${Date.now()}.ts`;
  const nodeScriptRaw = `// AUTOGEN E2E AI CLUSTERIZE RUNNER (cwd eeat-studio-v2)
const t1 = Date.now();
let db, eq, and, teamMembers, appRouter;
(async () => {
  try {
    const drz = await import('drizzle-orm');
    eq = drz.eq; and = drz.and;
    const dbMod = await import('../db/index.ts');
    db = dbMod.db;
    const sch = await import('../db/schema.ts');
    teamMembers = sch.teamMembers;
    const appMod = await import('../server/app.ts');
    appRouter = appMod.appRouter;
  } catch (ie) {
    console.log('---JSONSTART---\\n' + JSON.stringify({ ok:false, reason:'IMPORT_FAIL', msg: String(ie?.message ?? ie).slice(0, 1500), stack: String(ie?.stack ?? '').slice(0, 800), elapsed: Date.now()-t1 }) + '\\n---JSONEND---');
    process.exit(5);
  }
  try {
    const owner = await db.select({ userId: teamMembers.userId, teamId: teamMembers.teamId, perm: teamMembers.permission })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, 90001), eq(teamMembers.permission, 'owner')))
      .limit(1);
    if (!owner[0]) { console.log('---JSONSTART---\\n' + JSON.stringify({ok:false,reason:'NO_OWNER', elapsed: Date.now()-t1}) + '\\n---JSONEND---'); process.exit(2); }
    const ctx = {
      user: { id: owner[0].userId, email: 'e2e@test.local', openid: 'e2e_aiclust_smoke', role: 'admin' },
      teamId: owner[0].teamId, db, req: undefined, res: undefined,
      session: {
        openId: owner[0].userId === 99001 ? '102308593207118714314' : 'e2e_aiclust_smoke',
        userId: owner[0].userId, teamId: owner[0].teamId,
        expiresAt: Date.now() + 3600_000, iat: Date.now()
      },
      auth: undefined
    };
    const caller = appRouter.createCaller(ctx);
    const res = await caller.keywords.aiClusterize({
      projectId: ${projectId},
      keywordIds: ${JSON.stringify(kwIds)},
      targetClusters: Math.max(3, Math.round(${kwIds.length} / 2)),
      longtailCount: 2
    });
    console.log('---JSONSTART---\\n' + JSON.stringify({ ...res, elapsed: Date.now()-t1 }) + '\\n---JSONEND---');
    process.exit(0);
  } catch (e) {
    console.log('---JSONSTART---\\n' + JSON.stringify({ ok:false, reason: e?.code || e?.name || 'UNKNOWN', msg: String(e?.message ?? e).slice(0, 1500), stack: String(e?.stack ?? '').slice(0, 900), elapsed: Date.now()-t1 }) + '\\n---JSONEND---');
    process.exit(3);
  }
})().catch(err => {
  console.log('---JSONSTART---\\n' + JSON.stringify({ok:false, reason: 'UNCAUGHT', msg: String(err?.message ?? err).slice(0, 1500), stack: String(err?.stack ?? '').slice(0, 900), elapsed: Date.now()-t1}) + '\\n---JSONEND---');
  process.exit(4);
});
`;
  const b64 = Buffer.from(nodeScriptRaw, 'utf8').toString('base64');
  const mkdirAndWrite = `cd ${runPath} && mkdir -p tmp 2>/dev/null && rm -f tmp/_e2e_aiclust_*.ts 2>/dev/null; echo -n '${b64}' | base64 -d > ${runnerRel} && wc -l ${runnerRel}`;
  sshConn.exec(mkdirAndWrite, (werr, wstream) => {
    if (werr) { console.error('write runner err', werr); tryRunCleanup(sshConn, projectId, 1); process.exit(1); }
    wstream.on('close', (wc) => {
      const execCmd = `cd ${runPath} && ./node_modules/.bin/tsx --no-warnings ${runnerRel} 2>&1 | tail -60 ; echo \"---RUNNER_DONE\" ; rm -f tmp/_e2e_aiclust_*.ts 2>/dev/null`;
      let runOut = '';
      sshConn.exec(execCmd, { pty: true }, (rerr, rstream) => {
        if (rerr) { console.error('exec runner err', rerr); tryRunCleanup(sshConn, projectId, 1); process.exit(1); }
        rstream.on('data', d => { runOut += String(d); process.stdout.write(d); });
        rstream.stderr.on('data', d => process.stderr.write(d));
        rstream.on('close', () => {
          const m = /---JSONSTART---\s*(\{[\s\S]*?\})\s*---JSONEND---/.exec(runOut);
          let json = null;
          if (m && m[1]) { try { json = JSON.parse(m[1]); } catch {} }
          if (!json) {
            const lines = runOut.split('\n').map(l => l.trim()).filter(Boolean);
            for (let i = lines.length - 1; i >= Math.max(0, lines.length - 18); i--) {
              const l = lines[i];
              if (/RUNNER|DONE/.test(l)) continue;
              if (l.startsWith('{')) { try { json = JSON.parse(l); break; } catch {} }
            }
          }
          console.log('\n==== AI CLUSTERIZE 9-KW E2E ASSERTIONS ====');
          const ok = !!(json?.ok);
          const total = Number(json?.total_input_keywords ?? 0);
          const assigned = Number(json?.assigned_keywords ?? 0);
          const unass = Array.isArray(json?.unassigned_keywords_not_in_response) ? json.unassigned_keywords_not_in_response : [];
          const pillar = Number(json?.pillar_count ?? 0);
          const clust = Number(json?.cluster_count ?? 0);
          const supp = Number(json?.supporting_count ?? 0);
          const coerced = Number(json?.coerced_remaining_count ?? 0);
          const kwBatch = kwIds.length; // 9
          const p1 = ok === true;
          const p2 = total === kwBatch;
          const p3 = assigned === kwBatch; // === 9 CRITICAL HARD — BUG fix ที่ผู้ใช้เตือน 9 คำได้ 1
          const p4 = Array.isArray(unass) && unass.length === 0;
          const p5 = pillar >= 1 && (clust + supp) >= 2;
          const p6 = coerced <= Math.max(0, kwBatch - 2); // ใส่เองได้สูงสุด 7 คำ (อย่างน้อย 2 คำ LLM จัดจริง)
          console.log(`[A1] ok=true:              ${p1?'✅':'❌'}  (raw ok=${ok})`);
          console.log(`[A2] total_input=${kwBatch}:  ${p2?'✅':'❌'}  (actual=${total})`);
          console.log(`[A3] assigned=${kwBatch}:     ${p3?'✅':'❌'}  (actual=${assigned})  ← CRITICAL (ต้องได้ 9 ไม่ใช่ 1!)`);
          console.log(`[A4] unassigned=[]:         ${p4?'✅':'❌'}  (len=${unass.length})`);
          console.log(`[A5] tiers pillar≥1 + (cluster+supporting)≥2: ${p5?'✅':'❌'}  (p=${pillar} c=${clust} s=${supp})`);
          console.log(`[A6] coerced ≤ ${Math.max(0, kwBatch-2)}:          ${p6?'✅':'❌'}  (coerced=${coerced})`);
          if (unass.length > 0) console.log(`  → unassigned list = [${unass.join(', ')}]`);
          if (coerced > 0) console.log(`  → ⚠️ POST-GUARD ต้องบังคับใส่เอง ${coerced} คำ (LLM ลืมกล่าวถึง) — แต่ assigned=9 ครบ`);
          const allPass = p1 && p2 && p3 && p4 && p5 && p6;
          console.log(`\n==== FINAL AI-CLUSTER 9-KW E2E: ${allPass?'✅ PASS Exit=0':'❌ FAIL Exit=1'}  (elapsed ${json?.elapsed ?? '-'} ms) ====`);
          tryRunCleanup(sshConn, projectId, allPass ? 0 : 1);
        });
      });
    });
  });
}

function tryRunCleanup(sshConn, projectId = null, finalExitCode = 1) {
  const cleanupSqls = [];
  if (projectId) {
    cleanupSqls.push(`DELETE FROM keywords WHERE project_id = ${projectId} AND keyword_text IN (${SEED_KW_9.map(k=>`"${q(k)}"`).join(',')});`);
    cleanupSqls.push(`DELETE FROM clusters WHERE project_id = ${projectId} AND (name LIKE "%(Auto)%" OR name LIKE "%(Auto Cluster)%" OR name LIKE "%Auto Cluster%" OR name = "${q(UNASSIGNED_NAME)}" AND (SELECT COUNT(*) FROM keywords k WHERE k.cluster_id = clusters.id) = 0);`);
    const markDel = (SEED_KW_9[0] || '').slice(0, 8);
    cleanupSqls.push(`DELETE FROM clusters WHERE project_id = ${projectId} AND (name LIKE "%${q(markDel)}%" OR name LIKE "%DeleteMe%") AND (SELECT COUNT(*) FROM keywords k WHERE k.cluster_id = clusters.id) = 0;`);
    cleanupSqls.push(`DELETE FROM projects WHERE id = ${projectId} AND name LIKE "${q(TEST_PREFIX)}%";`);
  }
  cleanupSqls.push(`SELECT "CLEANUP_DONE" AS _c;`);
  const safe = cleanupSqls.map(s => q(s));
  const cmd = `sudo docker exec eeat-studio-db mariadb -t --default-character-set=utf8mb4 -ueeat -p'eeat_secret_2026_Cloud!' eeat_studio_v2 -e "${safe.join('; ')}" 2>&1 | tail -20`;
  let o = '';
  sshConn.exec(cmd, { pty: true }, (err, stream) => {
    if (err) { console.error('cleanup ssh', err); sshConn.end(); process.exit(finalExitCode); }
    stream.on('data', d => o += String(d));
    stream.on('close', () => {
      console.log('\n[cleanup]\n' + o.split('\n').filter(l => !/^\s*$/.test(l)).slice(-6).join('\n'));
      sshConn.end();
      process.exit(finalExitCode);
    });
  });
}
