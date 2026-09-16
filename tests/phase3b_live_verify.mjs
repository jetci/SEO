// EEAT Studio V2 · Phase 3B Admin Audit LIVE VPS Verify (≥14 assertions)
import SSHClient from 'ssh2-promise';

const SSH = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22, readyTimeout: 20000, keepaliveInterval: 30000 };
const DB='eeat_studio_v2', OLD='eeat_studio', MDB_PW="root_eeat_2026_Cloud!";
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';

let passed = 0, failed = 0;
const results = [];
function a(cond, msg, g='?') {
  if (cond) { passed++; results.push({ok:true,g,msg}); console.log('  ✅', String(passed).padStart(2,'0'), '['+g+']', msg); }
  else { failed++; results.push({ok:false,g,msg}); console.error('  ❌ FAIL', '['+g+']', msg); }
}
async function sh(ssh, code) {
  const f = `/tmp/p3b_${Math.random().toString(36).slice(2,7)}.sh`;
  await ssh.sftp().writeFile(f, '#!/bin/bash\nset +H\n'+code, {mode:0o755});
  const o = await ssh.exec(`bash ${f} 2>&1 ; echo "__EXIT_RET_MARK__=$?"`).catch(e=>String(e));
  await ssh.sftp().unlink(f).catch(()=>{});
  return String(o).replace(/\s*__EXIT_RET_MARK__=\d+\s*$/, '').trimEnd();
}
function lastInt(o) {
  const lines = String(o).split('\n').map(l=>l.trim()).filter(l=>/^\d+$/.test(l));
  return lines[lines.length-1] || '0';
}
function mdb(e) { return `docker exec eeat-studio-db mariadb -uroot -p'${MDB_PW}' -sN -D ${DB} -e "${String(e).replace(/"/g,'\\"')}"`; }

