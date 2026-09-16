# ใบสั่งงาน AI Agent — Phase 0: Setup + Database

> EEAT Pro Studio v2 · ใบสั่งงานทีละ Phase (1 จาก N)
> **สำหรับ:** AI Agent ที่เข้าถึงไฟล์/เครื่องได้
> **กฎ:** ทำเฉพาะ Phase นี้ · ห้ามข้ามไป Phase ถัดไปจนกว่าจะผ่าน Exit Gate · ห้ามทำงานนอกขอบเขตด้านล่าง

---

## 🎯 เป้าหมาย Phase 0

วางฐานระบบ v2 ให้พร้อม: โครงโปรเจกต์ + database 8 ตาราง + ย้ายส่วนที่ใช้งานได้จากระบบเดิมมา

**ผลลัพธ์ที่ต้องได้:** login ได้ + database 8 ตารางพร้อม + ยังไม่ต้องมีฟีเจอร์เขียนบทความ (นั่นคือ Phase ถัดไป)

---

## ⛔ ขอบเขต — ทำแค่นี้ ห้ามเกิน

**ทำ (IN SCOPE):**
- สร้างโครงโปรเจกต์ v2 แยกจากระบบเดิม
- สร้าง database schema 8 ตาราง
- ย้าย (transplant) ส่วนที่เก็บจากระบบเดิม: Auth, สมาชิก, ทีม, ตั้งค่า API
- seed ข้อมูลตั้งต้น (categories)

**ห้ามทำ (OUT OF SCOPE — เป็น Phase ถัดไป):**
- ❌ ห้ามแตะ pipeline เขียนบทความ
- ❌ ห้ามทำ Keyword Cluster / โปรเจกต์ UI
- ❌ ห้ามทำจัดการบทความ
- ❌ ห้ามเรียก LLM ใดๆ
- ❌ ห้ามลบ/แก้ระบบเดิม (สร้างใหม่แยก เก็บเดิมไว้เป็น backup)

---

## 📋 งานย่อย (ทำตามลำดับ)

### Task 0.1 — สร้างโครงโปรเจกต์ v2 แยก

- สร้างโฟลเดอร์/โปรเจกต์ v2 ใหม่ **แยกจากระบบเดิม** (ห้ามเขียนทับของเดิม)
- ตั้ง stack เดียวกับเดิม (เพื่อ transplant ง่าย)
- ตั้ง environment variables (ยังไม่ต้องใส่ค่าจริง ทำ .env.example ก่อน)

### Task 0.2 — Database Schema 8 ตาราง

สร้าง migration ตามนี้ **เป๊ะ** (อ้างจาก system design):

**1. `users`**
- id (pk), email (unique, not null), name, role (enum: admin/writer), created_at (default: now)

**2. `teams`**
- id (pk), owner_id (fk→users), name, created_at (default: now)

**3. `team_members`**
- id (pk), team_id (fk→teams), user_id (fk→users), role (enum: owner/admin/member)
- unique(team_id, user_id) — กันเพิ่มคนซ้ำในทีม

**4. `categories`**
- id (pk), name, slug (unique), icon, is_ymyl (boolean, default false), is_active (boolean, default true), sort_order (int), created_at (default: now)

**5. `projects`**
- id (pk), team_id (fk→teams), category_id (fk→categories), name, main_keyword, created_at (default: now)

**6. `clusters`**
- id (pk), project_id (fk→projects), name, type (enum: pillar/cluster/supporting), parent_id (fk→clusters, nullable, self-ref), created_at (default: now)

**7. `keywords`**
- id (pk), cluster_id (fk→clusters), keyword, intent (enum: informational/transactional/commercial/navigational, default informational), status (enum: pending/written, default pending), created_at (default: now)

**8. `articles`**
- id (pk), project_id (fk→projects), keyword_id (fk→keywords, nullable), author_id (fk→users), category_id (fk→categories), title, content (text/longtext), meta_title, meta_description, status (enum: draft/published, default draft), created_at (default: now), updated_at

**⚠️ กฎสำคัญ (แก้บั๊กเดิม):**
- ทุก `created_at` **ต้องตั้ง default = now() ที่ระดับ database** (ห้ามให้เป็น 1/1/1970/2513)
- `email` ต้อง unique (แก้ปัญหา record ซ้ำเดิม)
- foreign key ทุกตัวต้องมี constraint จริง

### Task 0.3 — Seed Categories (ตามระบบเดิม)

