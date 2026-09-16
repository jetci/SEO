import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
const run = (c) => ssh.exec(c).then(r=>r.toString());
(async()=>{
  await ssh.connect();
  console.log("[1] PM2 jlist summary (name/pm_id/pid/status/uptime_days):");
  const j = JSON.parse(await run('pm2 jlist'));
  j.forEach(p=>{
    const up = p.pm2_env.pm_uptime ? Math.floor((Date.now()-p.pm2_env.pm_uptime)/86400000) : 0;
    console.log(' pm_id=%s name=%s pid=%s status=%s uptime=%sd restart=%s mem=%sMB', p.pm_id, p.name, p.pid, p.pm2_env?.status, up, p.pm2_env?.restart_time || 0, Math.round((p.monit?.memory||0)/1048576));
  });
  console.log("[2] FOREVER GUARD pid0=175437 ACTUAL=", (j.find(p=>p.pm_id===0)||{}).pid);
  console.log("[3] curl 3002/api/health V2:");
  const h = await run('curl -sS -m 9 http://127.0.0.1:3002/api/health 2>&1 | head -c 600');
  console.log(h);
  console.log("[4] curl 3001 V1 health (must OK) = ");
  const h1 = await run('curl -sS -m 9 http://127.0.0.1:3001/api/health 2>&1 | head -c 250');
  console.log(h1);
  console.log("[5] nginx + 502 related last 40 lines error:");
  const ng = await run("sudo tail -n 40 /var/log/nginx/error.log 2>&1 | tail -n 40; echo '==='; tail -n 30 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>&1");
  console.log(ng);
  await ssh.close();
})().catch(e=>{console.error('ERR',e);process.exit(99)});
