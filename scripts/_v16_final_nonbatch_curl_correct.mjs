import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
pm2 flush eeat-studio-v2 >/dev/null 2>&1
# 1. Write VALID NON-BATCH PLAIN payload with correct ADMIN OPENID + REAL PASSWORD via Python!
python3 << "PYEOF"
import json
payload = {
  "openId": "102308593207118714314",
  "name": "Admin Intelman",
  "email": "intelman26@gmail.com",
  "role": "admin",
  "avatarUrl": "https://i.pravatar.cc/128?img=1",
  "password": "K9XmPq4Rtv2ZB8Lw3N!7C"
}
with open("/tmp/_good_nonbatch.json","w") as f:
  json.dump(payload, f)
print("Wrote /tmp/_good_nonbatch.json bytes:", len(json.dumps(payload).encode()))
PYEOF
echo "--- FILE ---"
cat /tmp/_good_nonbatch.json | python3 -m json.tool
echo ""
echo "--- VALID CURL NON-BATCH POST (no ?batch=1, NO wrapper!) ---"
RESP=$(curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin" \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -D /tmp/_resp_hdr.txt \
  --data-binary @/tmp/_good_nonbatch.json 2>&1)
echo "HTTP HEADERS:"
cat /tmp/_resp_hdr.txt
echo ""
echo "HTTP BODY:"
echo "$RESP" | head -c 800
echo ""
echo ""
echo "--- PM2 err logs 30 lines AFTER curl ---"
pm2 logs eeat-studio-v2 --nostream --lines 30 --err 2>&1 | tail -n 35
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
