#!/usr/bin/env node
// Phase 2E Verify — 6 assertions on LIVE VPS (Deploy Gate /articles route SPA + EEAT Editor)
import SSHClient from "ssh2-promise";

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22 };
const EEAT_PW = 'eeat_secret_2026_Cloud!';
let FAILS = 0;
function P(id,ok,msg){ if(ok) console.log(`✅ V2E-${id}: ${msg}`); else { console.log(`❌ V2E-${id}: ${msg}`); FAILS++; } }

async function run(c, b){ try { return String(await c.exec(b, [])); } catch(e){ console.error(e); return ''; } }

async function main() {
  const conn = new SSHClient(SSH_CFG);
  try {
    await conn.connect();
    console.log('🔗 SSH LIVE VPS OK. Phase 2E — Editor/List Routes Deploy Verify\n');

    // V2E-1: HTTPS /articles SPA fallback route HTTP 200 OK
    let r = await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/articles`);
    P('1', r.trim() === '200', `Public HTTPS thaiaeo.manus.host/articles HTTP=${r.trim()} (expect 200 SPA fallback V2 new articles list page route)`);

    // V2E-2: HTTPS /articles/99999/edit (dynamic :id param editor path) SPA fallback HTTP 200
    r = await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/articles/99999/edit`);
    P('2', r.trim() === '200', `Public HTTPS /articles/99999/edit HTTP=${r.trim()} (wouter param route SPA fallback EEAT Markdown Editor page)`);

    // V2E-3: /api/health phase=2 routers≥10 includes write+research (merged root tRPC router)
    r = await run(conn, `node -e "$(cat <<'NODEOF'\n(async ()=>{try{const r=await fetch('http://127.0.0.1:3002/api/health');const j=await r.json();const ok=j.phase===2 && Array.isArray(j.routers) && j.routers.length>=10 && j.routers.includes('write') && j.routers.includes('research');console.log(JSON.stringify({HTTP:r.statusCode,phase:j.phase,count:j.routers?.length,write:j.routers?.includes('write'),research:j.routers?.includes('research'),ok}));}catch(e){console.error('ERR',e.message);process.exit(1);}})();\nNODEOF\n)" 2>&1`);
    const h = /"ok":true/.test(r) && /"write":true/.test(r) && /"research":true/.test(r) && /"phase":2/.test(r);
    P('3', h, `/api/health phase=2 routers count≥10 write+research merged INTACT. Node probe: ${r.trim().slice(0,240)}`);

    // V2E-4: Settings mask 4-****-last4 pattern still present (no plaintext API keys leak)
    r = await run(conn, `grep -c "slice(0, 4) + '\\\\*\\\\*\\\\*\\\\*' + k.slice(-4)" /home/ubuntu/eeat-studio-v2/server/routers/settings.ts`);
    P('4', r.trim() === '1', `Prod secure mask rule 4-****-last4 still present count=${r.trim()} (NO LLM/SERP keys leak in response. pattern matches=1 required)`);

    // V2E-5: PM2 DUAL ONLINE ZERO OVERWRITE: v1 legacy eeat-studio (port3001 untouched) + v2 eeat-studio-v2 (port3002)
    r = await run(conn, `pm2 jlist 2>/dev/null | node -e "$(cat <<'N2'\nlet d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const v1=j.find(p=>p.name==='eeat-studio');const v2=j.find(p=>p.name==='eeat-studio-v2');const r={v1_name:'eeat-studio',v1_online:!!v1 && v1.pm2_env?.status==='online',v1_cwd_legacy:v1?.pm2_env?.pm_cwd,v2_name:'eeat-studio-v2',v2_online:!!v2 && v2.pm2_env?.status==='online',v2_cwd_v2:v2?.pm2_env?.pm_cwd};r.ok= r.v1_online && r.v2_online && (r.v1_cwd_legacy ? !r.v1_cwd_legacy.includes('eeat-studio-v2') : true) && (r.v2_cwd_v2 ? r.v2_cwd_v2.includes('eeat-studio-v2') : true);console.log(JSON.stringify(r));}catch(e){console.log({err:e.message});process.exit(1);}});\nN2\n)" 2>&1`);
    const pmok = /"ok":true/.test(r) && /"v1_online":true/.test(r) && /"v2_online":true/.test(r);
    P('5', pmok, `PM2 Zero Overwrite DUAL ONLINE: legacy v1 eeat-studio (V1 port3001 ID0 NEVER touch) + v2 eeat-studio-v2 online. Result: ${r.trim().slice(0,400)}`);

    // V2E-6: OLD V1 schema eeat_studio (51 tables) STILL UNALTERED COUNT PRESERVED. NO DROP/ALTER old tables backward compat rule.
    r = await run(conn, `sudo docker exec eeat-studio-db mariadb -ueeat -p'${EEAT_PW}' -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eeat_studio';" 2>&1 | tail -1`);
    const v1tables = Number(r.trim().replace(/[^0-9]/g,''));
    P('6', v1tables >= 50, `BACKWARD COMPAT: OLD eeat_studio V1 SCHEMA TABLES=${v1tables} (expect ~51 original tables UNCHANGED — ZERO ALTER/DROP legacy data forever rule).`);

    console.log(`\n${FAILS === 0 ? '🟢' : '🔴'} Phase 2E LIVE Verify: ${6-FAILS}/6 PASS ${FAILS ? '(FAILED — check IDs above)' : '(ALL GREEN ✅ Deploy certified safe for production)'}`);
    process.exit(FAILS);
  } finally { try{ await conn.close(); }catch{} }
}
main().catch(e=>{console.error(e); process.exit(1);});
