# EEAT Studio V2 · SEO Blueprint Standard 18 Mandatory Rules
> Status: ACTIVE BLUEPRINT — ACTIVE MANDATORY NON-NEGOTIABLE
> Source: User Professional SEO Pro 3 ชุด (Top-level Global Article Blueprint + Section Structure + Keyword Placement
> Created: 2026-09-17
> File: sa/BLUEPRINT_SEO_18_RULES.md
> Implement Gates: 4 Locations (Prompt + Step 3 Frontend Audits)

---
## 0. Executive Summary (3 Bullet)

1. **8 GLOBAL ARTICLE RULES — บังคับทั้งบทความ (Word Range + Heading Hierarchy + Links (External 2-4 DA≥40 + Internal 2-5 Silo
2. **10 PER-SECTION RULES — 5 Structure (Paragraphs/Sentences/Core Idea/White Space) + 5 Keyword Placement Density Alt
3. **4 GATE LOCATIONS MATRIX — Pipeline: Gate 1: Step 3 Outline / Gate 2: LLM Per-Section Prompt / Gate 3: Step 6 Review / Gate 4: Publish

---
## PART 1. 8 GLOBAL ARTICLE RULES
| ID | Rule (SEO Pro Verbatim) | Gate L | Level
|---|---|---|---|
| **G1** | ความยาวรวมทั้งบทความ **1,000 – 1,800 คำ** (ไม่เกิน 2,000) | Step 6 Hard (Publish Block) | CRITICAL RED
| **G2** | **จำนวนหัวข้อหลัก (H2): 3–6 หัวข้อ** (เฉลี่ย H2 = 200–350 คำ/H2) | Step 3 Outline Guard (CRITICAl RED
| **G3** | **จำนวนหัวข้อย่อย (H3): 1–3 ต่อ 1 H2 ใช้เมื่อ H2 ยาว ≥ 350 คำ หรือมีมิติย่อย / ไม่เกิน 500 คำ/H3 | Step 6 Audit Hard | CRITICAL RED if ≥500
| **G4** | **Section Words: 150–350 คำ / หัวข้อ | Step 6 Audit | YELLOW ≥350 → RED ≥400 → Block Publish
| **G5** | **Paragraphs/Section: 2-4 ย่อหน้า** | Prompt Mandatory | Hard
| **G6** | **External Links 2–4** เชื่อมโยงไปยังแหล่งข้อมูลความน่าเชื่อถือสูง (Authority / Gov / Edu / งานวิจัย DA≥40) | Step3 Sources Gate / Step 6 Audit
| **G7** | **Internal Links 2–5** ส่งผู้อ่านไปยังบทความที่เกี่ยวข้องในเว็บเพื่อสร้าง Silo Structure | Step 6 Audit Soft
| **G8** | **NO WALL OF TEXT:** ย่อหน้าแต่ละย่อหน้า = 2–4 ประโยค (≤ 40–70 คำ) ไม่เกิน 5 บรรทัดบนจอมือถือ | Prompt + Step 6 Audit | Hard Prompt Mandatory

---
## PART 2. 5 SECTION STRUCTURE RULES
| ID | Rule | Implement Location | Level |
|---|---|---|---|
| **S1** | **1 Section = 2-4 Paragraphs** | LLM Per-Section Prompt + Step 6 Audit | Hard Mandatory
| **S2** | **1 Paragraph = 2–4 ประโยค** (40-70 คำ) | LLM Prompt Hard
| **S3** | **White Space 2 newlines ห่าง paragraphs เสมอ** (ห้าม Wall of Text เกิน 5 บรรทัดมือถือ) | LLM Prompt Hard
| **S4** | Words/Section MIN=150 MAX=350; ≥350 YELLOW SPLIT; ≥400 RED FAIL | Step 6 Audit Publish Block
| **S5** | **Section Structure Mandatory:** P1 = Core Idea ตอบคำถามหัวข้อใน 1-2 ประโยคแรกของ Section (Thesis Statement) | LLM Prompt + Step 6 Audit | Hard + P2-P3 = Supporting Details + ตัวอย่าง + Citations [1][2]
| | P สุดท้าย = Bullet Summary หรือ Transition ≤ 3 Bullet Points ถ้ามี ≥3 items | Prompt |
---
## PART 3. 5 KEYWORD HIERARCHY PLACEMENT & DENSITY RULES
| ID | Rule | Implement Level |
|---|---|---|
| **K1** | **H1 + H2 ระดับ 1 จุด — Main Focus Keyword ต้องอยู่ใน H1 และอยู่ใน H2 แรก(≥ 1 H2) | Gate4 Publish Block CRITICAL RED ห้ามผ่าน |
| **K2** | **100 คำแรกของบทความ** (Introduction + 100 คำแรกของทุก Section:** Focus Keyword หรือ LSI synonym ต้องอยู่ใน 100 คำแรก | Step 6 Audit Hard + Prompt
| **K3** | **Density Sweet Spot 1.0% – 2.0%** + ห้ามซ้ำ Focus Keyword เดิม เกิน 1.5-2% ของทั้งบทความ และ ห้ามซ้ำ 3 ครั้งต่อ H2 Section โดยไม่มี LSI/Synonym แทรก | Prompt Audit Soft Yellow + Step 6 Audit
| **K4** | **Alt Text ≥ 1 ภาพ:** 1 H2 ใหญ่ (≥ 2 Sections) ต้องมี Alt Text มี Focus Keyword อย่างน้อย 1 ภาพ | Step 6 Audit Hard (ถ้ามีภาพ) |
| **K5** | **LSI Keyword/Synonym แทนการซ้ำคำเดิม**: สลับคำพ้องความหมายตามธรรมชาติ เช่น "ทำ SEO" ↔ "เพิ่มยอดเข้าชม" ↔ "อันดับการค้นหา" | Prompt Mandatory |

---
## 4 GATE IMPLEMENTATION MATRIX
| Gate ID | ขั้นตอน | Rules ที่ตรวจ | Location Files |
|---|---|---|---|
| **Gate 1** | **Step 3 Outline → Step 4 → ถัดไป (next) button onClick guard | G2 (3-6 H2) + K1 (H1 Focus คำหลัก) + G6 (External Sources 2 sources DA≥30 จาก Outline) | [WritePage.tsx](file:///d:/AEO/SEO%20V2/client/src/pages/WritePage.tsx) Step 3 next guard (sanitizeOutlineRows + toast)
| **Gate 2** | **Backend articleWriterService.ts LLM Prompt Injection — PER-SECTION SYSTEM PROMPT (ทุกๆ Section generate call):** G4, G5, G8, S1-S5, K2-K5, T1-T4 Template, C1-C3 Citation | [articleWriterService.ts](file:///d:/AEO/SEO%20V2/server/services/articleWriterService.ts#L287) section generate loop LLM prompt
| **Gate 3** | **Step 6 Review/ตรวจ แก้ไข → Step 7 → 7 (ถัดไป) Button Guard** ทุกๆ Section Compliance Card 5+M6 อัน + Overall Compliance Scoring % | [WritePage.tsx L2439 Step 6 cur===5
| **Gate 4** | **Publish + Unpublish Buttons at Step7 Disabled Guard avg_compliance < 75% หรือ RED CRITICAL FAIL: G1 length, G2 Outline Count, K1 H1 H2 Missing, G9 Intro<80, G10 Conc<50, any Section ≥400, Any Section Wall of Text (0 Paragraphs 1 ย่อหน้าเดียว ≥ 200+คำ) | [WritePage.tsx L2795 + L2806 CT02 disabled attr gate extend CT-02 + compliance
---
## PART 4. TEMPLATE BLUEPRINT — 4 H2 STANDARD ORDER + INTRO/CONCLUSION BUDGET
> USER VERBATIM TEMPLATE 4 H2 ORDER (Mandatory flow ผู้อ่านเข้าใจลำดับ)
| ID | Rule Template | Word Budget | Gate | Level |
|---|---|---|---|---|
| **T1 / G9** | **ส่วนนำ INTRODUCTION (Introduction Section heading_level 0 / H1 (Main Keyword) | 100–150 คำ (1-2 ย่อหน้า) · H1 มี Main Keyword · 100คำแรกของบทความ ต้องมี Main Keyword หรือ LSI (Hook ผู้อ่านทันที) | Step 6 Audit + Gate4 Publish Block | CRITICAL RED ถ้า <80w หรือ >200w |
| **T2 / 4 H2 STANDARD FLOW ORDER (Mandatory Non-Negotiable if 4 H2 (ปรับจำนวน H2 4 default template:
   **H2(1): นิยาม / ความสำคัญ (Definition / Importance)** | 200-350w · 2 Paragraphs + External Citation สถิติ/นิยามสากล 1 อ้างอิง Minimum 1 องค์ประกอบ** BE Prompt | Prompt + Step 6 Soft Warn** |
| | **H2(2): แกนหลัก / วิธีการ / กลยุทธ์ (Core Framework / Method Strategy)** | 300-600w, 1-3 H3 ย่อย:
   *H3(ก) ประเด็นย่อย 1: Para สั้น + Bullet 3-5 ข้อ;
   *H3(ข) ประเด็นย่อย 2: Para สั้น + Internal Link ไปบทความคู่มือที่เกี่ยวข้อง 1 จุด
| BE Prompt Hard + Step 6 Soft Warn | Prompt |
| | **H2(3): FAQ / ปัญหาที่พบบ่อย / เปรียบเทียบ (Common Issues / Compare)** | 200-350w · จัดเป็นตารางเปรียบเทียบ หรือ Checklist Bullet 5-8 ข้อ หรือ Q&A 3-5 ชุด** | Prompt + Step 6 Warn | |
| | **H2(4): ข้อควรระวัง / Best Practices / Tips** | 200-350w · 2-3 ย่อหน้าสั้นๆ (Short paragraphs) + Internal/External 1 ลิงก์ | Prompt + Step 6 Soft Warn |
| **T3 / G10** | **Conclusion & Next Steps (สรุปใจความสำคัญ 1 ย่อหน้า + CTA (Call to Action)** | 100–150 คำ · CTA = ลิงก์ไปยังหน้าสินค้า / บริการ / บทความสเต็ปถัดไป (Internal Link 1 จุด CTA) | Step 6 Audit Gate4 Publish Block | CRITICAL RED <50w หรือ ไม่มี CTA |
---
## PART 5. CITATION & LINK ANCHOR TEXT RULES 3 NEW
> User Verbatim CITATIONS RULES (ต้องอ้างอิงเมื่อมีตัวเลขสถิติ, งานวิจัย, กฎหมาย, มาตรฐานสากล)
| ID | Rule | Level | Implement Gate
|---|---|---|---|
| **C1 / G11** | **ต้องใส่ Citation (อ้างอิงทันที) เมื่อมี:** ตัวเลข, สถิติ, งานวิจัยทางวิชาการ, กฎหมาย, ข้อกำหนดมาตรฐานสากล · ห้ามอ้างสtat โดยไม่มีลิงก์อ้างอิง | **Step 6 Section Metric M6**: If Section มีตัวเลข ≥2+ digits detected มาตรฐาน ≥1 digit string ต้องมี ≥1 [CITE] External Anchor External Link | Hard (yellow if stats without link | Critical if 2 digit number → | C1
| **C2 / G12** | **Anchor Text Rule:** ใช้ Anchor ที่สื่อความหมายชัดเจน เช่น "ตามรายงาน สำนักงานสถิติแห่งชาติ" "งานวิจัยปี 2566" → ห้ามใช้คำว่า "คลิกที่นี่", "按这里", "click here", "ที่นี่", "อ่านต่อ" วาง URL ดิบโดยไม่มีคำอธิบาย | Step 6 Global G12 + M6 Per section anchor text check | Publish Block Critical ถ้า anchor text ไม่ดี (เจอ "คลิกที่นี่")|
| **C3 G13** | **External Link target=_blank Mandatory:** ลิงก์ภายนอก (ไม่ใช่ localhost / domain ของเราเอง) → ตั้งค่า `target="_blank"` เปิดแท็บใหม่ (เพื่อไม่ให้ผู้อ่านหลุดออกจากเว็บไซต์เดิม) | Rendered markdown render check (Step 6 G13 Soft Warn only (non publish block) | Soft Warning Yellow Warn |
---
## PART 7. CITATION SOURCE QUALITY + FORBIDDEN SOURCES (USER VERBATIM ANNEX 3 2026/09/18)
> EEAT-PRO Citation Hierarchy — เลือกแหล่งอ้างอิงตามระดับความน่าเชื่อถือ 5 ระดับ Q1 (ดีที่สุด) ↔ Q5 (ยอมรับได้น้อยสุด) + 4 Source Types FORBIDDEN (ห้ามใช้ Publish Block G14) + 3 Apply Principles

### 7.1 QUALITY SOURCE TIERS (Q1-Q5 — เลือกใช้ Top-Down Q1 ก่อนเสมอ)
| TIER | ประเภทแหล่งอ้างอิง | ตัวอย่างชัดเจน | Usage Weight Priority |
|---|---|---|---|
| **Q1** | งานวิจัยและวารสารวิชาการ Peer Review | MDPI, ResearchGate, Pubmed, Mahidol Research, Chula Journal, Scopus, Elsevier, JSTOR, มหาวิทยาลัยรายงาน | **MANDATORY PREFERRED** — สุขภาพ/การแพทย์/วิทยาศาสตร์ ต้อง Q1 ก่อนเสมอ |
| **Q2** | สถิติ / รายงานอย่างเป็นทางการ หน่วยงานรัฐ องค์กรระหว่างประเทศ | NSO สำนักงานสถิติ, BOT ธนาคารแห่งประเทศไทย, WHO, WorldBank, UN, IMF, Statista, Gartner, NPD, Nielsen, ศูนย์ข้อมูลภาครัฐ | ตัวเลข % เลขจำนวน ≥3 หลัก ต้อง Q2 minimum (Publish Block หากใช้ Q5 แทน Q2) |
| **Q3** | กฎหมาย ระเบียบ มาตรฐานอุตสาหกรรมประกาศราชกิจจานุเบกษา | Official Gazette, ISO 27001, THORS, ประกาศ กรม, กระทรวง, รัฐธรรมนูญ, แก้ไขกฎหมายล่าสุด | ใช้สำหรับประเด็นข้อบังคับ ข้อกำหนดสินค้า ความเสี่ยงทางกฎหมาย |
| **Q4** | Original Documentation / Developer Docs / Release Notes / Specs | Apple Developer Docs, MDN, Official Release Page สินค้า, Spec Sheet จากแบรนด์ต้นทาง, Github changelog | ใช้เทียบสเปค / เวอร์ชันซอฟต์แวร์ / ฟีเจอร์อุปกรณ์ ต้องมาจากแบรนด์ต้นทางเท่านั้น |
| **Q5** | บทสัมภาษณ์ / บทวิเคราะห์ / SME Expert Quote | LinkedIn Expert Verified, CEO Statement, หัวหน้าฝ่ายเทคนิค, เจ้าของสายงาน 10+ ปี ประสบการณ์ | ใช้เสริม Opinion ประเด็นที่ไม่มีข้อมูล Q1-Q3 อยู่ — ยอมรับได้สุดท้าย ห้ามใช้ Q5 เป็นหลักทั้งหมด |

### 7.2 SOURCE FORBIDDEN TYPES (ห้ามอ้างอิงเด็ดขาด — F1-F4 Publish Block Critical = G14)
| ID | Forbidden Source Description | GATE4 Publish Block Enforcement |
|---|---|---|
| **F1** | บทความก๊อปปี้ต่อหลายทอด (Copy Paste Chain) — บล็อก / เว็บบอร์ด / Pantip / Sanook Hitz / Dek-D Board (ไม่ได้มีลิงก์ Original ต้นทาง Q1-Q4) | Step 6 G14 — Anchor domain name หมายถึง Q5 forum / blogspot มี F1 ≥ 2 → CRIT RED Block |
| **F2** | ข้อมูลล้าสมัย (Outdated Stats) — สถิติ / เทรนด์ Market อายุ ≥ 3 ปี (ยกเว้นงานวิจัยประวัติศาสตร์ ทฤษฎีพื้นฐาน) | Step 6 G15 SOFT YELLOW WARN หาก URL มี Year=2022 หรือก่อนหน้า → แนะนำหาตัวเลขล่าสุด (Non Block) |
| **F3** | โฆษณาแอบแฝง Native Ad / Sponsored No Disclosure — Content เชียร์สินค้า ไม่มีหลักฐานรองรับ ไม่มีข้อมูลตัวเลขจริง | Step 6 G14 Hard Block if Anchor matches "รีวิว/โปร/ลดราคา/คูปอง/สั่งซื้อ" + no data digit match = F3 flag |
| **F4** | แหล่งที่มาแบบนิรนาม Anonymous / No Author / No Publisher — ไม่สามารถสืบค้นชื่อผู้เขียน หน่วยงาน เจ้าของ Domain ได้ | Step 6 G14 Warn if URL Path ที่ไม่มี About Page / Contact Page — F4 Flag ≥2 → Crit Block |
**G14 MANDATORY HARD RULE:** External Links ≥ 2 ต้องผ่าน Tier Q1-Q4 (not ALL Q5/F1-F3) — ANY ≥2 Forbidden Found = Publish Block CRIT RED.

### 7.3 CITATION APPLICATION PRINCIPLES (How to Use in Article Body — P1-P3 Prompt Mandatory Gate 2)
| ID | Principle Description | Implement Gate |
|---|---|---|
| **P1** | ดึงเฉพาะตัวเลขสำคัญ หรือประเด็นหลัก — **ห้ามยกทั้งย่อหน้าจากแหล่งที่มา** (Plagiarism risk). เขียนประโยคใหม่ด้วยสำนวนตัวเอง Paraphrase + ลิงก์อ้างอิงไว้หลังประโยค | Gate 2 BE Prompt Mandatory + G13 Anchor Quality Step 6 |
| **P2** | **Anchor Text SEMANTIC** — ใส่ลิงก์บนชื่อหน่วยงาน / ประเด็น / ชื่องานวิจัย (ไม่ใช่ ที่นี่/คลิก/อ่านต่อ). ตัวอย่าง "จากผลสำรวจ **สำนักงานสถิติแห่งชาติ ปี 2567** พบว่า 47% ของ..." | Gate 2 Prompt + G12 Anchor Rule Publish Block (Old) + NEW G16 Anchor Semantic Warn (Step 6 Soft yellow if anchor < 5 characters) |
| **P3** | **อัปเดตเป็นเวอร์ชันล่าสุดเสมอ** — หากอ้างอิงกฎหมาย / ซอฟต์แวร์ / สเปคสินค้า → ตรวจสอบฉบับแก้ไขล่าสุดของหน่วยงานก่อนนำเสนอ | Gate 2 BE Prompt Mandatory |

---
## PART 8. OVERALL RULE COUNT = 29 OLD (18 Base + 11 Template/Citation) + 5 NEW (Q1-Q5 + F1-F4+P1-P3 Hard Gate = 5 additional Enforceable Global → **TOTAL 34 MANDATORY RULES ACTIVE 2026/09/18**
> Update: 29 → 34 Mandatory. NEW GATES GLOBAL: G14 (F1 F4 Forbidden Publish Block), G15 (Outdated 3y+ Soft Warn), G16 (Anchor Semantic <5 char Warn). Total **14 Global Cards** Step 6 (Old 11 + 3 New = 14). Per-Section Metric Still = 6 (M1-M6). NEW Checkpoints Formula: **14 Global + 6 M × N Sections = 14 + 6N Total**.

---
## PART 9. CITATION SENTENCE TEMPLATES (การผสานการอ้างอิงเข้ากับเนื้อหา — USER VERBATIM 6 TEMPLATES PRO + 3 TECHNIQUES A1-A3)
> GOAL: ผสานสถิติ/งานวิจัยเข้ากับเนื้อหาอย่างแนบเนียน = เจ้าของข้อมูล + ตัวเลข/ใจความ + เวลา (ปี) — **ห้ามแปะลิงก์ท้ายประโยคแบบไม่มีบริบท**

### 9.1 6 PRO CITATION TEMPLATES — 3 ประเภทหลัก (สถิติ / วิชาการ / กฎหมาย)
| CATEGORY | TEMPLATE NAME | FORMAT + EXAMPLE VERBATIM (นำไปใช้ Generate Body Directly) |
|---|---|---|
| **1. สถิติ / รายงานประจำปี** | **TEMPLATE 1A: นำด้วยชื่อแหล่งก่อน** | `จาก[ประเภทรายงาน] ประจำปี [ปี พ.ศ. / ค.ศ.] โดย **[ชื่อหน่วยงาน]** พบว่า [ใจความสำคัญ] ซึ่งแตะระดับ [ตัวเลข] [หน่วย]` <br> *EX: "จากรายงานพฤติกรรมผู้ใช้อินเทอร์เน็ตในไทย ปี 2568 โดย **สำนักงานพัฒนาธุรกรรมทางอิเล็กทรอนิกส์ (ETDA)** พบว่า กิจกรรมที่ผู้บริโภคใช้เวลามากที่สุดคือการซื้อออนไลน์และรับชมวิดีโอสั้น เฉลี่ยสูงถึง 7.2 ชั่วโมงต่อวัน"* |
|  | **TEMPLATE 1B: นำด้วยข้อมูล ตบท้ายหน่วยงาน** | `[ใจความสำคัญ + ตัวเลข] สอดคล้องกับดัชนีชี้วัดล่าสุดจาก **[ชื่อหน่วยงานวิจัย]** ที่เก็บสถิติจาก [จำนวนแหล่ง] แห่งทั่วโลก` <br> *EX: "อัตราการเปิดอ่านอีเมล B2B เพิ่มขึ้นเฉลี่ย 4.3% เมื่อปรับหัวข้อเฉพาะบุคคล สอดคล้องกับดัชนีชี้วัดล่าสุดจาก **HubSpot Research** ที่เก็บสถิติจากแคมเปญกว่า 1,000 แห่ง"* |
| **2. งานวิจัยเชิงวิชาการ** | **TEMPLATE 2A: ยืนยันข้อเท็จจริง** | `[ข้อเท็จจริงทั่วไปที่คนรู้จัก] โดยผลการศึกษาจาก **[ชื่อหน่วยงานวิชาการ]** ระบุว่า [เทคนิค/วิธีการ] สามารถลด/เพิ่ม [ผลลัพธ์] เกือบ [เปอร์เซ็นต์] %` <br> *EX: "การพักสายตาทุก 20 นาทีช่วยลดความล้าตาอย่างมีนัยสำคัญ ผลศึกษาจาก **American Academy of Ophthalmology (AAO)** ระบุว่า กฎ 20-20-20 ลดตาแห้งและปวดศีรษะจากการจ้องจอภาพลงได้เกือบ 40%"* |
|  | **TEMPLATE 2B: เปรียบเทียบขัดแย้งความเชื่อโชว์** | `แม้หลายคนเชื่อว่า [ความเชื่อโชว์ทั่วไป] แต่ผลการทดลองของทีม **[ชื่อมหาวิทยาลัย/ทีมวิจัย]** กลับพบว่า สมองมนุษย์สูญเสียประสิทธิภาพ [เปอร์เซ็นต์] % ทุกครั้งที่ [เหตุการณ์]` <br> *EX: "แม้หลายคนเชื่อว่า Multitasking ประหยัดเวลา แต่ผลทดลองของ **มหาวิทยาลัยสแตนฟอร์ด (Stanford University)** กลับพบว่า สมองสูญเสียประสิทธิภาพประมวลผลลงถึง 40% ทุกครั้งที่สลับโฟกัสไปมาระหว่างงาน"* |
| **3. กฎหมาย / มาตรฐานสากล / ราชกิจจานุเบกษา** | **TEMPLATE 3A: ระเบียบข้อบังคับ + บทลงโทษ** | `[ประเด็น/ขั้นตอน] จำเป็นต้องได้รับความยินยอมอย่างชัดเจน ตามข้อกำหนดใน **[ชื่อกฎหมาย พ.ศ. XXXX]** ซึ่งกำหนด [ข้อจำกัด/บทลงโทษ/สิทธิผู้ใช้]` <br> *EX: "การเก็บข้อมูลส่วนบุคคลต้องได้รับความยินยอมชัดเจน ตาม **พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)** ซึ่งกำหนดปรับสูงสุดสำหรับองค์กรที่ไม่ปฏิบัติตามมาตรฐานความปลอดภัยข้อมูล"* |
|  | **TEMPLATE 3B: สเปกทางเทคนิค ISO / มาตรฐาน** | `[ระบบ/ผลิตภัณฑ์] ต้องสอดคล้องกับมาตรฐานความปลอดภัย **[ISO XXXXX / IEC / TISI XXX]** เพื่อให้มั่นใจได้ว่า [ข้อมูล/ฟีเจอร์] จะถูก [การปฏิบัติเช่น เข้ารหัส/ตรวจสอบ] ตั้งแต่ต้นทางถึงปลายทาง` <br> *EX: "ระบบจัดการฐานข้อมูลต้องสอดคล้องมาตรฐาน **ISO/IEC 27001** เพื่อให้มั่นใจได้ว่าข้อมูลสำคัญจะถูกเข้ารหัส End-to-End ตั้งแต่ต้นทางจนถึงปลายทาง"* |

### 9.2 3 FINAL APPLY TECHNIQUES (A1-A3 — MANDATORY FOR EVERY CITATION; A1 = Publish Block G17, A2-A3 = Soft Warn G18-G19)
| ID | Technique VERBATIM User | Enforceable Step 6 Global Card + Publish Gate |
|---|---|---|
| **A1 / Anchor Scope Exact (G17 NEW CRIT PUBLISH BLOCK)** | **ผูก Anchor Text ให้พอดี = ครอบเฉพาะชื่อหน่วยงาน / งานวิจัย** — ตัวอย่าง `[สำนักงานสถิติแห่งชาติ]` หรือ `[งานวิจัยจากสแตนฟอร์ด]` — **ห้ามลากไฮไลต์ทั้งประโยค (> 20 คำ / > 60 ตัวอักษร)**. | **G17 🎯 = CRITICAL PUBLISH BLOCK RED หากพบ anchor length ≥ 60 characters (ครอบทั้งประโยค ≥ 2 anchors) — User VERBATIM: อย่าลากไฮไลต์ทั้งประโยค** |
| **A2 / Year Context Always Present (G18 NEW SOFT WARN)** | **ระบุบริบทของปีเสมอ** — ข้อมูลสถิติ/เทรนด์/กฎหมายทุกอันควรมีปีกำกับ พ.ศ. 25XX หรือ ค.ศ. 20XX เพื่อให้ผู้อ่านและ Search Engine ทราบว่าไม่ล้าสมัย | **G18 📅 SOFT YELLOW WARN: หาก paragraph มี 3+ DIGIT numbers แต่ไม่มี ANY ปี 256X / 202X keyword ติด = เตือนใส่ปี** |
| **A3 / Layman Terms Conversion (G19 NEW SOFT WARN)** | **สรุปเป็นภาษาพูดเข้าใจง่าย** — หลีกเลี่ยงศัพท์เทคนิคสถิติซับซ้อน เช่น แปลง `"p-value < 0.01 อย่างมีนัยสำคัญ"` → `"พบความแตกต่างอย่างชัดเจนในกลุ่มทดลอง"` หรือ `"95% confidence interval"` → `"มั่นใจได้ 95% ว่าผลลัพธ์นี้ไม่ได้เกิดจากการสุ่ม"` | **G19 🗣️ SOFT YELLOW WARN: หากพบคำว่า p-value / confidence interval / statistical significance / p<0.05 ในเนื้อหา → เตือนแปลงเป็นภาษาธรรมดา** |

---
## PART 10. OVERALL RULE COUNT 2026/09/18 LATEST: 34 + 5 NEW = 39 MANDATORY RULES ACTIVE (18 Base + 11 Template/Citation + 5 Source Tier + 5 Citation Template/Techniques)
> NEW GATES GLOBAL (14 → 17 Global Cards): G17 Anchor Scope ≥60 char Block (Crit Red) · G18 Stats Year Missing Warn (Yellow Soft) · G19 Stat Jargon Warn (Yellow Soft). **Per-Section Metric = ยังคง 6 (M1-M6 ไม่เปลี่ยน)**. NEW Checkpoints Formula: **17 Global Rules + 6 Per-Section Metrics × N Sections = 17 + 6 × N Total Checkpoints**.
---
## 7. BACKEND PROMPT SNIPPET TEMPLATE (Inject ก่อน Section generate
> TASK: B1 (Backend articleWriterService — Copy verbatim ท้าย SYSTEM rule at: articleWriterService section Prompt rules block
```
✅ SEO MANDATORY 18 RULES — NON-NEGOTIABLE FAIL IF BROKEN (per this is a system-level rules block:
═══════════════════════════════════════════════════
GLOBAL: (top-level article rules
  G1 Total words: 1000-1800 words/article;
G2 3-6 H2 total headings, 200-350w/H2 avg;
G3 1-3 H3 per H2 if approaching 350w+, max 500w/H3;
G6 External DA≥40 links 2-4 article total;
G7 Internal 2-5 internal links silo structure;

PER SECTION STRUCTURE (S1-S5 NON NEGOTIABLE:
  S1: This section exactly 2-4 paragraphs only;
  S2: EVERY paragraph = 2-4 sentences (40-70 Thai words each sentence) NO run-ons;
S3: Add \n\n line breaks between paragraphs for white space, NO WALL OF TEXT mobile 5 lines+;
S4: This section word count target 150-350 THAI WORDS MIN 350+WARN+350 → switch to bullets OR CREATE a NEW H3 HEADING child if content approaching 350, red split;
S5 PARAGRAPH ORDER:
  - PARA 1 (1st paragraph THIS SECTION: 1-2 = CORE IDEA THESIS: answer SECTION QUESTION sentences 1+2 (directly NO FILLER start.
  - PARA 2-3 = SUPPORTING DETAILS: + real data, examples, citations [1], [2], etc], inline external links;
  - LAST PARA = BULLET SUMMARY of the 2-3 bullets summary or TRANSITION sentence next section;

KEYWORDS K1-K5:
K1 FOCUS KEYWORD ${keyword} in FIRST heading level (H2 section heading: {heading text THIS section heading level;
K2 First 100 WORDS THIS SECTION: MUST include synonym OR focus keyword OR LSI keyword in para sentence first two OPENING;
K3 DENSITY: NO STUFF; 1-2% sweet; SWAP LSI synonyms: NEVER repeat exact focus word 3x without LSI;
K4 IMG ALT (if images): alt=" focus keyword present alt text;
K5 LSI replace repetition with natural thai synonyms;

IF rule break RED: fail generate;
```

---
## PART 11. THAI LLM TOKENIZATION + SHORT CONTENT FIX (3 Core Rules + Section-by-Section Batch) 2026/09/18
> **WHY THAI CONTENT ALWAYS TOO SHORT WHEN "1000 WORDS" ORDERED?** LLM Tokenization (BPE / SentencePiece) splits Thai script into SUB-WORD fragments: 1 real Thai word ≈ 2.5–3.5 tokens. When we set `maxTokens = words*4` = AI closes output EARLY @ token limit thinking work done = ACTUAL BODY ONLY 2-3 SENTENCES CUT OFF before Case Study / Best Practice paragraphs kick in. Fix at 4 Levels below.

### 11.1 PROMPT: Structural Constraints First (ห้ามสั่งด้วย "จำนวนคำ" อย่างเดียว)
| ID | Rule | Non-Negotiable Detail |
|---|---|---|
| **TOK1 / 3 PARAGRAPHS MANDATORY** | จำนวนย่อหน้า+ประโยคชัดเจน | ทุก H2 Section = 3 ย่อหน้าขั้นต่ำ (2-4 total), แต่ละย่อหน้า 3–4 ประโยคเต็ม ห้ามจบใน 1–2 ประโยค |
| **TOK2 / MICRO-OUTLINE 3 DIMENSIONS (VERBATIM)** | แจกแจงมิติความคิดแต่ละย่อหน้า (AI ไม่สามารถตัดทอนได้) | P1 = Problem/Cause/Importance ลึก 3 ประโยค; P2 = Solution + REAL CASE STUDY 1 แน่นอน 3 ประโยค; P3 = Best Practice / ข้อควรระวัง + สรุปสุดท้าย 3 ประโยค |
| **TOK3 / ANTI-SUMMARY RULE** | ห้ามสรุปแบบรวบรัด ห้ามตัดตอนเนื้อหาให้สั้น | NO wide summary; MANDATORY: เชิงลึก process explanation ทุกประเด็นที่กล่าว, NO vague / floating statements |

### 11.2 TOKEN BUDGET CORRECTION (Backend Parameter Fix)
| Parameter | Old Incorrect (Causes Short Content) | New Correct Budget (Post TOK Fix) |
|---|---|---|
| **maxTokens / Section** | `max(1200, word_target_min * 4)` | **`max(2800, word_target_min * 8)`** ×2 multiplier solves Thai 2.5–3.5× subword fragmentation + markup overhead 15% |
| **MIN_BODY_CHARS H2 floor** | 1700 chars (3 paras × 3 sentences often ends @ 1200–1500 → 3–5 retries) | **2200 chars** guarantee 3 full paras + Case Study + Best Practice + 1 inline cite = ≥ 1800 real text |
| **MIN_BODY_CHARS H3 floor** | 950 chars | **1200 chars** 2 paras min @ 3-4 sentences + 1 real example |
| **Retrying Guard Prefix** | old "EMPTY / TOO SHORT CONTENT" generic warning | NEW explicit: **THAI LANGUAGE SUBWORD TOKENIZATION BUDGET CORRECTION ACTIVE** — YOU MUST WRITE FULL 3 PARAGRAPHS INCLUDE CASE STUDY AND BEST PRACTICES. MIN ${MIN_BODY_CHARS} CHARACTERS MANDATORY. DO NOT STOP EARLY. |

### 11.3 PER-SECTION WORKFLOW: Write Step-by-Step (NOT Whole Article 1 Shot)
Step 1. AI generate Outline ONLY (H2/H3 + Bullet sub-points per section) — do NOT write body yet.
Step 2. Outline Review → Order H2 queue for batch loop.
Step 3. Write **1–2 H2 SECTIONS ONLY per LLM call** (NOT 6+ H2 all at once)
Step 4. Per section: apply TOK1 + TOK2 + TOK3 + minChars=2200 guard above.
Step 5. Per H2 verify: P1 Problem/Cause ok, P2 has 1 named Case Study ok, P3 Best Practices 3 items → if missing re-queue section.

### 11.4 EXAMPLE FULL PROMPT TEMPLATE (Copy Section Generate LLM)
```markdown
บทบาทของคุณคือผู้เชี่ยวชาญด้าน [ระบุสายงาน เช่น การตลาด/เทคโนโลยี/สุขภาพ] 
หน้าที่ของคุณคือเขียนเนื้อหาเชิงลึกในหัวข้อ: "[ชื่อหัวข้อ H2]"

ข้อกำหนดในการเขียน (บังคับปฏิบัติตาม):
1. ความยาวและโครงสร้าง:
   - เขียนทั้งหมด 3 ย่อหน้าต่อเนื่องกัน
   - แต่ละย่อหน้าต้องมีความยาวอย่างน้อย 3–4 ประโยคเต็ม (ห้ามเขียนสั้นจบใน 1-2 ประโยค)
   - ประกอบด้วย:
     * ย่อหน้าที่ 1: อธิบายปัญหา สาเหตุ และความสำคัญในเชิงลึก
     * ย่อหน้าที่ 2: นำเสนอวิธีแก้ปัญหา พร้อมยกตัวอย่างสถานการณ์จริงประกอบ 1 กรณีศึกษา
     * ย่อหน้าที่ 3: สรุปข้อควรระวัง หรือ Best Practice ที่นำไปปฏิบัติได้ทันที
2. รูปแบบภาษา:
   - ใช้ภาษาเขียนที่เป็นมืออาชีพ สละสลวย อ่านเข้าใจง่าย
   - ห้ามเขียนตอบแบบสรุปย่อหรือตัดตอนเนื้อหาให้สั้น
   - เน้นให้ข้อมูลเชิงปฏิบัติการ (Actionable Advice) ไม่ใช้คำพูดลอยๆ
```

### 11.5 RULE COUNT UPDATE
Rule count: 39 TOTAL base + 4 NEW TOK Rules = **Still 39 MANDATORY** (TOK1-TOK3 + TOK Budget are encoded inside existing `SEO_18_BLUEPRINT_RULES` const STRUCTURE CONSTRAINTS section already; NOT NEW CARD VISIBLE GLOBAL) — *Backend enforce only*. Global Cards Step 6 = ยังคง 17 ใบ 17 + 6N Checkpoints.

---

## PART 12. HEADING PSYCHOLOGY: 4 เทคนิค + 4 กฎเหล็ก 2026/09/18 (ปัญหาหัวข้อน่าเบื่อแบบรายงานวิชาการ)
> **WHY AI HEADING BORING ROOT CAUSE?** AI เลือกคำจากแพทเทิร์นภาษาอังกฤษแปลตรงตัว → ผลลัพธ์ "ความสำคัญของ X", "ข้อดีข้อเสีย Y", "ปัจจัยที่ส่งผลต่อ Z" ไม่มี Search Intent Hook → คนเห็นแล้วไม่คลิก ผู้อ่านข้าม SERP. Heading ที่ดี = 2 งานพร้อมกัน: 1) มี Keyword สำหรับ SEO ซ่อนแนบเนียน 2) มี HUMAN HOOK กระตุ้นความอยากรู้ ชี้ผลลัพธ์ชัดเจน จี้จุดเจ็บ

### 12.1 4 เทคนิค Heading Psychology (H2 MUST USE 1 technique MIN; alternate EVERY heading)
| ID | Technique Name | Before (Boring Academic) | After (Hook + Keyword + Result) |
|---|---|---|---|
| **H1 / BENEFIT-DRIVEN** | ผลลัพธ์ที่จับต้องได้ ไม่นามธรรม | "ความสำคัญของการกระจาย Keyword" | **"กระจาย Keyword อย่างไรให้ถูกใจ AI และไม่เสียอรรถรสคนอ่าน"** — บอกชัดผลได้ 2 อย่าง (ถูกจัดอันดับ + คนอ่านเพลิดเพลิน) |
| **H2 / NUMBERS + CHECKLIST + TIMEBOX** | ตัวเลข + เช็กลิสต์ + ระยะเวลา | "วิธีการเขียนบทความที่มีคุณภาพ" | **"เช็กลิสต์ 5 จุดยุทธศาสตร์ วางโครงสร้างบทความให้อ่านง่ายใน 3 นาที"** — จำนวนจุด + เวลาที่ใช้จับต้องได้ |
| **H3 / PAIN POINTS + HIDDEN MISTAKES** | จี้จุดเจ็บ / ข้อผิดพลาดที่คนมองข้าม | "ปัญหาการนับคำในภาษาไทย" | **"ทำไมบทความ AI ถึงสั้นกุด? เปิดเบื้องหลังระบบตัดคำและทางแก้ที่ได้ผลจริง"** — Question Hook + เผยเรื่องลับที่อยากรู้ |
| **H4 / CURIOSITY TRIGGER (Open Question)** | คำถามที่คนค้นหา ถามตัวเองอยู่แล้ว | "การเลือกแหล่งอ้างอิง" | **"อ้างอิงข้อมูลแบบไหน? ที่ช่วยดันคะแนนความน่าเชื่อถือขึ้นหน้าแรก"** — ปลายเปิด + ผลลัพธ์ชัดเจน (ขึ้นหน้าแรก) |

### 12.2 4 กฎเหล็ก Outline Prompt (Backend write.ts L1092 HEADING 4 IRON RULES VERBATIM)
| # | Iron Rule | Implementation Detail Non-Negotiable |
|---|---|---|
| **HR1** | Blacklist 8 Boring Words | `บทนำ / บทสรุป / ข้อดีและข้อเสีย / ข้อดี-ข้อเสีย / ความสำคัญของ / ความสำคัญ / ปัจจัยที่ส่งผลต่อ / ปัจจัยที่เกี่ยวข้อง` → 0 TOLERANCE. ถ้า H2/H3 มีแม้แต่ 1 คำ → OUTLINE_BANNED_SUBSTRINGS detector trigger → fallback buildStaticOutline ทันที (no user mercy) |
| **HR2** | H2 / H3 Distinction | H2 = ประเด็นหลัก ชวนคลิก (ใช้ H1-H4 Technique Alternate A/B Styles every 2-3 headings). H3 = ขั้นตอนปฏิบัติการ/มิติย่อยกระชับ ชี้เฉพาะจุด ชวนอ่านต่อ (สั้น ไม่ต้องยาว) |
| **HR3** | Keyword Seamless Blend | ไม่ยัด Keyword ทับทุก 3 คำ → กลืนแนบเนียนกับ Hook/ประโยคคำถาม/สไตล์ผู้เชี่ยวชาญเล่าเรื่อง |
| **HR4** | A/B Variations per H2 (Style Rotate) | สลับทุก H2: **Style A = How-To / แก้ปัญหาตรงจุด (Pain + Solve + Result)** OR **Style B = Curiosity / Numbers Checklist / Benefit Result** → NO 3 A ติดกัน. Every headings look DIFFERENT patterns no repetition |

### 12.3 OUTLINE BANNED SUBSTRINGS UPGRADE (L80-L107 write.ts)
- OLD 16 substrings = user screenshot 60 วันไม่คืบหน้า exact labels
- NEW ADD 8 items = HR1 Boring Academic Phrases (บทนำ/บทสรุป/ข้อดีและข้อเสีย/ความสำคัญของ/ปัจจัยที่ส่งผลต่อ + 3 variant cases)
- TOTAL 24 banned substrings → checked EVERY call site: getDraft L589 → generateOutline L908 → L1104 LAST-MILE Guard → rewriteSection outline loads (3 layered gates Belt Suspenders Braces)

### 12.4 Outline Generate LLM Prompt Template (USER VERBATIM Step3 Heading)
Inject location:
- SYSTEM prompt: `server/routers/write.ts L1085 const system=` AFTER wordBudgetLine section → block HEADING PSYCHOLOGY 4 TECHNIQUES + H2/H3 distinction + A/B Style rotate + HR1 Blacklist repeat
- USER prompt: `server/routers/write.ts L1092 const user=` HEAD inject CONTENT STRATEGIST ROLE VERBATIM Template from user original message (Role line + Target Audience line + Keyword line + HEADING 4 IRON RULES section) → then original SERP/GUIDELINES text follows

Full Prompt Template Block (Copy for debugging / QA):
```markdown
หน้าที่ของคุณคือ Content Strategist ระดับมืออาชีพ 
ช่วยวางโครงร่างบทความ (Outline) ภายใต้หัวข้อใหญ่: "[ระบุหัวข้อหรือเป้าหมายของบทความ]"
กลุ่มเป้าหมายคือ: [ระบุผู้อ่าน เช่น คนทั่วไป / นักการตลาด / เจ้าของธุรกิจ]
Keyword หลักที่ต้องมี: "[ระบุ Keyword]"

ข้อกำหนดในการคิดหัวข้อ H2 และ H3:
1. ห้ามตั้งชื่อหัวข้อน่าเบื่อแบบรายงานวิชาการ เช่น ห้ามใช้คำว่า "ความสำคัญของ...", "ข้อดีและข้อเสีย", "บทนำ", "บทสรุป"
2. ทุกหัวข้อหลัก (H2) ต้องมีองค์ประกอบของ "ผลลัพธ์ที่ผู้อ่านจะได้รับ", "การแก้ปัญหา (Pain Point)", หรือ "ตัวเลข/เช็กลิสต์ที่จับต้องได้"
3. หัวข้อย่อย (H3) ต้องกระชับ ชี้เฉพาะเจาะจง และชวนให้กดอ่านต่อ
4. ในแต่ละหัวข้อ H2 ให้เสนอตัวเลือกชื่อหัวข้อมา 2 สไตล์:
   - สไตล์ A: เน้น How-to แก้ปัญหาตรงจุด
   - สไตล์ B: เน้นดึงดูดความอยากรู้ / เช็กลิสต์ผลลัพธ์
5. กำกับประเด็นย่อยแบบ Bullet สั้นๆ 2-3 ข้อใต้แต่ละหัวข้อ เพื่อบอกว่าจะเล่าเรื่องอะไรบ้าง
```

### 12.5 Rule Count + Global Visibility Status
- NO NEW Step6 Cards. Heading quality = Backend prompt/blacklist only (not scored yet).
- 39 Mandatory Rules still = 18 Base + 11 Template/Citation + 5 Source Tier + 5 Citation Sentence.
- Checkpoints formula = 17 Global G1-G19 + 6 × N_Sections (M1-M6 unchanged).
- Expected UX after PART12 deploy: H2 headings stop using "ความสำคัญของ X" / "ข้อดีข้อเสีย Y" 100% of the time. Style A/B alternate between pain-solve curiosity-number-benefit question hooks. CTR SERP preview improved (more clicks per same rank #).
