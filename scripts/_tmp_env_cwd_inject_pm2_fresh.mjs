import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('=== TEST 1: Node require dotenv/config DIRECTLY in CWD project ===');
    const t1 = await execLine(ssh, `cd /home/ubuntu/eeat-studio-v2 && node -e "require('dotenv').config(); console.log('ALLOW=', JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN)); console.log('PWD_LEN=', (process.env.PROD_DEMO_SIGNIN_PASSWORD||'').length); console.log('ADMIN_OID=', JSON.stringify(process.env.ADMIN_OPENID)); console.log('NODE_ENV=', JSON.stringify(process.env.NODE_ENV))" 2>&1`);
    console.log(t1);
    console.log('\n=== TEST 2: PM2 info eeat-studio-v2 — CWD / pm_cwd ===');
    const t2 = await execLine(ssh, `pm2 describe eeat-studio-v2 2>&1 | grep -iE "exec cwd|cwd|node args|interpreter|script path" | head -15`);
    console.log(t2);
    console.log('\n=== TEST 3: PM2 show env vars injected ===');
    const t3 = await execLine(ssh, `pm2 env eeat-studio-v2 2>&1 | grep -iE "ALLOW_PROD|PROD_DEMO|ADMIN_OPENID|NODE_ENV" | head -15`);
    console.log(t3 || '  <no grep match (might print as json different format)>');
    console.log('\n=== TEST 4: Inject env vars PM2 explicit via pm2 restart + update-env + cwd set ===');
    // Restart with proper CWD this time — ecosystem equivalent
    await execLine(ssh, `cd /home/ubuntu/eeat-studio-v2 && pm2 delete eeat-studio-v2 2>&1 | tail -2`);
    await new Promise(r => setTimeout(r, 2000));
    // GUARD BEFORE
    const jl1 = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jl1); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`GUARD BEFORE V2 restart: pm_id=0 pid=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅' : '❌ ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }
    // Start with explicit cwd AND pass ALLOW_PROD via CLI env to guarantee
    const start = await execLine(ssh, `cd /home/ubuntu/eeat-studio-v2 && ALLOW_PROD_DEMO_SIGNIN=1 PROD_DEMO_SIGNIN_PASSWORD='K9XmPq4Rtv2ZB8Lw3N!7C' ADMIN_OPENID='102308593207118714314' pm2 start server/index.ts --name eeat-studio-v2 --cwd /home/ubuntu/eeat-studio-v2 --interpreter ./node_modules/.bin/tsx --node-args="--no-warnings --experimental-vm-modules" --wait-ready --listen-timeout 8000 --kill-timeout 6000 2>&1 | tail -8`);
    console.log(start);
    await new Promise(r => setTimeout(r, 14000));
    const jl2 = await execLine(ssh, 'pm2 jlist');
    let v2Status = 'MISSING', v2Pid = 'MISSING', pid0After = 'MISSING', guardAfter = false;
    try {
      const arr = JSON.parse(jl2);
      const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = pid0After === '1287' && x.pm2_env?.status === 'online'; }
      const y = arr.find(o => o.name === 'eeat-studio-v2'); if (y) { v2Status = y.pm2_env?.status || '?'; v2Pid = String(y.pid); }
    } catch {}
    console.log(`\nGUARD AFTER: V1 pid0=1287 ACTUAL=${pid0After} UNTOUCHED=${guardAfter ? '✅' : 'FATAL ❗'} | V2=${v2Status} pid=${v2Pid}`);
    if (!guardAfter) { process.exitCode = 99; return; }
    const h = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const routers = (h.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || []).length;
    console.log(`HEALTH :3002 routers=${routers}/11 → ${h.slice(0, 260)}`);
    // ENV again
    const t4 = await execLine(ssh, `pm2 env eeat-studio-v2 2>&1 | grep -iE "ALLOW_PROD|PROD_DEMO|ADMIN_OPENID|NODE_ENV|cwd" | head -15`);
    console.log(`\nPM2 env inject after restart:\n${t4 || '  <none>'}`);
    console.log('\n✅ FRESH START WITH CLI INJECTED ENV + CWD SET — retry login NOW with same creds');
  } catch (e) { console.error('FAILED:', (e.message || String(e)).slice(0, 1200)); process.exitCode = 5;
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
