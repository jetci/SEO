// Simplified VPS debug: JUST RUN THE EXACT TRIPLE GATE CONDITION CODE SNIPPET inline NO trpc caller needed. Then if pass, run actual devSignin via plain function.
import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
cat > /tmp/_v2_gate_debug.mjs << "MARKEOF"
process.chdir("/home/ubuntu/eeat-studio-v2");
const dotenv = await import("/home/ubuntu/eeat-studio-v2/node_modules/dotenv/lib/main.js");
dotenv.config({ path: "/home/ubuntu/eeat-studio-v2/.env" });

const ENV = (await import("/home/ubuntu/eeat-studio-v2/server/_core/env.ts")).ENV;
const IS_PROD = process.env.NODE_ENV === "production";
// Exact triple gate snippet from auth.ts L91-L95 (v16 deployed):
const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || "0") === "1";
const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim();
const openIdFromClient = String(process.env.ADMIN_OPENID || ""); // default fill zod input
const isAdminOpenId = String(openIdFromClient || "").trim() === String(ENV.ADMIN_OPENID || "").trim();
const inputPassword = "${DEMO_PWD}";
const pwdMatch = prodDemoPwd ? (String(inputPassword || "").trim() === prodDemoPwd) : false;

console.log("========== V16 TRIPLE GATE DEBUG V2 ==========");
console.log("NODE_ENV =", process.env.NODE_ENV, " IS_PROD =", IS_PROD);
console.log("1. prodDemoAllowed =", prodDemoAllowed, "  (raw ALLOW_PROD_DEMO_SIGNIN=", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN), ")");
console.log("2. prodDemoPwd (env stored) len =", prodDemoPwd.length, "  first3=", prodDemoPwd.slice(0,3), " last3=", prodDemoPwd.slice(-3));
console.log("   inputPassword (client send) len =", inputPassword.length, " first3=", inputPassword.slice(0,3), " last3=", inputPassword.slice(-3));
console.log("   pwdMatch =", pwdMatch);
console.log("3. isAdminOpenId (ENV.ADMIN_OPENID match) =", isAdminOpenId, " [ENV=", String(ENV.ADMIN_OPENID).slice(0,6), "...]");
console.log("FINAL: prodDemoAllowed && isAdminOpenId && pwdMatch =", (prodDemoAllowed && isAdminOpenId && pwdMatch), " → IF TRUE → FORBIDDEN NOT thrown! (allows demo signin)");
console.log("FINAL: IS_PROD && !(triple) =", IS_PROD && !(prodDemoAllowed && isAdminOpenId && pwdMatch), " → IF TRUE → FORBIDDEN!");
MARKEOF
echo "--- RUN GATE DEBUG ---"
timeout 45 node /tmp/_v2_gate_debug.mjs 2>&1 | tail -n 20
echo "RC=$?"
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
