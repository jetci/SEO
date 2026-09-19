import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
const run = (c) => ssh.exec(c).then(r=>r.toString().trim());
(async()=>{
  await ssh.connect();
  console.log('=== pm2 describe eeat-studio-v2 (exit code, error path) ===');
  console.log(await run('pm2 describe eeat-studio-v2 2>&1 | head -50'));
  console.log('\n=== pm2 logs eeat-studio-v2 --lines 200 --nostream (CRASH REASON) ===');
  console.log(await run('pm2 logs eeat-studio-v2 --lines 200 --nostream 2>&1 | tail -120'));
  console.log('\n=== cd /home/ubuntu/eeat-studio-v2 && pm2 start ecosystem.config.js OR directly check package.json start ===');
  console.log(await run('ls -la /home/ubuntu/eeat-studio-v2/dist 2>&1 | head -10 ; ls /home/ubuntu/eeat-studio-v2/ 2>&1 | head -20'));
  console.log('\n=== cat package.json start script ===');
  try { console.log(await run('cd /home/ubuntu/eeat-studio-v2 && cat package.json | grep -A 4 scripts')); } catch(e) { console.log('grep fail', e.message.slice(0,100)); }
  console.log('\n=== Manual npm start (cd dir then node server/app.ts OR dist?) ===');
  console.log(await run('cd /home/ubuntu/eeat-studio-v2 && cat ecosystem.config.js 2>&1 | head -40 || cat ecosystem.config.cjs 2>&1 | head -40'));
  await ssh.close();
})().catch(e=>{console.error('FATALERR',e.message);process.exit(2)});
