import { Client } from 'ssh2';
import fs from 'node:fs';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const JSON_BODY = JSON.stringify({ "0": { json: { openId: "102308593207118714314", name: "Admin V2", email: "intelman26@gmail.com", role: "admin", password: DEMO_PWD } } });
const conn = new Client();
conn.on('ready', () => {
  // Step 1: Write body file via sftp to /tmp/_body.json, then curl @file
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(3); }
    sftp.writeFile('/tmp/_auth_body.json', JSON_BODY, (werr) => {
      if (werr) { console.error('sftp write', werr); process.exit(4); }
      console.log('Wrote /tmp/_auth_body.json bytes=', JSON_BODY.length);
      const CMD = `bash -lc '
curl -s -i -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
  -H "Content-Type: application/json" \
  -H "Origin: https://thaiaeo.manus.host" \
  --data-binary @/tmp/_auth_body.json
echo ""
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
