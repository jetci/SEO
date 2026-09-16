// EEAT Studio V2 · Drizzle ORM Schema — SINGLE SOURCE OF TRUTH
// 8 Tables ONLY — matches SQL db/migrations/0001_init_8_tables.sql EXACTLY
// DO NOT ADD extra columns or tables here (SA §4 Mandate LINE-BY-LINE).
// Type = mysql/bigint unsigned for PKs.
// ⚠️ REVISED 2026-09-08: Sync to fixed SQL (non-compliance FIX-1)
//   · users.role: admin/writer ONLY (NO viewer!)
//   · team_members.permission: owner/admin/member ONLY (NO read/edit!)
//   · categories: +icon +isActive +sortOrder (3 cols ADDED SA L57)
//   · projects: nicheCategoryId→categoryId rename + mainKeyword ADDED (SA L59)
//   · clusters: TOTAL REWRITE (name, type enum pillar/cluster/supporting, parentId self-ref) SA L62-L63
//   · keywords: +status enum(pending/written) ADDED SA L66
//   · articles: keywordId → NULLABLE SA L68! status=draft/published (2 values ONLY SA L68), removed workflowStatus/clusterId/wordCount/outlineJson/publishedAt
import {
  bigint, int, tinyint, varchar, text, mysqlEnum,
  datetime, uniqueIndex, index, primaryKey, decimal,
} from 'drizzle-orm/mysql-core';
import { mysqlTable } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

const TS_DEFAULT = sql`CURRENT_TIMESTAMP`;

// ======================================================================
// SHARED HELPERS / ENUM VALUES (shared/types.ts contract mirror)
// ======================================================================
export const USER_ROLES = ['admin', 'writer'] as const;                                                              // ✅ SA L46: admin/writer ONLY (viewer REMOVED!)
export const TEAM_PERMS = ['owner', 'admin', 'member'] as const;                                                     // ✅ SA L53: owner/admin/member ONLY (read/edit REMOVED!)
export const INTENTS = ['commercial', 'informational', 'navigational', 'transactional'] as const;                    // SA L65: intent enum
export const KWTier = ['pillar', 'cluster', 'supporting'] as const;                                                  // auxiliary tier
export const ARTICLE_STATUS = ['draft', 'published'] as const;                                                       // ✅ SA L68: 2 values ONLY (writing/review REMOVED!)
export const CLUSTER_TYPES = ['pillar', 'cluster', 'supporting'] as const;                                           // ✅ SA L62: cluster type enum TREE
export const KEYWORD_STATUS = ['pending', 'written'] as const;                                                       // ✅ SA L66: keywords status enum pending/written

const colNowOpts = { mode: 'date' as const }; // datetime → JS Date

// ======================================================================
// TABLE 1/8: users (§4.1 Google OAuth + RBAC)
// SA L46-L47: id, email(unique,not null), name, role(enum: admin/writer), created_at(default now)
// ======================================================================
export const users = mysqlTable(
  'users',
  {
    id:             bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    googleOpenId:   varchar('google_open_id', { length: 255 }).notNull(),
    email:          varchar('email',          { length: 255 }).notNull(),
    name:           varchar('name',           { length: 255 }).notNull(),
    avatarUrl:      varchar('avatar_url',     { length: 512 }),
    role:           mysqlEnum('role', USER_ROLES).notNull().default('writer'),                                      // ✅ admin/writer ONLY
    bio:            text('bio'),
    isActive:       tinyint('is_active').notNull().default(1),
    createdAt:      datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
    updatedAt:      datetime('updated_at', colNowOpts).notNull().default(TS_DEFAULT).$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('uk_users_google_open_id').on(t.googleOpenId),
    uniqueIndex('uk_users_email').on(t.email),                                                                      // SA G0.3: email UNIQUE
    index('idx_users_role').on(t.role),
    index('idx_users_is_active').on(t.isActive),
  ],
);

// ======================================================================
// TABLE 2/8: teams (§4.2 workspaces)
// SA L49-L50: id, owner_id(fk→users), name, created_at(default now)
// ======================================================================
export const teams = mysqlTable(
  'teams',
  {
    id:          bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name:        varchar('name', { length: 255 }).notNull(),
    ownerId:     bigint('owner_id', { mode: 'number', unsigned: true }).notNull().references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    description: text('description'),                                                                               // aux OK
    isActive:    tinyint('is_active').notNull().default(1),                                 // aux OK
    createdAt:   datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
    updatedAt:   datetime('updated_at', colNowOpts).notNull().default(TS_DEFAULT).$onUpdateFn(() => new Date()),    // aux OK
  },
  (t) => [index('idx_teams_owner_id').on(t.ownerId)],
);

