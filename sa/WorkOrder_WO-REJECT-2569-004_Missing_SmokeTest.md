# ใบสั่งงานแก้ไข (WORK ORDER) - REJECTED ❌

**EEAT Studio V2 — ระบบความถูกต้องของข้อมูลและ Route Guards**

## เรื่อง: REJECTED — ส่งงานไม่ครบตาม Acceptance Criteria (Missing Live Smoke Test)

| หัวข้อ | รายละเอียด |
|---|---|
| เลขที่งาน | WO-REJECT-2569-004 (ตีกลับ WO-URGENT-2569-004) |
| วันที่ออก | 2026-09-19 |
| ผู้ออกใบสั่งงาน | SA / System Auditor |
| ผู้รับผิดชอบ | ฝ่ายพัฒนา (Backend & Frontend) |
| ความสำคัญ | 🔴 วิกฤต (ต้องแก้ก่อนปิดตั๋ว) |

## 1. สาเหตุการตีกลับ (Rejection Reason)

ฝ่ายพัฒนาส่งรายงาน `SA_Verification_Report_WO-URGENT-2569-004_Data_Accuracy_Closed_7Tix.md` โดยอ้างว่าผ่านครบ 7/7 ตั๋ว และ Deploy ผ่าน 5-Step Gate แต่ **"เพิกเฉยต่อข้อบังคับพิเศษ (Live Smoke Test)"** ที่เพิ่มเข้าไปใน Acceptance Criteria ก่อนหน้านี้อย่างสิ้นเชิง

จากการตรวจสอบไฟล์รายงาน ไม่พบการพูดถึง **CT-01** หรือ **WP-D1** แต่อย่างใด

## 2. สิ่งที่ฝ่ายพัฒนาต้องทำ (Required Action)

ต้องปฏิบัติตามเกณฑ์ข้อบังคับพิเศษที่ระบุไว้ใน `WorkOrder_WO-URGENT-2569-004_Data_Accuracy.md` อย่างเคร่งครัด:

1. **CT-01 & WP-D1:** ต้องแนบหลักฐาน (Screenshot/Video หรือ Link) การกดสร้างบทความจริงบน UI (Production/Staging)
2. **CT-01 & WP-D1:** ต้องแสดงให้เห็นว่าได้ **"เนื้อหาบทความจริงๆ"** ออกมาในหน้า Preview ไม่ใช่ Error Message หรือ Placeholder (เป็นการยืนยันว่าตั้งค่า API Key ถูกต้อง และมีเครดิตเพียงพอ)

> ⚠️ ไม่อนุญาตให้ปิดตั๋ว WO-URGENT-2569-004 จนกว่าจะแนบหลักฐานการทดสอบ End-to-End บน UI จริงมาให้ตรวจสอบ

---
*— จบใบสั่งงาน WO-REJECT-2569-004 —*
