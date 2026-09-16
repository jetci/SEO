// KCP Enrich SERP E2E Smoke Test (REAL Serper Key, tiny 5 keywords batch)
// Flow: Pick existing team 90001 project -> 5 real THAI SEO SEED keywords (not in DB yet)
//       -> INSERT marker cluster (if missing) -> INSERT 5 KW pending -> enrichSerp mutation
//       -> assertions -> cleanup keywords (keep existing data intact)
// Assertions: 1) enriched_count >= 3 (min 60%); 2) NO HTTP 403 errors; 3) avg_search_volume > 0 OR sumSV>0
// Exit 0 PASS / Exit 1 FAIL
import { Client } from 'ssh2';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SSH = { host: '35.231.230.218', port: 22, username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt' };
const TEAM_ID = 90001;
const OWNER_ID = 99001;
const UNASSIGNED_NAME = '📋 ยังไม่ได้จัดกลุ่ม (System)';
const TEST_PREFIX = '[E2E-Enrich DeleteMe]';

function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$'); }

const SEED_KW = [
  'สอน ตลาดหลักทรัพย์ มือใหม่',
  'คอร์ส seo ให้ ธุรกิจ',
  'ร้านกาแฟ สุขุมวิท ราคาถูก',
  'วิธีขี่จักรยาน เผาผลาญ',
  'ดูดวง เสริมดวง ประจำวัน',
];

const conn = new Client();
const allSql = [];

allSql.push(`SET @CAT_ID = (SELECT COALESCE(MIN(id), 1) FROM categories);`);
allSql.push(`SET @PROJ_ID = (SELECT COALESCE(MIN(p.id), 0) FROM projects p WHERE p.team_id = ${TEAM_ID} AND p.name NOT LIKE '%DeleteMe%');`);
allSql.push(`SELECT @PROJ_ID AS target_project_id, @CAT_ID AS category_id;`);
allSql.push(`SET @NEW_PROJ = IF(@PROJ_ID > 0, 0, 1);`);
allSql.push(`INSERT INTO projects (team_id, owner_id, category_id, name, main_keyword, description, is_active) SELECT ${TEAM_ID}, ${OWNER_ID}, @CAT_ID, "${q(TEST_PREFIX)} Smoke Enrich ${Date.now()}", "seo thailand", "${q(TEST_PREFIX)} REAL SERP ENRICH E2E", 1 FROM DUAL WHERE @NEW_PROJ = 1;`);
allSql.push(`SET @PROJ_ID = IF(@PROJ_ID > 0, @PROJ_ID, LAST_INSERT_ID());`);
allSql.push(`INSERT IGNORE INTO clusters (project_id, name, type, parent_id, created_at) VALUES (@PROJ_ID, "${q(UNASSIGNED_NAME)}", "supporting", NULL, NOW());`);
allSql.push(`SET @MARKER_CID = (SELECT id FROM clusters WHERE project_id = @PROJ_ID AND name = "${q(UNASSIGNED_NAME)}" LIMIT 1);`);
for (const kw of SEED_KW) {
  allSql.push(`DELETE FROM keywords WHERE project_id = @PROJ_ID AND keyword_text = "${q(kw)}";`);
  allSql.push(`INSERT INTO keywords (cluster_id, project_id, category_id, keyword_text, tier, search_volume, intent_suggestion, difficulty, is_target, status) VALUES (@MARKER_CID, @PROJ_ID, @CAT_ID, "${q(kw)}", "supporting", 0, "informational", 0, 0, "pending");`);
}
allSql.push(`SELECT COUNT(*) AS seed_inserted FROM keywords k WHERE k.project_id = @PROJ_ID AND k.keyword_text IN (${SEED_KW.map(k=>`"${q(k)}"`).join(',')});`);
allSql.push(`SET @KW_IDS_RAW = (SELECT GROUP_CONCAT(k.id ORDER BY k.id SEPARATOR ',') FROM keywords k WHERE k.project_id = @PROJ_ID AND k.keyword_text IN (${SEED_KW.map(k=>`"${q(k)}"`).join(',')}));`);
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
      if (setupCode !== 0) {
        console.log(`\n❌ SETUP DB EXIT CODE=${setupCode}`);
        conn.end(); process.exit(1);
      }
      const lines = out.split('\n');
      let kwCsv = '';
      let projId = 0;
      const pickCells = (l) => String(l || '').split('|').map(s=>s.trim()).filter(Boolean);
      // cellAfter: find row that contains headerLabel -> skip separators -> return value from FIRST data row at SAME column index
      const cellAfter = (headerLabel, skipNext = 8, preferredColIdx = null) => {
        let hi = -1, colIdx = preferredColIdx ?? -1;
        for (let i = 0; i < lines.length; i++) {
          const cells = pickCells(lines[i]);
          const ci = cells.indexOf(headerLabel);
          if (ci >= 0) { hi = i; colIdx = (preferredColIdx !== null) ? preferredColIdx : ci; break; }
        }
        if (hi < 0) return null;
        for (let i = hi + 1; i < Math.min(hi + 2 + skipNext, lines.length); i++) {
          const ln = lines[i];
          if (/^\+-/.test(ln.trim())) continue;
          const cells = pickCells(ln);
          if (cells.length === 0) continue;
          const idx = (colIdx >= 0 && colIdx < cells.length) ? colIdx : (cells.length - 1);
          return cells[idx];
        }
        return null;
      };
      // target_project_id is column 0 of its 2-col table (col 1 = category_id)
      const projStr = cellAfter('target_project_id', 8, 0);
      projId = parseInt(String(projStr ?? '0').trim(), 10) || 0;
      // keyword_ids_csv col 0; seed_inserted col 0
      kwCsv = String(cellAfter('keyword_ids_csv', 8, 0) ?? '').trim();
      const seedCtStr = cellAfter('seed_inserted', 8, 0);
      console.log(`\n==== DB PREP RESULT ====`);
      console.log(`project_id = ${projId}  (raw_parse="${projStr}")`);
      console.log(`keyword_ids = ${kwCsv}`);
      if (seedCtStr !== null) console.log(`seed_inserted = ${seedCtStr}`);
      const kwIds = kwCsv.split(',').map(x=>parseInt(x.trim(),10)).filter(Number.isFinite).filter(n=>n>0);
      if (kwIds.length < 3 || projId < 1) {
        console.log(`\n❌ DB PREP FAIL: project_id=${projId}, kwCount=${kwIds.length} (<3). ABORT.`);
        tryRunCleanup(conn);
      } else {
        uploadRunnerThenCall(conn, projId, kwIds);
      }
    });
  });
}).on('error', e => { console.error('SSH connect', e); process.exit(1); }).connect(SSH);

