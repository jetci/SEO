export {};
const API = 'http://localhost:3002/api/trpc';

async function post(path: string, body: any, cookie?: string) {
  const res = await fetch(API + '/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log('POST ' + path + ' status=' + res.status);
  console.log('  BODY_SENT: ' + JSON.stringify(body).slice(0, 120));
  console.log('  RESP: ' + text.slice(0, 280) + '\n');
  const cookieHdr = (res.headers as any).get('set-cookie') || '';
  const C = Array.isArray(cookieHdr)
    ? cookieHdr.map((c: string) => c.split(';')[0]).join('; ')
    : String(cookieHdr).split(',').map((p: string) => p.split(';')[0].trim()).filter(Boolean).join('; ');
  let data = null, err = null;
  try { const j = JSON.parse(text); data = j.result?.data || (Array.isArray(j)? j[0]?.result?.data : null); err = j.error || (Array.isArray(j) ? j[0]?.error : null); } catch {}
  return { data, err, cookie: C };
}

async function run() {
  console.log('=== TEST 1: OLD format {json: X} (current broken) ===\n');
  const s1 = await post('auth.devSignin', { json: null });
  const C1 = s1.cookie;
  await post('teams.create', { json: { name: 'TEST1 OLD' } }, C1);

  await new Promise(r => setTimeout(r, 300));
  console.log('\n=== TEST 2: NEW batch format {"0":{json:X}} (correct) ===\n');
  const s2 = await post('auth.devSignin', { '0': { json: null } });
  const C2 = s2.cookie;
  const t2 = await post('teams.create', { '0': { json: { name: 'TEST2 BATCH' } } }, C2);
  console.log('  teamId returned: ' + JSON.stringify(t2.data));

  await new Promise(r => setTimeout(r, 300));
  if (t2.data?.id) {
    const p = await post('projects.create', { '0': { json: { teamId: Number(t2.data.id), categoryId: 1, name: 'Test2 Proj', mainKeyword: 'x' } } }, C2);
    console.log('  projects.create returned: ' + JSON.stringify(p.data));
  }

  await new Promise(r => setTimeout(r, 300));
  console.log('\nDONE exit after 100ms');
  setTimeout(() => process.exit(0), 100);
}
run().catch(e => { console.error('FATAL', e); setTimeout(() => process.exit(5), 50); });
