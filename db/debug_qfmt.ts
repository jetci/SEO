export {};
const API = 'http://localhost:3002/api/trpc';

async function get(path: string, queryInput: any, cookie?: string) {
  const qs1 = 'batch=1&input=' + encodeURIComponent(JSON.stringify({ '0': { json: queryInput ?? null } }));
  const res = await fetch(API + '/' + path + '?' + qs1, { method: 'GET', headers: cookie ? { Cookie: cookie } : {} });
  const text = await res.text();
  console.log('GET ' + path + ' s=' + res.status + ' len=' + text.length + ' ' + text.slice(0, 200));
  try { const j = JSON.parse(text); const arr = Array.isArray(j) ? j[0] : j; console.log('  data keys: ' + Object.keys(j?.result?.data || arr?.result?.data || j?.error || {}).join(',')); } catch {}
  return text;
}

async function post(path: string, body: any, cookie?: string) {
  const realBody = (body === null || body === undefined) ? JSON.stringify({json: null}) : JSON.stringify(body);
  const res = await fetch(API + '/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: realBody,
  });
  const text = await res.text();
  let data: any = null;
  try { const j = JSON.parse(text); data = j.result?.data; } catch {}
  const cookieHdr = (res.headers as any).get('set-cookie') || '';
  const C = Array.isArray(cookieHdr)
    ? cookieHdr.map((c: string) => c.split(';')[0]).join('; ')
    : String(cookieHdr).split(',').map((p: string) => p.split(';')[0].trim()).filter(Boolean).join('; ');
  console.log('POST ' + path + ' s=' + res.status + ' ' + text.slice(0, 200) + '\n');
  return { data, cookie: C };
}

async function run() {
  const s = await post('auth.devSignin', null);
  const C = s.cookie;
  const t = await post('teams.create', { name: 'TEAM_Q1' }, C);
  const teamId = t.data?.team?.id || t.data?.id; console.log('teamId =', teamId);

  await new Promise(r => setTimeout(r, 200));
  console.log('=== Query: meta.categories.list null input');
  await get('meta.categories.list', null, C);

  console.log('\n=== Query: projects.list obj input {teamId, page, pageSize}');
  await get('projects.list', { teamId, page: 1, pageSize: 10 }, C);

  setTimeout(() => process.exit(0), 100);
}
run().catch(e => { console.error('FATAL', e); setTimeout(() => process.exit(9), 50); });
