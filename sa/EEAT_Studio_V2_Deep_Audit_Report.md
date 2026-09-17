# EEAT Studio V2 — Deep Audit Report

**repo:** github.com/jetci/SEO  
**Stack:** React + Vite + tRPC v10 + Drizzle ORM (MySQL) + Express 5, deploy Vercel

## บทสรุปสำหรับผู้บริหาร

กลไก RBAC ทั้งระบบไม่ทำงานตามออกแบบ เพราะ ctx.user ไม่เคยถูก hydrate การตรวจสิทธิ์ admin จึงตกไปพึ่ง session.openId === ADMIN_OPENID (hardcode ค่าเดียว) ทำให้มี system-admin ได้คนเดียว ยังพบ backdoor login ใน production, scheduler auto-publish ที่พังทุกครั้ง, และ dev mock ที่อาจรั่วสู่ production. หมายเหตุ: handoff report เดิมอ้าง 298/298 pass / เสร็จ 100% แต่บั๊ก RBAC ระดับวิกฤตชี้ว่าเทสน่าจะ mock ctx.user ไว้

### สรุปจำนวนปัญหาตามระดับความร้ายแรง

| ระดับ | จำนวน |
|---|---|
| 🔴 วิกฤต | 6 |
| 🟠 สูง | 7 |
| 🟡 กลาง | 6 |
| 🟢 ต่ำ | 4 |

---

## RBAC Core (กระทบทุกบทบาท)

### RBAC-01 — ctx.user ไม่เคยถูก hydrate → RBAC ทั้งระบบพังเงียบ

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - createContext() กำหนด user:null เสมอ คอมเมนต์ว่า 'hydrated later in 0.4b RBAC' แต่ไม่มีโค้ดที่ไหน hydrate เลย (grep 'ctx.user =' ไม่พบ)
  - resolveRole() ข้าม branch ctx.user.role เสมอ ตกไปที่ session.openId === ADMIN_OPENID เท่านั้น
  - ผู้ใช้ role='admin' ใน DB แต่ openId ไม่ตรง ADMIN_OPENID จะถูกปฏิบัติเป็น writer เสมอ
- **วิธีแก้ไข:**
  - เพิ่ม middleware hydrateUser ต่อจาก isAuthenticated: query users ด้วย ctx.session.openId แล้ว attach เป็น ctx.user
  - protectedProcedure = publicProcedure.use(isAuthenticated).use(hydrateUser)
  - เพิ่ม integration test ที่ไม่ mock ctx.user เพื่อพิสูจน์ว่า role จาก DB ถูกใช้จริง
- **เอกสารจัดเก็บที่:** `server/_core/trpc.ts (L77 user:null); server/_core/middleware/rbac.ts (resolveRole)`

### RBAC-02 — admin router import adminProcedure แต่ไม่ได้ใช้ — ใช้ inline check ที่ผิด

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - ทุก procedure ใน admin.ts ใช้ protectedProcedure ไม่ใช่ adminProcedure
  - กันสิทธิ์แบบ inline: if(ctx.user?.role!=='admin') throw UNAUTHORIZED แต่ ctx.user เป็น null เสมอ → เงื่อนไขจริงเสมอ → admin จริงก็โดน block
  - โค้ด dead L76-78 คอมเมนต์สับสน ('No, we wrap inline')
- **วิธีแก้ไข:**
  - เปลี่ยนทุก procedure เป็น adminProcedure ลบ inline check ออกให้หมด (single source of truth)
  - ลบโค้ด dead L76-78
- **เอกสารจัดเก็บที่:** `server/routers/admin.ts (L75-L203)`

### RBAC-03 — teamId hardcode = 90001 ในการอ่าน settings ของ admin

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - getSettingsMasked ใช้ ctx.teamId ?? 90001 แต่ ctx.teamId ไม่มีจริง → ใช้ 90001 เสมอ
  - 90001 hardcode ซ้ำใน serpClient (DEFAULT_ADMIN_TEAM) และ schedulerWorker (SYSTEM_TEAM_ID) โดยไม่รับประกันว่ามีทีมนี้จริง
  - admin ทีมอื่นเห็น/แก้ settings ของทีม 90001 = tenant leak
