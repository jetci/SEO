import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL_FILE = 'd:/AEO/SEO V2/server/services/articleWriterService.ts';
const REMOTE_FILE = '/home/ubuntu/eeat-studio-v2/server/services/articleWriterService.ts';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 20000 };
const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';

async function execLine(ssh, cmd) {
  const r = await ssh.exec(cmd);
  return String(r || '').trim();
}

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/8] SSH connected OK');

    // 1. SFTP fastPut overwrite
    const sftp = ssh.sftp();
    await sftp.fastPut(LOCAL_FILE, REMOTE_FILE, { concurrency: 64, chunkSize: 131072 });
    console.log('[2/8] SFTP fastPut builder file OK');

    // 2. Verify byte size match local vs remote
    const localBytes = fs.statSync(LOCAL_FILE).size;
    const remoteWC = await execLine(ssh, `wc -c < "${REMOTE_FILE}"`);
    const remoteBytes = parseInt(remoteWC || '0', 10);
    console.log(`[3/8] Bytes LOCAL=${localBytes}  REMOTE=${remoteBytes}  MATCH=${localBytes === remoteBytes ? '✅' : '❌ DIFF=' + Math.abs(localBytes - remoteBytes)}`);
    if (localBytes !== remoteBytes) process.exitCode = 1;

    // 3. Verify NEW patterns present on remote file
    const boldHit = await execLine(ssh, `grep -cE '\\*\\*(pkg\\.keyword_text|s\\.heading_text|ทีเด็ดบอล)' "${REMOTE_FILE}" 2>/dev/null || echo 0`);
    const joinHit = await execLine(ssh, `grep -cF "buf.join('\\\\n\\\\n')" "${REMOTE_FILE}" 2>/dev/null || echo 0`);
    console.log(`[4/8] Pattern check: BOLD concat line hits=${boldHit}  buf.join(\\\\n\\\\n) hits=${joinHit}  (want>0 both)`);

    // 4. Clear TSX cache + node_modules cache
    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_cleared');
    console.log('[5/8] TSX + module cache cleared');

    // 5. Re-append demo signin vars (ENV RESET BUG every restart)
    await execLine(ssh, `cd /home/ubuntu/eeat-studio-v2 && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_appended`);
    console.log('[6/8] Demo signin ENV re-appended (always run after restart needed)');

    // 6. PM2 restart ONLY v2 id=107 with --update-env, NEVER touch id=0
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -5');
    await new Promise(r => setTimeout(r, 3500));
    console.log('[7/8] PM2 eeat-studio-v2 id=107 restarted');

    // 7. FOREVER GUARD: verify pm_id=0 pid=175437 STILL ONLINE 8D uptime NEVER KILLED
    const pm2j = await execLine(ssh, 'pm2 jlist');
    let guardOk = false, pid0Val = 'MISSING';
    try {
      const arr = JSON.parse(pm2j);
      const id0 = arr.find(o => o.pm_id === 0);
      if (id0) {
        pid0Val = String(id0.pid);
        guardOk = (pid0Val === '175437') && (id0.pm2_env?.status === 'online');
      }
    } catch (_) {}
    console.log(`[8/8] FOREVER GUARD pm_id=0 pid=175437 → ACTUAL PID=${pid0Val}  SAFE=${guardOk ? '✅' : '❌ FATAL STOP ROLLBACK NOW!'}`);
    if (!guardOk) { process.exitCode = 99; }

    // 8. Health check phase=2 routers 11
    const health = await execLine(ssh, `sleep 1 && curl -sS -m 10 http://127.0.0.1:3002/api/health 2>/dev/null`);
    const phaseOk = health.includes('"phase":2') || health.includes('phase:2');
    const routersMatch = (health.match(/routers/g) || []).length >= 1;
    console.log(`HEALTH phase=2=${phaseOk ? '✅' : '❌'}  routersPresent=${routersMatch ? '✅' : '❌'}\nRAW=${health.slice(0, 380)}`);
    if (!phaseOk) process.exitCode = 2;

  } catch (err) {
    console.error('SYNC FAILED:', err.message || String(err).slice(0, 500));
    process.exitCode = 3;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}

main();
