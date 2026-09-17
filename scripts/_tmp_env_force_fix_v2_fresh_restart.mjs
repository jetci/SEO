import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
    // 1) Check current .env
    console.log('=== BEFORE ENV ===');
    const env1 = await execLine(ssh, `cd ${REMOTE_ROOT} && grep -E '^(ALLOW_PROD_DEMO_SIGNIN|PROD_DEMO_SIGNIN_PASSWORD|NODE_ENV|ADMIN_OPENID)=' .env 2>&1 || echo 'NO MATCH'`);
    console.log(env1);
    // 2) EXPLICITLY overwrite/append DEMO vars
    const applyCmd = `cd ${REMOTE_ROOT} && {
      grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env;
      grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env;
      echo env_write_ok;
    }`;
    await execLine(ssh, applyCmd);
    console.log('\n=== AFTER ENV WRITE ===');
    const env2 = await execLine(ssh, `cd ${REMOTE_ROOT} && grep -E '^(ALLOW_PROD_DEMO_SIGNIN|PROD_DEMO_SIGNIN_PASSWORD|NODE_ENV|ADMIN_OPENID)=' .env 2>&1 || echo 'NO MATCH'`);
    console.log(env2);
    // 3) PM2 DELETE V2 from memory + start FRESH (to reload env completely — old --update-env not work in-memory cache)
    console.log('\n=== PM2 STOP + DELETE + START FRESH V2 ===');
    await execLine(ssh, 'pm2 stop eeat-studio-v2 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 3000));
    // Delete V2 from pm2 memory
    await execLine(ssh, 'pm2 delete eeat-studio-v2 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 2000));
    // Check guard pid0
    const jl1 = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jl1); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`GUARD BEFORE restart V2: pm_id=0 pid=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅' : '❌ ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }
    // Start V2 fresh from ecosystem.config.js or direct
    const start = await execLine(ssh, `cd ${REMOTE_ROOT} && pm2 start server/index.ts --name eeat-studio-v2 --interpreter ./node_modules/.bin/tsx --node-args="--no-warnings --experimental-vm-modules" --wait-ready --listen-timeout 8000 --kill-timeout 6000 2>&1 | tail -8`);
    console.log(start);
    await new Promise(r => setTimeout(r, 14000));
    // Guard after
    const jl2 = await execLine(ssh, 'pm2 jlist');
    let v2Status = 'MISSING', v2Pid = 'MISSING', pid0After = 'MISSING', guardAfter = false;
    try {
      const arr = JSON.parse(jl2);
      const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = pid0After === '1287' && x.pm2_env?.status === 'online'; }
      const y = arr.find(o => o.name === 'eeat-studio-v2'); if (y) { v2Status = y.pm2_env?.status || '?'; v2Pid = String(y.pid); }
    } catch {}
    console.log(`\nGUARD AFTER: V1 pid0=1287 ACTUAL=${pid0After} UNTOUCHED=${guardAfter ? '✅' : 'FATAL ❗'} | V2=${v2Status} pid=${v2Pid}`);
    if (!guardAfter) { process.exitCode = 99; return; }
    // Health
    const h = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const routers = (h.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || []).length;
    console.log(`HEALTH :3002 routers=${routers}/11 → ${h.slice(0, 260)}`);
    // Reloaded env vars into process check (via /api/health or logs)
    const logT = await execLine(ssh, 'tail -20 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>&1 | grep -v "node --loader" | grep -vi "deprecation" | tail -10');
    console.log(`\nV2 error logs (last 10 clean):\n${logT || '  <empty OK>'}`);
    console.log('\n✅ ENV FORCE RE-APPLY + V2 FRESH RESTART DONE — retry login now');
  } catch (e) {
    console.error('FAILED:', (e.message || String(e)).slice(0, 800));
    process.exitCode = 5;
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
