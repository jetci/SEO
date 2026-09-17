# รายงานเจาะลึก: ระบบเขียนบทความ (Write Pipeline)

**EEAT Studio V2** — เหตุผลที่การเขียนบทความไม่ทำงานจริง และแผนแก้ไข

ขอบเขต: 5-Step Write Pipeline (Outline → Section Write → Assemble → Meta → Publish)

## ภาพรวมสถาปัตยกรรม

- ผู้ใช้ต้องมีทีม + บันทึก LLM API key ในตาราง settings ของทีมก่อน (เข้ารหัส AES-256-GCM)
- ต้องมี research package (SERP/PAA/ai_overview/citation) ของ keyword ระดับ pillar ก่อน
- generateOutline สร้างโครง H1-H3 จาก SERP/PAA + กรอง heading ต้องห้าม
- createDraft → ArticleWriterService.writeDraft วน for loop เขียนทีละ section (retry 5/section)
- saveDraft บันทึกที่แก้ · publish เปลี่ยน status (ต้องสิทธิ์ admin ระดับทีม)

> จุดเปราะ: ทุกขั้นพึ่ง LLM key ที่ตั้งถูก + research package ที่มีข้อมูลจริง ขาดข้อใดข้อหนึ่ง = generic หรือเขียนไม่ออก

## หลักฐานจาก Debug Note ของทีมเอง

- `debug-step3-empty-body-skip.md` — 'ระบบไม่เขียนแม้แต่คำเดียว แต่แจ้งว่าเสร็จ แล้วตัดไป step 4' (root cause 10 จุด)
- `debug-step3-content-quality-garbage.md` — 'เนื้อหาติดลบ ไม่มีสาระ ซ้ำซ้อน แข็งกระด้าง ทุก section เหมือนกัน'
- **Deploy Sync Failure**: debug note ระบุเองว่าโค้ดที่แก้แล้วไม่เคยขึ้น VPS จริง (deploy exit 0 หลอก, tar ไม่ overwrite) → VPS รันโค้ดเก่า อาจเป็นเหตุที่ยังเห็นปัญหาเดิม

---

## กลุ่ม A · ทำให้ 'เขียนไม่ออกเลย' (0 คำ แต่แจ้งสำเร็จ)

### WP-A1 — fallback ใส่ markdown heading (##/###) ลงใน body → parser ตัดเป็น phantom section

- **ความร้ายแรง:** 🟠 สูง
- **สถานะ:** ทีมระบุแก้แล้ว (H10) แต่ต้องยืนยัน deploy ขึ้นจริง (ดู WP-D1)
- **ปัญหาที่ตรวจพบ:**
  - เดิม fallback push บรรทัด ##/### เข้า body_markdown
  - FE split body ด้วย heading → เนื้อหาเหลือแค่ intro ~300 ตัวอักษร ที่เหลือหาย → รวมได้แค่ ~749 คำ ต่ำกว่า 1500
- **วิธีแก้ไข:**
  - fallback ปัจจุบันยังมี ### (ข้อมูลพื้นฐาน/จุดเน้นหลัก/คำแนะนำ) — เปลี่ยนเป็น decorative label ✦...✦
  - หรือให้ parser ไม่ split ภายใน body ของ section เดียว
- **เอกสารจัดเก็บที่:** `server/services/articleWriterService.ts; WritePage.tsx (parseBodyMdIntoSections)`

### WP-A2 — FE fake progress + auto-jump ไป step 4 ไม่ผูกกับผลจริง

- **ความร้ายแรง:** 🟡 กลาง
- **สถานะ:** ทีมระบุแก้แล้ว (H1/H4)
- **ปัญหาที่ตรวจพบ:**
  - เดิมมี setInterval 1600ms progress ปลอม + setTimeout เด้ง step 4 ไม่รอ payload
  - ผู้ใช้เห็น 100% เขียว + ตัด step ทั้งที่ยังไม่มีเนื้อหา
- **วิธีแก้ไข:**
  - progress คำนวณจาก section ที่มี body จริง
  - ไป step ถัดไปต้อง manual + ผ่าน guard ความยาว
- **เอกสารจัดเก็บที่:** `client/src/pages/WritePage.tsx`

### WP-A3 — FE อ่าน path ผลลัพธ์ผิด + threshold ตัดเนื้อหาสั้นทิ้งเงียบ

- **ความร้ายแรง:** 🟡 กลาง
- **สถานะ:** ทีมระบุแก้แล้ว (H6/H7)
- **ปัญหาที่ตรวจพบ:**
  - เดิมอ่าน gd.content แต่ payload อยู่ที่ gd.draft.content → null เสมอ
  - threshold 400 ตัวอักษรตัด draft ~133 ตัวอักษรทิ้งเงียบ
- **วิธีแก้ไข:**
  - ยึด contract getDraft (draft.content) + type ชัด
  - ยกเลิก magic threshold แสดงสถานะจริงแทนการเงียบ
- **เอกสารจัดเก็บที่:** `client/src/pages/WritePage.tsx (getDraft consumer)`

---

