# รายงานเจาะลึก: หน้าตั้งค่าระบบ (Settings)

**EEAT Studio V2** — LLM Key / SERP Key / Billing / การเข้ารหัส / สิทธิ์

ขอบเขต: `server/routers/settings.ts` + `client/src/pages/SettingsPage.tsx`

## ภาพรวม

หน้านี้จัดการ config ต่อทีม: LLM provider+key, SERP provider+key, default country/lang, แสดง billing usage รายเดือน คีย์เข้ารหัส AES-256-GCM เก็บในตาราง settings ต่อทีม

Backend 5 procedure: `get` (protected), `save`/`resetKey`/`getBillingWindow`/`pingCurrent` (admin)

## จุดที่ทำได้ดี

- AES-256-GCM (authenticated encryption) ไม่เก็บ plaintext + roundtrip verify หลังบันทึก
- save แก้เฉพาะ country/lang ได้โดยไม่ต้องพิมพ์ key ใหม่ (B1 fix)
- get คืน key แบบ masked ไม่ส่ง key จริงกลับ client
- ping provider จริงก่อนบันทึก ช่วยจับ key ผิดตั้งแต่ต้น

---

## ปัญหาที่ตรวจพบ

### SET-01 — RBAC ซ้อน 2 กลไกที่ขัดแย้งกัน — admin ระดับระบบ vs permission ระดับทีม

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - save/resetKey/pingCurrent ผูก 2 ด่าน: (1) adminProcedure ตรวจ users.role==='admin' (2) assertTeamAccess ตรวจ team permission owner/admin
  - จาก RBAC-01: resolveRole อ่าน ctx.user (null เสมอ) → เทียบ session.openId===ADMIN_OPENID → มีแค่ system-admin คนเดียวผ่านด่านแรก
  - team owner/admin ที่ควรตั้ง key ทีมตัวเองได้ โดน isAdmin block ก่อน เพราะ users.role เขาเป็น 'writer'
  - สองด่านตอบคนละคำถาม (สิทธิ์ระบบ vs สิทธิ์ทีม) แต่ถูก AND กัน = ตั้งค่าไม่ได้ยกเว้น system-admin
- **วิธีแก้ไข:**
  - settings เป็น 'ต่อทีม' → ใช้ protectedProcedure + assertTeamAccess(minRole:'admin') อย่างเดียว (ตัด adminProcedure)
  - ถ้าตั้งใจให้เฉพาะ system-admin ต้องเอา assertTeamAccess ออก + ระบุชัด (ไม่เหมาะ multi-tenant)
  - ต้องแก้ RBAC-01 (hydrate ctx.user) ก่อน มิฉะนั้น isAdmin ใช้ไม่ได้จริง
- **เอกสารจัดเก็บที่:** `settings.ts (save/resetKey/pingCurrent = adminProcedure + assertTeamAccess); rbac.ts (resolveRole)`

### SET-02 — นิยาม isAdmin ฝั่ง client กว้างกว่า server → ปุ่มโชว์แต่กดแล้วถูกปฏิเสธ (✅ CLOSED)

- **ความร้ายแรง:** 🟠 สูง
- **สถานะ:** ✅ [CLOSED] (แก้ไขสมบูรณ์แล้วใน WO-SETTINGS-008)
- **ปัญหาที่ตรวจพบ:**
  - client: isAdmin = role==='admin' || permission==='owner'|'admin' (นับ team permission)
  - server save = adminProcedure ตรวจแค่ users.role==='admin'
  - team owner ที่ role=writer เห็นฟอร์ม + ปุ่มบันทึกเปิดได้ (canSave=true) แต่กดจริงโดน FORBIDDEN
- **วิธีแก้ไข:**
  - ทำเกณฑ์ตรงกันสองฝั่ง — ถ้าใช้ team permission (SET-01) ให้ client เช็ค permission เท่านั้น
  - server ส่ง capability ชัด (canEditSettings) ให้ client ใช้ตรง แทนเดาเกณฑ์เอง
- **เอกสารจัดเก็บที่:** `client/src/pages/SettingsPage.tsx (L50-51)`

### SET-03 — defaultTeamId อ่านจาก user.teamId ที่ไม่มีอยู่จริงใน payload (✅ CLOSED)

