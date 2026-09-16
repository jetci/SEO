#!/usr/bin/env node
// HOTFIX INVESTIGATE: Cannot GET /api/oauth/google/callback → diagnose
import SSHClient from "ssh2-promise";

const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22 };

async function run(c, b){ try { return String(await c.exec(b, [])); } catch(e){ return `[ERR ${e.message}]`; } }

async function main(){
  const conn = new SSHClient(SSH_CFG);
  try {
    await conn.connect();
    console.log('🔗 SSH CONNECTED → START BUG INVESTIGATE\n');

    console.log('━━━━━━━━━━━━━━━ STEP 1: PM2 STATUS ━━━━━━━━━━━━━━━━━━━━');
    console.log(await run(conn, `pm2 list 2>&1 | head -25`));

    console.log('\n━━━━━━━━━━━━━━━ STEP 2: PM2 ERROR LOGS eeat-studio-v2 LAST 50 ━━━━━━━━━━━━━━━━━━━━');
    console.log(await run(conn, `pm2 logs eeat-studio-v2 --nostream --lines 50 --err 2>&1`));

    console.log('\n━━━━━━━━━━━━━━━ STEP 3: PM2 OUTPUT LOGS eeat-studio-v2 LAST 80 ━━━━━━━━━━━━━━━━━━━━');
    console.log(await run(conn, `pm2 logs eeat-studio-v2 --nostream --lines 80 --out 2>&1`));

    console.log('\n━━━━━━━━━━━━━━━ STEP 4: PROBE LOCAL VPS 127.0.0.1:3002 ROUTES ━━━━━━━━━━━━━━━━━━━━');
    console.log('Callback route code:', await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:3002/api/oauth/google/callback 2>&1`));
    console.log('Auth alt route code:', await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:3002/api/auth/google/callback 2>&1`));
    console.log('Health code:', await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:3002/api/health 2>&1`));
    console.log('Home SPA code:', await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:3002/ 2>&1`));

    console.log('\n━━━━━━━━━━━━━━━ STEP 5: VPS .env GOOGLE CALLBACK VALUES ━━━━━━━━━━━━━━━━━━━━');
    console.log(await run(conn, `grep -n -i "google\\|callback\\|redirect_uri\\|GOOGLE" /home/ubuntu/eeat-studio-v2/.env 2>&1 | head -20`));

    console.log('\n━━━━━━━━━━━━━━━ STEP 6: SERVER CODE auth route MOUNTS (dual mount rule) ━━━━━━━━━━━━━━━━━━━━');
    console.log(await run(conn, `grep -n -C 2 "authExpressRouter\\|/api/oauth\\|/api/auth\\|google/callback" /home/ubuntu/eeat-studio-v2/server/index.ts 2>&1 | head -40`));

    console.log('\n━━━━━━━━━━━━━━━ STEP 7: auth router handler METHOD check (GET callback?) ━━━━━━━━━━━━━━━━━━━━');
    console.log(await run(conn, `grep -n -C 3 "google.*callback\\|router.get.*callback\\|router.post.*callback" /home/ubuntu/eeat-studio-v2/server/routers/auth.ts 2>&1 | head -60`));

    console.log('\n━━━━━━━━━━━━━━━ STEP 8: LIVE PROBE PUBLIC HTTPS ROUTES ━━━━━━━━━━━━━━━━━━━━');
    console.log('HTTPS callback code:', await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/api/oauth/google/callback 2>&1`));
    console.log('HTTPS auth code:', await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/api/auth/google/callback 2>&1`));
    console.log('HTTPS health code:', await run(conn, `curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host/api/health 2>&1`));
    console.log('HTTPS health body (trunc):', (await run(conn, `curl -sk --max-time 10 https://thaiaeo.manus.host/api/health 2>&1`)).slice(0,300));

  } finally { try{ await conn.close(); }catch{} }
}
main().catch(e=>console.error('MAIN ERR:', e));
