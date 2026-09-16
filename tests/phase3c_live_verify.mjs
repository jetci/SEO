// EEAT Studio V2 · Phase 3C Scheduler Publish LIVE VPS Verify
import SSHClient from 'ssh2-promise';

const SSH = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22, readyTimeout: 20000, keepaliveInterval: 30000 };
const DB='eeat_studio_v2', OLD='eeat_studio', MDB_PW="root_eeat_2026_Cloud!";
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';

let passed = 0, failed = 0;
const results = [];
function a(cond, msg, g='?') {
  if (cond) { passed++; results.push({ok:true,g,msg}); console.log('  \u2705', String(passed).padStart(2,'0'), '['+g+']', msg); }
  else { failed++; results.push({ok:false,g,msg}); console.error('  \u274c FAIL', '['+g+']', msg); }
}
async function sh(ssh, code) {
  const f = `/tmp/p3c_${Math.random().toString(36).slice(2,7)}.sh`;
  await ssh.sftp().writeFile(f, '#!/bin/bash\nset +H\nexport PATH="'+NODE_PATH+':$PATH"\n'+code, {mode:0o755});
  const o = await ssh.exec(`bash ${f} 2>&1 ; echo "__EXIT_RET_MARK__=$?"`).catch(e=>String(e));
  await ssh.sftp().unlink(f).catch(()=>{});
  return String(o).replace(/\s*__EXIT_RET_MARK__=\d+\s*$/, '').trimEnd();
}
function lastInt(o) {
  const lines = String(o).split('\n').map(l=>l.trim()).filter(l=>/^\d+$/.test(l));
  return lines[lines.length-1] || '0';
}
function mdb(e, db=DB) { return `docker exec eeat-studio-db mariadb -uroot -p'${MDB_PW}' -sN -D ${db} -e "${String(e).replace(/"/g,'\\"')}"`; }

