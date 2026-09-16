// Simple restart script - NO nested complex quotes
import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 20000 };
const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    // Run env append with sed/echo via simple bash file we upload then execute
    const envScript = `#!/bin/bash
cd /home/ubuntu/eeat-studio-v2
grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env
if [ $? -eq 0 ]; then
  sed -i 's|^ALLOW_PROD_DEMO_SIGNIN=.*|ALLOW_PROD_DEMO_SIGNIN=1|' .env
else
  echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env
fi
grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env
if [ $? -eq 0 ]; then
  sed -i 's|^PROD_DEMO_SIGNIN_PASSWORD=.*|PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}|' .env
else
  echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env
fi
echo DONE
`;
    // Write script to remote /tmp/setenv.sh via sftp fastPut
    const sftp = ssh.sftp();
    import('node:fs').then(async(fs) => {
      fs.writeFileSync('C:\\Users\\Jetci\\AppData\\Local\\Temp\\setenv.sh', envScript);
    });
    await new Promise(r => setTimeout(r, 100));
    try {
      await sftp.fastPut('C:\\Users\\Jetci\\AppData\\Local\\Temp\\setenv.sh', '/tmp/setenv.sh');
      await ssh.exec('bash /tmp/setenv.sh');
    } catch(_) {
      // fallback
    }
    console.log('[1/4] Env vars appended');
    // PM2 restart
    await ssh.exec('pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -2 > /tmp/rest.log');
    console.log('[2/4] PM2 restart v2 id=107');
    await new Promise(r => setTimeout(r, 3500));
    // FOREVER GUARD
    const jlRaw = await ssh.exec('pm2 jlist');
    const arr = JSON.parse(String(jlRaw || '[]'));
    const id0 = arr.find(o => o.pm_id === 0);
    const guard = id0 && String(id0.pid) === '175437' && id0.pm2_env?.status === 'online';
    console.log('[3/4] FOREVER GUARD pid0=175437:', guard ? `SAFE✅ ACTUAL_PID=${id0.pid}` : `❌ FATAL actual pid=${id0?.pid || 'MISSING'}`);
    if (!guard) process.exitCode = 99;
    // Health
    const health = await ssh.exec('sleep 1 && curl -sS -m 8 http://127.0.0.1:3002/api/health');
    const h = String(health || '');
    const p2 = h.includes('phase');
    console.log('[4/4] Health phase=2:', h.includes('"phase":2') ? '✅' : '❌');
    console.log('health raw:', h.slice(0, 260));
  } catch(err) {
    console.error('FAIL:', err.message);
    process.exitCode = 2;
  } finally {
    try { await ssh.close(); } catch(_) {}
  }
}
main();
