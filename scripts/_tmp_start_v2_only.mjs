import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
const run = (c) => ssh.exec(c).then(r=>r.toString().trim());
(async()=>{
  await ssh.connect();
  console.log('=== PM2 list BEFORE start ===');
  console.log(await run('pm2 list'));
  console.log('\n=== Starting V2 eeat-studio-v2 ===');
  console.log(await run('pm2 start eeat-studio-v2 --update-env 2>&1'));
  console.log('\n=== PM2 save ===');
  console.log(await run('pm2 save 2>&1'));
  await new Promise(r=>setTimeout(r, 8000));
  console.log('\n=== PM2 list AFTER start (wait 8s) ===');
  console.log(await run('pm2 list'));
  console.log('\n=== V2 HEALTH CHECK (port 3002) ===');
  try {
    const hRaw = await run('curl -sS -m 10 http://127.0.0.1:3002/api/health');
    console.log('HTTP RAW:', hRaw.slice(0, 600));
    const h = JSON.parse(hRaw);
    console.log('PARSED phase=%s routersCount=%s serverTime=%s', h.phase, (h.routers||[]).length, h.serverTime);
  } catch(e) {
    console.log('V2 health check fail:', e.message.slice(0, 200));
    console.log('(retry in 10s more wait)');
    await new Promise(r=>setTimeout(r, 10000));
    try {
      const hRaw = await run('curl -sS -m 10 http://127.0.0.1:3002/api/health');
      console.log('HTTP RAW RETRY:', hRaw.slice(0, 600));
    } catch(e2) { console.log('Retry fail too:', e2.message.slice(0, 200)); }
  }
  console.log('\n=== FOREVER GUARD V1 id=0 (PID=1287) ===');
  const jlist = JSON.parse(await run('pm2 jlist'));
  const v1 = jlist.find(p=>p.pm_id===0);
  const days = v1 ? Math.floor((Date.now() - v1.pm2_env.pm_uptime)/86400000) : -1;
  console.log('id=0 name=%s pid=%s status=%s uptime_days=%s', v1?.name, v1?.pid, v1?.pm2_env?.status, days);
  console.log('PID == 1287 untouched?', v1?.pid === 1287 ? 'YES ✅ Forever Guard OK' : 'NO ❌ VIOLATION');
  await ssh.close();
})().catch(e=>{console.error('FATALERR',e);process.exit(2)});
