import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);

(async()=>{
  await ssh.connect();
  // [1] env SERP vars
  console.log("==[1] .env SERP_PROVIDER + SERP_API_KEY_LEN==");
  const e1 = (await ssh.exec("cat /home/ubuntu/eeat-studio-v2/.env 2>/dev/null | grep -i '^SERP' | head -5")).toString().trim();
  console.log(e1 || "EMPTY");
  // [2] live curl serper.dev using env key
  console.log("\n==[2] LIVE CURL serper.dev q=บ้านบอล (API จริง key จาก .env) = พิสูจน์จ่ายเงินจริง==");
  const e2 = (await ssh.exec('bash -lc \'set -a; source /home/ubuntu/eeat-studio-v2/.env 2>/dev/null; set +a; if [ -n "$SERP_API_KEY" ]; then T=$(curl -sS -m 14 -o /tmp/_sp.json -w "%{http_code}|%{time_total}" -X POST https://google.serper.dev/search -H "X-API-KEY: $SERP_API_KEY" -H "Content-Type: application/json" -d \'{"q":"บ้านบอล","hl":"th","gl":"th","num":5}\'); echo HTTP_TIME=$T; node -e \'const fs=require("fs");let j={};try{j=JSON.parse(fs.readFileSync("/tmp/_sp.json","utf8"));}catch(e){}console.log("organic=", j.organic?.length ?? 0, "relatedSearches=", j.relatedSearches?.length ?? 0, "peopleAlsoSearch=", j.peopleAlsoSearch?.length ?? 0, "peopleAlsoAsk=", j.peopleAlsoAsk?.length ?? 0); if(j.organic?.[0]) console.log("organic[0].title=", j.organic[0].title.slice(0,150)); if(j.relatedSearches?.[0]) console.log("relatedSearches[0].query=", j.relatedSearches[0].query); if(j.peopleAlsoSearch?.[0]) console.log("peopleAlsoSearch[0].query=", j.peopleAlsoSearch[0].query); if(j.peopleAlsoAsk?.[0]) console.log("peopleAlsoAsk[0].question=", (j.peopleAlsoAsk[0].question||"").slice(0,150));\'; else echo NO_SERP_API_KEY; fi\' 2>&1')).toString().trim();
  console.log(e2);
  // [3] DB researchPackages last 3 rows — serp field counts (mariadb)
  console.log("\n==[3] DB researchPackages LAST 3 rows (หลักฐาน API เข้า DB จริง)==");
  const e3 = (await ssh.exec(String.raw `docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p'eeat_secret_2026_Cloud!' -P 3307 eeat_studio_v2 -e "
SELECT rp.id, COALESCE(k.keywordText,'-') AS kw, DATE_FORMAT(rp.created_at,'%d/%m %H:%i') t,
  JSON_LENGTH(rp.packageJson->'\\\$.serp_top10') org_n,
  JSON_LENGTH(rp.packageJson->'\\\$.related_searches') rs_n,
  JSON_LENGTH(rp.packageJson->'\\\$.people_also_search') pas_n,
  JSON_LENGTH(rp.packageJson->'\\\$.paa_questions') paa_n,
  JSON_LENGTH(rp.packageJson->'\\\$.citation_pool') cite_n
FROM researchPackages rp LEFT JOIN keywords k ON k.id=rp.keywordId
ORDER BY rp.id DESC LIMIT 3;" 2>&1`)).toString().trim();
  console.log(e3);
  // [4] sample organic title of newest
  console.log("\n==[4] NEWEST researchPackage serp_top10[0].title (if exists) = หลักฐานมาจาก SERP ไม่ใช่ generic==");
  const e4 = (await ssh.exec(String.raw `docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p'eeat_secret_2026_Cloud!' -P 3307 eeat_studio_v2 -e "
SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'\\\$.serp_top10[0].title')),'-') AS t1,
       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'\\\$.serp_top10[1].title')),'-') AS t2,
       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'\\\$.related_searches[0]')),'-') AS rs0,
       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'\\\$.people_also_search[0]')),'-') AS pas0
FROM researchPackages rp ORDER BY rp.id DESC LIMIT 1;" 2>&1`)).toString().trim();
  console.log(e4);
  await ssh.close();
})().catch(e=>{console.error('ERR',e);process.exit(99)});
