import ssh2 from 'ssh2-promise';
import path from 'node:path';

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };

async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }

async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('[SSH] Connected');

    // GUARD
    const jl = JSON.parse(await execLine(ssh, 'pm2 jlist'));
    const v1 = jl.find(p => p.pm_id === 0);
    if (!v1 || String(v1.pid) !== '1287') { console.error('V1 GUARD FAIL'); process.exit(99); }
    console.log('[GUARD PASS] V1 pid=1287');

    // Error log tail 80 lines for any generateOutline / write.* errors after latest deploy
    console.log('\n========== V2 ERROR LOG tail 120 (latest after 14:55) ==========');
    const err = await execLine(ssh, 'tail -n 120 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log 2>/dev/null | tail -80');
    console.log(err);

    console.log('\n========== V2 OUT LOG tail 80 ==========');
    const out = await execLine(ssh, 'tail -n 80 /home/ubuntu/.pm2/logs/eeat-studio-v2-out.log 2>/dev/null');
    console.log(out);

    // Check keywords table latest 3 rows (should see our new "ทีเด็ดบอล ปี 2569" if backend inserted it)
    console.log('\n========== DB keywords latest 3 INSERTED rows ==========');
    const kw = await execLine(ssh, `docker exec eeat-studio-db bash -lc "mariadb -u root -p\\$MARIADB_ROOT_PASSWORD eeat_studio_v2 -e \\\"SELECT id, keyword_text, status, created_at FROM keywords ORDER BY id DESC LIMIT 5;\\\""`);
    console.log(kw);

    // Check research packages latest (ensure one exists for latest kw id)
    console.log('\n========== DB research_packages newest ==========');
    const rp = await execLine(ssh, `docker exec eeat-studio-db bash -lc "mariadb -u root -p\\$MARIADB_ROOT_PASSWORD eeat_studio_v2 -e \\\"SELECT id, keyword_id, CHAR_LENGTH(package_json) as pkg_len, created_at FROM research_packages ORDER BY id DESC LIMIT 8;\\\""`);
    console.log(rp);

  } catch (e) { console.error(e); }
  finally { await ssh.close(); }
}
main();
