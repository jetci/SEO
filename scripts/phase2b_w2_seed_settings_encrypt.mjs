import SSHClient from "ssh2-promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJ_ROOT = path.resolve(__dirname, "..");

const CFG = {
  host: "35.231.230.218",
  username: "ubuntu",
  password: "BcXdZ8vKDrX9i54opwXkgt",
  port: 22,
  readyTimeout: 30000,
};
const ROOT_PW = "root_eeat_2026_Cloud!";
const EEAT_PW = "eeat_secret_2026_Cloud!";
const DB_USER = "eeat";
const DB_NAME = "eeat_studio_v2";

async function main() {
  const ssh = new SSHClient(CFG);
  await ssh.connect();
  console.log("✅ SSH CONNECTED");

  const run = async (label, cmd) => {
    console.log("\n" + "=".repeat(70));
    console.log("  " + label);
    console.log("=".repeat(70));
    const out = (await ssh.exec(cmd).catch(e => String(e?.stack || e)));
    console.log(String(out).slice(0, 6000));
    return out;
  };

  const EEAT = `-u${DB_USER} -p'${EEAT_PW}' ${DB_NAME}`;
  const EXEC_EEAT = `docker exec -i eeat-studio-db mariadb ${EEAT}`;

  // STEP 1: Create AES-256-GCM encrypt script INLINE NODE (on VPS) using VPS REAL SESSION_SECRET from .env
  const sftp = ssh.sftp();
  await sftp.writeFile("/tmp/seed_settings_encrypt.mjs",
    (fs.readFileSync(path.join(PROJ_ROOT, "server", "_core", "env.ts"), "utf8").length > 500 ? "" : "") + `
import * as crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const PROJ = "/home/ubuntu/eeat-studio-v2";
const env = readFileSync(PROJ+"/.env","utf8");
const S = (k) => { const m = env.match(new RegExp("^"+k+"=(.*)$","m")); return m ? m[1] : ""; };
const SESSION_SECRET = S("SESSION_SECRET");
const LLM_PROVIDER = S("LLM_PROVIDER") || "openrouter";
const LLM_API_KEY = S("LLM_API_KEY");
const SERP_PROVIDER = S("SERP_PROVIDER") || "serper";
const SERP_API_KEY = S("SERP_API_KEY");
const TEAM_ID = 90001;

if(!SESSION_SECRET || SESSION_SECRET.length < 32){ console.error("SESSION_SECRET too short or missing"); process.exit(9); }

const sha256 = crypto.createHash("sha256").update(SESSION_SECRET).digest();

function encryptValue(plaintext){
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sha256, iv);
  const enc = Buffer.concat([cipher.update(plaintext,"utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("base64url") + "." + tag.toString("base64url") + "." + enc.toString("base64url");
}
function decryptValue(enc){
  const [ivB64,tagB64,ctB64] = enc.split(".");
  const iv = Buffer.from(ivB64,"base64url"), tag=Buffer.from(tagB64,"base64url"), ct=Buffer.from(ctB64,"base64url");
  const dc = crypto.createDecipheriv("aes-256-gcm", sha256, iv);
  dc.setAuthTag(tag);
  return Buffer.concat([dc.update(ct), dc.final()]).toString("utf8");
}

const rows = [
  ["llm_provider", LLM_PROVIDER],
  ["llm_api_key", LLM_API_KEY],
  ["serp_provider", SERP_PROVIDER],
  ["serp_api_key", SERP_API_KEY],
  ["billing_limit_usd", "200.00"],
];
const mask = (s)=> s && s.length > 12 ? s.slice(0,6)+"****"+s.slice(-4) : (s ? s.slice(0,4)+"****" : "");
const SQL_OUT = [];
for (const [kn, val] of rows) {
  const enc = encryptValue(val);
  const dec = decryptValue(enc);
  const OK = dec === val;
  console.log([kn, "mask_orig="+mask(val), "enc_len="+enc.length, "decrypt_verify="+(OK?"✅PASS":"❌FAIL_MISMATCH")].join(" | "));
  if(!OK){ process.exit(10); }
  const safeEnc = enc.replace(/'/g, "''");
  SQL_OUT.push(\`INSERT INTO settings (team_id,key_name,value,updated_at) VALUES (\${TEAM_ID},'\${kn}','\${safeEnc}',NOW()) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=NOW();\`);
}
const SQL = SQL_OUT.join("\\n")+"\\n";
writeFileSync("/tmp/seed_settings_upsert.sql", SQL);
console.log("\\n✅ /tmp/seed_settings_upsert.sql written " + SQL.length + " bytes rows=" + rows.length);
`,
  { mode: 0o644 });

  await run("PRE settings rows COUNT before seed",
    `echo SETTINGS_BEFORE_COUNT:; ${EXEC_EEAT} -N -e "SELECT COUNT(*) FROM settings;" 2>&1 | tail -1`);

  await run("STEP2 VPS RUN AES-256-GCM ENCRYPT → write /tmp/seed_settings_upsert.sql with REAL .env values VERIFY decrypt_verify=PASS each key",
    `cd /home/ubuntu/eeat-studio-v2 && node /tmp/seed_settings_encrypt.mjs 2>&1 | tail -20`);

  await run("STEP3 APPLY upsert SQL to eeat_studio_v2.settings ON DUPLICATE KEY UPDATE (idempotent)",
    `${EXEC_EEAT} < /tmp/seed_settings_upsert.sql 2>&1 | tail -10; echo SETTINGS_AFTER_COUNT:; ${EXEC_EEAT} -N -e "SELECT COUNT(*) FROM settings;" 2>&1 | tail -1`);

  await run("STEP4 VERIFY DB rows AES encrypt: key_name+team 90001 list values 3 parts base64 dots ONLY (masked NO LEAK key full)",
    `${EXEC_EEAT} -e "SELECT id,team_id,key_name, CASE WHEN CHAR_LENGTH(value)>80 THEN CONCAT(LEFT(value,20),'...',RIGHT(value,12),' [len=',CHAR_LENGTH(value),']') ELSE value END AS value_masked, updated_at FROM settings ORDER BY team_id,key_name;" 2>&1 | tail -12`);

  await run("STEP5 Ping LLM OpenRouter real API key valid? / SERP Serper real key valid? (validate before save ping)",
    `cd /home/ubuntu/eeat-studio-v2 && VPSENV=$(cat .env) ; K=$(echo "$VPSENV" | grep -E '^LLM_API_KEY=' | sed 's/^LLM_API_KEY=//'); S=$(echo "$VPSENV" | grep -E '^SERP_API_KEY=' | sed 's/^SERP_API_KEY=//'); \
      echo --- OpenRouter /v1/models ping key valid? HTTP 401=INVALID 200=VALID ---; \
      echo HTTP_OPENROUTER=$(curl -sk -o /tmp/or.json -w "%{http_code}" --max-time 15 -H "Authorization: Bearer $K" https://openrouter.ai/api/v1/models 2>&1); tail -c 200 /tmp/or.json; echo ""; \
      echo --- Serper /search?q=test ping HTTP 200=VALID 401=INVALID ---; \
      echo HTTP_SERPER=$(curl -sk -o /tmp/serp.json -w "%{http_code}" --max-time 15 -X POST -H "X-API-KEY: $S" -H "Content-Type: application/json" -d '{"q":"ทดสอบ","gl":"th","hl":"th","num":3}' https://google.serper.dev/search 2>&1); tail -c 200 /tmp/serp.json`);

  await ssh.close();
  console.log("\n✅ W2 Seed settings AES-256-GCM encrypt 5 rows (team 90001) DONE");
}
main().catch(e => { console.error(e); process.exit(1); });