- **วิธีแก้ไข:**
  - resolve teamId จริงผ่าน resolveTeamIdForSettings(ctx)
  - ย้าย system team/admin id ไป ENV เดียว + seed ใน migration
- **เอกสารจัดเก็บที่:** `server/routers/admin.ts (L158)`

---

## Guest (ยังไม่ล็อกอิน)

### GUEST-01 — ไม่มี Route Guard ฝั่ง client — ทุกหน้าเข้าถึง URL ได้โดยตรง

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - ทุก route render component ตรง ๆ ไม่มี wrapper ตรวจ isLoggedIn
  - Guest พิมพ์ URL ตรงเห็นโครงหน้าก่อนโดน backend ตอบ UNAUTHORIZED ภายหลัง (กันด้วย timer 500ms = workaround)
  - /audit (admin) อยู่กลุ่มเดียวกัน ไม่มีกันระดับ route
- **วิธีแก้ไข:**
  - สร้าง <RequireAuth>/<RequireAdmin> ครอบ route กลุ่ม protected/admin
  - redirect /login ทันทีเมื่อ me.data.isLoggedIn===false
- **เอกสารจัดเก็บที่:** `client/src/App.tsx`

### GUEST-02 — route /members และ /teams redirect ไปหน้าแรกตายตัว = ฟีเจอร์ค้าง

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - backend teams.addMember/changePermission มีอยู่ แต่ไม่มีหน้า UI ให้ใช้ — เพิ่มสมาชิกทีมผ่านเว็บไม่ได้
- **วิธีแก้ไข:**
  - สร้างหน้า Team Management เชื่อม teams router หรือซ่อนเมนู/route + ระบุใน roadmap
- **เอกสารจัดเก็บที่:** `client/src/App.tsx (L37-41)`

---

## Writer (ผู้เขียนบทความ)

### WRITER-01 — dev-fallback mock อาจรั่วสู่ production — คืนข้อมูลปลอมแทน error

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - หลาย procedure ใช้ catch(e){ if(NODE_ENV==='development') return mockData }
  - พึ่ง process.env.NODE_ENV โดยตรง ต่างจาก IS_DEV/IS_PROD ที่รวม VERCEL — ถ้า env ตั้งพลาด mock อาจทำงานบน production
  - DB ล่มแต่ผู้ใช้เห็น 'สร้างสำเร็จ' (mock:true) = silent data loss
  - teams.create fallback ownerId=1 ตายตัว อาจผูกทีมผิดตัว
- **วิธีแก้ไข:**
  - ใช้ IS_DEV จาก env.ts แทน process.env.NODE_ENV ทุกจุด
  - บน production throw error จริงเสมอ ห้ามคืน mock
  - ลบ mock ที่ return ownerId=1 / insertId=Date.now()
- **เอกสารจัดเก็บที่:** `server/routers/projects.ts, teams.ts (catch block เช็ค NODE_ENV)`

### WRITER-02 — insertId ดึงมาไม่แน่นอน มี fallback = Date.now()

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - อ่าน insertId ด้วย chain ยาว ... ?? Date.now() — ถ้ารูปแบบผลลัพธ์ไม่ตรง fallback เป็น timestamp = id เพี้ยน query ตามไม่เจอ
  - extractInsertId copy ซ้ำใน write.ts และ research.ts
- **วิธีแก้ไข:**
  - helper กลาง getInsertId(res) คืน number หรือ throw (ห้าม fallback timestamp)
  - ใช้ .$returningId() ของ drizzle หรือ LAST_INSERT_ID() ในทรานแซกชันเดียว
- **เอกสารจัดเก็บที่:** `teams.ts, projects.ts, write.ts, research.ts`

