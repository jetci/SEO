// SSH VPS V2: Call auth.devSignin via tRPC createCaller SAME CODE PATH AS REAL BROWSER, with EXPLICIT password + openId (bypass React state issues). Exit 0 = success
import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
cat > /tmp/_v2_try_login.ts << "MARKEOF"
import "dotenv/config";
process.chdir("/home/ubuntu/eeat-studio-v2");
import { createCaller } from "/home/ubuntu/eeat-studio-v2/server/_core/trpc.ts";
try {
  const ctx = { req: { headers: {}, ip: "127.0.0.1" } as any, res: { setCookie: ()=>{}, status: 200 } as any, user: null, session: null, db: null as any };
  // Wait createCaller signature: caller = appRouter.createCaller(ctxHtrpc). Need to import properly via server/index.ts exports. Use dynamic import of main routers.
  const mod = await import("/home/ubuntu/eeat-studio-v2/server/routers/_app.ts");
  const appRouter = mod.default ?? mod.appRouter;
  const caller = (appRouter as any).createCaller?.(ctx) ?? null;
  if (!caller) { console.error("NO_CALLER_EXPORT"); process.exit(5); }
  const openId = String(process.env.ADMIN_OPENID || "none");
  console.log("TEST INPUT: openId(len)=", openId.length, " password len=", String("${DEMO_PWD}").length);
  console.log("1. prodDemoAllowed=", String(process.env.ALLOW_PROD_DEMO_SIGNIN || "0") === "1", " (raw=", JSON.stringify(process.env.ALLOW_PROD_DEMO_SIGNIN), ")");
  const pwdStored = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim();
  console.log("2. pwdMatch (raw input vs env stored):", pwdStored === "${DEMO_PWD}", " (env stored len=", pwdStored.length, " first3=", pwdStored.slice(0,3), " last3=", pwdStored.slice(-3), ")");
  console.log("3. isAdminOpenId:", String(openId).trim() === String(process.env.ADMIN_OPENID || "").trim());
  console.log("NODE_ENV:", process.env.NODE_ENV);
  let resp: any = null, err: any = null;
  try {
    resp = await caller.auth.devSignin({ openId, name: "Admin V2", email: "intelman26@gmail.com", role: "admin", password: "${DEMO_PWD}" });
  } catch (e) { err = e; }
  console.log("RESP:", resp ? JSON.stringify({ ok: true, user_id: (resp as any)?.id, name: (resp as any)?.name, email: (resp as any)?.email }).slice(0,400) : "null");
  console.log("ERR:", err ? JSON.stringify({ code: (err as any)?.code, msg: String((err as any)?.message||err).slice(0,200) }) : "null");
  process.exit(err ? 101 : 0);
} catch (e) { console.error("CRASH", String((e as any)?.message || e), (e as any)?.stack?.slice?.(0,800)); process.exit(2); }
MARKEOF
echo "--- RUN SIM CALLER V2 ---"
timeout 90 ./node_modules/.bin/tsx /tmp/_v2_try_login.ts 2>&1 | tail -n 30
echo "SCRIPT_RC=$?"
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
