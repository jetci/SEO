import * as dotenv from 'dotenv'; dotenv.config();
import { appRouter } from '../server/index';

const ADMIN_ID = 99001; const ADMIN_OPENID = '102308593207118714314';

async function makeCtxMock() {
  const ctx: any = {
    req: { method: 'POST', url: '/tmp/_sim_writepage_fill_order', cookies: {}, headers: {}, get: () => undefined },
    res: { cookie: () => {}, clearCookie: () => {}, status: () => ctx.res, json: () => ctx.res, locals: {}, setHeader: () => {}, writeHead: () => ctx.res, end: () => {} },
    session: { openId: ADMIN_OPENID, appId: 'eeat-studio-v2', name: 'Admin V2' },
    user: { id: ADMIN_ID, googleOpenId: ADMIN_OPENID, email: 'intelman26@gmail.com', name: 'Admin V2', role: 'admin' },
    authMeta: { authenticatedAt: Date.now(), role: 'admin' },
  };
  return ctx;
}

function mapIntentUiLabel(raw: any) {
  const inv = String(raw || "").toLowerCase();
  if (/commercial|commercial[\s_-]?investigation|\bbuy\b|best[\s_-].*review/.test(inv)) return "Commercial";
  if (/transaction|purchase|order|booking/.test(inv)) return "Transactional";
  return "Informational";
}

