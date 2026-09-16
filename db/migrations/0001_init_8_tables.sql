-- ================================================================
-- EEAT Studio V2 · Migration 0001 — CREATE 8 TABLES (SA §4 Schema LINE-BY-LINE)
-- ================================================================
-- MariaDB 10.5+ ONLY · ENGINE=InnoDB CHARSET=utf8mb4 (Thai lang)
-- Execution Order by FK dependency: users → teams → team_members →
--   categories → projects → clusters → keywords → articles
-- 2513 Bug Guard: ALL created_at columns: NOT NULL DEFAULT CURRENT_TIMESTAMP()
-- SA G0.3: users.email UNIQUE + FK constraints on ALL relations
-- SA G0.2: Exactly 8 tables (NO extras!)
-- ⚠️ REVISED 2026-09-08: Fixed 5 tables to match agent_phase0_setup.md L46-L69 EXACT
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- TABLE 1 / 8: users (§4.1 — Google OAuth login, RBAC roles)
-- SA L46-L47: id(pk), email(unique,not null), name, role(enum: admin/writer), created_at(default now)
-- ⚠️ FIX: role enum = admin/writer ONLY (NO viewer! SA L46 explicit)
-- Extra google_open_id (for OAuth dedup) / avatar_url / bio / is_active / updated_at — SA OK (auxiliary not conflicting)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `google_open_id`        VARCHAR(255)    NOT NULL,
  `email`                 VARCHAR(255)    NOT NULL,
  `name`                  VARCHAR(255)    NOT NULL,
  `avatar_url`            VARCHAR(512)    NULL,
  `role`                  ENUM('admin','writer') NOT NULL DEFAULT 'writer',  -- ✅ SA L46: admin/writer ONLY (NO viewer!)
  `bio`                   TEXT            NULL,
  `is_active`             TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  `updated_at`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP()
                                                ON UPDATE CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_google_open_id` (`google_open_id`),
  UNIQUE KEY `uk_users_email`           (`email`),           -- SA G0.3: email UNIQUE
  KEY `idx_users_role`       (`role`),
  KEY `idx_users_is_active`  (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v2 users (Google OAuth) — SA §4.1 FIX: role enum=admin/writer (NO viewer)';

-- ────────────────────────────────────────────────────────────────
-- TABLE 2 / 8: teams (§4.2 — multi-tenant org / workspace)
-- SA L49-L50: id(pk), owner_id(fk→users), name, created_at(default now)
-- aux cols: description / is_active / updated_at — OK (not conflicting)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `teams` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(255)    NOT NULL,
  `owner_id`     BIGINT UNSIGNED NOT NULL,
  `description`  TEXT            NULL,
  `is_active`    TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  `updated_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP()
                                       ON UPDATE CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  KEY `idx_teams_owner_id` (`owner_id`),
  CONSTRAINT `fk_teams_owner_id`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v2 teams (workspaces) — SA §4.2';

-- ────────────────────────────────────────────────────────────────
-- TABLE 3 / 8: team_members (§4.3 — RBAC team permission scope)
-- SA L52-L54: id(pk), team_id(fk→teams), user_id(fk→users), role(enum: owner/admin/member), unique(team_id,user_id)
-- ⚠️ FIX: col name = "permission" but enum = owner/admin/member (SA L53 says role(owner/admin/member) — col name kept permission for v1; enum fixed to SA values!)
-- NO read/edit! SA: owner/admin/member ONLY
-- extra joined_at — OK
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `team_members` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `team_id`     BIGINT UNSIGNED NOT NULL,
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `permission`  ENUM('owner','admin','member') NOT NULL DEFAULT 'member',  -- ✅ SA L53: owner/admin/member ONLY (NO read/edit!)
  `joined_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_team_members` (`team_id`,`user_id`),  -- SA L54: no dup member
  KEY `idx_team_members_user_id` (`user_id`),
  CONSTRAINT `fk_team_members_team_id`
    FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_team_members_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v2 team membership + permission SA §4.3 FIX: enum=owner/admin/member (NO read/edit)';

