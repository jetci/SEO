# 📝 รายงานส่งมอบงานให้ฝ่ายตรวจสอบ (QA / Auditor)

**Ticket:** CT-01 (บั๊ก Placeholder จากการที่ Model ID ผิดแล้วระบบมองเป็น Transient Error)
**สถานะการส่งมอบ:** ฝ่ายพัฒนาแก้ไขและนำขึ้น Production (V2) เรียบร้อยแล้ว (PID 23, Build #1789840130891)

---

## 📂 รายการไฟล์ที่ถูกแก้ไข (Files Modified)

| ลำดับ | ไฟล์ | ส่วนที่แก้ไข (Lines / Logic) |
|---|---|---|
| 1 | `server/services/llmClient.ts` | - ปรับ Default Model ให้เป็นตัวที่เสถียร (latest) ไม่ใช้ exp/hard date<br>- **เพิ่ม Function `validateModelForProvider`** เช็คความถูกต้องของ Prefix ก่อนยิง API<br>- **ดักจับ HTTP Status 400 และ 404** และโยน Error `[LLM_MODEL_INVALID_*]` แบบ Permanent Fail ทันที<br>- เปลี่ยนเงื่อนไขใน loop `chatRaw` ให้ `break;` ทันทีเมื่อเจอ Error โหมด Model Invalid |
| 2 | `server/services/articleWriterService.ts` | - เปลี่ยนเงื่อนไข Loop `writeDraft` (Retry 5/5) ให้เช็คและ `break;` ทันที หากเกิด Error `isModelInvalid` เพื่อไม่ให้ระบบต้องรอ Retry ฟรี 5 รอบ (ประหยัดเวลา 52 วินาที/section) และไม่เผลอพ่น Placeholder ออกมา |

---

## 🎯 คำแนะนำและขั้นตอนการตรวจรับงาน (Test Steps สำหรับฝ่ายตรวจสอบ)

ฝ่ายตรวจสอบสามารถทดสอบระบบบนหน้า Production (หรือ Local) ได้ด้วยวิธีการต่อไปนี้:

### Test Case 1: ทดสอบกรณี Provider Prefix ผิด (Pre-call Validation)
1. ไปที่เมนู **ตั้งค่าระบบ (Settings)**
2. เลือก Provider เป็น `openrouter`
3. ตั้งค่า Model ID เป็น `gpt-4o-mini` **(จงใจไม่ใส่ `openrouter/` นำหน้า)**
4. กดบันทึก (หรือกดยืนยัน) จากนั้นลองไปที่ **หน้าเขียนบทความ (Write)** แล้วกด **สร้างบทความ (Generate Draft)**
5. **สิ่งที่ต้องเกิดขึ้น:** ระบบจะต้อง **Fail ทันที (Fast-fail)** โดยไม่เสียเวลารอ API และจะพ่นข้อความ Error ขึ้นมาทันทีว่า `[LLM_MODEL_VALIDATION_OPENROUTER]` และบทความนั้นจะแสดงสถานะเป็น Error ชัดเจน ไม่ใช่สถานะ "สำเร็จ" พร้อม Placeholder

### Test Case 2: ทดสอบกรณี Model 404 (มีอยู่จริงแต่ถูกลบ / พิมพ์ผิด)
1. ไปที่เมนู **ตั้งค่าระบบ** และเลือก Provider `openai` (หรือตัวอื่น)
2. ใส่ Model ID เป็นค่ามั่วๆ เช่น `gpt-4-super-fake-model`
3. ลองสร้างบทความ
4. **สิ่งที่ต้องเกิดขึ้น:** ระบบจะยิง API ไป 1 ครั้งและได้รับ HTTP 404 กลับมา ระบบจะต้อง **Fail และหยุดทำงานของ Section นั้นทันที** โดยไม่เข้าสู่โหมด Retry Backoff 5 ครั้ง 
5. ข้อความ Error จะต้องโชว์เป็น `[LLM_MODEL_NOT_FOUND_OPENAI]` แทนที่จะตีเนียนเป็นความสำเร็จ 100%

### Test Case 3: ตรวจสอบ Regression (ของเดิมต้องไม่พัง)
1. ตรวจสอบหน้า `/` (Dashboard), `/kcp`, `/settings` ว่าโหลดขึ้นมาได้ปกติ ไม่มีหน้าขาว
2. ตรวจสอบว่าระบบสามารถเขียนบทความจนจบด้วย Model ID ที่ถูกต้องได้ตามปกติ 

---
**หมายเหตุถึงฝ่ายตรวจสอบ:** 
Root Cause เดิมที่ทำให้เกิดปัญหา Placeholder ทุกๆ Section คือการที่ระบบตกไปที่ `JSON.parse()` ตอนเจอ Error 400/404 การแพทช์ครั้งนี้เป็นการปิดประตูนั้นอย่างถาวร ทำให้ LLM Retry Slot จะสงวนไว้ใช้สำหรับจังหวะที่เซิร์ฟเวอร์ปลายทางล่มจริงๆ (500) หรือติด Rate Limit (429) เท่านั้นครับ