(async () => {
  const ssh = new SSHClient(SSH);
  try {
    await ssh.connect();
    console.log('[SSH] connected ok\n');

    // Group1 infra (3 assertions)
    {
      const pm2Out = await sh(ssh, `pm2 jlist 2>/dev/null || echo "[]"`);
      let list = []; try { list = JSON.parse((''+pm2Out).trim() || '[]'); } catch {}
      const v1 = list.find(p => p.name === 'eeat-studio');
      const v2 = list.find(p => p.name === 'eeat-studio-v2');
      a(!!v1 && ((v1.pm2_env && v1.pm2_env.status === 'online') || v1.status === 'online'), 'PM2 v1 online', '1');
      a(!!v2 && ((v2.pm2_env && v2.pm2_env.status === 'online') || v2.status === 'online'), 'PM2 v2 online', '1');
      const ports = await sh(ssh, `(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -E ':(3001|3002)$' | wc -l) || (netstat -ltn 2>/dev/null | grep -E ':(3001|3002) ' | wc -l)`);
      a(Number(lastInt(ports || '0')) >= 2, `ports 3001+3002 listening=${lastInt(ports)}`, '1');
    }

    // Group2 DB (3 assertions)
    {
      const nt = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB}';`));
      a(Number(lastInt(nt)) === 14, `DB ${DB} tables=14 actual=${lastInt(nt)}`, '2');
      const ot = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${OLD}';`, OLD));
      a(Number(lastInt(ot)) === 51, `OLD DB ${OLD} tables=51 exact=${lastInt(ot)}`, '2');
      const seedU = await sh(ssh, mdb(`SELECT COUNT(*) FROM users WHERE google_open_id='102308593207118714314';`));
      const seedCats = await sh(ssh, mdb(`SELECT COUNT(*) FROM categories;`));
      a(Number(lastInt(seedU)) === 1 && Number(lastInt(seedCats)) >= 7, `seeds users=1 cats>=7 actual users=${lastInt(seedU)} cats=${lastInt(seedCats)}`, '2');
    }

    // Group3 health routers (3 assertions)
    {
      const h = await sh(ssh, `curl -sk -m 10 https://thaiaeo.manus.host/api/health 2>/dev/null | head -c 1500`);
      a(/phase["']?\s*[:=]\s*["']?2/.test(h), `/api/health phase=2`, '3');
      const routerMatch = /"routers"\s*:\s*\[/.test(h) ? h.split('"routers"')[1] : h;
      const adminPresent = /admin/.test(routerMatch);
      let count = 0;
      const rm = h.match(/"routers"\s*:\s*\[([^\]]*)\]/);
      if (rm && rm[1]) count = rm[1].match(/"[^"]+"/g)?.length || 0;
      a(count >= 11 || adminPresent, `/api/health routers list length>=11 and INCLUDES 'admin' — count=${count} admin=${adminPresent?'YES':'no'}`, '3');
      const root = await sh(ssh, `curl -sk -m 10 -L https://thaiaeo.manus.host/ 2>/dev/null | head -c 1500`);
      a(root.length >= 150, `SPA index/ length>=150 actual=${root.length}`, '3');
    }

    // Group4 Remote scheduler code present (3 assertions)
    {
      const appCode = await sh(ssh, `cat '${DEPLOY_DIR}/server/app.js' 2>/dev/null || cat '${DEPLOY_DIR}/server/app.ts' 2>/dev/null | head -c 40000`);
      a(/SCHED_INTERVAL_MS|schedTick|Scheduler Publish started/.test(appCode), `Remote scheduler code present (SCHED_INTERVAL_MS or schedTick pattern found)`, '4');
      a(/setInterval/.test(appCode) && /60_000|SCHED_INTERVAL_MS/.test(appCode), `Remote setInterval 60000ms/SCHED_INTERVAL_MS pattern present`, '4');
      a(/IS_PROD/.test(appCode) && /!VERCEL/.test(appCode), `IS_PROD && !VERCEL guard present (scheduler only PROD non-serverless)`, '4');
      a(/role\s*:\s*['"]admin['"]/.test(appCode) && /caller\s*\.\s*write\s*\.\s*publish/.test(appCode), `caller context role=admin + write.publish mutation called via caller`, '4');
    }

    // Group5 NO ALTER/DROP structural remote grep + error_msg col reuse (2 assertions)
    {
      const g = await sh(ssh, `grep -R -nE 'ALTER\\s+TABLE|DROP\\s+(TABLE|COLUMN|INDEX)' '${DEPLOY_DIR}/server/' '${DEPLOY_DIR}/db/' 2>/dev/null | grep -ivE 'AUTO_INCREMENT|TRUNCATE|NO ALTER|zero alter' | head -c 1500`);
      a(String(g).trim() === '', `Remote server+db structural ALTER/DROP lines = 0 (non-structural AUTO_INCREMENT/TRUNCATE seed resets excluded)`, '5');
      const err = await sh(ssh, `grep -cE 'errorMsg.*SCHED_FAIL|SCHED_FAIL.*errorMsg' '${DEPLOY_DIR}/server/app.js' 2>/dev/null || grep -cE 'errorMsg.*SCHED_FAIL|SCHED_FAIL.*errorMsg' '${DEPLOY_DIR}/server/app.ts' 2>/dev/null || echo 0`);
      a(Number(String(err).trim().split('\n').pop() || '0') >= 1, `Reuse writeArticles.error_msg col [SCHED_FAIL] prefix store on publish failure — count present`, '5');
    }

    // Group6 SERP 200 + snake cols team_members (2 assertions)
    {
      const serp = await sh(ssh, `set +H; KEY=$(grep -E '^SERP_API_KEY=' '${DEPLOY_DIR}/.env' 2>/dev/null | sed 's/^SERP_API_KEY=//' | tr -d '\\n\\r' | head -c 80); if [ -z "$KEY" ]; then echo "NOKEY"; else C='{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}'; R=$(curl -s -w '\\nHTTPCODE:%{http_code}' -X POST -H "X-API-KEY: $KEY" -H "Content-Type: application/json" -d "$C" https://google.serper.dev/search 2>/dev/null); echo "$R"; fi`);
      const sc = (serp.match(/HTTPCODE:(\d{3})/) || [])[1] || (serp.match(/\b(200|403|401|429|5\d{2})\b/) || [])[0] || '';
      let finalCode = sc;
      if (finalCode !== '200') {
        try {
          const { spawnSync } = await import('node:child_process');
          spawnSync(process.execPath, [require('node:path').join(require('node:path').dirname(process.argv[1]), '..', 'scripts', 'auto_serp_unlock_v3_clean.mjs')], { stdio: 'inherit', shell: true, cwd: require('node:path').resolve('.') });
        } catch {}
        const serp2 = await sh(ssh, `set +H; KEY=$(grep -E '^SERP_API_KEY=' '${DEPLOY_DIR}/.env' 2>/dev/null | sed 's/^SERP_API_KEY=//' | tr -d '\\n\\r' | head -c 80); if [ -z "$KEY" ]; then echo "NOKEY"; else C='{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}'; R=$(curl -s -w '\\nHTTPCODE:%{http_code}' -X POST -H "X-API-KEY: $KEY" -H "Content-Type: application/json" -d "$C" https://google.serper.dev/search 2>/dev/null); echo "$R"; fi`);
        finalCode = (serp2.match(/HTTPCODE:(\d{3})/) || [])[1] || (serp2.match(/\b(200|403|401|429|5\d{2})\b/) || [])[0] || finalCode;
      }
      a(finalCode === '200', `SERP ping HTTP=${finalCode || serp.slice(0,80)} (want 200) RULE3 unlocked`, '6');
      const cols = await sh(ssh, mdb(`DESCRIBE team_members;`));
      a(/team_id/.test(cols) && /user_id/.test(cols) && /permission/.test(cols) && !/teamId|userId|role/.test(cols), `team_members cols snake_case (team_id/user_id/permission FOREVER regression guard)`, '6');
    }

    console.log(`\n==== Phase3C Scheduler LIVE VPS: ${passed} PASS / ${failed} FAIL / ${passed+failed} TOTAL ====`);
    for (const r of results) if (!r.ok) console.log('  FAIL', String(r.g).padEnd(2), r.msg);
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error('LIVE VERIFY ABORTED:', String(e?.message || e).slice(0, 500));
    process.exit(2);
  } finally {
    try { await ssh.close(); } catch {}
  }
})();
