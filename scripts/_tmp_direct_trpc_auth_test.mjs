import ssh2 from 'ssh2-promise';
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', readyTimeout: 30000 };
async function execLine(ssh, cmd) { return String(await ssh.exec(cmd) || '').trim(); }
async function main() {
  const ssh = new ssh2(SSH_CFG);
  try {
    await ssh.connect();
    // Test 1: DIRECT tRPC POST via curl to localhost:3002
    console.log('=== TEST DIRECT tRPC auth.devSignin via curl (VPS localhost, no browser) ===');
    const payload = JSON.stringify({
      "0": {
        json: {
          openId: "102308593207118714314",
          password: "K9XmPq4Rtv2ZB8Lw3N!7C",
          email: "intelman26@gmail.com",
          name: "Admin Test",
          role: "admin"
        }
      }
    });
    const curl = `curl -sS -X POST -H "Content-Type: application/json" -H "X-Trpc-Batch: 1" --data '${payload}' "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" 2>&1 | head -30`;
    console.log('CMD:', curl.length < 200 ? curl : curl.slice(0, 200));
    const r = await execLine(ssh, curl);
    console.log(`RESULT (${r.length} chars):\n${r}\n`);
    // Test 2: Also read ENV inside server via eval directly to double check
    console.log('=== TEST 2: Check actual runtime ENV inside V2 server process (via node) ===');
    const t2 = await execLine(ssh, `cd /home/ubuntu/eeat-studio-v2 && node --input-type=module -e "
import 'dotenv/config';
const ALLOW = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1';
const PWD = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim();
const ADMIN = String(process.env.ADMIN_OPENID || '').trim();
const INPUT_OID = '102308593207118714314';
const INPUT_PWD = 'K9XmPq4Rtv2ZB8Lw3N!7C';
console.log('prodDemoAllowed:', ALLOW);
console.log('pwdMatch direct:', PWD === INPUT_PWD, 'PWD.len:', PWD.length, 'INPUT.len:', INPUT_PWD.length);
console.log('isAdminOpenId:', ADMIN === INPUT_OID);
console.log('FINAL 3 GATE AND:', ALLOW && (ADMIN===INPUT_OID) && (PWD===INPUT_PWD));
" 2>&1`);
    console.log(t2);
  } catch (e) { console.error('FAIL:', (e.message || String(e)).slice(0, 800));
  } finally { try { await ssh.close(); } catch(_){} }
}
main();
