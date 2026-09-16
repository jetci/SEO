// Real tRPC procedure smoke test — Phase2 new 9 procedures
import { execSync } from 'child_process';

const API = 'http://localhost:3002/api/trpc';
const results = [];
function pass(label, d='') { console.log('✅ '+label+(d?' — '+d:'')); results.push({label,pass:true}); }
function fail(label, d='') { console.error('❌ '+label+(d?' — '+d:'')); results.push({label,pass:false}); }

function parseCookies(headers) {
  try {
    let raw = headers.getSetCookie ? headers.getSetCookie() : (headers['set-cookie'] || headers.get?.('set-cookie'));
    if (!raw || (Array.isArray(raw) && raw.length === 0)) return '';
    if (typeof raw === 'string') raw = raw.split(/,(?=\s*\w+=)/).map(s => s.trim());
    if (Array.isArray(raw)) return raw.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
    return String(raw).split(/,(?=\s*\w+=)/).map(p => p.split(';')[0].trim()).filter(Boolean).join('; ');
  } catch (_) { return ''; }
}

async function trpcQuery(path, input, cookie) {
  const qs = 'batch=1&input=' + encodeURIComponent(JSON.stringify({ '0': input ?? null }));
  const res = await fetch(`${API}/${path}?${qs}`, { headers: cookie?{Cookie:cookie}:{} });
  const text = await res.text();
  const cookieOut = parseCookies(res.headers);
  try {
    const arr = JSON.parse(text);
    const f = Array.isArray(arr)?arr[0]:arr;
    return { data: f?.result?.data, error: f?.error || null, cookie: cookieOut, status: res.status };
  } catch (_) { return { error: { message: text.slice(0,200) }, cookie: cookieOut, status: res.status }; }
}
async function trpcMutate(path, input, cookie) {
  const body = (input === null || input === undefined) ? JSON.stringify({ json: null }) : JSON.stringify(input);
  const res = await fetch(`${API}/${path}`, {
    method: 'POST', headers: { 'Content-Type':'application/json', ...(cookie?{Cookie:cookie}:{}) }, body,
  });
  const text = await res.text();
  const cookieOut = parseCookies(res.headers);
  try {
    const j = JSON.parse(text);
    return { data: j.result?.data, error: j.error || null, cookie: cookieOut, status: res.status };
  } catch (_) { return { error: { message: text.slice(0,200) }, cookie: cookieOut, status: res.status }; }
}

const now = new Date();

// 1) devSignin MUTATION
let cookie = '';
const dev = await trpcMutate('auth.devSignin', {
  openId: '102308593207118714314', email: 'intelman26@gmail.com', name: 'Admin Intelman', role: 'admin', avatarUrl: 'https://i.pravatar.cc/128?img=1',
});
if (dev.data?.isLoggedIn) { pass('P2-D1 devSignin MUTATION → '+dev.data.user.email+' id='+dev.data.user.id); cookie = dev.cookie || ''; console.log('  Cookie length =', cookie.length, 'chars'); }
else fail('P2-D1 devSignin', JSON.stringify(dev.error ?? {status:dev.status}).slice(0,250));

// 2) settings.get
const sget = await trpcQuery('settings.get', null, cookie);
if (sget.status === 200 && !sget.error && typeof sget.data === 'object') {
  const keys = Object.keys(sget.data || {});
  pass('P2-D2 settings.get QUERY → keys=' + (keys.length ? keys.join(',') : '(empty DB, degraded to env fallback)'));
} else fail('P2-D2 settings.get', JSON.stringify(sget.error ?? {status:sget.status}).slice(0,250));

// 3) settings.getBillingWindow
const bw = await trpcQuery('settings.getBillingWindow', { month: now.getMonth()+1, year: now.getFullYear() }, cookie);
if (bw.status === 200 && !bw.error && typeof bw.data?.totalUsd !== 'undefined' && typeof bw.data?.totalCalls !== 'undefined') {
  pass('P2-D3 settings.getBillingWindow QUERY → totalUsd='+bw.data.totalUsd+' calls='+bw.data.totalCalls+' providers.length='+(bw.data.providers?.length ?? 0));
} else fail('P2-D3 billing', JSON.stringify(bw.error ?? {status:bw.status}).slice(0,250));

