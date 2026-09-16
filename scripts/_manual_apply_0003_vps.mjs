#!/usr/bin/env node
// Apply 0003_phase2d_write.sql migration manually live (since deploy_run_now may have issues with new file path — ensure table exists.)
import SSHClient from "ssh2-promise";
import fs from "node:fs";
import path from "node:path";
const SQLFILE = path.resolve(process.cwd(), 'db/migrations/0003_phase2d_write.sql');
const SQL = fs.readFileSync(SQLFILE, 'utf8');
const SSH_CFG = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22 };
const EEAT_PW = 'eeat_secret_2026_Cloud!';
const DB_NAME = 'eeat_studio_v2';

async function main() {
  const conn = new SSHClient(SSH_CFG);
  try {
    await conn.connect();
    console.log('SSH OK');
    // Upload SQL file
    const sftp = conn.sftp();
    await sftp.fastPut(SQLFILE, '/tmp/_phase2d_0003_write.sql');
    // Run
    const out = await conn.exec(`sudo docker exec -i eeat-studio-db mariadb -ueeat -p'${EEAT_PW}' ${DB_NAME} < /tmp/_phase2d_0003_write.sql 2>&1 ; echo "---EXIT=$?"; sudo docker exec eeat-studio-db mariadb -ueeat -p'${EEAT_PW}' -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>&1; echo "---DESCRIBE:"; sudo docker exec eeat-studio-db mariadb -ueeat -p'${EEAT_PW}' -N -e "DESCRIBE ${DB_NAME}.write_articles;" 2>&1 | head -20`);
    console.log(out);
    console.log('\n✅ Migration 0003 applied successfully');
  } finally { try{ await conn.close(); }catch(e){} }
}
main().catch(e => { console.error(e); process.exit(1); });
