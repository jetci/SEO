import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
cat > /tmp/_v2_env_server_runtime_check.mjs << "MARKEOF"
process.chdir("/home/ubuntu/eeat-studio-v2");
// EXACTLY SERVER STARTS: imports env.ts, which does "import dotenv/config" (loads .env ONCE)
const envMod = await import("/home/ubuntu/eeat-studio-v2/server/_core/env.ts");
const ENV = envMod.ENV ?? {};
console.log("=== VPS SERVER RUNTIME ENV CHECK (import env.ts directly, NO manual dotenv.config) ===");
console.log("NODE_ENV =", process.env.NODE_ENV);
console.log("FROM process.env: ALLOW_PROD_DEMO_SIGNIN =", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN));
console.log("FROM process.env: PROD_DEMO_SIGNIN_PASSWORD LEN =", String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").length);
console.log("FROM process.env: ADMIN_OPENID LEN =", String(process.env.ADMIN_OPENID || "").length, " SLICE6 =", String(process.env.ADMIN_OPENID || "").slice(0,6));
// Triple gate check AS IS:
const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || "0") === "1";
const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim();
console.log("prodDemoAllowed (String(.||0) =1?)=", prodDemoAllowed, " pwdLen=", prodDemoPwd.length);
MARKEOF
timeout 45 node /tmp/_v2_env_server_runtime_check.mjs 2>&1 | tail -n 15
echo "RC=$?"
echo ""
echo "--- DOTENV PARSE LINES (to check .env file actual lines at end syntax:"
cd /home/ubuntu/eeat-studio-v2
echo "-- last 8 lines of .env file (cat -A show invisibles):"
tail -n 8 .env | cat -A
echo ""
echo "-- grep line numbers demo vars:"
grep -nE "ALLOW_PROD|PROD_DEMO|ADMIN_OPENID=" .env
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