### WRITER-03 — Article Writer สร้าง PLACEHOLDER เมื่อ LLM ล้ม แต่ยังนับเป็น draft ปกติ

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - LLM ล้มครบ 5/5 → ใส่ placeholder ลงเนื้อหา แต่ยาวพอผ่าน MIN_BODY_CHARS จึงนับเป็นสำเร็จ
  - บทความมีเนื้อหาปลอมปนโดยสถานะยัง draft ปกติ ผู้เขียนอาจเผลอ publish
- **วิธีแก้ไข:**
  - เมื่อเกิด placeholder ให้ mark stepStatus='fail' หรือ flag กัน publish + เตือนใน UI
  - บันทึกจำนวน section placeholder ให้ Admin Audit เห็นคุณภาพจริง
- **เอกสารจัดเก็บที่:** `server/services/articleWriterService.ts (L384-395)`

### WRITER-04 — getById/getActive ซ่อน error เป็น null — UI แยกไม่ออก 'ไม่มีสิทธิ์' vs 'ไม่มีข้อมูล'

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - FORBIDDEN/NOT_FOUND/DB error กลายเป็น null เหมือนกันหมด client แยกไม่ออก
- **วิธีแก้ไข:**
  - ปล่อย TRPCError โยนตามจริง ให้ client จัดการตาม error.code
- **เอกสารจัดเก็บที่:** `server/routers/projects.ts (getById catch → return null)`

---

## Admin

### ADMIN-01 — backdoor: devSignin ทำงานได้ใน production ผ่าน password 'test1234'

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - มี isTestUser = input.password === 'test1234' และ if(IS_PROD && !isTestUser && ...) throw → ส่ง test1234 ข้ามการบล็อก production ได้
  - openId กำหนด role ได้ ถ้าใช้ ADMIN_OPENID (เป็น default ในโค้ด เดาได้) จะได้ admin ทันที = ยึดระบบ
  - debug log (AUTH_DEBUG_V16) print password ทีละ char code ลง console
- **วิธีแก้ไข:**
  - ลบเงื่อนไข isTestUser==='test1234' ทันที (นี่คือ backdoor)
  - production ปิด devSignin สมบูรณ์ เหลือเฉพาะ Google OAuth
  - ลบ console.warn ที่ log password/char codes ทั้งหมด
  - ย้าย ADMIN_OPENID/ADMIN_EMAIL ออกจาก default ในโค้ด ไปเป็น ENV บังคับ
- **เอกสารจัดเก็บที่:** `server/auth.ts (devSignin mutation)`

### ADMIN-02 — AdminAuditPage ไม่มี guard ฝั่ง client เลย (ไม่ใช้ useAuth)

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - ไม่ import useAuth ไม่ตรวจ role — render เนื้อหา admin ทันทีที่เข้า /audit
  - non-admin เห็นโครงหน้า/spinner และ query error ทั้งหน้า = UX แย่ + เผยโครงสร้าง
- **วิธีแก้ไข:**
  - ครอบ <RequireAdmin> หรือเช็ค user.role==='admin' แล้ว render 'ไม่มีสิทธิ์'
- **เอกสารจัดเก็บที่:** `client/src/pages/AdminAuditPage.tsx`

### ADMIN-03 — นิยาม isAdmin ฝั่ง client ไม่ตรงกับฝั่ง server

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - client: admin = role==='admin' || permission==='owner'|'admin' (team permission)
  - server: admin = users.role==='admin' เท่านั้น
  - owner ที่ role=writer เห็นปุ่ม admin ฝั่ง UI แต่ server ปฏิเสธ = สับสน
- **วิธีแก้ไข:**
  - กำหนดนิยาม admin capability ให้ตรงกันสองฝั่ง เอกสารแยก role (ระบบ) vs permission (ทีม) ให้ชัด
- **เอกสารจัดเก็บที่:** `client/src/pages/SettingsPage.tsx (L50); MainDashboardShell.tsx (L106)`