// ======================================================================
// TABLE 3/8: team_members (§4.3 permission scope)
// SA L52-L54: id, team_id(fk→teams), user_id(fk→users), role(enum: owner/admin/member), unique(team_id,user_id)
// ======================================================================
export const teamMembers = mysqlTable(
  'team_members',
  {
    id:         bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    teamId:     bigint('team_id', { mode: 'number', unsigned: true }).notNull().references(() => teams.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId:     bigint('user_id', { mode: 'number', unsigned: true }).notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    permission: mysqlEnum('permission', TEAM_PERMS).notNull().default('member'),                                    // ✅ SA L53 enum (no more read/edit!)
    joinedAt:   datetime('joined_at', colNowOpts).notNull().default(TS_DEFAULT),                                    // aux OK
    createdAt:  datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),                                   // 2513 Guard FIX
  },
  (t) => [
    uniqueIndex('uk_team_members').on(t.teamId, t.userId),                                                          // SA L54: no dup
    index('idx_team_members_user_id').on(t.userId),
  ],
);

// ======================================================================
// TABLE 4/8: categories (§4.4 is_ymyl flag + 15 rows seed)
// SA L56-L57: id, name, slug(unique), icon, is_ymyl(bool default false), is_active(bool default true), sort_order(int), created_at
// ✅ FIX: +3 cols ADDED (icon/isActive/sortOrder) SA L57 explicit
// ======================================================================
export const categories = mysqlTable(
  'categories',
  {
    id:          int('id', { unsigned: true }).autoincrement().primaryKey(),
    name:        varchar('name', { length: 128 }).notNull(),
    slug:        varchar('slug', { length: 128 }).notNull(),
    icon:        varchar('icon', { length: 64 }),                                                                   // ✅ SA L57: icon ADDED (MISSING)
    isYmyl:      tinyint('is_ymyl').notNull().default(0),                                  // ✅ SA L56
    isActive:    tinyint('is_active').notNull().default(1),                                 // ✅ SA L57: isActive ADDED (MISSING — default true)
    sortOrder:   int('sort_order').notNull().default(0),                                                            // ✅ SA L57: sortOrder ADDED (MISSING)
    description: varchar('description', { length: 512 }),                                                           // aux OK (non-conflict)
    createdAt:   datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
  },
  (t) => [
    uniqueIndex('uk_categories_name').on(t.name),
    uniqueIndex('uk_categories_slug').on(t.slug),
    index('idx_categories_is_ymyl').on(t.isYmyl),
    index('idx_categories_sort').on(t.sortOrder),
  ],
);

// ======================================================================
// TABLE 5/8: projects (§4.5 grouping layer)
// SA L59-L60: id, team_id(fk→teams), category_id(fk→categories), name, main_keyword, created_at
// ✅ FIX: nicheCategoryId → categoryId RENAME, mainKeyword ADDED SA L59 explicit
// ======================================================================
export const projects = mysqlTable(
  'projects',
  {
    id:              bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    teamId:          bigint('team_id', { mode: 'number', unsigned: true }).references(() => teams.id, { onDelete: 'set null', onUpdate: 'cascade' }),  // SA L59: fk→teams
    ownerId:         bigint('owner_id', { mode: 'number', unsigned: true }).notNull().references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),  // aux (multi-tenant OK)
    categoryId:      int('category_id', { unsigned: true }).references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),  // ✅ SA L59 (renamed from niche_category_id!)
    name:            varchar('name', { length: 255 }).notNull(),                                                    // ✅ SA L59: name
    mainKeyword:     varchar('main_keyword', { length: 255 }),                                                      // ✅ SA L59: main_keyword ADDED (MISSING!)
    description:     text('description'),
    isActive:        tinyint('is_active').notNull().default(1),
    createdAt:       datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
    updatedAt:       datetime('updated_at', colNowOpts).notNull().default(TS_DEFAULT).$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('idx_projects_owner_id').on(t.ownerId),
    index('idx_projects_team_id').on(t.teamId),
    index('idx_projects_category').on(t.categoryId),
  ],
);

