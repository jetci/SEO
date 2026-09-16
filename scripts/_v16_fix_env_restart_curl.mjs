import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "=== (1) Show current V2 .env before append ==="
ls -la .env 2>&1 || echo ".env NOT EXISTS"
wc -l .env 2>&1
cat .env 2>&1 | tail -n 25
echo ""
echo "=== (2) APPEND 2 DEMO SIGNIN ENV VARS to V2 .env ==="
# Append only if not already present
if ! grep -q ALLOW_PROD_DEMO_SIGNIN .env 2>/dev/null; then
  echo "" >> .env
  echo "# v16 Demo Prod Signin Password Gate" >> .env
  echo "ALLOW_PROD_DEMO_SIGNIN=1" >> .env
  echo "PROD_DEMO_SIGNIN_PASSWORD=K9XmPq4Rtv2ZB8Lw3N!7C" >> .env
  echo "APPENDED (was missing)"
else
  # Already present but possibly wrong value - replace lines
  sed -i "s/^ALLOW_PROD_DEMO_SIGNIN=.*/ALLOW_PROD_DEMO_SIGNIN=1/" .env
  sed -i "s|^PROD_DEMO_SIGNIN_PASSWORD=.*|PROD_DEMO_SIGNIN_PASSWORD=K9XmPq4Rtv2ZB8Lw3N!7C|" .env
  echo "UPDATED existing lines via sed"
fi
echo ""
echo "=== (3) V2 .env after append tail ==="
cat .env 2>&1 | tail -n 10
echo ""
echo "=== (4) Verify env var lines EXACTLY ==="
grep -nE "ALLOW_PROD_DEMO|PROD_DEMO_SIGNIN_PASSWORD" .env 2>&1
echo ""
echo "=== (5) Add DEBUG dump: pre-Zod value of password from raw req in auth.ts (now first verify input object shape by adding dump at mutation start). Actually first fix ENV and restart to test again first ==="
echo ""
echo "=== (6) PM2 restart eeat-studio-v2 ONLY ==="
pm2 flush eeat-studio-v2 >/dev/null 2>&1
pm2 restart eeat-studio-v2 2>&1 | tail -n 3
sleep 10
echo ""
echo "=== (7) PM2 list after restart ==="
pm2 list 2>&1 | grep eeat
echo ""
echo "=== (8) curl auth.devSignin with password payload again ==="
curl -s -D /tmp/_hdr.txt -X POST http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1 \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/_v162_body.json 2>&1 | head -c 700
echo ""
echo "HTTP status:"
head -n 1 /tmp/_hdr.txt
echo ""
echo "=== (9) PM2 v2 err logs 45 lines AFTER curl ==="
pm2 logs eeat-studio-v2 --nostream --lines 45 --err 2>&1 | tail -n 50
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
