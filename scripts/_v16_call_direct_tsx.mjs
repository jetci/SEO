import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  // Write a .mjs script via sftp to /tmp/_call_direct.mjs - runs inline TS with direct call to devSignin resolver function!
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    const script = `
process.chdir("/home/ubuntu/eeat-studio-v2");
const DEMO_PWD_ACTUAL = "${DEMO_PWD}";
import("dotenv/config").then(async dotenv => {
  dotenv.config({ path: "/home/ubuntu/eeat-studio-v2/.env" });
  const ENV = (await import("/home/ubuntu/eeat-studio-v2/server/_core/env.ts")).ENV;
  // Direct call: get the devSignin mutation resolver function from auth.ts
  const authMod = await import("/home/ubuntu/eeat-studio-v2/server/auth.ts");
  // Find devSignin mutation resolver. authRouter devSignin = .input(...).mutation(resolver).
  // authMod.default is authRouter tRPC router with ._def.procedures map!
  const procedures = (authMod.default || authMod.authRouter)?._def?.procedures ?? {};
  const devSign = procedures["devSignin"];
  console.log("procedures exported:", Object.keys(procedures).join(", "));
  if (!devSign) { console.error("NO DEVSIGN PROCEDURE"); process.exit(5); }
  // devSign._def is procedure: get resolver fn
  const resolver = (devSign._def && (devSign._def.mutation || devSign._def.query))?.resolve;
  if (typeof resolver !== "function") { console.error("NO RESOLVER FN FOUND, keys:", Object.keys(devSign._def || {})); process.exit(6); }
  console.log("OK resolver function found, calling now...");
  const input = { openId: String(ENV.ADMIN_OPENID), name: "Admin V2", email: "intelman26@gmail.com", role: "admin", password: DEMO_PWD_ACTUAL };
  console.log("CALL input password len=", String(input.password || "").length, " first3=", input.password.slice(0,3));
  const ctx = { req: { headers: {}, ip: "127.0.0.1" }, res: { cookie: function(...args){ console.log("SET-COOKIE CALL:", args[0], "=", String(args[1] || "").slice(0,80), "..."); return this; }, status: function(n){ return this; } }, user: null, session: null, db: null, params: undefined };
  try {
    const result = await resolver.call({ _ctx: ctx }, { rawInput: input, ctx, path: "auth.devSignin", type: "mutation", getRawInput: async () => input });
    console.log("RESULT: ", JSON.stringify({ ok: true, name: (result?.name || "null"), email: result?.email, id: result?.id, role: result?.role }).slice(0, 500));
  } catch(err) {
    console.error("ERROR CALL:", err?.code, String(err?.message || err).slice(0, 500));
    process.exit(7);
  }
}).catch(err => { console.error("CRASH:", err?.stack?.slice?.(0, 1500) || String(err)); process.exit(2); });
`;
    sftp.writeFile('/tmp/_call_direct.mjs', script, (werr) => {
      if (werr) { console.error('write script err', werr); process.exit(9); }
      console.log('Wrote /tmp/_call_direct.mjs');
      const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== DIRECT tsx devSignin call ==="
timeout 90 node /tmp/_call_direct.mjs 2>&1 | tail -n 40
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
