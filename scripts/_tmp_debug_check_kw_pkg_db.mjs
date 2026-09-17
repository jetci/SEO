import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    const kwText = 'ทีเด็ดบอล ปี 2569';
    console.log('DB CHECK keyword row + research packages:');
    const kwCheck = await execLine(ssh, `docker exec eeat-studio-db mariadb -uroot -p"$(docker exec eeat-studio-db bash -lc 'echo $MARIADB_ROOT_PASSWORD')" eeat_studio_v2 -e "SELECT id, keyword_text, project_id, category_id, tier, intent_suggestion FROM keywords WHERE keyword_text='${kwText}' LIMIT 2\\G"`);
    console.log(kwCheck.split('\n').map(l => '  '+l).join('\n'));

    const kwId = await execLine(ssh, `docker exec eeat-studio-db mariadb -uroot -p"$(docker exec eeat-studio-db bash -lc 'echo $MARIADB_ROOT_PASSWORD')" eeat_studio_v2 -N -B -e "SELECT id FROM keywords WHERE keyword_text='${kwText}' ORDER BY id DESC LIMIT 1;"`);
    console.log('  keyword_id =', kwId);

    if (kwId) {
      const rp = await execLine(ssh, `docker exec eeat-studio-db mariadb -uroot -p"$(docker exec eeat-studio-db bash -lc 'echo $MARIADB_ROOT_PASSWORD')" eeat_studio_v2 -e "SELECT id, keyword_id, CHAR_LENGTH(ai_overview) as ov_len, JSON_LENGTH(serp_top10) as serp_rows, JSON_LENGTH(people_also_ask) as paa_rows, JSON_LENGTH(related_searches) as rel_rows, CHAR_LENGTH(google_trends_data) as trend_len FROM research_packages WHERE keyword_id=${kwId} ORDER BY id DESC LIMIT 3\\G"`);
      console.log(rp.split('\n').map(l => '  '+l).join('\n'));
    }
    const pm2pid0 = await execLine(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d);process.stdin.on(\"end\",()=>{try{const a=JSON.parse(s);const x=a.find(o=>o.pm_id===0);console.log(x?x.pid:\"NOID\");}catch(e){console.log(e.message)}})' 2>/dev/null || echo na");
    console.log('\n  pm_id=0 pid actual:', pm2pid0);
  } catch (e) {
    console.error('ERR', e);
  } finally { await ssh.close(); }
}
main();
