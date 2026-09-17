import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';

const HOTFIX_FILES = [
  { rel: 'server/routers/write.ts', desc: 'Backend Step4 3 fixes: 1) zod refine 3-way (keywordId|draftId|raw keyword); 2) outlineSections word_target_min default 0; 3) WP-B2 pkg guard EXCEPTION bypass if outlineSections.length>=3 or force=true (Step3 generateOutline doesn\'t persist pkg to DB column mismatch; but context baked into AI Outline H1-H6)' },
];

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/7] SSH connected OK');
    const sftp = ssh.sftp();

    const jlBefore = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try {
      const arr = JSON.parse(jlBefore);
      const x = arr.find(o => o.pm_id === 0);
      if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; }
    } catch {}
    console.log(`[2/7 GUARD BEFORE] pm_id=0 pid=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅ PASS' : '❌ ABORT EXIT99'}`);
    if (!guardBefore) { process.exitCode = 99; return; }

    console.log(`[3/7] Upload ${HOTFIX_FILES.length} files (BE-only, no FE build):`);
    let ok = 0;
    for (const f of HOTFIX_FILES) {
      const rel = f.rel;
      const localFile = path.join(LOCAL_ROOT, rel);
      const remoteFile = `${REMOTE_ROOT}/${rel}`;
      const lb = fs.statSync(localFile).size;
      try { await sftp.fastPut(localFile, remoteFile); } catch {
        const buf = fs.readFileSync(localFile); await sftp.writeFile(remoteFile, buf);
      }
      const rb = parseInt(await execLine(ssh, `wc -c < "${remoteFile}"`) || '0', 10);
      const match = lb === rb;
      console.log(`  ${match?'✅':'❌'} ${rel.padEnd(38)} LOCAL=${String(lb).padStart(6)}B REMOTE=${String(rb).padStart(6)}B ${match?'MATCH':'MISMATCH'}`);
      if (match) ok++;
    }
    console.log(`         Upload: ${ok}/${HOTFIX_FILES.length} files MATCH ${ok === HOTFIX_FILES.length ? '✅' : '❌'}`);
    if (ok !== HOTFIX_FILES.length) { process.exitCode = 2; return; }

    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_ok');
    console.log('[4/7] TSX + module cache cleared');

    const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
    await execLine(ssh, `cd ${REMOTE_ROOT} && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_ok`);
    console.log('[5/7] Demo signin ENV vars re-applied');

    const restartOut = await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 12000));
    console.log(`[6/7] PM2 eeat-studio-v2 restarted. raw=${restartOut.slice(0,120)}`);

    const jlAfter = await execLine(ssh, 'pm2 jlist');
    let guardAfter = false, pid0After = 'MISSING', v2Status = 'missing', v2Name = 'MISSING';
    try {
      const arr = JSON.parse(jlAfter);
      const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); }
      const y = arr.find(o => o.name === 'eeat-studio-v2' || o.pm_id === 1); if (y) { v2Status = y.pm2_env?.status || '?'; v2Name = y.name; }
    } catch {}
    const health = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    const routersArr = health.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || [];
    const countRouters = routersArr.length;
    console.log(`[7/7] V1 pid=1287 ACTUAL=${pid0After} ${guardAfter?'UNTOUCHED ✅':'FATAL ❗'} | V2=${v2Name||'?'} status=${v2Status} | Health :3002 phase=2:${p2?'OK':'NO'} ok:true=${rOK?'OK':'NO'} routers=${countRouters}/11 → ${p2&&rOK&&countRouters===11?'FULL HEALTH ✅':'DEGRADED ⚠️'}`);
    if (health.length > 0) console.log(`         RAW: ${health.slice(0,280)}`);
    const errTail = await execLine(ssh, 'tail -10 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>/dev/null | grep -v "node --loader" | grep -vi "deprecation" | grep -v "SCHED PUB" | tail -5');
    if (errTail) console.log(`         V2 ERROR tail (no SCHED noise):\n${errTail.split('\n').map(l=>'           '+l).join('\n')}`);
    else console.log('         V2 ERROR tail: no fresh errors ✅');
    process.exitCode = (guardBefore && guardAfter && p2 && rOK && countRouters===11) ? 0 : 5;
  } catch (e) { console.error('[FATAL]', e); process.exitCode = 1; } finally { await ssh.close(); }
}
main();
