import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
(async()=>{
  await ssh.connect();
  const h = JSON.parse((await ssh.exec("curl -sS -m 7 http://127.0.0.1:3002/api/health")).toString().trim());
  const a = JSON.parse((await ssh.exec("pm2 jlist")).toString().trim()||"[]");
  const v1 = a.find(p=>p.name==='eeat-studio' && p.pm_id===0);
  const v2 = a.find(p=>p.name==='eeat-studio-v2');
  const d = Math.floor((Date.now() - (v1?.pm2_env?.pm_uptime||0))/86400000);
  console.log("HEALTH: phase=%s routers=%s match11=%s ok=%s", h.phase, h.routers?.length, (h.routers||[]).length===11, h.ok);
  console.log("GUARD PM2 id=0 eeat-studio: pid=%s status=%s uptime_days=%s pid175437=%s", v1?.pid, v1?.pm2_env?.status, d, v1?.pid===175437?"✅":"❌");
  console.log("V2 eeat-studio-v2 id=107: pid=%s status=%s mem=%s", v2?.pid, v2?.pm2_env?.status, Math.round((v2?.monit?.memory||0)/1024/1024)+'mb');
  const exit = (h.phase===2 && h.routers?.length===11 && v1?.pid===175437 && v1?.pm2_env?.status==='online' && v2?.pm2_env?.status==='online') ? 0 : 66;
  await ssh.close();
  process.exit(exit);
})().catch(e=>{console.error('ERR',e);process.exit(99)});
