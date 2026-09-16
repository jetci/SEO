// Upload + Run _sim_v15_outline.ts on VPS via SSH2 (same auth pattern as deploy_run_now.mjs)
// Exit 0 only if 8 assertions PASS
import { readFileSync } from 'node:fs';
import { Client } from 'ssh2';

const HOST = '35.231.230.218';
const USER = 'ubuntu';
const PW = 'BcXdZ8vKDrX9i54opwXkgt';
const LOCAL_SCRIPT = String(process.argv[2] || 'scripts/_sim_v15_outline.ts').replace(/\\/g, '/');
const REMOTE = '/home/ubuntu/eeat-studio-v2/tmp/_sim_v15_outline.ts';

const conn = new Client();
conn
  .on('ready', () => {
    console.log('✅ SSH connected (ssh2 password auth) — uploading sim script');
    conn.sftp((errSftp, sftp) => {
      if (errSftp) { console.error('❌ SFTP err', errSftp); process.exit(3); }
      sftp.fastPut(LOCAL_SCRIPT, REMOTE, (errPut) => {
        if (errPut) { console.error('❌ fastPut err', errPut); process.exit(4); }
        sftp.end();
        console.log('✅ Upload OK. Running tsx sim with .env loaded...');
        console.log('=================================================================');
        const execCmd = `bash -lc 'set -a; cd /home/ubuntu/eeat-studio-v2 && source .env && set +a && ./node_modules/.bin/tsx tmp/_sim_v15_outline.ts 2>&1; echo V15_SCRIPT_RC=$?' 2>&1`;
        conn.exec(execCmd, (errExec, stream) => {
          if (errExec) { console.error('❌ exec err', errExec); process.exit(5); }
          let out = '';
          stream.on('close', (code, signal) => {
            console.log('=================================================================');
            const rcMatch = out.match(/V15_SCRIPT_RC=(\d+)/);
            const rc = rcMatch ? parseInt(rcMatch[1], 10) : (code ?? 99);
            console.log(`\n[FINAL] SSH_EXIT=${code} SIGNAL=${signal} SCRIPT_RC=${rc} (SCRIPT_RC=0 means 8/8 assertions PASS)`);
            conn.end();
            process.exit(Number.isFinite(rc) && rc >= 0 ? rc : 99);
          }).on('data', (d) => { out += d.toString(); process.stdout.write(d.toString()); })
            .stderr.on('data', (d) => { out += d.toString(); process.stderr.write(d.toString()); });
        });
      });
    });
  })
  .on('error', (e) => { console.error('❌ SSH2 error', String(e.message || e)); process.exit(2); })
  .connect({ host: HOST, port: 22, username: USER, password: PW, readyTimeout: 30_000 });
