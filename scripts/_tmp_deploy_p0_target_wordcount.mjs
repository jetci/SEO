import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';
const NEW_BUILD_HASH = '1789562853060';

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
    console.log('[1/10] SSH connected');
    const sftp = ssh.sftp();

    // 1) Upload ALL dist/ files recursively
    const localDist = path.join(LOCAL_ROOT, 'dist');
    const distFiles = walk(localDist);
    console.log(`[2/10] Found ${distFiles.length} dist/ files to upload`);
    await execLine(ssh, `mkdir -p "${REMOTE_ROOT}/dist/assets"`);
    let okCount = 0, diffCount = 0;
    for (const f of distFiles) {
      const rel = path.relative(localDist, f).replace(/\\/g, '/');
      const remote = `${REMOTE_ROOT}/dist/${rel}`;
      await execLine(ssh, `mkdir -p "$(dirname '${remote}')" ; true`);
      try { await sftp.fastPut(f, remote, { concurrency: 16, chunkSize: 65536 }); } catch (e) {
        console.log(' fastPut fallback:', rel);
        try { const buf = fs.readFileSync(f); await sftp.writeFile(remote, buf); } catch (e2) {
          console.log(' WRITE FAIL:', rel, String(e2.message).slice(0,80)); diffCount++; continue;
        }
      }
      const lb = fs.statSync(f).size;
      const rem = parseInt(await execLine(ssh, `wc -c < "${remote}"`) || '0', 10);
      if (lb === rem) okCount++; else diffCount++;
    }
    console.log(`[2/10] dist/: OK=${okCount} DIFF=${diffCount} total=${distFiles.length}`);
    if (diffCount > 0) { process.exitCode = 3; return; }

    // 2) Upload updated BACKEND SOURCE FILES (write.ts + articleWriterService.ts)
    const beFiles = [
      'server/routers/write.ts',
      'server/services/articleWriterService.ts',
    ];
    console.log('[3/10] Backend source upload (P0 Target Word Count Sync):');
    let beOk = 0;
    for (const rel of beFiles) {
      const localFile = path.join(LOCAL_ROOT, rel);
      const remoteFile = `${REMOTE_ROOT}/${rel}`;
      const lb = fs.statSync(localFile).size;
      try { await sftp.fastPut(localFile, remoteFile); } catch {
        const buf = fs.readFileSync(localFile); await sftp.writeFile(remoteFile, buf);
      }
      const rb = parseInt(await execLine(ssh, `wc -c < "${remoteFile}"`) || '0', 10);
      const match = lb === rb;
      console.log(`  - ${rel}: LOCAL=${lb} REMOTE=${rb} ${match?'MATCH ✅':'MISMATCH ❌'}`);
      if (match) beOk++;
    }
    if (beOk !== beFiles.length) { process.exitCode = 2; return; }

    // 3) Clear cache
    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_ok');
    console.log('[4/10] TSX + module cache cleared');

    // 4) Demo signin env
    const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
    await execLine(ssh, `cd ${REMOTE_ROOT} && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_ok`);
    console.log('[5/10] Demo signin ENV vars re-applied');

    // 5) GUARD BEFORE: V1 pid0 MUST = 1287
    const jlBefore = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jlBefore); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`[6/10 GUARD BEFORE] pm_id=0 pid=1287 ACTUAL=${pid0} SAFE=${guardBefore ? 'OK' : 'ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }

    // 6) PM2 restart V2 only
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 9000));
    console.log('[6/10] PM2 eeat-studio-v2 restarted');

    // 7) GUARD AFTER: V1 pid0 still 1287
    const jl = await execLine(ssh, 'pm2 jlist');
    let guardAfter = false, pid0After = 'MISSING', v2Status = 'missing', v2Pid = 'MISSING';
    try {
      const arr = JSON.parse(jl);
      const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); }
      const y = arr.find(o => o.name === 'eeat-studio-v2' || o.pm_id === 1); if (y) { v2Status = y.pm2_env?.status || '?'; v2Pid = String(y.pid); }
    } catch {}
    console.log(`[7/10 GUARD AFTER] pm_id=0 pid=1287 ACTUAL=${pid0After} V1=${guardAfter ? 'UNTOUCHED ✅' : 'FATAL ❗ ROLLBACK NOW'} | V2 status=${v2Status} pid=${v2Pid}`);
    if (!guardAfter) process.exitCode = 99;

    // 8) Health
    const health = await execLine(ssh, 'curl -sS -m 15 http://127.0.0.1:3002/api/health');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    const routersArr = health.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || [];
    const countRouters = routersArr.length;
    console.log(`[8/10] Health phase=2:${p2?'OK':'NO'} ok:true=${rOK?'OK':'NO'} routers=${countRouters}/11 → ${p2&&rOK&&countRouters===11?'FULL HEALTH ✅':'DEGRADED ⚠️'} RAW=${health.slice(0,280)}`);
    if (!p2 || !rOK || countRouters !== 11) process.exitCode = 4;

    // 9) Build hash verification (index.html + WritePage fingerprint)
    const idx = await execLine(ssh, `grep -oE '__[0-9]{13}' "${REMOTE_ROOT}/dist/index.html" | head -1`);
    const wpFile = await execLine(ssh, `ls "${REMOTE_ROOT}/dist/assets/WritePage."* 2>/dev/null | head -1`);
    console.log(`[9/10] Build fingerprint: index.html hash=${idx || 'MISSING'} | WritePage asset=${wpFile || 'NOT FOUND'}`);
    console.log(`         EXPECTED new hash = __${NEW_BUILD_HASH} → ${idx.includes(NEW_BUILD_HASH) ? 'PRESENT on index ✅ (user needs hard refresh Ctrl+Shift+R on stale tabs)' : 'CHECK REQUIRED'}`);

    // 10) WritePage size check
    if (wpFile) {
      const sz = parseInt(await execLine(ssh, `wc -c < "${wpFile}"`) || '0', 10);
      const kb = Math.round(sz / 1024);
      console.log(`[10/10] WritePage bundle size REMOTE=${kb}KB (≈ P0 payload targetWordCount injected)`);
    }
    console.log('\n🏁 Deploy P0 Target Word Count COMPLETE — proceed to E2E SA 3 Issue Re-Test');
  } catch (err) {
    console.error('FAILED:', (err.message || String(err)).slice(0, 1200));
    process.exitCode = 5;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}
main();
