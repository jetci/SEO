# ใบสั่งงานแก้ไข (WORK ORDER)

**EEAT Studio V2 — ระบบความถูกต้องของข้อมูลและ Route Guards**

## เรื่อง: Data Accuracy, Route Guards & Urgent Fixes (Priority 2)

| หัวข้อ | รายละเอียด |
|---|---|
| เลขที่งาน | WO-URGENT-2569-004 |
| วันที่ออก | 2026-09-19 |
| ผู้ออกใบสั่งงาน | SA / System Auditor |
| ผู้รับผิดชอบ | ฝ่ายพัฒนา (Backend & Frontend) |
| ความสำคัญ | 🟠 สูง (High - เร่งด่วน) |
| ประเภทงาน | แก้ไขความถูกต้องข้อมูล, DB Schema และ Client Guards |
| ประเมินเวลา | 2 วันทำงาน |
| Component | `projects.ts`, `write.ts`, `schema.ts`, `App.tsx`, `AdminAuditPage.tsx` |

## 1. อาการที่รายงาน (อ้างอิงจาก Deep Audit Report ลำดับที่ 2)

1. **[WRITER-02] insertId ไม่แน่นอน:** การอ่าน insertId มี fallback เป็น `Date.now()` ซึ่งทำให้ Query ภายหลังหาไม่เจอ และมีการ copy-paste โค้ดซ้ำหลายไฟล์
2. **[WRITER-03] Placeholder นับเป็นความสำเร็จ:** เมื่อ LLM สร้างบทความล้มเหลว โค้ดจะใส่ PLACEHOLDER แต่สถานะยังนับว่าเป็น draft ปกติ ทำให้ผู้ใช้เผลอ Publish ได้
3. **[DB-02] articles.content เสี่ยงถูกตัดเนื้อหา:** ฟิลด์นี้ใน DB อาจเป็นแค่ `TEXT` (64KB) ซึ่งบทความระดับ 1500+ คำอาจเกินโควต้า ต้องปรับเป็น `LONGTEXT`
4. **[RBAC-03] Hardcode teamId 90001:** `getSettingsMasked` ใช้ `teamId ?? 90001` เสมอ ทำให้ Admin เห็น Settings ของทีม 90001 กลายเป็นปัญหา Tenant Leak
5. **[ADMIN-02] AdminAuditPage ไม่มี Guard:** ฝั่ง Client ไม่มีการใช้ `useAuth` ป้องกัน ทำให้ใครก็เข้า `/audit` ได้และเห็นโครงหน้าพังๆ
6. **[SCHED-02] Scheduler บน Vercel:** ติดบล็อก `!VERCEL` ทำให้ระบบบน Serverless จริงไม่เคยตีพิมพ์บทความ
7. **[GUEST-01] หน้า Client ไม่มี Route Guard:** Guest พิมพ์ URL เข้าถึง Component ได้โดยตรงก่อน Backend จะตอบกลับมาด้วย UNAUTHORIZED (กระพริบจอ)

## 2. รายการงานที่ต้องแก้ไข (Tasks)

### งานที่ 2.1 — แก้ไขระบบ InsertId และ DB Schema (WRITER-02, DB-02)
- **ไฟล์:** `teams.ts`, `projects.ts`, `write.ts`, `research.ts`, `db/schema.ts`
- **สิ่งที่ทำ:** 
  - สร้าง helper กลาง `getInsertId(res)` ห้าม fallback เป็น timestamp เด็ดขาด
  - ตรวจสอบ `articles.content` ว่า DDL เป็น `LONGTEXT` ถ้ายังไม่ใช่ให้รัน Migration ALTER TABLE

### งานที่ 2.2 — แก้ไขการจัดการ Placeholder และ Scheduler (WRITER-03, SCHED-02)
- **ไฟล์:** `server/services/articleWriterService.ts`, `server/app.ts`
- **สิ่งที่ทำ:** 
  - กรณีเกิด Placeholder ขึ้นในเนื้อหา ให้เซ็ต flag สถานะเป็น `fail` หรือบล็อกการ Publish พร้อมเตือนใน UI
  - ปรับรองรับ Vercel Cron Jobs หรือระบุสถาปัตยกรรม Worker แยกให้ชัดเจน ไม่พึ่งพา setInterval บน serverless

### งานที่ 2.3 — ล้าง Hardcode teamId (RBAC-03)
- **ไฟล์:** `server/routers/admin.ts`
- **สิ่งที่ทำ:** 
  - เปลี่ยนจากการดึง `teamId ?? 90001` เป็นการดึงผ่าน Helper สำหรับ Admin ที่ Resolve ตาม Context จริง และนำ 90001 ไปผูกเป็น ENV ให้ถูกต้อง

### งานที่ 2.4 — เพิ่ม Route Guard ฝั่ง Client (ADMIN-02, GUEST-01)
- **ไฟล์:** `client/src/App.tsx`, `client/src/pages/AdminAuditPage.tsx`
- **สิ่งที่ทำ:** 
  - สร้าง Wrapper `<RequireAuth>` และ `<RequireAdmin>` ครอบ Route กลุ่มที่ต้องการป้องกัน
  - หาก `isLoggedIn === false` หรือ `role !== 'admin'` ให้ Redirect หรือขึ้นจอ Error ทันที ไม่ต้องรอ render โครงหน้าก่อน

## 3. เกณฑ์การตรวจรับงาน (Acceptance Criteria)

- [ ] ทุกฟังก์ชันที่ทำ `INSERT` คืนค่า ID จริงๆ โดยไม่พึ่งพา Date.now()
- [ ] หาก LLM ล้มเหลวจนสร้าง Placeholder สถานะของบทความต้องไม่เป็น Draft ปกติ (บล็อก publish ได้)
- [ ] `articles.content` เก็บข้อมูลระดับ LONGTEXT (>64KB) ได้โดยไม่โดนตัดปลาย
- [ ] Admin ทุกทีมเห็น Settings ของทีมตัวเองเท่านั้น ไม่ทะลุไป 90001
- [ ] เข้า URL `/audit` หรือ `/write` แบบไม่ล็อกอิน จะโดน Redirect หรือเด้งออกทันที (ไม่มีการกระพริบหน้าจอโครงสร้าง)

### 🚨 Live Smoke Test (ข้อบังคับพิเศษ)
- [ ] **CT-01 & WP-D1:** ต้องแนบหลักฐาน (Screenshot/Video) การกดสร้างบทความจริงบน UI (Production/Staging) 
- [ ] **CT-01 & WP-D1:** ต้องแสดงให้เห็นว่าได้ **"เนื้อหาบทความจริงๆ"** ออกมาในหน้า Preview ไม่ใช่ Error Message หรือ Placeholder (เป็นการยืนยันว่าตั้งค่า API Key ถูกต้อง และมีเครดิตเพียงพอ)


## 4. การเซ็นรับงาน (Sign-off)

| ผู้พัฒนา | ผู้ตรวจ (QA) | ผู้อนุมัติ |
|---|---|---|
| | | |
| ลงชื่อ / วันที่ | ลงชื่อ / วันที่ | ลงชื่อ / วันที่ |

---
*— จบใบสั่งงาน WO-URGENT-2569-004 —*
