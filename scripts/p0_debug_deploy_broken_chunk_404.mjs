// INVESTIGATE: Deployed VPS dist chunk mismatch (index.html refs Dashboard-DRWf6vNH.js but asset MISSING 404?)
import SSHClient from 'ssh2-promise';
import fetch from 'node-fetch';
const SSH = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22, readyTimeout: 20000, keepaliveInterval: 30000 };
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';
async function sh(ssh, cmd) {
  try {
    const s = (await ssh.exec(`export PATH="${NODE_PATH}:$PATH"; ${cmd}`))?.toString?.() ?? String(await ssh.exec(cmd));
    return s.trim();
  } catch (e) { return String(e?.message ?? e); }
}
(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok\n');

    console.log('1) 🚨 DIRECT URL FETCH for Dashboard-DRWf6vNH.js asset:\n');
    try {
      const r1 = await fetch('https://thaiaeo.manus.host/assets/Dashboard-DRWf6vNH.js');
      console.log('   HTTPS PUBLIC: HTTP', r1.status, 'size=', parseInt(r1.headers.get('content-length')||'0'));
      if (r1.status !== 200) console.log('   BODY[0:200]:', (await r1.text()).slice(0, 200));
      const r2 = await fetch('http://127.0.0.1:3002/assets/Dashboard-DRWf6vNH.js'); // FAIL: localhost not here, skip
    } catch (e) { console.log('   fetch err:', e.message); }

    console.log('\n2) 📁 VPS DEPLOY_DIR/dist/assets/ LIST chunk files:\n');
    const listing = await sh(ssh, `ls -la ${DEPLOY_DIR}/dist/assets/ 2>&1 | head -60`);
    console.log(listing);

    console.log('\n3) 📄 VPS index.html references:\n');
    const index = await sh(ssh, `grep -oE 'src="[^"]+"|href="[^"]+"' ${DEPLOY_DIR}/dist/index.html | head -40`);
    console.log(index || '(empty)');

    console.log('\n4) 🔍 Search for Dashboard chunk by hash DRWf6vNH actually present:\n');
    const hasF = await sh(ssh, `find ${DEPLOY_DIR}/dist -name "*DRWf6vNH*" -type f 2>&1 | head`);
    console.log('   file named DRWf6vNH:', hasF || '(NOT FOUND!)');

    console.log('\n5) 🔎 ALL Dashboard chunks:\n');
    const dashAll = await sh(ssh, `ls -la ${DEPLOY_DIR}/dist/assets/Dashboard-* 2>&1`);
    console.log(dashAll || '(NO Dashboard chunks!)');

    console.log('\n6) 📦 Local tarball build Dashboard chunk check (Windows machine):\n');
    const { execSync } = await import('node:child_process');
    try {
      const lDash = String(execSync('dir /b "d:\\AEO\\SEO V2\\dist\\assets\\Dashboard-*.js" 2>&1', { encoding: 'utf8', timeout: 5000 })).trim();
      console.log('   Local dist assets Dashboard files:\n' + lDash);
    } catch(e) { console.log('   local err:', e.message); }

    console.log('\n7) 🔎 Is index.html on VPS pointing to OLD chunk names from PREVIOUS build?');
    console.log('   (If tar extract overlay old dist, index may be NEW but Dashboard chunk NEW hash only in tar — UNLESS tar overwrote entire dist cleanly!)');
    console.log('   Deploy script CLEAN command (check if it did rm -rf dist?):');
    const cleanc = await sh(ssh, `ls -la ${DEPLOY_DIR} | head -20 ; echo "---" ; echo "node_modules present? $(ls -d ${DEPLOY_DIR}/node_modules 2>&1 | head -1)" ; echo "---" ; echo "tar version tar --version: $(tar --version 2>&1 | head -1)"`);
    console.log(cleanc);

    ssh.close?.();
    process.exit(0);
  } catch (e) {
    console.error('\nFATAL:', e);
    process.exit(1);
  }
})();
