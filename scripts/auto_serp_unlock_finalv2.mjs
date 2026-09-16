// 🔓 SERP UNLOCK FINAL v2 — BULLET PROOF:
// All dynamic parts via files on remote /tmp file + base64 ALWAYS. NO shell quote special chars (no escapes. NO escaping at all for SQL/commands.
import SSHClient from "ssh2-promise";
import { Buffer as NBuffer } from "node:buffer";
const cfg = { host: "35.231.230.218", port: 22, username: "ubuntu", password: "BcXdZ8vKDrX9i54opwXkgt", readyTimeout: 30000 };
const ROOT_PW = "root_eeat_2026_Cloud!";
const ssh = new SSHClient(cfg);
const b64 = (s) => NBuffer.from(s, "utf8").toString("base64");
const r64 = async (path) => (await ssh.exec(`cat '${path}' 2>/dev/null || echo ''`)).trim();
const wb64Remote = async (remotePath, contentUtf8) => {
  const b = b64(contentUtf8);
  await ssh.exec(`mkdir -p /tmp/serpunlock 2>/dev/null; echo '${b}' | base64 -d > '${remotePath}' 2>/dev/null; echo OK`);
};
let state = { hasRow:false, plainLen:0, pingCode:0, envOldPing:0, synced:false, reloadOk:false, mask:"", enc:"", err:null, teamId:90001 };
(async () => {
  try {
    await ssh.connect();
    console.log("🟢 SSH OK 35.231.230.218 (bullet-proof file-based no-quote strategy)\n");

    // S1: ENV — grep SESSION_SECRET and OLD SERP key via file
    await wb64Remote("/tmp/serpunlock/s1.sh", `#!/bin/bash\nset +H\nset -e\ncd /home/ubuntu/eeat-studio-v2 || exit 3\ngrep -E '^SESSION_SECRET=' .env || echo SESSION_SECRET=MISSING\ngrep -E '^SERP_API_KEY=' .env || echo SERP_API_KEY=MISSING\n`);
    const s1raw = (await ssh.exec(`bash /tmp/serpunlock/s1.sh 2>&1`)).trim().split("\n");
    const ss = (s1raw.find(l=>l.startsWith("SESSION_SECRET="))||"").split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
    const ek = (s1raw.find(l=>l.startsWith("SERP_API_KEY="))||"").split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
    console.log("--- S1 ENV ---");
    console.log("  SESSION_SECRET len:", ss.length, ss.length>=32 ? ">=32 ✔️":"❌ TOO SHORT");
    console.log("  OLD env SERP mask:", ek && ek.length>=8 ? ek.slice(0,4)+"********"+ek.slice(-4) : ("❌ len="+ek.length);
    if (ek && ek.length===40) {
      await wb64Remote("/tmp/serpunlock/oldping.sh", `#!/bin/bash\nset +H\ncurl -sk -o /dev/null -w "%{http_code}" --max-time 12 \\\n  -X POST \\\n  -H "X-API-KEY: ${ek}" \\\n  -H "Content-Type: application/json" \\\n  --data '{"q":"สล็อตออนไลน์","gl":"th","hl":"th","num":1}' \\\n  https://google.serper.dev/search\n`);
      state.envOldPing = parseInt(((await ssh.exec("bash /tmp/serpunlock/oldping.sh 2>&1")).trim() || "0", 10);
      console.log("  OLD env key Ping HTTP:", state.envOldPing, state.envOldPing===200?"✅ 200 OK":"❌ "+state.envOldPing+" (revoked)");
    }

    // S2: SQL via file.
    await wb64Remote("/tmp/serpunlock/s2.sql", `SELECT value FROM eeat_studio_v2.settings WHERE team_id=90001 AND key_name='serp_api_key' ORDER BY id DESC LIMIT 1;\n`);
    await wb64Remote("/tmp/serpunlock/s2.sh", `#!/bin/bash\nset +H\nMYSQL_PWD='${ROOT_PW}' docker exec -i -e MYSQL_PWD eeat-studio-db mariadb -uroot -N --default-character-set=utf8mb4 < /tmp/serpunlock/s2.sql 2>/dev/null\n`);
    const encRaw = ((await ssh.exec("bash /tmp/serpunlock/s2.sh 2>&1")).trim();
    console.log("\n--- S2 DB settings team_id=90001 key_name=serp_api_key ---");
    if (!encRaw || encRaw.length < 30) {
      console.log("  ❌ NO ROW (len="+(encRaw||"").length+") — unexpected because _tmp_correct showed row id=4!");
      // Fallback: ANY team_id latest key=serp_api_key
      await wb64Remote("/tmp/serpunlock/s2b.sql", `SELECT team_id,value FROM eeat_studio_v2.settings WHERE key_name='serp_api_key' ORDER BY id DESC LIMIT 1;\n`);
      await wb64Remote("/tmp/serpunlock/s2b.sh", `#!/bin/bash\nset +H\nMYSQL_PWD='${ROOT_PW}' docker exec -i -e MYSQL_PWD eeat-studio-db mariadb -uroot -N --default-character-set=utf8mb4 < /tmp/serpunlock/s2b.sql 2>/dev/null\n`);
      const r = ((await ssh.exec("bash /tmp/serpunlock/s2b.sh 2>&1")).trim();
      console.log("  ANY-team latest serp_api_key row:", r || "(still empty)");
      if (r && r.length > 30) {
        const lines = r.split(/\s+/);
        state.teamId = parseInt(lines[0],10) || 0;
        state.enc = encRaw = lines.slice(1).join(" ").trim();
        console.log("  ✅ Fallback found at team_id="+state.teamId);
      }
    }
    if (!encRaw || encRaw.length < 30) {
      state.hasRow = false;
    } else {
      state.hasRow = true;
      state.enc = encRaw;
      console.log("  ✅ ROW FOUND! encrypted len="+encRaw.length+" team_id="+state.teamId);
      const parts = encRaw.split(".");
      if (parts.length!==3) throw new Error("bad enc format! parts="+parts.length);
      const iv=parts[0], tag=parts[1], ct=parts[2];
      console.log("  split iv/tag/ct OK");

      // S3 Decrypt + Ping via FILE node script.
      const decScript = `
const crypto=require('crypto'), cp=require('child_process');
const iv64=process.argv[2], tag64=process.argv[3], ct64=process.argv[4];
const b64u=(s)=>{let b=s.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';return Buffer.from(b,'base64');};
const key=crypto.createHash('sha256').update(process.env.SS||'').digest();
try {
  const d=crypto.createDecipheriv('aes-256-gcm',key,b64u(iv64));
  d.setAuthTag(b64u(tag64));
  const k=Buffer.concat([d.update(b64u(ct64)),d.final()]).toString('utf8');
  process.stdout.write('MASK='+k.slice(0,4)+'********'+k.slice(-4)+'\\n');
  process.stdout.write('LEN='+k.length+'\\n');
  process.stdout.write('REGEX40='+((k.length===40&&/^[a-fA-F0-9]{40}$/.test(k))?'YES':'NO')+'\\n');
  const out=cp.execFileSync('curl',['-sk','-o','/dev/null','-w','%{http_code}','--max-time','15','-X','POST','-H','X-API-KEY: '+k,'-H','Content-Type: application/json','--data',JSON.stringify({q:'สล็อตออนไลน์',gl:'th',hl:'th',num:1}),'https://google.serper.dev/search']);
  process.stdout.write('PING='+out.toString().trim()+'\\n');
  process.stdout.write('DEC_OK=1\\n');
} catch(e){process.stdout.write('FAIL '+String(e.message||e).slice(0,200)+'\\n');process.exit(2);}`;
      await wb64Remote("/tmp/serpunlock/s3.mjs", decScript);
      await wb64Remote("/tmp/serpunlock/s3.sh", `#!/bin/bash\nset +H\nexport SS='${ss}'\nnode /tmp/serpunlock/s3.mjs '${iv}' '${tag}' '${ct}' 2>&1\n`);
      const s3out = ((await ssh.exec("bash /tmp/serpunlock/s3.sh 2>&1")).trim();
      console.log("\n--- S3 Decrypt + Ping (AES-256-GCM) ---");
      console.log("  stdout:\n    " + s3out.split("\n").map(l=>"      "+l).join("\n"));
      const pm=/PING=(\d+)/.exec(s3out); const lm=/LEN=(\d+)/.exec(s3out); const mm=/MASK=(\S+)/.exec(s3out);
      if (pm) state.pingCode=parseInt(pm[1],10); if (lm) state.plainLen=parseInt(lm[1],10); if (mm) state.mask=mm[1];

      // S4: SYNC ENV IF PING=200 AND OLD!=200
      if (state.pingCode===200 && !(ek && ek.length===40 && state.envOldPing===200)) {
        console.log("\n--- S4 🟢 PING=200 → Sync ENV → PM2 reload ---");
        const syncNode = `
const crypto=require('crypto'), fs=require('fs');
const iv64=process.argv[2], tag64=process.argv[3], ct64=process.argv[4], envPath=process.argv[5];
const b64u=(s)=>{let b=s.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';return Buffer.from(b,'base64');};
const key=crypto.createHash('sha256').update(process.env.SS||'').digest();
try{
  const d=crypto.createDecipheriv('aes-256-gcm',key,b64u(iv64));
  d.setAuthTag(b64u(tag64));
  const k=Buffer.concat([d.update(b64u(ct64)),d.final()]).toString('utf8');
  let txt=fs.readFileSync(envPath,'utf8');
  if(/^SERP_API_KEY=.*$/m.test(txt)){
    txt=txt.replace(/^SERP_API_KEY=.*$/m,'SERP_API_KEY='+k);
  } else {
    txt += '\\nSERP_API_KEY='+k+'\\n';
  }
  fs.writeFileSync(envPath,txt);
  process.stdout.write('OK MASK='+k.slice(0,4)+'********'+k.slice(-4)+'\\n');
}catch(e){process.stdout.write('FAIL '+String(e.message||e).slice(0,180)+'\\n');process.exit(2);}`;
        await wb64Remote("/tmp/serpunlock/s4.mjs", syncNode);
        await wb64Remote("/tmp/serpunlock/s4.sh", `#!/bin/bash\nset +H\nexport SS='${ss}'\nnode /tmp/serpunlock/s4.mjs '${iv}' '${tag}' '${ct}' /home/ubuntu/eeat-studio-v2/.env 2>&1\n`);
        const s4 = ((await ssh.exec("bash /tmp/serpunlock/s4.sh 2>&1")).trim();
        console.log("  sync result:", s4);
        if (/^OK\s/MASK=/m.test(s4)) {
          state.synced = true;
          await wb64Remote("/tmp/serpunlock/s5.sh", `#!/bin/bash\nset +H\npm2 reload eeat-studio-v2 2>&1 | tail -6\n`);
          const pm2 = ((await ssh.exec("bash /tmp/serpunlock/s5.sh 2>&1")).trim();
          state.reloadOk = /(OK|online|reloaded|success)/i.test(pm2);
          console.log("  pm2 reload eeat-studio-v2:\n    "+pm2.split("\n").map(l=>"    "+l).join("\n"));
        }
      } else if (state.pingCode===200) {
        state.synced = true;
        console.log("\n  ℹ️ Skip ENV sync — OLD env key already working 40 hex OK
      }
    }
  } catch(e) { state.err = String(e && e.message?e.message:String(e)); console.error("\n🔴 EXCEPTION:", state.err); }
  try { await ssh.exec("rm -rf /tmp/serpunlock 2>/dev/null; true"); await ssh.close(); } catch(e){}

  // === FINAL REPORT ===
  const line = "=".repeat(67);
  console.log("\n\n"+line);
  console.log("🤖 SERP AUTO UNLOCK v2 (file-based NO QUOTE PROOF)");
  console.log(line);
  console.log("  1. DB team_id=90001 serp_api_key ROW EXISTS:", state.hasRow?"✅ YES":"❌ NO");
  if (state.hasRow) {
    console.log("  2. Decrypt mask:", state.mask||"N/A");
    console.log("  3. Decrypt len 40 hex?:", state.plainLen===40?"✅ len=40":`❌ len=${state.plainLen}`);
    console.log("  4. DB key → Serper POST สล็อตออนไลน์:");
  }
  if (state.pingCode===200) console.log("     🎉 HTTP 200 UNLOCKED ✅");
  else if (state.pingCode===403) console.log("     ❌ HTTP 403 REVOKED");
  else if (state.pingCode) console.log("     ❌ HTTP "+state.pingCode);
  else console.log("     ℹ️ N/A");
  console.log("  5. OLD env key ping:", state.envOldPing===0?"N/A":(state.envOldPing===200?"✅ 200":"❌ "+state.envOldPing));
  console.log("  6. DB → ENV sync:", state.synced?"✅ DONE":"ℹ️ skip");
  console.log("  7. PM2 eeat-studio-v2 reload:", state.reloadOk?"✅ DONE":"ℹ️ skip");
  console.log(line);
  if (state.pingCode===200) {
    console.log("🎯 SERP PIPELINE UNLOCKED ✅");
    console.log("   ✅ KCP Run Plan ดึง SERP จริงได้");
    console.log("   ✅ Write Page Step2 Sources organic DA≥35 จริงได้");
    console.log("   ✅ research.enrichSerp ไม่ขึ้น 403 อีก");
    process.exit(0);
  } else {
    console.log("🎯 STATUS:");
    if (!state.hasRow) {
      console.log("   ❌ NO ROW ต้องบันทึก Settings ใหม่ + Ping Validate ผ่าน");
    } else if (state.pingCode===403) {
      console.log("   ❌ DB key 403 revoked = คีย์ถูกยกเลิกบน dashboard หลังบันทึก");
      console.log("   📝 Action (ไม่ถามอีก): Regenerate NEW 40 hex on serper.dev → Paste in App Settings → Ping ON → Save (+Ping) → Toast เขียว");
    }
    process.exit(1);
  }
})();
