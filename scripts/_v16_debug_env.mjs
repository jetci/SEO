// SSH V2 VPS: Debug env loading direct via tsx + test auth.devSignin triple gate condition
import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  console.log('✅ SSH');
  conn.exec(`bash -lc '
cd /home/ubuntu/eeat-studio-v2
set +e
echo "--- 1/5 .env grep ---"
grep -nE "(ALLOW_PROD_DEMO|PROD_DEMO_SIGNIN)" .env
echo "--- 2/5 Test tsx env loader via ENV.js z parse inline ---"
timeout 30 ./node_modules/.bin/tsx -e "
import('./server/_core/env.js').then(async m => {
  const ENV = m.ENV ?? await m.loadEnv?.() ?? {};
  console.log(\"ALLOW_PROD_DEMO_SIGNIN=\", String(process.env.ALLOW_PROD_DEMO_SIGNIN || \"0-missing\"), \" type=\", typeof process.env.ALLOW_PROD_DEMO_SIGNIN);
  console.log(\"STRICT check String(.||0)===1:\", String(process.env.ALLOW_PROD_DEMO_SIGNIN || \"0\") === \"1\");
  console.log(\"PROD_DEMO_SIGNIN_PASSWORD length:\", (String(process.env.PROD_DEMO_SIGNIN_PASSWORD || \"\")).length, \" first4=\", (String(process.env.PROD_DEMO_SIGNIN_PASSWORD || \"\")).slice(0,4), \" last3=\", (String(process.env.PROD_DEMO_SIGNIN_PASSWORD || \"\")).slice(-3));
}).catch(err => console.error(\"ENV_LOAD_ERR\", String(err?.message || err).slice(0,500), err?.stack?.slice?.(0,500)));
" 2>&1 | tail -n 20
echo "--- 3/5 Shell process.env grep via node plain ---"
timeout 30 node -e "console.log(\"NODE_ALLOW_PROD=\", process.env.ALLOW_PROD_DEMO_SIGNIN || \"NODE_MISSING\", \"NODE_PWD_LEN=\", (String(process.env.PROD_DEMO_SIGNIN_PASSWORD || \"\")).length)"
echo "--- 4/5 PM2 env dump eeat-studio-v2 ---"
/usr/bin/pm2 show eeat-studio-v2 2>&1 | grep -iE "env|node.*args|exec mode" | head -n 12
echo "--- 5/5 Manually cat .env last 5 lines (for syntax check) ---"
tail -n 5 .env | cat -A
'`, (err, stream) => {
    if (err) { console.error('exec fail', err); process.exit(2); }
    stream.on('close', code => { console.log('RC', code); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