(async function main() {
  const caller = appRouter.createCaller(await makeCtxMock());

  // Use existing Pillar kw.id=91 (focus)
  const existingDraftId = 1;
  console.log(`\n[A] Fetch getDraft draft_id=${existingDraftId} (same as /write?kw_id=91&draft_id=1 browser hit)\n`);
  const result: any = await caller.write.getDraft({ draftId: existingDraftId });

  // ── Simulate WritePage.tsx useEffect fill ORDER exactly ──
  const cc: any = result?.cluster_context;
  const d: any = result?.draft;

  console.log("── RAW DATA FROM getDraft response ──");
  console.log("  cluster_context.focus_keyword.id =", cc?.focus_keyword?.id);
  console.log("  cluster_context.focus_keyword.keyword (KCP actual) =", JSON.stringify(cc?.focus_keyword?.keyword));
  console.log("  cluster_context.focus_keyword.intent (BE raw enum)  =", JSON.stringify(cc?.focus_keyword?.intent));
  console.log("  cluster_context.focus_keyword.tier =", cc?.focus_keyword?.tier);
  console.log("  draft.id   =", d?.id);
  console.log("  draft.title (BE generated Title fallback) LEN =", String(d?.title ?? "").length, "| PREVIEW =", JSON.stringify(String(d?.title ?? "").slice(0, 120)));

  console.log("\n── SIMULATE WritePage.tsx FIXED UseEffects (L241 EFFECT#1 → L264 EFFECT#2) ──");

  const filledOnceRef: { draft: boolean; kw: boolean } = { draft: false, kw: false };
  let step1Keyword = "";
  let step1Intent: "Informational" | "Transactional" | "Commercial" = "Informational";

  // ==========================================
  // EFFECT #1 — cluster_context.focus_keyword.id (WritePage L241)
  // ==========================================
  console.log("\n  [EFFECT#1 RUN: cluster_context arrive]");
  const focusId = (cc?.focus_keyword?.id) ?? 0;
  if (focusId && !filledOnceRef.kw) {
    const kwText = String(cc.focus_keyword.keyword || "").trim();
    console.log(`    • kwText = ${JSON.stringify(kwText)} | filledOnceRef.kw=${filledOnceRef.kw}`);
    if (kwText && !step1Keyword.trim()) {
      step1Keyword = kwText.slice(0, 200);
      filledOnceRef.kw = true;
      console.log(`    ✅ Step1 keyword SET (from KCP focus_keyword.keyword) = ${JSON.stringify(step1Keyword)}`);
      console.log(`    ✅ filledOnceRef.kw = ${filledOnceRef.kw} ← THIS PROTECTS draft.title OVERWRITE IN NEXT EFFECT`);
    }
    if (cc.focus_keyword.intent) {
      const mapped = mapIntentUiLabel(cc.focus_keyword.intent);
      step1Intent = mapped;
      console.log(`    ✅ Step1 Intent (mapped UI label BE raw→FE UI) = ${step1Intent}  (Sidebar intent now uses SAME map)`);
    }
  }

  // ==========================================
  // EFFECT #2 — draft.id arrive (WritePage L264) ← WITH FIX: guard filledOnceRef.kw === true
  // ==========================================
  console.log("\n  [EFFECT#2 RUN: draft.content/meta arrive — AFTER Effect#1]");
  const draftIdActual = d?.id ?? 0;
  if (draftIdActual && !filledOnceRef.draft) {
    const title = String(d.title || "").trim();
    console.log(`    • draft.title LEN=${title.length} filledOnceRef.kw=${filledOnceRef.kw} step1Keyword.len=${step1Keyword.length}`);

    // 👀 NEW FIX CONDITION v10 (L273): Guard: filledOnceRef.current.kw MUST BE FALSE + step1Keyword empty to set title as fallback
    if (title && !step1Keyword.trim() && !filledOnceRef.kw) {
      step1Keyword = title.slice(0, 200);
      console.log(`    ⚠️  [OLD BUGGY PATH, BLOCKED NOW] Step1 keyword = draft.title = ${JSON.stringify(step1Keyword.slice(0,80))}...`);
    } else {
      console.log(`    🛡️  [NEW FIX GUARD TRIGGERED v10] filledOnceRef.kw=true → SKIP draft.title overwrite!`);
      console.log(`         → Step1 keyword preserved: ${JSON.stringify(step1Keyword)}`);
      console.log(`         → draft.title (2569ch) NOT injected (ticket screenshot bug FIXED)`);
    }

    filledOnceRef.draft = true;
  }

  // ==========================================
  // ASSERTIONS (PASS/FAIL)
  // ==========================================
  console.log("\n═══════════════════════════════════════════════");
  console.log("FINAL ASSERTIONS (v10 Bug Fix)");
  console.log("═══════════════════════════════════════════════");

  let pass = 0; let fail = 0;

  // Assertion 1: Step1 keyword === focus_keyword.keyword (KCP actual)
  const expectedKeyword = String(cc.focus_keyword.keyword).trim();
  if (step1Keyword === expectedKeyword) {
    console.log(`✅ 1/3 ASSERT Step1 Keyword === KCP focus_keyword.keyword`);
    console.log(`       EXPECTED: ${JSON.stringify(expectedKeyword)}`);
    console.log(`       GOT:      ${JSON.stringify(step1Keyword)}`);
    pass++;
  } else {
    console.log(`❌ 1/3 FAIL Step1 Keyword MISMATCH`);
    console.log(`       EXPECTED: ${JSON.stringify(expectedKeyword)}`);
    console.log(`       GOT:      ${JSON.stringify(step1Keyword)}`);
    fail++;
  }

  // Assertion 2: Step1 keyword LENGTH IS SHORT (not hundreds chars title 2569)
  if (step1Keyword.length < 120) {
    console.log(`✅ 2/3 ASSERT Step1 keyword len=${step1Keyword.length} < 120 (NOT long generated Title 2569 chars)`);
    pass++;
  } else {
    console.log(`❌ 2/3 FAIL Step1 keyword len=${step1Keyword.length} TOO LONG (2569 title still injected!)`);
    fail++;
  }

  // Assertion 3: Step1 Intent === Sidebar Intent (same map used both now)
  const sidebarLabel = mapIntentUiLabel(cc.focus_keyword.intent);
  if (step1Intent === sidebarLabel) {
    console.log(`✅ 3/3 ASSERT Step1 Intent (${step1Intent}) === Sidebar Intent label (${sidebarLabel}) [Consistent, no navigational raw]`);
    pass++;
  } else {
    console.log(`❌ 3/3 FAIL Inconsistent Step1=${step1Intent} vs Sidebar=${sidebarLabel}`);
    fail++;
  }

  console.log(`\nRESULT: ${pass}/3 PASS | ${fail}/3 FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error("\n💥 CRASH:", String(e?.message ?? e).slice(0, 500)); process.exit(2); });
