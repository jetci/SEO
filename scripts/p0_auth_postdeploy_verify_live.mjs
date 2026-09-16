// SSH wrapper: upload postdeploy verify script to VPS DEPLOY_DIR and execute
import SSHClient from 'ssh2-promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok');
    // Fix the require issue first: script uses require() which won't work in ESM
    // Let's rewrite script to use EXEC via SSH curl for routes + DB via mariadb cmd (no require child_process)
    const postDeployScript = `import 'dotenv/config';
import { SignJWT, jwtVerify } from 'jose';
import { execSync } from 'node:child_process';
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'eeat_studio_v2_session';
const ADMIN_OPENID = process.env.ADMIN_OPENID || '102308593207118714314';
const DB_USER = process.env.DB_USER || 'eeat';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || '3307';
const DB_V2 = process.env.DB_NAME || 'eeat_studio_v2';
const DB_V1 = 'eeat_studio';
function sh(cmd){try{return String(execSync(cmd,{encoding:'utf8',timeout:15000})).trim();}catch(e){return String(e?.stderr||e?.message||e).trim();}}
async function main(){
  let pass=0,fail=0;
  const a=(c,m,g)=>{if(c){pass++;console.log('  ✅ PASS ['+g+'] '+m);}else{fail++;console.error('  ❌ FAIL ['+g+'] '+m);}};
  console.log('\\n==== LIVE POST-DEPLOY AUTH-FIX VERIFY ====\\n');
  const pm2=JSON.parse(sh('pm2 jlist 2>/dev/null || echo "[]"')||'[]');
  const v1=pm2.find(p=>p.pm_id===0||p.name==='eeat-studio');
  const v2=pm2.find(p=>p.name==='eeat-studio-v2');
  const v1On=v1&&(v1.pm2_env?.status==='online'||v1.status==='online');
  const v2On=v2&&(v2.pm2_env?.status==='online'||v2.status==='online');
  a(v1On,\`PM2 ID=0 eeat-studio V1 online FOREVER. actual=\${v1?.pm2_env?.status||v1?.status||'MISSING'}\`, 'PM2-ID0');
  a(v2On,\`PM2 eeat-studio-v2 online. actual=\${v2?.pm2_env?.status||v2?.status||'MISSING'}\`, 'PM2-V2');
  console.log('\\n--- Fix#2: await touchSessionCookie (sliding set-cookie now present?) ---');
  const tok = await new SignJWT({ openId: ADMIN_OPENID, appId: 'eeat-v2', name: 'Admin Intelman' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('24h').sign(secret);
  let sliding=0, loggedIn=0;
  for(let i=1;i<=5;i++){
    const r=await fetch(\`http://127.0.0.1:3002/api/trpc/auth.me?input=\${encodeURIComponent('{}')}\`,{headers:{Cookie:\`\${COOKIE_NAME}=\${tok}\`,Accept:'application/json'},credentials:'include'});
    const b=await r.text();
    const sc=r.headers.getSetCookie?r.headers.getSetCookie().length:(r.headers.get('set-cookie')?1:0);
    const il=/isLoggedIn["']?\\s*:\\s*true/.test(b);
    if(sc>0)sliding++; if(il)loggedIn++;
    console.log(\`  Call#\${i}: HTTP\${r.status} isLoggedIn=\${il?'✅TRUE':'❌FALSE'} setCookie=\${sc}\${sc>0?' → SLIDING!':''}\`);
  }
  a(loggedIn===5,\`5x auth.me isLoggedIn:true all 5 calls. actual=\${loggedIn}/5\`, 'AUTH-5x');
  a(sliding>=1,\`Sliding Set-Cookie present (await fix). actual calls_with_setCookie=\${sliding}/5\`, 'SLIDING-COOKIE');
  const rPub=await fetch(\`https://thaiaeo.manus.host/api/trpc/auth.me?input=\${encodeURIComponent('{}')}\`,{headers:{Cookie:\`\${COOKIE_NAME}=\${tok}\`,Accept:'application/json'},credentials:'include'});
  const bPub=await rPub.text(); const scPub=rPub.headers.getSetCookie?rPub.headers.getSetCookie().length:(rPub.headers.get('set-cookie')?1:0);
  const ilPub=/isLoggedIn["']?\\s*:\\s*true/.test(bPub);
  a(ilPub,\`Public Nginx auth.me isLoggedIn:true. actual=\${ilPub}\`, 'AUTH-PUBLIC');
  console.log('  Public Set-Cookie sliding count:', scPub, scPub>0?'✅ (Nginx passes sliding)':'⚠️ (Nginx may drop, not critical)');
  console.log('\\n--- Fix#1: express.static redirect:false (NO 301 HTML redirect anymore!) ---');
  const routes=['/login','/kcp','/projects','/settings'];
  let no301=0,spa=0;
  for(const r of routes){
    const head=sh(\`curl -skD - -o /tmp/body.txt http://127.0.0.1:3002\${r} 2>&1 | head -15\`);
    const body=sh('head -c 120 /tmp/body.txt');
    const is301=/301 Moved Permanently/.test(head);
    const isSpa=/DOCTYPE html|<html lang=|<div id="root"|EEAT Studio/i.test(body);
    no301+=is301?0:1; spa+=isSpa?1:0;
    console.log(\`  \${r}: 301? \${is301?'❌ YES':'✅ NO'} | SPA? \${isSpa?'✅ YES (index.html React)':'❌ NO!'}\`);
  }
  a(no301===routes.length,\`NO 301 redirect on all routes n=\${routes.length}. actual=\${no301}/\${routes.length}\`, 'NO-301');
  a(spa===routes.length,\`SPA index.html fallback served on all routes. actual=\${spa}/\${routes.length}\`, 'SPA-OK');
  console.log('\\n--- AC-6 FOREVER: V2=14 V1=51 tables EXACT ---');
  const cv2=parseInt(String(sh(\`mariadb -h\${DB_HOST} -P\${DB_PORT} -u\${DB_USER} \${DB_PASS?\`-p\${DB_PASS}\`:''} \${DB_V2} -BNe "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='\${DB_V2}';" 2>/dev/null || echo 0\`).trim())||0;
  const cv1=parseInt(String(sh(\`mariadb -h\${DB_HOST} -P\${DB_PORT} -u\${DB_USER} \${DB_PASS?\`-p\${DB_PASS}\`:''} \${DB_V1} -BNe "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='\${DB_V1}';" 2>/dev/null || echo 0\`).trim())||0;
  console.log(\`  V2 \${DB_V2} tables = \${cv2} (EXPECT 14)\`);
  console.log(\`  V1 \${DB_V1} tables = \${cv1} (EXPECT 51)\`);
  a(cv2===14,\`AC-6 V2=EXACT 14 (ZERO ALTER/DROP). actual=\${cv2}\`, 'AC6-V2');
  a(cv1===51,\`AC-6 V1=EXACT 51 FOREVER PRESERVED. actual=\${cv1}\`, 'AC6-V1');
  console.log('\\n==== VERIFY SUMMARY: ✅ PASS='+pass+' ❌ FAIL='+fail+' ====');
  process.exit(fail>0?1:0);
}
main().catch(e=>{console.error('FATAL:',e);process.exit(1);});
`;
    const sftp = ssh.sftp();
    await sftp.writeFile(`${DEPLOY_DIR}/_tmp_postdeploy_verify.mjs`, postDeployScript);
    console.log(`✅ Upload verify script (${Buffer.byteLength(postDeployScript)} bytes)`);
    console.log('\n==== EXECUTING POST-DEPLOY VERIFY ====\n');
    const out = await sh(ssh, `cd ${DEPLOY_DIR} && node _tmp_postdeploy_verify.mjs 2>&1`);
    console.log(out);
    ssh.close?.();
  } catch (e) {
    console.error('FATAL wrapper:', e);
    process.exit(1);
  }
})();
