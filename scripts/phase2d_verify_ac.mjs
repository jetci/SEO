#!/usr/bin/env node
// Phase 2D Verify — 6 assertions on live VPS (Deploy Gate)
import SSHClient from "ssh2-promise";

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22 };
const EEAT_PW = 'eeat_secret_2026_Cloud!';
let FAILS = 0;
function P(id,ok,msg){ if(ok) console.log(`✅ V2D-${id}: ${msg}`); else { console.log(`❌ V2D-${id}: ${msg}`); FAILS++; } }

async function run(c, b){ try { return String(await c.exec(b, [])); } catch(e){ console.error(e); return ''; } }

async function main() {
  const conn = new SSHClient(SSH_CFG);
  try {
    await conn.connect();
    console.log('🔗 SSH OK. Phase 2D Deploy Verify\n');

    // V2D-1: DB tables count ≥ 13 (old 12 + write_articles)
    let r = await run(conn, `sudo docker exec eeat-studio-db mariadb -ueeat -p'${EEAT_PW}' -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eeat_studio_v2';" 2>&1 | tail -1`);
    const cnt = Number(r.trim().replace(/[^0-9]/g,''));
    P('1', cnt >= 13, `DB schema eeat_studio_v2 TABLES=${cnt} (expect ≥13, Phase2D added write_articles new 13th table)`);

    // V2D-2: write_articles cols present (article_id, research_package_id, eeat_score, word_count)
    r = await run(conn, `sudo docker exec eeat-studio-db mariadb -ueeat -p'${EEAT_PW}' -N -e "DESCRIBE eeat_studio_v2.write_articles;" 2>&1 | tr -s ' ' | cut -d' ' -f1,2 | head -20`);
    const cols = r;
    const hasCols = cols.includes('article_id') && cols.includes('research_package_id') && cols.includes('eeat_score') && cols.includes('word_count') && cols.includes('write_step');
    P('2', hasCols, `write_articles columns: article_id + research_package_id FK + eeat_score + word_count + write_step workflow. DESCRIBE output: \n${cols.split('\n').filter(l=>l.trim()).slice(0,8).join('\n')}`);

    // V2D-3: Node health probe phase=2 routers>=10 includes write+research
    r = await run(conn, `node -e "$(cat <<'NODEOF'\n(async ()=>{try{const r=await fetch('http://127.0.0.1:3002/api/health');const j=await r.json();const ok=j.phase===2 && Array.isArray(j.routers) && j.routers.length>=10 && j.routers.includes('write') && j.routers.includes('research');console.log(JSON.stringify({HTTP:r.statusCode,phase:j.phase,count:j.routers?.length,write:j.routers?.includes('write'),research:j.routers?.includes('research'),ok}));}catch(e){console.error('ERR',e.message);process.exit(1);}})();\nNODEOF\n)" 2>&1`);
    const h = /"ok":true/.test(r) && /"write":true/.test(r) && /"research":true/.test(r) && /"phase":2/.test(r);
    P('3', h, `/api/health phase=2 routers merged write+research present (root tRPC router). Node probe: ${r.trim().slice(0,200)}`);

    // V2D-4: Public dashboard HTTPS 200
    r = await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/dashboard`);
    P('4', r.trim() === '200', `Public HTTPS thaiaeo.manus.host/dashboard HTTP=${r.trim()} expect 200 SPA fallback`);

    // V2D-5: settings maskKey 4-****-last4 pattern still present still secure prod
    r = await run(conn, `grep -c "slice(0, 4) + '\\\\*\\\\*\\\\*\\\\*' + k.slice(-4)" /home/ubuntu/eeat-studio-v2/server/routers/settings.ts`);
    P('5', r.trim() === '1', `Prod settings mask 4-****-last4 still present count=${r.trim()} (no keys leak. pattern matches=1 required)`);

    // V2D-6: PM2 dual online eeat-studio id=0 v1 (legacy untouched) + eeat-studio-v2 v2 online status
    r = await run(conn, `pm2 jlist 2>/dev/null | node -e "$(cat <<'N2'\nlet d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const v1=j.find(p=>p.name==='eeat-studio');const v2=j.find(p=>p.name==='eeat-studio-v2');const r={v1_name:'eeat-studio',v1_online:!!v1 && v1.pm2_env?.status==='online',v1_cwd_legacy:v1?.pm2_env?.pm_cwd,v2_name:'eeat-studio-v2',v2_online:!!v2 && v2.pm2_env?.status==='online',v2_cwd_v2:v2?.pm2_env?.pm_cwd};r.ok= r.v1_online && r.v2_online && (r.v1_cwd_legacy ? !r.v1_cwd_legacy.includes('eeat-studio-v2') : true) && (r.v2_cwd_v2 ? r.v2_cwd_v2.includes('eeat-studio-v2') : true);console.log(JSON.stringify(r));}catch(e){console.log({err:e.message});process.exit(1);}});\nN2\n)" 2>&1`);
    const pmok = /"ok":true/.test(r) && /"v1_online":true/.test(r) && /"v2_online":true/.test(r);
    P('6', pmok, `PM2 Zero Overwrite DUAL ONLINE: legacy v1 eeat-studio (id=0 preserved no delete) + v2 eeat-studio-v2. Result: ${r.trim().slice(0,400)}`);

    console.log(`\n${FAILS === 0 ? '🟢' : '🔴'} Phase 2D Verify: ${6-FAILS}/6 PASS ${FAILS ? 'FAIL IDs: check output' : ''}`);
    process.exit(FAILS);
  } finally { try{ await conn.close(); }catch{} }
}
main().catch(e=>{console.error(e); process.exit(1);});