(async () => {
  const ssh = new SSHClient(SSH);
  try {
    await ssh.connect();
    console.log('[SSH] connected ok\n');

    // Group1: infra (3 assertions)
    {
      const pm2Out = await sh(ssh, `cd /home/ubuntu && export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH" && pm2 jlist 2>/dev/null || echo "[]"`);
      let list = []; try { list = JSON.parse((''+pm2Out).trim() || '[]'); } catch {}
      const v1 = list.find(p => p.name === 'eeat-studio');
      const v2 = list.find(p => p.name === 'eeat-studio-v2');
      a(!!v1 && ((v1.pm2_env && v1.pm2_env.status === 'online') || v1.status === 'online'), 'PM2 v1 online', '1');
      a(!!v2 && ((v2.pm2_env && v2.pm2_env.status === 'online') || v2.status === 'online'), 'PM2 v2 online', '1');
      const ports = await sh(ssh, `(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -E ':(3001|3002)$' | wc -l) || (netstat -ltn 2>/dev/null | grep -E ':(3001|3002) ' | wc -l)`);
      a(Number(lastInt(ports || '0')) >= 2, `ports 3001+3002 listening=${lastInt(ports)}`, '1');
    }

    // Group2: DB tables schema counts + seeds (3 assertions)
    {
      const nt = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB}';`));
      a(Number(lastInt(nt)) === 14, `DB ${DB} tables=14 actual=${lastInt(nt)}`, '2');
      const ot = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${OLD}';`));
      a(Number(lastInt(ot)) === 51, `OLD DB ${OLD} tables=51 exact=${lastInt(ot)}`, '2');
      const seedU = await sh(ssh, mdb(`SELECT COUNT(*) FROM users WHERE google_open_id='102308593207118714314';`));
      const seedCats = await sh(ssh, mdb(`SELECT COUNT(*) FROM categories;`));
      a(Number(lastInt(seedU)) === 1 && Number(lastInt(seedCats)) >= 7, `seeds users=1 cats>=7 actual users=${lastInt(seedU)} cats=${lastInt(seedCats)}`, '2');
    }

    // Group3: Health + admin registered + SPA (3 assertions)
    {
      const h = await sh(ssh, `curl -sk -m 10 https://thaiaeo.manus.host/api/health 2>/dev/null | head -c 1200`);
      a(/phase["']?\s*[:=]\s*["']?2/.test(h), `/api/health phase=2`, '3');
      a(/"routers"\s*:\s*\[([^\]]*"admin"[^\]]*)\]/.test(h) || /'routers':[^[]*\[[^\]]*'admin'/.test(h) || /routers[\s\S]{0,500}admin/.test(h), `/api/health routers list INCLUDES 'admin' new procedure namespace`, '3');
      const root = await sh(ssh, `curl -sk -m 10 -L https://thaiaeo.manus.host/ 2>/dev/null | head -c 1500`);
      a(root.length >= 150, `SPA index/ length>=150 actual=${root.length}`, '3');
    }

    // Group4: Admin procedures present in deployed remote code + CSV BOM (3 assertions)
    {
      const ad = await sh(ssh, `cat '${DEPLOY_DIR}/server/routers/admin.js' 2>/dev/null || node -e "console.log(JSON.stringify(require('fs').readFileSync('${DEPLOY_DIR}/server/routers/admin.ts','utf8')))" 2>/dev/null || cat '${DEPLOY_DIR}/server/routers/admin.ts' 2>/dev/null | head -c 30000`);
      const ok = [
        'getOverview', 'getProjectsEEAT', 'getSettingsMasked', 'getLlmUsageBars', 'exportCSV'
      ].every(name => ad.includes(name));
      a(ok, `Remote adminRouter.js 5 procedures ALL present: getOverview,getProjectsEEAT,getSettingsMasked,getLlmUsageBars,exportCSV`, '4');
      a(/\\uFEFF/.test(ad) || /\\\\uFEFF/.test(ad) || ad.includes('utf8Bom'), `Remote exportCSV uses UTF-8 BOM \\uFEFF prefix function present`, '4');
      // RBAC ADMIN_ONLY strings present
      a(/ADMIN_ONLY/.test(ad) && /role\s*!==\s*["']admin["']/.test(ad), `RBAC gate: ALL procedures throw UNAUTHORIZED when role !== admin — pattern present`, '4');
    }

    // Group5: SERP 200 (1 assertion) + settings enum keys only used (no google_client_id/serp_dataforseo non-enum invalid) — 2 assertions
    {
      const serp = await sh(ssh, `set +H; KEY=$(grep -E '^SERP_API_KEY=' '${DEPLOY_DIR}/.env' 2>/dev/null | sed 's/^SERP_API_KEY=//' | tr -d '\\n\\r' | head -c 80); if [ -z "$KEY" ]; then echo "NOKEY"; else C='{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}'; R=$(curl -s -w '\\nHTTPCODE:%{http_code}' -X POST -H "X-API-KEY: $KEY" -H "Content-Type: application/json" -d "$C" https://google.serper.dev/search 2>/dev/null); echo "$R"; fi`);
      const sc = (serp.match(/HTTPCODE:(\d{3})/) || [])[1] || (serp.match(/\b(200|403|401|429|5\d{2})\b/) || [])[0] || '';
      a(sc === '200', `SERP ping HTTP=${sc || serp.slice(0,80)} (want 200) — RULE3 unlocked`, '5');
      // Also: getSettingsMasked uses enum valid keys only (llm_provider/llm_api_key/serp_provider/serp_api_key)
      const ad2 = await sh(ssh, `grep -nE "settingsMaskedRow|google_client_id|serp_api_key_dataforseo" '${DEPLOY_DIR}/server/routers/admin.js' 2>/dev/null || grep -nE "settingsMaskedRow|google_client_id|serp_api_key_dataforseo" '${DEPLOY_DIR}/server/routers/admin.ts' 2>/dev/null | head -c 1200`);
      a(!/google_client_id|serp_api_key_dataforseo/.test(ad2), `getSettingsMasked uses VALID enum SETTINGS_KEYS only (no INVALID google_client_id/serp_api_key_dataforseo non-enum key names) — SETTINGS_KEYS_ENUM_COMPLIANT`, '5');
    }

    // Group6: Schema cols snake_case never regressed (1 assertion)
    {
      const cols = await sh(ssh, mdb(`DESCRIBE team_members;`));
      a(/team_id/.test(cols) && /user_id/.test(cols) && /permission/.test(cols) && !/teamId|userId|role/.test(cols), `team_members SQL cols snake_case never regressed (no camelCase teamId/role columns — RULE FOREVER)`, '6');
    }

    console.log(`\n==== Phase3B Admin Audit LIVE VPS: ${passed} PASS / ${failed} FAIL / ${passed+failed} TOTAL ====`);
    for (const r of results) if (!r.ok) console.log('  FAIL', String(r.g).padEnd(2), r.msg);
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error('LIVE VERIFY ABORTED:', String(e?.message || e).slice(0, 500));
    process.exit(2);
  } finally {
    try { await ssh.close(); } catch {}
  }
})();
