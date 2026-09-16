import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    // Use server/index.ts (which exports appRouter actually!)
    const SIM = `import "dotenv/config";
import { createSessionToken, verifySession } from "./server/_core/sdk";
async function main() {
  const idx = await import("./server/index.ts");
  const envMod = await import("./server/_core/env.ts");
  const ENV = envMod.ENV;
  const appRouter = idx?.appRouter ?? idx?.default?.appRouter;
  console.log("exports:", Object.keys(idx || {}));
  if (!appRouter) { console.error("NO APP ROUTER in server/index.ts exported! abort"); process.exit(99); }
  let cookieName: any = null, cookieValue: any = null;
  const mockCtx = {
    req: { headers: {}, ip: "127.0.0.1" },
    res: {
      cookie: function(name: any, value: any, opts?: any) {
        cookieName = name; cookieValue = String(value || "");
        console.log("__COOKIE_SET__ cookieName=" + name + " len=" + String(value||"").length);
        return this;
      },
      status: function() { return this; }
    },
    user: null, session: null, db: null as any, params: undefined
  };
  const caller = typeof (appRouter as any).createCaller === "function" ? (appRouter as any).createCaller(mockCtx) : null;
  if (!caller) {
    console.error("NO createCaller METHOD on appRouter");
    process.exit(98);
  }
  const input = {
    openId: String(ENV.ADMIN_OPENID),
    name: "Admin V2",
    email: "intelman26@gmail.com",
    role: "admin" as const,
    password: "K9XmPq4Rtv2ZB8Lw3N!7C"
  };
  console.log("Call: input password len=", input.password.length, " match env stored?",
    input.password === String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim());
  try {
    const user = await (caller.auth?.devSignin ? caller.auth.devSignin(input) : null);
    if (!user) { console.error("NO caller.auth.devSignin! caller keys:", Object.keys(caller)); process.exit(88); }
    console.log("__AUTH_OK__ user id=" + user?.id + " name=" + user?.name + " email=" + user?.email + " role=" + user?.role);
    if (cookieValue) console.log("__FULL_COOKIE__=" + String(cookieName) + "=" + String(cookieValue) + "; Path=/; HttpOnly; SameSite=Lax");
  } catch(e: any) {
    console.error("__AUTH_ERR__ code=" + (e?.code || "none") + " msg=" + String(e?.message || e).slice(0, 600));
    process.exit(11);
  }
}
main().catch(e => { console.error("CRASH:", e?.stack?.slice?.(0, 2500) || String(e)); process.exit(2); });
`;
    sftp.writeFile('/home/ubuntu/eeat-studio-v2/_tmp_final_auth2.ts', SIM, (werr2) => {
      if (werr2) { console.error('write sim', werr2); process.exit(7); }
      console.log('Wrote sim script to /home/ubuntu/eeat-studio-v2/_tmp_final_auth2.ts');
      const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== Run final auth2 sim via tsx ==="
timeout 200 ./node_modules/.bin/tsx _tmp_final_auth2.ts 2>&1 | tail -n 30
SCRIPT_RC=$?
echo "SCRIPT_RC=$SCRIPT_RC"
rm -f _tmp_final_auth2.ts
exit $SCRIPT_RC
'`;
      conn.exec(CMD, (e,s) => {
        if (e) { console.error(e); process.exit(2); }
        s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(c === 0 ? 0 : 19); })
          .on('data', d => process.stdout.write(d.toString()))
          .stderr.on('data', d => process.stdout.write(d.toString()));
      });
    });
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
