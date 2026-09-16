#!/usr/bin/env node
// Phase 2C Verify — 4 assertions on live VPS (Deploy Gate)
import SSHClient from "ssh2-promise";

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22 };
const EEAT_PW = 'eeat_secret_2026_Cloud!';
let FAILS = 0;
function P(id,ok,msg){ if(ok) console.log(`✅ V2C-${id}: ${msg}`); else { console.log(`❌ V2C-${id}: ${msg}`); FAILS++; } }

async function run(c, b){ try { return String(await c.exec(b, [])); } catch(e){ console.error(e); return ''; } }

async function main() {
  const conn = new SSHClient(SSH_CFG);
  try {
    await conn.connect();
    console.log('🔗 SSH OK. Phase 2C Deploy Verify\n');
    // V2C-1: Loopback health phase=2 integer + routers array has research element count ≥ 10
    let r = await run(conn, `node -e "$(cat <<'NODEOF'\n(async ()=>{try{const r=await fetch('http://127.0.0.1:3002/api/health');const j=await r.json();const ok=j.phase===2 && Array.isArray(j.routers) && j.routers.length>=10 && j.routers.includes('research');console.log(JSON.stringify({HTTP:r.statusCode,phase:j.phase,count:j.routers?.length,hasResearch:j.routers?.includes('research')||false,ok}));}catch(e){console.error('ERR',e.message);process.exit(1);}})();\nNODEOF\n)" 2>&1`);
    const phaseCheck = /"ok":true/.test(r) && /"phase":2/.test(r) && /"hasResearch":true/.test(r) && /"count":1\d/.test(r);
    P('1', phaseCheck, `/api/health phase=2 routers=10+ research present. Node probe: ${r.trim().slice(0,200)}`);

    // V2C-2: Public HTTPS thaiaeo /dashboard 200 OK SPA fallback
    r = await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/dashboard`);
    P('2', r.trim() === '200', `Public /dashboard HTTPS = HTTP ${r.trim()} (expect 200)`);

    // V2C-3: research_audit rows count team90001 this month ≥ 5 (mock rows) + sum usd ≈ 0.025790
    r = await run(conn, `sudo docker exec eeat-studio-db mariadb -ueeat -p'${EEAT_PW}' -N -e "SELECT COUNT(*) FROM eeat_studio_v2.research_audit WHERE team_id=90001 AND MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE()); SELECT ROUND(SUM(CAST(usd_cost_est AS DECIMAL(14,6))),6) FROM eeat_studio_v2.research_audit WHERE team_id=90001 AND MONTH(created_at)=MONTH(CURDATE());" 2>&1 | tail -3`);
    const lines = r.trim().split(/\s+/).filter(Boolean);
    const rowsN = Number(lines[0]); const usd = Number(lines[1]);
    P('3', rowsN >= 5 && usd >= 0.02, `Research audit rows this month = ${rowsN} total USD = $${usd} (expect ≥5 rows, ≥ $0.02 grand_total)`);

    // V2C-4: settings router mask rule 4-****-last4 present prod source (static code check)
    r = await run(conn, `grep -c "slice(0, 4) + '\\\\*\\\\*\\\\*\\\\*' + k.slice(-4)" /home/ubuntu/eeat-studio-v2/server/routers/settings.ts`);
    P('4', r.trim() === '1', `Prod source maskKey 4-****-last4 pattern matches=${r.trim()} (expect 1) — NO raw API keys leak via settings.get`);

    console.log(`\n${FAILS === 0 ? '🟢' : '🔴'} Phase 2C Verify: ${4-FAILS}/4 PASS ${FAILS ? 'FAIL IDs: check output' : ''}`);
    process.exit(FAILS);
  } finally { try{ await conn.close(); }catch{} }
}
main().catch(e=>{console.error(e); process.exit(1);});
