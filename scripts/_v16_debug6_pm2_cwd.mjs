import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
echo "--- PM2 describe eeat-studio-v2 cwd / exec cwd ---"
/usr/bin/pm2 show eeat-studio-v2 2>&1 | grep -iE "exec cwd|cwd|script path|node args|interpreter" | head -n 20

PID=$(/usr/bin/pm2 pid eeat-studio-v2 2>/dev/null)
echo ""
echo "--- PID $PID PROCESS CWD via /proc ---"
readlink -f /proc/$PID/cwd 2>/dev/null || ls -la /proc/$PID/cwd 2>/dev/null
echo ""
echo "--- .env file existence from that cwd path ---"
CWD_VAR=$(readlink -f /proc/$PID/cwd 2>/dev/null)
echo "  Process CWD=$CWD_VAR"
if [ -n "$CWD_VAR" ] && [ -f "$CWD_VAR/.env" ]; then
  echo "  .env EXISTS in process CWD! File size:"
  ls -la "$CWD_VAR/.env"
  echo "  Last 4 lines of CWD/.env:"
  tail -n 4 "$CWD_VAR/.env"
else
  echo "  .env DOES NOT EXIST in process CWD!"
  echo "  Actual .env file location /home/ubuntu/eeat-studio-v2/.env exists:"
  ls -la /home/ubuntu/eeat-studio-v2/.env
fi

echo ""
echo "--- Process env vars (NODE_PWD etc.) via /proc/$PID/environ ---"
tr "\\0" "\\n" < /proc/$PID/environ 2>/dev/null | grep -iE "PWD|PATH|NODE" | head -n 10 | sort
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
