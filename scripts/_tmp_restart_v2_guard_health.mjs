import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 20000 };
const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
async function x(ssh, c) { return String(await ssh.exec(c) || '').trim(); }
(async () => {
  const ssh = new ssh2(SSH_CFG); await ssh.connect();
  const appendCmd = `cd /home/ubuntu/eeat-studio-v2 && bash -lc 'C1=ALLOW_PROD_DEMO_SIGNIN=1; C2=PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}; grep -qxF "$C1" .env 2>/dev/null && sed -i "s|^ALLOW_PROD_DEMO_SIGNIN=.*|$C1|" .env || echo "$C1" >> .env; grep -qxF "$C2" .env 2>/dev/null && sed -i "s|^PROD_DEMO_SIGNIN_PASSWORD=.*|$C2|" .env || echo "$C2" >> .env; echo env_appended'`;
  await x(ssh, appendCmd);
  console.log('Env appended');
  await x(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3');
  await new Promise(r => setTimeout(r, 3500));
  const jl = JSON.parse(await x(ssh, 'pm2 jlist'));
  const id0 = jl.find(o => o.pm_id === 0);
  const guard = id0 && String(id0.pid) === '175437' && id0.pm2_env?.status === 'online';
  console.log('FOREVER GUARD pid0=175437:', guard ? 'SAFE✅ pid='+id0.pid : '❌ BROKEN pid='+(id0?.pid||'MISSING'));
  if (!guard) process.exitCode = 99;
  const h = await x(ssh, 'sleep 1 && curl -sS -m 8 http://127.0.0.1:3002/api/health 2>/dev/null');
  const p2 = h.includes('"phase":2');
  const rc = (h.match(/auth|teams|settings|meta|projects|categories|clusters|keywords|research|write|admin/g) || []).length;
  console.log(`HEALTH phase=2: ${p2?'✅':'❌'}, routers=${rc}/11');
  console.log('RAW health:', h.slice(0, 280));
  await ssh.close();
})().catch(e => { console.error(e.message); process.exitCode = 1; });
