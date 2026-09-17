# ใบสั่งงานแก้ไข (WORK ORDER)

**EEAT Studio V2 — ระบบเขียนบทความ**

## เรื่อง: สำเร็จปลอม (Lie-Success) — บทความเสียหายรุนแรงแต่ระบบรายงาน 100%

| หัวข้อ | รายละเอียด |
|---|---|
| เลขที่งาน | WO-CONTENT-2569-002 |
| ผู้รับผิดชอบ | ฝ่ายพัฒนา (Backend หลัก + Frontend) |
| ความสำคัญ | **วิกฤต (Critical)** — ทำลายผลงานผู้ใช้โดยตรง — บทความเสียหายแต่ระบบบอกสำเร็จ ผู้ใช้เผลอ publish |
| ประเมินเวลา | 1-2 วันทำงาน |
| Component | `articleWriterService.ts` · `llmClient.ts` · `settings.ts` · `WritePage.tsx` |

## 1. อาการที่พบ (จากหน้าจอผู้ใช้จริง)

- ความคืบหน้าแสดง 100% + 'เสร็จสมบูรณ์' + ทุก section ติ๊ก ✓ เสร็จ
- เนื้อหาจริงหลาย section เป็น '[AUTO PLACEHOLDER — LLM transient limit hit 5/5 attempts]'
- Step 2 ตั้งเป้า 4,500 คำ แต่เขียนได้จริง ~553 คำ (12%)
- การ์ด Keyword Density แสดง '✓ ไม่เกินเพดาน' — ระบบรายงานว่าปกติ
- ตัวชี้วัดทุกตัวบอกสำเร็จ แต่บทความใช้งานไม่ได้จริง

## 2. สาเหตุที่แท้จริง — 3 ชั้นทำงานร่วมกัน

> 3 ชั้นซ้อน: LLM ล้มครบ 5/5 → ใส่ placeholder แทนเนื้อหา → ตัวชี้วัด (progress/density) โกหกว่าสำเร็จ

### CT-01 — LLM ล้มครบ 5/5 ครั้ง แล้วใส่ placeholder แทนเนื้อหา (ต้นตอ)

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - placeholder ระบุ 'LLM transient limit hit 5/5 attempts' = ยิงครบ 5 ครั้งล้มหมด (มัก 429 rate limit / 402 เครดิตหมด)
  - retry 5 ครั้งติดกันล้มหมด = backoff ไม่พอ หรือ key มีปัญหาถาวร
  - ครบ 5/5 ระบบใส่ placeholder แทนหยุด+แจ้ง error
- **วิธีแก้ไข:**
  - ตรวจต้นตอก่อน: ยืนยัน LLM key มีเครดิต + ไม่ติด rate limit (เชื่อม pingCurrent/SET-05)
  - ปรับ backoff exponential + jitter (2s/5s/15s) ไม่ยิงรัว
  - แยก error: 429=รอแล้ว retry / 402=หยุดแจ้งเครดิตหมด / 401=key ผิด ไม่ retry มั่ว
- **เอกสารจัดเก็บที่:** `server/services/llmClient.ts (retry/backoff); server/services/articleWriterService.ts (fallback L381-402)`

### CT-02 — placeholder ถูกนับเป็น section 'เสร็จ' — สำเร็จปลอม

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - section ที่ได้ placeholder ถูก mark stepStatus='done' ติ๊ก ✓ เหมือนปกติ
  - ไม่แยกสถานะ failed/placeholder จาก done จริง flow เดินถึง Step 7 ได้
- **วิธีแก้ไข:**
  - placeholder marker → stepStatus='fail' + flag isPlaceholder=true
  - บล็อก 'ถัดไป'/publish ถ้ามี section placeholder
  - badge สีแดง 'ต้องเขียนใหม่' บน section นั้น
- **เอกสารจัดเก็บที่:** `server/services/articleWriterService.ts (fallback → stepStatus done)`

### CT-03 — Progress พุ่ง 100% ได้ — ตัวกัน 90% ถูกเขียนค้าง (void ทิ้ง)

- **ความร้ายแรง:** 🔴 วิกฤต
- **ปัญหาที่ตรวจพบ:**
  - มีโค้ดกัน Lie-Success: คำนวณ pctMax90 จำกัด progress ไม่เกิน 90% จนมี payload จริง
  - บรรทัดถัดมา 'void pctMax90;' = คำนวณแล้วทิ้ง ไม่ได้ใช้
  - ตัวกันไม่ทำงาน progress พุ่ง 100% แม้เป็น placeholder
- **วิธีแก้ไข:**
  - เอา pctMax90 ไปใช้จริง: progress = pctMax90 จนทุก section มี body จริง
  - progress = section สำเร็จจริง / ทั้งหมด (ไม่นับ placeholder)
  - 100% ได้ต่อเมื่อ: ทุก section done จริง + total words ผ่านเกณฑ์ + ไม่มี placeholder
- **เอกสารจัดเก็บที่:** `client/src/pages/WritePage.tsx (L1203-1209)`

