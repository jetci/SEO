import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== 1. Find appRouter file location (grep createCaller earlier script files found) ==="
find . -maxdepth 4 -type f \\( -name "*.ts" -o -name "*.tsx" \\) | xargs grep -l "appRouter" 2>/dev/null | head -n 10
echo ""
echo "=== 2. List server/ dir ==="
ls -la server/ 2>/dev/null
echo ""
echo "=== 3. List server/routers ==="
ls -la server/routers/ 2>/dev/null
echo ""
echo "=== 4. Find all .ts files that export appRouter ==="
grep -rln "export.*appRouter\\|^ *appRouter *= *" server client 2>/dev/null | head -n 5
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
