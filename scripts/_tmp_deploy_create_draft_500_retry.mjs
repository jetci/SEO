import ssh2 from 'ssh2-promise';
import fs from 'node:fs';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 25000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const FILES = [
  { local: 'd:/AEO/SEO V2/server/services/articleWriterService.ts', remote: `${REMOTE_ROOT}/server/services/articleWriterService.ts` },
];
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/7] SSH connected');
    const sftp = ssh.sftp();

    let allBytesMatch = true;
    for (const f of FILES) {
      await sftp.fastPut(f.local, f.remote, { concurrency: 64, chunkSize: 131072 });
      const localBytes = fs.statSync(f.local).size;
      const remoteWC = await execLine(ssh, `wc -c < "${f.remote}"`);
      const remoteBytes = parseInt(remoteWC || '0', 10);
      const ok = localBytes === remoteBytes;
      if (!ok) allBytesMatch = false;
      console.log(`[2/7] ${f.local.split('/').slice(-1)[0]}: LOCAL=${localBytes} REMOTE=${remoteBytes} MATCH=${ok ? '✅' : '❌ DIFF=' + Math.abs(localBytes - remoteBytes)}`);
    }
    if (!allBytesMatch) process.exitCode = 1;

    // Validate patches present
    const hRetry = parseInt(await execLine(ssh, `grep -c "MAX_ATTEMPTS = 3" "${FILES[0].remote}" 2>/dev/null || echo 0`) + '', 10);
    const hWarn = parseInt(await execLine(ssh, `grep -c "Section LLM retries ALL" "${FILES[0].remote}" 2>/dev/null || echo 0`) + '', 10);
    console.log(`[3/7] Section LLM Retry patches: MAX_ATTEMPTS=3 hits=${hRetry}  exhausted warn hits=${hWarn} → ${hRetry>=1&&hWarn>=1?'✅ PRESENT':'❌ MISSING'}`);

    // clear cache
    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_cleared');
    console.log('[4/7] TSX + module cache cleared');

    // Re-append demo signin ENV (always after restart)
    const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
    await execLine(ssh, `cd ${REMOTE_ROOT} && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_done`);
    console.log('[5/7] Demo signin ENV vars re-appended (always after restart)');

    // PM2 restart V2
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 4500));
    console.log('[6/7] PM2 eeat-studio-v2 restarted');

    const jl = await execLine(ssh, 'pm2 jlist');
    let guard = false, pid0 = 'MISSING';
    try {
      const arr = JSON.parse(jl);
      const x = arr.find(o => o.pm_id === 0);
      if (x) { pid0 = String(x.pid); guard = (pid0 === '1287') && (x.pm2_env?.status === 'online'); }
    } catch (_) {}
    console.log(`[6/7 FOREVER GUARD] pm_id=0 pid=1287 → ACTUAL=${pid0}  SAFE=${guard ? '✅ V1 UNTOUCHED' : '❌ FATAL ROLLBACK NOW!'}`);
    if (!guard) process.exitCode = 99;

    const health = await execLine(ssh, 'curl -sS -m 10 http://127.0.0.1:3002/api/health 2>/dev/null');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    const routersArr = health.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || [];
    const countRouters = routersArr.length;
    console.log(`[7/7] Health phase=2:${p2?'✅':'❌'} ok:true=${rOK?'✅':'❌'} routers=${countRouters}/11 → ${p2&&rOK&&countRouters===11?'✅ FULL HEALTH':'❌ DEGRADED'}  RAW=${health.slice(0, 260)}`);
    if (!p2 || !rOK || countRouters !== 11) process.exitCode = (process.exitCode || 4);
  } catch (err) {
    console.error('FAILED:', (err.message || String(err)).slice(0, 800));
    process.exitCode = 5;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}
main();
