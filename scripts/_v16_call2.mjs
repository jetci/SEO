import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    const script = `
const DEMO_PWD_ACTUAL = "${DEMO_PWD}";
import("/home/ubuntu/eeat-studio-v2/node_modules/dotenv/lib/main.js").then(async dotenv => {
  dotenv.config({ path: "/home/ubuntu/eeat-studio-v2/.env" });
  const ENV = (await import("/home/ubuntu/eeat-studio-v2/server/_core/env.ts")).ENV;
  // Direct call to the devSignin RESOLVER (skip HTTP batch format parse issues!)
  const authMod = await import("/home/ubuntu/eeat-studio-v2/server/auth.ts");
  const procedures = (authMod.default || authMod.authRouter)?._def?.procedures ?? {};
  const devSign = procedures["devSignin"];
  if (!devSign) { console.error("NO DEVSIGN PROC. keys:", Object.keys(procedures)); process.exit(5); }
  // Get the resolver function:
  const inner = devSign._def || {};
  const resolver = inner.mutation?.resolve ?? inner.query?.resolve;
  if (typeof resolver !== "function") { console.error("resolver not fn. keys _def:", Object.keys(inner)); process.exit(6); }
  const input = { openId: String(ENV.ADMIN_OPENID), name: "Admin V2", email: "intelman26@gmail.com", role: "admin", password: DEMO_PWD_ACTUAL };
  console.log("CALL input password LEN =", input.password.length, " first3=", input.password.slice(0,3), " last3=", input.password.slice(-3));
  let cookieValue = null;
  const ctx = {
    req: { headers: {}, ip: "127.0.0.1" },
    res: {
      cookie: function(name, val, opts) { console.log("RES.cookie() called name=", name, " val_first80=", String(val || "").slice(0,80)); cookieValue = String(val || ""); return this; },
      status: function() { return this; }
    },
    user: null, session: null, db: null, params: undefined
  };
  // Standard tRPC resolver call signature: resolver.call({_ctx:ctx}, { ctx, rawInput:input, path:"auth.devSignin", type:"mutation", getRawInput:()=>input })
  try {
    const result = await resolver.call({ _ctx: ctx }, { ctx, rawInput: input, path: "auth.devSignin", type: "mutation", getRawInput: async () => input });
    console.log("SUCCESS RESULT: user id=", result?.id, " name=", result?.name, " email=", result?.email, " role=", result?.role);
    if (cookieValue) console.log("COOKIE SUCCESS TOKEN FIRST 40=", cookieValue.slice(0,40));
  } catch(e) {
    console.error("FAIL: code=", e?.code, " message=", String(e?.message || e).slice(0, 400));
    process.exit(11);
  }
}).catch(err => { console.error("CRASH:", err?.stack?.slice?.(0, 1800) || String(err)); process.exit(2); });
`;
    sftp.writeFile('/tmp/_call_direct2.mjs', script, (werr) => {
      if (werr) { console.error('write', werr); process.exit(9); }
      console.log('Wrote script');
      const CMD = `bash -lc '
echo "=== DIRECT call devSignin resolver CWD=/home/ubuntu/eeat-studio-v2 so node_modules resolves ==="
cd /home/ubuntu/eeat-studio-v2
timeout 90 node /tmp/_call_direct2.mjs 2>&1 | tail -n 50
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
