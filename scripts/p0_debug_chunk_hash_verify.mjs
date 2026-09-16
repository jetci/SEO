// DASHBOARD CHUNK HASH MISMATCH DEBUG:
// 1) grep built index.js for Dashboard chunk hashes (correctly references NEW DOAFcaeg or old DRWf6vNH?)
// 2) grep local src lazy import call name for Dashboard (verify filename matches actual DashboardOverviewPage or Dashboard)
import SSHClient from 'ssh2-promise';
import { execSync } from 'node:child_process';
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

    console.log('1) VPS index-DBxjIgtQ.js DASHBOARD RELATED HASH REFERENCES:\n');
    const c1 = await sh(ssh, `grep -oE 'Dashboard[-A-Za-z0-9_-]*\\.js|DashboardOverviewPage[-A-Za-z0-9_-]*\\.js|DRWf6vNH|DOAFcaeg' ${DEPLOY_DIR}/dist/assets/index-DBxjIgtQ.js | sort -u`);
    console.log(c1 || '(NONE!)');

    console.log('\n2) VPS index-DBxjIgtQ.js ALL chunk names referenced (ALL lazy imports):\n');
    const c2 = await sh(ssh, `grep -oE '/assets/[A-Za-z0-9._-]+\\.js' ${DEPLOY_DIR}/dist/assets/index-DBxjIgtQ.js | sort -u | head -60`);
    console.log(c2 || '(NONE!)');

    console.log('\n3) ACTUAL FILES PRESENT dist/assets/ that match chunks referenced in index.js:\n');
    const c3 = await sh(ssh, `
for chunk in $(grep -oE '/assets/[A-Za-z0-9._-]+\\.js' ${DEPLOY_DIR}/dist/assets/index-DBxjIgtQ.js | sort -u | sed 's|/assets/||'); do
  if [ -f "${DEPLOY_DIR}/dist/assets/$chunk" ]; then echo "✅ EXISTS: $chunk ($(stat -c%s ${DEPLOY_DIR}/dist/assets/$chunk) bytes)";
  else echo "❌ MISSING: $chunk"; fi
done
`);
    console.log(c3);

    console.log('\n4) LOCAL Windows machine: lazy imports in src App.tsx or router (the actual dashboard filename)\n');
    try {
      const l1 = String(execSync(`findstr /s /n /c:"lazy" /c:"Dashboard" "d:\\AEO\\SEO V2\\client\\src\\App.tsx" "d:\\AEO\\SEO V2\\client\\src\\*.tsx" "d:\\AEO\\SEO V2\\client\\src\\pages\\*Dashboard*" 2>&1 | findstr /i /c:"lazy" /c:"Dashboard" | head -30`, { encoding: 'utf8', timeout: 5000 })).trim();
      console.log(l1 || '(no App.tsx matches!)');
    } catch(e) { console.log('  findstr err1:', String(e.message||e).slice(0,150)); }

    console.log('\n5) LOCAL list actual Dashboard* files in src/pages:\n');
    try {
      const l2 = String(execSync(`dir /b "d:\\AEO\\SEO V2\\client\\src\\pages\\Dashboard*" 2>&1`, { encoding: 'utf8', timeout: 5000 })).trim();
      console.log(l2 || '(NO Dashboard files!)');
    } catch(e) { console.log('  dir err:', String(e.message||e).slice(0,150)); }

    console.log('\n6) VPS grep index.js for exact chunk URL patterns (how vite encodes dynamic import with preload hints):\n');
    const c6 = await sh(ssh, `grep -oE '\\{[a-zA-Z_$]+:"Dashboard[A-Za-z0-9_-]*\\.js"\\}|\\{[a-zA-Z_$]+:"Dashboard[A-Za-z0-9_-]*"\\}' ${DEPLOY_DIR}/dist/assets/index-DBxjIgtQ.js | sort -u | head -10`);
    console.log(c6 || '(not in format chunk map - check grep for chunk naming pattern)');

    console.log('\n7) HARD NAVIGATE browser using Ctrl+Shift+R alternative: add URL query param ?v=2 to bust any cache / stale service workers\n');

    ssh.close?.();
    process.exit(0);
  } catch (e) {
    console.error('\nFATAL:', e);
    process.exit(1);
  }
})();
