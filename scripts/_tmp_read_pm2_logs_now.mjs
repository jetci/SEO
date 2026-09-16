import ssh2 from 'ssh2-promise';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/5] SSH connected');

    // FOREVER GUARD pid0 first
    const jl = await execLine(ssh, 'pm2 jlist');
    let guard = false, pid0 = 'MISSING';
    try {
      const arr = JSON.parse(jl);
      const x = arr.find(o => o.pm_id === 0);
      if (x) { pid0 = String(x.pid); guard = (pid0 === '1287') && (x.pm2_env?.status === 'online'); }
    } catch (_) {}
    console.log(`[2/5] FOREVER GUARD pm_id=0 V1 pid=1287 → ACTUAL=${pid0} SAFE=${guard ? '✅' : '❌ FATAL'}`);

    // Read PM2 v2 error log tail 200 (createDraft 500)
    console.log('\n================ PM2 eeat-studio-v2-error.log TAIL 200 ================\n');
    const err = await execLine(ssh, 'tail -200 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log');
    console.log(err.slice(-12000));

    console.log('\n================ PM2 eeat-studio-v2-out.log TAIL 250 CONTAINS write/createDraft/500/ERROR ================\n');
    const out = await execLine(ssh, 'tail -250 /home/ubuntu/.pm2/logs/eeat-studio-v2-out.log');
    console.log(out.slice(-12000));

    // Health
    const health = await execLine(ssh, 'curl -sS -m 10 http://127.0.0.1:3002/api/health 2>/dev/null');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    console.log(`\n[5/5] Health phase=2:${p2?'✅':'❌'} ok:true=${rOK?'✅':'❌'} RAW=${health.slice(0,260)}`);
  } catch (err) {
    console.error('FAILED:', (err.message || String(err)).slice(0, 800));
    process.exitCode = 5;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}
main();