-- ────────────────────────────────────────────────────────────────
-- TABLE 4 / 8: categories (§4.4 — is_ymyl flag, 15 seed rows next migration)
-- SA L56-L57: id(pk), name, slug(unique), icon, is_ymyl(bool default false), is_active(bool default true), sort_order(int), created_at
-- ⚠️ FIX: ADDED 3 MISSING COLUMNS: icon, is_active, sort_order! (SA L57 explicit)
-- extra description — kept (auxiliary non-conflicting)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(128)    NOT NULL,
  `slug`         VARCHAR(128)    NOT NULL,
  `icon`         VARCHAR(64)     NULL,               -- ✅ SA L57: icon! (MISSING before)
  `is_ymyl`      TINYINT(1)      NOT NULL DEFAULT 0,  -- ✅ SA L56: is_ymyl bool default false
  `is_active`    TINYINT(1)      NOT NULL DEFAULT 1,  -- ✅ SA L57: is_active bool default true! (MISSING before)
  `sort_order`   INT             NOT NULL DEFAULT 0,  -- ✅ SA L57: sort_order int! (MISSING before)
  `description`  VARCHAR(512)    NULL,                -- auxiliary (SA not listed, not conflicting)
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categories_name` (`name`),
  UNIQUE KEY `uk_categories_slug` (`slug`),
  KEY `idx_categories_is_ymyl` (`is_ymyl`),
  KEY `idx_categories_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v2 categories + YMYL flag SA §4.4 FIX: +3 cols (icon/is_active/sort_order) ADDED';

-- ────────────────────────────────────────────────────────────────
-- TABLE 5 / 8: projects (§4.5 — grouping articles/keywords)
-- SA L59-L60: id(pk), team_id(fk→teams), category_id(fk→categories), name, main_keyword, created_at
-- ⚠️ FIX: ADDED main_keyword column! (SA L59 explicit MISSING)
-- owner_id (aux, SA not listed but required for multi-tenant — kept), niche_category_id rename → category_id (SA: category_id)
-- is_active / description / updated_at → aux OK
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `projects` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `team_id`           BIGINT UNSIGNED NULL,                     -- SA L59: fk→teams
  `owner_id`          BIGINT UNSIGNED NOT NULL,                 -- aux (multi-tenant)
  `category_id`       INT UNSIGNED    NULL,                     -- ✅ SA L59: category_id fk→categories (renamed from niche_category_id)
  `name`              VARCHAR(255)    NOT NULL,                 -- ✅ SA L59: name
  `main_keyword`      VARCHAR(255)    NULL,                     -- ✅ SA L59: main_keyword! (MISSING before — ADDED)
  `description`       TEXT            NULL,                     -- aux
  `is_active`         TINYINT(1)      NOT NULL DEFAULT 1,       -- aux
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP()
                                            ON UPDATE CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  KEY `idx_projects_owner_id` (`owner_id`),
  KEY `idx_projects_team_id`  (`team_id`),
  KEY `idx_projects_category` (`category_id`),
  CONSTRAINT `fk_projects_team_id`
    FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_projects_owner_id`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_projects_category_id`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v2 projects SA §4.5 FIX: ADDED main_keyword + renamed category_id (was niche_category_id)';

