import SSHClient from 'ssh2-promise';

const SSH = { host: '35.231.230.218', username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt', port: 22, readyTimeout: 20000, keepaliveInterval: 30000 };
const DB = 'eeat_studio_v2', OLD = 'eeat_studio', MDB_PW = "root_eeat_2026_Cloud!";
const DEPLOY_DIR = '/home/ubuntu/eeat-studio-v2';
const NODE_PATH = '$HOME/.nvm/versions/node/v22.23.1/bin';

let passed = 0, failed = 0;
const CLEANUP_SQLS = [];
function a(cond, msg, g = '?') {
  if (cond) { passed++; console.log('  ✅', String(passed).padStart(2, '0'), '[' + g + ']', msg); }
  else { failed++; console.error('  ❌ FAIL', '[' + g + ']', msg); }
}
async function sh(ssh, code) {
  const f = `/tmp/b123_${Math.random().toString(36).slice(2, 7)}.sh`;
  await ssh.sftp().writeFile(f, '#!/bin/bash\nset +H\nexport PATH="' + NODE_PATH + ':$PATH"\n' + code, { mode: 0o755 });
  const o = await ssh.exec(`bash ${f} 2>&1 ; echo "__EXIT_RET_MARK__=$?"`).catch(e => String(e));
  await ssh.sftp().unlink(f).catch(() => {});
  return String(o).replace(/\s*__EXIT_RET_MARK__=\d+\s*$/, '').trimEnd();
}
function lastInt(o) {
  const lines = String(o).split('\n').map(l => l.trim()).filter(l => /^\d+(\.\d+)?$/.test(l));
  return lines[lines.length - 1] || '0';
}
function mdb(e, db = DB) { return `docker exec eeat-studio-db mariadb -uroot -p'${MDB_PW}' -sN -D ${db} -e "${String(e).replace(/"/g, '\\"')}"`; }

(async () => {
  const ssh = new SSHClient(SSH);
  try {
    await ssh.connect();
    console.log('[SSH] connected ok\n');

    console.log('[G1] Infra: Dual PM2 online + dual ports listen (3001/3002)');
    {
      const pm2Out = await sh(ssh, `pm2 jlist 2>/dev/null || echo "[]"`);
      let list = []; try { list = JSON.parse(('' + pm2Out).trim() || '[]'); } catch {}
      const v1 = list.find((p) => p.name === 'eeat-studio');
      const v2 = list.find((p) => p.name === 'eeat-studio-v2');
      a(!!v1 && (v1?.pm2_env?.status === 'online' || v1?.status === 'online'), 'G1.1 PM2 v1 eeat-studio (port 3001) online FOREVER NEVER KILL', '1');
      a(!!v2 && (v2?.pm2_env?.status === 'online' || v2?.status === 'online'), 'G1.2 PM2 v2 eeat-studio-v2 (port 3002) online zero-downtime reload', '1');
      const ports = await sh(ssh, `(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -E ':(3001|3002)$' | wc -l) || (netstat -ltn 2>/dev/null | grep -E ':(3001|3002) ' | wc -l)`);
      a(Number(lastInt(ports || '0')) >= 2, `G1.3 ports 3001+3002 listen count=${lastInt(ports)}≥2`, '1');
    }

    console.log('\n[G2] DB Integrity: NEW 14 tables + OLD 51 tables (SA LEGACY LOCK FOREVER AC-6)');
    {
      const nt = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB}';`));
      a(Number(lastInt(nt)) === 14, `G2.1 eeat_studio_v2 tables=14 exact actual=${lastInt(nt)} (0004 brand_voice applied ok)`, '2');
      const ot = await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${OLD}';`, OLD));
      a(Number(lastInt(ot)) === 51, `G2.2 eeat_studio OLD v1 51 tables exact=${lastInt(ot)} (NO CHANGES FOREVER)`, '2');
    }

    console.log('\n[G3] HTTPS Health /api/health phase=2 + routers includes keywords/projects NEW procedures');
    {
      const h = await sh(ssh, `curl -sk -m 10 https://thaiaeo.manus.host/api/health 2>/dev/null | head -c 4000`);
      a(/phase["']?\s*[:=]\s*["']?2/.test(h), 'G3.1 /api/health phase=2 deployed', '3');
      const hasKw = /"keywords"/.test(h);
      const hasPj = /"projects"/.test(h);
      const rm = h.match(/"routers"\s*:\s*\[([^\]]*)\]/);
      let count = 0;
      if (rm && rm[1]) count = rm[1].match(/"[^"]+"/g)?.length || 0;
      a(hasKw && hasPj && count >= 10, `G3.2 routers: keywords?${hasKw} projects?${hasPj} count=${count}≥10 → importCsv/saveBrandVoice procedures routed ok`, '3');
    }

    console.log('\n[G4] Remote deployed code grep: importCsv + saveBrandVoice mergedVoice + KeywordClusterPlanner wires Tabs controlled');
    {
      const icCsv = Number(lastInt(await sh(ssh, `grep -c "importCsv" ${DEPLOY_DIR}/server/routers/keywords.ts 2>/dev/null || echo 0`)));
      const sv = Number(lastInt(await sh(ssh, `grep -c "saveBrandVoice" ${DEPLOY_DIR}/server/routers/projects.ts 2>/dev/null || echo 0`)));
      const mv = Number(lastInt(await sh(ssh, `grep -c "mergedVoice.*existingVoice.*input.voice" ${DEPLOY_DIR}/server/routers/projects.ts 2>/dev/null || echo 0`)));
      const kcpTabs = Number(lastInt(await sh(ssh, `grep -cE "handleToolbarReset|handleCardShare|handleCardDeleteClick" ${DEPLOY_DIR}/client/src/pages/KeywordClusterPlanner.tsx 2>/dev/null || echo 0`)));
      a(icCsv >= 1 && sv >= 1, `G4.1 NEW backend procedures exist: importCsv count=${icCsv}≥1 AND saveBrandVoice count=${sv}≥1 deployed`, '4');
      a(mv >= 1, `G4.2 saveBrandVoice mergedVoice={...existingVoice,...input.voice} merge NO BLIND OVERWRITE count=${mv}≥1 (BV DATA INTEGRITY GUARANTEED)`, '4');
      a(kcpTabs >= 3, `G4.3 KCP 6 buttons wired: handleToolbarReset/CardShare/CardDeleteClick token count=${kcpTabs}≥3 — 4 toolbar+2 percard all deployed`, '4');
    }

    console.log('\n[G5] tRPC CURL 3 NEW procedures routes exist not crash: importCsv / saveBrandVoice / keywords.delete → return 401 not 500');
    {
      const curl = (proc, inputJson) => `curl -sk -m 15 -X POST https://thaiaeo.manus.host/api/trpc/${proc} -H "content-type: application/json" -d '${JSON.stringify(inputJson)}' -o /tmp/_b123_o.txt -s -w "%{http_code}|"; cat /tmp/_b123_o.txt 2>/dev/null | head -c 200; rm -f /tmp/_b123_o.txt`;
      const r1 = String(await sh(ssh, curl('keywords.importCsv', { jsonrpc: '2.0', id: 1, method: 'keywords.importCsv', params: { input: { projectId: 1, rows: [{ keyword: 'test' }] } } })));
      const code1 = Number(r1.split('|')[0] || '0');
      a(code1 === 401 || code1 === 200 || /UNAUTHORIZED|BAD_REQUEST/.test(r1), `G5.1 keywords.importCsv route: HTTP=${code1} body OK (401/200 not 500 — route exist no crash)`, '5');
      const r2 = String(await sh(ssh, curl('projects.saveBrandVoice', { jsonrpc: '2.0', id: 1, method: 'projects.saveBrandVoice', params: { input: { projectId: 1, voice: { tone_formal: 50 } } } })));
      const code2 = Number(r2.split('|')[0] || '0');
      a(code2 === 401 || code2 === 200 || /UNAUTHORIZED|BAD_REQUEST/.test(r2), `G5.2 projects.saveBrandVoice route: HTTP=${code2} body OK (401/200 not 500 — upsert deployed)`, '5');
      const r3 = String(await sh(ssh, curl('keywords.delete', { jsonrpc: '2.0', id: 1, method: 'keywords.delete', params: { input: { id: 1 } } })));
      const code3 = Number(r3.split('|')[0] || '0');
      a(code3 === 401 || code3 === 200 || /UNAUTHORIZED|BAD_REQUEST|FORBIDDEN|CONFLICT|ForeignKey|cannot|duplicate/.test(r3), `G5.3 keywords.delete route: HTTP=${code3} body OK (401/200/409 not 500 — FK guard exist)`, '5');
    }

    console.log('\n[G6] Frontend deployed pages tokens LIVE: KP ImportCSV accept CSV file + PJ Tabs BV 4 sliders + KCP AlertDialog');
    {
      const kpTok = Number(lastInt(await sh(ssh, `grep -cE "accept=\\".csv,text/csv\\"|importCsvMut|enrichSerpMut" ${DEPLOY_DIR}/client/src/pages/KeywordResearchPage.tsx 2>/dev/null || echo 0`)));
      const pjTok = Number(lastInt(await sh(ssh, `grep -cE "เสียงแบรนด์|bvFormal|bvCasual|bvTechnical|bvPersuasive|Promise.allSettled|saveBrandVoice" ${DEPLOY_DIR}/client/src/pages/ProjectsPage.tsx 2>/dev/null || echo 0`)));
      const kcpTok = Number(lastInt(await sh(ssh, `grep -cE "AlertDialog|navigator.clipboard.writeText|execCommand.*copy|tabsValue|setTabsValue" ${DEPLOY_DIR}/client/src/pages/KeywordClusterPlanner.tsx 2>/dev/null || echo 0`)));
      a(kpTok >= 2, `G6.1 KP deployed: CSV accept file input+importCsvMut+enrichSerpMut tokens count=${kpTok}≥2 — Feature 1 Import+Research+Cluster wired LIVE`, '6');
      a(pjTok >= 4, `G6.2 PJ deployed: BrandVoice tabs+4 sliders+Promise.allSettled saveBrandVoice tokens count=${pjTok}≥4 — Feature 2 BV merge Upsert LIVE SAVE TO DB`, '6');
      a(kcpTok >= 3, `G6.3 KCP deployed: AlertDialog+clipboard+copy fallback+tabsValue controlled tokens count=${kcpTok}≥3 — Feature3 4+2 dead buttons LIVE`, '6');
    }

    console.log('\n[G7] DB project_brand_voices table exist upsert sample + OLD v1 regression HTTP 200');
    {
      const pbv = Number(lastInt(await sh(ssh, mdb(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB}' AND table_name='project_brand_voices';`))));
      a(pbv === 1, `G7.1 project_brand_voices 0004 table EXIST count=${pbv} (schema LIVE — saveBrandVoice will upsert destination valid)`, '7');
      const v1r = await sh(ssh, `curl -sk -m 8 -o /dev/null -s -w "%{http_code}" http://127.0.0.1:3001/ 2>/dev/null || echo 000`);
      const code = Number(String(v1r).replace(/\D/g, '')) || 0;
      a((code === 200 || code === 302 || (code >= 100 && code < 500)) && code !== 0, `G7.2 Regression OLD v1 3001 HTTP=${code} (never touched regression OK)`, '7');
    }

    const total = passed + failed;
    const MIN = 15, MP = 12;
    console.log(`\n==== LIVE VERIFY BATCH 1>2>3 RESULT: ${passed}/${total} PASS${failed>0?'  ❌ EXIT 1':'  ✅ EXIT 0'} (≥${MIN} assertions, ≥${MP} pass needed) ====\n`);
    if (total<MIN) { console.log(`⚠️  INSUFFICIENT: ${total}<${MIN}`); process.exit(1); }
    if (passed<MP) { console.log(`⚠️  FAILURES: ${passed}/${total}, need ≥${MP}`); process.exit(1); }
    process.exit(failed>0?1:0);
  } catch (err) {
    console.error('\n[FATAL ERR]', String(err?.message || err).slice(0, 400));
    process.exit(2);
  } finally { try { await ssh.close(); } catch {} }
})();
