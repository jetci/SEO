// Debug env + full auth.devSignin gate condition value on V2 via tsx actual code path
import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD_CLIENT_SEND = 'K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  const script = `
process.chdir('/home/ubuntu/eeat-studio-v2');
import { config as dcfg } from 'dotenv'; dcfg({ path: '/home/ubuntu/eeat-studio-v2/.env' });
const ENVz = (await import('/home/ubuntu/eeat-studio-v2/server/_core/env.ts')).ENV ?? (await import('/home/ubuntu/eeat-studio-v2/server/_core/env.js')).ENV;
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_OPENID = ENVz?.ADMIN_OPENID ?? process.env.ADMIN_OPENID ?? 'none';
const ALLOW = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0');
const ENV_PWD = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim();
const inputOpenId = ADMIN_OPENID; // default z.input schema
const inputPwd = "${DEMO_PWD_CLIENT_SEND}";
console.log("1. NODE_ENV=", process.env.NODE_ENV, " IS_PROD=", IS_PROD);
console.log("2. ALLOW_PROD_DEMO_SIGNIN raw=", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN), " String(||0)===1?=", String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1');
console.log("3. PROD_DEMO_SIGNIN_PASSWORD (ENV) len=", ENV_PWD.length, " first3=", ENV_PWD.slice(0,3), " last3=", ENV_PWD.slice(-3));
console.log("4. isAdminOpenId match?", String(inputOpenId || '').trim() === String(ADMIN_OPENID || '').trim(), " ADMIN_OPENID=", String(ADMIN_OPENID).slice(0,6), "...");
console.log("5. pwdMatch?", ENV_PWD ? (String(inputPwd).trim() === ENV_PWD) : false);
console.log("6. TRIPLE AND?", (String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1') && (String(inputOpenId || '').trim() === String(ADMIN_OPENID || '').trim()) && (ENV_PWD ? (String(inputPwd).trim() === ENV_PWD) : false));
`;
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
# Step A: env process inspect raw dotenv load
echo "--- A/3 Raw node dotenv load .env ---"
cat > /tmp/_env_chk.mjs << "ENVMARK"
import { config } from "/home/ubuntu/eeat-studio-v2/node_modules/dotenv/lib/main.js";
config({ path: "/home/ubuntu/eeat-studio-v2/.env" });
console.log("NODE_ENV=", process.env.NODE_ENV);
console.log("ALLOW_RAW=", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
console.log("ALLOW_CHECK_1=", String(process.env.ALLOW_PROD_DEMO_SIGNIN || "0") === "1");
console.log("PWD_ENV_LEN=", String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").length);
console.log("ADMIN_OPENID_LEN=", String(process.env.ADMIN_OPENID || "").length);
ENVMARK
timeout 20 node /tmp/_env_chk.mjs 2>&1 | tail -n 20

echo "--- B/3 Check Login.tsx payload include password? (Grep deployed client dist assets for \\\\\"password\\\\\" needle) ---"
grep -rEl --include="*.js" "password" dist/assets 2>/dev/null | head -n 2 | xargs -I {} sh -c "echo -- {} --; strings {} | grep -Eo 'password.{0,40}' | sort -u | head -n 8" 2>/dev/null || echo "(grep dist not avail skip)"

echo "--- C/3 Check actual server process env runtime (PM2 pid environment via /proc) ---"
PID=$(/usr/bin/pm2 pid eeat-studio-v2 2>/dev/null);
echo "PM2 pid eeat-studio-v2 = $PID";
if [ -n "$PID" ] && [ -d "/proc/$PID" ]; then
  echo "/proc/$PID/environ grep demo signin:"
  tr "\\0" "\\n" < /proc/$PID/environ 2>/dev/null | grep -E "ALLOW_PROD|PROD_DEMO|NODE_ENV" | sort
fi
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