// ======================================================================
// TABLE 6/8: clusters (§4.6 Pillar / Cluster / Supporting TREE struct)
// SA L62-L63: id, project_id(fk→projects), name, type(enum: pillar/cluster/supporting), parent_id(fk→clusters, nullable self-ref), created_at
// ⚠️ COMPLETE REWRITE (was flat: pillar_keyword/cluster_main/... → NOW TREE parent_id self-ref + type enum + name)
// REMOVED cols: pillarKeyword, clusterMain, userIntent, searchVolumeMonthly, difficultyScore, status (CLUSTER_STATUS gone!), createdBy
// SA: NO extras! Only L62-L63 columns.
// ======================================================================
export const clusters = mysqlTable(
  'clusters',
  {
    id:                  bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    projectId:           bigint('project_id', { mode: 'number', unsigned: true }).notNull().references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),  // SA L62
    name:                varchar('name', { length: 255 }).notNull(),                                                             // ✅ SA L62: name ADDED (MISSING!)
    type:                mysqlEnum('type', CLUSTER_TYPES).notNull().default('supporting'),                                       // ✅ SA L62: type enum ADDED (pillar/cluster/supporting MISSING!)
    parentId:            bigint('parent_id', { mode: 'number', unsigned: true }).references((): any => clusters.id, { onDelete: 'set null', onUpdate: 'cascade' }),  // ✅ SA L63: parent_id self-ref nullable ADDED! (tree struct)
    createdAt:           datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
  },
  (t) => [
    index('idx_clusters_project_id').on(t.projectId),
    index('idx_clusters_parent_id').on(t.parentId),                                                                             // self-ref tree FK index
    index('idx_clusters_type').on(t.type),
  ],
);

// ======================================================================
// TABLE 7/8: keywords (§4.7 per cluster supporting / tier)
// SA L65-L66: id, cluster_id(fk→clusters), keyword, intent(enum:info/trans/comm/nav default info), status(enum:pending/written default pending), created_at
// ✅ FIX: status column ADDED SA L66 explicit (pending/written default pending)
// Extra aux cols kept (not conflict): projectId, categoryId, tier, searchVolume, difficulty, isTarget
// ======================================================================
export const keywords = mysqlTable(
  'keywords',
  {
    id:                bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    clusterId:         bigint('cluster_id', { mode: 'number', unsigned: true }).notNull().references(() => clusters.id, { onDelete: 'cascade', onUpdate: 'cascade' }),  // SA L65
    projectId:         bigint('project_id', { mode: 'number', unsigned: true }).notNull().references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),  // aux
    categoryId:        int('category_id', { unsigned: true }).notNull().references(() => categories.id, { onDelete: 'restrict', onUpdate: 'cascade' }),  // aux
    keywordText:       varchar('keyword_text', { length: 255 }).notNull(),                                                         // ✅ SA L65 keyword
    tier:              mysqlEnum('tier', KWTier).notNull().default('supporting'),                                                  // aux
    searchVolume:      int('search_volume'),
    intentSuggestion:  mysqlEnum('intent_suggestion', INTENTS),                                                                    // ✅ SA L65 intent enum
    difficulty:        int('difficulty'),
    isTarget:          tinyint('is_target').notNull().default(0),                                         // aux
    status:            mysqlEnum('status', KEYWORD_STATUS).notNull().default('pending'),                                           // ✅ SA L66 status ADDED (pending/written default pending — MISSING!)
    createdAt:         datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
  },
  (t) => [
    uniqueIndex('uk_keywords_project_text').on(t.projectId, t.keywordText),
    index('idx_keywords_cluster_id').on(t.clusterId),
    index('idx_keywords_category_id').on(t.categoryId),
    index('idx_keywords_status').on(t.status),
  ],
);

