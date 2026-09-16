// Phase 2H LIVE VPS VERIFY 12 checks (no QA = No Accept) — ESM PURE JS
import SSHClient from "ssh2-promise";
const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: process.env.VPS_PASS || "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};
const DOMAIN = "thaiaeo.manus.host";
const ssh = new SSHClient(CFG);

let pass = 0, fail = 0;
const total = 12;
function A(label, cond, reasonIfFail) {
  if (cond) { console.log("  ✅ " + label); pass++; }
  else { console.log("  ❌ " + label + " — FAIL: " + (reasonIfFail ?? "")); fail++; process.exitCode = 1; }
}
function curlHTTP(p){ return "curl -sk -o /dev/null -w \"%{http_code}\" --max-time 10 https://" + DOMAIN + p; }

try {
  await ssh.connect();
  console.log("✅ SSH connected → " + DOMAIN + "\n");

  console.log("--- Group 1: SPA routes 3 new + 2 existing 200/301 ---");
  const routes = ["/research","/write","/audit","/kcp","/articles"];
  for (let i = 0; i < routes.length; i++) {
    const p = routes[i];
    const code = parseInt((await ssh.exec(curlHTTP(p))).trim(), 10) || 0;
    const n = String(pass + fail + 1).padStart(2,"0");
    A("V"+n+": Route "+p+" HTTP "+code+" (expected 200/301)", code === 200 || code === 301, "actual="+code);
  }

  console.log("\n--- Group 2: Health + Routers baseline ≥10 ---");
  const hOut = (await ssh.exec("curl -sk --max-time 10 https://"+DOMAIN+"/api/health")).trim();
  let hJson = null; try { hJson = JSON.parse(hOut); } catch(e) {}
  const phase = hJson && typeof hJson.phase === "number" ? hJson.phase : "N/A";
  const routersArr = Array.isArray(hJson && hJson.routers) ? hJson.routers : [];
  const routersCount = routersArr.length;
  const researchRouterPresent = routersArr.includes("research");
  const writeRouterPresent = routersArr.includes("write");
  A("V06: /api/health contains phase=2 (actual="+phase+")", phase === 2, "not 2");
  A("V07: /api/health routers count="+routersCount+" (≥10 baseline)", routersCount >= 10, "count="+routersCount);
  A("V08: research + write routers present (routers="+JSON.stringify(routersArr)+")", researchRouterPresent && writeRouterPresent, "research router present="+researchRouterPresent+" write router present="+writeRouterPresent);

  console.log("\n--- Group 3: PM2 DUAL v1 v2 ONLINE FOREVER ZERO OVERWRITE ---");
  const pm2Json = (await ssh.exec("pm2 jlist 2>&1")).trim();
  let pm2Arr = []; try { pm2Arr = JSON.parse(pm2Json); } catch(e) {}
  const v1 = pm2Arr.find(function(p){ return p && p.name === "eeat-studio"; });
  const v2 = pm2Arr.find(function(p){ return p && p.name === "eeat-studio-v2"; });
  const v1Online = !!(v1 && v1.pm2_env && v1.pm2_env.status === "online");
  const v2Online = !!(v2 && v2.pm2_env && v2.pm2_env.status === "online");
  A("V09: PM2 v1 eeat-studio id0 port3001 ONLINE", v1Online, v1 ? "status="+(v1.pm2_env && v1.pm2_env.status) : "process not found");
  A("V10: PM2 v2 eeat-studio-v2 port3002 ONLINE", v2Online, v2 ? "status="+(v2.pm2_env && v2.pm2_env.status) : "process not found");

  console.log("\n--- Group 4: Old schema 51 tables + NEW 2 trpc routes ping exist ---");
  const OLD = "eeat_studio";
  const ROOT_PW_RAW = await ssh.exec("docker exec eeat-studio-db bash -lc 'echo $MARIADB_ROOT_PASSWORD' 2>/dev/null").then(s=>s.trim()).catch(function(){ return ""; });
  const ROOT_PW = ROOT_PW_RAW || "root_eeat_2026_Cloud!";
  const tblRaw = await ssh.exec("docker exec eeat-studio-db mariadb -uroot -p'"+ROOT_PW+"' -N -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='"+OLD+"';\" 2>/dev/null");
  const tblCountStr = tblRaw.split("\n").map(s => s.trim()).filter(s => /^\d+$/.test(s)).pop() || "0";
  const tblCount = parseInt(tblCountStr,10) || 0;
  A("V11: MariaDB OLD eeat_studio = "+tblCount+" tables (FOREVER=51 ZERO ALTER/DROP)", tblCount === 51, "actual="+tblCount);

  function curlTRPC(p){ return "curl -sk -o /dev/null -w \"%{http_code}\" --max-time 10 -X POST -H \"Content-Type: application/json\" --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\"}' https://" + DOMAIN + "/api/trpc/" + p; }
  const V12a = parseInt((await ssh.exec(curlTRPC("write.saveDraft"))).trim(),10) || 0;
  const V12b = parseInt((await ssh.exec(curlTRPC("research.enrichSerp"))).trim(),10) || 0;
  A("V12: tRPC write.saveDraft POST HTTP "+V12a+" + research.enrichSerp POST HTTP "+V12b+" (both ≠ 404 = route registered)", V12a !== 404 && V12b !== 404, "write.saveDraft="+V12a+" research.enrichSerp="+V12b+" — 404 = MISSING procedure");

  console.log("\n========================================");
  console.log("Phase2H LIVE RESULT: "+pass+"/"+total+" PASS · "+fail+" FAIL");
  console.log("========================================");
} catch (e) {
  console.error("SSH VERIFY CRASH:", String((e && (e.message || e)) || "").slice(0, 220));
  process.exit(2);
} finally {
  try { await ssh.close(); } catch(e) {}
}
process.exit(fail > 0 ? 1 : 0);
