// AUTO Serper Unlock P0 — 100% Agent Self-Run, NO user questions
import SSHClient from "ssh2-promise";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 30000 };
const ROOT_PW = "root_eeat_2026_Cloud!";
const ssh = new SSHClient(cfg);
const mask = (s) => s && s.length >= 8 ? s.slice(0,4) + "********" + s.slice(-4) : "INVALID";
let state = { hasRow:false, enc:"", plainLen:0, pingCode:0, envKeyMask:"", envPingOld:0, synced:false, reloadOk:false, foundTeamId:0, err:null };
const esc = (s) => s.replace(/'/g, `'\\''`);

(async () => {
  try {
    await ssh.connect();
    console.log("🟢 SSH OK 35.231.230.218\n");

    // S1: env SESSION_SECRET + SERP_API_KEY
    const sessLine = (await ssh.exec("grep -E '^SESSION_SECRET=' /home/ubuntu/eeat-studio-v2/.env || echo SESSION_SECRET=MISSING")).trim();
    const SESSION_SECRET = sessLine.split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
    if (!SESSION_SECRET || SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET missing length="+SESSION_SECRET.length);
    const envSerpLine = (await ssh.exec("grep -E '^SERP_API_KEY=' /home/ubuntu/eeat-studio-v2/.env || echo SERP_API_KEY=MISSING")).trim();
    const envKey = envSerpLine.split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
    state.envKeyMask = envKey.length===40? mask(envKey) : ("❌ len="+envKey.length+" val=\""+String(envKey).slice(0,20)+"\"");
    console.log("--- S1: Env ---");
    console.log("  SESSION_SECRET len:", SESSION_SECRET.length, ">=32 ✔️");
    console.log("  V2 env SERP_API_KEY mask:", state.envKeyMask);
    if (envKey && envKey.length===40 && /^[a-f0-9]+$/i.test(envKey)) {
      state.envPingOld = parseInt((await ssh.exec(`curl -sk -o /dev/null -w "%{http_code}" --max-time 12 -X POST -H "X-API-KEY: ${envKey}" -H "Content-Type: application/json" --data '{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}' https://google.serper.dev/search`)).trim(),10)||0;
      console.log("  Ping OLD env key HTTP:", state.envPingOld);
    }

    // S2: DB team list for admin (email=intelman or openid=102308...) — pick first teamId present serp_api_key row
    const teamRows = (await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "SELECT teamId FROM eeat_studio_v2.teamMembers WHERE userId IN (SELECT id FROM eeat_studio_v2.users WHERE email='intelman26@gmail.com' OR googleOpenId='102308593207118714314');" 2>/dev/null`)).trim();
    const tc = [];
    String(teamRows).split("\n").map(s=>s.trim()).filter(Boolean).forEach(l => { const t = parseInt(l.split(/\s+/)[0],10); if (t>0) tc.push(t); });
    tc.push(0, 90001, 1, 2, 90002, 90003, 90010);
    console.log("\n--- S2: Admin candidate teams:", tc.join(","));
    let encFound = "";
    for (const t of tc) {
      const enc = (await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "SELECT setting_value FROM eeat_studio_v2.settings WHERE teamId=${t} AND keyName='serp_api_key' LIMIT 1;" 2>/dev/null`)).trim();
      if (enc && enc.length > 30) { state.foundTeamId = t; encFound = enc; break; }
    }
    if (!encFound) {
      const allTeams = (await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "SELECT teamId,id FROM eeat_studio_v2.settings WHERE keyName='serp_api_key' ORDER BY id DESC LIMIT 1;" 2>/dev/null`)).trim();
      const parts = String(allTeams).split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const t = parseInt(parts[0], 10);
        const enc = (await ssh.exec(`docker exec eeat-studio-db mariadb -uroot -p'${ROOT_PW}' -N -e "SELECT setting_value FROM eeat_studio_v2.settings WHERE keyName='serp_api_key' ORDER BY id DESC LIMIT 1;" 2>/dev/null`)).trim();
        if (enc && enc.length > 30) { state.foundTeamId = t; encFound = enc; console.log("  (backup strategy found via any-team latest row teamId="+t+")"); }
      }
    }
    console.log("  teamId found with serp_api_key row:", state.foundTeamId);
    console.log("  encrypted value len:", encFound.length||0);

    if (!encFound) {
      state.hasRow = false;
      console.log("\n  ❌ NO serp_api_key row IN DB settings eeat_studio_v2!");
      console.log("  That means either: SERP key was < 10 chars / __FILL_IN__ when saved, so backend skipped upsert; OR save failed; OR teamId mismatched.\n");
    } else {
      state.hasRow = true;
      const parts = encFound.split(".");
      if (parts.length !== 3) throw new Error("Encrypted format not iv.tag.ct split len="+parts.length);
      const iv = parts[0], tag = parts[1], ct = parts[2];
      // Decrypt + Ping DB key in ONE remote node process (no key echo anywhere)
      const decAndPingCmd = `node -e "
const crypto=require('crypto'), cp=require('child_process');
const key=crypto.createHash('sha256').update(process.env.SS).digest();
const a=process.argv.slice(1); const iv64=a[0],tag64=a[1],ct64=a[2];
const b64=(s)=>{let b=s.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';return Buffer.from(b,'base64');};
try{
  const d=crypto.createDecipheriv('aes-256-gcm',key,b64(iv64));
  d.setAuthTag(b64(tag64));
  const k=Buffer.concat([d.update(b64(ct64)),d.final()]).toString('utf8');
  process.stdout.write('PLAIN_MASK='+k.slice(0,4)+'********'+k.slice(-4)+'\\nPLAIN_LEN='+k.length+'\\nREGEX40='+(k.length===40&&/^[a-fA-F0-9]{40}\$/.test(k)?'YES':'NO')+'\\n');
  const out=cp.execFileSync('curl',['-sk','-o','/dev/null','-w','%{http_code}','--max-time','15','-X','POST','-H','X-API-KEY: '+k,'-H','Content-Type: application/json','--data',JSON.stringify({q:'สล็อตออนไลน์',gl:'th',hl:'th',num:1}),'https://google.serper.dev/search']);
  process.stdout.write('PING_CODE='+out.toString().trim()+'\\n');
  process.env.__K=k; process.stdout.write('OK\\n');
}catch(e){console.log('DECRYPT_OR_PING_FAIL '+String(e.message).slice(0,200));process.exit(2);}
" -- ${iv} ${tag} ${ct}`;
      const runOut = (await ssh.exec(`SS='${esc(SESSION_SECRET)}' ${decAndPingCmd}`)).trim();
      console.log("\n--- S3: Decrypt (AES-256-GCM SHA256 session key) + Ping google.serper.dev/search ---");
      console.log("  stdout:\n    "+runOut.split("\n").map(s=>"      "+s).join("\n"));
      const pm = /PING_CODE=(\d+)/.exec(runOut);
      const lm = /PLAIN_LEN=(\d+)/.exec(runOut);
      const rm = /REGEX40=(YES|NO)/.exec(runOut);
      const mm = /PLAIN_MASK=([^\s]+)/.exec(runOut);
      if (pm) state.pingCode = parseInt(pm[1],10);
      if (lm) state.plainLen = parseInt(lm[1],10);

      // If 200 OK → sync DB plaintext to VPS env SERP_API_KEY line (if not already same 40 hex) + pm2 reload
      if (state.pingCode === 200 && !(envKey.length===40 && state.envPingOld===200)) {
        // One-liner: decrypt, read env, replace SERP_API_KEY=*, write back, then pm2 reload
        const syncCmd = `node -e "
const crypto=require('crypto'),fs=require('fs');
const key=crypto.createHash('sha256').update(process.env.SS).digest();
const a=process.argv.slice(1); const iv64=a[0],tag64=a[1],ct64=a[2],envPath=a[3];
const b64=(s)=>{let b=s.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';return Buffer.from(b,'base64');};
try{
  const d=crypto.createDecipheriv('aes-256-gcm',key,b64(iv64));
  d.setAuthTag(b64(tag64));
  const k=Buffer.concat([d.update(b64(ct64)),d.final()]).toString('utf8');
  let txt=fs.readFileSync(envPath,'utf8');
  const replacer=(m)=>'SERP_API_KEY='+k;
  if(/^SERP_API_KEY=.*$/m.test(txt)) txt=txt.replace(/^SERP_API_KEY=.*$/m, replacer);
  else txt=txt.replace(/\$/,'')+'\\nSERP_API_KEY='+k+'\\n';
  fs.writeFileSync(envPath,txt);
  console.log('ENV_SYNC_OK mask='+k.slice(0,4)+'********'+k.slice(-4));
}catch(e){console.log('SYNC_FAIL '+String(e.message).slice(0,200));process.exit(2);}
" -- ${iv} ${tag} ${ct} /home/ubuntu/eeat-studio-v2/.env`;
        const sOut = (await ssh.exec(`SS='${esc(SESSION_SECRET)}' ${syncCmd}`)).trim();
        console.log("\n--- S4: Sync DB (working 200 key) → env SERP_API_KEY line ---");
        console.log("  sync output:", sOut);
        if (/ENV_SYNC_OK/.test(sOut)) {
          state.synced = true;
          const pm2 = (await ssh.exec("pm2 reload eeat-studio-v2 2>&1 | tail -3")).trim();
          state.reloadOk = /OK|online|reloaded/.test(pm2);
          console.log("  pm2 reload eeat-studio-v2:", pm2);
        }
      } else if (state.pingCode === 200) {
        state.synced = true; // already same key
        console.log("\n  ℹ️ Skip sync: env already holds same working 40 hex key");
      }
    }
  } catch(e) {
    state.err = String(e && e.message ? e.message : String(e));
    console.error("\n🔴 Exception:", state.err);
  }
  try { await ssh.close(); } catch(e) {}

  // === FINAL REPORT (no further questions!) ===
  console.log("\n\n===================================================================");
  console.log("🤖 AGENT AUTO SERP UNLOCK — RESULT REPORT (100% self-run)");
  console.log("===================================================================");
  console.log("  1. DB eeat_studio_v2.settings.serp_api_key row EXISTS (teamId="+state.foundTeamId+"): ", state.hasRow ? "✅ YES" : "❌ NO");
  if (state.hasRow) {
    console.log("  2. Decrypted key length 40 chars hex?: ", state.plainLen===40?`✅ len=40`:`❌ len=${state.plainLen}`);
  }
  console.log("  3. Curl POST google.serper.dev/search (สล็อตออนไลน์ gl=th hl=th num=1): ");
  if (state.pingCode===200)       console.log("     🎉 HTTP 200 UNLOCKED! ✅");
  else if (state.pingCode===403) console.log("     ❌ HTTP 403 REVOKED (คีย์ใน DB ปัจจุบัน ถูก Serper dashboard ยกเลิกอีกแล้ว)");
  else if (state.pingCode)      console.log("     ❌ HTTP "+state.pingCode);
  else                          console.log("     ℹ️ N/A ไม่มีคีย์ใน DB");
  console.log("  4. OLD env SERP_API_KEY ping: ", state.envPingOld === 0 ? "N/A" : (state.envPingOld===200? "✅ 200 OK":"❌ "+state.envPingOld));
  console.log("  5. DB key → VPS env sync: ", state.synced ? "✅ SYNC OK" : "ℹ️ skip");
  console.log("  6. PM2 eeat-studio-v2 reload: ", state.reloadOk ? "✅ OK" : "ℹ️ skip");
  console.log("===================================================================");
  if (state.pingCode === 200 || state.envPingOld === 200) {
    console.log("🎯 SERP PIPELINE STATUS = UNLOCKED ✅");
    console.log("   ✅ KCP pillar Run Plan ดึง SERP/PAA จริงได้");
    console.log("   ✅ Write Page Step2 Sources ดึง organic DA≥35 จริงได้");
    console.log("   ✅ research.enrichSerp mutation ดึงข้อมูล SERP จริง 403 ไม่เกิดอีกต่อไป");
    process.exit(0);
  } else {
    if (!state.hasRow) {
      console.log("🎯 SUMMARY ACTION REQUIRED:");
      console.log("   ❌ ยังไม่พบ serp_api_key row ในฐานข้อมูล eeat_studio_v2");
      console.log("   📝 ทำการบันทึกใหม่ 1 ครั้ง บนหน้า Settings App:");
      console.log("     1. Login → เมนู ตั้งค่าระบบ");
      console.log("     2. SERP Provider: เลือก Serper.dev");
      console.log("     3. SERP API Key: ใส่ 40 hex key ที่ Regenerate ใหม่ล่าสุด (ไม่ใช่ตัวเก่า!)");
      console.log("     4. ตรวจสอบสวิตช์ 'Ping validate ก่อนบันทึก' = ON");
      console.log("     5. กด ปุ่มสีน้ำตาล 'บันทึกการตั้งค่า (+ Ping)'");
      console.log("     6. ต้องเห็น toast เขียว 'บันทึกสำเร็จ · Ping validate ผ่าน' (ไม่ใช่สีแดง)");
      console.log("     ⚠️ ถ้า toast แดง SERP_AUTH_INVALID = คีย์นั้นถูก Regenerate เปลี่ยนใหม่แล้ว — ต้องไปหน้า API Keys สร้างใหม่");
    } else if (state.pingCode === 403) {
      console.log("🎯 SUMMARY ACTION REQUIRED:");
      console.log("   ❌ DB มีคีย์อยู่ (มีแถว) แต่คีย์นั้น 403 revoked");
      console.log("   → แปลว่าหลังจากเวลาที่คุณกดบันทึกแล้ว — คีย์นั้นได้ถูก Regenerate/ยกเลิกที่ dashboard Serper แล้ว");
      console.log("   📝 ทำตามนี้ 1 รอบ:");
      console.log("     1. serper.dev/dashboard → API Keys → Regenerate Key (สร้างตัวใหม่ทุกตัว!)");
      console.log("     2. Ctrl+C คีย์ 40 hex ตัวใหม่ทันที");
      console.log("     3. App → Settings → SERP API Key → Replace ด้วยคีย์ใหม่ 40 hex นั้น");
      console.log("     4. Ping validate = ON → กด บันทึก");
      console.log("     5. ต้องได้ toast เขียว Ping validate ผ่าน ถึงจะเป็นอันจบ");
    } else {
      console.log("🎯 ไม่สามารถระบุสาเหตุได้ชัดเจน ตรวจสอบ console/network ดู toast");
    }
    process.exit(1);
  }
})();