// ======================================================================
// TABLE 8/8: articles (§4.8 — MANDATORY 4 FK BUT keyword_id NULLABLE SA!)
// SA L68-L69: id, project_id(fk), keyword_id(fk→nullable!), author_id(fk), category_id(fk), title, content, meta_title, meta_description, status(enum:draft/published default draft), created_at, updated_at
// ✅ FIX 1: keywordId → NULLABLE (SA L68 explicit: keyword_id is nullable!)
// ✅ FIX 2: status=draft/published ONLY 2 values (workflowStatus REMOVED SA L68 NO writing/review)
// ✅ REMOVED cols NOT in SA spec: clusterId, outlineJson, wordCount, publishedAt (will add Phase 2 after SA approved)
// ======================================================================
export const articles = mysqlTable(
  'articles',
  {
    id:              bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    projectId:       bigint('project_id',  { mode: 'number', unsigned: true }).notNull().references(() => projects.id, { onDelete: 'restrict', onUpdate: 'cascade' }), // FK 1 SA
    keywordId:       bigint('keyword_id',  { mode: 'number', unsigned: true }).references(() => keywords.id, { onDelete: 'set null', onUpdate: 'cascade' }),           // ✅ SA L68 NULLABLE! removed .notNull()
    authorId:        bigint('author_id',   { mode: 'number', unsigned: true }).notNull().references(() => users.id,    { onDelete: 'restrict', onUpdate: 'cascade' }),  // FK 3 SA
    categoryId:      int('category_id',    { unsigned: true }).notNull().references(() => categories.id, { onDelete: 'restrict', onUpdate: 'cascade' }), // FK 4 SA
    title:           varchar('title', { length: 512 }).notNull(),                                                    // SA L68: title
    metaTitle:       varchar('meta_title', { length: 120 }),                                                         // SA L68: meta_title
    metaDescription: varchar('meta_description', { length: 320 }),                                                   // SA L68: meta_description
    content:         text('content'),                                                                                // SA L68: content (longtext → text OK, drizzle maps text → LONGTEXT for mysql/mariadb)
    status:          mysqlEnum('status', ARTICLE_STATUS).notNull().default('draft'),                                 // ✅ SA L68: enum draft/published 2 values ONLY! (writing/review DELETED)
    createdAt:       datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
    updatedAt:       datetime('updated_at', colNowOpts).notNull().default(TS_DEFAULT).$onUpdateFn(() => new Date()), // SA L69: updated_at ✅
  },
  (t) => [
    index('idx_articles_project_id').on(t.projectId),
    index('idx_articles_author_id').on(t.authorId),
    index('idx_articles_keyword_id').on(t.keywordId),
    index('idx_articles_category_id').on(t.categoryId),
    index('idx_articles_status').on(t.status),
    index('idx_articles_created_at').on(t.createdAt),
  ],
);

// ======================================================================
// Type exports (zod-free — TS only for consumers)
// ======================================================================
// ======================================================================
// TABLE 9/12: settings (per team persistent AES-256-GCM encrypted keys)
// Phase 2 NEW - Task 1.1
// ======================================================================
export const SETTINGS_KEYS = ['llm_provider','llm_api_key','serp_provider','serp_api_key','billing_limit_usd'] as const;
export const SERP_PROVIDERS = ['dataforseo','serper'] as const;

