import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    // Write INTO project directory scripts/ so tsx resolves node_modules!
    const script = `
import "dotenv/config";
const DEMO_PWD_INLINE = "${DEMO_PWD}";
async function main() {
  const { appRouter } = await import("./server/routers/_app.ts");
  const envMod = await import("./server/_core/env.ts");
  const ENV = envMod.ENV;
  let signedCookie = null;
  const mockCtx = {
    req: { headers: {}, ip: "127.0.0.1" },
    res: {
      cookie: function(name, value, opts) { console.log("[COOKIE OK] name=", name, " val len=", String(value || "").length, " first80=", String(value || "").slice(0,80)); signedCookie = value; return this; },
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
  console.log("INPUT password len=", input.password.length, " first3=", input.password.slice(0,3));
  console.log("MATCH ENV PWD?", input.password === String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim());
  try {
    const user = await caller.auth.devSignin(input);
    console.log("[DEV SIGNIN OK!] user id=", user?.id, " name=", user?.name, " email=", user?.email, " role=", user?.role);
  } catch(e: any) {
    console.error("[DEV SIGNIN FAIL] code=", e?.code, " msg=", String(e?.message || e).slice(0, 500));
    process.exit(11);
  }
}
main().catch(e => { console.error("CRASH:", e?.stack?.slice?.(0, 2500) || String(e)); process.exit(2); });
`;
    sftp.writeFile('/home/ubuntu/eeat-studio-v2/scripts/_tmp_sim_v16_login.ts', script, (werr) => {
      if (werr) { console.error('write', werr); process.exit(9); }
      console.log('Wrote script to project scripts/');
      const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== Run sim inside project dir ==="
timeout 120 ./node_modules/.bin/tsx scripts/_tmp_sim_v16_login.ts 2>&1 | tail -n 30
echo RC=$?
echo "--- Clean up temp sim script ---"
rm -f scripts/_tmp_sim_v16_login.ts
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
