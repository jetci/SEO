import SSHClient from "ssh2-promise";
const CFG = { host:"35.231.230.218", username:"ubuntu", password:"BcXdZ8vKDrX9i54opwXkgt", port:22, readyTimeout:30000 };
const ssh = new SSHClient(CFG);
(async()=>{
  await ssh.connect();
  console.log("[env SERP lines]:");
  console.log((await ssh.exec("cat /home/ubuntu/eeat-studio-v2/.env 2>/dev/null | grep -i '^SERP' | awk '{k=substr($$0,1,index($$0,\"=\")-1); v=substr($$0,index($$0,\"=\")+1); if(length(v)>8) printf \"%s=%s...%s (len=%d)\\n\", k, substr(v,1,6), substr(v,length(v)-3), length(v); else printf \"%s=%s\\n\",k,v;}'")).toString().trim());
  console.log("\n[DB researchPackages rows total + SERP field counts last 3]:");
  const q1 = String.raw `SELECT rp.id, COALESCE(k.keywordText,'-'), DATE_FORMAT(rp.created_at,'%d/%m %H:%i'), JSON_LENGTH(rp.packageJson->'$.serp_top10'), JSON_LENGTH(rp.packageJson->'$.related_searches'), JSON_LENGTH(rp.packageJson->'$.people_also_search'), JSON_LENGTH(rp.packageJson->'$.paa_questions') FROM researchPackages rp LEFT JOIN keywords k ON k.id=rp.keywordId ORDER BY rp.id DESC LIMIT 3;`;
  console.log((await ssh.exec(`docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p"eeat_secret_2026_Cloud!" -P 3307 eeat_studio_v2 -e "SELECT COUNT(*) FROM researchPackages;" 2>&1`)).toString().trim());
  console.log((await ssh.exec(`docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p"eeat_secret_2026_Cloud!" -P 3307 eeat_studio_v2 -e "${q1.replace(/"/g,'\\"')}" 2>&1`)).toString().trim());
  console.log("\n[sample org0 title of newest row]:");
  const q2 = String.raw `SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'$.serp_top10[0].title')),'NULL'), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rp.packageJson,'$.related_searches[0]')),'NULL') FROM researchPackages rp ORDER BY rp.id DESC LIMIT 1;`;
  console.log((await ssh.exec(`docker exec eeat-studio-db mariadb --default-character-set=utf8mb4 -N -B -ueeat -p"eeat_secret_2026_Cloud!" -P 3307 eeat_studio_v2 -e "${q2.replace(/"/g,'\\"')}" 2>&1`)).toString().trim());
  await ssh.close();
})().catch(e=>{console.error('ERR',e);process.exit(99)});
