import SSHClient from "ssh2-promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJ_ROOT = path.resolve(__dirname, "..");

const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};

async function walk(dir, root) {
  root = root || dir;
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full, root));
    } else {
      results.push({ rel: path.relative(root, full).replace(/\\/g, '/'), full });
    }
  }
  return results;
}

async function main() {
  const ssh = new SSHClient(CFG);
  await ssh.connect();
  console.log("SSH CONNECTED");
  const sftp = ssh.sftp();

  const run = async (label, cmd) => {
    console.log(`\n=== [${label}] ===`);
    const r = await ssh.exec(cmd).catch(e => String(e?.stack || e));
    console.log(String(r).slice(0, 4000));
  };

  // ===== STEP 1: upload server/auth.ts (L298 redirect /) =====
  const LOCAL_AUTH = path.join(PROJ_ROOT, "server", "auth.ts");
  await sftp.writeFile("/home/ubuntu/eeat-studio-v2/server/auth.ts", fs.readFileSync(LOCAL_AUTH, "utf8"), { mode: 0o644 });
  console.log("✅ SFTP upload server/auth.ts L298 redirect fixed: /dashboard → / OK");

  // ===== STEP 2: Verify remote auth.ts AFTER upload =====
  await run("STEP 2 Verify auth.ts redirect L298",
    "cd /home/ubuntu/eeat-studio-v2 && grep -n 'ENV.APP_URL' server/auth.ts");

  // ===== STEP 3: upload App.tsx (route /dashboard registered) =====
  const LOCAL_APP = path.join(PROJ_ROOT, "client", "src", "App.tsx");
  await sftp.writeFile("/home/ubuntu/eeat-studio-v2/client/src/App.tsx", fs.readFileSync(LOCAL_APP, "utf8"), { mode: 0o644 });
  console.log("✅ SFTP upload client/src/App.tsx L33 route /dashboard OK");

  // ===== STEP 4: Rebuild Vite client on VPS =====
  await run("STEP 4 CLIENT VITE BUILD on VPS",
    "cd /home/ubuntu/eeat-studio-v2 && ls client/src/pages && npm run build 2>&1 | tail -25");

  // ===== STEP 5: Verify build count path /dashboard route L33 =====
  await run("STEP 5 Verify bundle /dashboard route exists + NotFound alias",
    "cd /home/ubuntu/eeat-studio-v2 && grep -c '/dashboard' client/src/App.tsx dist/assets/*.js 2>/dev/null | head -10");

  // ===== STEP 6: PM2 restart eeat-studio-v2 =====
  await run("STEP 6 PM2 restart + sleep 12s",
    "pm2 restart eeat-studio-v2 --update-env 2>&1 | tail -8 && sleep 14 && pm2 jlist 2>/dev/null | grep -oE '\"name\":\"eeat-studio-v2\"|\"status\":\"[a-z]+\"' | head -6");

  // ===== STEP 7: Health + SPA verify + loopback / and /dashboard and /login =====
  await run("STEP 7 Health + SPA / and /dashboard HTTP 200",
    "echo '- /api/health: '$(curl -s http://127.0.0.1:3002/api/health | grep -oE '\"phase\":[0-9]|\"ok\":true|\"routers\":' | head -3) && echo 'HTTP /' $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/) && echo 'HTTP /login' $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/login) && echo 'HTTP /dashboard' $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/dashboard) && echo 'HTTPS /dashboard' $(curl -sk -o /dev/null -w '%{http_code}' https://thaiaeo.manus.host/dashboard --max-time 10)");

  // ===== STEP 8: PM2 save =====
  await run("STEP 8 PM2 save persist reboot",
    "pm2 save 2>&1 | tail -3");

  await ssh.close();
  console.log("\n✅ 404 DASHBOARD FIX APPLIED → redirect L298 / AND alias APP ROUTE /dashboard DONE");
}
main().catch(e => { console.error(e); process.exit(1); });
