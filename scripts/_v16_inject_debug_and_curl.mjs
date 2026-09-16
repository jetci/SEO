import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(2); }
    // 1. Read current VPS auth.ts
    sftp.readFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', null, (rerr, buf) => {
      if (rerr) { console.error(rerr); process.exit(3); }
      let content = buf.toString('utf8');
      console.log('Original auth.ts length:', content.length);
      // Find & replace the if (IS_PROD && !(... block to add debug BEFORE it)
      const NEEDLE_BEFORE = `
      const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1';`;
      const REPLACEMENT = `
      console.warn('[AUTH_DEBUG_V16] IS_PROD=', IS_PROD, 'NODE_ENV=', process.env.NODE_ENV);
      console.warn('[AUTH_DEBUG_V16] input keys =', Object.keys(input || {}));
      console.warn('[AUTH_DEBUG_V16] input openId =', String(input?.openId || '').slice(0, 40));
      const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1';
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
      const isAdminOpenId = String(input.openId || '').trim() === String(ENV.ADMIN_OPENID || '').trim();
      console.warn('[AUTH_DEBUG_V16] isAdminOpenId:', isAdminOpenId, 'ENV.ADMIN_OPENID=', String(ENV.ADMIN_OPENID || '').slice(0, 30));
      const pwdMatch = prodDemoPwd ? (String(input.password || '').trim() === prodDemoPwd) : false;
      console.warn('[AUTH_DEBUG_V16] pwdMatch:', pwdMatch);
      console.warn('[AUTH_DEBUG_V16] FINAL TRIPLE:', prodDemoAllowed, isAdminOpenId, pwdMatch, 'IS_PROD=', IS_PROD);
      if (IS_PROD && !(prodDemoAllowed && isAdminOpenId && pwdMatch)) {`;
      if (!content.includes('const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN')) {
        console.error('NEEDLE prodDemoAllowed NOT found in VPS auth.ts!');
        process.exit(4);
      }
      content = content.replace(
        /const prodDemoAllowed = String\(process\.env\.ALLOW_PROD_DEMO_SIGNIN \|\| '0'\) === '1';/,
        REPLACEMENT.trim().replace(/^\s*const prodDemoAllowed =/, '')
      );
      // Write back
      sftp.writeFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', content, (werr) => {
        if (werr) { console.error(werr); process.exit(5); }
        console.log('Wrote back auth.ts len=', content.length, ' added debug lines OK');
        // Restart PM2 v2
        const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
pm2 flush eeat-studio-v2 >/dev/null 2>&1
pm2 restart eeat-studio-v2 2>&1 | tail -n 3
sleep 6
echo "=== curl with password payload ==="
curl -s -X POST http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1 \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/_v162_body.json 2>&1 | head -c 600
echo ""
echo "=== PM2 v2 ERR logs 50 lines after curl ==="
pm2 logs eeat-studio-v2 --nostream --lines 50 --err 2>&1 | tail -n 55
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
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
