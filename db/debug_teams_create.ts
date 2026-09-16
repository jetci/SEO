import { execSync } from 'child_process';

const API = 'http://localhost:3002/api/trpc';

async function safeFetch(url: string, opts: any): Promise<{ status: number; text: string; headers: any }> {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    const cookieRaw = (res.headers as any).get('set-cookie') || '';
    return { status: res.status, text, headers: { setCookie: cookieRaw } };
  } catch (e: any) {
    console.error('FETCH THROW:', e.message || e);
    return { status: 0, text: String(e), headers: {} };
  }
}

function parseCookies(h: any): string {
  const r = h.setCookie || '';
  if (!r) return '';
  if (Array.isArray(r)) return r.map((c: string) => c.split(';')[0]).join('; ');
  return String(r).split(',').map((p: string) => p.split(';')[0].trim()).filter(Boolean).join('; ');
}

async function run() {
  console.log('1. devSignin POST');
  const r1 = await safeFetch(API + '/auth.devSignin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: null }),
  });
  console.log('   status=' + r1.status + ' len=' + r1.text.length);
  console.log('   resp HEAD (200ch):', r1.text.slice(0, 200));
  const COOKIE = parseCookies(r1.headers);
  console.log('   COOKIE:', COOKIE.slice(0, 100));

  await new Promise(r => setTimeout(r, 500));

  console.log('\n2. auth.me GET');
  const r2 = await safeFetch(API + '/auth.me?batch=1&input=' + encodeURIComponent(JSON.stringify({ '0': { json: null } })), {
    method: 'GET',
    headers: COOKIE ? { Cookie: COOKIE } : {},
  });
  console.log('   status=' + r2.status + ' len=' + r2.text.length);
  console.log('   resp:', r2.text.slice(0, 300));

  await new Promise(r => setTimeout(r, 500));

  console.log('\n3. teams.create POST');
  const r3 = await safeFetch(API + '/teams.create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(COOKIE ? { Cookie: COOKIE } : {}) },
    body: JSON.stringify({ json: { name: 'debug team x' } }),
  });
  console.log('   status=' + r3.status + ' len=' + r3.text.length);
  console.log('   resp (500ch):', r3.text.slice(0, 500));
  try {
    const j = JSON.parse(r3.text);
    console.log('   parsed result data:', JSON.stringify(j.result?.data || j.error || {}).slice(0, 200));
  } catch { console.log('   JSON parse fail'); }

  await new Promise(r => setTimeout(r, 500));
  console.log('\n4. projects.create POST');
  const r4 = await safeFetch(API + '/projects.create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(COOKIE ? { Cookie: COOKIE } : {}) },
    body: JSON.stringify({ json: { teamId: 1, categoryId: 1, name: 'DBG', mainKeyword: 'x' } }),
  });
  console.log('   status=' + r4.status + ' len=' + r4.text.length);
  console.log('   resp (500ch):', r4.text.slice(0, 500));
  try {
    const j = JSON.parse(r4.text);
    console.log('   parsed result data:', JSON.stringify(j.result?.data || j.error || {}).slice(0, 200));
  } catch { console.log('   JSON parse fail'); }

  console.log('\nDONE no crash');
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(4); });
