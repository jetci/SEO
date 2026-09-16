// AUTO SERP KEY PROBE
// 1. SSH VPS grep env SERP_API_KEY current value (40 chars? mask)
// 2. Ping google.serper.dev/search POST with that key → HTTP code
// 3. DB settings check serp_api_key AES row exists mask
// NO hardcode key print to terminal — mask first 4 + **** + last4 only
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 30000 };
const ssh = new SSHClient(cfg);
const mask = (s) => s && s.length >= 8 ? s.slice(0,4) + "********" + s.slice(-4) : "INVALID";

(async () => {
  try { await ssh.connect(); console.log("🟢 SSH OK thaiaeo.manus.host"); }
  catch (e) { console.error("🔴 SSH FAIL:", e.message); process.exit(2); }

  // Step1: VPS .env current SERP_API_KEY
  const envRaw = (await ssh.exec("grep -E '^SERP_API_KEY=' /home/ubuntu/eeat-studio-v2/.env || echo 'SERP_API_KEY=MISSING'")).trim();
  const envKey = envRaw.split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
  const len = envKey.length;
  const envMask = envKey === "MISSING" || envKey === "__FILL_IN__" || len < 30 ? "❌ " + envRaw : mask(envKey);
  console.log("\n--- Step1: VPS env SERP_API_KEY current ---");
  console.log("  LEN chars:", len, "(required: 40 hex)");
  console.log("  MASK:", envMask);

  // Step2: HTTP probe with that key (if 40 chars) — NO key echo
  let code = 0;
  if (len === 40 && /^[a-f0-9]+$/i.test(envKey)) {
    const curl = `curl -sk -o /dev/null -w "%{http_code}" --max-time 12 -X POST -H "X-API-KEY: ${envKey}" -H "Content-Type: application/json" --data '{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}' https://google.serper.dev/search`;
    code = parseInt((await ssh.exec(curl)).trim(),10) || 0;
  }
  console.log("\n--- Step2: Curl probe google.serper.dev/search (40 hex key) ---");
  console.log("  HTTP STATUS:", code, "(200 = KEY OK unlock! / 403 = revoked needs regenerate)");
  if (code === 0 && len !== 40) console.log("  ℹ️ Skip ping: key not 40 hex len="+len);

  // Step3: DB settings.serp_api_key exists (eeat_studio_v2 schema)
  const ROOT_PW = "root_eeat_2026_Cloud!";
  const sqlRaw = await ssh.exec("docker exec eeat-studio-db mariadb -uroot -p'" + ROOT_PW + "' -N -e \"SELECT setting_key, LEFT(setting_value,24) FROM eeat_studio_v2.settings WHERE setting_key IN ('serp_api_key','serp_api_key_iv','serp_api_key_tag') ORDER BY setting_key;\" 2>/dev/null");
  console.log("\n--- Step3: DB settings eeat_studio_v2 AES rows (iv/tag/ciphertext split) ---");
  console.log(sqlRaw ? sqlRaw.replace(/\s+$/,"") : "  ℹ️ NO AES rows yet in settings (will be created on Step2 encrypt update)");

  try { await ssh.close(); } catch(e) {}
  console.log("\nDONE — Probe exit");
  process.exit(code === 200 ? 0 : 1);
})();