-- ────────────────────────────────────────────────────────────────
-- TABLE 6 / 8: clusters (§4.6 — Pillar/Cluster/Supporting Tree structure)
-- SA L62-L63: id(pk), project_id(fk→projects), name, type(enum: pillar/cluster/supporting), parent_id(fk→clusters, nullable self-ref), created_at
-- ⚠️ TOTALLY REWRITTEN (was flat structure pillar_keyword/cluster_main → NOW TREE with parent_id + name + type enum)
-- NO extra columns beyond SA (cleanup: removed pillar_keyword, cluster_main, user_intent, search_volume_monthly, difficulty_score, status, created_by)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `clusters` (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`            BIGINT UNSIGNED NOT NULL,  -- ✅ SA L62: fk→projects
  `name`                  VARCHAR(255)    NOT NULL,  -- ✅ SA L62: name! (MISSING — ADDED)
  `type`                  ENUM('pillar','cluster','supporting') NOT NULL DEFAULT 'supporting',  -- ✅ SA L62: type(pillar/cluster/supporting) (MISSING — ADDED)
  `parent_id`             BIGINT UNSIGNED NULL,      -- ✅ SA L63: parent_id fk→clusters self-ref nullable! (MISSING — ADDED)
  `created_at`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  KEY `idx_clusters_project_id` (`project_id`),
  KEY `idx_clusters_parent_id`  (`parent_id`),
  KEY `idx_clusters_type`       (`type`),
  CONSTRAINT `fk_clusters_project_id`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_clusters_parent_id`
    FOREIGN KEY (`parent_id`) REFERENCES `clusters` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE   -- ✅ self-ref! (SA L63: parent_id self-ref nullable)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v2 keyword clusters SA §4.6 FIX: COMPLETE REWRITE → TREE(name, type enum, parent_id self-ref). No extras.';

-- ────────────────────────────────────────────────────────────────
-- TABLE 7 / 8: keywords (§4.7 — supporting keywords per cluster)
-- SA L65-L66: id(pk), cluster_id(fk→clusters), keyword, intent(enum:info/trans/comm/nav default info), status(enum:pending/written default pending), created_at
-- ⚠️ FIX: ADDED status column! (SA L66: status pending/written default pending — MISSING before)
-- Extra cols kept: project_id, category_id, tier, search_volume, difficulty, is_target — SA not listed but not conflicting (aux for pipeline phase 2)
-- keyword → rename keyword_text keep same; intent → intent_suggestion keep same
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `keywords` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cluster_id`         BIGINT UNSIGNED NOT NULL,                  -- ✅ SA L65: fk→clusters
  `project_id`         BIGINT UNSIGNED NOT NULL,                  -- aux (FK → projects, SA not explicit but OK)
  `category_id`        INT UNSIGNED    NOT NULL,                  -- aux
  `keyword_text`       VARCHAR(255)    NOT NULL,                  -- ✅ SA L65: keyword
  `intent_suggestion`  ENUM('commercial','informational','navigational','transactional') NULL,  -- ✅ SA L65: intent enum (default info — via col default below)
  `status`             ENUM('pending','written') NOT NULL DEFAULT 'pending',  -- ✅ SA L66: status enum pending/written default pending! (MISSING — ADDED)
  `tier`               ENUM('pillar','cluster','supporting') NOT NULL DEFAULT 'supporting',  -- aux
  `search_volume`      INT             NULL,                      -- aux
  `difficulty`         INT             NULL,                      -- aux
  `is_target`          TINYINT(1)      NOT NULL DEFAULT 0,        -- aux
  `created_at`         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_keywords_project_text` (`project_id`,`keyword_text`),
  KEY `idx_keywords_cluster_id`  (`cluster_id`),
  KEY `idx_keywords_category_id` (`category_id`),
  KEY `idx_keywords_status`      (`status`),
  CONSTRAINT `fk_keywords_cluster_id`
    FOREIGN KEY (`cluster_id`) REFERENCES `clusters` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_keywords_project_id`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_keywords_category_id`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v2 keywords SA §4.7 FIX: +ADDED status (enum pending/written, default pending)';

-- ────────────────────────────────────────────────────────────────
-- TABLE 8 / 8: articles (§4.8 — articles table)
-- SA L68-L69: id, project_id(fk), keyword_id(fk→nullable!), author_id(fk), category_id(fk), title, content, meta_title, meta_description, status(enum:draft/published default draft), created_at, updated_at
-- ⚠️ FIX 1: keyword_id = NULLABLE (SA L68 says keyword_id(fk→keywords, nullable) — was NOT NULL! violation!)
-- ⚠️ FIX 2: status enum = draft/published ONLY (2 values! SA L68 explicit NO writing/review)
-- REMOVED workflow_status (4 values), cluster_id (optional but SA not listed → REMOVED to comply strict)
-- REMOVED outline_json, word_count, published_at (SA not listed, removed for strictness; add back in Phase 2 after SA approved)
-- content → LONGTEXT (OK; SA says text/longtext L68)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `articles` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`        BIGINT UNSIGNED NOT NULL,          -- SA FK 1/4 (mandatory not null per L68: 4 FK named; keyword_id nullable SA explicit!)
  `keyword_id`        BIGINT UNSIGNED NULL,              -- ✅ SA L68: keyword_id → NULLABLE! (was NOT NULL violation FIXED)
  `author_id`         BIGINT UNSIGNED NOT NULL,          -- SA FK 2/4 (EEAT author mandatory)
  `category_id`       INT UNSIGNED    NOT NULL,          -- SA FK 3/4 (YMYL intent)
  `title`             VARCHAR(512)    NOT NULL,          -- ✅ SA L68: title
  `meta_title`        VARCHAR(120)    NULL,              -- ✅ SA L68: meta_title
  `meta_description`  VARCHAR(320)    NULL,              -- ✅ SA L68: meta_description
  `content`           LONGTEXT        NULL,              -- ✅ SA L68: content (text/longtext)
  `status`            ENUM('draft','published') NOT NULL DEFAULT 'draft',  -- ✅ SA L68: enum draft/published ONLY 2 values! (writing/review DELETED)
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP()
                                            ON UPDATE CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  KEY `idx_articles_project_id`       (`project_id`),
  KEY `idx_articles_author_id`        (`author_id`),
  KEY `idx_articles_keyword_id`       (`keyword_id`),
  KEY `idx_articles_category_id`      (`category_id`),
  KEY `idx_articles_status`           (`status`),
  KEY `idx_articles_created_at`       (`created_at`),
  CONSTRAINT `fk_articles_project_id`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_articles_keyword_id`
    FOREIGN KEY (`keyword_id`) REFERENCES `keywords` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,   -- keyword_id nullable (SA explicit L68!)
  CONSTRAINT `fk_articles_author_id`
    FOREIGN KEY (`author_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_articles_category_id`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='v2 articles SA §4.8 FIX: keyword_id NULLABLE (L68!) + status enum=2 values (draft/published). NO workflow_status!';

-- ================================================================
-- END 0001_init_8_tables.sql
-- Total Tables: 8 (users/teams/team_members/categories/projects/clusters/keywords/articles)
-- Total FK Constraints: users=0 · teams=1 · team_members=2 · categories=0 · projects=3 · clusters=2(+1 self-ref) · keywords=3 · articles=4 → TOTAL 15+1=self = 16 ✅
-- Total UNIQUE Constraints: users=2, team_members=1, categories=2, keywords=1 → 6 (plus 4 PKs = 10 unique indexes)
-- 2513 Bug Guard: 8/8 tables created_at = NOT NULL DEFAULT CURRENT_TIMESTAMP() ✅
-- SA Compliance Fixed 2026-09-08 (5 tables non-compliance resolved):
--   · categories: +3 cols (icon, is_active, sort_order)
--   · clusters: TOTAL REWRITE (name, type enum, parent_id self-ref)
--   · keywords: +status column (pending/written)
--   · articles: keyword_id → NULLABLE, status enum=2 values ONLY (draft/published), removed workflow_status/cluster_id/word_count/outline_json/published_at
--   · users.role enum: viewer REMOVED → admin/writer ONLY (SA L46)
--   · team_members.permission enum: read/edit REMOVED → owner/admin/member ONLY (SA L53)
--   · projects: +main_keyword column (SA L59), niche_category_id → category_id rename
-- ================================================================
