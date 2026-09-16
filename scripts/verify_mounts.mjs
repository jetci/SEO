#!/usr/bin/env node
// VERIFY: VPS server/app.ts has DUAL api/oauth mount?
import SSHClient from "ssh2-promise";
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22 };
async function run(c, b){ try { return String(await c.exec(b, [])); } catch(e){ return `[ERR ${e.message}]`; } }
async function main(){
  const conn = new SSHClient(SSH_CFG);
  try {
    await conn.connect();
    console.log('1) VPS server/app.ts exists?',
      await run(conn, `ls -la /home/ubuntu/eeat-studio-v2/server/app.ts 2>&1`));
    console.log('2) VPS app.ts grep api/oauth + api/auth mount:');
    console.log(await run(conn, `grep -n "api/auth\|api/oauth\|authExpressRouter" /home/ubuntu/eeat-studio-v2/server/app.ts 2>&1`));
    console.log('3) VPS server/auth.ts exists?',
      await run(conn, `ls -la /home/ubuntu/eeat-studio-v2/server/auth.ts 2>&1`));
    console.log('4) VPS auth.ts grep google/callback handler:');
    console.log(await run(conn, `grep -n "google/callback\\|/callback\\|router.get\\|router.post" /home/ubuntu/eeat-studio-v2/server/auth.ts 2>&1 | head -25`));
    console.log('\n5) LOCAL tarball contents (deploy_tmp/project.tar.gz) — does it contain server/app.ts + auth.ts?');
    const { execSync } = await import('node:child_process');
    try {
      const tgz = String(execSync('tar -tzf "d:/AEO/SEO V2/deploy_tmp/project.tar.gz" 2>&1 | head -40'));
      console.log(tgz);
      console.log('server/app.ts in tarball?', /server\/app\.ts/.test(tgz));
      console.log('server/auth.ts in tarball?', /server\/auth\.ts/.test(tgz));
      console.log('server/app.ts TSX build import chain OK?', /app\.ts|auth\.ts/.test(tgz));
    } catch(e) { console.log('tar read err?', e.message); }
  } finally { try{ await conn.close(); }catch{} }
}
main().catch(e=>console.error(e));
