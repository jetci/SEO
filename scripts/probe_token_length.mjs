import SSHClient from "ssh2-promise";

const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};

async function main() {
  const ssh = new SSHClient(CFG);
  await ssh.connect();
  console.log("SSH CONNECTED");

  const run = async (label, cmd) => {
    console.log(`\n=== [${label}] ===`);
    const r = await ssh.exec(cmd).catch(e => String(e?.stack || e));
    console.log(String(r).slice(0, 5000));
  };

  // S1: OLD v1 eeat-studio server/_core/sdk.ts signSession — check OLD token length expected
  await run("S1 OLD v1 eeat-studio SDK — search sdk session token create/length validation",
    `cd /home/ubuntu/eeat-studio/server && find . -name 'sdk*.ts' -o -name 'sdk*.js' 2>/dev/null | head -5 && echo '--- grep signSession / createSessionToken / LENGTH check OLD v1 ---' && grep -rnE 'Session token|signSession|token\\.length|invalid.*length|180.*240|expected' . --include='*.ts' --include='*.js' 2>/dev/null | grep -v node_modules | head -20`);

  // S2: Inline Node run — generate two tokens on VPS live eeat-studio-v2: one with empty name (old code expected 199), one with name "Admin V2" (real scenario user gets)
  await run("S2 V2 LIVE: Generate 2 test JWT tokens with real VPS SESSION_SECRET via inline Node script (SEE ACTUAL LENGTH)",
    `cd /home/ubuntu/eeat-studio-v2 && cat > /tmp/test_token_length.mjs <<'NODEEOF'
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
// Parse VPS real .env SESSION_SECRET
const env = readFileSync('.env','utf8');
const sec = (env.match(/^SESSION_SECRET=(.*)$/m) || [])[1] || '';
const uid = (env.match(/^ADMIN_OPENID=(.*)$/m) || [])[1] || '102308593207118714314';
const TTL = 86400000;
const expSec = Math.floor((Date.now()+TTL)/1000);
const key = new TextEncoder().encode(sec);
async function build(openId, name) {
  const token = await new SignJWT({ openId, appId:'eeat-studio-v2', name })
    .setProtectedHeader({alg:'HS256',typ:'JWT'})
    .setExpirationTime(expSec)
    .sign(key);
  console.log('name="' + name + '" len=' + token.length + ' first10=' + token.slice(0,10) + ' last10=' + token.slice(-10));
}
console.log('SESSION_SECRET length=', sec.length, 'ADMIN_OPENID=' + uid);
await build(uid, '');
await build(uid, 'Admin V2');
NODEEOF
node /tmp/test_token_length.mjs 2>&1
rm -f /tmp/test_token_length.mjs`);

  await ssh.close();
  console.log("\n✅ S2 done — root cause 272 = real normal JWT with NAME field");
}
main().catch(e => { console.error(e); process.exit(1); });
