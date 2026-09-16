import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  // Write to /tmp, then run cat > VPS project dir! Also first list VPS project dir structure
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== 1. list project dir (first 15 items) ==="
ls -la | head -n 20
echo ""
echo "=== 2. scripts/ folder? ==="
ls -la scripts/ 2>/dev/null || echo "(no scripts/ folder on VPS!)"
echo ""
echo "=== 3. Write sim script via heredoc DIRECTLY to /home/ubuntu/eeat-studio-v2/_tmp_sim_login.ts ==="
cat > /home/ubuntu/eeat-studio-v2/_tmp_sim_login.ts << "MARK_SCRIPT_END"
import "dotenv/config";
const DEMO_PWD_INLINE = "${DEMO_PWD_VAR}";
async function main() {
  const { appRouter } = await import("./server/routers/_app.ts");
  const envMod = await import("./server/_core/env.ts");
  const ENV = envMod.ENV;
  let signedCookie = null;
  const mockCtx = {
    req: { headers: {}, ip: "127.0.0.1" },
    res: {
      cookie: function(name: string, value: any, opts?: any) { console.log("[COOKIE OK] name=", name, " len=", String(value || "").length, " first80=", String(value || "").slice(0,80)); signedCookie = value; return this; },
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
    console.log("[DEV SIGNIN SUCCESS!] user id=", user?.id, " name=", user?.name, " email=", user?.email, " role=", user?.role);
  } catch(e: any) {
    console.error("[DEV SIGNIN FAIL] code=", e?.code, " msg=", String(e?.message || e).slice(0, 500));
    process.exit(11);
  }
}
main().catch(e => { console.error("CRASH:", e?.stack?.slice?.(0, 2500) || String(e)); process.exit(2); });
MARK_SCRIPT_END
echo "Script written: lines=$(wc -l < _tmp_sim_login.ts) size=$(stat -c%s _tmp_sim_login.ts)"
echo "=== 4. Run sim (same code path as real browser via createCaller) ==="
timeout 150 ./node_modules/.bin/tsx _tmp_sim_login.ts 2>&1 | tail -n 30
SCRIPT_RC=$?
echo "SCRIPT_RC=$SCRIPT_RC"
echo "=== 5. Clean up temp sim file ==="
rm -f _tmp_sim_login.ts
exit $SCRIPT_RC
'`;
  // Replace DEMO_PWD_VAR shell placeholder with actual password
  conn.exec(CMD.replace(/\$\{DEMO_PWD_VAR\}/g, DEMO_PWD), (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(c === 0 ? 0 : 10); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
