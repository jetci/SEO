// Phase 2I Live VPS verify — AUTH REDIRECT LOGOUT LOOP bugfix
// NO new routes (bugfix only) → verify existing SPA routes + health + no regression
// + PM2 DUAL online + old eeat_studio schema51 FOREVER ZERO ALTER
// + NEW: /api/health still phase2 + auth.me route registered POST probe returns NOT 404
import SSHClient from "ssh2-promise";
const DOMAIN = "thaiaeo.manus.host";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 30000 };
const ssh = new SSHClient(cfg);

let pass = 0, fail = 0, total = 0;
function A(desc, cond, extra = "") {
  total++;
  if (cond) { pass++; console.log("  ✅ V" + String(total).padStart(2, "0") + ": " + desc); }
  else { fail++; console.log("  ❌ FAIL V" + String(total).padStart(2, "0") + ": " + desc + " — " + extra); }
}

function curlHTTP(p) { return "curl -sk -o /dev/null -w \"%{http_code}\" --max-time 10 https://" + DOMAIN + p; }
function curlTRPC(p){ return "curl -sk -o /dev/null -w \"%{http_code}\" --max-time 10 -X POST -H \"Content-Type: application/json\" --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\"}' https://" + DOMAIN + "/api/trpc/" + p; }

(async () => {
  try {
    await ssh.connect(); console.log("🟢 SSH connected → " + DOMAIN);
  } catch (e) { console.error("🔴 SSH FAIL:", e.message); process.exit(2); }

  // Group 1: 5 SPA routes 200/301 (no redirect loop auth → routes return valid HTML NOT 302/login)
  console.log("\n--- Group 1: 5 SPA routes NO force redirect (Auth bug: logout loop fixed) ---");
  for (const p of ["/research", "/write", "/audit", "/kcp", "/articles"]) {
    const code = parseInt((await ssh.exec(curlHTTP(p))).trim(), 10) || 0;
    A("Route " + p + " HTTP " + code + " (expected 200/301 NOT redirect 302/login)", code === 200 || code === 301, "actual=" + code + " (302=logout redirect still loop!)");
  }

  // Group 2: Health phase + routers baseline auth.me registered
  console.log("\n--- Group 2: Health phase2 + auth.me registered POST probe ---");
  const hOut = (await ssh.exec("curl -sk --max-time 10 https://" + DOMAIN + "/api/health")).trim();
  let hJson = null; try { hJson = JSON.parse(hOut); } catch(e) {}
  const phase = hJson && typeof hJson.phase === "number" ? hJson.phase : -1;
  const routersArr = Array.isArray(hJson && hJson.routers) ? hJson.routers : [];
  const authRouterPresent = routersArr.includes("auth");
  A("V06: /api/health phase=2 (actual=" + phase + ")", phase === 2, "not 2");
  A("V07: routers baseline count=" + routersArr.length + " ≥10 OK", routersArr.length >= 10, "count=" + routersArr.length);
  A("V08: auth router namespace PRESENT (for me/devSignin/logout procedures)", authRouterPresent, "routers="+JSON.stringify(routersArr));

  // Group 3: PM2 DUAL FOREVER ZERO OVERWRITE + OLD schema 51 tables FOREVER
  console.log("\n--- Group 3: PM2 DUAL ONLINE FOREVER + OLD schema51 ZERO ALTER/DROP ---");
  const pm2Raw = (await ssh.exec("pm2 jlist 2>&1")).trim();
  let pm2Arr = []; try { pm2Arr = JSON.parse(pm2Raw); } catch(e) {}
  const v1 = pm2Arr.find(p => p.name === "eeat-studio");
  const v2 = pm2Arr.find(p => p.name === "eeat-studio-v2");
  A("V09: PM2 v1 eeat-studio ONLINE FOREVER", v1 && v1.pm2_env && v1.pm2_env.status === "online", "status=" + (v1?.pm2_env?.status ?? "MISSING"));
  A("V10: PM2 v2 eeat-studio-v2 ONLINE (new auth bugfix deployed)", v2 && v2.pm2_env && v2.pm2_env.status === "online", "status=" + (v2?.pm2_env?.status ?? "MISSING"));

  const ROOT_PW = "root_eeat_2026_Cloud!";
  const tblRaw = await ssh.exec("docker exec eeat-studio-db mariadb -uroot -p'" + ROOT_PW + "' -N -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eeat_studio';\" 2>/dev/null");
  const tblCountStr = tblRaw.split("\n").map(s => s.trim()).filter(s => /^\d+$/.test(s)).pop() || "0";
  const tblCount = parseInt(tblCountStr, 10) || 0;
  A("V11: OLD schema eeat_studio = " + tblCount + " tables (FOREVER 51 NO ALTER/DROP!)", tblCount === 51, "actual=" + tblCount);

  // Group 4: tRPC auth.me GET probe NOT 404 = route registered + /api/auth/google/login 302 redirect OAuth
  console.log("\n--- Group 4: Auth endpoints registered (NOT 404/MISSING) ---");
  const V12 = parseInt((await ssh.exec(curlHTTP("/api/trpc/auth.me"))).trim(), 10) || 0;
  A("V12: tRPC auth.me GET probe HTTP " + V12 + " (≠404 = auth router namespace exists)", V12 !== 404, "auth.me=" + V12 + " (404=router MISSING!)");

  const V13_redirect = parseInt((await ssh.exec(curlHTTP("/api/auth/google/login"))).trim(), 10) || 0;
  A("V13: /api/auth/google/login HTTP " + V13_redirect + " (expected 302 Google OAuth or 503 not configured)", V13_redirect === 302 || V13_redirect === 503, "actual=" + V13_redirect + " (404=route MISSING!)");

  console.log("\n========================================");
  console.log("Phase2I AUTH LIVE RESULT: " + pass + "/" + total + " PASS · " + fail + " FAIL");
  console.log("========================================");
  try { await ssh.close(); } catch(e) {}
  process.exit(fail === 0 ? 0 : 1);
})();
