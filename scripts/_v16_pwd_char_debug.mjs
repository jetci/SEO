import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    sftp.readFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', 'utf8', (rerr, data) => {
      if (rerr) { console.error('read', rerr); process.exit(4); }
      // Replace existing debug console.error with char-code level comparison
      const oldLog = `console.error('[AUTH_DEBUG_V16] prodDemoAllowed:', prodDemoAllowed, 'ALLOW_raw:', JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN), 'pwdLen:', String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').length, 'openId:', String(input.openId || '').slice(0,8), 'ADMIN:', String(ENV.ADMIN_OPENID || '').slice(0,8), 'pwdMatch:', (String(input.password || '').trim() === String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim()));`;
      if (!data.includes(oldLog)) { console.error('OLD LOG NOT FOUND!'); process.exit(5); }
      const newLog = `const __dbgInPwd = String(input.password || '').trim();
      const __dbgEnvPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim();
      console.error('[AUTH_DEBUG_V16] prodDemoAllowed:', prodDemoAllowed, 'ALLOW_raw:', JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
      console.error('[AUTH_DEBUG_V16] inputPWD len=', __dbgInPwd.length, ' FIRST8=', [...__dbgInPwd.slice(0,8)].map(c=>c.charCodeAt(0)).join(','), ' LAST6=', [...__dbgInPwd.slice(-6)].map(c=>c.charCodeAt(0)).join(','));
      console.error('[AUTH_DEBUG_V16] envPWD   len=', __dbgEnvPwd.length, ' FIRST8=', [...__dbgEnvPwd.slice(0,8)].map(c=>c.charCodeAt(0)).join(','), ' LAST6=', [...__dbgEnvPwd.slice(-6)].map(c=>c.charCodeAt(0)).join(','));
      console.error('[AUTH_DEBUG_V16] inputPWD string=|'+__dbgInPwd+'|');
      console.error('[AUTH_DEBUG_V16] envPWD   string=|'+__dbgEnvPwd+'|');`;
      const newData = data.replace(oldLog, newLog);
      sftp.writeFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', newData, (werr) => {
        if (werr) { console.error('write', werr); process.exit(6); }
        console.log('char-code debug added. Restart V2 + curl + read logs.');
        const CMD = `bash -lc '
/usr/bin/pm2 restart eeat-studio-v2 --update-env > /dev/null 2>&1 ; sleep 7
/usr/bin/pm2 flush eeat-studio-v2 2>&1 | tail -n 1
echo "=== curl ==="
curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" -H "Content-Type: application/json" -H "Origin: https://thaiaeo.manus.host" --data-binary @/tmp/_auth_body.json | head -c 300
echo ""
sleep 2
echo "=== PM2 err log 30 lines ==="
/usr/bin/pm2 logs eeat-studio-v2 --nostream --lines 30 --err 2>&1
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
