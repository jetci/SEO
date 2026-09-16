import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
const run = (c) => ssh.exec(c).then(r=>r.toString().trim());
(async()=>{
  await ssh.connect();
  console.log('ENV_CHECK_BEFORE=', await run(`cd /home/ubuntu/eeat-studio-v2 && grep -E "ALLOW_PROD|PROD_DEMO" .env | head -3 | sed "s/PASSWORD=.*/PASSWORD=<REDACTED>/" || echo NOT_FOUND_DEMO_VARS`));
  const fixEnv = `cd /home/ubuntu/eeat-studio-v2 && touch .env && if ! grep -q "^ALLOW_PROD_DEMO_SIGNIN=" .env; then echo "ALLOW_PROD_DEMO_SIGNIN=1" >> .env && echo "PROD_DEMO_SIGNIN_PASSWORD=K9XmPq4Rtv2ZB8Lw3N!7C" >> .env && echo APPENDED_NEW; else sed -i "s/^ALLOW_PROD_DEMO_SIGNIN=.*/ALLOW_PROD_DEMO_SIGNIN=1/" .env && sed -i "s|^PROD_DEMO_SIGNIN_PASSWORD=.*|PROD_DEMO_SIGNIN_PASSWORD=K9XmPq4Rtv2ZB8Lw3N!7C|" .env && echo UPDATED_EXISTING; fi`;
  console.log('FIXENV_RESULT=', await run(fixEnv));
  console.log('ENV_CHECK_AFTER=', await run(`cd /home/ubuntu/eeat-studio-v2 && grep -E "ALLOW_PROD|PROD_DEMO" .env | sed "s/PASSWORD=.*/PASSWORD=<REDACTED len>/"`));
  console.log('RESTART_V2_ONLY_NEVER_ID0_OUTPUT_LAST3:');
  console.log(await run(`pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3`));
  console.log('GUARD_PM2_ID0_RESULT=');
  const jlist = JSON.parse(await run('pm2 jlist'));
  const v1 = jlist.find(p=>p.pm_id===0);
  const days = v1 ? Math.floor((Date.now() - v1.pm2_env.pm_uptime)/86400000) : -1;
  console.log('pm_id=0 name=%s pid=%s status=%s uptime_days=%s pidEquals175437=%s', v1?.name, v1?.pid, v1?.pm2_env?.status, days, v1?.pid===175437 ? 'SAFE✅' : 'VIOLATION❌');
  await new Promise(r=>setTimeout(r, 3500));
  const hRaw = await run('curl -sS -m 9 http://127.0.0.1:3002/api/health');
  const h = JSON.parse(hRaw);
  console.log('V2_HEALTH phase=%s routersCount=%s ok=%s [11/phase2/true = pass]', h.phase, (h.routers||[]).length, h.ok);
  const exit = (v1?.pid===175437 && v1?.pm2_env?.status==='online' && h.phase==='2' && (h.routers||[]).length===11) ? 0 : 55;
  await ssh.close();
  process.exit(exit);
})().catch(e=>{console.error('FATALERR',e);process.exit(2)});

