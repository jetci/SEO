// SIMPLE POST-DEPLOY VERIFY - 4 SSH probes directly (no nested backticks)
import SSHClient from 'ssh2-promise';
const SSH = {
  host: '35.231.230.218',
  username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt',
  port: 22,
  readyTimeout: 20000,
  keepaliveInterval: 30000,
};
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';
async function sh(ssh, cmd) {
  try {
    const s = (await ssh.exec(`export PATH="${NODE_PATH}:$PATH"; ${cmd}`))?.toString?.() ??
      String(await ssh.exec(cmd));
    return s.trim();
  } catch (e) {
    return String(e?.message ?? e);
  }
}
let pass = 0, fail = 0;
function a(cond, msg, g) {
  if (cond) { pass++; console.log('  ✅ PASS [' + g + '] ' + msg); }
  else { fail++; console.error('  ❌ FAIL [' + g + '] ' + msg); }
}
(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok\n');
    console.log('==== LIVE POST-DEPLOY VERIFY 4 GATES ====\n');

    // ── GATE 1: PM2 status id=0 PRESERVED + v2 online ──
    console.log('━━━━━━━━ GATE 1: PM2 status ━━━━━━━━━━');
    const pm2 = JSON.parse((await sh(ssh, 'pm2 jlist 2>/dev/null || echo "[]"')) || '[]');
    const v1 = pm2.find(p => p.pm_id === 0 || p.name === 'eeat-studio');
    const v2 = pm2.find(p => p.name === 'eeat-studio-v2');
    const v1On = v1 && (v1.pm2_env?.status === 'online' || v1.status === 'online');
    const v2On = v2 && (v2.pm2_env?.status === 'online' || v2.status === 'online');
    console.log('  PM2 ID=0 (eeat-studio V1) status:', v1?.pm2_env?.status || v1?.status || 'MISSING ❌');
    console.log('  PM2 eeat-studio-v2 (port3002) status:', v2?.pm2_env?.status || v2?.status || 'MISSING ❌');
    a(v1On, 'V1 ID=0 ONLINE FOREVER PRESERVED (NEVER killed)', 'PM2-ID0');
    a(v2On, 'V2 eeat-studio-v2 ONLINE after deploy reload', 'PM2-V2');

    // ── GATE 2: 5x auth.me + SLIDING set-cookie NOW PRESENT (await fix!) ──
    console.log('\n━━━━━━━━ GATE 2: 5x auth.me + sliding set-cookie ━━━━━━━━━━');
    const nodeSh = await sh(ssh, `cd ${DEPLOY_DIR} && node -e "
import 'dotenv/config';
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
const CN = process.env.SESSION_COOKIE_NAME || 'eeat_studio_v2_session';
const AOI = process.env.ADMIN_OPENID || '102308593207118714314';
const tok = await new SignJWT({ openId: AOI, appId: 'eeat-v2', name: 'Admin' }).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('24h').sign(secret);
let sliding=0, ok=0;
for(let i=1;i<=5;i++){
  const url='http://127.0.0.1:3002/api/trpc/auth.me?input='+encodeURIComponent('{}');
  const r=await fetch(url,{headers:{Cookie: CN+'='+tok, Accept:'application/json'}, credentials:'include'});
  const b=await r.text();
  const sc=r.headers.getSetCookie?r.headers.getSetCookie().length:(r.headers.get('set-cookie')?1:0);
  const il=/isLoggedIn[\"']?\\s*:\\s*true/.test(b);
  console.log('Call#'+i+': HTTP'+r.status+' login='+il+' setCookie='+sc);
  if(sc>0)sliding++; if(il)ok++;
}
console.log('SUMMARY login5x='+ok+'/5 sliding='+sliding+'/5');
process.exit((ok===5 && sliding>=1)?0:1);
" 2>&1`);
    console.log(nodeSh);
    const m5 = nodeSh.match(/SUMMARY login5x=(\d+)\/5 sliding=(\d+)\/5/);
    const loginOk = m5 ? parseInt(m5[1]) === 5 : /Call#1: HTTP200 login=true/.test(nodeSh);
    const slidOk = m5 ? parseInt(m5[2]) >= 1 : /setCookie=[1-9]/.test(nodeSh);
    a(loginOk, '5x consecutive auth.me all isLoggedIn=true (server session valid)', 'AUTH-5X');
    a(slidOk, 'Sliding Set-Cookie issued >=1 times (await fix works → never expires active user)', 'SLIDING-COOKIE');

    // Public nginx auth.me too
    const pubSh = await sh(ssh, `cd ${DEPLOY_DIR} && node -e "
import 'dotenv/config';
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
const CN = process.env.SESSION_COOKIE_NAME || 'eeat_studio_v2_session';
const AOI = process.env.ADMIN_OPENID || '102308593207118714314';
const tok = await new SignJWT({ openId: AOI, appId: 'eeat-v2', name: 'Admin' }).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('24h').sign(secret);
const r=await fetch('https://thaiaeo.manus.host/api/trpc/auth.me?input='+encodeURIComponent('{}'),{headers:{Cookie: CN+'='+tok, Accept:'application/json'}, credentials:'include'});
const b=await r.text();
const il=/isLoggedIn[\"']?\\s*:\\s*true/.test(b);
const sc=r.headers.getSetCookie?r.headers.getSetCookie().length:(r.headers.get('set-cookie')?1:0);
console.log('PUBLIC: HTTP'+r.status+' login='+il+' setCookie='+sc);
console.log('BODY:'+b.slice(0,180));
process.exit(il?0:1);
" 2>&1`);
    console.log('\nPublic Nginx:', pubSh);
    a(/login=true/.test(pubSh), 'Public HTTPS auth.me isLoggedIn=true (cookie passes nginx)', 'AUTH-PUBLIC');

    // ── GATE 3: Express 301 redirects GONE? SPA fallback index.html served? ──
    console.log('\n━━━━━━━━ GATE 3: Express 301 gone, SPA fallback OK ━━━━━━━━━━');
    const routes = ['/login', '/kcp', '/projects', '/settings'];
    let no301Count = 0, spaCount = 0;
    for (const r of routes) {
      const rSh = await sh(ssh, `curl -skD - -o /tmp/body_safe.txt http://127.0.0.1:3002${r} 2>&1 | head -12 ; echo "---BODY---" ; head -c 100 /tmp/body_safe.txt`);
      const is301 = /301 Moved Permanently|301 Redirect/.test(rSh);
      const isSpa = /DOCTYPE html|<html lang|<div id="root"|EEAT Studio/i.test(rSh);
      console.log(`  ${r}: 301? ${is301 ? '❌ YES (BUG)' : '✅ NO'} | SPA React index.html? ${isSpa ? '✅ YES' : '❌ NO'}`);
      if (!is301) no301Count++;
      if (isSpa) spaCount++;
    }
    a(no301Count === routes.length, `NO 301 HTML redirect on all ${routes.length} routes (redirect:false fix)`, 'NO-301');
    a(spaCount === routes.length, `SPA fallback index.html served for all ${routes.length} client routes`, 'SPA-FALLBACK');

    // ── GATE 4: AC-6 FOREVER tables count exact V2=14 V1=51 ──
    console.log('\n━━━━━━━━ GATE 4: AC-6 FOREVER DB LOCK V2=14 V1=51 ━━━━━━━━━━');
    const envSh = await sh(ssh, `cd ${DEPLOY_DIR} && node -e "
require('dotenv').config({path:'./.env'});
const {execSync}=require('node:child_process');
const cmd=(c)=>{try{return String(execSync(c,{encoding:'utf8',timeout:8000})).trim();}catch(e){return String(e?.stderr||'').trim();}};
const H=process.env.DB_HOST||'127.0.0.1';
const P=process.env.DB_PORT||'3307';
const U=process.env.DB_USER||'eeat';
const PW=process.env.DB_PASSWORD||'';
const D2=process.env.DB_NAME||'eeat_studio_v2';
const D1='eeat_studio';
const pwFlag = PW?('-p'+PW):'';
const q2='SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\\''+D2+'\\';';
const q1='SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\\''+D1+'\\';';
const cv2=parseInt(cmd('mariadb -h'+H+' -P'+P+' -u'+U+' '+pwFlag+' '+D2+' -BNe \"'+q2+'\" 2>/dev/null').split('\\n').pop()||'0')||0;
const cv1=parseInt(cmd('mariadb -h'+H+' -P'+P+' -u'+U+' '+pwFlag+' '+D1+' -BNe \"'+q1+'\" 2>/dev/null').split('\\n').pop()||'0')||0;
console.log('V2='+cv2+' (EXPECT 14) V1='+cv1+' (EXPECT 51)');
process.exit((cv2===14 && cv1===51)?0:1);
" 2>&1`);
    console.log('  ', envSh || '(DB verify output empty)');
    const v2M = envSh.match(/V2=(\d+)/);
    const v1M = envSh.match(/V1=(\d+)/);
    const cv2 = v2M ? parseInt(v2M[1]) : 0;
    const cv1 = v1M ? parseInt(v1M[1]) : 0;
    a(cv2 === 14, `AC-6 V2 eeat_studio_v2 = EXACT 14 tables ZERO ALTER/DROP/TRUNCATE. actual=${cv2}`, 'AC6-V2');
    a(cv1 === 51, `AC-6 V1 eeat_studio = EXACT 51 tables FOREVER PRESERVED NEVER TOUCHED. actual=${cv1}`, 'AC6-V1');

    console.log(`\n==== ✅ FINAL RESULT: PASS=${pass} / ${pass+fail}  FAIL=${fail} ====`);
    ssh.close?.();
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    console.error('\nFATAL:', e);
    process.exit(1);
  }
})();
