import ssh2 from 'ssh2-promise';
import fs from 'node:fs';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 25000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const FILES = [
  { local: 'd:/AEO/SEO V2/server/routers/clusters.ts', remote: `${REMOTE_ROOT}/server/routers/clusters.ts` },
  { local: 'd:/AEO/SEO V2/server/routers/keywords.ts', remote: `${REMOTE_ROOT}/server/routers/keywords.ts` },
];

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/8] SSH connected OK');
    const sftp = ssh.sftp();

    let allBytesMatch = true;
    for (const f of FILES) {
      await sftp.fastPut(f.local, f.remote, { concurrency: 64, chunkSize: 131072 });
      const localBytes = fs.statSync(f.local).size;
      const remoteWC = await execLine(ssh, `wc -c < "${f.remote}"`);
      const remoteBytes = parseInt(remoteWC || '0', 10);
      const ok = localBytes === remoteBytes;
      if (!ok) allBytesMatch = false;
      console.log(`[2/8] ${f.local.split('/').slice(-1)[0]}: LOCAL=${localBytes} REMOTE=${remoteBytes} MATCH=${ok ? '✅' : '❌ DIFF=' + Math.abs(localBytes - remoteBytes)}`);
    }
    if (!allBytesMatch) process.exitCode = 1;

    // Validate patches present on remote
    const hMarker = parseInt(await execLine(ssh, `grep -c "isUnassignedMarker" "${REMOTE_ROOT}/server/routers/clusters.ts" 2>/dev/null || echo 0`), 10);
    const hPreserve = parseInt(await execLine(ssh, `grep -c "Preserve original keyword.tier" "${REMOTE_ROOT}/server/routers/clusters.ts" 2>/dev/null || echo 0`) + '', 10);
    const hPreserveKws = parseInt(await execLine(ssh, `grep -c "Preserve keyword.tier on AI re-cluster" "${REMOTE_ROOT}/server/routers/keywords.ts" 2>/dev/null || echo 0`) + '', 10);
    console.log(`[3/8] AUDIT KCP patches remote: isUnassignedMarker=${hMarker}  delete preserve tier=${hPreserve}  aiClusterize reset preserve tier=${hPreserveKws} → ${hMarker>=1&&hPreserve>=1&&hPreserveKws>=1?'✅ ALL PRESENT':'❌ MISSING'}`);

    // Clear cache
    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_cleared');
    console.log('[4/8] TSX + module cache cleared');

    // Re-append demo signin vars (ENV RESET every restart bug)
    const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
    await execLine(ssh, `cd ${REMOTE_ROOT} && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_done`);
    console.log('[5/8] Demo signin ENV vars re-appended (always after restart)');

    // PM2 restart ONLY v2
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 4500));
    console.log('[6/8] PM2 eeat-studio-v2 restarted');

    // FOREVER GUARD pid0=1287 V1 UNTOUCHED
    const jl = await execLine(ssh, 'pm2 jlist');
    let guard = false, pid0 = 'MISSING';
    try {
      const arr = JSON.parse(jl);
      const x = arr.find(o => o.pm_id === 0);
      if (x) { pid0 = String(x.pid); guard = (pid0 === '1287') && (x.pm2_env?.status === 'online'); }
    } catch (_) {}
    console.log(`[7/8] FOREVER GUARD pm_id=0 pid=1287 → ACTUAL=${pid0}  SAFE=${guard ? '✅' : '❌ FATAL ROLLBACK NOW!'}`);
    if (!guard) process.exitCode = 99;

    // Health
    const health = await execLine(ssh, 'curl -sS -m 10 http://127.0.0.1:3002/api/health 2>/dev/null');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    const routersArr = health.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || [];
    const countRouters = routersArr.length;
    console.log(`[8/8] Health phase=2:${p2?'✅':'❌'} ok:true=${rOK?'✅':'❌'} routers=${countRouters}/11 → ${p2&&rOK&&countRouters===11?'✅ FULL HEALTH':'❌ DEGRADED'}  RAW=${health.slice(0,300)}`);
    if (!p2 || !rOK || countRouters !== 11) process.exitCode = (process.exitCode || 4);
  } catch (err) {
    console.error('DEPLOY FAILED:', (err.message || String(err)).slice(0, 800));
    process.exitCode = 5;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}
main();
