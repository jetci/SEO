import { Client } from 'ssh2';
const HOST='35.231.230.218', USER='ubuntu', PW='BcXdZ8vKDrX9i54opwXkgt';
const DEMO_PWD='K9XmPq4Rtv2ZB8Lw3N!7C';
const conn = new Client();
conn.on('ready', () => {
  const CMD = `bash -lc '
cd /home/ubuntu/eeat-studio-v2
# DEMO_PWD shell variable
DEMO_PWD_VAR="${DEMO_PWD}"
echo "Shell variable DEMO_PWD_VAR length = $(( ${#DEMO_PWD_VAR} )) chars = first3=${DEMO_PWD_VAR:0:3} last3=${DEMO_PWD_VAR: -3}"
echo "--- FIXED curl: HEREDOC UNQUOTED so $DEMO_PWD_VAR expands! ---"
curl -s -i -X POST "http://127.0.0.1:3002/api/trpc/auth.devSignin?batch=1" \
  -H "Content-Type: application/json" \
  -H "Origin: https://thaiaeo.manus.host" \
  --data-raw "{\\\"0\\\":{\\\"json\\\":{\\\"openId\\\":\\\"102308593207118714314\\\",\\\"name\\\":\\\"Admin V2\\\",\\\"email\\\":\\\"intelman26@gmail.com\\\",\\\"role\\\":\\\"admin\\\",\\\"password\\\":\\\"$DEMO_PWD_VAR\\\"}}}"
RC=$?
echo ""
echo "RC curl = $RC"
'`;
  conn.exec(CMD, (e,s) => {
    if (e) { console.error(e); process.exit(2); }
    s.on('close', c => { console.log('SSH RC=', c); conn.end(); process.exit(0); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stdout.write(d.toString()));
  });
}).connect({ host: HOST, username: USER, password: PW, readyTimeout: 25000 });
