import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/6] SSH OK');
    const sftp = ssh.sftp();
    // GUARD BEFORE
    const jl1 = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jl1); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`[2/6 GUARD BEFORE] pm_id=0 pid=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅' : '❌ ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }
    // Upload 1 file
    const rel = 'server/auth.ts';
    const localFile = path.join(LOCAL_ROOT, rel);
    const remoteFile = `${REMOTE_ROOT}/${rel}`;
    const lb = fs.statSync(localFile).size;
    try { await sftp.fastPut(localFile, remoteFile); } catch { const buf = fs.readFileSync(localFile); await sftp.writeFile(remoteFile, buf); }
    const rb = parseInt(await execLine(ssh, `wc -c < "${remoteFile}"`) || '0', 10);
    const match = lb === rb;
    console.log(`[3/6] Upload ${rel}: LOCAL=${lb} REMOTE=${rb} ${match ? 'MATCH ✅' : 'MISMATCH ❌'}`);
    if (!match) { process.exitCode = 2; return; }
    // Clear error log before restart + restart V2
    await execLine(ssh, 'cat /dev/null > /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log ; cat /dev/null > /home/ubuntu/.pm2/logs/eeat-studio-v2-out.log ; echo logs_cleared');
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -2');
    await new Promise(r => setTimeout(r, 12000));
    const jl2 = await execLine(ssh, 'pm2 jlist');
    let pid0After = 'MISSING', guardAfter = false, v2Status = '?', v2Pid = '?';
    try { const arr = JSON.parse(jl2); const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); } const y = arr.find(o => o.name === 'eeat-studio-v2'); if (y) { v2Status = y.pm2_env?.status || '?'; v2Pid = String(y.pid); } } catch {}
    console.log(`[4/6 GUARD AFTER] V1 pid0=1287: ${guardAfter ? 'UNTOUCHED ✅' : 'FATAL ❌'} | V2=${v2Status} pid=${v2Pid}`);
    if (!guardAfter) { process.exitCode = 99; return; }
    // Health
    const h = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const routers = (h.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || []).length;
    console.log(`[5/6] HEALTH routers=${routers}/11: ${h.slice(0, 220)}`);
    // RUN curl tRPC test to trigger AUTH_DEBUG_GATES
    const payload = JSON.stringify({ "0": { json: { openId: "102308593207118714314", password: "K9XmPq4Rtv2ZB8Lw3N!7C", email: "intelman26@gmail.com", name: "Admin Debug", role: "admin" } } });
    await execLine(ssh, `sleep 1 ; curl -sS -X POST -H "Content-Type: application/json" -H "X-Trpc-Batch: 1" --data '${payload}' "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" > /dev/null 2>&1 ; echo curl_done`);
    await new Promise(r => setTimeout(r, 3000));
    // Read PM2 error logs to find AUTH_DEBUG_GATES v5
    const logs = await execLine(ssh, `tail -40 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>&1 | grep -E "AUTH_DEBUG|FORBIDDEN|SCHED" | head -12`);
    console.log(`[6/6] PM2 ERROR LOGS (AUTH_DEBUG):\n${logs || '  <NO AUTH_DEBUG LINE — search full error>'}`);
    if (!logs || logs.includes('NO AUTH')) {
      const fullErr = await execLine(ssh, `tail -20 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log`);
      console.log(`\nFULL error log tail:\n${fullErr}`);
    }
  } catch (e) { console.error('FAILED:', (e.message || String(e)).slice(0, 800)); process.exitCode = 5;
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
