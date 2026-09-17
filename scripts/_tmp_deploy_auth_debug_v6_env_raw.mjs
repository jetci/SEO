import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';
const EXPECTED_PWD = 'K9XmPq4Rtv2ZB8Lw3N!7C';
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/7] SSH OK');
    const sftp = ssh.sftp();

    // === STEP 1: READ VPS .env FILE RAW (SFTP no shell escape issues) ===
    const envBuf = Buffer.from(await sftp.readFile(`${REMOTE_ROOT}/.env`));
    const envStr = envBuf.toString('utf-8');
    console.log('\n[2/7] RAW .env file content (password lines + char codes):');
    const lines = envStr.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('ALLOW_PROD_DEMO') || line.startsWith('PROD_DEMO_SIGNIN_P') || line.startsWith('ADMIN_OPENID') || line.startsWith('NODE_ENV=')) {
        const buf = Buffer.from(line, 'utf-8');
        const codes = [];
        for (let i = Math.max(0, line.length - 8); i < line.length; i++) codes.push(line.charCodeAt(i));
        console.log(`  LINE: ${JSON.stringify(line)}`);
        console.log(`    last-8 charCodes (decimal): [${codes.join(', ')}] (13=\\r CR, 10=\\n LF, 33=! exclamation)`);
        console.log(`    bytes len (raw): ${buf.length}`);
        if (line.startsWith('PROD_DEMO_SIGNIN_PASSWORD=')) {
          const val = line.slice('PROD_DEMO_SIGNIN_PASSWORD='.length);
          console.log(`    EXPECTED PWD: ${JSON.stringify(EXPECTED_PWD)} (len=${EXPECTED_PWD.length})`);
          console.log(`    .env FILE PWD:  ${JSON.stringify(val)} (len=${val.length})`);
          console.log(`    MATCH? ${val === EXPECTED_PWD}`);
        }
      }
    }
    // === STEP 2: GUARD BEFORE ===
    const jl1 = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jl1); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`\n[3/7 GUARD BEFORE] pm_id=0 pid=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅' : '❌ ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }

    // === STEP 3: Upload NEW auth.ts (with v6 password debug charCodes) ===
    const rel = 'server/auth.ts';
    const localFile = path.join(LOCAL_ROOT, rel);
    const remoteFile = `${REMOTE_ROOT}/${rel}`;
    const lb = fs.statSync(localFile).size;
    try { await sftp.fastPut(localFile, remoteFile); } catch { const buf = fs.readFileSync(localFile); await sftp.writeFile(remoteFile, buf); }
    const rb = parseInt(await execLine(ssh, `wc -c < "${remoteFile}"`) || '0', 10);
    const match = lb === rb;
    console.log(`\n[4/7] Upload ${rel}: LOCAL=${lb} REMOTE=${rb} ${match ? 'MATCH ✅' : 'MISMATCH ❌'}`);
    if (!match) { process.exitCode = 2; return; }

    // === STEP 4: CLEAR LOGS + RESTART V2 ===
    await execLine(ssh, 'cat /dev/null > /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log ; echo logs_cleared');
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -2');
    await new Promise(r => setTimeout(r, 12000));
    const jl2 = await execLine(ssh, 'pm2 jlist');
    let pid0After = 'MISSING', guardAfter = false, v2Status = '?', v2Pid = '?';
    try { const arr = JSON.parse(jl2); const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); } const y = arr.find(o => o.name === 'eeat-studio-v2'); if (y) { v2Status = y.pm2_env?.status || '?'; v2Pid = String(y.pid); } } catch {}
    console.log(`\n[5/7 GUARD AFTER] V1 pid0=1287: ${guardAfter ? 'UNTOUCHED ✅' : 'FATAL ❌'} | V2=${v2Status} pid=${v2Pid}`);
    if (!guardAfter) { process.exitCode = 99; return; }

    // === STEP 5: HEALTH ===
    const h = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const routers = (h.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || []).length;
    console.log(`\n[6/7] HEALTH routers=${routers}/11`);

    // === STEP 6: CURL TEST tRPC to trigger debug ===
    const payload = JSON.stringify({ "0": { json: { openId: "102308593207118714314", password: "K9XmPq4Rtv2ZB8Lw3N!7C", email: "intelman26@gmail.com", name: "Admin Debug", role: "admin" } } });
    await execLine(ssh, `sleep 1 ; curl -sS -X POST -H "Content-Type: application/json" -H "X-Trpc-Batch: 1" --data '${payload}' "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" > /dev/null 2>&1 ; echo curl_done`);
    await new Promise(r => setTimeout(r, 3000));
    const logs = await execLine(ssh, `tail -20 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>&1 | grep -E "AUTH_DEBUG" | head -5`);
    console.log(`\n[7/7] AUTH_DEBUG v6 charCode COMPARISON:\n${logs || '  <NO DEBUG>'}`);

  } catch (e) { console.error('FAILED:', (e.message || String(e)).slice(0, 800)); process.exitCode = 5;
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
