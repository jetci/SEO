import SSHClient from 'ssh2-promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const CFG = {
  host: '35.231.230.218',
  username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt',
  port: 22,
  readyTimeout: 30000,
  keepaliveInterval: 8000,
};

async function main() {
  const ssh = new SSHClient(CFG);
  try {
    await ssh.connect();
    console.log('[SSH] Connected');

    // GUARD: Check pid0=1287 BEFORE ops
    const jlistBefore = JSON.parse(await ssh.exec('pm2 jlist'));
    const v1 = jlistBefore.find(p => p.name === 'eeat-studio');
    if (!v1 || String(v1.pid) !== '1287') {
      console.error(`[GUARD FAIL] V1 pid = ${v1?.pid} !== 1287! ABORT`);
      process.exit(99);
    }
    console.log(`[GUARD 1/2 PASS] V1 pid=${v1.pid} name=${v1.name}`);

    // Fetch V2 error log tail 100 lines
    console.log('\n========== V2 ERROR LOG (last 150 lines) ==========');
    try {
      const errLog = await ssh.exec('tail -n 150 /home/ubuntu/.pm2/logs/eeat-studio-v2-error.log');
      console.log(errLog);
    } catch(e) {
      console.log('Error log not accessible:', String(e).slice(0,200));
    }

    // Fetch V2 out log tail 150 lines  
    console.log('\n========== V2 OUT LOG (last 150 lines) ==========');
    try {
      const outLog = await ssh.exec('tail -n 150 /home/ubuntu/.pm2/logs/eeat-studio-v2-out.log');
      console.log(outLog);
    } catch(e) {
      console.log('Out log not accessible:', String(e).slice(0,200));
    }

    // Check V2 health
    console.log('\n========== HEALTH CHECK :3002 ==========');
    try {
      const health = await ssh.exec('curl -s http://localhost:3002/api/health 2>&1 | head -c 500');
      console.log(health);
    } catch(e) {
      console.log('Health fail:', String(e).slice(0,200));
    }

    // GUARD AFTER
    const jlistAfter = JSON.parse(await ssh.exec('pm2 jlist'));
    const v1after = jlistAfter.find(p => p.name === 'eeat-studio');
    if (!v1after || String(v1after.pid) !== '1287') {
      console.error(`\n[GUARD 2/2 FAIL] V1 AFTER pid = ${v1after?.pid} !== 1287!`);
    } else {
      console.log(`\n[GUARD 2/2 PASS] V1 AFTER pid=${v1after.pid} UNTOUCHED`);
    }

  } catch (e) {
    console.error('[ERROR]', e);
  } finally {
    await ssh.close();
  }
}
main();
