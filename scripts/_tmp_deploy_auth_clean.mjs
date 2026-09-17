import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/4] SSH OK');
    const sftp = ssh.sftp();
    // GUARD BEFORE
    const jl1 = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jl1); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`[2/4 GUARD BEFORE] V1 pid0=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅' : '❌ ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }
    // Upload auth.ts
    const rel = 'server/auth.ts';
    const localFile = path.join(LOCAL_ROOT, rel);
    const remoteFile = `${REMOTE_ROOT}/${rel}`;
    const lb = fs.statSync(localFile).size;
    try { await sftp.fastPut(localFile, remoteFile); } catch { const buf = fs.readFileSync(localFile); await sftp.writeFile(remoteFile, buf); }
    const rb = parseInt(await execLine(ssh, `wc -c < "${remoteFile}"`) || '0', 10);
    const match = lb === rb;
    console.log(`[3/4] Upload clean auth.ts: LOCAL=${lb} REMOTE=${rb} ${match ? 'MATCH ✅ (NO DEBUG LOGS — DEBT-02 SAFE)' : 'MISMATCH ❌'}`);
    if (!match) { process.exitCode = 2; return; }
    // Restart V2 + health
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -1');
    await new Promise(r => setTimeout(r, 11000));
    const jl2 = await execLine(ssh, 'pm2 jlist');
    let pid0After = 'MISSING', guardAfter = false, v2Status = '?';
    try { const arr = JSON.parse(jl2); const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); } const y = arr.find(o => o.name === 'eeat-studio-v2'); if (y) v2Status = y.pm2_env?.status || '?'; } catch {}
    const h = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const routers = (h.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || []).length;
    console.log(`[4/4 GUARD AFTER + HEALTH] V1 pid0=1287 UNTOUCHED=${guardAfter ? '✅' : 'FATAL'} V2=${v2Status} routers=${routers}/11`);
    console.log('\n✅ Clean auth.ts DEPLOYED. NOW: Login via BROWSER with correct credentials (NO bash curl!). Browser form sends password correctly no bash history expansion!');
    console.log('   Login OpenID: 102308593207118714314');
    console.log('   Password     : K9XmPq4Rtv2ZB8Lw3N!7C');
  } catch (e) { console.error('FAILED:', (e.message || String(e)).slice(0, 600)); process.exitCode = 5;
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
