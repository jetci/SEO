import { execSync } from 'child_process';

const API = 'http://localhost:3002/api/trpc';
function mysql(sql: string): string {
  const safe = sql.replace(/"/g, '\\"');
  try { return execSync(`docker exec eeat-mysql mysql -ueeat -peeat_secret eeat_studio_v2 -B -N -e "${safe}"`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e: any) { return 'ERR:' + String(e?.stderr ?? e).slice(0, 300); }
}
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function parseCookies(resHeaders: any): string {
  const r = resHeaders.get('set-cookie') || '';
  if (!r) return '';
  if (Array.isArray(r)) return r.map(c => c.split(';')[0]).join('; ');
  return String(r).split(',').map(p => p.split(';')[0].trim()).filter(Boolean).join('; ');
}
async function Q(path: string, input: any, cookie?: string) {
  const qs = 'batch=1&input=' + encodeURIComponent(JSON.stringify({ '0': { json: input ?? null } }));
  const res = await fetch(API + '/' + path + '?' + qs, { method: 'GET', headers: cookie ? { Cookie: cookie } : {} });
  const t = await res.text(); const c = parseCookies(res.headers);
  try {
    const a = JSON.parse(t); const f = Array.isArray(a) ? a[0] : a;
    return { data: f?.result?.data, err: f?.error || null, cookie: c, raw: t.slice(0, 300) };
  } catch { return { data: null, err: null, cookie: c, raw: t.slice(0, 300) }; }
}
async function M(path: string, input: any, cookie?: string) {
  const body = (input === null || input === undefined) ? JSON.stringify({json:null}) : JSON.stringify(input);
  const res = await fetch(API + '/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body });
  const t = await res.text(); const c = parseCookies(res.headers);
  try { const j = JSON.parse(t); return { data: j?.result?.data, err: j?.error || null, cookie: c, raw: t.slice(0, 400) }; }
  catch { return { data: null, err: null, cookie: c, raw: t.slice(0, 400) }; }
}

async function run() {
  console.log('SQL: project, cluster, keyword counts (before)');
  console.log('  projects total:', mysql('SELECT COUNT(*) FROM projects;'));
  console.log('  clusters total:', mysql('SELECT COUNT(*) FROM clusters;'));
  console.log('  keywords total:', mysql('SELECT COUNT(*) FROM keywords;'));
  console.log('  teams rows:', mysql('SELECT id,name FROM teams;'));

  console.log('\nPRE devSignin');
  const s = await M('auth.devSignin', null); const C = s.cookie;
  console.log('  devSignin ok=', !!s.data, 'cookieLen=', C.length);

  await sleep(40);
  console.log('\nM: teams.create');
  const t = await M('teams.create', { name: 'DEBUG_TEAM_D' }, C);
  console.log('  team data:', JSON.stringify(t.data).slice(0,200));
  const teamId = Number(t.data?.team?.id ?? 0); console.log('  teamId=', teamId, 'err:', t.err ? JSON.stringify(t.err).slice(0,100) : '');

  await sleep(30);
  console.log('\nM: projects.create (1)');
  const p = await M('projects.create', { teamId, categoryId: 1, name: 'DBG_PRJ', mainKeyword: 'dbg_kw' }, C);
  console.log('  p.data keys:', Object.keys(p.data || {}));
  console.log('  project JSON:', JSON.stringify(p.data).slice(0, 250));
  const projId = Number(p.data?.project?.id ?? p.data?.projectId ?? 0);
  console.log('  projId=', projId);

  await sleep(20);
  const sqlProj = mysql('SELECT id,team_id,name,DATE_FORMAT(created_at,"%Y-%m-%d %H:%i:%s"),YEAR(created_at) FROM projects WHERE id=' + projId);
  console.log('  SQL proj row:', sqlProj);
  console.log('  Date.now() ISO:', new Date(Date.now()).toISOString());

  await sleep(20);
  console.log('\nQ: meta.categories.list');
  const mc = await Q('meta.categories.list', null, C);
  console.log('  meta.data keys:', Object.keys(mc.data || {}));
  console.log('  cats len:', mc.data?.categories?.length ?? 'N/A');

  await sleep(20);
  console.log('\nM: clusters.create x3 (pillar, cluster, supporting)');
  const PILL = await M('clusters.create', { projectId: projId, name: 'DBG_PILL', type: 'pillar', parentId: null }, C);
  console.log('  PILL:', JSON.stringify(PILL.data || PILL.err).slice(0, 200));
  const pillId = Number(PILL.data?.cluster?.id ?? PILL.data?.clusterId ?? 0);
  await sleep(15);
  const CLU = await M('clusters.create', { projectId: projId, name: 'DBG_CLU', type: 'cluster', parentId: pillId }, C);
  console.log('  CLU:', JSON.stringify(CLU.data || CLU.err).slice(0, 200));
  const cId = Number(CLU.data?.cluster?.id ?? CLU.data?.clusterId ?? 0);
  await sleep(15);
  const SUP = await M('clusters.create', { projectId: projId, name: 'DBG_SUP', type: 'supporting', parentId: cId }, C);
  console.log('  SUP:', JSON.stringify(SUP.data || SUP.err).slice(0, 200));
  console.log('  pillId=', pillId, 'cId=', cId);

  await sleep(20);
  console.log('  SQL clusters rows:', mysql('SELECT id,project_id,parent_id,type,name FROM clusters WHERE project_id=' + projId));
  console.log('  SQL clusters count:', mysql('SELECT COUNT(*) FROM clusters WHERE project_id=' + projId));

  await sleep(20);
  console.log('\nQ: clusters.list');
  const cl = await Q('clusters.list', { projectId: projId }, C);
  console.log('  cl.data keys:', Object.keys(cl.data || {}));
  const clusArr = cl.data?.clusters;
  console.log('  clusters len:', Array.isArray(clusArr) ? clusArr.length : 'NOT_ARRAY');
  console.log('  err:', cl.err ? JSON.stringify(cl.err).slice(0,200) : 'none');
  if (Array.isArray(clusArr) && clusArr[0]) console.log('  cluster sample:', JSON.stringify(clusArr[0]).slice(0, 200));

  await sleep(20);
  console.log('\nM: keywords.create x4 (intents 4 values)');
  const I4 = ['informational', 'transactional', 'commercial', 'navigational'];
  const kids: number[] = [];
  for (let i = 0; i < 4; i++) {
    const k = await M('keywords.create', { clusterId: cId, keywordText: 'dbg_' + I4[i], intent: I4[i], status: 'pending' }, C);
    const n = Number(k.data?.keywordId ?? 0);
    console.log('  kw' + i + ' kwId=' + n + (k.err ? ' ERR=' + JSON.stringify(k.err).slice(0,120) : ' OK'));
    if (n) kids.push(n); await sleep(15);
  }
  console.log('  SQL kw rows:', mysql('SELECT id,cluster_id,keyword_text,intent_suggestion,project_id,category_id FROM keywords WHERE cluster_id=' + cId));

  await sleep(50);
  console.log('\n--- G1.3 scenario: CREATE 24 more (total 25 projs) → pagination');
  for (let i = 2; i <= 25; i++) {
    const r = await M('projects.create', { teamId, categoryId: ((i - 1) % 7) + 1, name: 'DBG_P25 #' + i, mainKeyword: 'kw_p25_' + i }, C);
    if (r.err) { console.log('  FAIL i=' + i + ' ' + JSON.stringify(r.err).slice(0, 150)); break; }
  }
  await sleep(20);
  for (let pg = 1; pg <= 4; pg++) {
    const lp = await Q('projects.list', { teamId, page: pg, pageSize: 10 }, C);
    console.log('  pg' + pg + ': totalCount=' + lp.data?.totalCount + ' pages=' + lp.data?.totalPages + ' itemsLen=' + (lp.data?.items?.length ?? 'NA'));
    if (lp.err) console.log('    err:', JSON.stringify(lp.err).slice(0,100));
  }

  setTimeout(() => process.exit(0), 100);
}
run().catch(e => { console.error('FATAL', e); setTimeout(() => process.exit(9), 60); });
