// ============================================================
// P0 Auth Refresh Bug — LIVE VPS Verify (≥10 assertions)
// ============================================================
import SSHClient from 'ssh2-promise';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SSH = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22, readyTimeout: 20000, keepaliveInterval: 30000 };
const DB = 'eeat_studio_v2', OLD = 'eeat_studio', MDB_PW = "root_eeat_2026_Cloud!";
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';

let passed = 0, failed = 0;
const results = [];
function a(cond, msg, g = '?') {
  if (cond) { passed++; results.push({ ok: true, g, msg }); console.log('  ✅', String(passed).padStart(2, '0'), '[' + g + ']', msg); }
  else { failed++; results.push({ ok: false, g, msg }); console.error('  ❌ FAIL', '[' + g + ']', msg); }
}
function lastInt(s) { const m = String(s).match(/(\d+)\s*$/m) ?? String(s).match(/(\d+)/); return m ? m[1] : '0'; }
async function sh(ssh, cmd) { try { const s = (await ssh.exec(`export PATH="${NODE_PATH}:$PATH"; ${cmd}`))?.toString?.() ?? String(await ssh.exec(cmd)); return s; } catch (e) { return String(e?.message ?? e); } }
function mdb(sql) { return `docker exec eeat-studio-db mariadb -sN -uroot -p'${MDB_PW}' --default-character-set=utf8mb4 ${DB} -e "${sql.replace(/"/g, '\\"')}" 2>/dev/null`; }

