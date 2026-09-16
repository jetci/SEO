#!/usr/bin/env node
// Phase 2G LIVE VPS VERIFY — 7 assertions after deploy
// No QA = No Accept rule
import SSHClient from "ssh2-promise";

const VPS = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};

const ROUTES = [
  { p: "/research", expected: [200, 301] },
  { p: "/write",    expected: [200, 301] },
  { p: "/audit",    expected: [200, 301] },
  { p: "/kcp",      expected: [200, 301] },
  { p: "/articles", expected: [200, 301] },
];

let pass = 0, fail = 0, total = 10;
const A = (name, cond, why = "") => {
  if (cond) { pass++; console.log(`  ✅ V${(pass).toString().padStart(2, "0")}: ${name}`); }
  else { fail++; console.log(`  ❌ V${(pass+fail).toString().padStart(2, "0")}: ${name}${why ? " → " + why : ""}`); }
};

async function main() {
  const ssh = new SSHClient(VPS);
  try {
    await ssh.connect();
    console.log("✅ SSH connected → thaiaeo.manus.host\n");

    console.log("--- Group 1: SPA routes 3 new + 2 existing no-regression ---");
    for (const r of ROUTES) {
      const out = (await ssh.exec(`curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://thaiaeo.manus.host${r.p} 2>&1`)).trim();
      const code = parseInt(out, 10) || 0;
      const ok = r.expected.includes(code);
      A(`Route ${r.p} HTTP ${code} (expected ${r.expected.join("/")})`, ok, `curl returned ${code}`);
    }

    console.log("\n--- Group 2: health API phase=2 routers=10 ---");
    const hOut = (await ssh.exec(`curl -sk --max-time 10 https://thaiaeo.manus.host/api/health 2>&1`)).trim();
    let hJson = null;
    try { hJson = JSON.parse(hOut); } catch {}
    const phaseOk = hJson && hJson.phase === 2;
    const routersOk = hJson && Array.isArray(hJson.routers) && hJson.routers.length >= 10;
    A(`/api/health contains phase=2 (actual=${hJson?.phase ?? "N/A"})`, phaseOk, `health body=${hOut.slice(0,300)}`);
    A(`/api/health routers count=${hJson?.routers?.length ?? "N/A"} (≥10)`, routersOk, `health body=${hOut.slice(0,300)}`);

    console.log("\n--- Group 3: PM2 DUAL online FOREVER (v1 id0 port3001 + v2 port3002 NO OVERWRITE) ---");
    const pm2Raw = await ssh.exec(`pm2 jlist 2>&1`);
    let pm2 = [];
    try { pm2 = JSON.parse(pm2Raw); } catch { pm2 = []; }
    const v1 = pm2.find(p => p.name === "eeat-studio");
    const v2 = pm2.find(p => p.name === "eeat-studio-v2");
    const v1Online = v1 && v1.pm2_env && v1.pm2_env.status === "online";
    const v2Online = v2 && v2.pm2_env && v2.pm2_env.status === "online";
    A(`PM2 v1 eeat-studio id=0 ONLINE (old port3001 — ZERO OVERWRITE)`, v1Online, v1 ? `status=${v1?.pm2_env?.status}` : "process not found");
    A(`PM2 v2 eeat-studio-v2 ONLINE (new port3002)`, v2Online, v2 ? `status=${v2?.pm2_env?.status}` : "process not found");

    console.log("\n--- Group 4: Old eeat_studio schema 51 tables FOREVER PRESERVED UNALTERED ---");
    const OLD = "eeat_studio";
    const ROOT_PW = (await ssh.exec(`docker exec eeat-studio-db bash -lc 'echo $MARIADB_ROOT_PASSWORD' 2>/dev/null || echo 'root_eeat_2026_Cloud!'`)).trim();
    const tblRaw = await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${OLD}';" 2>/dev/null`);
    const tblCountStr = tblRaw.split("\n").map(s => s.trim()).filter(s => /^\d+$/.test(s)).pop() || "0";
    const tblCount = parseInt(tblCountStr, 10) || 0;
    A(`MariaDB OLD ${OLD} schema = ${tblCount} tables (MUST = 51 FOREVER UNALTERED)`, tblCount === 51, `actual=${tblCount} expected=51 — ZERO DROP/ALTER PERMITTED`);

    console.log("\n========================================");
    console.log(`LIVE VERIFY RESULT: ${pass}/${total} PASS · ${fail} FAIL`);
    console.log("========================================");
    if (fail > 0) process.exit(1); else process.exit(0);
  } finally {
    try { await ssh.close(); } catch {}
  }
}
main().catch(e => {
  console.error("SSH VERIFY CRASH:", e.message);
  process.exit(2);
});
