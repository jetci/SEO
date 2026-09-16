import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== PM2 flush logs ==="
pm2 flush eeat-studio-v2 2>&1 | tail -n 2
echo "=== PM2 restart eeat-studio-v2 id=92 ONLY ==="
pm2 restart eeat-studio-v2 2>&1 | tail -n 5
sleep 8
echo "=== PM2 list v2 status ==="
pm2 list 2>&1 | grep eeat
echo "=== curl signin test POST batch ==="
BODY_JSON_FILE=/tmp/_v162_body.json
cat > $BODY_JSON_FILE << "ENDOFBODY"
{"0":{"json":{"openId":"102308593207118714314","name":"Admin Intelman","email":"intelman26@gmail.com","role":"admin","avatarUrl":"https://i.pravatar.cc/128?img=1","password":"K9XmPq4Rtv2ZB8Lw3N!7C"}}}
ENDOFBODY
echo "curl body file:"
wc -c $BODY_JSON_FILE
echo "---"
cat $BODY_JSON_FILE
echo ""
echo "--- curl run: ---"
RESP=$(curl -s -X POST http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1 \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -D /tmp/_v162_resp_hdr.txt \
  --data-binary @$BODY_JSON_FILE 2>&1)
echo "HTTP RESPONSE HEADERS:"
cat /tmp/_v162_resp_hdr.txt
echo ""
echo "HTTP BODY:"
echo $RESP
echo ""
echo "=== PM2 error logs tail 40 lines AFTER curl ==="
pm2 logs eeat-studio-v2 --nostream --lines 40 --err 2>&1 | tail -n 50
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
