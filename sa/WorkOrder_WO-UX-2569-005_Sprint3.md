# ใบสั่งงานแก้ไข (WORK ORDER)

**EEAT Studio V2 — UX, ความสอดคล้องของระบบ และจัดการหนี้ทางเทคนิค**

## เรื่อง: UX, Consistency & Technical Debt (Priority 3)

| หัวข้อ | รายละเอียด |
|---|---|
| เลขที่งาน | WO-UX-2569-005 |
| วันที่ออก | 2026-09-19 |
| ผู้ออกใบสั่งงาน | SA / System Auditor |
| ผู้รับผิดชอบ | ฝ่ายพัฒนา (Backend & Frontend) |
| ความสำคัญ | 🟡 กลาง (Medium - สปรินต์ถัดไป) |
| ประเภทงาน | UX/UI, Refactor API, Database Schema Comments, Technical Debt |
| ประเมินเวลา | 2-3 วันทำงาน |

## 1. อาการที่รายงาน (อ้างอิงจาก Deep Audit Report ลำดับที่ 3)

1. **[ADMIN-03] นิยาม isAdmin ไม่ตรงกัน:** Client มองว่า 'owner' ของทีมคือ admin ด้วย แต่ Server มองแค่ `role==='admin'` ทำให้ UI แสดงปุ่ม admin แต่กดยิง API ไม่ผ่าน
2. **[ADMIN-04] AES Key ผูกกับ Session JWT:** การใช้ `SESSION_SECRET` เป็นกุญแจเข้ารหัส API Key ทำให้อนาคตถ้าหมุน Session Key ข้อมูล API Key จะพังทั้งหมด (ตั๋วนี้ต่อเนื่องกับ DB-03)
3. **[DB-01] คอมเมนต์ Schema ล้าสมัย:** คอมเมนต์เขียนว่า '8 Tables ONLY' แต่จริงๆ มี 13 Tables ทำให้สับสน
4. **[DB-03] การลบ Settings อัตโนมัติ:** เมื่อ `loadSettingsForTeam` ถอดรหัสไม่สำเร็จ ระบบสั่ง `db.delete` ทิ้งทันที (ทำข้อมูลลูกค้าสูญหาย)
5. **[API-02] Auth Race Handling ซับซ้อน:** `useAuth` และ `trpc.ts` มี Interceptor ซ้อนกัน 4-5 ชั้นเพื่อแก้ปัญหา 401 ทำให้ Cache พัง
6. **[UX-01] Redirect กระพริบ (500ms):** ใช้ `setTimeout 500ms` เพื่อรอ Redirect ทำให้เดาเวลา และหน้าจอกระพริบ
7. **[UX-02] เมนูไม่กรองตาม Role:** เมนู Settings/Audit แสดงให้ทุกคนเห็น แม้เป็น Writer พอกดไปก็จะติด Guard
8. **[WRITER-04] Error ถูกซ่อนเป็น null:** `getById/getActive` คืนค่า `null` เวลามี Error (เช่น FORBIDDEN) ทำให้ฝั่ง UI แยกไม่ออกว่าไม่มีสิทธิ์ หรือ ไม่มีข้อมูล
9. **[GUEST-02] Feature Members หาย:** Route `/members` และ `/teams` ถูก Redirect ทิ้ง ไม่มี UI ให้เพิ่มสมาชิกทีม
10. **[DEBT-01] ไฟล์ขยะใน Repo:** มีไฟล์ `.log`, `deploy_tmp`, `debug_*.ts` ปะปนอยู่ใน Repository เสี่ยงต่อความปลอดภัย

## 2. รายการงานที่ต้องแก้ไข (Tasks)

### งานที่ 3.1 — ความปลอดภัยและการเข้ารหัส (ADMIN-04, DB-03)
- **ไฟล์:** `server/routers/settings.ts`, `server/_core/sdk.ts`
- **สิ่งที่ทำ:** 
  - แยก `ENCRYPTION_KEY` ต่างหากจาก `SESSION_SECRET`
  - หาก Settings Decrypt ไม่สำเร็จ ห้าม `db.delete` เด็ดขาด ให้ Mark ว่าพัง/Log แจ้ง Admin แทน

### งานที่ 3.2 — UX & UI Role Filtering (ADMIN-03, UX-01, UX-02)
- **ไฟล์:** `client/src/layouts/MainDashboardShell.tsx`, `client/src/pages/SettingsPage.tsx`
- **สิ่งที่ทำ:** 
  - ซ่อนเมนู Settings และ Admin Audit จากผู้ใช้ที่ไม่มีสิทธิ์
  - เปลี่ยนการ Redirect จาก setTimeout เป็นการใช้ `RequireAuth` (ทำแล้วบางส่วนใน Priority 2 ให้เคลียร์ของเก่าออก)
  - กำหนดนิยาม isAdmin ใน Client ให้ตรงกับ Backend

### งานที่ 3.3 — API & Data Consistency (API-02, WRITER-04)
- **ไฟล์:** `client/src/hooks/useAuth.ts`, `client/src/trpc.ts`, `server/routers/projects.ts`
- **สิ่งที่ทำ:** 
  - ถอด Interceptor แก้ 401 ที่ซับซ้อนเกินไปออก พึ่งพา Route Guard แทน
  - ให้ `projects.getById` โยน `TRPCError` กลับไปหา Client ตรงๆ ห้าม Catch แล้ว Return `null`

### งานที่ 3.4 — Clean up & Tech Debt (DB-01, GUEST-02, DEBT-01)
- **ไฟล์:** `db/schema.ts`, `.gitignore`, `client/src/App.tsx`
- **สิ่งที่ทำ:** 
  - อัปเดต Header ใน `schema.ts` ให้ตรงจำนวนตารางจริง (13+)
  - เพิ่ม *.log, deploy_tmp/, .vercel/ เข้า `.gitignore` และลบไฟล์ขยะออกจาก Repo
  - สร้างหน้า UI ให้ Team Management หรือลบ Route ทิ้งพร้อมขึ้น TODO ให้ชัดเจน

## 3. เกณฑ์การตรวจรับงาน (Acceptance Criteria)

- [ ] Repository ต้องไม่มีไฟล์ `.log`, `deploy_tmp`, `debug_*.ts` ค้างอยู่
- [ ] หากผู้ใช้เป็น `writer` จะต้องไม่เห็นปุ่มเมนู "ตั้งค่าระบบ" และ "Admin Audit"
- [ ] โค้ด Backend ต้องไม่จับ Error เป็น `null` แต่ปล่อย 403/404 ออกมาให้ Client จัดการ
- [ ] ห้ามโค้ดบรรทัดไหนสั่งลบ (`db.delete`) แถวตั้งค่า API Key เพียงเพราะ Decrypt ไม่สำเร็จ

## 4. การเซ็นรับงาน (Sign-off)

| ผู้พัฒนา | ผู้ตรวจ (QA) | ผู้อนุมัติ |
|---|---|---|
| | | |
| ลงชื่อ / วันที่ | ลงชื่อ / วันที่ | ลงชื่อ / วันที่ |

---
*— จบใบสั่งงาน WO-UX-2569-005 —*
