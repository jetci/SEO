import SSHClient from "ssh2-promise";
import fs from "fs";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
(async()=>{
  await ssh.connect();
  const remoteWc = parseInt((await ssh.exec("wc -c < /home/ubuntu/eeat-studio-v2/server/services/articleWriterService.ts")).toString().trim());
  const localWc = fs.statSync("d:/AEO/SEO V2/server/services/articleWriterService.ts").size;
  // grep variant arrays on BOTH for comparison: Howto_V5 unique string "checklist ย่อย 10 ประการ" or "ช่วง 9:00-11:00"
  const localContent = fs.readFileSync("d:/AEO/SEO V2/server/services/articleWriterService.ts","utf8");
  const localGrepChecklist = (localContent.match(/checklist ย่อย 10 ประการ/g)||[]).length;
  const localGrep9 = (localContent.match(/ช่วง 9:00-11:00/g)||[]).length;
  const list = []; await ssh.sftp().fastGet("/home/ubuntu/eeat-studio-v2/server/services/articleWriterService.ts", "d:/AEO/SEO V2/.cache_vps_builder_now.ts").catch(e=>list.push(e.message));
  const vpsContent = fs.readFileSync("d:/AEO/SEO V2/.cache_vps_builder_now.ts","utf8");
  const remoteGrep9 = (vpsContent.match(/ช่วง 9:00-11:00/g)||[]).length;
  const remoteGrepPct80 = (vpsContent.match(/80% percentile/g)||[]).length;
  const remoteGrepChecklistLocal = (vpsContent.match(/checklist ย่อย 10 ประการ/g)||[]).length;
  const remoteGrepVariant = (vpsContent.match(/DEF_V|HOWTO_V|CAUSE_V|COMPARE_V|SUMMARY_V|OTHER_V/g)||[]).length;
  const remoteGrepOLDkiTemplate = (vpsContent.match(/ในระบบการทำงานมาตรฐานของกลุ่มตัวอย่างขนาด 2,100 กรณี ผลลัพธ์ที่ดีที่สุด เกิดจากการแบ่งงานย่อยนี้ออกเป็นส่วนเล็กๆ แล้วทำทีละส่วน/g)||[]).length;
  console.log("LOCAL_WC=%d REMOTE_WC=%d MATCH=%s", localWc, remoteWc, localWc===remoteWc?"YES✅":"NO❌ DIFF="+(localWc-remoteWc));
  console.log("LOCAL_CHECKLIST=%s LOCAL_9AM=%d | REMOTE_VPS: Variants_DEF+HOWTO+.._ARRAY_DECL=%d · 9:00-11:00 V2=%d · 80%%percentile V1=%d · checklist10 V3=%d · OLD DUPLICATE 2100 STATIC KI TEMPLATE COUNT=%d", localGrepChecklist, localGrep9, remoteGrepVariant, remoteGrep9, remoteGrepPct80, remoteGrepChecklistLocal, remoteGrepOLDkiTemplate);
  // pm2 guard
  const j = JSON.parse(await ssh.exec("pm2 jlist"));
  const v1 = j.find(p=>p.pm_id===0);
  console.log("GUARD PM2 id=0 name=%s pid=%s status=%s uptime=%dd pid175437=%s", v1.name, v1.pid, v1.pm2_env.status, Math.floor((Date.now()-v1.pm2_env.pm_uptime)/86400000), v1.pid===175437?"SAFE":"VIOL");
  await ssh.close();
  process.exit(localWc===remoteWc && remoteGrepVariant>=5 ? 0 : 11);
})().catch(e=>{console.error(e);process.exit(1)});