### ADMIN-04 — AES key ใช้ SESSION_SECRET ร่วมกับ session JWT — ผูก 2 หน้าที่เข้าด้วยกัน

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - คีย์เข้ารหัส API key = sha256(SESSION_SECRET) ตัวเดียวกับเซ็น JWT
  - หมุน SESSION_SECRET เพื่อความปลอดภัย session จะทำให้ API key ที่เข้ารหัสไว้ decrypt ไม่ได้ (ข้อมูลสูญ)
  - env.ts มี fallback SESSION_SECRET='FALLBACK_UNSAFE_...' บน Vercel = คีย์เดาได้
- **วิธีแก้ไข:**
  - แยก ENCRYPTION_KEY ต่างหากจาก SESSION_SECRET
  - ลบ fallback secret hardcode ถ้าไม่ตั้งให้ fail ชัดเจน
- **เอกสารจัดเก็บที่:** `server/routers/settings.ts (getEncryptionKey); server/_core/sdk.ts`

---

## System / Scheduler

### SCHED-01 — Scheduler auto-publish พังทุกครั้ง — เรียก protectedProcedure ด้วย session=undefined

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - scheduler สร้าง caller ด้วย session:undefined แล้วเรียก write.publish (protectedProcedure)
  - isAuthenticated ตรวจ ctx.session.openId = undefined → throw UNAUTHORIZED เสมอ
  - ฟีเจอร์ตั้งเวลาเผยแพร่ (Phase 3) ไม่เคยทำงานสำเร็จ บทความค้างเป็น draft
  - publish ใช้ assertProjectAccess query จาก openId → หา user ไม่เจอ
- **วิธีแก้ไข:**
  - สร้าง systemProcedure หรือ service function ที่ไม่ผ่าน RBAC ปกติ สำหรับ background job
  - หรือ inject session ที่มี openId จริงของ system account ที่ seed ไว้
  - เพิ่ม integration test จำลอง scheduler tick
- **เอกสารจัดเก็บที่:** `server/workers/schedulerWorker.ts (L74); server/app.ts (L219); server/routers/write.ts (publish)`

### SCHED-02 — Scheduler ทำงานเฉพาะ IS_PROD && !VERCEL — บน Vercel serverless ไม่มี cron

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - บล็อก scheduler กันด้วย IS_PROD && !VERCEL เพราะ serverless ไม่มี process ค้างรัน setInterval
  - deploy หลักคือ Vercel → บน production จริงจะไม่มี scheduler เลย auto-publish ตายสนิท
- **วิธีแก้ไข:**
  - ใช้ Vercel Cron Jobs ยิงมา /api/cron/publish ป้องกันด้วย secret header
  - หรือย้าย scheduler ไป VPS/worker แยก แล้วระบุสถาปัตยกรรมให้ชัด
- **เอกสารจัดเก็บที่:** `server/app.ts (L192)`

---

## Database (Drizzle/MySQL)

### DB-01 — schema.ts มี 13 tables แต่คอมเมนต์หัวไฟล์ยังเขียน '8 Tables ONLY'

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - หัวไฟล์ประกาศ 8 Tables ONLY แต่จริงมี 13 (settings, serp_metric_cache, research_packages, research_audit, write_articles, project_brand_voices)
  - คอมเมนต์ไม่ตรงสคีมาจริง สับสนว่าอะไรคือ source of truth
- **วิธีแก้ไข:**
  - อัปเดตคอมเมนต์ให้ตรงจำนวนตารางจริง + ระบุตารางไหนจาก migration ไหน
  - รัน drizzle-kit generate เทียบ DB จริง ตรวจ drift
- **เอกสารจัดเก็บที่:** `db/schema.ts`

### DB-02 — articles.content เป็น text แต่คาดหวัง LONGTEXT — เสี่ยงเนื้อหายาวถูกตัด

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - บทความ EEAT 1500+ คำอาจเกิน 64KB; MySQL TEXT default = 64KB ถ้า migration สร้างเป็น TEXT ธรรมดา เนื้อหาถูกตัดเงียบ
- **วิธีแก้ไข:**
  - ตรวจ DDL migration 0001 ว่า content เป็น LONGTEXT; ถ้าไม่ ให้ ALTER
  - เพิ่ม test เขียน >64KB ยืนยันบันทึก/อ่านครบ
