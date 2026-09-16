import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    const script = `
const DEMO_PWD_ACTUAL = "${DEMO_PWD}";
import("/home/ubuntu/eeat-studio-v2/node_modules/dotenv/lib/main.js").then(async (dotenv) => {
  dotenv.config({ path: "/home/ubuntu/eeat-studio-v2/.env" });
  const envMod = await import("/home/ubuntu/eeat-studio-v2/server/_core/env.ts");
  const ENV = envMod.ENV;
  const authMod = await import("/home/ubuntu/eeat-studio-v2/server/auth.ts");
  const router = authMod.default || authMod.authRouter;
  const procedures = router?._def?.procedures;
  if (!procedures) { console.error("NO PROC, router keys=", Object.keys(router || {})); process.exit(4); }
  const devSign = procedures["devSignin"];
  console.log("PROCEDURE devSignin typeof=", typeof devSign, " constructor.name=", devSign.constructor.name);
  console.log("PROC keys =", Object.keys(devSign || {}));
  const def = devSign._def;
  console.log("def keys =", Object.keys(def || {}));
  console.log("def.type =", def?.type);
  // Walk all nested keys that might contain resolver or execute fn or middleware
  function walk(obj, prefix="obj", depth=0){
    if (depth > 5 || !obj) return;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "function") {
        console.log(`FN: ${prefix}.${k}  (len=${v.length})`);
      } else if (v && typeof v === "object" && Object.keys(v).length > 0 && v.constructor === Object) {
        walk(v, prefix + "." + k, depth + 1);
      } else if (Array.isArray(v) && v.length <= 20) {
        console.log(`ARR: ${prefix}.${k} len=${v.length} types=[${v.map(x => typeof x).join(",")}]`);
        v.forEach((item, i) => { if (item && typeof item === "object") walk(item, prefix + "." + k + "[" + i + "]", depth + 1); });
      }
    }
  }
  walk({ def });
  // Try createCaller method on router._def
  console.log("\\n=== Trying router.createCaller() if exists ===");
  if (typeof router.createCaller === "function") {
    const caller = router.createCaller({ req:{headers:{},ip:"127.0.0.1"}, res:{cookie:function(n,v){console.log("SET_COOKIE:", n, String(v).slice(0,60)); return this;}}, user: null, session: null, db: null });
    if (caller && typeof caller.auth === "object" && typeof caller.auth.devSignin === "function") {
      try {
        console.log("createCaller().auth.devSignin EXISTS! Calling!");
        const input = { openId: String(ENV.ADMIN_OPENID), name: "Admin V2", email: "intelman26@gmail.com", role: "admin", password: DEMO_PWD_ACTUAL };
        const r = await caller.auth.devSignin(input);
        console.log("RESULT createCaller:", { ok:true, id:r?.id, name:r?.name, email:r?.email, role:r?.role });
      } catch(e) { console.error("CALLERR err:", e?.code, String(e?.message||e).slice(0,400)); process.exit(11); }
    } else { console.log("createCaller shape:", caller ? Object.keys(caller) : "null"); }
  } else {
    console.log("NO createCaller on router._def");
  }
}).catch(e => { console.error("CRASH", e?.stack?.slice?.(0, 2500) || String(e)); process.exit(2); });
`;
    sftp.writeFile('/tmp/_inspect_proc.ts', script, (werr) => {
      if (werr) { console.error('write', werr); process.exit(9); }
      console.log('wrote inspect script');
      const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== tsx inspect proc ==="
timeout 120 ./node_modules/.bin/tsx /tmp/_inspect_proc.ts 2>&1 | tail -n 60
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
