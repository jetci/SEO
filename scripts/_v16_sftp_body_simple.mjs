// SIMPLEST RELIABLE: write JSON body VIA SFTP (no shell expansion!) then curl it → get Set-Cookie, inject into browser!
import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const JSON_BODY = JSON.stringify({ "0": { json: { openId: "102308593207118714314", name: "Admin V2", email: "intelman26@gmail.com", role: "admin", password: DEMO_PWD } } });
const conn = new Client();
console.log('JSON BODY to write:', JSON_BODY.substring(0,100), '... LEN=', JSON_BODY.length);
conn.on('ready', () => {
  conn.sftp((sftperr, sftp) => {
    if (sftperr) { console.error('sftp err', sftperr); process.exit(3); }
    sftp.writeFile('/tmp/_good_body.json', JSON_BODY, (werr) => {
      if (werr) { console.error('write', werr); process.exit(4); }
      console.log('Wrote /tmp/_good_body.json');
      const CMD = `bash -lc '
echo "--- VERIFY body file content via python3 (parsed) ---"
python3 -c "import json; d=json.load(open(\"/tmp/_good_body.json\")); print(\"parsed OK inner=\", list(d[\"0\"][\"json\"].keys()), \" pwd len=\", len(d[\"0\"][\"json\"][\"password\"]), \" first3=\", d[\"0\"][\"json\"][\"password\"][:3])" 2>&1
echo "--- curl request with good body ---"
curl -s -D /tmp/_resp_hdrs.txt -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
  -H "Content-Type: application/json" \
  -H "Origin: https://thaiaeo.manus.host" \
  --data-binary @/tmp/_good_body.json > /tmp/_resp_body.json
echo "--- Response headers ---"
cat /tmp/_resp_hdrs.txt | grep -iE "HTTP|set-cookie"
echo "--- Response body (first 400 chars) ---"
head -c 400 /tmp/_resp_body.json
echo ""
sleep 1
echo "--- PM2 err log 12 lines (debug inputPwd len) ---"
/usr/bin/pm2 logs eeat-studio-v2 --nostream --lines 12 --err 2>&1
'`;
      conn.exec(CMD, (e,s) => {
        if (e) { console.error(e); process.exit(2); }
        s.on('close', c => { console.log('RC=', c); conn.end(); process.exit(0); })
          .on('data', d => process.stdout.write(d.toString()))
          .stderr.on('data', d => process.stdout.write(d.toString()));
      });
    });
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
