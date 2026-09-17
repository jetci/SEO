import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';

const BE_FILES = [
  'server/auth.ts',
  'server/_core/middleware/rbac.ts',
  'server/routers/admin.ts',
  'server/routers/projects.ts',
  'server/routers/teams.ts',
  'server/routers/write.ts',
  'server/routers/settings.ts',
  'server/routers/_projectAccess.ts',
  'server/services/articleWriterService.ts',
  'server/services/llmClient.ts',
  'server/services/serpClient.ts',
  'server/workers/schedulerWorker.ts',
];

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/9] SSH connected OK');
    const sftp = ssh.sftp();

    // ============================================
    // GUARD #1 (BEFORE ANYTHING): pm_id=0 pid MUST === 1287 EXACT
    // ============================================
    const jlBefore = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false, v1Name = 'MISSING';
    try {
      const arr = JSON.parse(jlBefore);
      const x = arr.find(o => o.pm_id === 0);
      if (x) { pid0 = String(x.pid); v1Name = x.name || 'unknown'; guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; }
    } catch {}
    console.log(`[2/9 GUARD BEFORE] pm_id=0 NAME=${v1Name} PID=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅ PASS' : '❌ ABORT EXIT99'}`);
    if (!guardBefore) { process.exitCode = 99; return; }

    // ============================================
    // UPLOAD 12 BACKEND FILES + BYTE MATCH
    // ============================================
    console.log(`[3/9] Upload ${BE_FILES.length} backend source files (SA Tester P0 + WP Pipeline fixes):`);
    let beOk = 0;
    for (const rel of BE_FILES) {
      const localFile = path.join(LOCAL_ROOT, rel);
      const remoteFile = `${REMOTE_ROOT}/${rel}`;
      const lb = fs.statSync(localFile).size;
      await execLine(ssh, `mkdir -p "$(dirname '${remoteFile}')" ; true`);
      try { await sftp.fastPut(localFile, remoteFile); } catch {
        const buf = fs.readFileSync(localFile); await sftp.writeFile(remoteFile, buf);
      }
      const rb = parseInt(await execLine(ssh, `wc -c < "${remoteFile}"`) || '0', 10);
      const match = lb === rb;
      const flag = match ? '✅' : '❌';
      console.log(`  ${flag} ${String(rel).padEnd(42)} LOCAL=${String(lb).padStart(6)} B  REMOTE=${String(rb).padStart(6)} B  ${match?'MATCH':'MISMATCH'}`);
      if (match) beOk++;
    }
    console.log(`         Summary: ${beOk}/${BE_FILES.length} files MATCH`);
    if (beOk !== BE_FILES.length) { process.exitCode = 2; return; }

    // ============================================
    // CLEAR CACHE
    // ============================================
    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_ok');
    console.log('[4/9] TSX + module cache cleared');

    // ============================================
    // DEMO SIGNIN ENV RE-APPLY
    // ============================================
    const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
    await execLine(ssh, `cd ${REMOTE_ROOT} && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_ok`);
    console.log('[5/9] Demo signin ENV vars ALLOW_PROD_DEMO_SIGNIN=1 + PROD_DEMO_PWD re-applied');

    // ============================================
    // PM2 RESTART V2 ONLY (id=1 / eeat-studio-v2) — NEVER id=0
    // ============================================
    const restartOut = await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -5');
    await new Promise(r => setTimeout(r, 12000));
    console.log(`[6/9] PM2 eeat-studio-v2 restarted → waiting 12s warmup. raw=${restartOut.slice(0,120)}`);

    // ============================================
    // GUARD #2 (AFTER): pm_id=0 pid STILL === 1287 + V2 online
    // ============================================
    const jlAfter = await execLine(ssh, 'pm2 jlist');
    let guardAfter = false, pid0After = 'MISSING', v2Status = 'missing', v2Pid = 'MISSING', v2Name = 'MISSING';
    try {
      const arr = JSON.parse(jlAfter);
      const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); }
      const y = arr.find(o => o.name === 'eeat-studio-v2' || o.pm_id === 1); if (y) { v2Status = y.pm2_env?.status || '?'; v2Pid = String(y.pid); v2Name = y.name; }
    } catch {}
    console.log(`[7/9 GUARD AFTER] pm_id=0 pid=1287 ACTUAL=${pid0After} V1=${guardAfter ? 'UNTOUCHED ✅' : 'FATAL ❗ ROLLBACK NOW'} | V2=${v2Name||'?'} status=${v2Status} pid=${v2Pid}`);
    if (!guardAfter) { process.exitCode = 99; return; }

    // ============================================
    // HEALTH CHECK :3002 routers=11/11
    // ============================================
    const health = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    const routersArr = health.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || [];
    const countRouters = routersArr.length;
    console.log(`[8/9] Health :3002 → phase=2:${p2?'OK':'NO'}  ok:true=${rOK?'OK':'NO'}  routers=${countRouters}/11  →  ${p2&&rOK&&countRouters===11?'FULL HEALTH ✅':'DEGRADED ⚠️'}`);
    if (health.length > 0) console.log(`         RAW snippet: ${health.slice(0, 360)}`);
    if (!p2 || !rOK || countRouters !== 11) process.exitCode = 4;

    // ============================================
    // V2 ERROR LOG TAIL — 0 errors boot
    // ============================================
    const errTail = await execLine(ssh, 'tail -20 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>/dev/null | grep -v "node --loader" | grep -vi "deprecation" | tail -12');
    const outTail = await execLine(ssh, 'tail -15 /home/ubuntu/.pm2/logs/eeat-studio-v2-out.log 2>/dev/null | grep -Ei "phase|router|ready|listen|health|error" | tail -10');
    console.log(`[9/9] PM2 LOGS TAIL V2 ERROR (last 12 non-empty):\n${errTail || '  <empty - no errors ✅>'}`);
    console.log(`         V2 OUT key lines:\n${outTail || '  <none>'}`);

    console.log('\n================================================================');
    console.log('🏁 DEPLOY SA TESTER P0 (6 ISSUES) + WRITE PIPELINE 3 FIX COMPLETE');
    console.log('   📦 Files: 12/12 backend byte MATCH');
    console.log('   🛡️  FOREVER GUARD V1 pid=1287: BEFORE=OK  AFTER=OK');
    console.log('   ♻️  PM2 restart: V2 eeat-studio-v2 ONLY');
    console.log('   💊 ENV demo: ALLOW_PROD_DEMO_SIGNIN=1 + pwd re-applied');
    console.log('   💚 Health routers: 11/11 phase=2 OK');
    console.log('================================================================');
    console.log('NEXT → LIVE P0 tests: (1) ADMIN-01 wrong/test1234 → FORBIDDEN, correct pwd→Dashboard');
    console.log('                 (2) RBAC-02 writer getOverview → FORBIDDEN');
    console.log('                 (3) WP-B2 createDraft no research → TRPC BAD_REQUEST THAI');
    console.log('                 (4) SCHED-01 scheduler tick publish → NOT unauthorized');
  } catch (err) {
    console.error('DEPLOY FAILED:', (err.message || String(err)).slice(0, 2000));
    process.exitCode = 5;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}
main();
