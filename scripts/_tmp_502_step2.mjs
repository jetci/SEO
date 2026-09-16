import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
const run = (c) => ssh.exec(c).then(r=>r.toString());
(async()=>{
  await ssh.connect();
  console.log("wait 12 seconds for apps boot...");
  await new Promise(r=>setTimeout(r, 12000));
  const j = JSON.parse(await run('pm2 jlist'));
  j.forEach(p=>{
    const up = p.pm2_env.pm_uptime ? Math.floor((Date.now()-p.pm2_env.pm_uptime)/1000) : 0;
    console.log('PM id=%s name=%s pid=%s status=%s uptime_secs=%s restarts=%s cpu=%s mem=%sMB', p.pm_id, p.name, p.pid, p.pm2_env?.status, up, p.pm2_env?.restart_time || 0, p.monit?.cpu||0, Math.round((p.monit?.memory||0)/1048576));
  });
  console.log('\n[1] curl 3002 V2=');
  console.log((await run('curl -sS -m 10 http://127.0.0.1:3002/api/health 2>&1 | head -c 800')));
  console.log('\n[2] curl 3001 V1=');
  console.log((await run('curl -sS -m 10 http://127.0.0.1:3001/api/health 2>&1 | head -c 600')));
  console.log('\n[3] PM2 last 25 lines error id=1 eeat-studio-v2=');
  console.log((await run('pm2 logs eeat-studio-v2 --nostream --lines 35 --err 2>&1 | tail -n 35')));
  console.log('\n[4] PM2 last 20 lines out id=0 eeat-studio (V1 OLD)=');
  console.log((await run('pm2 logs eeat-studio --nostream --lines 25 --out 2>&1 | tail -n 25')));
  await ssh.close();
})().catch(e=>{console.error('ERR',e);process.exit(99)});
