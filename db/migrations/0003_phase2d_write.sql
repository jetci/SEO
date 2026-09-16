-- ============================================================
-- Migration 0003 — Phase 2D Write Pipeline Additions
-- IDENTIFIER: phase2d_write_20260910
-- ZERO ALTER on existing 12 tables — CREATE NEW 1 table write_articles workflow only.
-- Backward Compatible AC-6 — Phase 2C tests run green with or without this migration.
-- ============================================================

CREATE TABLE IF NOT EXISTS write_articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  article_id BIGINT UNSIGNED NOT NULL,
  research_package_id BIGINT UNSIGNED NULL,
  cluster_id BIGINT UNSIGNED NULL,
  team_id BIGINT UNSIGNED NOT NULL,
  word_count INT UNSIGNED NOT NULL DEFAULT 0,
  outline_json JSON NULL,
  disclaimer_added TINYINT(1) NOT NULL DEFAULT 0,
  eeat_score TINYINT UNSIGNED NULL,
  citations_count INT UNSIGNED NOT NULL DEFAULT 0,
  write_step TINYINT UNSIGNED NOT NULL DEFAULT 1,
  step_status ENUM('pending','running','done','fail') NOT NULL DEFAULT 'pending',
  error_msg VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_write_articles_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_write_articles_pkg FOREIGN KEY (research_package_id) REFERENCES research_packages(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_write_articles_cluster FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_write_articles_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_write_articles_article (article_id),
  INDEX idx_write_team_status (team_id, step_status),
  INDEX idx_write_step_current (write_step, step_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
