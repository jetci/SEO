// SSH V2 debug simple: (1) confirm auth.ts has NEW v16 gate code (grep needle prodDemoAllowed), (2) tsx run a small script file load env print values, (3) PM2 logs last error
import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const SCRIPT = `
import 'dotenv/config';
console.log('ALLOW=', JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
console.log('PWD_LEN=', String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').length);
console.log('TRIPLE_STRICT_CHECK:', String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1');
console.log('IS_PROD:', process.env.NODE_ENV);
`;
  conn.exec(`bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "--- 1/4 Needle grep auth.ts v16 prodDemoAllowed gate ---"
grep -nE "prodDemoAllowed|pwdMatch|PROD_DEMO_SIGNIN_PASSWORD|ALLOW_PROD_DEMO_SIGNIN" server/auth.ts | head -n 12
echo "--- 2/4 write small env test .mjs ---"
cat > /tmp/_v2_env_check.mjs << "EOF_INNER"
${SCRIPT}
EOF_INNER
echo "--- 3/4 run env check via node from V2 dir (so dotenv loads V2 .env) ---"
cd /home/ubuntu/eeat-studio-v2 && timeout 20 node /tmp/_v2_env_check.mjs 2>&1
echo "--- 4/4 Last 12 lines PM2 error log ---"
/usr/bin/pm2 logs eeat-studio-v2 --nostream --lines 12 --err 2>&1
'`, (e, s) => {
    if (e) { console.error('exec err', e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
