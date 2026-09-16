// Phase 2J LIVE VPS VERIFY settings.save 401 redirect bugfix deploy (10+ checks)
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 30000 };
const ROOT = "https://thaiaeo.manus.host";
const ssh = new SSHClient(cfg);
const assert = new (class {
  passed=0; failed=0;
  ok(n, desc, cond, detail="") {
    if (cond) { this.passed++; console.log(`✅ V${n.toString().padStart(2,"0")} PASS ${desc}`); }
    else { this.failed++; console.error(`❌ V${n.toString().padStart(2,"0")} FAIL ${desc}${detail? " → "+detail:""}`); process.exitCode = (process.exitCode||0)+1; }
  }
})();
function curlHTTP(p, method="GET", extra="") {
  return ssh.exec(`curl -sk -o /dev/null -w "%{http_code}" --max-time 10 ${method==="POST"?"-X POST -H 'Content-Type: application/json' -d '{}'":""} ${extra} '${ROOT}${p}'`).then(s=>parseInt(s.trim(),10)||0);
}

(async () => {
  try { await ssh.connect(); console.log("🟢 SSH OK thaiaeo.manus.host"); } catch(e) { console.error("🔴 SSH FAIL",e.message); process.exit(2); }

  // V01-V05 SPA routes + settings NEW (200/301 NOT 302 redirect login EVER!)
  const routes = [["/research",[200,301]],["/write",[200]],["/audit",[200]],["/settings",[200]],["/articles",[200]]];
  let i=1;
  for (const [p,arr] of routes) {
    const code = await curlHTTP(p);
    assert.ok(i++, `SPA ${p} HTTP ${code} (NOT 302 redirect login)`, arr.includes(code), `got=${code} expected=${arr.join("/")}`);
  }
  // V06 /api/health = phase=2, routers >=10 (namespaces)
  const health = await ssh.exec(`curl -sk --max-time 10 '${ROOT}/api/health'`);
  try {
    const H = JSON.parse(health);
    assert.ok(6, `V06 health phase=${H.phase} routers=${H.routers?.length}`, H.phase===2 && Array.isArray(H.routers) && H.routers.length >= 10, "phase="+H.phase+" routers len="+H.routers?.length);
    assert.ok(7, "V07 routers namespace includes settings auth research write",
      ["settings","auth","research","write"].every(r => H.routers.includes(r)),
      "routers array="+JSON.stringify(H.routers));
  } catch(e) { assert.ok(6,"V06 parse health JSON",false,"health parse err: "+e.message+" body="+health.slice(0,200)); }

  // V08 tRPC settings namespace procedures registered (200/400/401 !=404 → route EXISTS registered)
  // settings.get = QUERY (void input) → probe GET method (POST {} void rejected 404 = not missing, spec error fixed)
  // settings.save = MUTATION → probe POST empty body OK 401=EXISTS
  const s0 = await curlHTTP("/api/trpc/settings.get","GET");
  const s1 = await curlHTTP("/api/trpc/settings.save","POST");
  // 401 = route exists, session cookie required ✓
  // 400 = tRPC validation on POST ✓
  // 200 = public (won't happen for admin protected)
  // ANY except 404 = confirmed registered namespace & proc
  assert.ok(8, `V08 settings tRPC routes registered (get=${s0} save=${s1}) NOT 404`,
    s0 !== 404 && s1 !== 404,
    "got GET settings.get="+s0+" POST settings.save="+s1+" (expected BOTH != 404, 404=missing proc BAD)");

  // V09 auth endpoints registered (login 302 OAuth redirect NOT 404)
  const lg = await curlHTTP("/api/auth/google/login");
  assert.ok(9, `V09 OAuth /api/auth/google/login returns ${lg} (302 expected)`, lg===302, "got="+lg);

  // V10 + V11 PM2 dual FOREVER ZERO OVERWRITE online
  const pm2 = JSON.parse(await ssh.exec("pm2 jlist"));
  const v1 = pm2.find((p)=>p.name==="eeat-studio");
  const v2 = pm2.find((p)=>p.name==="eeat-studio-v2");
  assert.ok(10, "V10 PM2 v1 eeat-studio (OLD) ONLINE port3001 FOREVER", v1?.pm2_env?.status==="online", `v1status=${v1?.pm2_env?.status}`);
  assert.ok(11, "V11 PM2 v2 eeat-studio-v2 (NEW) ONLINE port3002", v2?.pm2_env?.status==="online", `v2status=${v2?.pm2_env?.status}`);

  // V12 OLD eeat_studio schema = 51 FOREVER LOCKED ZERO ALTER
  const ROOT_PW = "root_eeat_2026_Cloud!";
  const t51 = parseInt((await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eeat_studio';" 2>/dev/null`)).trim(),10)||0;
  assert.ok(12, `V12 OLD LOCKED schema eeat_studio tables = 51 FOREVER (actual=${t51})`, t51===51, "t51="+t51);

  try { await ssh.close(); } catch(e) {}
  console.log(`\n📋 LIVE VPS Phase 2J verify: ${assert.passed}/${assert.passed+assert.failed} ${assert.failed===0?"✅ ALL GREEN":"FAIL exit="+assert.failed}`);
  process.exit(assert.failed===0?0:1);
})();
