import { Client } from 'ssh2';
import { readFileSync } from 'fs';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(2); }
    // Upload LOCAL server/auth.ts (CLEAN v16 gate code) to VPS
    const localAuth = readFileSync('d:\\AEO\\SEO V2\\server\\auth.ts');
    console.log('Local clean auth.ts size=', localAuth.length);
    sftp.writeFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', localAuth, (werr) => {
      if (werr) { console.error('SFTP write fail', werr); process.exit(5); }
      console.log('VPS auth.ts RESTORED successfully');
      // Now modify this clean auth.ts by reading it back, adding debug BEFORE if (IS_PROD && !(
      sftp.readFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', null, (rerr, buf) => {
        if (rerr) { console.error(rerr); process.exit(6); }
        let content = buf.toString();
        const before = content;
        const OLD_BLOCK = `
    if (IS_PROD && !(prodDemoAllowed && isAdminOpenId && pwdMatch)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'devSignin is disabled in production.',
      });
    }`;
        const NEW_BLOCK = `
    console.warn('[AUTH_DEBUG_V16] IS_PROD=', IS_PROD, 'NODE_ENV=', process.env.NODE_ENV);
    console.warn('[AUTH_DEBUG_V16] input keys =', JSON.stringify(Object.keys(input || {})));
    console.warn('[AUTH_DEBUG_V16] input openId len=', String(input?.openId || '').length, ' =', String(input?.openId || '').slice(0, 32));
    console.warn('[AUTH_DEBUG_V16] prodDemoAllowed:', prodDemoAllowed, 'ALLOW_raw:', JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN || ''));
    console.warn('[AUTH_DEBUG_V16] inputPWD len=', String(input?.password || '').length,
      ' FIRST8=', [...String(input?.password || '').slice(0, 8)].map(c => c.charCodeAt(0)).join(','),
      ' LAST6=', [...String(input?.password || '').slice(-6)].map(c => c.charCodeAt(0)).join(','));
    console.warn('[AUTH_DEBUG_V16] inputPWD string=|' + String(input?.password || '') + '|');
    const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim();
    console.warn('[AUTH_DEBUG_V16] envPWD   len=', String(prodDemoPwd || '').length,
      ' FIRST8=', [...String(prodDemoPwd || '').slice(0, 8)].map(c => c.charCodeAt(0)).join(','),
      ' LAST6=', [...String(prodDemoPwd || '').slice(-6)].map(c => c.charCodeAt(0)).join(','));
    console.warn('[AUTH_DEBUG_V16] envPWD   string=|' + String(prodDemoPwd || '') + '|');
    console.warn('[AUTH_DEBUG_V16] ENV.ADMIN_OPENID len=', String(ENV.ADMIN_OPENID || '').length, ' =', String(ENV.ADMIN_OPENID || '').slice(0, 32));
    console.warn('[AUTH_DEBUG_V16] isAdminOpenId:', isAdminOpenId);
    console.warn('[AUTH_DEBUG_V16] pwdMatch:', pwdMatch);
    console.warn('[AUTH_DEBUG_V16] FINAL TRIPLE (prodDemoAllowed, isAdminOpenId, pwdMatch):', prodDemoAllowed, isAdminOpenId, pwdMatch, 'IS_PROD=', IS_PROD);
    if (IS_PROD && !(prodDemoAllowed && isAdminOpenId && pwdMatch)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'devSignin is disabled in production.',
      });
    }`;
        if (!content.includes(OLD_BLOCK.trim().split('\n')[0].trim())) {
          console.error('Cannot find anchor block! Searching for FORBIDDEN block...');
          const idx = content.indexOf("devSignin is disabled in production");
          console.log('Found FORBIDDEN msg at char idx=', idx);
          console.log('around there:', content.slice(idx - 500, idx + 300));
          process.exit(88);
        }
        content = content.replace(OLD_BLOCK, NEW_BLOCK);
        if (content === before) { console.error('REPLACE DID NOT FIRE!'); process.exit(9); }
        sftp.writeFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', content, (w2err) => {
          if (w2err) { console.error(w2err); process.exit(10); }
          console.log('Debug-injected auth.ts SIZE=', content.length);
          const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== QUICK SYNTAX TEST via tsx --eval import ==="
timeout 45 ./node_modules/.bin/tsx -e "import(\`./server/auth.ts\`).then(m => { console.log(\`AUTH IMPORT OK keys=\`, Object.keys(m).slice(0,8)); process.exit(0); }).catch(e => { console.error(\`AUTH IMPORT FAIL:\`, e.message); process.exit(1); })" 2>&1 | tail -n 20
SYNTAX_RC=$?
echo "SYNTAX_RC=$SYNTAX_RC"
if [ $SYNTAX_RC -ne 0 ]; then echo "SYNTAX FAIL - stop"; exit 66; fi
echo "=== restart eeat-studio-v2 id=94 now ==="
pm2 restart eeat-studio-v2 2>&1 | tail -n 3
sleep 8
echo "=== PM2 list ==="
pm2 list 2>&1 | grep eeat
echo "=== curl test ==="
RESP=$(curl -s -X POST http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1 \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/_v162_body.json 2>&1)
echo "RESP:"
echo $RESP | head -c 800
echo ""
echo "=== PM2 ERR logs 50 lines ==="
pm2 logs eeat-studio-v2 --nostream --lines 50 --err 2>&1 | tail -n 60
'`;
          conn.exec(CMD, (e,s) => {
            if (e) { console.error(e); process.exit(2); }
            s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
              .on('data', d => process.stdout.write(d.toString()))
              .stderr.on('data', d => process.stdout.write(d.toString()));
          });
        });
      });
    });
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
