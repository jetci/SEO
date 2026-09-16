// Cleanest approach: Use appRouter.createCaller() (the SAME as earlier VPS _sim_v15_outline.ts test!) → call auth.devSignin directly
import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    // Mirror _sim_v15_outline.ts pattern which worked 8/8 gates
    const script = `
import "dotenv/config";
const DEMO_PWD_INLINE = "${DEMO_PWD}";
async function main() {
  const { appRouter } = await import("/home/ubuntu/eeat-studio-v2/server/routers/_app.ts");
  const envMod = await import("/home/ubuntu/eeat-studio-v2/server/_core/env.ts");
  const ENV = envMod.ENV;
  let signedCookie = null;
  const mockCtx = {
    req: { headers: {}, ip: "127.0.0.1" },
    res: {
      cookie: function(name, value, opts) { console.log("[COOKIE SET] name=", name, " len=", String(value || "").length, " first 80=", String(value || "").slice(0,80)); signedCookie = value; return this; },
      status: function() { return this; }
    },
    user: null,
    session: null,
    db: null as any,
    params: undefined
  };
  const caller = (appRouter as any).createCaller(mockCtx);
  const input = {
    openId: String(ENV.ADMIN_OPENID),
    name: "Admin V2",
    email: "intelman26@gmail.com",
    role: "admin" as const,
    password: DEMO_PWD_INLINE
  };
  console.log("TEST INPUT: password len=", input.password.length, " first3=", input.password.slice(0,3), " last3=", input.password.slice(-3));
  console.log("MATCH ENV PWD?", input.password === String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim());
  try {
    const user = await caller.auth.devSignin(input);
    console.log("[SUCCESS DEV SIGNIN] user id=", user?.id, " name=", user?.name, " email=", user?.email, " role=", user?.role);
    if (signedCookie) console.log("[COOKIE LEN TOTAL]=", String(signedCookie).length);
  } catch(e: any) {
    console.error("[FAIL DEV SIGNIN] code=", e?.code, " msg=", String(e?.message || e).slice(0, 500));
    process.exit(11);
  }
}
main().catch(e => { console.error("CRASH:", e?.stack?.slice?.(0, 2500) || String(e)); process.exit(2); });
`;
    sftp.writeFile('/tmp/_v2_login_sim.ts', script, (werr) => {
      if (werr) { console.error('write', werr); process.exit(9); }
      console.log('Wrote login sim script');
      const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== Run tsx sim createCaller auth.devSignin with password ==="
timeout 120 ./node_modules/.bin/tsx /tmp/_v2_login_sim.ts 2>&1 | tail -n 40
echo RC=$?
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
