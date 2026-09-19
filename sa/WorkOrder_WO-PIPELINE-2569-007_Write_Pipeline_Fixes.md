# ใบสั่งงานแก้ไข (WORK ORDER)

**EEAT Studio V2 — Write Pipeline (ระบบเขียนบทความ)**

## เรื่อง: การแก้ไขข้อบกพร่องใน Write Pipeline (WP-Series)

| หัวข้อ | รายละเอียด |
|---|---|
| เลขที่งาน | WO-PIPELINE-2569-007 |
| วันที่ออก | 2026-09-20 |
| ผู้ออกใบสั่งงาน | SA / System Auditor |
| ผู้รับผิดชอบ | ฝ่ายพัฒนา (Backend & Frontend) |
| ความสำคัญ | 🔴 วิกฤต (Critical) ถึง 🟠 สูง (High) |
| ประเภทงาน | แก้ไขระบบสร้างบทความ (Write Pipeline) |
| อ้างอิง | `EEAT_Studio_V2_Write_Pipeline_Report.md` |

## 1. อาการที่รายงาน (อ้างอิงจาก Write Pipeline Report)

จากเช็คลิสต์ที่ยังว่างอยู่ (WP-Series) เป็นปัญหาที่เกิดใน **ท่อการเขียนบทความด้วย AI (Write Pipeline)** ดังนี้:

1. **WP-B2 (🔴 วิกฤต):** ถ้าระบบไม่มีข้อมูล Research Package (เช่น ไม่ได้ดึง SERP/PAA ไว้) ตัวบทความที่ Gen ออกมาจะกลายเป็นเนื้อหาลอยๆ (Generic) เพราะขาด Context
2. **WP-D1 (🔴 วิกฤต):** โค้ดที่แก้ไขแล้วอาจไม่ถูกนำขึ้น VPS จริง (Deploy Sync Failure) ต้องมีการยืนยัน Checksum หรือกระบวนการ Deploy ที่รัดกุมขึ้น
3. **WP-A1 (🟠 สูง):** ระบบ Fallback มีการใส่ `###` เข้าไปใน Body ทำให้ Parser ของ Frontend เข้าใจผิดว่าเป็น Section ใหม่ ทำให้เนื้อหาขาดหาย
4. **WP-B3 (🟠 สูง):** ต้องบังคับให้ผู้ใช้ตั้งค่า LLM API Key ก่อนการใช้งาน หากไม่มี Key ระบบจะแจ้ง Error ไม่ชัดเจน
5. **WP-B5 (🟠 สูง):** การรัน `createDraft` ใช้เวลานานมาก หากรันบน Vercel (Serverless) อาจจะ Timeout (60s) กลางคัน
6. **WP-D2 (🟠 สูง):** ระบบยังไม่มี Integration Test ที่ทดสอบการทำงานร่วมกับ LLM จริง ทำให้เกิดบั๊กหลุดขึ้น Production ได้ง่าย

## 2. รายการงานที่ต้องแก้ไข (Tasks)

### งานที่ 2.1 — บังคับ Research Package และตรวจสอบ LLM Key (WP-B2, WP-B3)
- **ไฟล์ที่คาดว่าต้องแก้:** `server/routers/write.ts`, `server/services/articleWriterService.ts`, หน้า Frontend ที่เกี่ยวข้อง
- **สิ่งที่ต้องทำ:**
  - บังคับให้หน้าเว็บ (Frontend) และ API (`createDraft`) เช็คว่ามี Research Package ที่สมบูรณ์ก่อนถึงจะยอมให้สร้างบทความได้ ถ้าไม่มีให้แจ้งเตือนผู้ใช้อย่างชัดเจน
  - เพิ่ม Onboarding เช็คว่าผู้ใช้ใส่ LLM API Key แล้วหรือยัง หากยังไม่ได้ใส่ให้มีข้อความภาษาไทยแนะนำไปหน้าการตั้งค่า

### งานที่ 2.2 — แก้ไข Fallback Parser (WP-A1)
- **ไฟล์ที่คาดว่าต้องแก้:** `server/services/articleWriterService.ts`
- **สิ่งที่ต้องทำ:**
  - เปลี่ยน Markdown Heading (`###`) ในระบบ Fallback ให้เป็นรูปแบบตกแต่งแทน (Decorative label เช่น `✦ ข้อมูลเพิ่มเติม ✦`) เพื่อไม่ให้ Frontend Parser ตัด Section ผิดพลาด

### งานที่ 2.3 — ปรับปรุงสถาปัตยกรรมกัน Timeout (WP-B5)
- **สิ่งที่ต้องทำ:**
  - ประเมินและออกแบบการย้าย Long-running task ไปรันเป็น Background Worker หรือทำ Streaming progress เพื่อป้องกันการ Timeout 60s บน Vercel

### งานที่ 2.4 — การทดสอบและความเสถียร (WP-D1, WP-D2)
- **สิ่งที่ต้องทำ:**
  - เพิ่ม Integration Test สำหรับ `createDraft` เพื่อให้ครอบคลุม Flow จริง
  - ฝ่ายพัฒนาต้องยืนยันว่าการ Deploy ติดตั้งโค้ดใหม่บน VPS สำเร็จจริง (ผ่านการตรวจสอบ Tar Checksum หรือ Versioning)

## 3. เกณฑ์การตรวจรับงาน (Acceptance Criteria)
- [ ] หากไม่มี Research Package จะกดสร้างบทความไม่ได้และมีข้อความแจ้งเตือน
- [ ] หากไม่มี API Key ระบบแจ้งเตือนชัดเจนเป็นภาษาไทย
- [ ] หากเกิด Fallback เนื้อหาที่หน้าเว็บต้องไม่ถูกตัดขาดหายไป
- [ ] กระบวนการรันสร้างบทความต้องไม่ Timeout กลางคัน
- [ ] มี Integration test ครอบคลุม

---
*— จบใบสั่งงาน WO-PIPELINE-2569-007 —*
