import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== 1. /tmp/_good_body.json EXACT content (cat) ==="
cat /tmp/_good_body.json 2>/dev/null | head -c 500 || echo "(MISSING file!)"
echo ""
echo "=== 2. GREP auth.ts deployed: Lines around devSignin INPUT SCHEMA z.object for password field ==="
grep -n -A 12 "devSignin.*publicProcedure\\|publicProcedure.*devSignin" server/auth.ts | head -n 30
echo ""
echo "=== 3. GREP auth.ts deployed: Single line password in schema: ==="
grep -n "password.*z.string\\|z.string.*password" server/auth.ts | head -n 10
echo ""
echo "=== 4. GREP auth.ts deployed: devSignin .input ==="
sed -n "/devSignin/,/mutation/p" server/auth.ts | head -n 25
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
