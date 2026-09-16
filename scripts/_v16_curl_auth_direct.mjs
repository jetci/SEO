// VPS V2 curl HTTP POST direct auth.devSignin NO browser NO React state - get JWT cookie, then inject in browser as document.cookie (login bypass). Exit 0 = cookie string captured
import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
echo "--- DIRECT HTTP POST tRPC auth.devSignin via curl (localhost V2 port 3002) ---"
curl -s -i -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
  -H "Content-Type: application/json" \
  -H "Origin: https://thaiaeo.manus.host" \
  -d @- << "CURL_EOF"
{"0":{"json":{"openId":"102308593207118714314","name":"Admin V2","email":"intelman26@gmail.com","role":"admin","password":"${DEMO_PWD}"}}}
CURL_EOF
RC=$?
echo ""
echo "--- HTTP RC curl=$RC ---"
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    let out = '';
    s.on('close', c => {
      console.log(out);
      const m = out.match(/set-cookie:\\s*([^\\r\\n]+)/i) || out.match(/Set-Cookie:\\s*([^\\r\\n]+)/i);
      console.log('\n================');
      console.log('COOKIE_RAW:', m ? m[1].slice(0,220) : 'FAILED NO Set-Cookie header!');
      const body = out.split(/\\r\\n\\r\\n|\\n\\n/).slice(1).join('\n\n').trim();
      console.log('BODY_START:', body.slice(0, 450));
      conn.end(); process.exit(body.includes('FORBIDDEN') ? 99 : 0);
    }).on('data', d => { out += d.toString(); process.stdout.write(d.toString()); })
      .stderr.on('data', d => { out += d.toString(); process.stdout.write(d.toString()); });
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
