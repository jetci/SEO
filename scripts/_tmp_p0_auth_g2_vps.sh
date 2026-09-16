#!/usr/bin/env bash
cd /home/ubuntu/eeat-studio-v2 || exit 1
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"

echo "=== EVIDENCE_G2_BEGIN ==="

set -a
if [ -f .env ]; then . ./.env; fi
set +a

echo "SESSION_SECRET_LEN=${#SESSION_SECRET}"
echo "SESSION_COOKIE_NAME=${SESSION_COOKIE_NAME:-eeat_studio_v2_session}"
echo "APP_URL=${APP_URL}"
echo "NODE_ENV=${NODE_ENV:-not-set-process-level}"

echo "G2A_NO_COOKIE_RESP_BEGIN"
curl -sk -w "\n__HTTP_STATUS:%{http_code}" \
  -H 'Accept: application/json' \
  -H 'trpc-batch-mode: nonHttp' \
  'http://127.0.0.1:3002/api/trpc/auth.me?batch=1' 2>/dev/null
echo ""
echo "G2A_NO_COOKIE_RESP_END"

cat > /tmp/p0_auth_sign.mjs <<'NODEEOF'
import { SignJWT } from 'jose';
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  console.error("SESSION_SECRET_TOO_SHORT_OR_EMPTY: len=" + (secret?.length ?? 0));
  process.exit(1);
}
const openId = "102308593207118714314";
const iat = Math.floor(Date.now()/1000);
const expSec = iat + 86400;
try {
  const tok = await new SignJWT({ openId, appId: "eeat-studio-v2", name: "Admin Intelman" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expSec)
    .sign(new TextEncoder().encode(secret));
  if (tok.length < 180 || tok.length > 400) {
    console.error("TOKEN_LEN_BAD: " + tok.length);
    process.exit(2);
  }
  process.stdout.write(tok);
  process.exit(0);
} catch (err) {
  console.error("SIGN_JWT_ERR: " + String(err));
  process.exit(3);
}
NODEEOF

node /tmp/p0_auth_sign.mjs > /tmp/p0_auth_jwt_token.txt 2>/tmp/p0_auth_jwt_sign_err.txt
SIGN_EXIT=$?
TOKEN_LEN=0
if [ -f /tmp/p0_auth_jwt_token.txt ]; then TOKEN_LEN=$(wc -c < /tmp/p0_auth_jwt_token.txt | tr -d ' '); fi
echo "SIGN_JWT_EXIT=${SIGN_EXIT}"
echo "SIGN_JWT_TOKEN_LEN=${TOKEN_LEN}"
if [ -s /tmp/p0_auth_jwt_sign_err.txt ]; then
  echo "SIGN_JWT_STDERR_BEGIN"
  cat /tmp/p0_auth_jwt_sign_err.txt
  echo "SIGN_JWT_STDERR_END"
fi

if [ ${SIGN_EXIT} -eq 0 ] && [ ${TOKEN_LEN} -ge 180 ]; then
  TOKEN=$(cat /tmp/p0_auth_jwt_token.txt)
  COOKIE_NAME=${SESSION_COOKIE_NAME:-eeat_studio_v2_session}
  echo "COOKIE_NAME_RESOLVED=${COOKIE_NAME}"

  echo "G2B_WITH_COOKIE_RESP_BEGIN"
  curl -sk -w "\n__HTTP_STATUS:%{http_code}" \
    -H 'Accept: application/json' \
    -H 'trpc-batch-mode: nonHttp' \
    -H "Cookie: ${COOKIE_NAME}=${TOKEN}" \
    'http://127.0.0.1:3002/api/trpc/auth.me?batch=1' 2>/dev/null
  echo ""
  echo "G2B_WITH_COOKIE_RESP_END"

  echo "G2C_HEADERS_BEGIN"
  curl -skD - -o /dev/null \
    -H 'Accept: application/json' \
    -H "Cookie: ${COOKIE_NAME}=${TOKEN}" \
    'http://127.0.0.1:3002/api/trpc/auth.me?batch=1' 2>/dev/null | grep -iE '^(HTTP|Set-Cookie|server:)' || true
  echo "G2C_HEADERS_END"

  if [ -n "${APP_URL}" ] && [[ "${APP_URL}" != "http://localhost"* ]] && [[ "${APP_URL}" != *"127.0.0.1"* ]]; then
    DOMAIN=$(node -e 'try{console.log(new URL(process.argv[1]).hostname)}catch(e){console.log("")}' "${APP_URL}")
    if [ -n "${DOMAIN}" ] && [ "${DOMAIN}" != "localhost" ]; then
      echo "G2D_DOMAIN=${DOMAIN}"
      echo "G2D_EXT_NGINX_RESP_BEGIN"
      curl -sk -w "\n__HTTP_STATUS:%{http_code}" \
        -H 'Accept: application/json' \
        -H "Cookie: ${COOKIE_NAME}=${TOKEN}" \
        "${APP_URL}/api/trpc/auth.me?batch=1" 2>/dev/null
      echo ""
      echo "G2D_EXT_NGINX_RESP_END"
      echo "G2D_EXT_HEADERS_BEGIN"
      curl -skD - -o /dev/null \
        -H 'Accept: application/json' \
        -H "Cookie: ${COOKIE_NAME}=${TOKEN}" \
        "${APP_URL}/api/trpc/auth.me?batch=1" 2>/dev/null | grep -iE '^(HTTP|Set-Cookie|server:)' || true
      echo "G2D_EXT_HEADERS_END"
    fi
  fi
fi

echo "=== EVIDENCE_G2_END ==="
