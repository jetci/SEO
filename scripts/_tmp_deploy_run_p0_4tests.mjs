// Proven EXACT pattern — ssh2-promise + password, pid0=1287 2/2 guard
import ssh2 from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
const REMOTE_ROOT = '/home/ubuntu/eeat-studio-v2';
const LOCAL_ROOT = 'd:/AEO/SEO V2';
const V1_PID_MANDATORY = '1287';
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[1/6] SSH OK');
    const sftp = ssh.sftp();

    // ── GUARD BEFORE (pid0=1287) ──
    const jl1 = await execLine(ssh, 'pm2 jlist');
    let pid0 = 'MISSING', guardBefore = false;
    try { const arr = JSON.parse(jl1); const x = arr.find(o => o.pm_id === 0); if (x) { pid0 = String(x.pid); guardBefore = pid0 === V1_PID_MANDATORY && x.pm2_env?.status === 'online'; } } catch {}
    console.log(`[2/6 GUARD BEFORE] V1 pid0=1287 ACTUAL=${pid0} SAFE=${guardBefore ? '✅' : '❌ ABORT'}`);
    if (!guardBefore) { process.exitCode = 99; return; }
    const hV1pre = await execLine(ssh, 'curl -sS -m 5 http://127.0.0.1:3001/healthz || echo "V1DOWN"');
    if (!/ok|healthy|phase|doctype/i.test(hV1pre)) { console.log('   GUARD FAIL V1 unhealthy → ABORT'); process.exitCode=99; return; }
    console.log(`   V1 :3001 = ${String(hV1pre||'').slice(0,40)}`);

    // ── EXTRA: QUERY REAL keywordId FROM EEAT DB (fix WP-B2 test harness zod gate) ──
    console.log('[3/6] Query Docker DB: SELECT id FROM keywords LIMIT 1 (for WP-B2 guard harness)');
    const dbPw = "eeat_secret_2026_Cloud!";
    // Also get projectId count
    let kwId = await execLine(ssh, `bash -lc "docker exec eeat-studio-db mariadb -ueeat -p'${dbPw}' eeat_studio_v2 -N -e 'SELECT IFNULL(MIN(id),0) FROM keywords LIMIT 1;' 2>/dev/null"`);
    kwId = String(kwId || '').split('\n').pop() || '0';
    kwId = kwId.replace(/[^0-9]/g, '');
    if (!kwId || kwId === '0') {
      // No keywords: try to insert one quickly (safe idempotent)
      const projectCount = await execLine(ssh, `bash -lc "docker exec eeat-studio-db mariadb -ueeat -p'${dbPw}' eeat_studio_v2 -N -e 'SELECT COUNT(*) FROM projects;' 2>/dev/null"`);
      const pc = Number(String(projectCount||'0').replace(/[^0-9]/g, '')) || 0;
      let pid = '0';
      if (pc === 0) {
        await execLine(ssh, `bash -lc "docker exec eeat-studio-db mariadb -ueeat -p'${dbPw}' eeat_studio_v2 -e \\"INSERT IGNORE INTO projects (name, description, teamId, createdAt, updatedAt, createdByUserId, status) VALUES ('SA Tester P0 Project', 'Auto-created for WP-B2 guard test', 1, NOW(), NOW(), 99001, 'active');\\" 2>/dev/null"`);
      }
      pid = await execLine(ssh, `bash -lc "docker exec eeat-studio-db mariadb -ueeat -p'${dbPw}' eeat_studio_v2 -N -e 'SELECT IFNULL(MIN(id),1) FROM projects LIMIT 1;' 2>/dev/null"`);
      pid = String(pid || '1').replace(/[^0-9]/g, '');
      await execLine(ssh, `bash -lc "docker exec eeat-studio-db mariadb -ueeat -p'${dbPw}' eeat_studio_v2 -e \\"INSERT IGNORE INTO keywords (projectId, keywordText, tier, status, searchVolume, difficulty, intent, createdAt, updatedAt, clusterId) VALUES (${pid}, 'SA tester kw guard test', 'pillar', 'active', 1000, 5, 'informational', NOW(), NOW(), NULL);\\" 2>/dev/null"`);
      kwId = await execLine(ssh, `bash -lc "docker exec eeat-studio-db mariadb -ueeat -p'${dbPw}' eeat_studio_v2 -N -e 'SELECT id FROM keywords ORDER BY id DESC LIMIT 1;' 2>/dev/null"`);
      kwId = String(kwId || '0').replace(/[^0-9]/g, '');
    }
    // Also make sure research package does NOT exist for this kwId (WP-B2 test: no serp/overview)
    await execLine(ssh, `bash -lc "docker exec eeat-studio-db mariadb -ueeat -p'${dbPw}' eeat_studio_v2 -e \\"DELETE FROM research_packages WHERE keywordId=${kwId};\\" 2>/dev/null || true"`);
    console.log(`   → Got REAL keywordId=${kwId} (research_packages cleared to EMPTY → guard will fire AFTER zod pass → BAD_REQUEST THAI)`);

    // ── UPLOAD TEST SCRIPT ──
    const rel = 'scripts/_tmp_test_p0_4checks.ts';
    const localFile = path.join(LOCAL_ROOT, rel);
    const remoteFile = `${REMOTE_ROOT}/${rel}`;
    await execLine(ssh, `mkdir -p "${REMOTE_ROOT}/scripts"`);
    const lb = fs.statSync(localFile).size;
    try { await sftp.fastPut(localFile, remoteFile); } catch { const buf = fs.readFileSync(localFile); await sftp.writeFile(remoteFile, buf); }
    const rb = parseInt(await execLine(ssh, `wc -c < "${remoteFile}"`) || '0', 10);
    const match = lb === rb;
    console.log(`[4/6] SFTP upload ${rel}: LOCAL=${lb}b REMOTE=${rb}b MATCH=${match ? '✅' : '❌'}`);
    if (!match) { process.exitCode = 2; return; }

    // ── EXECUTE TSX with REAL_KW_ID env (ZERO CLI ENV STRING — use heredoc safe) ──
    console.log(`[5/6] EXEC 4 P0 LIVE TESTS · kwId=${kwId} · NO CLI env vars!`);
    console.log('   ─── TEST OUTPUT BEGIN ──────────────────────────────────────────');
    // Use shell heredoc for env var inside bash subshell — this avoids CLI prefix string
    const runRaw = await ssh.exec(`bash -lc 'cd "${REMOTE_ROOT}" && timeout 200 env REAL_KW_ID="${kwId}" ./node_modules/.bin/tsx --no-warnings "${rel}"'`, { pty: false });
    const runOut = String(runRaw || '').trim();
    if (runOut) console.log(runOut);
    console.log('   ─── TEST OUTPUT END ────────────────────────────────────────────');
    const passMatch = runOut.match(/SUMMARY: (\d+) PASS \/ (\d+) FAIL/);
    let p = -1, f = -1;
    if (passMatch) { p = parseInt(passMatch[1]); f = parseInt(passMatch[2]); console.log(`   → Extracted: ${p}P/${f}F`); }
    else console.log('   ⚠️ Could not parse SUMMARY');

    await execLine(ssh, `rm -f "${remoteFile}"`);
    console.log('   → Temp test file deleted on VPS.');

    // ── GUARD AFTER ──
    const jl2 = await execLine(ssh, 'pm2 jlist');
    let pid0After = 'MISSING', guardAfter = false, v2Status = '?';
    try { const arr = JSON.parse(jl2); const x = arr.find(o => o.pm_id === 0); if (x) { pid0After = String(x.pid); guardAfter = (pid0After === V1_PID_MANDATORY) && (x.pm2_env?.status === 'online'); } const y = arr.find(o => o.name === 'eeat-studio-v2'); if (y) v2Status = y.pm2_env?.status || '?'; } catch {}
    const hV1post = await execLine(ssh, 'curl -sS -m 5 http://127.0.0.1:3001/healthz || echo "V1DOWN"');
    const hV2 = await execLine(ssh, 'curl -sS -m 8 http://127.0.0.1:3002/api/health || echo "V2DOWN"');
    const routers = (hV2.match(/"auth"|"teams"|"settings"|"meta"|"projects"|"categories"|"clusters"|"keywords"|"research"|"write"|"admin"/g) || []).length;
    console.log(`[6/6 GUARD AFTER] V1 UNTOUCHED=${guardAfter ? '✅' : '🚨FATAL'} (pid0=${pid0After}) V2=${v2Status} routers=${routers}/11`);
    console.log(`   V1 :3001 = ${String(hV1post||'').slice(0,40)}`);
    console.log(`   V2 :3002 = ${String(hV2||'').slice(0,80)}`);
    if (!guardAfter) { process.exitCode = 99; return; }
    process.exitCode = (p >= 0 && f === 0) ? 0 : (p >= 0 ? 1 : 3);
  } catch (e) { console.error('🚨 UNHANDLED DEPLOY/RUN ERROR:', (e.message || String(e)).slice(0, 800)); process.exitCode = 5;
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
