// 2ND TRY: Auto sync SERP_API_KEY from OLD v1 env (/home/ubuntu/eeat-studio/.env)
// to NEW v2 env (/home/ubuntu/eeat-studio-v2/.env) IF DIFFERENT + VERIFIED HTTP 200 OK
// (user probably updated v1 not v2 yet)
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 30000 };
const ssh = new SSHClient(cfg);
const mask = (s) => s && s.length >= 8 ? s.slice(0,4) + "********" + s.slice(-4) : "INVALID";
const ROOT_PW = "root_eeat_2026_Cloud!";

function curlPing(k){
  return `curl -sk -o /dev/null -w "%{http_code}" --max-time 12 -X POST -H "X-API-KEY: ${k}" -H "Content-Type: application/json" --data '{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}' https://google.serper.dev/search`;
}

(async () => {
  try { await ssh.connect(); console.log("🟢 SSH OK"); }
  catch(e) { console.error("🔴 SSH FAIL:", e.message); process.exit(2); }

  // Read both env keys
  const v1Raw = (await ssh.exec("grep -E '^SERP_API_KEY=' /home/ubuntu/eeat-studio/.env 2>/dev/null || echo 'SERP_API_KEY=MISSING'")).trim();
  const v2Raw = (await ssh.exec("grep -E '^SERP_API_KEY=' /home/ubuntu/eeat-studio-v2/.env || echo 'SERP_API_KEY=MISSING'")).trim();
  const v1Key = v1Raw.split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
  const v2Key = v2Raw.split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
  console.log("\n--- Compare v1 old env vs v2 new env SERP_API_KEY ---");
  console.log("  v1 OLD eeat-studio mask:     ", v1Key.length===40?mask(v1Key):"❌ len="+v1Key.length+" "+v1Key);
  console.log("  v2 NEW eeat-studio-v2 mask:  ", v2Key.length===40?mask(v2Key):"❌ len="+v2Key.length+" "+v2Key);
  console.log("  Same value: ", v1Key === v2Key ? "✅ (both revoked if 403 earlier)" : "⚠️ DIFFERENT (v1 may have NEW key not synced → check ping)");

  // Ping v1 key
  let v1Code = 0, v2Code = 0;
  if (v1Key.length === 40 && /^[a-f0-9]+$/i.test(v1Key)) {
    v1Code = parseInt((await ssh.exec(curlPing(v1Key))).trim(),10) || 0;
  }
  if (v2Key.length === 40 && /^[a-f0-9]+$/i.test(v2Key)) {
    v2Code = parseInt((await ssh.exec(curlPing(v2Key))).trim(),10) || 0;
  }
  console.log("\n--- Ping both keys ---");
  console.log("  v1 key HTTP: ", v1Code, "(200 = OK! Copy this one → v2)");
  console.log("  v2 key HTTP: ", v2Code, "(403 = still revoked)");

  // DECISION: AUTO SYNC if v1 key = 200 and v2 key != 200
  if (v1Code === 200 && v2Code !== 200 && v1Key.length===40) {
    console.log("\n🟢 DECISION: v1 key HTTP 200 OK! → AUTO sync to v2 env + pm2 reload");
    // sed replace in place v2 env
    const escKey = v1Key.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '\\$&');
    const sed = `sed -i -E "s|^SERP_API_KEY=.*$|SERP_API_KEY=${escKey}|" /home/ubuntu/eeat-studio-v2/.env`;
    await ssh.exec(sed);
    // Verify env read back
    const v2New = (await ssh.exec("grep -E '^SERP_API_KEY=' /home/ubuntu/eeat-studio-v2/.env")).trim();
    const kNew = v2New.split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
    console.log("  ✅ Env synced v2 mask =", mask(kNew), "len="+kNew.length);
    // Reload PM2 process to read new env
    const pm2 = await ssh.exec("pm2 reload eeat-studio-v2 2>&1");
    console.log("  ✅ PM2 reload eeat-studio-v2:", pm2.split("\n").slice(0,3).join(" | "));
    // Final ping (ensure env takes effect in 2s)
    await new Promise(r => setTimeout(r, 2000));
    const finalCode = parseInt((await ssh.exec(curlPing(kNew))).trim(),10) || 0;
    console.log("\n✅ FINAL PING V2 env key HTTP =", finalCode);
    if (finalCode === 200) console.log("🎉 SERP UNLOCKED! ✅ Step1 env DONE. Next Step2: DB AES encrypt settings row.");
    else console.log("⚠️ PING AFTER SYNC = "+finalCode+" (may need longer PM2 reload propagate? or manual DB step)");
  } else if (v1Code !== 200 && v2Code !== 200) {
    console.log("\n🔴 Both v1 + v2 keys = HTTP 403 (still revoked). Need regenerate NEW 40 hex key at serper.dev API Keys page and PASTE.");
    console.log("ℹ️ How: serper.dev/dashboard → API Keys → Regenerate Key → Ctrl+C 40 hex → Paste into chat only 40 chars nothing else.");
  } else if (v2Code === 200) {
    console.log("\n🟢 v2 key already HTTP 200! No sync needed. Only missing DB AES encrypt settings row Step2.");
  }

  try { await ssh.close(); } catch(e) {}
  process.exit((v1Code===200||v2Code===200) ? 0 : 1);
})();
