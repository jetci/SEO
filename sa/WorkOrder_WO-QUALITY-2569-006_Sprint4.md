# ใบสั่งงานแก้ไข (WORK ORDER)

**EEAT Studio V2 — ปรับปรุงคุณภาพโค้ด และลดขนาดไฟล์ (Quality Improvement)**

## เรื่อง: Quality, Refactoring & Bundle Size (Priority 4)

| หัวข้อ | รายละเอียด |
|---|---|
| เลขที่งาน | WO-QUALITY-2569-006 |
| วันที่ออก | 2026-09-19 |
| ผู้ออกใบสั่งงาน | SA / System Auditor |
| ผู้รับผิดชอบ | ฝ่ายพัฒนา (Backend & Frontend) |
| ความสำคัญ | 🟢 ต่ำ (Low - ปรับปรุงคุณภาพ) |
| ประเภทงาน | Refactoring, Code Splitting, API Optimization |
| ประเมินเวลา | 2-3 วันทำงาน |

## 1. อาการที่รายงาน (อ้างอิงจาก Deep Audit Report ลำดับที่ 4)

1. **[API-01] tRPC ไม่ได้ใช้ Batch:** ฝั่ง Client ใช้ `httpLink` ธรรมดา (ยิงทีละ Request) แต่คอมเมนต์เขียนว่าใช้ `httpBatchLink` ทำให้เวลาเปิด Dashboard โดนยิง Request หลายเส้นพร้อมกัน นำไปสู่ปัญหา Race Condition และ Connection ค้าง
2. **[API-03] ข้อมูล Error รั่วไหล:** ใน Production ระบบซ่อน Stack เฉพาะ `INTERNAL_SERVER_ERROR` แต่ Error อื่นๆ อย่าง `BAD_REQUEST` หรือ `FORBIDDEN` ยังคืนค่ารายละเอียดเชิงลึก (เช่น Team ID, Role) กลับไปที่ Client ซึ่งไม่ปลอดภัย
3. **[UX-03] ไฟล์ Component มีขนาดใหญ่เกินไป:** `KeywordClusterPlanner.tsx` (290KB) และ `WritePage.tsx` (177KB) เป็นไฟล์ขนาดยักษ์ที่รวมทั้ง Business Logic และ UI ไว้ที่เดียว ทำให้ยากต่อการ Maintain และทำ Code Splitting
4. **[DEBT-03] โค้ดซ้ำซ้อน (Duplicate Code):** ฟังก์ชัน `extractInsertId` ถูกก็อปปี้ไปวางซ้ำใน `write.ts` และ `research.ts` รวมถึง `sessionCookieDomain` ซ้ำใน `trpc.ts` และ `auth.ts` เสี่ยงต่อการแก้ไขไม่ครบถ้วน

## 2. รายการงานที่ต้องแก้ไข (Tasks)

### งานที่ 4.1 — API Optimization & Security (API-01, API-03)
- **ไฟล์:** `client/src/trpc.ts`, `server/_core/trpc.ts`
- **สิ่งที่ทำ:** 
  - เปลี่ยนจาก `httpLink` เป็น `httpBatchLink` ฝั่ง Client เพื่อลดจำนวน HTTP Requests
  - ปรับปรุง `errorFormatter` ใน Server หากเป็น Environment Production ให้ตัดรายละเอียด Error เชิงลึกทิ้ง (ซ่อนข้อมูล Internal)

### งานที่ 4.2 — Component Refactoring (UX-03)
- **ไฟล์:** `client/src/pages/KeywordClusterPlanner.tsx`, `client/src/pages/WritePage.tsx`
- **สิ่งที่ทำ:** 
  - แตกไฟล์ยักษ์ทั้งสองออกเป็น Sub-components เล็กๆ (เช่น แยกฟอร์ม, แยกตาราง, แยก Modal)
  - แยก Business Logic ออกไปเป็น Custom Hooks (เช่น `useKeywordPlanner`, `useArticleWriter`)

### งานที่ 4.3 — Code Duplication (DEBT-03)
- **ไฟล์:** `server/_core/util.ts` (สร้างใหม่ถ้าไม่มี), `server/routers/write.ts`, `server/routers/research.ts`, `server/routers/auth.ts`, `client/src/trpc.ts`
- **สิ่งที่ทำ:** 
  - สร้างไฟล์/ย้ายฟังก์ชัน `extractInsertId` และ `sessionCookieDomain` ไปไว้ที่ Util กลาง
  - Refactor ไฟล์เดิมให้ชี้มาใช้งานจาก Util กลางที่เดียว

## 3. เกณฑ์การตรวจรับงาน (Acceptance Criteria)

- [ ] Network Tab ใน DevTools ต้องแสดงผลการยิง API เป็นรูปแบบ Batch (รวมหลาย Query ใน 1 Request)
- [ ] ไฟล์ `KeywordClusterPlanner.tsx` และ `WritePage.tsx` ต้องมีขนาดเล็กลง และแยก Components ย่อยไปไว้ในโฟลเดอร์ `components/` อย่างเป็นระเบียบ
- [ ] การเกิด Error (400, 403) บน Production ต้องไม่แสดงข้อความเชิงลึก เช่น โครงสร้างตาราง หรือ Role ภายใน
- [ ] ไม่มีฟังก์ชันซ้ำซ้อน (Duplicate function declarations) สำหรับ `extractInsertId` และ `sessionCookieDomain` ใน Codebase

## 4. การเซ็นรับงาน (Sign-off)

| ผู้พัฒนา | ผู้ตรวจ (QA) | ผู้อนุมัติ |
|---|---|---|
| | | |
| ลงชื่อ / วันที่ | ลงชื่อ / วันที่ | ลงชื่อ / วันที่ |

---
*— จบใบสั่งงาน WO-QUALITY-2569-006 —*