- **เอกสารจัดเก็บที่:** `db/schema.ts (articles.content)`

### DB-03 — loadSettingsForTeam ลบ row ที่ decrypt ไม่ได้ทิ้งอัตโนมัติ

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - decrypt ไม่สำเร็จ (เช่น secret เปลี่ยน) → db.delete row ทันที ถ้า secret ผิดชั่วคราว API key หายถาวรโดยไม่แจ้ง
- **วิธีแก้ไข:**
  - เปลี่ยนจากลบ เป็น mark invalid + log + แจ้ง admin ตั้งค่าใหม่
- **เอกสารจัดเก็บที่:** `server/routers/settings.ts (loadSettingsForTeam)`

---

## API / tRPC

### API-01 — client ใช้ httpLink (ไม่ batch) แต่คอมเมนต์อ้าง httpBatchLink

- **ความร้ายแรง:** 🟢 ต่ำ
- **ปัญหาที่ตรวจพบ:**
  - โค้ดใช้ httpLink (ยิงทีละ request) แต่คอมเมนต์อ้าง httpBatchLink = เอกสารไม่ตรงโค้ด
  - ไม่ batch → Dashboard ยิงหลาย query พร้อมกัน เปิดหลาย connection = ช้า + เป็นเหตุ race 401
- **วิธีแก้ไข:**
  - เปลี่ยนเป็น httpBatchLink รวม request ลด race+latency แล้วปรับคอมเมนต์
- **เอกสารจัดเก็บที่:** `client/src/trpc.ts`

### API-02 — auth race handling ซับซ้อนเกิน — 4-5 ชั้น interceptor แก้อาการไม่แก้เหตุ

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - จัดการ 401 ถึง 4-5 ชั้น (fetch wrapper, QueryClient onError x2, useAuth effect, module cache TTL 5 นาที) + คอมเมนต์ PHASE 2I/2J/2K
  - รากปัญหา: ยิง protected query ก่อน auth.me resolve; cache/timer กลบอาการ เพิ่มจุดพังใหม่ (cache ค้างคิดว่ายัง login)
- **วิธีแก้ไข:**
  - แก้ต้นเหตุ: gate protected query รอ auth.me resolve (RequireAuth) แล้วถอด interceptor ซ้อน
- **เอกสารจัดเก็บที่:** `client/src/trpc.ts + hooks/useAuth.ts`

### API-03 — errorFormatter ซ่อน stack เฉพาะ INTERNAL_SERVER_ERROR — error อื่นยังเผยรายละเอียดภายใน

- **ความร้ายแรง:** 🟢 ต่ำ
- **ปัญหาที่ตรวจพบ:**
  - prod ซ่อนเฉพาะ INTERNAL_SERVER_ERROR; BAD_REQUEST/FORBIDDEN ยังส่งข้อความละเอียด (เช่น 'Your role: member', team id)
- **วิธีแก้ไข:**
  - prod ลดรายละเอียด error ที่เผย internal id/role เก็บใน server log พร้อม traceId
- **เอกสารจัดเก็บที่:** `server/_core/trpc.ts (errorFormatter)`

---

## UX / UI

### UX-01 — redirect ใช้ setTimeout 500ms เดา — กระพริบ/หลุดล็อกอินชั่วคราว

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - guard redirect ใช้ setTimeout 500ms รอ auth resolve = เดาเวลา ไม่ deterministic เครื่องช้าอาจ redirect ทั้งที่ login อยู่
- **วิธีแก้ไข:**
  - ผูก redirect กับสถานะจริง me.isSuccess && !isLoggedIn ผ่าน RequireAuth
- **เอกสารจัดเก็บที่:** `client/src/layouts/MainDashboardShell.tsx (L94-98)`

