import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    // Write as .ts so tsx can run with TS imports correctly
    const script = `
const DEMO_PWD_ACTUAL = "${DEMO_PWD}";
import * as dotenv from "/home/ubuntu/eeat-studio-v2/node_modules/dotenv/lib/main.js";
dotenv.config({ path: "/home/ubuntu/eeat-studio-v2/.env" });
Promise.all([
  import("/home/ubuntu/eeat-studio-v2/server/_core/env.ts"),
  import("/home/ubuntu/eeat-studio-v2/server/auth.ts"),
]).then(async (imports) => {
  const ENV = imports[0].ENV;
  const authMod = imports[1];
  const procedures = (authMod.default || authMod.authRouter)?._def?.procedures ?? {};
  const devSign = procedures["devSignin"];
  if (!devSign) { console.error("NO PROC"); process.exit(5); }
  const inner = devSign._def || {};
  const resolver = inner.mutation?.resolve ?? inner.query?.resolve;
  if (typeof resolver !== "function") { console.error("NO RES"); process.exit(6); }
  const input = { openId: String(ENV.ADMIN_OPENID), name: "Admin V2", email: "intelman26@gmail.com", role: "admin", password: DEMO_PWD_ACTUAL };
  console.log("INPUT password len=", input.password.length, " match env stored?", input.password === String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim());
  let cookie = null;
  const ctx = {
    req: { headers: {}, ip: "127.0.0.1" },
    res: { cookie: function(n, v) { console.log("SET COOKIE", n, String(v||"").slice(0,60)); cookie = v; return this; }, status: () => ({}) },
    user: null, session: null, db: null, params: undefined
  };
  try {
    const result = await resolver.call({ _ctx: ctx }, { ctx, rawInput: input, path:"auth.devSignin", type:"mutation", getRawInput:async ()=>input });
    console.log("SUCCESS", { ok:true, id: result?.id, name: result?.name, email: result?.email, role: result?.role, cookie_len: cookie?.length ?? 0 });
    if (cookie) console.log("COOKIE_VALUE_FIRST_200=", String(cookie).slice(0, 200));
  } catch(e) {
    console.error("FAIL code=", e?.code, " msg=", String(e?.message || e).slice(0, 400));
    process.exit(11);
  }
}).catch(err => { console.error("CRASH:", err?.stack?.slice?.(0, 2500) || String(err)); process.exit(2); });
`;
    sftp.writeFile('/tmp/_direct3.ts', script, (werr) => {
      if (werr) { console.error('write', werr); process.exit(9); }
      console.log('Wrote .ts script');
      // RUN VIA tsx interpreter (same as PM2!)
      const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== RUN via tsx (same as PM2) ==="
timeout 180 ./node_modules/.bin/tsx /tmp/_direct3.ts 2>&1 | tail -n 60
echo "RC=$?"
'`;
      conn.exec(CMD, (e,s) => {
        if (e) { console.error(e); process.exit(2); }
        s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
          .on('data', d => process.stdout.write(d.toString()))
          .stderr.on('data', d => process.stdout.write(d.toString()));
      });
    });
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