insert categories เริ่มต้น (is_ymyl ตั้งตามนี้):

| name | slug | is_ymyl |
|---|---|---|
| ฟุตบอล | football | false |
| มวย | boxing | false |
| บาสเกตบอล | basketball | false |
| สนุกเกอร์ | snooker | false |
| สล็อต | slot | **true** |
| หวย | lottery | **true** |
| คาสิโน | casino | **true** |
| การเงิน | finance | **true** |
| สุขภาพ | health | **true** |
| อาหาร | food | false |
| ท่องเที่ยว | travel | false |
| เทคโนโลยี | technology | false |
| ไก่ชน | cockfight | false |
| วัวชน | bullfight | false |
| กีฬาอื่นๆ | other-sports | false |

> `is_ymyl=true` = หมวดที่ Google ตรวจเข้ม (การเงิน/สุขภาพ/พนัน) — เก็บ flag ไว้ใช้ Phase หลัง (บังคับ disclaimer)

### Task 0.4 — Transplant ส่วนที่เก็บจากระบบเดิม

ย้ายมา **เฉพาะ** 4 ส่วนนี้ (ทดสอบว่าทำงานหลังย้าย):

1. **Auth (Google login)** — ย้าย + ต่อกับ table `users` ใหม่
2. **RBAC สมาชิก** — Admin/Writer (ต่อ table `users`)
3. **จัดการทีม** — ต่อ `teams` + `team_members`
4. **ตั้งค่าระบบ (API keys)** — เก็บ encrypted (DB > .env) เหมือนเดิม
   - v1 ต้องการแค่ช่อง LLM (OpenRouter) — ช่อง SERP ทำไว้ได้แต่ยังไม่ใช้

**หมายเหตุ:** ลบ DebugTestUser + test data ที่ปนมาจากระบบเดิม (อย่า transplant ขยะมา)

---

## ✅ Exit Gate — ต้องผ่านทั้งหมดก่อนขอ Phase 1

Agent ต้องพิสูจน์ว่าผ่านทุกข้อ (แนบหลักฐาน: screenshot/log/query result):

- [ ] **G0.1** โปรเจกต์ v2 รันได้ (server start ไม่ error) แยกจากระบบเดิม
- [ ] **G0.2** database มีครบ 8 ตาราง (แสดง `\dt` หรือ schema list)
- [ ] **G0.3** ทุกตารางมี foreign key + constraint ตามสเปก (แสดง schema 1-2 ตารางเป็นตัวอย่าง)
- [ ] **G0.4** สร้าง record ทดสอบ → `created_at` เป็นวันที่ปัจจุบันจริง (ไม่ใช่ 2513/1970)
- [ ] **G0.5** categories seed ครบ 15 หมวด (แสดง query result)
- [ ] **G0.6** **Login ด้วย Google ได้จริง** → เข้าระบบเห็นหน้าแรก
- [ ] **G0.7** เพิ่มสมาชิก + สร้างทีม + ใส่ API key (LLM) ทำงานได้
- [ ] **G0.8** ไม่มี DebugTestUser/test data หลงเหลือ

**ถ้าข้อใดไม่ผ่าน → แก้ให้ผ่านก่อน ห้ามไป Phase 1**

---

## 🚨 เตือน Agent (จากบทเรียนระบบเดิม)

1. **อย่าทำเกินขอบเขต** — เห็น "เขียนบทความ" น่าทำก็อย่าเพิ่งทำ นั่นคือ Phase 2
2. **แก้ default timestamp ที่ DB layer** — ไม่ใช่ที่ code (บั๊ก 2513 เดิมมาจากตรงนี้)
3. **transplant ทีละส่วน + ทดสอบ** — ไม่ใช่ย้ายทั้งก้อนแล้วหวังว่าจะทำงาน
4. **เก็บระบบเดิมไว้** — สร้าง v2 แยก ไม่เขียนทับ (เผื่อต้อง rollback)

---

## เมื่อผ่าน Exit Gate แล้ว

รายงานผล (แนบหลักฐาน G0.1-G0.8) → รอใบสั่งงาน **Phase 1** (ต่อ: Keyword Cluster + โปรเจกต์ UI)

> Phase ถัดไปตามลำดับ: Phase 1 (Cluster+Project) → Phase 2 (Pipeline เขียน ⭐หัวใจ) → Phase 3 (จัดการบทความ) → Phase 4 (ขัดเงา)
