import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL_DIST = 'd:/AEO/SEO V2/dist';
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const REMOTE_DIST = `${REMOTE_ROOT}/dist`;
const REMOTE_BUILDER = `${REMOTE_ROOT}/server/services/articleWriterService.ts`;
const LOCAL_BUILDER = 'd:/AEO/SEO V2/server/services/articleWriterService.ts';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
function walk(dir, list = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, f.name);
    if (f.isDirectory()) walk(fp, list); else list.push(fp);
  }
  return list;
}

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/10] SSH connected');
    const sftp = ssh.sftp();

    // 1. Ensure builder TS file still matches (after previous sync, no regression)
    const localB = fs.statSync(LOCAL_BUILDER).size;
    const remBLine = await execLine(ssh, `wc -c < "${REMOTE_BUILDER}"`);
    const remB = parseInt(remBLine || '0', 10);
    console.log(`[2/10] Backend builder bytes: LOCAL=${localB} REMOTE=${remB} MATCH=${localB === remB ? '✅' : '❌'}`);
    if (localB !== remB) { await sftp.fastPut(LOCAL_BUILDER, REMOTE_BUILDER); console.log('  → re-synced builder'); }

    // 2. Upload dist/ recursively → VPS dist
    const files = walk(LOCAL_DIST);
    const totalFiles = files.length;
    let okFiles = 0;
    for (const fp of files) {
      const rel = path.relative(LOCAL_DIST, fp).split(path.sep).join('/');
      const rp = `${REMOTE_DIST}/${rel}`;
      const rdir = rp.substring(0, rp.lastIndexOf('/'));
      if (rdir && rdir !== REMOTE_DIST) await execLine(ssh, `mkdir -p "${rdir}" 2>/dev/null || true`);
      try {
        await sftp.fastPut(fp, rp, { concurrency: 32, chunkSize: 131072 });
        okFiles++;
      } catch (err) { console.error(`  ✗ fail: ${rel} → ${err.message}`); }
    }
    console.log(`[3/10] Client dist uploaded: ${okFiles}/${totalFiles} files`);

    // 3. FINGERPRINT: verify built WritePage bundle contains FE patch keyword 'whitespace-pre-wrap'
    const writeBundle = await execLine(ssh, `ls -1 ${REMOTE_DIST}/assets/WritePage.*.js 2>/dev/null | head -1`);
    let fingerprintOk = false;
    if (writeBundle) {
      const fpHit = parseInt(await execLine(ssh, `grep -c 'whitespace-pre-wrap\\|font-extrabold' "${writeBundle}" 2>/dev/null || echo 0`), 10);
      fingerprintOk = fpHit > 0;
      console.log(`[4/10] FE patch fingerprint grep in ${path.basename(writeBundle)} → hits=${fpHit}  PRESENT=${fingerprintOk ? '✅' : '❌ MISSING!'}`);
    } else console.log('[4/10] ❌ WritePage bundle file NOT FOUND in remote dist/assets');

    // 4. Clear all caches (tsx + node modules)
    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_cleared');
    console.log('[5/10] TSX + module caches cleared');

    // 5. ALWAYS re-append demo signin vars (ENV RESET every v2 restart bug)
    await execLine(ssh, `cd ${REMOTE_ROOT} && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_done`);
    console.log('[6/10] Demo Signin ENV vars re-appended');

    // 6. PM2 restart ONLY v2 id=107
    await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -3');
    await new Promise(r => setTimeout(r, 4000));
    console.log('[7/10] PM2 eeat-studio-v2 id=107 restarted');

    // 7. FOREVER GUARD pid0=1287 UNTOUCHED (UPDATED 2026-09-16: VPS host rebooted reset PID, OLD=175437 INVALID → NEW ACTUAL=1287)
    const jl = await execLine(ssh, 'pm2 jlist');
    let guard = false, pid0 = 'MISSING';
    try {
      const arr = JSON.parse(jl);
      const x = arr.find(o => o.pm_id === 0);
      if (x) { pid0 = String(x.pid); guard = (pid0 === '1287') && (x.pm2_env?.status === 'online'); }
    } catch (_) {}
    console.log(`[8/10] FOREVER GUARD pm_id=0 pid=1287 → ACTUAL=${pid0}  SAFE=${guard ? '✅' : '❌ FATAL ROLLBACK NOW!'}`);
    if (!guard) process.exitCode = 99;

    // 8. Health V2
    const health = await execLine(ssh, 'curl -sS -m 10 http://127.0.0.1:3002/api/health 2>/dev/null');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    console.log(`[9/10] Health phase=2:${p2?'✅':'❌'} ok:true=${rOK?'✅':'❌'} RAW=${health.slice(0,260)}`);
    if (!p2 || !rOK) process.exitCode = 4;

    // 9. Optional: count total files + bundle sizes
    const totalKb = parseInt(await execLine(ssh, `du -sk ${REMOTE_DIST} | cut -f1`),10);
    console.log(`[10/10] Remote dist/ size = ${totalKb} KB (≥1860KB threshold? ${totalKb>=1860?'✅':'⚠️ '+totalKb})`);
  } catch (err) {
    console.error('DEPLOY FAILED:', (err.message || String(err)).slice(0, 800));
    process.exitCode = 5;
  } finally {
    try { await ssh.close(); } catch (_) {}
  }
}

main();
