import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  // Use sftp to read auth.ts, modify lines 91-96 to add debug console.error traces, write back, restart
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    sftp.readFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', 'utf8', (rerr, data) => {
      if (rerr) { console.error('read auth err', rerr); process.exit(5); }
      console.log('Read auth.ts bytes=', data.length);
      // L91-95 original: const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1';
      const needle1 = `const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1';`;
      const needle2 = `if (IS_PROD && !(prodDemoAllowed && isAdminOpenId && pwdMatch)) {`;
      if (!data.includes(needle1)) { console.error('NEEDLE1 NOT FOUND! L91 prodDemoAllowed wrong!'); process.exit(6); }
      if (!data.includes(needle2)) { console.error('NEEDLE2 NOT FOUND! L95 if gate wrong!'); process.exit(7); }
      let newData = data.replace(needle1, needle1 + "\n      console.error('[AUTH_DEBUG_V16] prodDemoAllowed:', prodDemoAllowed, 'ALLOW_raw:', JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN), 'pwdLen:', String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').length, 'openId:', String(input.openId || '').slice(0,8), 'ADMIN:', String(ENV.ADMIN_OPENID || '').slice(0,8), 'pwdMatch:', (String(input.password || '').trim() === String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim()));");
      newData = newData.replace(needle2, `console.error('[AUTH_DEBUG_V16] FINAL TRIPLE:', prodDemoAllowed, isAdminOpenId, pwdMatch, 'IS_PROD=', IS_PROD);\n      ${needle2}`);
      sftp.writeFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', newData, (werr) => {
        if (werr) { console.error('write auth err', werr); process.exit(8); }
        console.log('auth.ts updated debug traces added. Now restart PM2 V2 + curl once!');
        const CMD = `bash -lc '
/usr/bin/pm2 restart eeat-studio-v2 --update-env > /dev/null 2>&1 ; sleep 8
echo "=== After restart ==="
/usr/bin/pm2 list | grep eeat-studio-v2 | head -n 1
/usr/bin/pm2 flush eeat-studio-v2 2>&1 | tail -n 2
echo "=== curl now ==="
curl -s -i -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
  -H "Content-Type: application/json" \
  -H "Origin: https://thaiaeo.manus.host" \
  --data-binary @/tmp/_auth_body.json
echo ""
sleep 2
echo "=== PM2 V2 error log last 30 lines ==="
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
