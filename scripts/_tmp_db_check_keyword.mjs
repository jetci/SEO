import SSHClient from 'ssh2-promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CFG = {
  host: '35.231.230.218',
  username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt',
  port: 22,
  readyTimeout: 30000,
  keepaliveInterval: 8000,
};

async function main() {
  const ssh = new SSHClient(CFG);
  try {
    await ssh.connect();
    console.log('[SSH] Connected');

    const jlistBefore = JSON.parse(await ssh.exec('pm2 jlist'));
    const v1 = jlistBefore.find(p => p.name === 'eeat-studio');
    if (!v1 || String(v1.pid) !== '1287') {
      console.error(`[GUARD FAIL] V1 pid = ${v1?.pid} !== 1287! ABORT`);
      process.exit(99);
    }
    console.log(`[GUARD 1/2 PASS] V1 pid=${v1.pid}`);

    // DESCRIBE tables first to get correct column names
    console.log('\n========== DESCRIBE keywords ==========');
    try {
      const descKw = await ssh.exec(`docker exec eeat-studio-db bash -lc "mariadb -u root -p\\$MARIADB_ROOT_PASSWORD eeat_studio_v2 -e \\\"DESCRIBE keywords;\\\""`);
      console.log(descKw);
    } catch(e) { console.log('desc kw fail:', String(e).slice(0,300)); }

    console.log('\n========== DESCRIBE research_packages ==========');
    try {
      const descPkg = await ssh.exec(`docker exec eeat-studio-db bash -lc "mariadb -u root -p\\$MARIADB_ROOT_PASSWORD eeat_studio_v2 -e \\\"DESCRIBE research_packages;\\\""`);
      console.log(descPkg);
    } catch(e) { console.log('desc pkg fail:', String(e).slice(0,300)); }

    console.log('\n========== DESCRIBE articles ==========');
    try {
      const descArt = await ssh.exec(`docker exec eeat-studio-db bash -lc "mariadb -u root -p\\$MARIADB_ROOT_PASSWORD eeat_studio_v2 -e \\\"DESCRIBE articles;\\\""`);
      console.log(descArt);
    } catch(e) { console.log('desc art fail:', String(e).slice(0,300)); }

    // Query DB: find keywords with football related
    console.log('\n========== DB keywords table search ==========');
    try {
      const kwSearch = await ssh.exec(`docker exec eeat-studio-db bash -lc "mariadb -u root -p\\$MARIADB_ROOT_PASSWORD eeat_studio_v2 -e \\\"SELECT * FROM keywords ORDER BY id DESC LIMIT 10;\\\""`);
      console.log(kwSearch);
    } catch(e) {
      console.log('kw search fail:', String(e).slice(0,300));
    }

    const jlistAfter = JSON.parse(await ssh.exec('pm2 jlist'));
    const v1after = jlistAfter.find(p => p.name === 'eeat-studio');
    if (!v1after || String(v1after.pid) !== '1287') console.error(`\n[GUARD FAIL AFTER] V1 pid=${v1after?.pid} !== 1287!`);
    else console.log(`\n[GUARD 2/2 PASS] V1 pid=${v1after.pid} UNTOUCHED`);

  } catch (e) {
    console.error('[ERROR]', e);
  } finally {
    await ssh.close();
  }
}
main();
