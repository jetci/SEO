// DEFINITIVE ROOT CAUSE PROBE FINAL — 2 things: ENV cookie dump + 5x cookie-jar curl persistence (simulate F5 x 5)
import SSHClient from 'ssh2-promise';
const SSH = {
  host: '35.231.230.218',
  username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt',
  port: 22,
  readyTimeout: 20000,
  keepaliveInterval: 30000,
};
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';
async function sh(ssh, cmd) {
  try {
    const s = (await ssh.exec(`export PATH="${NODE_PATH}:$PATH"; ${cmd}`))?.toString?.() ??
      String(await ssh.exec(cmd));
    return s.trim();
  } catch (e) {
    return String(e?.message ?? e);
  }
}
(async () => {
  let ssh;
  try {
    ssh = new SSHClient(SSH);
    await ssh.connect();
    console.log('[SSH] connected ok\n');
    console.log('==== 🔥 FINAL ROOT CAUSE PROBE: ENV DUMP + 5x COOKIE JAR SIMULATE F5 x5 🔥 ====\n');

    // ─────────────────────────────────────────────────────
    // PART 1: VPS .env dump cookie variables
    // ─────────────────────────────────────────────────────
    console.log('━━━━━━━━━━ PART 1: VPS .env COOKIE CONFIGURATION DUMP ━━━━━━━━━━');
    const envDump = await sh(ssh, `
cd ${DEPLOY_DIR}
echo "--- grep cookie/session/app env vars ---"
grep -E '^(NODE_ENV|APP_URL|SERVER_URL|SESSION_|GOOGLE_|VERCEL)' .env 2>/dev/null | sed 's/=.*$/=[REDACTED]/' | head -20

echo "--- print actual values (SAFE: secret=length only, other values SHOWN because non-sensitive) ---"
NODE_ENV=\$(grep '^NODE_ENV=' .env 2>/dev/null | cut -d= -f2-)
echo "NODE_ENV_VALUE=\${NODE_ENV}"
APP_URL=\$(grep '^APP_URL=' .env 2>/dev/null | cut -d= -f2-)
echo "APP_URL_VALUE=\${APP_URL}"
SESSION_SAMESITE_ENV=\$(grep '^SESSION_SAMESITE=' .env 2>/dev/null | cut -d= -f2-)
echo "SESSION_SAMESITE_OVERRIDE=\${SESSION_SAMESITE_ENV}"
SESSION_COOKIE_NAME=\$(grep '^SESSION_COOKIE_NAME=' .env 2>/dev/null | cut -d= -f2-)
echo "SESSION_COOKIE_NAME_VALUE=\${SESSION_COOKIE_NAME_NAME} (actual: \$SESSION_COOKIE_NAME)"
SESSION_SECRET_LEN=\$(grep '^SESSION_SECRET=' .env 2>/dev/null | cut -d= -f2- | wc -c)
echo "SESSION_SECRET_LENGTH_BYTES=\${SESSION_SECRET_LEN}"
SESSION_TTL_MS=\$(grep '^SESSION_TTL_MS=' .env 2>/dev/null | cut -d= -f2-)
echo "SESSION_TTL_MS_VALUE=\${SESSION_TTL_MS}"
echo "--- END ENV DUMP ---"
`);
    console.log(envDump);

    // ─────────────────────────────────────────────────────
    // PART 2: COOKIE JAR 5 CONSECUTIVE AUTH.ME CALLS (SIMULATE 5x F5)
    // ─────────────────────────────────────────────────────
    console.log('\n\n━━━━━━━━━━ PART 2: 5x F5 SIMULATION = 5 AUTH.ME CALLS COOKIE JAR PERSIST ━━━━━━━━━━');
    console.log('Sign token → Jar #1 → req 1 saves set-cookie into jar → req 2 reads jar → req 3 → req 4 → req 5. ALL 5 MUST RETURN isLoggedIn:true!');
    const jarSh = await sh(ssh, `
cd ${DEPLOY_DIR}
export PATH="${NODE_PATH}:$PATH"

# Step 1: Sign admin token (use as initial cookie - FIRST LOGIN SIMULATION via Google OAuth callback)
ADMIN_TOKEN=\$(node -e "
const { SignJWT } = require('jose');
require('dotenv').config({ path: './.env' });
(async () => {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  const token = await new SignJWT({ openId: '102308593207118714314', appId: 'eeat-v2', name: 'Admin Intelman' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('24h').sign(secret);
  process.stdout.write(token);
})();
")
echo "INITIAL TOKEN LENGTH: \$(echo -n "\$ADMIN_TOKEN" | wc -c)"

# Cookie name
COOKIE_NAME=\$(grep '^SESSION_COOKIE_NAME=' .env 2>/dev/null | cut -d= -f2-)
[ -z "\$COOKIE_NAME" ] && COOKIE_NAME="eeat_studio_v2_session"
echo "COOKIE_NAME=\$COOKIE_NAME"

# Clean jar file
JAR=/tmp/eeat_auth_cookie_jar.txt
rm -f \$JAR
# Set initial cookie (simulate FIRST Google OAuth callback redirect = Set-Cookie once)
echo "# Netscape HTTP Cookie File" > \$JAR
echo "thaiaeo.manus.host\tTRUE\t/\tTRUE\t\$((\$(date +%s) + 86400))\t\$COOKIE_NAME\t\$ADMIN_TOKEN" >> \$JAR
cat \$JAR | head -5

# tRPC auth.me URL batch format correct: ?input={"0":{}} (non-batch simple format)
AUTH_URL_NONBATCH="https://thaiaeo.manus.host/api/trpc/auth.me?input=%7B%7D"
echo "AUTH_URL=\$AUTH_URL_NONBATCH"

# 5 consecutive calls = 5x F5
for i in 1 2 3 4 5; do
  echo ""
  echo "===== CALL #\$i (F5 simulation #\$i) ====="
  # Use cookie jar (read/write -b read cookies, -c write new set-cookie into jar for next call)
  OUT=\$(curl -sk -b \$JAR -c \$JAR -D - "\$AUTH_URL_NONBATCH" 2>&1 | head -40)
  echo "\$OUT" | head -15

  # Parse isLoggedIn
  BODY=\$(echo "\$OUT" | tail -n +\$(echo "\$OUT" | grep -n '^{' | head -1 | cut -d: -f1) 2>/dev/null)
  echo "BODY snippet: \$(echo "\$BODY" | cut -c1-200)"
  LOGGED_IN=\$(echo "\$BODY" | grep -oE 'isLoggedIn["'\'']?\s*:\s*true' | wc -l)
  SET_COOKIE_COUNT=\$(echo "\$OUT" | grep -iE '^Set-Cookie:' | wc -l)
  echo "SUMMARY CALL \$i: isLoggedIn_true_count=\$LOGGED_IN set_cookie_count=\$SET_COOKIE_COUNT"
done

echo ""
echo "===== FINAL JAR FILE STATE ====="
wc -l \$JAR
cat \$JAR
`);
    console.log(jarSh);

    // ─────────────────────────────────────────────────────
    // PART 3: Direct :3002 SET-COOKIE sliding with correct query format
    // ─────────────────────────────────────────────────────
    console.log('\n\n━━━━━━━━━━ PART 3: DIRECT :3002 vs NGINX Set-Cookie sliding with CORRECT query format ━━━━━━━━━━');
    const slidingSh = await sh(ssh, `
cd ${DEPLOY_DIR}
export PATH="${NODE_PATH}:$PATH"
ADMIN_TOKEN=\$(node -e "
const { SignJWT } = require('jose');
require('dotenv').config({ path: './.env' });
(async () => {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  const token = await new SignJWT({ openId: '102308593207118714314', appId: 'eeat-v2', name: 'Admin Intelman' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('24h').sign(secret);
  process.stdout.write(token);
})();
")
COOKIE_NAME=\$(grep '^SESSION_COOKIE_NAME=' .env 2>/dev/null | cut -d= -f2-)
[ -z "\$COOKIE_NAME" ] && COOKIE_NAME="eeat_studio_v2_session"

AUTH="http://127.0.0.1:3002/api/trpc/auth.me?input=%7B%7D"
echo "--- DIRECT :3002 HEADERS ---"
curl -skD - -o /tmp/body_dir.txt -H "Cookie: \$COOKIE_NAME=\$ADMIN_TOKEN" "\$AUTH" 2>&1 | grep -iE 'HTTP|Set-Cookie|Content-Type' | head -10
echo "Direct body snippet: \$(head -c 200 /tmp/body_dir.txt)"

echo ""
echo "--- PUBLIC NGINX HTTPS HEADERS ---"
AUTH2="https://thaiaeo.manus.host/api/trpc/auth.me?input=%7B%7D"
curl -skD - -o /tmp/body_pub.txt -H "Cookie: \$COOKIE_NAME=\$ADMIN_TOKEN" "\$AUTH2" 2>&1 | grep -iE 'HTTP|Set-Cookie|Content-Type' | head -10
echo "Public body snippet: \$(head -c 200 /tmp/body_pub.txt)"
echo ""
echo "--- CRITICAL COMPARISON ---"
echo "If DIRECT has Set-Cookie but PUBLIC=0 → NGINX IS DROPPING SET-COOKIE HEADER (add proxy_pass_header or check gzip/buffering)"
echo "If BOTH have Set-Cookie=0 → SERVER NOT ISSUING SLIDING (check freshToken len guard 180-360 or COOKIE_SAMESITE/SECURE valid)"
`);
    console.log(slidingSh);

    ssh.close?.();
  } catch (e) {
    console.error('FATAL:', e);
    process.exit(1);
  }
})();
