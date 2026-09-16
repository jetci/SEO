-- ============================================================
-- Migration 0004 — Phase 3 Brand Voice per Project
-- IDENTIFIER: phase3_brand_voice_20260910
-- AC-6: ZERO ALTER/DROP existing tables. CREATE NEW ONLY.
-- Backward compatible: old code works with/without this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_brand_voices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  scraped_url VARCHAR(2048) NULL,
  voice_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_project_brand_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_project_brand_voice_project (project_id),
  INDEX idx_brand_project_updated (project_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v3 Phase 3 Brand Voice per project. JSON voice tone/lang/keywords prepended to LLM system prompt.';
