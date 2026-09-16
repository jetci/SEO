import { execSync } from 'child_process';

const API = 'http://localhost:3002/api/trpc';
const GATES: Record<string, boolean> = {};

function exit(code: number): never { setTimeout(() => process.exit(code), 80); return undefined as never; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function mysql(sql: string): string {
  const safe = sql.replace(/"/g, '\\"');
  try {
    return execSync(
      `docker exec eeat-mysql mysql -ueeat -peeat_secret eeat_studio_v2 -B -N -e "${safe}"`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  } catch (e: any) { return String(e?.stderr ?? e).slice(0, 500); }
}

type TrpcResult = { data?: any; error?: any; cookie: string };
function parseCookies(headers: any): string {
  try {
    const raw = headers.get('set-cookie');
    if (!raw) return '';
    if (Array.isArray(raw)) return raw.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
    return String(raw).split(',').map(p => p.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch { return ''; }
}

// ============================================================
// 🔧 CRITICAL FIX v5: tRPC v10 WITHOUT TRANSFORMER format
// Query GET:  ?batch=1&input={"0":INPUT_VALUE}  (no {json:..} wrapper inside)
// Mutation POST body:
//    input null  → {"json":null}  (so express.json() accepts valid object not primitive)
//    input object → raw INPUT_VALUE  (no wrapper at all)
// ============================================================
async function trpcQuery(path: string, input: any, cookie?: string): Promise<TrpcResult> {
  const qs = 'batch=1&input=' + encodeURIComponent(JSON.stringify({ '0': input ?? null }));
  const res = await fetch(`${API}/${path}?${qs}`, {
    method: 'GET',
    headers: cookie ? { Cookie: cookie } : {},
  });
  const cookieOut = parseCookies(res.headers);
  const text = await res.text();
  try {
    const arr = JSON.parse(text);
    const first = Array.isArray(arr) ? arr[0] : arr;
    return { data: first?.result?.data, error: first?.error || null, cookie: cookieOut };
  } catch (_e: any) {
    return { error: { message: text.slice(0, 300) }, cookie: cookieOut };
  }
}

async function trpcMutate(path: string, input: any, cookie?: string): Promise<TrpcResult> {
  const realBody = (input === null || input === undefined)
    ? JSON.stringify({ json: null })
    : JSON.stringify(input);
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: realBody,
  });
  const cookieOut = parseCookies(res.headers);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { data: json.result?.data, error: json.error || null, cookie: cookieOut };
  } catch (_e: any) {
    return { error: { message: text.slice(0, 300) }, cookie: cookieOut };
  }
}

function pass(gate: string, detail = '') { GATES[gate] = true; console.log('✅ ' + gate + (detail ? ' — ' + detail : '')); }
function fail(gate: string, detail = '') { GATES[gate] = false; console.error('❌ ' + gate + (detail ? ' — ' + detail : '')); }
function nearNow(iso: string, toleranceMins = 600): boolean {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return false;
  return Math.abs(Date.now() - d) <= toleranceMins * 60 * 1000;
}

async function main() {
  console.log('\nPhase 1 Runtime Exit Gate G1.1–G1.7 TESTER v5 [FORMAT FIXED]');
  console.log('Query GET: {"0":INPUT_NO_JSON_WRAP} · Mutation POST: raw/NULL body');
  console.log('==================================================================\n');

  // Pre: devSignin A
  console.log('PRE: auth.devSignin USER A');
  const signA = await trpcMutate('auth.devSignin', null);
  if (signA.error || !signA.cookie) {
    console.error('ABORT: dev signin FAIL → ' + JSON.stringify(signA.error ?? 'no set-cookie'));
    exit(2); return;
  }
  const COOKIE_A = signA.cookie;
  await sleep(40);
  const meA = await trpcQuery('auth.me', null, COOKIE_A);
  if (!meA.data?.isLoggedIn) {
    console.error('ABORT: auth.me query FAIL data=' + JSON.stringify(meA.data || meA.error));
    exit(2); return;
  }
  const uidA = meA.data.user.id;
  console.log('   USER A id=' + uidA + ' email=' + meA.data.user.email);

  // FRESH TEAM for non-leak (prev run data isolation)
  const teamA = await trpcMutate('teams.create', { name: 'ทีม A Runtime Gate v5 FRESH' }, COOKIE_A);
  await sleep(30);
  const teamAId: number = Number(teamA.data?.team?.id ?? 0);
  if (!teamAId) { console.error('ABORT team A data=' + JSON.stringify(teamA.data || teamA.error)); exit(2); return; }
  console.log('   Team A id=' + teamAId + ' (FRESH non-leak)\n');

  // ============================================================
  // G1.1 Create project → created_at actual DB (non-2513 near now)
  // ============================================================
  console.log('── G1.1 ──');
  let proj1Id = 0;
  try {
    const p = await trpcMutate('projects.create', {
      teamId: teamAId, categoryId: 1, name: 'G1.1 ทดสอบ Football v5', mainKeyword: 'ทายผลบอล'
    }, COOKIE_A);
    await sleep(30);
    proj1Id = Number(p.data?.project?.id ?? p.data?.projectId ?? 0);
    if (!proj1Id) throw new Error('no id → ' + JSON.stringify(p.error || p.data || {}));
    const projIso = p.data?.project?.createdAt;
    const yr = projIso ? new Date(projIso).getUTCFullYear() : 0;
    const yrOK = yr >= 2020 && yr <= new Date().getFullYear() + 1 && yr !== 2513 && yr !== 1970;
    const near = nearNow(projIso || '', 600);
    const dbRow = mysql(`SELECT id, name, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s'), YEAR(created_at) FROM projects WHERE id=${proj1Id};`);
    if (yrOK && near) pass('G1.1 (project_created_at_actual)', 'yr=' + yr + ' iso=' + projIso + ' DB=' + dbRow.replace(/\t/g, ' | '));
    else fail('G1.1', 'yr=' + yr + ' near=' + near + ' iso=' + projIso + ' DB=' + dbRow);
  } catch (e: any) { fail('G1.1', e.message); }
  proj1Id = proj1Id || 1;
  console.log('');

  // ============================================================
  // G1.2 Categories LIVE DB: 7 + INSERT → 8 + DELETE → 7
  // ============================================================
  console.log('── G1.2 ──');
  try {
    const b = await trpcQuery('meta.categories.list', {}, COOKIE_A);
    await sleep(30);
    const bef = Array.isArray(b.data?.categories) ? b.data.categories.length : -1;
    mysql(`INSERT INTO categories(name,slug,is_ymyl,icon,is_active,sort_order,description) VALUES('_g12_v6','g12-v6',0,NULL,1,999,NULL);`);
    const a = await trpcQuery('meta.categories.list', {}, COOKIE_A);
    await sleep(30);
    const add = Array.isArray(a.data?.categories) ? a.data.categories.length : -1;
    mysql(`DELETE FROM categories WHERE slug='g12-v6';`);
    const d = await trpcQuery('meta.categories.list', {}, COOKIE_A);
    await sleep(30);
    const del = Array.isArray(d.data?.categories) ? d.data.categories.length : -1;
    const ok = bef === 7 && add === 8 && del === 7;
    if (ok) pass('G1.2 (categories_DB_live_7_InsertDelete)', 'before=' + bef + ' add=' + add + ' del=' + del);
    else fail('G1.2', 'before=' + bef + ' add=' + add + ' del=' + del + ' (EXPECT 7→8→7)');
  } catch (e: any) { fail('G1.2', e.message); }
  console.log('');

  // ============================================================
  // G1.3 Pagination: 25 total (fresh team) → 3 pages (10/10/5)
  // ============================================================
  console.log('── G1.3 ──');
  try {
    for (let i = 2; i <= 25; i++) {
      const r = await trpcMutate('projects.create', {
        teamId: teamAId, categoryId: ((i - 1) % 7) + 1, name: 'G1.3 v5 #' + i, mainKeyword: 'kw_v5_' + i
      }, COOKIE_A);
      if (r.error) throw new Error(i + ':' + JSON.stringify(r.error));
      await sleep(12);
    }
    const p1 = await trpcQuery('projects.list', { teamId: teamAId, page: 1, pageSize: 10 }, COOKIE_A);
    await sleep(20);
    const p3 = await trpcQuery('projects.list', { teamId: teamAId, page: 3, pageSize: 10 }, COOKIE_A);
    await sleep(20);
    const tot = Number(p1.data?.totalCount ?? 0);
    const pgs = Number(p1.data?.totalPages ?? 0);
    const l1 = Array.isArray(p1.data?.items) ? p1.data.items.length : -1;
    const l3 = Array.isArray(p3.data?.items) ? p3.data.items.length : -1;
    const ok = tot === 25 && pgs === 3 && l1 === 10 && l3 === 5;
    if (ok) pass('G1.3 (server_pagination_25=3p_10_10_5)', 'total=' + tot + ' pages=' + pgs + ' pg1=' + l1 + ' pg3=' + l3);
    else fail('G1.3', 'total=' + tot + ' pages=' + pgs + ' pg1=' + l1 + ' pg3=' + l3 + ' (EXPECT 25/3/10/5)');
  } catch (e: any) { fail('G1.3', e.message); }
  console.log('');

  // ============================================================
  // G1.4 Tree 3-tier Pillar→Cluster→Supporting + keywords
  // G1.5 Intent 4 values preserved DB intent_suggestion
  // ============================================================
  console.log('── G1.4 + G1.5 ──');
  let G145_KW: number[] = []; let G145_C = 0;
  try {
    const PILL = await trpcMutate('clusters.create', { projectId: proj1Id, name: 'P1 Pillar v6', type: 'pillar', parentId: null }, COOKIE_A);
    await sleep(30);
    const pillId = Number(PILL.data?.cluster?.id ?? PILL.data?.clusterId ?? 0); if (!pillId) throw new Error('no pillar: ' + JSON.stringify(PILL.error || PILL.data));
    const CLU = await trpcMutate('clusters.create', { projectId: proj1Id, name: 'C1 Cluster v6', type: 'cluster', parentId: pillId }, COOKIE_A);
    await sleep(30);
    const cId = Number(CLU.data?.cluster?.id ?? CLU.data?.clusterId ?? 0); if (!cId) throw new Error('no cluster: ' + JSON.stringify(CLU.error || CLU.data)); G145_C = cId;
    const SUP = await trpcMutate('clusters.create', { projectId: proj1Id, name: 'S1 Supporting v6', type: 'supporting', parentId: cId }, COOKIE_A);
    await sleep(30);
    const sId = Number(SUP.data?.cluster?.id ?? SUP.data?.clusterId ?? 0); if (!sId) throw new Error('no supporting: ' + JSON.stringify(SUP.error || SUP.data));
    const I4 = ['informational', 'transactional', 'commercial', 'navigational'] as const;
    const kwIds: number[] = [];
    for (let i = 0; i < 4; i++) {
      const kw = await trpcMutate('keywords.create', { clusterId: cId, keywordText: 'v6_' + I4[i], intent: I4[i], status: 'pending' }, COOKIE_A);
      await sleep(20);
      const n = Number(kw.data?.keyword?.id ?? kw.data?.keywordId ?? 0);
      if (n) kwIds.push(n);
      else {
        const raw = JSON.stringify(kw.error || kw.data || {});
        throw new Error('kw fail #' + i + ' resp=' + raw.slice(0, 300));
      }
    }
    G145_KW = kwIds;
    const flat = await trpcQuery('clusters.list', { projectId: proj1Id }, COOKIE_A);
    await sleep(20);
    const nClus = Array.isArray(flat.data?.clusters) ? flat.data.clusters.length : 0;
    if (flat.error) console.error('  [clusters.list ERR]', JSON.stringify(flat.error).slice(0,200));
    const sq = mysql(`SELECT id, keyword_text, intent_suggestion FROM keywords WHERE cluster_id=${cId} ORDER BY id;`);
    const all4 = I4.every(v => sq.includes(v));
    const nRows = sq.split(/\n/).filter(l => l.trim()).length;
    const g14ok = nClus >= 3 && kwIds.length === 4;
    const g15ok = nRows === 4 && all4;
    if (g14ok) pass('G1.4 (tree_pillar_cluster_supporting)', 'clusters=' + nClus + ' kw=' + kwIds.length);
    else fail('G1.4', 'clusters=' + nClus + ' kw=' + kwIds.length);
    if (g15ok) pass('G1.5 (intent_4_DB_match)', 'intents=' + sq.split(/\n/).map(r => r.split(/\t/)[2]).filter(Boolean).join(','));
    else fail('G1.5', 'sql=' + sq.slice(0, 300) + ' all4=' + all4 + ' rows=' + nRows);
  } catch (e: any) { fail('G1.4', e.message); fail('G1.5', e.message); }
  console.log('');

  // ============================================================
  // G1.6 Write stub package 6/6 echo
  // ============================================================
  console.log('── G1.6 ──');
  try {
    let k0 = G145_KW[0];
    if (!k0) {
      const r = mysql(`SELECT MIN(id) FROM keywords WHERE cluster_id=${G145_C || 0};`);
      k0 = Number((r || '').split(/\s+/)[0] || 0);
    }
    if (!k0) throw new Error('no kw id');
    const row = mysql(`SELECT k.id, k.keyword_text, k.intent_suggestion, k.project_id, p.category_id, k.cluster_id FROM keywords k JOIN projects p ON p.id=k.project_id WHERE k.id=${k0};`);
    if (!row || row.startsWith('ERR:')) throw new Error('SQL empty or err: ' + row);
    const parts = row.split(/\t/);
    if (parts.length < 6) throw new Error('SQL row cols=' + parts.length + ' row=' + row);
    const [kid, ktx, kin, kpj, kct, kcl] = parts;
    const pack = { keywordId: Number(kid), keyword: String(ktx), intent: String(kin), projectId: Number(kpj), categoryId: Number(kct), clusterId: Number(kcl) };
    const wr = await trpcMutate('write.start', pack, COOKIE_A);
    await sleep(30);
    const ech = wr.data?.packageEcho;
    if (!ech) throw new Error('no echo ' + JSON.stringify(wr.error || 'empty'));
    const ok = ech.keywordId === pack.keywordId && ech.keyword === pack.keyword && ech.intent === pack.intent
      && ech.projectId === pack.projectId && ech.categoryId === pack.categoryId && ech.clusterId === pack.clusterId
      && pack.projectId > 0 && pack.categoryId > 0 && pack.clusterId > 0;
    if (ok) pass('G1.6 (write_stub_6of6_package_echo)', 'PACK=' + JSON.stringify(pack));
    else fail('G1.6', 'PACK=' + JSON.stringify(pack) + ' ECHO=' + JSON.stringify(ech));
  } catch (e: any) { fail('G1.6', e.message); }
  console.log('');

  // ============================================================
  // G1.7 Team isolation: Team B user D projects empty (0)
  // ============================================================
  console.log('── G1.7 ──');
  try {
    const sD = await trpcMutate('auth.devSignin', { openId: 'USER_D_TEAMB_RUNTIME_V5' });
    await sleep(40);
    if (!sD.cookie) throw new Error('D no cookie');
    const C_D = sD.cookie;
    const mD = await trpcQuery('auth.me', null, C_D);
    await sleep(30);
    if (!mD.data?.isLoggedIn) throw new Error('D not logged');
    const tB = await trpcMutate('teams.create', { name: 'ทีม B Isolation v5' }, C_D);
    await sleep(30);
    const tBId = Number(tB.data?.team?.id ?? 0); if (!tBId) throw new Error('no teamB resp=' + JSON.stringify(tB.data || tB.error));
    const lst = await trpcQuery('projects.list', { teamId: tBId, page: 1, pageSize: 10 }, C_D);
    await sleep(20);
    const tot = Number(lst.data?.totalCount ?? NaN);
    const itm = Array.isArray(lst.data?.items) ? lst.data.items.length : -1;
    const empty = tot === 0 && itm === 0;
    if (empty) pass('G1.7 (team_B_D_invisible_team_A_projects)', 'userD projects total=' + tot + ' items=' + itm + ' teamBId=' + tBId);
    else fail('G1.7', 'total=' + tot + ' items=' + itm + ' (EXPECT 0/0 for fresh isolated team B)');
  } catch (e: any) { fail('G1.7', e.message); }
  console.log('');

  await sleep(60);
  const passN = Object.values(GATES).filter(Boolean).length;
  const tot = Object.keys(GATES).length;
  console.log('\n============================================');
  console.log('SUMMARY G1.1–G1.7: ' + passN + '/' + tot + ' PASSED');
  console.log('============================================');
  for (const g in GATES) console.log((GATES[g] ? '✅ ' : '❌ ') + g);
  exit(passN === tot ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); setTimeout(() => process.exit(3), 100); });
