import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function exec(ssh, cmd, opts={}) { return String(await ssh.exec(cmd, opts) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    const cwd = '/home/ubuntu/eeat-studio-v2';
    // Write a tiny tsx file to check env values loaded at runtime
    const script = String.raw
`import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);
import './server/_core/env.js';
const ENV = await import('./server/_core/env.js').then(m=>m.ENV);
const IS_PROD = process.env.NODE_ENV === 'production' && !process.env.VERCEL_DEPLOYED;
console.log('cwd:', process.cwd());
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('VERCEL_DEPLOYED:', process.env.VERCEL_DEPLOYED);
console.log('IS_PROD computed:', IS_PROD);
console.log('process.env.ALLOW_PROD_DEMO_SIGNIN:', JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
console.log('process.env.PROD_DEMO_SIGNIN_PASSWORD length:', JSON.stringify(process.env.PROD_DEMO_SIGNIN_PASSWORD||'').length);
console.log('ENV.ADMIN_OPENID:', JSON.stringify(ENV.ADMIN_OPENID));
console.log('ENV.ADMIN_OPENID length:', String(ENV.ADMIN_OPENID||'').length);
const openId = '102308593207118714314';
const pwd = 'K9XmPq4Rtv2ZB8Lw3N!7C';
const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1';
const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim();
const isAdminOpenId = String(openId || '').trim() === String(ENV.ADMIN_OPENID || '').trim();
const pwdMatch = prodDemoPwd ? (String(pwd || '').trim() === prodDemoPwd) : false;
console.log('prodDemoAllowed:', prodDemoAllowed);
console.log('prodDemoPwd set:', !!prodDemoPwd);
console.log('isAdminOpenId:', isAdminOpenId);
console.log('pwdMatch:', pwdMatch);
console.log('ALL PASS:', prodDemoAllowed && isAdminOpenId && pwdMatch);
if (!pwdMatch) { console.log('pwd vs actual:', JSON.stringify(String(pwd||'').trim()), JSON.stringify(prodDemoPwd)); }
`;
    // Upload script content via SFTP as /tmp/check_signin.mjs inside vps
    const sftp = ssh.sftp();
    await sftp.writeFile('/home/ubuntu/eeat-studio-v2/_tmp_check_signin.mjs', script);
    console.log('[run tsx check...]');
    const out = await exec(ssh, `cd /home/ubuntu/eeat-studio-v2 && timeout 45 node --import tsx/esm _tmp_check_signin.mjs 2>&1 | tail -50`);
    console.log(out);
    // cleanup
    await exec(ssh, `rm -f /home/ubuntu/eeat-studio-v2/_tmp_check_signin.mjs`).catch(()=>{});
  } finally { await ssh.close(); }
}
main().catch(e => console.error(e.message));
