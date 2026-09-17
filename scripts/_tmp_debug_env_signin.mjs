import ssh2 from 'ssh2-promise';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function exec(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[SSH] connected');
    // Get V2 PID
    const jl = JSON.parse(await exec(ssh, 'pm2 jlist'));
    const v2 = jl.find(p => p.name === 'eeat-studio-v2');
    console.log('V2 pid:', v2.pid, 'name:', v2.name);
    // dump /proc env
    const raw = await exec(ssh, `sudo cat /proc/${v2.pid}/environ | xargs -0 -n 1 echo | grep -E 'ALLOW_PROD|PROD_DEMO|ADMIN_OPEN|NODE_ENV'`);
    console.log('VARS:\n', raw);
    // also .env file last lines
    console.log('\nDOTENV LAST 25 LINES:\n', await exec(ssh, 'tail -n 25 /home/ubuntu/eeat-studio-v2/.env'));
  } finally { await ssh.close(); }
}
main().catch(e => console.error(e.message));
