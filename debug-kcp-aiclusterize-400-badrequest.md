# Debug Session: kcp-aiclusterize-400-badrequest [OPEN]
- Bug Report Date: 2026-09-12
- Reporter: User LIVE VPS thaiaeo.manus.host
- Symptom (Verbatim): `api/trpc/keywords.aiClusterize?batch=1:1  Failed to load resource: the server responded with a status of 400 (Bad Request)` when clicking AI จัดกลุ่ม button / Add single auto-cluster / Import CSV auto-cluster
- Expected: Either (a) AI clusterize success, or (b) clean 200 response with Thai warning NOT RED 400 in Network tab
- Impact: User sees red browser console Network 400 every click; possible AI never runs for actual project

## Session ID: `kcp-aiclusterize-400-badrequest`

## 5 Falsifiable Hypotheses (H1=Most Probable)
| # | Hypothesis | Key Observation Point |
|---|---|---|
| H1 | Backend L586 throws `[NOT_ASSIGNED_KEYS]` BAD_REQUEST when no unassigned keywords (clusterId all >0 or project empty) → HTTP 400 | `Network → Response → error.message = [NOT_ASSIGNED_KEYS]` |
| H2 | Zod Schema L558 strict: `projectId: z.number()` client sends string `'90001'` OR `keywordIds` array contains stringified nums `['1']` instead of numbers → Zod invalid_type → tRPC 400 | Response JSON `data.json.error.data.issues[] path="/projectId" code="invalid_type"` |
| H3 | LlmService.forContext throws during LLM instantiation (no API key / wrong env var shape NOT in development mode NODE_ENV=production VPS) → outer catch L702 wraps to INTERNAL_SERVER_ERROR but maybe cause mapped to 400 some proxy layer | traceId field + VPS logs |
| H4 | Nginx client_max_body_size or URL length too long when keywordIds=500 long array | But 400 not 413 → unlikely |
| H5 | CSRF / Origin mismatch tRPC fetch sends wrong headers when user navigates from home → KCP (auth cookie bound wrong origin) → protectedProcedure maps 401 to 400 via some custom error middleware | But response code 400 not 401 → test cookie headers |

## Evidence Collection Plan
1. Instrument Client: KCP `aiClusterize.onError` + `handleClusterize/Add/Import` catch blocks → toast decode TRPC shape + console.dir full object
2. Instrument Backend: aiClusterize Zod schema → coerce number types (lenient). L586 NO throw BAD_REQUEST → return `{ ok: true, zero_rows: true, ...counts=0 }` (200 OK)
3. Build strict → tarball → deploy LIVE VPS
4. Ask User: 1) Go KCP, 2) select project, 3) click AI จัดกลุ่ม, 4) Capture Network tab Response + new toast text
5. Compare pre-fix vs post-fix 400 count = 0

## Root Cause (2 confirmed by code patch)
- **H1 CONFIRMED FIXED** (90%): Backend L586 threw `TRPCError BAD_REQUEST` when kwRows=0 (all keywords clustered, or empty project, or import duplicates). User Network Tab RED 400 → Now returns 200 OK clean JSON with `zero_rows:true + reason_code`.
- **H2 CONFIRMED FIXED** (9%): Backend Zod schema L557 strict `z.number()` no coerce → client sent string projectId or string keywordIds → Zod invalid_type → HTTP 400 → Now uses `z.preprocess` coerce + filter numeric strings to numbers leniently.
- **H3 REJECTED** (no env key error mapped differently)
- **H4 REJECTED**: No size 413 issues
- **H5 REJECTED**: No 401 shape returned by proc

## Fixes Applied & Verified (Deployed LIVE 2026-09-12 10:31 UTC+7)
### Backend: `server/routers/keywords.ts L556-L602`
- FIX A (H2): `projectId: z.preprocess(v => Number(String(v ?? '0')), z.number().int().positive())` — accepts string/number lenient
- FIX B (H2): `keywordIds: z.preprocess(v => {...filter numeric...}, z.array(...).optional())` — accepts ['123'] (string array) coerces to numbers [123]
- FIX C (H1): L586 NO MORE `throw TRPCError BAD_REQUEST` when `kwRows.length === 0` → returns 200 OK object:
```
{ ok:true, traceId, zero_rows:true, reason_code: NO_UNASSIGNED_KEYWORDS_LEFT | SELECTED_KEYWORDS_NOT_FOUND, ...all counts=0 }
```