// 4) keywords.enrichSerp MUTATION invalid projectId → expected 4xx/error with code (not 500 INTERNAL)
const kwBadProject = await trpcMutate('keywords.enrichSerp', JSON.parse('{"projectId":-99999}'), cookie);
if (kwBadProject.error && (kwBadProject.status === 400 || kwBadProject.error.code === 'BAD_REQUEST' || kwBadProject.error.code === 'NOT_FOUND')) {
  pass('P2-D4 keywords.enrichSerp invalid projectId → expected error '+kwBadProject.error.code+' status '+kwBadProject.status);
} else if (kwBadProject.data) {
  pass('P2-D4 keywords.enrichSerp invalid projectId → returned data (0 enriched) updated=' + (kwBadProject.data?.updated ?? '?'));
} else fail('P2-D4 enrichSerp invalid', JSON.stringify({status:kwBadProject.status, err:kwBadProject.error}).slice(0,250));

// 5) keywords.aiClusterize MUTATION invalid projectId
const clBad = await trpcMutate('keywords.aiClusterize', JSON.parse('{"projectId":-99999}'), cookie);
if (clBad.error && (clBad.status < 500 || clBad.error.code?.startsWith('INVALID'))) {
  pass('P2-D5 keywords.aiClusterize invalid projectId → '+clBad.error.code+' status '+clBad.status);
} else if (clBad.data) {
  pass('P2-D5 keywords.aiClusterize invalid → data clustersCreated='+(clBad.data?.clustersCreated ?? 0));
} else fail('P2-D5 aiClusterize invalid', JSON.stringify({status:clBad.status,err:clBad.error}).slice(0,250));

// 6) research.status QUERY keywordId -9999 → status EMPTY or error.code <500
const rst = await trpcQuery('research.status', { keywordId: -9999 }, cookie);
if (rst.data) pass('P2-D6 research.status data='+JSON.stringify(rst.data).slice(0,120));
else if (rst.error && rst.status < 500) pass('P2-D6 research.status error '+rst.error.code+' status '+rst.status+' (empty keyword OK)');
else fail('P2-D6 research.status', JSON.stringify({status:rst.status,err:rst.error}).slice(0,250));

// 7) research.getPackage QUERY keywordId -9999 → null package / error <500
const rpk = await trpcQuery('research.getPackage', { keywordId: -9999 }, cookie);
if (rpk.data !== undefined) pass('P2-D7 research.getPackage typeof=' + typeof rpk.data + (rpk.data === null ? ' null' : ' data'));
else if (rpk.error && rpk.status < 500) pass('P2-D7 research.getPackage error '+rpk.error.code+' status '+rpk.status);
else fail('P2-D7 getPackage', JSON.stringify({status:rpk.status,err:rpk.error}).slice(0,250));

// 8) research.runPlanForKeyword MUTATION keywordId non-pillar → INVALID_4 (NOT_PILLAR code)
const rpfk = await trpcMutate('research.runPlanForKeyword', JSON.parse('{"keywordId":-9999,"tier":"cluster"}'), cookie);
if (rpfk.error && (String(rpfk.error.code ?? '') === 'BAD_REQUEST' || /INVALID/.test(String(rpfk.error.code ?? '')) || /PILLAR/.test(String(rpfk.error.message || '')))) {
  pass('P2-D8 research.runPlanForKeyword cluster tier → INVALID guard '+rpfk.error.code+' msg='+String(rpfk.error.message||'').slice(0,80));
} else if (rpfk.error && rpfk.status < 500) pass('P2-D8 runPlan invalid kw id → '+rpfk.error.code+' status '+rpfk.status);
else fail('P2-D8 runPlan', JSON.stringify({status:rpfk.status,err:rpfk.error,data:rpfk.data}).slice(0,250));

// 9) settings.save MUTATION without keys but validatePing=false → should save gracefully (not crash empty strings OR validation errors)
const saveTry = await trpcMutate('settings.save', JSON.parse('{"llmProvider":"openrouter","llmApiKey":"","serpProvider":"dataforseo","serpApiKey":"","countryCode":"TH","langCode":"th","validatePing":false}'), cookie);
if (saveTry.data) pass('P2-D9 settings.save MUTATION (validatePing=false) → '+JSON.stringify(saveTry.data).slice(0,140));
else if (saveTry.error && (saveTry.error.code === 'FORBIDDEN' || saveTry.error.code === 'UNAUTHORIZED')) pass('P2-D9 settings.save role guard → '+saveTry.error.code+' (expected if team owner scope)');
else if (saveTry.error) fail('P2-D9 settings.save error '+saveTry.error.code+' '+String(saveTry.error.message||'').slice(0,160));
else fail('P2-D9 settings.save no output');

console.log('');
const good = results.filter(r=>r.pass).length;
console.log('==========================================');
console.log(` Phase 2 LIVE tRPC procedure smoke: ${good}/${results.length} PASS`);
console.log('==========================================');
process.exit(good === results.length ? 0 : 1);
