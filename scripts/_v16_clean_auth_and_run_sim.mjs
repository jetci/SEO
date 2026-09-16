import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    sftp.readFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', 'utf8', (rerr, data) => {
      if (rerr) { console.error('read', rerr); process.exit(4); }
      // 1. REMOVE ALL DEBUG console.error lines
      let cleanData = data
        .replace(/\n      console\.error\('\[AUTH_DEBUG_V16\][^']*'\);/g, '')
        .replace(/\n      const __dbgInPwd[^;]+;/g, '')
        .replace(/\n      const __dbgEnvPwd[^;]+;/g, '')
        .replace(/\n      console\.error\('\[AUTH_DEBUG_V16\][\s\S]*?\);/g, '')
        .replace(/\n      console\.error\("\[AUTH_DEBUG_V16\][^"]*"\);/g, '')
        .replace(/\n      __dbgInPwd[^;]+;/g, '')
        .replace(/\n      __dbgEnvPwd[^;]+;/g, '');
      if (cleanData === data) { console.log('No debug logs found (already clean)'); }
      else { console.log(`Cleaned debug logs: diff bytes = ${data.length} → ${cleanData.length}`); }
      sftp.writeFile('/home/ubuntu/eeat-studio-v2/server/auth.ts', cleanData, (werr) => {
        if (werr) { console.error('write clean', werr); process.exit(6); }
        // Verify clean
        const grepCheck = cleanData.includes('[AUTH_DEBUG_V16]');
        console.log('Still has debug tags?', grepCheck, '(want FALSE)');
        // 2. NOW WRITE SIM SCRIPT with PASSWORD HARDCODED inside it (no shell replacement needed!)
        const SIM = `import "dotenv/config";
async function main() {
  const { appRouter } = await import("./server/routers/_app.ts");
  const envMod = await import("./server/_core/env.ts");
  const ENV = envMod.ENV;
  let signedCookieValue: any = null;
  let cookieName: any = null;
  const mockCtx = {
    req: { headers: {}, ip: "127.0.0.1" },
    res: {
      cookie: function(name: any, value: any, opts?: any) {
        console.log("__COOKIE_OUTPUT__ name=", name, " value_len=", String(value||"").length, "__VALUE_START__" + String(value || "") + "__VALUE_END__");
        signedCookieValue = value; cookieName = name;
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
    password: "K9XmPq4Rtv2ZB8Lw3N!7C"
  };
  console.log("SIM: input password len=", input.password.length, " match env stored?",
    input.password === String(process.env.PROD_DEMO_SIGNIN_PASSWORD || "").trim());
  try {
    const user = await caller.auth.devSignin(input);
    console.log("__AUTH_SUCCESS__: id=" + user?.id + " name=" + user?.name + " email=" + user?.email + " role=" + user?.role);
  } catch(e: any) {
    console.error("__AUTH_FAIL__: code=" + (e?.code || "NONE") + " msg=" + String(e?.message || e).slice(0, 500));
    process.exit(11);
  }
}
main().catch(e => { console.error("__CRASH__", e?.stack?.slice?.(0, 2500) || String(e)); process.exit(2); });
`;
        sftp.writeFile('/home/ubuntu/eeat-studio-v2/_tmp_final_auth_sim.ts', SIM, (werr2) => {
          if (werr2) { console.error('write sim', werr2); process.exit(7); }
          console.log('Wrote sim script to project dir (hardcoded password!)');
          // Execute it!
          const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== PM2 restart eeat-studio-v2 AFTER auth.ts clean ==="
/usr/bin/pm2 restart eeat-studio-v2 --update-env > /dev/null 2>&1
sleep 6
/usr/bin/pm2 list | grep eeat-studio-v2 | head -n 1
echo ""
echo "=== FINAL RUN createCaller auth.devSignin sim INSIDE project (hardcoded password inside script) ==="
timeout 180 ./node_modules/.bin/tsx ./_tmp_final_auth_sim.ts 2>&1 | tail -n 20
SCRIPT_RC=$?
echo "SCRIPT_RC=$SCRIPT_RC"
echo "Clean temp sim file"
rm -f _tmp_final_auth_sim.ts
exit $SCRIPT_RC
'`;
          conn.exec(CMD, (e,s) => {
            if (e) { console.error(e); process.exit(2); }
            s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(c === 0 ? 0 : 8); })
              .on('data', d => process.stdout.write(d.toString()))
              .stderr.on('data', d => process.stdout.write(d.toString()));
          });
        });
      });
    });
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