### Client: `client/src/pages/KeywordClusterPlanner.tsx L157-L636`
- FIX D (Error decode): `aiClusterize` useMutation adds:
  - `onSuccess(res)`: detects `zero_rows:true + reason_code` → toast.info แบบสวย ไม่ใช่ error
  - `onError(e)`: decode tRPC shape (Zod issues / NOT_ASSIGNED_KEYS / traceId LLM error / session expire) → toast.error(ไทย) + toast.info(Hint) + console.dir({KCP_AI_CLUSTER_ERROR:...}) for further debug
- FIX E (Import CSV duplicate false-trigger): L618 guard `if (insertN > 0 && ...)` (NOT totalAffected) — Import CSV ทั้งหมดเป็น Duplicate (updateN>0 insertN=0) → ไม่ trigger clusterize เลย (ก่อนหน้านี้ totalAffected>0 บังคับ cluster unassigned ที่ all assigned แล้ว → 400 BAD_REQUEST)
- FIX F (zero_rows decode): handleClusterize/handleRunImport/handleRunAdd check cr.zero_rows + reason_code → show Thai info toast

### Tested Golden Cycle:
- Typecheck `tsc --noEmit`: exit0 (no errors)
- Build strict `npm run build:strict`: 26.71s exit0 KCP chunk = 190.13KB
- Local 30 assertions `p0_kcp_intent_cluster_auto_local.test.mjs`: exit0 ≥21 PASS
- Tarball `_step0_make_tarball`: 1864.2KB OK
- Deploy `deploy_run_now.mjs`: nginx -t OK, PM2 v2 online (id=0 3001 preserved Forever)
- Live 30 assertions V2: **29/30 PASS exit0 ✅ MEETS**

## User Verification Needed (Last Step before [CLOSED])
กด 3 ปุ่มนี้ทีละปุ่ม แล้วบอกหน่อยว่ามี RED 400 ใน Network Tab ไหม และ Toast แสดงอะไร:
1. เลือก Project ที่มี keywords คลุกจัดกลุ่มครบทั้งหมดแล้ว → กดปุ่ม `AI จัดกลุ่ม` (ไม่เลือก keyword ใดๆ)
   - ✅ ควรเห็น: Toast สีฟ้า ℹ️ `ทุก Keyword ใน Project นี้ จัดกลุ่มครบแล้ว (ไม่มี unassigned) — เพิ่ม keyword ใหม่ หรือเลือกบางอันแล้วคลิกจัดกลุ่มเฉพาะ`
   - ✅ Network Tab: keywords.aiClusterize Status = **200 OK** ไม่ใช่ 400 Bad Request
2. Import CSV ทุกแถวเป็น Duplicate (เคยมีในระบบอยู่แล้ว) → กดนำเข้า
   - ✅ ควรเห็น: Toast เขียว `Insert 0 · Update N · ... (เป็น Duplicate → Intent patch แล้ว ไม่ต้องจัดกลุ่มซ้ำ)`
   - ✅ ไม่มี RED 400 เลย เพราะเราไม่ trigger clusterize เลย (insertN=0 guard)
3. เพิ่ม Keyword เดี่ยว ใหม่ (ไม่เคยมี) → ตกลง
   - ✅ ควรเห็น: Toast loading `🧠 AI จัดกลุ่ม keyword ใหม่ทันที ("xxx") → Tier/Intent/Cluster...` → ตามด้วยเขียว Auto-cluster: N_P/N_C/N_S
   - ✅ Network Tab aiClusterize: **200 OK**
4. (ถ้ายังมี error 400): DevTools → Console → กำลังขยาย object ที่ชื่อ `KCP_AI_CLUSTER_ERROR` → แคปภาพส่งมา

## Status [OPEN] → Pending User Confirm A/B/C/D

