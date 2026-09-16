import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
const run = (c) => ssh.exec(c).then(r => r.toString().trim());

(async()=>{
  await ssh.connect();
  const containerId = (await run("docker ps --format '{{.ID}} {{.Names}}' | grep eeat-studio-db | awk '{print $1}'")).trim();
  console.log("[DB container id]:", containerId);

  function mariadb(sql) {
    // Pipe SQL into docker exec stdin via heredoc, no file needed.
    const pwd = 'eeat_secret_2026_Cloud!';
    const db = 'eeat_studio_v2';
    const inner = `mariadb --default-character-set=utf8mb4 -N -B -ueeat -p'${pwd}' ${db}`;
    // Use sh -lc with heredoc nested
    const big = `docker exec -i ${containerId} sh -lc '${inner}' <<'SQL_EOF'\n${sql}\nSQL_EOF`;
    return run(big);
  }

  console.log("[0] DB PORT TEST (what listens inside docker container?):", await run(`docker exec ${containerId} sh -lc "ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null || (cat /etc/mysql/my.cnf 2>/dev/null; cat /etc/my.cnf.d/*.cnf 2>/dev/null)" | head -c 800`));

  console.log("[1] write_articles rows:", await mariadb("SELECT COUNT(*) FROM write_articles;"));
  const ALL_16_BANNED_LIKE = [
    `%(Definition)%`,
    `%(Why / Causes)%`,
    `%(How-to Guide)%`,
    `%(Comparison / Case Study)%`,
    `%(Key Takeaways)%`,
    `%(ปิดท้ายบทความ)%`,
    `%ขั้นตอน 1-3: เตรียมความพร้อม%`,
    `%เตรียมความพร้อม → ดำเนินการ → ตรวจสอบผลลัพธ์%`,
    `%ข้อผิดพลาดที่พบบ่อย%`,
    `%คำจำกัดความและประเภทของ%`,
    `%คืออะไร? — บทนำและบริบท%`,
    `%สาเหตุและปัจจัยสำคัญของ%`,
    `%วิธีทำ / คู่มือปฏิบัติ%`,
    `%กับทางเลือกอื่น%`,
    `%แหล่งอ้างอิงและข้อมูลยืนยัน%`,
    `%สรุปและคำแนะนำที่สำคัญ%`,
  ].map(p => `outline_json LIKE '${p}'`).join(' OR ');
  const CNT_SQL = `SELECT COUNT(*) FROM write_articles WHERE outline_json IS NOT NULL AND (${ALL_16_BANNED_LIKE});`;
  const UPD_SQL = `UPDATE write_articles SET outline_json = NULL, updated_at = NOW() WHERE outline_json IS NOT NULL AND (${ALL_16_BANNED_LIKE});`;
  console.log("[2] BEFORE generic count 16 patterns:", await mariadb(CNT_SQL));
  console.log("[3] PURGE RUN 16 patterns:", await mariadb(UPD_SQL));
  console.log("[4] AFTER generic count 16 patterns:", await mariadb(CNT_SQL));
  // BONUS: แสดงรายการ article IDs ที่เคยมี Outline Generic (หลังจาก set NULL แล้ว ไม่เกิดผลเสีย)
  console.log("[5] BONUS: list article IDs after purge where writeStep>=2 updated_at NOW (recent rows):", await mariadb(`SELECT article_id, writeStep, CHAR_LENGTH(COALESCE(outline_json,'')) as outline_len FROM write_articles WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR) ORDER BY updated_at DESC LIMIT 20;`));
  await ssh.close();
})().catch(e=>{console.error('ERR',e);process.exit(99)});
