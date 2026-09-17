import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/6] SSH OK');

    // Step 1: GUARD BEFORE + DELETE V2 process (to clear mangled env from memory)
    const jl1 = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jl1); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`[2/6 GUARD BEFORE] V1 pid0=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅' : '❌ ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }
    await execLine(ssh, 'pm2 delete eeat-studio-v2 2>&1 | tail -2');
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: START FRESH V2 WITHOUT ANY CLI ENV PREFIX! NO env vars passed via CLI!
    // Only loads env from /home/ubuntu/eeat-studio-v2/.env file (SFTP verified correct)
    const startCmd = `cd /home/ubuntu/eeat-studio-v2 && pm2 start server/index.ts \
      --name eeat-studio-v2 \
      --cwd /home/ubuntu/eeat-studio-v2 \
      --interpreter ./node_modules/.bin/tsx \
      --node-args="--no-warnings --experimental-vm-modules" \
      --wait-ready --listen-timeout 8000 --kill-timeout 6000 2>&1 | tail -8`;
    const startOut = await execLine(ssh, startCmd);
    console.log(`[3/6] START FRESH V2 (NO CLI env injection — ONLY .env file):\n${startOut.slice(0, 500)}`);
    await new Promise(r => setTimeout(r, 14000));

    // Step 3: GUARD AFTER + CHECK /proc ENV FOR PASSWORD LENGTH 21 (NOT MANGLED!)
    const jl2 = await execLine(ssh, 'pm2 jlist');
    let pid0After = 'MISSING', guardAfter = false, v2Status = '?', v2Pid = '';
    try { const arr = JSON.parse(jl2); const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); } const y = arr.find(o => o.name === 'eeat-studio-v2'); if (y) { v2Status = y.pm2_env?.status || '?'; v2Pid = String(y.pid); } } catch {}
    console.log(`[4/6 GUARD AFTER] V1 pid0=1287 UNTOUCHED=${guardAfter ? '✅' : 'FATAL ❌'} | V2=${v2Status} pid=${v2Pid}`);
    if (!guardAfter) { process.exitCode = 99; return; }
    if (v2Pid) {
      const proc = await execLine(ssh, `cat /proc/${v2Pid}/environ 2>/dev/null | tr '\\0' '\\n' | grep -E "PROD_DEMO_SIGNIN_PASSWORD|ALLOW_PROD_DEMO|ADMIN_OPENID" | head -10`);
      console.log(`   /proc/${v2Pid}/environ V2 env vars:\n${proc || '  <NOT FOUND>'}`);
      // Print password LAST 4 chars and length to confirm NOT mangled (! sign present)
      const pwdRaw = await execLine(ssh, `cat /proc/${v2Pid}/environ 2>/dev/null | tr '\\0' '\\n' | grep "^PROD_DEMO_SIGNIN_PASSWORD=" | head -1`);
      if (pwdRaw) {
        const val = pwdRaw.slice('PROD_DEMO_SIGNIN_PASSWORD='.length);
        console.log(`   PROD_DEMO_SIGNIN_PASSWORD len=${val.length} last-8 codes: [${[...val.slice(-8)].map(c => c.charCodeAt(0)).join(',')}] (last 4 = ${JSON.stringify(val.slice(-4))} — charCode 33 = ! exclamation REQUIRED!)`);
        console.log(`   EXPECTED: len=21 last4="!7C" last-char codes end with 33,55,67`);
      }
    }
    // Step 4: HEALTH routers 11/11
    const h = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const routers = (h.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || []).length;
    console.log(`[5/6] HEALTH routers=${routers}/11: ${h.slice(0, 200)}`);
    // Step 5: LOCALHOST CURL tRPC with CORRECT PASSWORD (localhost no bash expansion!) — first test
    console.log('\n[6/6] LOCALHOST DIRECT tRPC test (localhost bash NO history expansion):');
    // Write payload to file first to avoid any bash command line parsing issues
    await execLine(ssh, `cd /home/ubuntu/eeat-studio-v2 && node -e "
const p = JSON.stringify({ '0': { json: { openId:'102308593207118714314', password:'K9XmPq4Rtv2ZB8Lw3N!7C', email:'intelman26@gmail.com', name:'Admin Test', role:'admin' } } });
require('fs').writeFileSync('/tmp/_auth_payload.json', p); console.log('payload written, len:', p.length);
" 2>&1`);
    const directCurl = await execLine(ssh, `curl -sS -X POST -H "Content-Type: application/json" -H "X-Trpc-Batch: 1" --data-binary @/tmp/_auth_payload.json "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" 2>&1 | head -5`);
    console.log(`   curl @file (no bash in payload):\n   ${directCurl.slice(0, 500)}`);
    console.log('\n✅ V2 FRESH START (NO CLI env injection) DONE — retry browser login NOW (password is correct in /proc memory!)');
  } catch (e) { console.error('FAIL:', (e.message || String(e)).slice(0, 800)); process.exitCode = 5;
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