- **ความร้ายแรง:** 🟠 สูง
- **สถานะ:** ✅ [CLOSED] (แก้ไขสมบูรณ์แล้วใน WO-SETTINGS-008)
- **ปัญหาที่ตรวจพบ:**
  - client: defaultTeamId = user?.teamId ?? user?.defaultTeamId ?? 0 แต่ auth.me ไม่คืน field นี้
  - ผล: defaultTeamId=0 เสมอ → save ไม่แนบ teamId → พึ่ง resolveTeamIdForSettings ล้วน
  - resolveTeamIdForSettings เลือก 'ทีมแรกที่เจอ' — ผู้ใช้หลายทีมอาจตั้ง key ผิดทีม
- **วิธีแก้ไข:**
  - auth.me/settings.get คืน teamId จริงที่ active แล้ว client ส่งกลับชัดเจน
  - เพิ่ม team selector ถ้าอยู่หลายทีม
- **เอกสารจัดเก็บที่:** `client SettingsPage (L53); server auth.me user object`

### SET-04 — billing_limit_usd มี backend เก็บ/อ่านครบ แต่ไม่มี UI ให้ตั้งค่า = ฟีเจอร์ค้าง

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - backend เก็บ billingLimitUsd ใน key billing_limit_usd + readExtra อ่านได้
  - SettingsPage ไม่มี input ตั้งวงเงิน — save คง billingLimitUsd เดิมเสมอ
  - หน้าแสดงแค่ยอดใช้จริง ไม่เทียบวงเงิน/เตือนเกิน — Admin Audit hardcode $200 แยก
  - ฟีเจอร์จำกัดงบมีโครงแต่ใช้จริงไม่ได้
- **วิธีแก้ไข:**
  - เพิ่ม input วงเงินต่อทีม + ส่งเข้า save
  - enforcement จริง: ก่อนเรียก LLM/SERP เทียบยอดสะสมกับวงเงิน เกินให้เตือน/บล็อก
  - รวม budget เป็นแหล่งเดียว (เลิก hardcode $200)
- **เอกสารจัดเก็บที่:** `settings.ts (encodeExtra/readExtra billingLimitUsd); client (ไม่มี input)`

### SET-05 — decrypt ล้มเหลว → ลบ key ทิ้งอัตโนมัติเงียบ ๆ (ข้อมูลหายถาวร)

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - safeDecrypt ไม่ผ่าน → db.delete row ทันที
  - ล้มได้จาก SESSION_SECRET เปลี่ยน หรือ env fallback secret บน Vercel
  - secret ผิดชั่วคราวแม้ครั้งเดียว = key หายถาวรโดยไม่แจ้ง
  - เชื่อม ADMIN-04: key เข้ารหัสด้วย SESSION_SECRET เดียวกับ session
- **วิธีแก้ไข:**
  - เปลี่ยนจากลบ เป็น mark invalid + log + แจ้ง admin กรอกใหม่
  - แยก ENCRYPTION_KEY ออกจาก SESSION_SECRET
- **เอกสารจัดเก็บที่:** `settings.ts (loadSettingsForTeam badKeys delete)`

### SET-06 — validatePing บังคับ ping สำเร็จก่อนบันทึก — network บล็อกแล้วบันทึกไม่ได้

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - validatePing=true (default) ping ไม่ผ่าน → throw BAD_REQUEST บันทึกไม่ได้
  - ping ยิงจาก server — egress ถูกจำกัด/provider ล่ม = key ถูกต้องก็บันทึกไม่ได้
  - ผู้ใช้ติดตั้งใหม่อาจติดจนตั้ง key ไม่สำเร็จ
- **วิธีแก้ไข:**
  - validatePing เป็นทางเลือก: ping ไม่ผ่านให้บันทึกได้ + flag 'ยังไม่ยืนยัน' + เตือน
  - แยกปุ่ม 'ทดสอบการเชื่อมต่อ' ออกจาก 'บันทึก'
- **เอกสารจัดเก็บที่:** `settings.ts (save validatePing block); pingProvider`

### SET-07 — settings.get เป็น protectedProcedure — writer เรียกดู config ทีมได้ (แม้ FE ซ่อน) (✅ CLOSED)

- **ความร้ายแรง:** 🟡 กลาง
- **สถานะ:** ✅ [CLOSED] (แก้ไขสมบูรณ์แล้วใน WO-SETTINGS-008)
- **ปัญหาที่ตรวจพบ:**
  - get แค่ต้อง login ไม่ตรวจ team permission — writer ในทีมเรียกตรงผ่าน API ได้
  - แม้ key masked แต่เผย provider, มี key ไหม, country/lang — FE ซ่อนแต่ API เปิด
- **วิธีแก้ไข:**
  - เพิ่ม assertTeamAccess ใน get (อย่างน้อย member) + จำกัดข้อมูล provider สำหรับ non-admin
