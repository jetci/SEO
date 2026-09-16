import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
echo "--- 1. /tmp/_auth_body.json cat + python3 char dump (if exists) ---"
if [ -f /tmp/_auth_body.json ]; then
  cat /tmp/_auth_body.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(\">json keys:\", list(d.keys())); print(\">0.json:\", list(d[\"0\"].keys()) if \"0\" in d else \"NO 0 KEY\"); inner = d[\"0\"][\"json\"] if \"0\" in d and \"json\" in d[\"0\"] else None; print(\">inner keys:\", list(inner.keys()) if inner else \"NONE\"); print(\">PWD VALUE in json LEN=\", len(inner[\"password\"]) if inner and \"password\" in inner else \"N/A\", \"first4=\", inner[\"password\"][:4] if inner and \"password\" in inner else \"NONE\", \"last3=\", inner[\"password\"][-3:] if inner and \"password\" in inner else \"NONE\")" 2>&1 || cat /tmp/_auth_body.json | head -c 400
  echo ""
else
  echo "(File missing!)"
fi

echo ""
echo "--- 2. Create NEW CORRECT body with explicit password field and CAT it ---"
python3 << "PYEOF"
import json
body = {
  "0": {
    "json": {
      "openId": "102308593207118714314",
      "name": "Admin V2",
      "email": "intelman26@gmail.com",
      "role": "admin",
      "password": "${DEMO_PWD_VAR}"
    }
  }
}
with open('/tmp/_auth_body2.json','w') as f: json.dump(body, f)
print('/tmp/_auth_body2.json wrote')
print('content:', json.dumps(body)[:200])
PYEOF
# Shell variable replacement for python - replace manually:
echo "(DEMO_PWD=${DEMO_PWD})"
# Write via heredoc unquoted so expands correctly
cat > /tmp/_auth_body3.json << ENDJSON
{"0":{"json":{"openId":"102308593207118714314","name":"Admin V2","email":"intelman26@gmail.com","role":"admin","password":"${DEMO_PWD}"}}}
ENDJSON
echo "auth_body3:"
cat /tmp/_auth_body3.json
echo ""
echo "--- 3. curl NEW with body3 (known correct password filled) ---"
curl -s -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
  -H "Content-Type: application/json" \
  -H "Origin: https://thaiaeo.manus.host" \
  --data-binary @/tmp/_auth_body3.json -D /tmp/_curl_headers.txt
echo ""
echo "--- Response headers ---"
cat /tmp/_curl_headers.txt 2>/dev/null | grep -iE "set-cookie|HTTP" | head -n 4
echo "--- PM2 err log last 15 lines (show debug inputPWD len AFTER curl) ---"
sleep 1
/usr/bin/pm2 logs eeat-studio-v2 --nostream --lines 15 --err 2>&1
'`;
  // Substitute DEMO_PWD shell var inline manually
  conn.exec(CMD.replace(/\$\{DEMO_PWD\}/g, DEMO_PWD).replace(/\$\{DEMO_PWD_VAR\}/g, DEMO_PWD), (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