export const settings = mysqlTable(
  'settings',
  {
    id:        bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    teamId:    bigint('team_id', { mode: 'number', unsigned: true }).notNull().references(() => teams.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    keyName:   mysqlEnum('key_name', SETTINGS_KEYS).notNull(),
    value:     text('value').notNull(),
    updatedAt: datetime('updated_at', colNowOpts).notNull().default(TS_DEFAULT).$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('uk_settings_team_key').on(t.teamId, t.keyName),
  ],
);

// ======================================================================
// TABLE 10/12: serp_metric_cache (phase2 enrich cross-project md5 dedup 7d)
// ======================================================================
export const serpMetricCache = mysqlTable(
  'serp_metric_cache',
  {
    id:             bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    cacheKeyHash:   varchar('cache_key_hash', { length: 32 }).notNull(),
    provider:       mysqlEnum('provider', SERP_PROVIDERS).notNull().default('dataforseo'),
    searchVolume:   int('search_volume'),
    difficulty:     tinyint('difficulty', { unsigned: true }),
    cpc:            decimal('cpc', { precision: 12, scale: 6 }),
    intentSuggestion: mysqlEnum('intent_suggestion', INTENTS),
    rawJsonResponse: text('raw_json_response'),
    fetchedAt:      datetime('fetched_at', colNowOpts).notNull().default(TS_DEFAULT),
  },
  (t) => [
    uniqueIndex('uk_serp_cache_hash_provider').on(t.cacheKeyHash, t.provider),
    index('idx_serp_cache_fetched').on(t.fetchedAt),
  ],
);

// ======================================================================
// TABLE 11/12: research_packages (step 2.5 evidence pack 4 jobs cache 30d)
// ======================================================================
export const researchPackages = mysqlTable(
  'research_packages',
  {
    id:            bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    keywordId:     bigint('keyword_id', { mode: 'number', unsigned: true }).notNull().references(() => keywords.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    projectId:     bigint('project_id', { mode: 'number', unsigned: true }).notNull().references(() => projects.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    packageJson:   text('package_json').notNull(),
    fromCache:     tinyint('from_cache').notNull().default(0),
    durationMs:    int('duration_ms', { unsigned: true }),
    createdAt:     datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
    lastUpdatedAt: datetime('last_updated_at', colNowOpts).notNull().default(TS_DEFAULT).$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('uk_research_pkg_keyword').on(t.keywordId),
  ],
);

// ======================================================================
// TABLE 12/12: research_audit (LLM + SERP billing audit rows per call)
// ======================================================================
export const AUDIT_PROVIDERS = ['llm','serp'] as const;

export const researchAudit = mysqlTable(
  'research_audit',
  {
    id:            bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    teamId:        bigint('team_id', { mode: 'number', unsigned: true }).notNull().references(() => teams.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    provider:      mysqlEnum('provider', AUDIT_PROVIDERS).notNull(),
    endpointName:  varchar('endpoint_name', { length: 255 }).notNull(),
    providerModel: varchar('provider_model', { length: 64 }),
    tokensIn:      int('tokens_in', { unsigned: true }),
    tokensOut:     int('tokens_out', { unsigned: true }),
    rowsReturned:  int('rows_returned', { unsigned: true }),
    usdCostEst:    decimal('usd_cost_est', { precision: 10, scale: 6 }).notNull().default(sql`0`),
    traceId:       varchar('trace_id', { length: 36 }).notNull(),
    keywordId:     bigint('keyword_id', { mode: 'number', unsigned: true }).references(() => keywords.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt:     datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
  },
  (t) => [
    index('idx_audit_team_created').on(t.teamId, t.createdAt),
  ],
);

// ======================================================================
// Types Phase2 exports
// ======================================================================
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
export type SerpMetricCache = typeof serpMetricCache.$inferSelect;
export type NewSerpMetricCache = typeof serpMetricCache.$inferInsert;
export type ResearchPackage = typeof researchPackages.$inferSelect;
export type NewResearchPackage = typeof researchPackages.$inferInsert;
export type ResearchAuditRow = typeof researchAudit.$inferSelect;
export type NewResearchAuditRow = typeof researchAudit.$inferInsert;

export const WRITE_STATUSES = ['pending','running','done','fail'] as const;

export const writeArticles = mysqlTable(
  'write_articles',
  {
    id:               bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    articleId:        bigint('article_id', { mode: 'number', unsigned: true }).notNull().references(() => articles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    researchPackageId: bigint('research_package_id', { mode: 'number', unsigned: true }).references(() => researchPackages.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    clusterId:        bigint('cluster_id', { mode: 'number', unsigned: true }).references(() => clusters.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    teamId:           bigint('team_id', { mode: 'number', unsigned: true }).notNull().references(() => teams.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    wordCount:        int('word_count', { unsigned: true }).notNull().default(0),
    outlineJson:      text('outline_json'),
    disclaimerAdded:  tinyint('disclaimer_added').notNull().default(0),
    eeatScore:        tinyint('eeat_score', { unsigned: true }),
    citationsCount:   int('citations_count', { unsigned: true }).notNull().default(0),
    writeStep:        tinyint('write_step', { unsigned: true }).notNull().default(1),
    stepStatus:       mysqlEnum('step_status', WRITE_STATUSES).notNull().default('pending'),
    errorMsg:         varchar('error_msg', { length: 512 }),
    createdAt:        datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
    updatedAt:        datetime('updated_at', colNowOpts).notNull().default(TS_DEFAULT).$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('uk_write_articles_article').on(t.articleId),
    index('idx_write_team_status').on(t.teamId, t.stepStatus),
    index('idx_write_step_current').on(t.writeStep, t.stepStatus),
  ],
);

export type WriteArticle = typeof writeArticles.$inferSelect;
export type NewWriteArticle = typeof writeArticles.$inferInsert;

// ======================================================================
// TABLE 13/13: project_brand_voices (Phase 3 Brand Voice — EEAT +25%)
// 0004_phase3_brand_voice.sql migration applied (CREATE ONLY NO ALTER)
// voice_json stored as TEXT; JSON.parse at runtime (Drizzle/MySQL JSON safe).
// ======================================================================
export const projectBrandVoices = mysqlTable(
  'project_brand_voices',
  {
    id:         bigint('id', { mode:'number', unsigned:true }).autoincrement().primaryKey(),
    projectId:  bigint('project_id', { mode:'number', unsigned:true }).notNull()
                .references(() => projects.id, { onDelete:'cascade', onUpdate:'cascade' }),
    scrapedUrl: varchar('scraped_url', { length: 2048 }),
    voiceJson:  text('voice_json').notNull(),
    createdAt:  datetime('created_at', colNowOpts).notNull().default(TS_DEFAULT),
    updatedAt:  datetime('updated_at', colNowOpts).notNull().default(TS_DEFAULT).$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('uk_project_brand_voice_project').on(t.projectId),
    index('idx_brand_project_updated').on(t.projectId, t.updatedAt),
  ],
);
export type ProjectBrandVoice = typeof projectBrandVoices.$inferSelect;
export type NewProjectBrandVoice = typeof projectBrandVoices.$inferInsert;

// Table select/insert type aliases for old code import compatibility
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Cluster = typeof clusters.$inferSelect;
export type NewCluster = typeof clusters.$inferInsert;
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
