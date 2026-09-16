-- ================================================================
-- EEAT Studio V2 · Migration 0002 — SEED categories (7 ROWS EXACT SA UPDATE 2026-09-08)
-- ⚠️ REVISED 2026-09-08: 15 → 7 หมวด (ตัดหมวดที่ยังไม่ใช้งานออก)
-- ⚠️ 2026-09-12 HOTFIX: REMOVED TRUNCATE TABLE (was SET NULLing ALL projects.category_id on every deploy via FK ON DELETE SET NULL = DB WIPE EVERY RELEASE!)
--     → Now uses INSERT IGNORE INTO ... ON DUPLICATE KEY UPDATE (idempotent safe, no data loss on every deploy)
-- ✅ 7 หมวด EXACT ตามใบสั่งงานล่าสุด:
--    1 YMYL (is_ymyl=1) = สล็อต / หวย / คาสิโน (3 rows)
--    2 General (is_ymyl=0) = ฟุตบอล / มวย(slug=boxing) / ไก่ชน / วัวชน (4 rows)
-- NEW COLS per SA L57: icon, is_active(default true), sort_order
-- ================================================================

SET NAMES utf8mb4;

-- ────────────────────────────────────────────────────────────────
-- IDEMPOTENT UPSERT (NO TRUNCATE! Preserves FK references to project.category_id)
-- ────────────────────────────────────────────────────────────────
INSERT INTO `categories` (`id`, `name`, `slug`, `is_ymyl`, `icon`, `is_active`, `sort_order`, `description`) VALUES
-- 1. ฟุตบอล (General, sort=1)
(1,  'ฟุตบอล',      'football',       0, '⚽', 1, 1,  'หมวดข่าวสารและบทความเกี่ยวกับกีฬาฟุตบอลโลกและไทย'),
-- 2. มวย (slug=boxing NOT muay-thai SA L82 EXACT, General, sort=2)
(2,  'มวย',         'boxing',         0, '🥊', 1, 2,  'หมวดมวยไทยและมวยสากล สำหรับคอนเทนต์ SEO'),
-- ── YMYL 3 ROWS (สล็อต / หวย / คาสิโน) ──
(3,  'สล็อต',        'slots',          1, '🎰', 1, 3,  'หมวดสล็อตออนไลน์ YMYL (พนัน — Google ตรวจเข้ม)'),
(4,  'หวย',          'lottery',        1, '🎫', 1, 4,  'หมวดหวยไทยและต่างประเทศ YMYL (การเงิน/พนัน)'),
(5,  'คาสิโน',      'casino',         1, '🎲', 1, 5,  'หมวดคาสิโนออนไลน์ YMYL (พนัน)'),
-- ── General ที่เหลือ 2 rows ──
(6,  'ไก่ชน',       'cockfighting',   0, '🐓', 1, 6,  'หมวดไก่ชนและสาระบันเทิงเกี่ยวกับไก่'),
(7,  'วัวชน',       'bullfighting',   0, '🐂', 1, 7,  'หมวดวัวชนและสาระบันเทิงพื้นเมือง')
ON DUPLICATE KEY UPDATE
  `name`        = VALUES(`name`),
  `slug`        = VALUES(`slug`),
  `is_ymyl`     = VALUES(`is_ymyl`),
  `icon`        = VALUES(`icon`),
  `is_active`   = VALUES(`is_active`),
  `sort_order`  = VALUES(`sort_order`),
  `description` = VALUES(`description`);

-- ================================================================
-- VERIFICATION (run after seed):
--   SELECT id, name, slug, is_ymyl FROM categories ORDER BY id;
--   → ควรได้ 7 rows: is_ymyl=1 @ rows 3,4,5 (สล็อต/หวย/คาสิโน = 3 rows EXACT)
--   → slug มวย=boxing ✓ (NOT muay-thai)
--   → NO extra categories: การเงิน/สุขภาพ/บาสเกตบอล/สนุกเกอร์/อาหาร/ท่องเที่ยว/เทคโนโลยี/กีฬาอื่นๆ
-- ================================================================