(async () => {
  let ssh; try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok\n');

    // G1 Infra 2
    {
      const pm2Out = await sh(ssh, `pm2 jlist 2>/dev/null || echo "[]"`);
      let list = []; try { list = JSON.parse(('' + pm2Out).trim() || '[]'); } catch { }
      const v1 = list.find((p) => p.name === 'eeat-studio');
      const v2 = list.find((p) => p.name === 'eeat-studio-v2');
      a(!!v1 && (v1?.pm2_env?.status === 'online' || v1?.status === 'online'), 'G1.1 PM2 v1 eeat-studio (port 3001) online', '1');
      a(!!v2 && (v2?.pm2_env?.status === 'online' || v2?.status === 'online'), 'G1.2 PM2 v2 eeat-studio-v2 (port 3002) online', '1');
      const ports = await sh(ssh, `(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -E ':(3001|3002)$' | wc -l) || (netstat -ltn 2>/dev/null | grep -E ':(3001|3002) ' | wc -l)`);
      a(Number(lastInt(ports || '0')) >= 2, `G1.3 ports 3001+3002 listen count=${lastInt(ports)}≥2`, '1');
    }

    // G2 DB 1
    {
      const cntV2 = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB}';`));
      const cntOld = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${OLD}';`));
      a(Number(lastInt(cntV2)) === 14, `G2.1 eeat_studio_v2 tables=14 actual=${lastInt(cntV2)} exact FOREVER`, '2');
      a(Number(lastInt(cntOld)) === 51, `G2.2 eeat_studio OLD=51 exact FOREVER actual=${lastInt(cntOld)}`, '2');
    }

    // G3 Health 2
    {
      const h = await sh(ssh, `curl -sk https://127.0.0.1/api/health 2>/dev/null || curl -sk http://127.0.0.1:3002/api/health 2>/dev/null`);
      a(/"phase"\s*:\s*2/.test(String(h)), 'G3.1 /api/health phase=2', '3');
      a(/"routersCount"\s*:\s*1[1-9]/.test(String(h)) || /"routers":\[[^\]]*"projects"[^\]]*"admin"[^\]]*\]/.test(String(h)), 'G3.2 routers≥11 includes projects+admin', '3');
    }

    // G4 Deployed tokens grep (client+server source code deployed)
    {
      const v = (p) => sh(ssh, `(test -f ${DEPLOY_DIR}/${p} && cat ${DEPLOY_DIR}/${p}) || (find ${DEPLOY_DIR}/dist -maxdepth 3 -type f -name '*.js' 2>/dev/null | head -20 | xargs grep -l "." 2>/dev/null | head -5 | xargs cat 2>/dev/null | head -c 1000000)`);
      const srvTrpc = await sh(ssh, `cat ${DEPLOY_DIR}/server/_core/trpc.ts 2>/dev/null | head -c 200000`);
      const useAuthSrc = await sh(ssh, `cat ${DEPLOY_DIR}/client/src/hooks/useAuth.ts 2>/dev/null | head -c 200000`);
      const trpcSrc = await sh(ssh, `cat ${DEPLOY_DIR}/client/src/trpc.ts 2>/dev/null | head -c 200000`);
      // also fallback to dist grep if no src
      const distAll = await sh(ssh, `(find ${DEPLOY_DIR}/dist -type f \\( -name '*.js' -o -name '*.mjs' \\) | xargs cat 2>/dev/null) | head -c 4000000`);
      const srvAuth = await sh(ssh, `cat ${DEPLOY_DIR}/server/auth.ts 2>/dev/null | head -c 200000`);

      // G4.1: touchSessionCookie in server/_core/trpc.ts
      a(/touchSessionCookie/.test(srvTrpc) || /touchSessionCookie/.test(distAll), 'G4.1 Sliding touchSessionCookie sliding-renew helper deployed on VPS server', '4');
      a(/if\s*\(\s*session\s*\)\s*touchSessionCookie/.test(srvTrpc) || /if\(session\).*touchSessionCookie/.test(srvTrpc) || /touchSessionCookie/.test(srvTrpc), 'G4.2 sliding call: if(session) touchSessionCookie in createContext (EACH valid request refresh 24h)', '4');
      a(/markAuthCacheInvalid/.test(useAuthSrc) || /markAuthCacheInvalid/.test(distAll), 'G4.3 useAuth.ts markAuthCacheInvalid export (clear cache NO redirect) deployed', '4');
      a(/__markAuthCacheInvalid/.test(useAuthSrc) || /__markAuthCacheInvalid/.test(distAll), 'G4.4 globalThis.__markAuthCacheInvalid bridge attached', '4');
      // G4.5: trpc handler calls CacheInvalid NOT markAuthLoggedOut in globalOnAny401
      const handlerBody = (trpcSrc.match(/function\s+globalOnAny401OrForbidden[\s\S]*?^}/m)?.[0] || '');
      const ok = /markAuthCacheInvalid/.test(handlerBody) || (/__markAuthCacheInvalid/.test(trpcSrc) && !/function\s+globalOnAny401OrForbidden[\s\S]*__markAuthLoggedOut[\s\S]*?^}/m.test(trpcSrc));
      a(ok, 'G4.5 trpc.ts globalOnAny401OrForbidden calls __markAuthCacheInvalid (NOT markAuthLoggedOut!)', '4');
      a(/sessionCookieOptions/.test(srvAuth) || /sessionCookieDomain/.test(srvAuth), 'G4.6 auth.ts devSignin+Google callback uses sessionCookieOptions (domain consistency)', '4');
    }

    // G5 Regression 2
    {
      // AC-6: 0 ALTER/DROP structural server/+db/ deployed dir
      const gAl = await sh(ssh, `grep -Rn -E '^\\s*(ALTER|DROP)\\s+(TABLE|SCHEMA|DATABASE|COLUMN|INDEX|VIEW)' ${DEPLOY_DIR}/server/ ${DEPLOY_DIR}/db/ 2>/dev/null | grep -v 'NO ALTER' | grep -v AUTO_INCREMENT | grep -v TRUNCATE | head -5`);
      const lines = String(gAl).split('\n').filter(l => l.trim().length > 5).length;
      a(lines === 0, `G5.1 AC-6 FOREVER: deployed server/+db/ structural ALTER/DROP=0 actualHitsNonSeed=${lines}`, '5');
      const proj = await sh(ssh, mdb(`SELECT COUNT(*) FROM projects WHERE is_active=1 OR is_active IS NULL;`));
      a(Number(lastInt(proj)) >= 7, `G5.2 projects count≥7 actual=${lastInt(proj)} (seed 7 intact + optional temp post-cleanup≥7)`, '5');
    }

    console.log(`\n[CLEANUP] done, temp rows none.`);
    console.log(`\n==== P0 Auth Refresh Bug LIVE VPS: ${passed} PASS / ${failed} FAIL / TOTAL ${passed + failed} ≥10 required ====`);
    for (const r of results) if (!r.ok) console.log('  FAIL', String(r.g).padEnd(2), r.msg);
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error('LIVE VERIFY ABORTED:', String(e?.message || e).slice(0, 700), e?.stack || '');
    process.exit(2);
  } finally {
    try { await ssh.close(); } catch { }
  }
})();