### CT-04 — Density denominator ใช้คำจริง (553) แทนเป้า (4,500) → เพดานเลื่อนตามความล้มเหลว

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - เพดาน density ใช้จำนวนคำจริง (553) ไม่ใช่ targetWordTotal (4,500)
  - บทความสั้น เพดานลด 63→11 ครั้ง → การ์ดขึ้น ✓ ไม่เกินเพดาน ทั้งที่สั้นกว่าเป้า 8 เท่า
  - density เขียวเสมอ ไม่เตือนว่าเนื้อหาไม่ครบ
- **วิธีแก้ไข:**
  - เพิ่มการ์ดเทียบ 'คำจริง vs เป้า' (553/4500=12%) สีแดงถ้าต่ำกว่าเกณฑ์
  - density คำนวณจากคำจริงได้ แต่ห้ามตีความว่าสำเร็จถ้าคำไม่ถึงเป้า
  - เกณฑ์ผ่าน Step ต้องรวม total words ≥ 80% ของเป้า
- **เอกสารจัดเก็บที่:** `client/src/pages/WritePage.tsx (L1363 baseWordsForCeiling ใช้ wc จริง)`

### CT-05 — เนื้อหา generic/hardcode (wikipedia/Thailand, google trends) เมื่อ research ว่าง

- **ความร้ายแรง:** 🟠 สูง
- **ปัญหาที่ตรวจพบ:**
  - section อ้างอิงใส่ลิงก์ hardcode wikipedia.org/wiki/Thailand, google trends ที่ไม่เกี่ยว keyword
  - เกิดเมื่อ research package ว่าง (โยง WP-B2)
  - ดูเหมือนมีอ้างอิงแต่เป็นลิงก์ปลอม = EEAT ติดลบ
- **วิธีแก้ไข:**
  - ห้าม hardcode reference — ไม่มี citation จริงให้เว้น/แจ้งรัน research ก่อน
  - บังคับ createDraft ต้องมี research package ที่มี citation จริง (precondition WP-B2)
- **เอกสารจัดเก็บที่:** `server/services/articleWriterService.ts (fallback references); write.ts (createDraft pkg loader)`

## 3. ลำดับการแก้ไข

แก้ CT-01 (ต้นตอ) ก่อน มิฉะนั้นแก้ที่อื่นก็ยังได้บทความเปล่า:

1. **CT-01:** LLM ล้มครบ 5/5 ครั้ง แล้วใส่ placeholder แทนเนื้อหา (ต้นตอ)
2. **CT-02:** placeholder ถูกนับเป็น section 'เสร็จ' — สำเร็จปลอม
3. **CT-03:** Progress พุ่ง 100% ได้ — ตัวกัน 90% ถูกเขียนค้าง (void ทิ้ง)
4. **CT-04:** Density denominator ใช้คำจริง (553) แทนเป้า (4,500) → เพดานเลื่อนตามความล้มเหลว
5. **CT-05:** เนื้อหา generic/hardcode (wikipedia/Thailand, google trends) เมื่อ research ว่าง

## 4. เกณฑ์การตรวจรับงาน (Acceptance Criteria)

- [ ] LLM ล้มจริง → หยุด+แจ้ง error ชัด (เครดิต/rate limit/key) ไม่ใส่ placeholder เงียบ
- [ ] section ล้ม/placeholder แสดง 'ต้องเขียนใหม่' (แดง) ไม่ติ๊ก ✓
- [ ] progress ไม่ถึง 100% ถ้ามี section ไม่สำเร็จ หรือ total words ต่ำกว่าเกณฑ์
- [ ] ปุ่ม publish ถูกบล็อกเมื่อมี placeholder เหลือ
- [ ] การ์ดแสดง 'คำจริง/เป้า' ชัดเจน แดงถ้า <80%
- [ ] ไม่มี reference hardcode — reference จาก research จริงเท่านั้น
- [ ] ทดสอบ mock 429/402 → ระบบต้องไม่แสดง 'สำเร็จ'

## 5. หมายเหตุ

- CT-01 เป็นต้นตอ — ไม่แก้ ผู้ใช้ยังเขียนไม่ได้แม้แก้ตัวชี้วัด
- CT-03 คือ bug บรรทัดเดียว (void pctMax90) แก้ง่ายผลกระทบสูง
- ก่อนสรุปว่าแก้สำเร็จ ต้องยืนยัน deploy ขึ้น VPS จริง (WP-D1)
- เกี่ยวข้องกับ: WP-B1, WP-B2, WP-D1 (ต้องยืนยัน deploy ขึ้น VPS จริงก่อนสรุป), SET-05

## 6. การเซ็นรับงาน

| ผู้พัฒนา | ผู้ตรวจ (QA) | ผู้อนุมัติ |
|---|---|---|
| | | |
| ลงชื่อ / วันที่ | ลงชื่อ / วันที่ | ลงชื่อ / วันที่ |

---
*— จบใบสั่งงาน WO-CONTENT-2569-002 —*
