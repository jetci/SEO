import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
pm2 flush eeat-studio-v2 >/dev/null 2>&1
# Write 5 different TRULY VALID JSON files via PYTHON to avoid bash escaping!
python3 << "PYEOF"
import json
# TEST 1: OLD batch with openId NOT default (prove defaults all used)
t1 = {"0": {"json": {"openId": "TEST-12345-NOT-DEFAULT", "name": "Alice Real Name", "email": "real_alice@foo.com", "role": "admin", "password": "REAL_PWD_12345"}}}
with open("/tmp/_f1.json","w") as f: json.dump(t1, f)
# TEST 2: tRPC v10 BATCH with input wrapper
t2 = {"0": {"input": {"json": {"openId": "TEST-12345-NOT-DEFAULT", "name": "Bob Real", "email": "bob@foo.com", "role": "admin", "password": "REAL_PWD_67890"}}}}
with open("/tmp/_f2.json","w") as f: json.dump(t2, f)
# TEST 3: Non-batch with trpc input wrapper?
t3 = {"input": {"json": {"openId": "TEST-12345-NOT-DEFAULT", "name": "Carol Real", "email": "carol@foo.com", "role": "admin", "password": "REAL_PWD_CAROL99"}}}
with open("/tmp/_f3.json","w") as f: json.dump(t3, f)
# TEST 4: BATCH queries array format (some tRPC versions)
t4 = {"queries": [{"path": "auth.devSignin", "input": {"openId": "TEST-12345-NOT-DEFAULT", "name": "Dan Real", "email": "dan@foo.com", "role": "admin", "password": "REAL_PWD_DAN88"}}]}
with open("/tmp/_f4.json","w") as f: json.dump(t4, f)
# TEST 5: Non-batch plain direct input (old format without json wrapper)
t5 = {"openId": "TEST-12345-NOT-DEFAULT", "name": "Eve Real", "email": "eve@foo.com", "role": "admin", "password": "REAL_PWD_EVE77"}
with open("/tmp/_f5.json","w") as f: json.dump(t5, f)
print("JSON files written OK")
PYEOF
echo "--- Verify files are valid JSON ---"
for i in 1 2 3 4 5; do echo "--- File $i ---"; python3 -c "import json; d=json.load(open(\"/tmp/_f$i.json\")); print(json.dumps(d))"; done
echo ""
echo "--- RUN 5 CURL TESTS ---"
for i in 1 2; do
  echo ""
  echo "=========== TEST $i BATCH=1 ==========="
  curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
    -H "Content-Type: application/json" -H "Accept: application/json" \
    --data-binary @/tmp/_f$i.json 2>&1 | head -c 500
  echo ""
  sleep 2
done
echo ""
echo "=========== TEST 3 NON-BATCH input wrapper ==========="
curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin" \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  --data-binary @/tmp/_f3.json 2>&1 | head -c 500
echo ""
sleep 2
echo "=========== TEST 4 NON-BATCH queries array ==========="
curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin" \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  --data-binary @/tmp/_f4.json 2>&1 | head -c 500
echo ""
sleep 2
echo "=========== TEST 5 NON-BATCH plain input ==========="
curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin" \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  --data-binary @/tmp/_f5.json 2>&1 | head -c 500
echo ""
sleep 2
echo ""
echo "=========== PM2 ERR logs 60 lines ==========="
pm2 logs eeat-studio-v2 --nostream --lines 60 --err 2>&1 | tail -n 70
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