### UX-02 — เมนู 'ตั้งค่าระบบ' และ 'Admin Audit' แสดงให้ทุก role เห็น

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - เมนู settings/audit ไม่กรองตาม role — writer เห็นเมนูที่กดแล้วใช้ไม่ได้
- **วิธีแก้ไข:**
  - กรองเมนูตาม user.role/capability ซ่อนเมนู admin จาก writer
- **เอกสารจัดเก็บที่:** `client/src/layouts/MainDashboardShell.tsx`

### UX-03 — KeywordClusterPlanner 290KB / WritePage 177KB — ไฟล์เดียวยักษ์

- **ความร้ายแรง:** 🟢 ต่ำ
- **ปัญหาที่ตรวจพบ:**
  - component หน้าเดียว 290KB/177KB รวม logic+UI+state ไว้ที่เดียว ยากดูแล/ทดสอบ/code-split
- **วิธีแก้ไข:**
  - แตกเป็น sub-component/hook แยก business logic ออกจาก presentation
- **เอกสารจัดเก็บที่:** `client/src/pages/KeywordClusterPlanner.tsx, WritePage.tsx`

---

## หนี้ทางเทคนิค / ไฟล์ปนใน repo

### DEBT-01 — ไฟล์ debug/log/temporary หลุดเข้ามาใน repo

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - ไฟล์ log/debug/cache/temp จำนวนมาก commit เข้ามา (~185 .mjs) repo รก + เสี่ยงข้อมูลภายใน/เส้นทาง deploy หลุด
- **วิธีแก้ไข:**
  - เพิ่ม *.log, .cache_*, deploy_tmp/, .vercel/, debug_*, _tmp_* เข้า .gitignore แล้วลบออกจาก repo
- **เอกสารจัดเก็บที่:** `backend.log, vite*.log, .cache_vps_builder_now.ts (80KB), db/debug_*.ts, debug_*.mjs, deploy_tmp/, .vercel/`

### DEBT-02 — debug logging ระดับ verbose ค้างใน production path

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - devSignin มี console.warn 15+ บรรทัด print input.password, char codes, ADMIN_OPENID ทุกครั้งที่ถูกเรียก รันบน production ด้วย
  - ความลับอาจถูกเก็บใน log ของ Vercel/PM2
- **วิธีแก้ไข:**
  - ลบ AUTH_DEBUG_V16 ทั้งหมด หรือ gate ด้วย IS_DEV ห้าม log credential ทุกกรณี
- **เอกสารจัดเก็บที่:** `server/auth.ts (AUTH_DEBUG_V16)`

### DEBT-03 — โค้ด extractInsertId / sessionCookieDomain ซ้ำหลายไฟล์

- **ความร้ายแรง:** 🟢 ต่ำ
- **ปัญหาที่ตรวจพบ:**
  - ฟังก์ชันเดียวกัน copy-paste หลายไฟล์ แก้ที่เดียวไม่ครบ เสี่ยง drift
- **วิธีแก้ไข:**
  - ย้ายไป util กลาง (server/_core/util.ts) import ใช้ร่วม
- **เอกสารจัดเก็บที่:** `write.ts, research.ts (extractInsertId); trpc.ts, auth.ts (sessionCookieDomain)`

---

## แผนการแก้ไขตามลำดับความสำคัญ

**ลำดับ 1 (ก่อน deploy — ความปลอดภัย/ฟีเจอร์หลัก):** ADMIN-01, RBAC-01, RBAC-02, SCHED-01, WRITER-01, DEBT-02

**ลำดับ 2 (เร่งด่วน — ความถูกต้องข้อมูล):** WRITER-02, WRITER-03, DB-02, RBAC-03, ADMIN-02, SCHED-02, GUEST-01

**ลำดับ 3 (สปรินต์ถัดไป — UX/ความสอดคล้อง):** ADMIN-03, ADMIN-04, DB-01, DB-03, API-02, UX-01, UX-02, WRITER-04, GUEST-02, DEBT-01

**ลำดับ 4 (ปรับปรุงคุณภาพ):** API-01, API-03, UX-03, DEBT-03

