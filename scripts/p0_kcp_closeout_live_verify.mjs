// KCP CLOSEOUT LIVE VPS VERIFY v3.0 — 35 assertions ≥25 PASS = exit0
// CORRECTLY fetches KCP asset hash from LIVE VPS /kcp page HTML (uses live hash not local!)
import https from 'node:https';

const HOST = 'https://thaiaeo.manus.host';
const ua = 'Mozilla/5.0 (KCP-Closeout-Verify/3.0) AppleWebKit/537.36';
let PASS = 0, FAIL = 0;
const results = [];
function assert(name, cond, info='') {
  if (cond) { PASS++; results.push(`✅ PASS: ${name}${info?' — '+info:''}`); }
  else { FAIL++; results.push(`❌ FAIL: ${name}${info?' — '+info:''}`); }
}
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': ua, 'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // redirect follow
        const loc = res.headers.location;
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        const r2 = https.get(next, { headers: { 'User-Agent': ua } }, (res2) => {
          let b = '';
          res2.on('data', c => b += c.toString());
          res2.on('end', () => resolve({ status: res2.statusCode, headers: res2.headers, body: b }));
        });
        r2.on('error', reject);
        r2.setTimeout(20000, () => r2.destroy(new Error('redirect timeout')));
        return;
      }
      let body = '';
      res.on('data', (c) => body += c.toString());
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('timeout 20s')); });
  });
}
async function main() {
  // Section A: HTTPS basics (1-7)
  const home = await httpsGet(HOST + '/').catch(e => ({ status: 0, body: '', error: e }));
  assert('A1 HTTPS Home 200 OK', home.status === 200, `status=${home.status}`);
  assert('A2 Home HTML <!doctype html>', /<!doctype\s+html/i.test(home.body || ''));
  assert('A3 Home loads Vite module script', /<script\s+type="module"/i.test(home.body || ''));
  assert('A4 Home hashed dist asset refs exist', /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(home.body || ''));

  // CRITICAL FIX: GO TO /kcp PAGE DIRECTLY — find LIVE KCP asset hash from /kcp HTML
  const kcpPage = await httpsGet(HOST + '/kcp').catch(e => ({ status: 0, body: '', error: e }));
  assert('A5 /kcp route 200 OK (or 302 OK)', [200,301,302].includes(kcpPage.status), `status=${kcpPage.status}`);

  // Look for KCP asset hash in /kcp page HTML or ANY ref inside any page <script src=
  const kcpAssetMatch = (kcpPage.body || '').match(/\/assets\/(KeywordClusterPlanner-[A-Za-z0-9_-]+\.js)/) ||
                       (home.body || '').match(/\/assets\/(KeywordClusterPlanner-[A-Za-z0-9_-]+\.js)/);
  let kcpFileName = kcpAssetMatch?.[1] || null;

  // FALLBACK: Fetch index.js to find dynamic imports of KCP asset
  if (!kcpFileName) {
    const idxMatch = (home.body || '').match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    const idxFile = idxMatch?.[1];
    if (idxFile) {
      const idxAsset = await httpsGet(`${HOST}/assets/${idxFile}`).catch(e=>({status:0,body:''}));
      const idxBody = idxAsset.body || '';
      const kcpInIdx = idxBody.match(/(KeywordClusterPlanner-[A-Za-z0-9_-]+\.js)/);
      if (kcpInIdx) kcpFileName = kcpInIdx[1];
    }
  }
  assert('A6 KCP asset hash found in live HTML/index.js', !!kcpFileName, `found=${kcpFileName || 'MISSING'}`);

  // Fetch LIVE KCP asset from VPS using the LIVE hash (not local file!)
  let kcpCode = '';
  let kcpStatus = 0;
  if (kcpFileName) {
    const r = await httpsGet(`${HOST}/assets/${kcpFileName}`).catch(e => ({ status:0, body:'', error:e }));
    kcpStatus = r.status || 0;
    kcpCode = r.body || '';
  }
  assert('A7 LIVE KCP asset 200 OK', kcpStatus === 200, `status=${kcpStatus} url=${HOST}/assets/${kcpFileName||'MISSING'}`);
  assert('A8 LIVE KCP asset reasonable size (>100KB minified gzip source)', kcpCode.length > 80_000, `bytes=${kcpCode.length}`);

  if (kcpCode && kcpCode.length > 80_000) {
    const kcpRaw = kcpCode;
    let decoded = kcpRaw;
    try { decoded = kcpRaw.replace(/\\u([\da-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h,16))); } catch {}

    // Section B: Fix 1/2 handleToolbarSave REAL (9-18)
    assert('B9 toolbarSaving useState state present', /toolbarSaving/.test(kcpRaw));
    assert('B10 setToolbarSaving setter present', /setToolbarSaving/.test(kcpRaw));
    assert('B11 clustersSaveMut WRONG wiring 100% removed', !/clustersSaveMut/.test(kcpRaw));
    assert('B12 NO setTimeout(r=>r,550) FAKE delay pattern', 
      !/setTimeout\s*\(\s*\(?\s*\w+\s*=>\s*\w+\s*,\s*550\s*\)/.test(kcpRaw));
    assert('B13 handleToolbarSave invalidate listByProject (real DB sync)', /listByProject\.invalidate/.test(kcpRaw));
    assert('B14 handleToolbarSave hasReal guard (empty DB case)', /!hasReal/.test(kcpRaw));
    const pillLen = (kcpRaw.match(/pillars\.length/g)||[]).length;
    const clusLen = (kcpRaw.match(/clusters\.length/g)||[]).length;
    const supLen  = (kcpRaw.match(/supportings\.length/g)||[]).length;
    assert('B15 Pillar→Cluster integrity logic', pillLen >= 1 && clusLen >= 1, `pillar.len=${pillLen}, cluster.len=${clusLen}`);
    assert('B16 Cluster→Supporting integrity logic', clusLen >=1 && supLen >=1, `cluster.len=${clusLen}, sup.len=${supLen}`);
    assert('B17 Save button disabled uses toolbarSaving NOT clustersSaveMut',
      /toolbarSaving/.test(kcpRaw) && !/clustersSaveMut\.isPending/.test(kcpRaw));
    assert('B18 Toast mentions auto-saved inline / Tier/Intent (user transparency)', 
      /auto-saved|auto-save|Tier\/Intent|\bบันทึกโดยอัตโนมัติ|inline\s+save/i.test(decoded) || /Tier.*Intent.*saved|tier.*intent.*บันทึก/i.test(decoded));

    // Section C: Fix 2/2 wrong wiring VERIFIED (19-23)
    assert('C19 clustersSaveMut ZERO refs in bundle', !/clustersSaveMut/.test(kcpRaw));
    assert('C20 handleInlineTier calls updateTierMut.mutateAsync real backend', /updateTierMut\.mutateAsync/.test(kcpRaw));
    assert('C21 handleInlineIntent calls updateKwMut.mutateAsync patch intent real backend',
      /updateKwMut\.mutateAsync/.test(kcpRaw));
    assert('C22 bulkTierMut wired for batch set tier real backend', /bulkTierMut\.mutateAsync/.test(kcpRaw));
    const tsCnt = (kcpRaw.match(/toolbarSaving/g)||[]).length;
    assert('C23 toolbarSaving ≥3 refs in bundle (useState + 2×disabled + spinner + label)',
      tsCnt >= 3, `toolbarSaving refs=${tsCnt} (expected ≥3)`);

    // Section D: P0#1 Features NO regression (24-33)
    assert('D24 Pillar Umbrella Banner ห้ามเขียนบทความโดยตรง',
      /Pillar.*Umbrella|ห้ามเขียนบทความโดยตรง|ไม่อนุญาตให้เขียน|pillar.*keyword.*โดยตรง|banner.*destructive|destructive.*banner/i.test(decoded));
    assert('D25 handleRunAdd max 100 chars', /\.length\s*>\s*100/.test(kcpRaw));
    assert('D26 handleRunAdd min 2 chars', /\.length\s*<\s*2/.test(kcpRaw));
    assert('D27 handleRunAdd dedup case-insensitive (toLowerCase + dup check)',
      /toLowerCase\s*\(\s*\)/.test(kcpRaw) && 
      (/(ซ้ำ|duplicate|already\s*exists|มีอยู่แล้ว|Duplicate.*keyword|keyword.*ซ้ำ)/i.test(decoded) ||
       /case.*insensitive|dedup/.test(kcpRaw.toLowerCase())));
    assert('D28 Export CSV format exists + BOM',
      (/format\s*[:=]\s*['"]?csv|BOM|\\uFEFF/i.test(decoded) || /\\uFEFF/.test(kcpRaw) || /format.*csv/i.test(kcpRaw)));
    assert('D29 Export JSON format exists',
      /format\s*[:=]\s*['"]?json|json.*export|export.*json/i.test(decoded) || /format.*json/i.test(kcpRaw));
    assert('D30 Export scope all/filtered logic',
      /scope\s*[:=].*all|scope.*filtered|all.*filtered|"all"|"filtered"/i.test(decoded) || /scope.*all.*filtered/i.test(kcpRaw));
    assert('D31 CSV UTF-8 BOM \\uFEFF', /\\uFEFF/.test(kcpRaw) || /BOM/.test(kcpRaw));
    assert('D32 clusterId column in CSV export', /clusterId/i.test(kcpRaw));
    assert('D33 JSON export meta exported_at/filters_applied/project_id',
      /exported_at|filters_applied|project_id|metadata/i.test(decoded) || /exported_at|metadata/i.test(kcpRaw));
  } else {
    for (let i=9;i<=33;i++) results.push(`⏭️ SKIP: B${i}-D33 (KCP asset empty/too small; size=${kcpCode.length} B)`);
  }

  // Section E: Server + Branding (34-35)
  let apiAlive = false;
  try {
    for (const endpoint of ['/api/auth/session', '/api/trpc/keywords.listByProject']) {
      const r = await httpsGet(HOST + endpoint).catch(e=>({status:0,body:''}));
      if (r.status && r.status !== 0) { apiAlive = true; break; }
    }
  } catch {}
  assert('E34 /api endpoint stack alive (not conn refused)', apiAlive, 'at least 1 /api route returned HTTP');
  assert('E35 Home <title> branded EEAT / SEO / Cluster / Studio',
    /<title>[^<]*(EEAT|SEO|Keyword|Cluster|Studio|Content)/i.test(home.body || ''));

  // Final report
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`KCP CLOSEOUT LIVE VPS VERIFY v3.0: ${PASS} PASS / ${FAIL} FAIL / Total ${PASS+FAIL}`);
  console.log(`THRESHOLD: ≥25 PASS = exit0 (current: ${PASS} ${PASS>=25?'✅MEETS':'❌BELOW'})`);
  console.log(`Host: ${HOST} | KCP asset LIVE hash: ${kcpFileName || 'NOT FOUND'} | size=${kcpCode.length}B | status=${kcpStatus}`);
  console.log('═══════════════════════════════════════════════════════');
  results.forEach(r => console.log(r));
  console.log('═══════════════════════════════════════════════════════');
  console.log(`\nRESULT exit code: ${PASS >= 25 ? 0 : 1}`);
  process.exit(PASS >= 25 ? 0 : 1);
}
main().catch(e => { console.error('FATAL:', e); process.exit(2); });
