import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  // STEP 0: GREP files with export appRouter inside actual server dir paths (resolve SIM_IMPORT_PATH correctly)
  const GREP = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== grep export appRouter inside .ts files (actual VPS files!) ==="
grep -rln "export.*appRouter\\|^export const appRouter\\|export { appRouter" server 2>/dev/null | head -n 10
echo "=== grep createCaller usage inside server dir ==="
grep -rln "createCaller" 2>/dev/null | head -n 5
'`;
  conn.exec(GREP, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    let out = '';
    s.on('close', c => {
      console.log(out);
      // Determine import path
      let importPath = '';
      if (/server\/index\.ts/.test(out)) importPath = "./server/index.ts";
      else if (/server\/app\.ts/.test(out)) importPath = "./server/app.ts";
      else if (/server\/routers\/_app\.ts/.test(out)) importPath = "./server/routers/_app.ts";
      else { console.error("CANNOT RESOLVE appRouter PATH"); process.exit(55); }
      console.log("RESOLVED appRouter SIM_IMPORT_PATH =", importPath);
      // STEP 1: SFTP write sim script INSIDE project dir, hardcoded DEMO_PWD inside TS source!
      conn.sftp((serr, sftp) => {
        if (serr) { console.error(serr); process.exit(3); }
        const SIM = `import "dotenv/config";
// DEMO password HARDCODED inside this TS source file (no shell expansion needed!)
const DEMO_PWD_HARDCODED_IN_FILE = "K9XmPq4Rtv2ZB8Lw3N!7C";
async function main() {
  const ENV_MOD = await import("./server/_core/env.ts");
  const ENV = ENV_MOD.ENV;
  const APP_MOD = await import("${importPath}");
  const appRouter = APP_MOD?.appRouter ?? APP_MOD?.default?.appRouter ?? APP_MOD?.default;
  console.log("import_path:", "${importPath}");
  console.log("export_keys:", Object.keys(APP_MOD));
  console.log("typeof_createCaller:", typeof (appRouter as any)?.createCaller);
  if (typeof (appRouter as any)?.createCaller !== "function") {
    console.error("NO createCaller! appRouter type:", typeof appRouter);
    process.exit(99);
  }
  let cookiePair: any = null;
  const mockCtx: any = {
    req: { headers: {}, ip: "127.0.0.1" },
    res: {
      cookie: function(name: any, value: any, opts?: any) {
        cookiePair = { name: String(name), value: String(value || "") };
        console.log("RES_COOKIE_CAPTURED name=", name, "value_len=", String(value||"").length);
        return this;
      },
      status: function() { return this; }
    },
    user: null, session: null, db: null as any, params: undefined
  };
  const caller = (appRouter as any).createCaller(mockCtx);
  const input = {
    openId: String(ENV.ADMIN_OPENID),
    name: "Admin V2",
    email: "intelman26@gmail.com",
    role: "admin" as const,
    password: DEMO_PWD_HARDCODED_IN_FILE
  };
  console.log("call: password len=", input.password.length, " first3=", input.password.slice(0,3), " last3=", input.password.slice(-3));
  console.log("call: match_env_password?", input.password === String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim());
  try {
    const user = await (caller.auth?.devSignin ? caller.auth.devSignin(input) : null);
    if (!user) { console.error("caller.auth.devSignin not a function; caller shape:", caller ? Object.keys(caller) : "null"); process.exit(88); }
    console.log("LOGIN_OK: id=", user?.id, "name=", user?.name, "email=", user?.email, "role=", user?.role);
    if (cookiePair) console.log("COOKIE_EXPORT name=", cookiePair.name, " len=", cookiePair.value.length, " raw=", String(cookiePair.name) + "=" + String(cookiePair.value) + "; Path=/; HttpOnly; SameSite=Lax; Secure");
  } catch(e: any) {
    console.error("LOGIN_ERR code=", e?.code, "msg=", String(e?.message || e).slice(0, 600));
    process.exit(11);
  }
}
main().catch(e => { console.error("CRASH:", e?.stack?.slice?.(0, 2500) || String(e)); process.exit(2); });
`;
        sftp.writeFile('/home/ubuntu/eeat-studio-v2/__sim_login_v16.ts', SIM, (werr) => {
          if (werr) { console.error('write sim', werr); process.exit(4); }
          console.log('Wrote /home/ubuntu/eeat-studio-v2/__sim_login_v16.ts (hardcoded password inside TS!)');
          const RUN = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== Run sim INSIDE project dir so imports work (tsx resolves node_modules!) ==="
ls -la __sim_login_v16.ts
echo ""
timeout 240 ./node_modules/.bin/tsx __sim_login_v16.ts 2>&1 | tail -n 30
SCRIPT_RC=$?
echo "SCRIPT_RC=$SCRIPT_RC"
echo "Clean up temp sim file"
rm -f __sim_login_v16.ts
exit $SCRIPT_RC
'`;
          conn.exec(RUN, (e2, s2) => {
            if (e2) { console.error(e2); process.exit(10); }
            let out2 = '';
            s2.on('close', c2 => {
              console.log(out2);
              console.log('FINAL RC=', c2);
              conn.end();
              process.exit(c2 === 0 ? 0 : 20);
            }).on('data', d => { out2 += d.toString(); process.stdout.write(d.toString()); })
              .stderr.on('data', d => { out2 += d.toString(); process.stdout.write(d.toString()); });
          });
        });
      });
    }).on('data', d => { out += d.toString(); process.stdout.write(d.toString()); })
      .stderr.on('data', d => { out += d.toString(); process.stdout.write(d.toString()); });
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
