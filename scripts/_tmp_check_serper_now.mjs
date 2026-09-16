import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);

(async()=>{
  await ssh.connect();
  console.log("==[1] VPS V2 .env —  SERP_PROVIDER / SERP_API_KEY (หน้าแค่ 6 ตัวท้าย)");
  try {
    const out1 = (await ssh.exec(String.raw `cat /home/ubuntu/eeat-studio-v2/.env 2>/dev/null | grep -iE '^SERP' | while IFS= read -r line; do k="${line%%=*}"; v="${line#*=}"; if [ ${#v} -gt 8 ]; then echo "${k}=${v:0:6}…${v: -4} (len=${#v})"; else echo "${k}=${v}"; fi; done || echo NO_ENV`)).toString().trim();
    console.log(out1);
  } catch (e) { console.log("err1", e.message); }

  console.log("\n==[2] LIVE PING SERVER → serper.dev ใช้ key จาก .env จริง (hl=th gl=th q=บ้านบอล) — status 200 + organic≥3 ครั้ง = พิสูจน์ 100% ว่าเรียกออกจริงใช้เงินจริง");
  try {
    const out2 = (await ssh.exec(String.raw `bash -lc 'set -a; source /home/ubuntu/eeat-studio-v2/.env; set +a; KEY="${SERP_API_KEY}"; PROV="${SERP_PROVIDER:-serper}"; echo "Provider=$PROV key_len=${#KEY}"; if [ "${PROV}" = "serper" ] && [ ${#KEY} -gt 6 ]; then curl -sS -m 12 -o /tmp/_serp_test.json -w "HTTP_CODE=%{http_code}\nTIME=%{time_total}s\n" -X POST https://google.serper.dev/search -H "X-API-KEY: ${KEY}" -H "Content-Type: application/json" -d "{\"q\":\"บ้านบอล\",\"hl\":\"th\",\"gl\":\"th\",\"num\":5}"; echo "PAYLOAD:"; node -e 'const j=require("/tmp/_serp_test.json"); console.log("organicCount=", j.organic?.length ?? 0, "relatedSearches=", j.relatedSearches?.length ?? 0, "peopleAlsoSearch=", j.peopleAlsoSearch?.length ?? 0, "peopleAlsoAsk=", j.peopleAlsoAsk?.length ?? 0); if(j.organic?.[0]) console.log("organic[0].title=", String(j.organic[0].title||"").slice(0,120)); if(j.relatedSearches?.[0]) console.log("related[0]=", String(j.relatedSearches[0].query||j.relatedSearches[0]||"").slice(0,120)); if(j.peopleAlsoSearch?.[0]) console.log("pas[0]=", String(j.peopleAlsoSearch[0].query||j.peopleAlsoSearch[0]||"").slice(0,120));'; else echo "NO SERPER KEY (provider=$PROV)"; fi' 2>&1`)).toString().trim();
    console.log(out2);
  } catch (e) { console.log("err2", e.message); }

  console.log("\n==[3] DB researchPackages last 5 rows (mariadb binary) — ดูจำนวน SERP fields จริง");
  try {
    const out3 = (await ssh.exec(String.raw `docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p'eeat_secret_2026_Cloud!' -P 3307 eeat_studio_v2 -e "
SELECT rp.id, COALESCE(k.keywordText,'NULL') AS kw, DATE_FORMAT(rp.created_at,'%d/%m %H:%i') AS t,
  JSON_LENGTH(rp.packageJson->'\$.organic_top10') AS org_n,
  JSON_LENGTH(rp.packageJson->'\$.related_searches') AS rs_n,
  JSON_LENGTH(rp.packageJson->'\$.people_also_search') AS pas_n,
  JSON_LENGTH(rp.packageJson->'\$.paa') AS paa_n,
  JSON_LENGTH(rp.packageJson->'\$.citation_pool') AS cite_n,
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'\$.provider')),'') AS prov
FROM researchPackages rp LEFT JOIN keywords k ON k.id=rp.keywordText_id
ORDER BY rp.id DESC LIMIT 5;" 2>&1`)).toString().trim();
    console.log(out3);
  } catch (e) { console.log("err3", e.message); }

  console.log("\n==[4] DB audit_usage last 10 rows serper = เหรียญที่เสียจริง");
  try {
    const out4 = (await ssh.exec(String.raw `docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p'eeat_secret_2026_Cloud!' -P 3307 eeat_studio_v2 -e "
SELECT DATE_FORMAT(created_at,'%d/%m %H:%i') AS t, provider, endpointName, rowsReturned, usdCostEst FROM audit_usage
WHERE LOWER(provider) IN ('serp','serper') OR LOWER(endpointName) LIKE '%serp%'
ORDER BY id DESC LIMIT 10;" 2>&1`)).toString().trim();
    console.log(out4);
  } catch (e) { console.log("err4", e.message); }

  await ssh.close();
})().catch(e=>{console.error('ERR',e);process.exit(99)});
