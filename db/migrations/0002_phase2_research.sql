-- ============================================================
-- Migration 0002 — Phase 2 Research Layer Additions
-- IDENTIFIER: phase2_research_20260908
-- Added 4 NEW tables only. ZERO alterations to 8 existing tables from 0001_init_8_tables.
-- Backward Compatible — old Phase1 suites run green.
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  team_id BIGINT UNSIGNED NOT NULL,
  key_name ENUM('llm_provider','llm_api_key','serp_provider','serp_api_key','billing_limit_usd') NOT NULL,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_settings_team_key (team_id, key_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS serp_metric_cache (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cache_key_hash CHAR(32) NOT NULL,
  provider ENUM('dataforseo','serper') NOT NULL DEFAULT 'dataforseo',
  search_volume INT NULL,
  difficulty TINYINT UNSIGNED NULL,
  cpc DECIMAL(12,6) NULL,
  intent_suggestion ENUM('commercial','informational','navigational','transactional') NULL,
  raw_json_response JSON NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_serp_cache_hash_provider (cache_key_hash, provider),
  INDEX idx_serp_cache_fetched (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS research_packages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  keyword_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  package_json JSON NOT NULL,
  from_cache TINYINT(1) NOT NULL DEFAULT 0,
  duration_ms INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_research_pkg_kw FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_research_pkg_proj FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_research_pkg_keyword (keyword_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS research_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  team_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('llm','serp') NOT NULL,
  endpoint_name VARCHAR(255) NOT NULL,
  provider_model VARCHAR(64) NULL,
  tokens_in INT UNSIGNED NULL,
  tokens_out INT UNSIGNED NULL,
  rows_returned INT UNSIGNED NULL,
  usd_cost_est DECIMAL(10,6) NOT NULL DEFAULT 0,
  trace_id CHAR(36) NOT NULL,
  keyword_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_research_audit_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_research_audit_kw FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_audit_team_created (team_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
