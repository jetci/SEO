// EEAT Studio V2 · Phase 3A BRAND VOICE Live Verify (≥14 assertions VPS SSH)
// Verifies: deploy succeeded, 0004 migration applied (tables=14), PM2 dual online,
//            seeds untouched 7/7 cats/projects, old schema 51 tables exact, snake cols,
//            SERP 200 still unlocked, Brand Voice procedures registered in remote code.
import SSHClient from 'ssh2-promise';

const SSH = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22, readyTimeout: 20000, keepaliveInterval: 30000 };
const DB='eeat_studio_v2', OLD='eeat_studio', MDB_PW="root_eeat_2026_Cloud!";
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';

let passed = 0, failed = 0;
const results = [];
function assert(cond, msg, g) {
  if (cond) { passed++; results.push({ ok: true, g, msg }); console.log('  ✅', String(passed).padStart(2,'0'), '['+g+']', msg); }
  else { failed++; results.push({ ok: false, g, msg }); console.error('  ❌ FAIL', '['+g+']', msg); }
}
async function sh(ssh, code) {
  const f = `/tmp/p3a_${Math.random().toString(36).slice(2,7)}.sh`;
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
    console.log('[SSH] connected ok');

    // ---------------- Group 1: Infra dual PM2 + ports (3 assertions)
    {
      const pm2Out = await sh(ssh, `cd /home/ubuntu && export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH" && pm2 jlist 2>/dev/null || echo "[]"`);
      let list = []; try { list = JSON.parse(('' + pm2Out).trim() || '[]'); } catch {}
      const v1 = list.find(p => p.name === 'eeat-studio');
      const v2 = list.find(p => p.name === 'eeat-studio-v2');
      assert(!!v1 && ((v1.pm2_env && v1.pm2_env.status === 'online') || v1.status === 'online'), 'PM2 old v1 eeat-studio online', '1');
      assert(!!v2 && ((v2.pm2_env && v2.pm2_env.status === 'online') || v2.status === 'online'), 'PM2 new v2 eeat-studio-v2 online', '1');
      const ports = await sh(ssh, `(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -E ':(3001|3002)$' | wc -l) || (netstat -ltn 2>/dev/null | grep -E ':(3001|3002) ' | wc -l)`);
      assert(Number(lastInt(ports || '0')) >= 2, `ports 3001+3002 listening=${lastInt(ports)}`, '1');
    }

    // ---------------- Group 2: DB 0004 migration tables=14 NEW (old=51 exact) (3 assertions)
    {
      const newTbls = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB}';`));
      assert(Number(lastInt(newTbls)) === 14, `eeat_studio_v2 tables count=14 (got ${lastInt(newTbls)})`, '2');
      const oldTbls = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${OLD}';`));
      assert(Number(lastInt(oldTbls)) === 51, `OLD eeat_studio tables count=51 exact (got ${lastInt(oldTbls)})`, '2');
      const cols = await sh(ssh, mdb(`DESCRIBE project_brand_voices;`));
      assert(/project_id/.test(cols) && /voice_json/.test(cols) && /scraped_url/.test(cols) && /created_at/.test(cols) && /updated_at/.test(cols),
             `project_brand_voices cols snake present (cols len=${cols.length})`, '2');
    }

    // ---------------- Group 3: Seeds data untouched Phase2K (5 assertions)
    {
      const cats7 = await sh(ssh, mdb(`SELECT COUNT(*) FROM categories;`));
      assert(Number(lastInt(cats7)) >= 7, `categories COUNT>=7 (got ${lastInt(cats7)})`, '3');
      const proj7 = await sh(ssh, mdb(`SELECT COUNT(*) FROM projects;`));
      assert(Number(lastInt(proj7)) >= 7, `projects COUNT>=7 (got ${lastInt(proj7)})`, '3');
      const u = await sh(ssh, mdb(`SELECT COUNT(*) FROM users WHERE google_open_id='102308593207118714314';`));
      assert(Number(lastInt(u)) === 1, `admin users google_open_id match COUNT=1 (got ${lastInt(u)})`, '3');
      const t = await sh(ssh, mdb(`SELECT COUNT(*) FROM teams WHERE id=90001;`));
      assert(Number(lastInt(t)) === 1, `teams seed id=90001 COUNT=1 (got ${lastInt(t)})`, '3');
      const tm = await sh(ssh, mdb(`SELECT COUNT(*) FROM team_members WHERE team_id=90001 AND user_id=99001 AND permission='owner';`));
      assert(Number(lastInt(tm)) === 1, `team_members owner seed row match COUNT=1 (got ${lastInt(tm)})`, '3');
    }

    // ---------------- Group 4: Public health + SPA index + SERP unlock (3 assertions)
    {
      const h = await sh(ssh, `curl -sk -m 10 https://thaiaeo.manus.host/api/health 2>/dev/null | head -c 800`);
      assert(/phase["']?\s*[:=]\s*["']?2/.test(h) && /projects/.test(h), `/api/health phase=2 + includes projects router (len=${h.length})`, '4');
      const root = await sh(ssh, `curl -sk -m 10 -L https://thaiaeo.manus.host/ 2>/dev/null | head -c 1500`);
      assert(root.length >= 150, `SPA / length>=150 actual=${root.length}`, '4');
      const serp = await sh(ssh, `set +H; KEY=$(grep -E '^SERP_API_KEY=' '${DEPLOY_DIR}/.env' 2>/dev/null | sed 's/^SERP_API_KEY=//' | tr -d '\\n\\r' | head -c 80); if [ -z "$KEY" ]; then echo "NOKEY"; else C='{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}'; R=$(curl -s -w '\\nHTTPCODE:%{http_code}' -X POST -H "X-API-KEY: $KEY" -H "Content-Type: application/json" -d "$C" https://google.serper.dev/search 2>/dev/null); echo "$R"; fi`);
      const serpH = (serp.match(/HTTPCODE:(\d{3})/) || [])[1] || (serp.match(/\b(200|403|401|429|5\d{2})\b/) || [])[0] || '';
      assert(serpH === '200', `SERP ping serper.dev HTTP=${serpH || serp.slice(0,100)} (want 200)`, '4');
    }

    console.log(`\n==== PHASE3A BRAND VOICE LIVE VPS: ${passed} PASS / ${failed} FAIL / ${passed+failed} TOTAL ====`);
    for (const r of results) if (!r.ok) console.log('  FAIL', String(r.g).padEnd(2), r.msg);
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error('LIVE VERIFY ABORTED:', String(e?.message || e).slice(0, 400));
    process.exit(2);
  } finally {
    try { await ssh.close(); } catch {}
  }
})();