## กลุ่ม B · เขียนออกแต่ 'คุณภาพติดลบ' (ยังเป็นปัญหาอยู่)

### WP-B1 — fallback placeholder ยังนับเป็น draft สำเร็จ → ผู้ใช้เผลอ publish เนื้อหาปลอม

- **ความร้ายแรง:** 🔴 วิกฤต
- **สถานะ:** ยังอยู่ในโค้ด (articleWriterService L381-402)
- **ปัญหาที่ตรวจพบ:**
  - LLM ล้มครบ 5/5 ต่อ section → ใส่ '[AUTO PLACEHOLDER]' + template คงที่
  - placeholder ยาวพอผ่าน MIN_BODY_CHARS จึงนับ done, status=draft ปกติ
  - ถ้า LLM ล้มทั้งหมด บทความเป็น placeholder ล้วน แต่แจ้งเสร็จ = ต้นเหตุ 'ทุก section เหมือนกัน/ไม่มีสาระ'
- **วิธีแก้ไข:**
  - placeholder → mark section failed + stepStatus='fail'
  - บล็อก publish จนไม่มี placeholder + badge เตือนต่อ section
  - เก็บ count placeholder ให้ Admin Audit เห็นคุณภาพจริง
- **เอกสารจัดเก็บที่:** `server/services/articleWriterService.ts`

### WP-B2 — เนื้อหาขึ้นกับ research package — ถ้าขาด/ว่าง outline+body จะ generic ทันที

- **ความร้ายแรง:** 🔴 วิกฤต
- **สถานะ:** ปัญหาเชิงดีไซน์ (ยังอยู่)
- **ปัญหาที่ตรวจพบ:**
  - buildOutline สร้าง heading/key_points จาก serp_top10/paa โดยตรง — ถ้าว่างได้ outline generic ('ภาพรวมทั้งหมด...')
  - per-section prompt ป้อน ai_overview เป็น context หลัก — ว่าง = LLM เขียน robotic ลอย ๆ
  - createDraft ไม่ตรวจว่ามี research จริงก่อนเขียน (fallback empty เงียบ)
- **วิธีแก้ไข:**
  - บังคับ createDraft ต้องมี research package ไม่ว่าง มิฉะนั้น throw ให้ไปรัน research ก่อน
  - แสดงสถานะ research ต่อ keyword ใน UI ก่อนเปิดปุ่มเขียน
  - แยกโหมด 'ไม่มี research' + เตือนคุณภาพต่ำ ไม่ใช่เขียนเงียบ
- **เอกสารจัดเก็บที่:** `articleWriterService.ts (buildOutline); write.ts (createDraft L180-210)`

### WP-B3 — ต้องมี LLM API key ในตาราง settings ของทีมก่อน มิฉะนั้นเขียนไม่ได้

- **ความร้ายแรง:** 🟠 สูง
- **สถานะ:** ปัญหา onboarding/config (ยังอยู่)
- **ปัญหาที่ตรวจพบ:**
  - llmClient โยน NO_KEY ถ้าไม่มี key (มาจาก settings ต่อทีม)
  - resolveTeamIdForSettings throw FORBIDDEN ถ้าไม่อยู่ทีมใดเลย → ผู้ใช้ใหม่เขียนไม่ได้ error กำกวม
  - settings.save บังคับ ping จริง — network บล็อกแล้วบันทึกไม่ได้
- **วิธีแก้ไข:**
  - onboarding: ต้องมีทีม + ตั้ง LLM key ก่อนเปิดหน้าเขียน + checklist สถานะ
  - แปลง NO_KEY/FORBIDDEN เป็นข้อความไทยชี้ทาง Settings
  - ให้ validatePing optional (บันทึกได้แม้ ping ไม่ผ่าน + เตือน)
- **เอกสารจัดเก็บที่:** `llmClient.ts (NO_KEY throw); settings.ts (resolveTeamSettings)`

### WP-B4 — เขียนแบบ sequential (ถูกต้อง) แต่ FE ไม่มี streaming ต่อ section

- **ความร้ายแรง:** 🟡 กลาง
- **สถานะ:** UX — ทีมว่า 'รับได้' แต่ควรปรับ
- **ปัญหาที่ตรวจพบ:**
  - โค้ดเขียนทีละ section ด้วย for loop (ถูกแล้ว)
  - createDraft คืนผลครั้งเดียวตอนจบ FE เห็นทุก section พร้อมกัน = เข้าใจว่าเขียนพร้อมกัน
  - บทความยาว (8 section x retry 5) อาจ timeout
- **วิธีแก้ไข:**
  - ทำ streaming/SSE หรือ per-section endpoint อัปเดต progress จริง
  - หรือแตกเป็น async job + polling
- **เอกสารจัดเก็บที่:** `articleWriterService.ts (for loop L323); WritePage.tsx`

### WP-B5 — createDraft เป็นงานหนักยาวนาน บน Vercel serverless เสี่ยง timeout

