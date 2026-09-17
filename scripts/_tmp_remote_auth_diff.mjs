import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    console.log('=== REMOTE VPS auth.ts lines 85-110 (exact gates) ===');
    const gate = await execLine(ssh, `sed -n '85,110p' /home/ubuntu/eeat-studio-v2/server/auth.ts`);
    console.log(gate);
    console.log('\n=== LOCAL auth.ts lines 85-110 (for diff) ===');
    const { execSync } = await import('node:child_process');
    const local = String(execSync(`sed -n '85,110p' "d:/AEO/SEO V2/server/auth.ts"`, { encoding: 'utf-8' }));
    console.log(local);
    // Also search remote for "isTestUser" or "test1234" — old backdoor strings
    console.log('\n=== REMOTE auth.ts SEARCH test1234 / isTestUser / AUTH_DEBUG ===');
    const s1 = await execLine(ssh, `grep -nE 'test1234|isTestUser|AUTH_DEBUG' /home/ubuntu/eeat-studio-v2/server/auth.ts || echo 'NO MATCH (GOOD - DELETED)'`);
    console.log(s1);
    const s2 = await execLine(ssh, `wc -l /home/ubuntu/eeat-studio-v2/server/auth.ts`);
    console.log('Remote line count:', s2);
    const s3 = String(require('node:child_process').execSync(`wc -l "d:/AEO/SEO V2/server/auth.ts"`, { encoding: 'utf-8' }));
    console.log('Local line count :', s3.trim());
  } catch (e) { console.error('FAIL:', (e.message || String(e)).slice(0, 800));
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
