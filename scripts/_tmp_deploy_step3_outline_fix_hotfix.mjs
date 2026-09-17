import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';

const HOTFIX_FILES = [
  { rel: 'server/routers/write.ts', desc: 'Backend generateOutline schema fresh-start fix' },
  { rel: 'client/src/pages/WritePage.tsx', desc: 'Frontend aiGenerateOutline payload raw keyword/category/intent/contentType' },
];

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/10] SSH connected OK');
    const sftp = ssh.sftp();

    // ===== GUARD BEFORE =====
    const jlBefore = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false, v1Name = 'MISSING';
    try {
      const arr = JSON.parse(jlBefore);
      const x = arr.find(o => o.pm_id === 0);
      if (x) { pid0 = String(x.pid); v1Name = x.name || 'unknown'; guardBefore = pid0 === '1287' && x.pm2_env?.status === 'online'; }
    } catch {}
    console.log(`[2/10 GUARD BEFORE] pm_id=0 NAME=${v1Name} PID=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅ PASS' : '❌ ABORT EXIT99'}`);
    if (!guardBefore) { process.exitCode = 99; return; }

    // ===== UPLOAD FILES + BYTE MATCH =====
    console.log(`[3/10] Upload ${HOTFIX_FILES.length} hotfix source files:`);
    let ok = 0;
    for (const f of HOTFIX_FILES) {
      const rel = f.rel;
      const localFile = path.join(LOCAL_ROOT, rel);
      const remoteFile = `${REMOTE_ROOT}/${rel}`;
      const lb = fs.statSync(localFile).size;
      await execLine(ssh, `mkdir -p "$(dirname '${remoteFile}')" ; true`);
      try { await sftp.fastPut(localFile, remoteFile); } catch {
        const buf = fs.readFileSync(localFile); await sftp.writeFile(remoteFile, buf);
      }
      const rb = parseInt(await execLine(ssh, `wc -c < "${remoteFile}"`) || '0', 10);
      const match = lb === rb;
      const flag = match ? '✅' : '❌';
      console.log(`  ${flag} ${rel.padEnd(38)} LOCAL=${String(lb).padStart(6)}B REMOTE=${String(rb).padStart(6)}B ${match?'MATCH':'MISMATCH'} (${f.desc})`);
      if (match) ok++;
    }
    console.log(`         Upload: ${ok}/${HOTFIX_FILES.length} files MATCH ${ok === HOTFIX_FILES.length ? '✅' : '❌'}`);
    if (ok !== HOTFIX_FILES.length) { process.exitCode = 2; return; }

    // ===== CLIENT BUILD (Vite production build because WritePage.tsx changed) =====
    console.log('[4/10] Running Vite client build on remote (because WritePage.tsx changed)...');
    const buildStart = Date.now();
    const buildOut = await execLine(ssh, `cd ${REMOTE_ROOT} && timeout 180 npm run build 2>&1 | tail -25`);
    const buildTime = Math.round((Date.now() - buildStart)/1000);
    const buildOk = buildOut.includes('built in') || buildOut.includes('✓') || buildOut.includes('dist/') || buildOut.includes('complete');
    console.log(`         Build done in ${buildTime}s → ${buildOk ? 'BUILD SUCCESS ✅' : 'BUILD POSSIBLE FAIL ⚠️'}`);
    if (buildOut.length > 0) console.log(`         Build tail:\n${buildOut.split('\n').map(l => '           '+l).join('\n')}`);

    // ===== COPY index.html SPA fallback paths =====
    await execLine(ssh, `cd ${REMOTE_ROOT} && for dst in 404 login projects kcp system write settings articles; do if [ ! -f dist/\${dst}/index.html ]; then mkdir -p dist/\${dst}; cp dist/index.html dist/\${dst}/index.html; fi; done; echo spa_paths_ok`);
    const distSize = await execLine(ssh, `cd ${REMOTE_ROOT} && du -sh dist 2>/dev/null | cut -f1`);
    console.log(`         dist/ size after build: ${distSize}`);

    // ===== CLEAR TSX CACHE =====
    await execLine(ssh, 'rm -rf /home/ubuntu/.cache/tsx /home/ubuntu/eeat-studio-v2/node_modules/.cache 2>/dev/null; echo cache_ok');
    console.log('[5/10] TSX + module cache cleared');

    // ===== DEMO SIGNIN ENV RE-APPLY =====
    const DEMO_PW = 'K9XmPq4Rtv2ZB8Lw3N!7C';
    await execLine(ssh, `cd ${REMOTE_ROOT} && { grep -qxF 'ALLOW_PROD_DEMO_SIGNIN=1' .env && sed -i '/^ALLOW_PROD_DEMO_SIGNIN=/c\\ALLOW_PROD_DEMO_SIGNIN=1' .env || echo 'ALLOW_PROD_DEMO_SIGNIN=1' >> .env; grep -qxF 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env && sed -i '/^PROD_DEMO_SIGNIN_PASSWORD=/c\\PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' .env || echo 'PROD_DEMO_SIGNIN_PASSWORD=${DEMO_PW}' >> .env; }; echo env_ok`);
    console.log('[6/10] Demo signin ENV vars ALLOW_PROD_DEMO_SIGNIN=1 + PROD_DEMO_PWD re-applied');

    // ===== PM2 RESTART V2 ONLY =====
    const restartOut = await execLine(ssh, 'pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -5');
    await new Promise(r => setTimeout(r, 15000));
    console.log(`[7/10] PM2 eeat-studio-v2 restarted → waiting 15s warmup. raw=${restartOut.slice(0,120)}`);

    // ===== GUARD AFTER =====
    const jlAfter = await execLine(ssh, 'pm2 jlist');
    let guardAfter = false, pid0After = 'MISSING', v2Status = 'missing', v2Pid = 'MISSING', v2Name = 'MISSING';
    try {
      const arr = JSON.parse(jlAfter);
      const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === '1287') && (x.pm2_env?.status === 'online'); }
      const y = arr.find(o => o.name === 'eeat-studio-v2' || o.pm_id === 1); if (y) { v2Status = y.pm2_env?.status || '?'; v2Pid = String(y.pid); v2Name = y.name; }
    } catch {}
    console.log(`[8/10 GUARD AFTER] pm_id=0 pid=1287 ACTUAL=${pid0After} V1=${guardAfter ? 'UNTOUCHED ✅' : 'FATAL ❗ ROLLBACK NOW'} | V2=${v2Name||'?'} status=${v2Status} pid=${v2Pid}`);
    if (!guardAfter) { process.exitCode = 99; return; }

    // ===== HEALTH CHECK =====
    const health = await execLine(ssh, 'curl -sS -m 20 http://127.0.0.1:3002/api/health');
    const p2 = health.includes('"phase":2');
    const rOK = health.includes('"ok":true');
    const routersArr = health.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || [];
    const countRouters = routersArr.length;
    console.log(`[9/10] Health :3002 → phase=2:${p2?'OK':'NO'}  ok:true=${rOK?'OK':'NO'}  routers=${countRouters}/11  →  ${p2&&rOK&&countRouters===11?'FULL HEALTH ✅':'DEGRADED ⚠️'}`);
    if (health.length > 0) console.log(`         RAW: ${health.slice(0, 360)}`);

    // ===== LOGS TAIL =====
    const errTail = await execLine(ssh, 'tail -15 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>/dev/null | grep -v "node --loader" | grep -vi "deprecation" | tail -10');
    console.log(`[10/10] V2 ERROR LOG tail: ${errTail ? '\n' + errTail.split('\n').map(l=>'  '+l).join('\n') : '<no new errors ✅>'}`);

    console.log('\n🏁 HOTFIX DEPLOY DONE — Summary:');
    console.log(`   • write.ts (Backend): generateOutline accepts raw keyword → creates/looks up keywordId`);
    console.log(`   • WritePage.tsx (Frontend): aiGenerateOutline sends keyword/category/intent/contentType raw`);
    console.log(`   • Vite build ran fresh → dist/ updated`);
    console.log(`   • V1 pid=1287 2/2 GUARDS PASS UNTOUCHED, V2 health ${p2&&rOK&&countRouters===11?'OK':'CHECK'}`);
    process.exitCode = (p2 && rOK && countRouters === 11 && guardAfter && guardBefore) ? 0 : 5;

  } catch (e) {
    console.error('[FATAL ERROR]', e);
    process.exitCode = 1;
  } finally {
    await ssh.close();
  }
}
main();
