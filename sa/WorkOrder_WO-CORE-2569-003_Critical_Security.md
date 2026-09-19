# ใบสั่งงานแก้ไข (WORK ORDER)

**EEAT Studio V2 — ระบบความปลอดภัยและ Core Framework**

## เรื่อง: Critical Security, RBAC & Core Framework Fixes (Priority 1)

| หัวข้อ | รายละเอียด |
|---|---|
| เลขที่งาน | WO-CORE-2569-003 |
| วันที่ออก | 2026-09-19 |
| ผู้ออกใบสั่งงาน | SA / System Auditor |
| ผู้รับผิดชอบ | ฝ่ายพัฒนา (Backend & Security) |
| ความสำคัญ | 🔴 วิกฤต (Critical) |
| ประเภทงาน | แก้ไขระบบรักษาความปลอดภัยและสิทธิ์ (Security / RBAC) |
| ประเมินเวลา | 1-2 วันทำงาน |
| Component | `auth.ts`, `trpc.ts`, `rbac.ts`, `admin.ts`, `schedulerWorker.ts` |

## 1. อาการที่รายงาน (อ้างอิงจาก Deep Audit Report ลำดับที่ 1)

1. **Backdoor ใน Production (ADMIN-01):** ระบบมีโค้ด `isTestUser = input.password === 'test1234'` ทำให้สามารถล็อกอินเข้า Production ได้ด้วยรหัสตายตัว
2. **RBAC ไม่ทำงาน (RBAC-01, RBAC-02):** `ctx.user` เป็น `null` เสมอ ทำให้ระบบสิทธิ์การใช้งานพังเงียบ และ `adminProcedure` ไม่ถูกเรียกใช้งานจริง
3. **Auto-Publish พัง (SCHED-01):** Scheduler สำหรับตั้งเวลาเผยแพร่บทความทำงานล้มเหลวทุกครั้ง เพราะเรียกใช้ API ที่ต้องมี session แต่ส่ง `session: undefined` ไป
4. **Mock Data หลุด (WRITER-01):** มีการใช้ `process.env.NODE_ENV === 'development'` โดยตรงแทน `IS_DEV` ทำให้ mock data อาจทะลุไปใช้บน Production หาก ENV ผิดพลาด
5. **Log รั่วไหล (DEBT-02):** ข้อมูลรหัสผ่านหรือ char code ถูก log ออกมาทาง `console.warn` ใน production

## 2. รายการงานที่ต้องแก้ไข (Tasks)

### งานที่ 2.1 — ลบ Backdoor และ Log ข้อมูลความลับ (ADMIN-01, DEBT-02)
- **ไฟล์:** `server/auth.ts`
- **สิ่งที่ทำ:** 
  - ลบเงื่อนไข `isTestUser = input.password === 'test1234'` ทันที
  - ปิด `devSignin` แบบสมบูรณ์เมื่ออยู่บน Production (ใช้ `IS_DEV` ตรวจสอบ)
  - ลบ `console.warn` ที่ log รหัสผ่านและ `AUTH_DEBUG_V16` ออกทั้งหมด

### งานที่ 2.2 — แก้ไขระบบสิทธิ์ RBAC (RBAC-01, RBAC-02)
- **ไฟล์:** `server/_core/trpc.ts`, `server/_core/middleware/rbac.ts`, `server/routers/admin.ts`
- **สิ่งที่ทำ:** 
  - สร้าง middleware `hydrateUser` ต่อจาก `isAuthenticated` เพื่อ query หาข้อมูล users จาก `ctx.session.openId` แล้วแนบไปกับ `ctx.user`
  - เปลี่ยน procedure ทุกตัวใน `admin.ts` ไปใช้ `adminProcedure` แทนการเช็ค `ctx.user?.role !== 'admin'` แบบ inline

### งานที่ 2.3 — แก้ไขระบบ Scheduler (SCHED-01)
- **ไฟล์:** `server/workers/schedulerWorker.ts`, `server/routers/write.ts`
- **สิ่งที่ทำ:** 
  - สร้าง Service layer แยกที่สามารถ bypass RBAC/Session check สำหรับใช้ทำ auto-publish จาก background job โดยเฉพาะ หรือจำลอง Session ของ System Admin

### งานที่ 2.4 — แก้ไขเงื่อนไข Dev Mock (WRITER-01)
- **ไฟล์:** `server/routers/projects.ts`, `server/routers/teams.ts` และ Router อื่นๆ
- **สิ่งที่ทำ:** 
  - เปลี่ยนการตรวจสอบ `process.env.NODE_ENV === 'development'` ให้ใช้ `IS_DEV` จาก `env.ts` แทน
  - ห้ามคืนค่า Mock Data เมื่อเกิด Error บน Production เด็ดขาด ให้ Throw error เสมอ

## 3. เกณฑ์การตรวจรับงาน (Acceptance Criteria)

- [ ] ไม่สามารถล็อกอินด้วยรหัสผ่าน `test1234` บน Production ได้
- [ ] ไม่มี Log ใดๆ ที่พิมพ์รหัสผ่านหรือข้อมูลการเข้าสู่ระบบออกมา
- [ ] `ctx.user` ถูกดึงข้อมูลจาก Database ขึ้นมาใช้งานใน Middleware ได้อย่างถูกต้อง
- [ ] ระบบตั้งเวลาตีพิมพ์บทความ (Auto-publish) จาก Scheduler ทำงานได้สำเร็จ
- [ ] Error บน Production จะโยนกลับเป็น TRPCError เสมอ ไม่มีการสอดไส้ข้อมูล Mock

## 4. การเซ็นรับงาน (Sign-off)

| ผู้พัฒนา | ผู้ตรวจ (QA) | ผู้อนุมัติ |
|---|---|---|
| | | |
| ลงชื่อ / วันที่ | ลงชื่อ / วันที่ | ลงชื่อ / วันที่ |

---
*— จบใบสั่งงาน WO-CORE-2569-003 —*
