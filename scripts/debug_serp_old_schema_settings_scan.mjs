// LAST DITCH: Check OLD schema eeat_studio (v1 51 tables) settings table
// for SERP / api keys (v1 may store in DB not env file) — if present & 40 hex & 200 OK → auto copy
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 30000 };
const ssh = new SSHClient(cfg);
const mask = (s) => s && s.length >= 8 ? s.slice(0,4) + "********" + s.slice(-4) : "INVALID";
const ROOT_PW = "root_eeat_2026_Cloud!";
function curlPing(k){
  return `curl -sk -o /dev/null -w "%{http_code}" --max-time 12 -X POST -H "X-API-KEY: ${k}" -H "Content-Type: application/json" --data '{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}' https://google.serper.dev/search`;
}

(async () => {
  try { await ssh.connect(); console.log("🟢 SSH OK"); } catch(e){ console.error("🔴 SSH FAIL"); process.exit(2); }

  // List all settings key names in old eeat_studio schema (find SERP/SERPER/API keys)
  const sql1 = `SELECT setting_key, CHAR_LENGTH(setting_value) AS len FROM eeat_studio.settings WHERE setting_key LIKE '%serp%' OR setting_key LIKE '%serper%' OR setting_key LIKE '%SERP%' OR setting_key LIKE '%api%' OR setting_key LIKE '%key%' ORDER BY setting_key LIMIT 20;`;
  const rows1 = await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "${sql1}" 2>/dev/null`);
  console.log("\n--- Old eeat_studio (v1 DB) settings rows matching serp/serper/api/key ---");
  console.log(rows1 || "  ℹ️ No rows found in old settings table.");

  // Also check ANY 40-char hex in plaintext old settings? (value column)
  const sql2 = `SELECT setting_key, LEFT(setting_value,4) AS pre, RIGHT(setting_value,4) AS suf, CHAR_LENGTH(setting_value) AS len FROM eeat_studio.settings WHERE CHAR_LENGTH(setting_value)=40 AND setting_value REGEXP '^[a-fA-F0-9]{40}$' LIMIT 10;`;
  const rows2 = await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "${sql2}" 2>/dev/null`);
  console.log("\n--- Old eeat_studio ANY 40 hex setting_value rows (potential SERP key) ---");
  console.log(rows2 || "  ℹ️ No 40-hex rows found in old schema settings.");

  // If rows2 found any → extract full value + ping HTTP
  const lines = String(rows2 || "").split("\n").map(s=>s.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\t+/);
    if (parts.length < 4) continue;
    const [k, pre, suf, lenStr] = parts;
    if (String(lenStr).trim() !== "40") continue;
    // Full select value
    const getVal = `SELECT setting_value FROM eeat_studio.settings WHERE setting_key='${k.replace(/'/g,"''")}' LIMIT 1;`;
    const val = (await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "${getVal}" 2>/dev/null`)).trim();
    if (val && val.length===40 && /^[a-f0-9]+$/i.test(val)) {
      console.log("\n  🟢 Found 40 hex in old schema settings."+" key="+k+" mask="+mask(val)+" len="+val.length);
      const code = parseInt((await ssh.exec(curlPing(val))).trim(),10)||0;
      console.log("  HTTP probe =",code);
      if (code === 200) {
        console.log("  🎉 KEY OK! Will now AUTO COPY this → v2 env + pm2 reload");
        const esc = val.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '\\$&');
        await ssh.exec(`sed -i -E "s|^SERP_API_KEY=.*$|SERP_API_KEY=${esc}|" /home/ubuntu/eeat-studio-v2/.env`);
        const v2NewLine = (await ssh.exec("grep -E '^SERP_API_KEY=' /home/ubuntu/eeat-studio-v2/.env")).trim();
        const v2NewKey = v2NewLine.split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
        console.log("  ✅ V2 env synced mask="+mask(v2NewKey)+" len="+v2NewKey.length);
        await ssh.exec("pm2 reload eeat-studio-v2 2>&1 >/dev/null");
        await new Promise(r=>setTimeout(r,3000));
        const fin = parseInt((await ssh.exec(curlPing(v2NewKey))).trim(),10)||0;
        console.log("  ✅ FINAL ping after reload =",fin, fin===200? "🎉 SERP UNLOCKED STEP1 DONE!" : "");
      }
    }
  }

  try { await ssh.close(); } catch(e) {}
  process.exit(0);
})();
