import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  // Make 3 DIFFERENT curl body formats (A, B, C) and test each!
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
pm2 flush eeat-studio-v2 >/dev/null 2>&1
echo "=================== TEST A: NON-BATCH /api/trpc/auth.devSignin POST plain input json (new tRPC 10.x format) ==================="
echo \'{"openId":"102308593207118714314","name":"Admin Intelman","email":"intelman26@gmail.com","role":"admin","password":"K9XmPq4Rtv2ZB8Lw3N!7C"}\' > /tmp/_tA.json
cat /tmp/_tA.json
echo ""
curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/_tA.json 2>&1 | head -c 600
echo ""
sleep 2
echo "=================== TEST B: BATCH=1 with {0:{json:{}}} OLD FORMAT (we tried this) ==================="
echo \'{"0":{"json":{"openId":"102308593207118714314","name":"Admin Intelman","email":"intelman26@gmail.com","role":"admin","password":"K9XmPq4Rtv2ZB8Lw3N!7C"}}}\' > /tmp/_tB.json
curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/_tB.json 2>&1 | head -c 600
echo ""
sleep 2
echo "=================== TEST C: BATCH=1 with INPUT.WRAPPER {0:{input:{json:{}}}} NEWER FORMAT? ==================="
echo \'{"0":{"input":{"json":{"openId":"102308593207118714314","name":"Admin Intelman","email":"intelman26@gmail.com","role":"admin","password":"K9XmPq4Rtv2ZB8Lw3N!7C"}}}}\' > /tmp/_tC.json
curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/_tC.json 2>&1 | head -c 600
echo ""
sleep 2
echo "=================== PM2 err logs 60 lines ==================="
pm2 logs eeat-studio-v2 --nostream --lines 60 --err 2>&1 | tail -n 65
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
