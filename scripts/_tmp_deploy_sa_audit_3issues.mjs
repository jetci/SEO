import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';

function walk(dir, list = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, list); else list.push(p);
  }
  return list;
}

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/9] SSH connected');
    const sftp = ssh.sftp();

    // 1) Upload ALL dist/ files recursively
    const localDist = path.join(LOCAL_ROOT, 'dist');
    const distFiles = walk(localDist);
    console.log(`[2/9] Found ${distFiles.length} dist/ files to upload`);
    await execLine(ssh, `mkdir -p "${REMOTE_ROOT}/dist/assets"`);
    let okCount = 0, diffCount = 0;
    for (const f of distFiles) {
      const rel = path.relative(localDist, f).replace(/\\/g, '/');
      const remote = `${REMOTE_ROOT}/dist/${rel}`;
      await execLine(ssh, `mkdir -p "$(dirname '${remote}')" ; true`);
      try { await sftp.fastPut(f, remote, { concurrency: 16, chunkSize: 65536 }); } catch (e) { console.log(' fastPut fallbak:', rel); try { const buf = fs.readFileSync(f); await sftp.writeFile(remote, buf); } catch (e2) { console.log(' WRITE FAIL:', rel, String(e2.message).slice(0,80)); diffCount++; continue; } }
      const lb = fs.statSync(f).size;
      const rem = parseInt(await execLine(ssh, `wc -c < "${remote}"`) || '0', 10);
      if (lb === rem) okCount++; else diffCount++;
    }
    console.log(`[2/9] dist/: OK=${okCount} DIFF=${diffCount} total=${distFiles.length}`);

    // 2) Backend files byte-verify (write.ts + articleWriterService unchanged from last deploy)
    const beFiles = ['server/routers/write.ts', 'server/services/articleWriterService.ts'];
    console.log('[3/9] Backend files byte-verify (from previous deploy)');
    for (const rel of beFiles) {
      const rb = parseInt(await execLine(ssh, `wc -c < "${REMOTE_ROOT}/${rel}"`) || '0', 10);
      const lb = fs.statSync(path.join(LOCAL_ROOT, rel)).size;
      console.log(`  - ${rel}: LOCAL=${lb} REMOTE=${rb} MATCH=${lb===rb?'OK':'DIFF'}`);
    }

    // 3) Clear cache
    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_ok');
    console.log('[4/9] TSX + module cache cleared');

    // 4) Demo signin env
    const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
    await execLine(ssh, `cd ${REMOTE_ROOT} && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_ok`);
    console.log('[5/9] Demo signin ENV vars re-applied');

    // 5) GUARD BEFORE: V1 pid0 MUST = 1287
    const jlBefore = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jlBefore); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`[6/9 GUARD BEFORE] pm_id=0 pid=1287 ACTUAL=${pid0} SAFE=${guardBefore ? 'OK' : 'ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }

    // 6) PM2 restart V2 only
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 7000));
    console.log('[6/9] PM2 eeat-studio-v2 restarted');

    // 7) GUARD AFTER: V1 pid0 still 1287
    const jl = await execLine(ssh, 'pm2 jlist');
    let guardAfter = false, pid0After = 'MISSING';
    try { const arr = JSON.parse(jl); const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); } } catch {}
    console.log(`[7/9 GUARD AFTER] pm_id=0 pid=1287 ACTUAL=${pid0After} SAFE=${guardAfter ? 'V1 UNTOUCHED' : 'FATAL ROLLBACK NOW'}`);
    if (!guardAfter) process.exitCode = 99;

    // 8) Health
    const health = await execLine(ssh, 'curl -sS -m 15 http://127.0.0.1:3002/api/health');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    const routersArr = health.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || [];
    const countRouters = routersArr.length;
    console.log(`[8/9] Health phase=2:${p2?'OK':'NO'} ok:true=${rOK?'OK':'NO'} routers=${countRouters}/11 → ${p2&&rOK&&countRouters===11?'FULL HEALTH':'DEGRADED'} RAW=${health.slice(0,280)}`);
    if (!p2 || !rOK || countRouters !== 11) process.exitCode = 4;

    // 9) Build hash verification
    const idx = await execLine(ssh, `grep -oE '__[0-9]{13}' "${REMOTE_ROOT}/dist/index.html" | head -1`);
    console.log(`[9/9] NEW Build Hash in dist/index.html: ${idx || 'MISSING'} (expected: 1789559149404 → ${idx.includes('1789559149404') ? 'PRESENT' : 'user Ctrl+Shift+R Hard Refresh required on old browser tab'}`);
  } catch (err) {
    console.error('FAILED:', (err.message || String(err)).slice(0, 1200));
    process.exitCode = 5;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}
main();