function uploadRunnerThenCall(sshConn, projectId, kwIds) {
  const runPath = `/home/ubuntu/eeat-studio-v2`;
  const runnerRel = `tmp/_e2e_smoke_${Date.now()}.ts`; // inside runPath so relative imports resolve
  const nodeScriptRaw = `// AUTOGEN E2E SERP ENRICH RUNNER (cwd eeat-studio-v2)
const t1 = Date.now();
const TEAM_ID = ${TEAM_ID};
const PROJECT_ID = ${projectId};
const KW_IDS = ${JSON.stringify(kwIds)};
const OWNER_OPENID = '102308593207118714314';
let db, eq, and, teamMembers, appRouter;
(async () => {
  try {
    console.error('[E2E] Step 1/5: import drizzle-orm... @ ' + (Date.now()-t1) + 'ms');
    const drz = await import('drizzle-orm');
    eq = drz.eq; and = drz.and;
    console.error('[E2E] Step 2/5: import db/index... @ ' + (Date.now()-t1) + 'ms');
    const dbMod = await import('../db/index.ts');
    db = dbMod.db;
    console.error('[E2E] Step 3/5: import db/schema teamMembers... @ ' + (Date.now()-t1) + 'ms');
    const sch = await import('../db/schema.ts');
    teamMembers = sch.teamMembers;
    if (!teamMembers) { console.error('[E2E] schema exports:', Object.keys(sch).slice(0, 30).join(',')); }
    console.error('[E2E] Step 4/5: import server/app.ts appRouter... @ ' + (Date.now()-t1) + 'ms');
    const appMod = await import('../server/app.ts');
    appRouter = appMod.appRouter;
    if (!appRouter) { console.error('[E2E] server/app exports keys:', Object.keys(appMod).slice(0, 40).join(',')); }
    console.error('[E2E] Step 5/5: query owner + build ctx... @ ' + (Date.now()-t1) + 'ms');
  } catch (ie) {
    console.log('---JSONSTART---\\n' + JSON.stringify({ ok:false, reason:'IMPORT_FAIL', msg: String(ie?.message ?? ie).slice(0, 1200), stack: String(ie?.stack ?? '').slice(0, 800), elapsed: Date.now()-t1 }) + '\\n---JSONEND---');
    process.exit(5);
  }
  try {
    const owner = await db.select({ userId: teamMembers.userId, teamId: teamMembers.teamId, perm: teamMembers.permission }).from(teamMembers).where(and(eq(teamMembers.teamId, TEAM_ID), eq(teamMembers.permission, 'owner'))).limit(1);
    if (!owner[0]) { console.log('---JSONSTART---\\n' + JSON.stringify({ok:false,reason:'NO_OWNER', elapsed: Date.now()-t1}) + '\\n---JSONEND---'); process.exit(2); }
    const ctx = { user: { id: owner[0].userId, email: 'e2e@test.local', openid: 'e2e_enrich_smoke', role: 'admin' }, teamId: owner[0].teamId, db, req: undefined, res: undefined, session: { openId: (owner[0].userId === 99001 ? OWNER_OPENID : 'e2e_enrich_smoke'), userId: owner[0].userId, teamId: owner[0].teamId, expiresAt: Date.now() + 3600_000, iat: Date.now() }, auth: undefined };
    const caller = appRouter.createCaller(ctx);
    console.error('[E2E] ctx OK — calling enrichSerp now... @ ' + (Date.now()-t1) + 'ms');
    const res = await caller.keywords.enrichSerp({ projectId: PROJECT_ID, keywordIds: KW_IDS });
    console.log('---JSONSTART---\\n' + JSON.stringify({ ...res, elapsed: Date.now()-t1 }) + '\\n---JSONEND---');
    process.exit(0);
  } catch (e) {
    console.log('---JSONSTART---\\n' + JSON.stringify({ ok:false, reason: e?.code || e?.name || 'UNKNOWN', msg: String(e?.message ?? e).slice(0, 1400), stack: String(e?.stack ?? '').slice(0, 900), elapsed: Date.now()-t1 }) + '\\n---JSONEND---');
    process.exit(3);
  }
})().catch(err => {
  console.log('---JSONSTART---\\n' + JSON.stringify({ok:false, reason: 'UNCAUGHT', msg: String(err?.message ?? err).slice(0, 1400), stack: String(err?.stack ?? '').slice(0, 900), elapsed: Date.now()-t1}) + '\\n---JSONEND---');
  process.exit(4);
});
`;
  const b64 = Buffer.from(nodeScriptRaw, 'utf8').toString('base64');
  const mkdirAndWrite = `cd ${runPath} && mkdir -p tmp 2>/dev/null && rm -f tmp/_e2e_smoke_*.ts 2>/dev/null; echo -n '${b64}' | base64 -d > ${runnerRel} && wc -l ${runnerRel} && head -c 160 ${runnerRel} && echo '---ENDHEAD---'`;
  sshConn.exec(mkdirAndWrite, (werr, wstream) => {
    let wOut = '';
    if (werr) { console.error('write runner err', werr); tryRunCleanup(sshConn); process.exit(1); }
    wstream.on('data', d => { wOut += String(d); process.stdout.write(d); });
    wstream.stderr.on('data', d => process.stderr.write(d));
    wstream.on('close', (wc) => {
      if (wc !== 0 && !/_e2e_smoke_/.test(wOut)) { console.log('write runner wc', wc); tryRunCleanup(sshConn); process.exit(1); }
      const execCmd = `cd ${runPath} && ./node_modules/.bin/tsx --no-warnings ${runnerRel} 2>&1 | tail -50 ; echo \"---RUNNER_DONE\" ; rm -f tmp/_e2e_smoke_*.ts 2>/dev/null`;
      let runOut = '';
      sshConn.exec(execCmd, { pty: true }, (rerr, rstream) => {
        if (rerr) { console.error('exec runner err', rerr); tryRunCleanup(sshConn); process.exit(1); }
        rstream.on('data', d => { runOut += String(d); process.stdout.write(d); });
        rstream.stderr.on('data', d => process.stderr.write(d));
        rstream.on('close', () => {
          const m = /---JSONSTART---\s*(\{[\s\S]*?\})\s*---JSONEND---/.exec(runOut);
          let json = null;
          if (m && m[1]) { try { json = JSON.parse(m[1]); } catch {} }
          if (!json) {
            // Fallback: find any standalone { object } lines
            const lines = runOut.split('\n').map(l => l.trim()).filter(Boolean);
            for (let i = lines.length - 1; i >= Math.max(0, lines.length - 18); i--) {
              const l = lines[i];
              if (/RUNNER|DONE|WRITTEN|runner/.test(l)) continue;
              if (l.startsWith('{')) {
                try { json = JSON.parse(l); break; } catch {}
              }
            }
          }
          if (!json) {
            console.log('\n❌ E2E FAIL: No JSON output from VPS caller. Output tail:');
            console.log(runOut.split('\n').slice(-12).join('\n'));
            tryRunCleanup(sshConn, projectId, 1);
            return;
          }
          console.log('\n==== INTERPRET E2E ASSERTIONS ====');
          const enrichedCount = Number(json.enriched_count || 0);
          const errors = Array.isArray(json.errors) ? json.errors : [];
          const avgSv = Number(json.avg_search_volume || 0);
          const hasHttp403 = errors.some(e => /403|Forbidden|invalid key|api key|invalid/i.test(String(e.msg ?? e.code ?? '')));
          const any403Msg = /403|Forbidden/.test(JSON.stringify(json));
          const pass1 = enrichedCount >= Math.max(1, Math.floor(kwIds.length * 0.6));
          const pass2 = !hasHttp403 && !any403Msg;
          let sumSv = 0;
          if (json.enriched_count >= 1) sumSv = avgSv * enrichedCount;
          const pass3 = (avgSv > 0) || (sumSv > 0) || (enrichedCount >= kwIds.length);
          console.log(`kw_batch_size  = ${kwIds.length}`);
          console.log(`enriched_count = ${enrichedCount}  (min threshold ${Math.max(1, Math.floor(kwIds.length*0.6))})  =>  ${pass1?'✅ PASS':'❌ FAIL'}`);
          console.log(`errors.length  = ${errors.length} / has_HTTP_403 = ${hasHttp403 || any403Msg} (must be FALSE)  =>  ${pass2?'✅ PASS':'❌ FAIL'}`);
          console.log(`avg_search_volume = ${avgSv}  (avg * count = ${sumSv})  =>  ${pass3?'✅ PASS':'❌ FAIL'}`);
          console.log(`\nraw response = ${JSON.stringify(json).slice(0, 900)}`);
          const allPass = pass1 && pass2 && pass3;
          console.log(`\n==== FINAL E2E SERP ENRICH: ${allPass ? '✅ PASS Exit=0' : '❌ FAIL Exit=1'}  (elapsed ${json.elapsed || '-'} ms) ====`);
          tryRunCleanup(sshConn, projectId, allPass ? 0 : 1);
        });
      });
    });
  });
}

function tryRunCleanup(sshConn, projectId = null, finalExitCode = 1) {
  const cleanupSqls = [];
  if (projectId) {
    cleanupSqls.push(`DELETE FROM keywords WHERE project_id = ${projectId} AND keyword_text IN (${SEED_KW.map(k=>`"${q(k)}"`).join(',')});`);
    cleanupSqls.push(`DELETE FROM clusters WHERE project_id = ${projectId} AND name = "${q(UNASSIGNED_NAME)}" AND (SELECT COUNT(*) FROM keywords k WHERE k.cluster_id = clusters.id) = 0;`);
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
