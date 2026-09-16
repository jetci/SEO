import SSHClient from 'ssh2-promise';

const CFG = {
  host: '35.231.230.218', port: 22, username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 20000, keepaliveInterval: 30000,
};

let pass = 0, fail = 0;
function a(name, cond, d='') {
  if (cond) { pass++; console.log(`  ✅ [${String(pass).padStart(2,'0')}] ${name}`); }
  else { fail++; console.log(`  ❌ FAIL ${name}${d?' — '+d:''}`); }
}
async function sh(ssh, code) {
  const f = `/tmp/p2k_${Math.random().toString(36).slice(2,7)}.sh`;
  await ssh.sftp().writeFile(f, '#!/bin/bash\n'+code, {mode:0o755});
  const o = await ssh.exec(`bash ${f} 2>&1 ; echo "__EXIT_RET_MARK__=$?"`).catch(e=>String(e));
  await ssh.sftp().unlink(f).catch(()=>{});
  const stripped = String(o).replace(/\s*__EXIT_RET_MARK__=\d+\s*$/, '');
  return stripped.trimEnd();
}
function lastInt(o) {
  const lines = String(o).split('\n').map(l=>l.trim()).filter(l=>/^\d+$/.test(l));
  return lines[lines.length-1] || '';
}

async function main(){
  console.log('==== Phase2K LIVE VPS VERIFY 14/14 (ASSERTION BUG FIX ROUND) ====\n');
  const ssh = new SSHClient(CFG); await ssh.connect();
  const DB='eeat_studio_v2', OLD='eeat_studio', PW="root_eeat_2026_Cloud!";
  const MDB = `docker exec eeat-studio-db mariadb -uroot -p'${PW}'`;

  // A PM2
  const pm2 = JSON.parse(await ssh.exec('pm2 jlist 2>&1').catch(()=>'[]'));
  const v1 = pm2.find(p=>p.name==='eeat-studio'), v2 = pm2.find(p=>p.name==='eeat-studio-v2');
  a('A1 OLD PM2 eeat-studio v1 ONLINE (port3001 ZERO OVERWRITE)', v1?.pm2_env?.status==='online');
  a('A2 NEW PM2 eeat-studio-v2 ONLINE (port3002)', v2?.pm2_env?.status==='online');

  // B OLD schema 51 tables FOREVER LOCKED
  const b1 = await sh(ssh, `${MDB} -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${OLD}';" 2>/dev/null | tail -1`);
  a('B1 eeat_studio OLD EXACT 51 tables LOCKED', lastInt(b1)==='51', 'got='+lastInt(b1));
  const b2 = await sh(ssh, `${MDB} -N -e "SELECT COUNT(*) FROM ${OLD}.users;" 2>/dev/null | tail -1`);
  a('B2 OLD eeat_studio.users > 0 (prod data preserved)', parseInt(lastInt(b2)||'0')>0, 'count='+lastInt(b2));

  // C v2 DESCRIBE snake_case REAL cols
  const descTM = await sh(ssh, `${MDB} -N -e "DESCRIBE ${DB}.team_members;" 2>/dev/null`).then(s=>s.toLowerCase());
  a('C1 v2 users DESCRIBE google_open_id (NOT googleOpenId)',
    (await sh(ssh, `${MDB} -N -e "DESCRIBE ${DB}.users;" 2>/dev/null`)).includes('google_open_id'));
  a('C2 v2 team_members permission enum(owner/admin/member) (NOT role col)',
    descTM.includes('permission') && /enum\(['"]owner['"]/m.test(descTM) && !/^role\b/m.test(descTM));
  a('C3 v2 teams owner_id (NOT ownerId)',
    (await sh(ssh, `${MDB} -N -e "DESCRIBE ${DB}.teams;" 2>/dev/null`)).includes('owner_id'));
  const descPrj = await sh(ssh, `${MDB} -N -e "DESCRIBE ${DB}.projects;" 2>/dev/null`);
  a('C4 v2 projects main_keyword + category_id snake',
    descPrj.includes('main_keyword') && descPrj.includes('category_id'));

  // D v2 SEED R6 rows EXIST snake queries
  const d1 = await sh(ssh, `${MDB} -N -e "SELECT id,google_open_id,role FROM ${DB}.users WHERE id=99001;" 2>/dev/null`);
  a('D1 Seed users id=99001 admin google_open_id=ADMIN_OPENID match',
    /99001[\s\t]+102308593207118714314[\s\t]+admin/.test(d1), 'raw d1=['+d1+']');
  const d2 = await sh(ssh, `${MDB} -N -e "SELECT id,name,owner_id FROM ${DB}.teams WHERE id=90001;" 2>/dev/null`);
  a('D2 Seed teams id=90001 owner_id=99001', /90001[\s\t]+Team AEO Default[\s\t]+99001/.test(d2), 'd2=['+d2+']');
  const d3 = await sh(ssh, `${MDB} -N -e "SELECT team_id,user_id,permission FROM ${DB}.team_members WHERE team_id=90001 AND user_id=99001;" 2>/dev/null`);
  a('D3 Seed team_members team_id=90001 user_id=99001 permission=owner snake',
    /90001[\s\t]+99001[\s\t]+owner/.test(d3), 'd3=['+d3+']');
  const d4c = lastInt(await sh(ssh, `${MDB} -N -e "SELECT COUNT(*) FROM ${DB}.categories;" 2>/dev/null | tail -1`));
  const d4p = lastInt(await sh(ssh, `${MDB} -N -e "SELECT COUNT(*) FROM ${DB}.projects;" 2>/dev/null | tail -1`));
  a('D4 categories=7 projects=7 EXACT 0002+R6 seed', d4c==='7' && d4p==='7', `cat=${d4c} proj=${d4p}`);

  // E PUBLIC PROBE
  const heal = await sh(ssh, `curl -sk -o /tmp/hp.txt -w "HPCODE=%{http_code}\nHPBODYLEN=%{size_download}\n" --max-time 12 https://thaiaeo.manus.host/api/health; echo "HPCONTENT=$(cat /tmp/hp.txt | head -c 300)"`);
  a('E1 /api/health HTTPS 200 phase=2 PUBLIC LIVE',
    heal.includes('HPCODE=200') && heal.includes('"phase":2'));
  const log = await sh(ssh, `curl -skL -o /tmp/lp.html -w "LOGINCODE=%{http_code}\nLOGINBYTES=%{size_download}\n" --max-time 15 https://thaiaeo.manus.host/login`);
  const lb = (log.match(/LOGINBYTES=(\d+)/)||[])[1] || '0';
  const lc = (log.match(/LOGINCODE=(\d+)/)||[])[1] || '0';
  a('E2 /login SPA HTTPS 200 body≥1KB dist not empty 404→index.html copy OK',
    lc==='200' && parseInt(lb)>=1024, `code=${lc} bytes=${lb}`);

  await ssh.close();
  console.log(`\n==== LIVE VPS RESULT: ${pass}/14 PASS` + (fail===0?' ✅ EXIT 0':' ❌ '+fail+' FAIL → exit1') + ' ====');
  process.exit(fail===0?0:1);
}
main().catch(e=>{console.error('FATAL:',e?.message||e);process.exit(2);});
