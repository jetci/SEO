import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    const cols = await execLine(ssh, `docker exec eeat-studio-db mariadb -uroot -p"$(docker exec eeat-studio-db bash -lc 'echo $MARIADB_ROOT_PASSWORD')" eeat_studio_v2 -e "DESCRIBE research_packages;"`);
    console.log('cols research_packages:\n' + cols.split('\n').map(l => '  ' + l).join('\n'));
    const kwCols = await execLine(ssh, `docker exec eeat-studio-db mariadb -uroot -p"$(docker exec eeat-studio-db bash -lc 'echo $MARIADB_ROOT_PASSWORD')" eeat_studio_v2 -e "DESCRIBE keywords;"`);
    console.log('cols keywords:\n' + kwCols.split('\n').map(l => '  ' + l).join('\n'));
  } catch (e) { console.error('ERR', e); } finally { await ssh.close(); }
}
main();
