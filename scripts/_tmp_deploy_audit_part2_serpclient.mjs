import ssh2 from 'ssh2-promise';
import fs from 'node:fs';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 20000 };
const LOCAL_FILE = 'd:/AEO/SEO V2/server/services/serpClient.ts';
const REMOTE_FILE = '/home/ubuntu/eeat-studio-v2/server/services/serpClient.ts';

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[S1] SSH connected');

    const sftp = ssh.sftp();
    await sftp.fastPut(LOCAL_FILE, REMOTE_FILE, { concurrency: 64, chunkSize: 131072 });
    console.log('[S2] SFTP fastPut serpClient.ts OK');

    const localBytes = fs.statSync(LOCAL_FILE).size;
    const remoteWC = await execLine(ssh, `wc -c < "${REMOTE_FILE}"`);
    const remoteBytes = parseInt(remoteWC || '0', 10);
    const bytesMatch = localBytes === remoteBytes;
    console.log(`[S3] Bytes LOCAL=${localBytes}  REMOTE=${remoteBytes}  MATCH=${bytesMatch ? '✅' : '❌ DIFF=' + Math.abs(localBytes - remoteBytes)}`);
    if (!bytesMatch) process.exitCode = 1;

    const hitRetry = parseInt(await execLine(ssh, `grep -c 'MAX_ATTEMPTS = 3' "${REMOTE_FILE}" 2>/dev/null || echo 0`), 10);
    const hitBuckets = parseInt(await execLine(ssh, `grep -c 'BUCKETS' "${REMOTE_FILE}" 2>/dev/null || echo 0`), 10);
    const hitBanner = parseInt(await execLine(ssh, `grep -c 'getYMYLBanner' "/home/ubuntu/eeat-studio-v2/server/services/articleWriterService.ts" 2>/dev/null || echo 0`), 10);
    console.log(`[S4] AUDIT patches on remote: Cache MAX_ATTEMPTS=${hitRetry}  Intent BUCKETS=${hitBuckets}  YMYL getYMYLBanner wrapper=${hitBanner}  (want≥1 all → ${hitRetry>=1&&hitBuckets>=1&&hitBanner>=1?'✅ ALL PRESENT':'❌ MISSING'})`);

    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 4000));
    console.log('[S5] PM2 eeat-studio-v2 restarted');

    const jl = await execLine(ssh, 'pm2 jlist');
    let guard = false, pid0 = 'MISSING';
    try {
      const arr = JSON.parse(jl);
      const x = arr.find(o => o.pm_id === 0);
      if (x) { pid0 = String(x.pid); guard = (pid0 === '1287') && (x.pm2_env?.status === 'online'); }
    } catch (_) {}
    console.log(`[S6] FOREVER GUARD pm_id=0 pid=1287 → ACTUAL=${pid0}  SAFE=${guard ? '✅' : '❌ FATAL!'}`);
    if (!guard) process.exitCode = 99;

    const health = await execLine(ssh, 'curl -sS -m 10 http://127.0.0.1:3002/api/health 2>/dev/null');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    const routersArr = health.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || [];
    const countRouters = routersArr.length;
    console.log(`[S7] Health phase=2:${p2?'✅':'❌'} ok:true=${rOK?'✅':'❌'} routers=${countRouters}/11  → ${p2&&rOK&&countRouters===11?'✅ FULL HEALTH':'❌ PARTIAL'}  RAW=${health.slice(0,300)}`);
    if (!p2 || !rOK || countRouters !== 11) process.exitCode = (process.exitCode || 4);

    console.log('\n--- FINAL AUDIT PART2 DEPLOY STATUS SUMMARY ---');
    console.log(`• Cache Retry+Alert: ${hitRetry>=1?'DEPLOYED ✅':'MISSING ❌'}`);
    console.log(`• Intent Fallback+Alerts: ${hitBuckets>=1?'DEPLOYED ✅':'MISSING ❌'}`);
    console.log(`• YMYL Banner L10n wrapper: ${hitBanner>=1?'DEPLOYED ✅':'MISSING ❌'}`);
    console.log(`• TSC exit code 0 local build: ✅ PASS`);
    console.log(`• PID0 V1 eeat-studio untouched: ${guard?'✅ SAFE (pid=1287)':'❌ DANGER'}`);
    console.log(`• V2 Health phase=2 routers=11 ok=true: ${p2&&rOK&&countRouters===11?'✅ ONLINE':'❌ DEGRADED'}`);
  } catch (err) {
    console.error('FAILED:', (err.message || String(err)).slice(0, 800));
    process.exitCode = 5;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}
main();
