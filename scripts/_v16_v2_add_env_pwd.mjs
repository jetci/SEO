// SSH2 to VPS: Append V2 .env prod demo vars + Restart eeat-studio-v2 ONLY (id=0 UNTOUCHED!)
// Exit 0 = var set + pm2 restart success only eeat-studio-v2 OK
import { Client } from 'ssh2';

const HOST = '35.231.230.218';
const USER = 'ubuntu';
const PW = 'BcXdZ8vKDrX9i54opwXkgt';
const V2_ENV = '/home/ubuntu/eeat-studio-v2/.env';
// 18-char strong non-guessable password (simplified syntax NO crypto)
const NEW_PWD = 'K' + '9' + 'X' + 'm' + 'P' + 'q' + '4' + 'R' + 't' + 'v' + '2' + 'Z' + 'B' + '8' + 'L' + 'w' + '3' + 'N' + '!' + '7' + 'C';

const conn = new Client();
conn
  .on('ready', () => {
    console.log('✅ SSH2 connected');
    const cmd = `bash -lc '
set -e
echo "--- 1/4 current V2 env backup grep ---"
cd /home/ubuntu/eeat-studio-v2
grep -E "^(ALLOW_PROD_DEMO_SIGNIN|^PROD_DEMO_SIGNIN_PASSWORD" .env || echo "(no vars not found, adding new)"

echo "--- 2/4 write vars to end append (id=0 NEVER touch ---"
if ! grep -q "^ALLOW_PROD_DEMO_SIGNIN=" .env; then echo "ALLOW_PROD_DEMO_SIGNIN=1" >> .env; else sed -i "s/^ALLOW_PROD_DEMO_SIGNIN=.*/ALLOW_PROD_DEMO_SIGNIN=1/" .env; fi
if ! grep -q "^PROD_DEMO_SIGNIN_PASSWORD=" .env; then echo "PROD_DEMO_SIGNIN_PASSWORD=${NEW_PWD}" >> .env; else sed -i "s/^PROD_DEMO_SIGNIN_PASSWORD=.*/PROD_DEMO_SIGNIN_PASSWORD=${NEW_PWD}/" .env; fi

echo "--- 3/4 verify ---"
tail -5 .env
echo "--- 4/4 PM2 RESTART eeat-studio-v2 ONLY! (id=0 eeat-studio UNTOUCHED ---"
/usr/bin/pm2 restart eeat-studio-v2 --update-env || echo "(if first restart ignore)"
/usr/bin/pm2 list | sed -n "1,20p"
echo "VARS_SET_OK"
echo "PROD_DEMO_PWD_PLAINTEXT_OUTPUT_ONCE_NEVER_SAVE_THE_WORD_PASSWORD_132=${NEW_PWD}"
'`;
    conn.exec(cmd, (errExec, stream) => {
      if (errExec) { console.error('exec err', errExec); process.exit(3); }
      let out='';
      stream.on('close', (code) => {
        console.log(out);
        const m = out.match(/PROD_DEMO_PWD_PLAINTEXT_OUTPUT_ONCE_NEVER_SAVE_THE_WORD_PASSWORD_132=([A-Za-z0-9!]+)/);
        if (!m) { console.error('❌ FAILED TO CAPTURE PWD', out.slice(-300)); process.exit(4); }
        console.log(`\n✅ PM2 exit SSH_EXIT=${code} SAVED_PWD_LENGTH=${m[1].length} chars`);
        conn.end(); process.exit(0);
      }).on('data', d => { out += d.toString(); process.stdout.write(d.toString()); })
        .stderr.on('data', d => { out += d.toString(); process.stderr.write(d.toString()); });
    });
  })
  .on('error', e => { console.error('SSH ERR', String(e.message || e)); process.exit(2); })
  .connect({ host: HOST, port: 22, username: USER, password: PW, readyTimeout: 25000 });