- **เอกสารจัดเก็บที่:** `settings.ts (get = protectedProcedure)`

### SET-08 — resetKey ลบ provider ด้วย ทำให้ตกไปใช้ ENV/default โดยไม่ตั้งใจ

- **ความร้ายแรง:** 🟡 กลาง
- **ปัญหาที่ตรวจพบ:**
  - resetKey('llm') ลบทั้ง llm_provider และ llm_api_key
  - ครั้งถัดไป loadSettingsForTeam seed provider จาก ENV → provider เปลี่ยนกลับ default เงียบ
- **วิธีแก้ไข:**
  - reset ควรลบเฉพาะ key คง provider ที่เลือกไว้ หรือแจ้งชัดว่าจะรีเซ็ต provider ด้วย
- **เอกสารจัดเก็บที่:** `settings.ts (resetKey deletes llm_provider + llm_api_key)`

### SET-09 — country/lang/billing ยัดรวมใน key เดียว (billing_limit_usd) — ชื่อไม่ตรงเนื้อหา (✅ CLOSED)

- **ความร้ายแรง:** 🟢 ต่ำ
- **สถานะ:** ✅ [CLOSED] (แก้ไขสมบูรณ์แล้วใน WO-SETTINGS-008)
- **ปัญหาที่ตรวจพบ:**
  - country/lang/billingLimit JSON รวมเก็บใน key ชื่อ billing_limit_usd (เพราะ enum จำกัด ไม่อยาก ALTER)
  - ชื่อ key ไม่ตรงเนื้อหา + readExtra มี legacy parsing หลายชั้น
- **วิธีแก้ไข:**
  - เพิ่ม enum key แยก (locale_config) ผ่าน migration หรือเปลี่ยนชื่อให้สื่อความหมาย
- **เอกสารจัดเก็บที่:** `settings.ts (encodeExtra: {c,l,bl} เก็บใน key billing_limit_usd)`

### SET-10 — maskKey มี 2 เวอร์ชันไม่ตรงกัน (settings.ts vs admin.ts) (✅ CLOSED)

- **ความร้ายแรง:** 🟢 ต่ำ
- **สถานะ:** ✅ [CLOSED] (แก้ไขสมบูรณ์แล้วใน WO-SETTINGS-008)
- **ปัญหาที่ตรวจพบ:**
  - maskKey สองชุดคนละไฟล์ กติกา mask ต่างกันเล็กน้อย
  - mask ไม่สอดคล้องระหว่าง Settings กับ Admin Audit + โค้ดซ้ำ
- **วิธีแก้ไข:**
  - รวม maskKey เป็น util กลางตัวเดียว
- **เอกสารจัดเก็บที่:** `settings.ts (maskKey) และ admin.ts (maskKey)`

---

## สรุปและลำดับการแก้

ปัญหาที่ทำให้ 'ตั้งค่าระบบไม่ได้จริง' คือ **SET-01 + SET-02 + SET-03** ที่เกี่ยวพันกับ RBAC-01 ในรายงานหลัก — ตราบใดที่ ctx.user ยังไม่ hydrate และเกณฑ์ admin สองฝั่งไม่ตรงกัน team owner/admin จะตั้ง key ทีมตัวเองไม่ได้ เหลือแค่ system-admin คนเดียว

1. ✅ แก้ **RBAC-01** (hydrate ctx.user) ในรายงานหลักก่อน — ฐานของทุกอย่าง (ปิดงานแล้ว)
2. ✅ **SET-01:** เลือกโมเดลสิทธิ์ให้ชัด (แนะนำ team permission) แล้วปรับ save/resetKey/pingCurrent (ปิดงานแล้ว)
3. ✅ **SET-02 + SET-03:** ทำเกณฑ์ admin + teamId ฝั่ง client ให้ตรง server (ปิดงานแล้วใน WO-008)
4. ✅ **SET-05:** เลิกลบ key เมื่อ decrypt ล้ม + แยก ENCRYPTION_KEY (ปิดงานแล้ว)
5. ✅ **SET-04:** เพิ่ม UI ตั้ง billing limit + enforcement จริง (ปิดงานแล้ว)
6. ✅ **SET-06/07/08:** validatePing optional, gate settings.get, reset เฉพาะ key (ปิดงานแล้วใน WO-008)
7. ✅ **SET-09/10:** ปรับปรุงคุณภาพโค้ด (แยก key locale, รวม maskKey) (ปิดงานแล้วใน WO-008)
