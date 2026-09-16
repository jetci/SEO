import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);

(async()=>{
  await ssh.connect();
  const scr = String.raw `#!/bin/bash
set -a; source /home/ubuntu/eeat-studio-v2/.env 2>/dev/null; set +a
echo "[1] provider=$SERP_PROVIDER key_len=${#SERP_API_KEY}"
T=$(curl -sS -m 14 -o /tmp/_sp.json -w "HTTP=%{http_code} TIME=%{time_total}s" -X POST https://google.serper.dev/search -H "X-API-KEY: $SERP_API_KEY" -H "Content-Type: application/json" --data '{"q":"บ้านบอล","hl":"th","gl":"th","num":5}')
echo "[2] $T"
node -e 'const fs=require("fs");let j={};try{j=JSON.parse(fs.readFileSync("/tmp/_sp.json","utf8"));}catch(e){console.log("JSON parse fail");}console.log("[3] organic=%s rs=%s pas=%s paa=%s",j.organic?.length??0,j.relatedSearches?.length??0,j.peopleAlsoSearch?.length??0,j.peopleAlsoAsk?.length??0);if(j.organic?.[0])console.log("[4] org0 title=",String(j.organic[0].title||"").slice(0,160));if(j.relatedSearches?.[0])console.log("[5] rs0=",String(j.relatedSearches[0].query||j.relatedSearches[0]||""));if(j.peopleAlsoSearch?.[0])console.log("[6] pas0=",String(j.peopleAlsoSearch[0].query||j.peopleAlsoSearch[0]||""));'
echo "[7] DB researchPackages last3 rows:"
docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p'eeat_secret_2026_Cloud!' -P 3307 eeat_studio_v2 -e "SELECT rp.id, COALESCE(k.keywordText,'-') kw, DATE_FORMAT(rp.created_at,'%d/%m %H:%i') t, JSON_LENGTH(rp.packageJson->'\\\$.serp_top10') org_n, JSON_LENGTH(rp.packageJson->'\\\$.related_searches') rs_n, JSON_LENGTH(rp.packageJson->'\\\$.people_also_search') pas_n, JSON_LENGTH(rp.packageJson->'\\\$.paa_questions') paa_n FROM researchPackages rp LEFT JOIN keywords k ON k.id=rp.keywordId ORDER BY rp.id DESC LIMIT 3;" 2>&1
echo "[8] NEWEST sample (org0 t1 + rs0 + pas0):"
docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p'eeat_secret_2026_Cloud!' -P 3307 eeat_studio_v2 -e "SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'\\\$.serp_top10[0].title')),'-') t1, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'\\\$.related_searches[0]')),'-') rs0, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'\\\$.people_also_search[0]')),'-') pas0 FROM researchPackages rp ORDER BY rp.id DESC LIMIT 1;" 2>&1
`;
  // Write script to VPS via here-doc
  await ssh.exec(`cat > /tmp/_v_serp.sh << 'OUTER_EOF'
${scr}
OUTER_EOF
chmod +x /tmp/_v_serp.sh`);
  const r = (await ssh.exec("bash /tmp/_v_serp.sh 2>&1")).toString().trim();
  console.log(r);
  await ssh.close();
})().catch(e=>{console.error('ERR',e);process.exit(99)});
