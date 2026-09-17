import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    // Get current V2 pid from pm2
    const jl = await execLine(ssh, 'pm2 jlist');
    let v2Pid = '';
    try { const arr = JSON.parse(jl); const y = arr.find(o => o.name === 'eeat-studio-v2'); if (y) v2Pid = String(y.pid); } catch {}
    console.log('V2 running PID:', v2Pid || 'NOT FOUND');
    if (!v2Pid) return;
    // Read /proc/<pid>/environ — 100% accurate real env of running process
    console.log('\n=== REAL ENV OF RUNNING V2 PROCESS (from /proc/PID/environ null-byte split) ===');
    const raw = await execLine(ssh, `cat /proc/${v2Pid}/environ 2>/dev/null | tr '\\0' '\\n' | grep -iE "ALLOW_PROD_DEMO|PROD_DEMO_SIGNIN|ADMIN_OPENID|NODE_ENV|^PWD=|^HOME=|VERCEL|SESSION_SECRET" | head -30`);
    console.log(raw || '  NO MATCH (ALL UNDEFINED!)');
    // Also try to see full count of env vars
    const cnt = await execLine(ssh, `cat /proc/${v2Pid}/environ 2>/dev/null | tr '\\0' '\\n' | wc -l`);
    console.log(`Total env vars count in V2 process: ${cnt}`);
    // Try another way: cat /proc/PID/cmdline to see start command
    const cmd = await execLine(ssh, `cat /proc/${v2Pid}/cmdline 2>/dev/null | tr '\\0' ' '`);
    console.log(`\nV2 cmdline start: ${cmd.slice(0, 200)}`);
    // cwd
    const cwd = await execLine(ssh, `readlink /proc/${v2Pid}/cwd 2>/dev/null`);
    console.log(`V2 cwd (symlink): ${cwd}`);
  } catch (e) { console.error('FAIL:', (e.message || String(e)).slice(0, 800));
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