- **ความร้ายแรง:** 🟠 สูง
- **สถานะ:** ปัญหาเชิงสถาปัตยกรรม (ยังอยู่)
- **ปัญหาที่ตรวจพบ:**
  - 1 บทความ = หลาย section x LLM (timeout 60s/call + retry) รวมหลายนาที
  - Vercel function มีเพดานเวลา (10-60s) → createDraft ถูกตัดกลางคัน = ค้าง
  - สอดคล้อง SCHED-02: งานยาวไม่เข้ากับ serverless
- **วิธีแก้ไข:**
  - ย้ายงานเขียนไป background worker/queue (VPS ที่มี) + FE poll status
  - หรือแตก job ต่อ section ให้จบในเพดานเวลา
- **เอกสารจัดเก็บที่:** `write.ts (createDraft); deploy = Vercel`

---

## กลุ่ม D · Deploy / การนำโค้ดขึ้นจริง

### WP-D1 — Deploy sync ไม่น่าเชื่อถือ — โค้ดที่แก้แล้วอาจไม่ขึ้น VPS จริง

- **ความร้ายแรง:** 🔴 วิกฤต
- **สถานะ:** ระบุเองใน debug note (ต้องตรวจซ้ำ)
- **ปัญหาที่ตรวจพบ:**
  - debug note: 'R7 Hotfix NEVER REACHED VPS (deploy exit 0 false success, tar skip overwrite)'
  - แก้ด้วย Direct SFTP bypass ยิงไฟล์เดียว = workaround เปราะ ทำซ้ำไม่ได้
  - tsx runtime cache ต้อง clear เอง มิฉะนั้นรัน TS เก่า
- **วิธีแก้ไข:**
  - deploy ต้อง verify checksum ไฟล์ปลายทางหลัง deploy (ไม่ trust exit code)
  - เพิ่ม clear cache + health check ยืนยัน version หลัง restart
  - ใช้ build artifact เดียว (dist) + immutable deploy
- **เอกสารจัดเก็บที่:** `deploy_to_thaiaeo.ps1; scripts/_tmp_hf1_sftp_sync_builder.mjs`

### WP-D2 — createDraft ไม่มี test ที่ยิง LLM จริง — เทสผ่านแต่ของจริงพัง

- **ความร้ายแรง:** 🟠 สูง
- **สถานะ:** ช่องว่างการทดสอบ
- **ปัญหาที่ตรวจพบ:**
  - handoff อ้าง 298/298 pass แต่ปัญหายังเกิด = เทสไม่ครอบคลุม end-to-end (น่าจะ mock)
  - 'แจ้งสำเร็จแต่ไม่มีเนื้อหา' หลุดผ่านเทส = เทสตรวจแค่ status ไม่ตรวจคุณภาพ
- **วิธีแก้ไข:**
  - integration test: createDraft → ทุก section มี body จริง + ไม่มี placeholder + total words ผ่านเกณฑ์
  - contract test BE payload vs FE consumer
  - ทดสอบเคส LLM ล้ม/ไม่มี research/ไม่มี key ว่าแสดง error ถูก ไม่ใช่สำเร็จปลอม
- **เอกสารจัดเก็บที่:** `tests/ + db/*.test.ts`

---

## สรุป Root Cause ที่แท้จริง (4 ชั้นซ้อนกัน)

1. **ชั้นสำเร็จปลอม (WP-B1):** LLM ล้ม → ใส่ placeholder → นับเป็น 'done' ซ่อนทุกอาการใต้สถานะสำเร็จ (รากหลัก)
2. **ชั้นขาด context (WP-B2/B3):** ไม่มี LLM key หรือ research → เนื้อหา generic ทันที
3. **ชั้น pipeline เปราะ (WP-A1/A2/A3):** parser/threshold/path ตัดเนื้อหาที่เขียนได้จริงหาย (ทีม patch แล้ว)
4. **ชั้น deploy (WP-D1):** โค้ดแก้แล้วอาจไม่ขึ้น VPS จริง — ต้องตรวจก่อนสรุปว่าโค้ดยังพัง

## Checklist แก้ไข (เรียงลำดับทำ)

1. **ยืนยันชั้น deploy ก่อน (WP-D1):** เทียบ checksum โค้ดบน VPS กับ repo + clear tsx cache + restart ถ้าไม่ตรง deploy ใหม่แล้วทดสอบซ้ำก่อนแก้โค้ด
2. **WP-B1:** placeholder = failed ไม่ใช่ done + บล็อก publish เมื่อมี placeholder
3. **WP-B2:** บังคับ createDraft ต้องมี research package จริง + แสดงสถานะ research ต่อ keyword
4. **WP-B3:** onboarding LLM key + แปลง NO_KEY/FORBIDDEN เป็นข้อความไทยชี้ทาง Settings
5. **WP-A1:** เปลี่ยน ### ใน fallback เป็น decorative label + แยก outline heading ออกจาก body
6. **WP-B5/B4:** ย้ายงานเขียนไป background worker + streaming progress ต่อ section (แก้ timeout + UX)
7. **WP-D2:** เพิ่ม integration test end-to-end ตรวจคุณภาพ/ความยาว/ไม่มี placeholder จริง
