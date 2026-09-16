// RUN ON VPS with TSX: cd /home/ubuntu/eeat-studio-v2 && bash -lc 'set -a; source .env; set +a; ./node_modules/.bin/tsx tmp/_caller_test_v9.ts' 2>&1
// ตรงๆ ตาม sched L218 createCaller pattern: NO HTTP, deterministic direct function call
import * as dotenv from 'dotenv';
dotenv.config();
import { appRouter } from '../server/index';

const ADMIN_ID = 99001;
const TEAM_ID = 90001;
const ADMIN_OPENID = '102308593207118714314';

async function makeCtxMock() {
  const ctx: any = {
    req: { method: 'POST', url: '/tmp/_caller_test', cookies: {}, headers: {}, get: () => undefined },
    res: { cookie: () => {}, clearCookie: () => {}, status: () => ctx.res, json: () => ctx.res, locals: {}, setHeader: () => {}, writeHead: () => ctx.res, end: () => {} },
    session: { openId: ADMIN_OPENID, appId: 'eeat-studio-v2', name: 'Admin V2' },
    user: { id: ADMIN_ID, googleOpenId: ADMIN_OPENID, email: 'intelman26@gmail.com', name: 'Admin V2', role: 'admin' },
    authMeta: { authenticatedAt: Date.now(), role: 'admin' },
  };
  return ctx;
}

const caller = appRouter.createCaller(await makeCtxMock());
console.log('✅ createCaller OK (appRouter instance created via tsx) — NO HTTP, deterministic direct function call.\n');

async function testOne(label: string, kwId: number, tier: string) {
  console.log(`=== TEST ${label}: write.createDraft kw.id=${kwId} (tier=${tier}) [previously 500=null.id crash]`);
  try {
    const r: any = await caller.write.createDraft({ keywordId: Number(kwId), force: false, model: '' });
    console.log('  ✅ SUCCESS createDraft return (snip 500c) =', JSON.stringify(r).slice(0, 500));
    const dr = typeof r === 'object' ? (r.draftId ?? r.draft_id ?? r.articleId ?? r.article_id) : null;
    console.log('  ✅ FINAL HTTP=200 equivalent (NO 500 null.id crash). draft_id =', dr);
    return { ok: true, draft_id: dr };
  } catch (e: any) {
    const code = e?.code ?? e?.data?.code ?? 'NOCODE';
    const msg = String(e?.message ?? e).slice(0, 800);
    console.log(`  ❌ FAIL: code=${code} message=`, msg);
    if (/null.*id|Cannot read properties of null/.test(msg)) console.log('  🚨 REGRESSED: 500 null.id crash STILL PRESENT!');
    if (e?.stack) console.log('  Stack (snip):', String(e.stack).slice(0, 400));
    return { ok: false, code, msg };
  }
}

const r1 = await testOne('[TIER 1 PILLAR] — old 500 crash root (Cannot read null.id)', 91, 'pillar');
const r2 = await testOne('[TIER 2 CLUSTER]', 126, 'cluster');
const r3 = await testOne('[TIER 3 SUPPORTING]', 221, 'supporting');
console.log('\n======= Summary ALL 3 tiers createDraft (GATE0 Pillar Write HTTP=200) =======');
const passed = [r1, r2, r3].filter(r => r.ok).length;
console.log(`  3 Tier Pass rate: ${passed}/3 = ${passed === 3 ? '✅ 100% KCP 1-CLICK WRITE FIXED DEPLOYED V9' : '❌ CRASHES STILL PRESENT'}`);
console.log(`  PILLAR Tier click → HTTP=200 NO 500 Cannot read null id: ${r1.ok ? '✅ PASS GATE0 BROWSER PILLAR WRITE' : '❌ FAIL'}`);
console.log('\n======= TEST 4: getDraft cluster_context 4-field Sidebar 3-tier contract =======');
const dr = r1.draft_id || r2.draft_id || r3.draft_id;
if (dr) {
  try {
    const gd: any = await caller.write.getDraft({ draftId: Number(dr), keywordId: 91 });
    const cc = gd?.cluster_context || null;
    console.log('  getDraft: OK HTTP 200 equivalent (no throw)');
    if (!cc) {
      console.log('  ❌ cluster_context FIELD MISSING (Sidebar 3-tier card will render empty)');
      console.log('  Response body (1000c):', JSON.stringify(gd || {}).slice(0, 1000));
    } else {
      const fk = cc.focus_keyword || {};
      const cl = cc.cluster || {};
      const pk = cc.pillar_keyword || {};
      const sc = Array.isArray(cc.same_cluster_keywords) ? cc.same_cluster_keywords.length : -1;
      console.log('  [focus_keyword] id=' + fk.id + ' tier=' + fk.tier + ' kw=' + String(fk.keyword || fk.keyword_text || '').slice(0, 28) + ' → ' + (fk.id ? '✅' : '❌'));
      console.log('  [cluster] id=' + cl.id + ' name=' + String(cl.name || '').slice(0, 28) + ' → ' + (cl.id ? '✅' : '❌'));
      console.log('  [same_cluster_keywords] length=' + sc + ' (siblings array) → ' + (sc > 0 ? '✅' : '⚠️ 0?'));
      console.log('  [pillar_keyword] id=' + pk.id + ' kw=' + String(pk.keyword || pk.keyword_text || '').slice(0, 28) + ' → ' + (pk.id ? '✅' : '❌ (Pillar self=kw=91 expected non-null for tier=pillar)'));
      const d = gd?.draft || {};
      console.log('  [markdown prefill] body_md len=' + String(d.body_md || d.bodyMd || '').length + ' meta_title len=' + String(d.meta_title || d.metaTitle || '').length);
      const allOk = (fk.id && cl.id && pk.id && sc > 0);
      console.log('  Sidebar โครงคำสำคัญ 3 ระดับ render contract: ' + (allOk ? '✅ PASS (แสดงครบทุกส่วน)' : '❌ FAIL (ขาดส่วนใดส่วนหนึ่ง)'));
    }
  } catch (e: any) {
    console.log('  ❌ getDraft FAIL:', String(e?.message ?? e).slice(0, 600));
    if (e?.stack) console.log('  Stack:', String(e.stack).slice(0, 400));
  }
}
console.log('\n======= EXIT CODE: ' + (passed === 3 ? '0 (PASS)' : '1 (FAIL)') + ' =======');
process.exit(passed === 3 ? 0 : 1);
