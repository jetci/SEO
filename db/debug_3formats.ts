export {};
const API = 'http://localhost:3002/api/trpc';

async function post(path: string, body: any, label: string, cookie?: string) {
  const res = await fetch(API + '/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let isOk = '❌';
  try {
    const j = JSON.parse(text);
    const hasRes = !!(j.result?.data || (Array.isArray(j) && j[0]?.result?.data));
    const hasErr = j.error || (Array.isArray(j) && j[0]?.error);
    isOk = hasRes ? '✅' : (hasErr ? '❌' : '?');
  } catch {}
  console.log(label + ' ' + isOk + '  status=' + res.status);
  console.log('  BODY: ' + JSON.stringify(body).slice(0, 150));
  console.log('  RESP: ' + text.slice(0, 250) + '\n');
  const cookieHdr = (res.headers as any).get('set-cookie') || '';
  const C = Array.isArray(cookieHdr)
    ? cookieHdr.map((c: string) => c.split(';')[0]).join('; ')
    : String(cookieHdr).split(',').map((p: string) => p.split(';')[0].trim()).filter(Boolean).join('; ');
  return { cookie: C };
}

async function run() {
  console.log('=== devSignin RAW NO WRAP (body=null) for cookie ===');
  const s1 = await post('auth.devSignin', null, 'FMT-A raw:null');
  const s2 = await post('auth.devSignin', { json: null }, 'FMT-B {json:null}');
  const s3 = await post('auth.devSignin', { '0': { json: null } }, 'FMT-C {"0":{json:null}}');
  const C = s2.cookie || s3.cookie;
  console.log('COOKIE len:', C.length, '\n');

  await new Promise(r => setTimeout(r, 200));
  console.log('=== teams.create 3 FORMATS ===');
  await post('teams.create', { name: 'T1 RAW' }, 'FMT-A raw: {name}', C);
  await post('teams.create', { json: { name: 'T2 JSON-WRAP' } }, 'FMT-B {json:{name}}', C);
  await post('teams.create', { '0': { json: { name: 'T3 BATCH' } } }, 'FMT-C {"0":{json:{name}}}', C);
  await post('teams.create', { json: JSON.stringify({ name: 'T4 JSON-STRINGIFIED?' }) }, 'FMT-D json=STRING', C);

  await new Promise(r => setTimeout(r, 300));
  setTimeout(() => process.exit(0), 100);
}
run().catch(e => { console.error(e); setTimeout(() => process.exit(9), 50); });
