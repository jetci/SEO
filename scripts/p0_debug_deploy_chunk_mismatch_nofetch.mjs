// DEBUG: Deployed dist chunk hash mismatch 404? All SSH no node-fetch.
import SSHClient from 'ssh2-promise';
const SSH = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22, readyTimeout: 20000, keepaliveInterval: 30000 };
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';
async function sh(ssh, cmd) {
  try {
    const s = (await ssh.exec(`export PATH="${NODE_PATH}:$PATH"; ${cmd}`))?.toString?.() ?? String(await ssh.exec(cmd));
    return s.trim();
  } catch (e) { return String(e?.message ?? e); }
}
import { execSync } from 'node:child_process';
(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok\n');

    console.log('1) DIRECT fetch Dashboard-DRWf6vNH.js asset PUBLIC URL (via VPS curl):\n');
    const c1 = await sh(ssh, `curl -skD - -o /tmp/chunk_body.txt https://thaiaeo.manus.host/assets/Dashboard-DRWf6vNH.js 2>&1 | head -15 ; echo "---BODY HEAD---" ; head -c 120 /tmp/chunk_body.txt ; echo "" ; echo "---SIZE---" ; wc -c /tmp/chunk_body.txt`);
    console.log(c1);

    console.log('\n2) VPS DEPLOY dist/assets/ CHUNK FILES:\n');
    const c2 = await sh(ssh, `ls -la ${DEPLOY_DIR}/dist/assets/ 2>&1 | tail -n +1 | head -80`);
    console.log(c2);

    console.log('\n3) index.html on VPS SCRIPT SRC references:\n');
    const c3 = await sh(ssh, `grep -oE '(src|href)="[^"]+"' ${DEPLOY_DIR}/dist/index.html 2>&1 | head -60`);
    console.log(c3 || '(EMPTY!)');

    console.log('\n4) DASHBOARD chunks: All file name variants Dashboard-*:\n');
    const c4 = await sh(ssh, `ls -la ${DEPLOY_DIR}/dist/assets/Dashboard-* 2>&1`);
    console.log(c4 || '(NONE!)');

    console.log('\n5) SEARCH DRWf6vNH hash in dist:\n');
    const c5 = await sh(ssh, `find ${DEPLOY_DIR}/dist -name "*DRWf6vNH*" -type f 2>&1`);
    console.log(c5 || '(NOT FOUND!)');

    console.log('\n6) LOCAL Windows MACHINE dist Dashboard chunk names (for COMPARE):\n');
    try {
      const l = String(execSync(`powershell -NoProfile -Command "Get-ChildItem -Path 'd:\\AEO\\SEO V2\\dist\\assets\\Dashboard-*.js' | Select-Object -ExpandProperty Name | Out-String"`, { encoding: 'utf8', timeout: 5000 })).trim();
      console.log(l || '(NONE locally either!)');
    } catch(e) { console.log('  local list err:', String(e.message||e).slice(0,200)); }

    console.log('\n7) LOCAL index.html references:\n');
    try {
      const l2 = String(execSync(`powershell -NoProfile -Command "Select-String -Path 'd:\\AEO\\SEO V2\\dist\\index.html' -Pattern '(src|href)=\\\"[^\\\"]+\\\"' -AllMatches | ForEach-Object { $_.Matches.Value } | Out-String"`, { encoding: 'utf8', timeout: 5000 })).trim();
      console.log(l2 || '(No matches!)');
    } catch(e) { console.log('  local grep err:', String(e.message||e).slice(0,200)); }

    console.log('\n8) DEPLOY_DIR dist total file count VPS + LAST MODIFIED timestamps:\n');
    const c8 = await sh(ssh, `echo "total files: $(find ${DEPLOY_DIR}/dist -type f 2>/dev/null | wc -l)" ; stat -c "%y %n" ${DEPLOY_DIR}/dist/index.html ${DEPLOY_DIR}/dist/assets/ 2>&1 | head`);
    console.log(c8);

    console.log('\n9) Did deploy script DO rm -rf dist old files first? Check if script deletes old chunks to prevent stale overlay!\n');
    const deploySh = await sh(ssh, `find ${DEPLOY_DIR} -maxdepth 2 -name "*.sh" -type f 2>&1 ; echo "---DEPLOY_SCRIPT_LAST_RUN (if any):---" ; ls -la /tmp/project_deploy_v2* 2>&1 ; echo "---DEPLOY_SCRIPT_CONTENT_WAS---" ; cat /tmp/deploy_remote*.sh 2>&1 | head -80`);
    console.log(deploySh.slice(0, 1500));

    ssh.close?.();
    process.exit(0);
  } catch (e) {
    console.error('\nFATAL:', e);
    process.exit(1);
  }
})();
