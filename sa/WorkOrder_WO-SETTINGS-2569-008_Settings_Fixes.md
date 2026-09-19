# ใบสั่งงานแก้ไข (WORK ORDER)

**EEAT Studio V2 — Settings / การตั้งค่า (SET-Series)**

## เรื่อง: การแก้ไขข้อบกพร่องระบบ Settings ส่วนที่เหลือ (SET-02, SET-03, SET-07, SET-09, SET-10)

| หัวข้อ | รายละเอียด |
|---|---|
| เลขที่งาน | WO-SETTINGS-2569-008 |
| วันที่ออก | 2026-09-20 |
| ผู้ออกใบสั่งงาน | SA / System Auditor |
| ผู้รับผิดชอบ | ฝ่ายพัฒนา (Backend & Frontend) |
| ความสำคัญ | 🟠 สูง (High) ถึง 🟢 ต่ำ (Low) |
| ประเภทงาน | แก้ไขระบบ Settings และสิทธิ์การเข้าถึง |
| อ้างอิง | `EEAT_Studio_V2_Settings_Report.md` |

## 1. อาการที่รายงาน (อ้างอิงจาก Settings Report)

แม้ว่ารายการ SET หลักอย่าง SET-01, SET-04, SET-05, SET-06, SET-08 จะได้รับการแก้ไขแล้ว แต่ยังมีข้อบกพร่องที่ค้างอยู่ในรายงานอีก 5 ข้อ ซึ่งเป็นรายการกลุ่มสุดท้ายใน SA Checklist ครับ:

1. **SET-02 (🟠 สูง):** นิยามสิทธิ์แอดมินฝั่ง Client กว้างกว่า Server (ปุ่มบันทึกโชว์ แต่พอกดแล้วโดน FORBIDDEN)
2. **SET-03 (🟠 สูง):** Client พยายามอ่านค่า defaultTeamId จากจุดที่ไม่มีอยู่จริง ทำให้ defaultTeamId=0 เสมอ และเซิร์ฟเวอร์อาจบันทึก Key ผิดทีม
3. **SET-07 (🟡 กลาง):** endpoint `settings.get` เป็นแค่ protected ทำให้ Role: Writer สามารถยิง API ดูค่า Config ของทีมได้ (แม้ FE จะซ่อนฟอร์มไว้)
4. **SET-09 (🟢 ต่ำ):** การจัดเก็บข้อมูล Country/Lang/Billing ถูกยัดรวมกันไว้ใน Key ตัวเดียวที่ชื่อว่า `billing_limit_usd` ซึ่งไม่ตรงกับความหมาย
5. **SET-10 (🟢 ต่ำ):** ฟังก์ชัน `maskKey` มีโค้ด 2 เวอร์ชันที่ไม่ตรงกันซ้ำซ้อนอยู่ (`settings.ts` vs `admin.ts`)

## 2. รายการงานที่ต้องแก้ไข (Tasks)

### งานที่ 2.1 — ซิงค์นิยามสิทธิ์และจำกัดการเข้าถึง API (SET-02, SET-07)
- **ไฟล์ที่ต้องแก้:** `client/src/pages/SettingsPage.tsx`, `server/routers/settings.ts`
- **สิ่งที่ต้องทำ:**
  - เพิ่ม `assertTeamAccess` ใน procedure `settings.get` เพื่อบล็อกไม่ให้ Writer ยิงอ่านค่า Provider ของทีมได้
  - ปรับเกณฑ์ `isAdmin` ในหน้า Frontend ให้เช็คสิทธิ์แบบเดียวกับ Backend หรือให้ Backend ส่ง Flag `canEditSettings` มาให้เลย

### งานที่ 2.2 — การจัดการ TeamID ให้ถูกต้อง (SET-03)
- **ไฟล์ที่ต้องแก้:** `client/src/pages/SettingsPage.tsx`, `server/routers/auth.ts`
- **สิ่งที่ต้องทำ:**
  - ตรวจสอบและส่งค่า `teamId` จริงที่ใช้งานอยู่กลับไปยังหน้า Frontend
  - หน้า Settings ต้องแนบ `teamId` กลับมาด้วยเวลากด Save เพื่อป้องกันการตั้งค่าผิดทีม

### งานที่ 2.3 — ปรับปรุงคุณภาพโค้ดและ Refactor (SET-09, SET-10)
- **ไฟล์ที่ต้องแก้:** `server/routers/settings.ts`, `server/routers/admin.ts`, `server/_core/utils/`
- **สิ่งที่ต้องทำ:**
  - สร้าง Utils สำหรับ `maskKey` ไว้ที่ส่วนกลางตัวเดียวและเรียกใช้ให้เหมือนกันทั้งระบบ
  - เคลียร์ Logic การเก็บข้อมูล Locale (Country/Lang) ให้แยกออกจาก `billing_limit_usd` ให้ชัดเจนที่สุดเท่าที่ Schema ปัจจุบันอำนวย

## 3. เกณฑ์การตรวจรับงาน (Acceptance Criteria)
- [ ] Writer ไม่สามารถยิง API `settings.get` เพื่อดู Provider ของทีมได้แล้ว
- [ ] Client ทราบชัดเจนว่าผู้ใช้มีสิทธิ์ระดับทีมหรือไม่ และปุ่ม Save สอดคล้องกับสิทธิ์จริง
- [ ] ค่า defaultTeamId ถูกดึงมาจาก Session จริง ไม่เป็น 0
- [ ] มีโค้ด `maskKey` กลางแค่ที่เดียว
- [ ] ตรวจสอบว่าระบบบันทึกค่า Settings สำเร็จ

---
*— จบใบสั่งงาน WO-SETTINGS-2569-008 —*
