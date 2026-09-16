// RUN ON VPS with TSX: cd /home/ubuntu/eeat-studio-v2 && bash -lc 'set -a; source .env; set +a; ./node_modules/.bin/tsx tmp/_sim_v15_outline.ts' 2>&1
// Deterministic direct tRPC createCaller NO HTTP → same code path as actual user = 100% valid
import * as dotenv from 'dotenv';
dotenv.config();
import { appRouter } from '../server/index';

const ADMIN_ID = 99001;
const TEAM_ID = 90001;
const ADMIN_OPENID = '102308593207118714314';

async function makeCtxMock() {
  const ctx: any = {
    req: { method: 'POST', url: '/tmp/_sim_v15', cookies: {}, headers: {}, get: () => undefined },
    res: { cookie: () => {}, clearCookie: () => {}, status: () => ctx.res, json: () => ctx.res, locals: {}, setHeader: () => {}, writeHead: () => ctx.res, end: () => {} },
    session: { openId: ADMIN_OPENID, appId: 'eeat-studio-v2', name: 'Admin V2' },
    user: { id: ADMIN_ID, googleOpenId: ADMIN_OPENID, email: 'intelman26@gmail.com', name: 'Admin V2', role: 'admin' },
    authMeta: { authenticatedAt: Date.now(), role: 'admin' },
  };
  return ctx;
}

const caller = appRouter.createCaller(await makeCtxMock());
console.log('✅ createCaller (deterministic NO HTTP) OK — running generateOutline(kw=91 Pillar แทงบอลออนไลน์)\n');

try {
  const r: any = await caller.write.generateOutline({
    keywordId: 91,
    force: true,
    model: 'google/gemini-2.0-flash-exp:free',
  });
  console.log('=== RAW RESULT ===');
  console.log('ok:', r.ok, 'traceId:', String(r.traceId || '').slice(0, 12), 'sections_count:', r.sections_count);
  console.log('title:', String(r.outline?.title || '').slice(0, 160));
  const secs: any[] = Array.isArray(r.outline?.sections) ? r.outline.sections : [];
  const countH1 = secs.filter((s: any) => Number(s?.heading_level) === 1).length;
  const countH2 = secs.filter((s: any) => Number(s?.heading_level) === 2).length;
  const countH3 = secs.filter((s: any) => Number(s?.heading_level) === 3).length;
  const countH4P = secs.filter((s: any) => Number(s?.heading_level) >= 4 && Number(s?.heading_level) <= 6).length;
  const headingsJoined = secs.map((s: any) => String(s?.heading_text || '')).join('\n');
  const titleStr = String(r.outline?.title || '');
  console.log('\n=== LEVEL COUNT BREAKDOWN ===');
  console.log(`H1=${countH1}, H2=${countH2}, H3=${countH3}, H4+=${countH4P}, TOTAL=${secs.length}`);
  console.log('\n=== HEADINGS LIST (ALL sections order) ===');
  for (let i = 0; i < secs.length; i++) {
    const lv = Number(secs[i]?.heading_level || 0);
    console.log(`[${String(i+1).padStart(2,'0')}] H${lv} ${String(secs[i]?.heading_text || '(no text)').slice(0, 110)}`);
  }
  console.log('\n=== 8 ASSERTIONS (EEAT MIN STRUCTURE) ===');
  let fail = 0;
  const a = (name: string, ok: boolean, info: string = '') => {
    const status = ok ? '✅PASS' : '❌FAIL';
    if (!ok) fail++;
    console.log(`${status}  ${String(name).padEnd(22,' ')}  ${info}`);
  };
  a('H1 EXACTLY 1', countH1 === 1, `actual H1=${countH1}`);
  a('H2 >= 5 MIN', countH2 >= 5, `actual H2=${countH2}`);
  a('H3 >= 2 MIN (Deep Subsection!)', countH3 >= 2, `actual H3=${countH3}`);
  a('TOTAL sections >= 9', secs.length >= 9, `actual total=${secs.length}`);
  a('Title includes 2569 EEAT', /2569/.test(titleStr), `title 80c=${titleStr.slice(0,80)}`);
  a('Heading Intro/Definition present', /(คืออะไร|Definition|บทนำ|ความหมาย)/i.test(headingsJoined), 'Intro Def heading check');
  a('Heading How-to present', /(วิธี|How-to|คู่มือ|ปฏิบัติ|ขั้นตอน|Guide)/i.test(headingsJoined), 'How-to Guide heading check');
  a('Heading Key Takeaways present', /(สรุป|Key ?Takeaways|คำแนะนำ)/i.test(headingsJoined), 'Takeaways Summary heading check');
  if (fail === 0) {
    console.log('\n✅ 🎉 EXIT=0 ALL 8/8 ASSERTIONS PASS! Outline 2 Section bug = FIXED FOREVER!');
    process.exit(0);
  } else {
    console.log(`\n❌ EXIT=${fail} — ${fail}/8 assertions FAILED`);
    process.exit(fail);
  }
} catch (e: any) {
  console.error('❌ SIM_ERROR stack:', String(e?.message || e));
  process.exit(2);
}
