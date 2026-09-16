import { defineConfig } from 'drizzle-kit';

// EEAT Studio V2 — Drizzle ORM Config
// DB Credentials loaded from process.env.DATABASE_URL or individual vars
// MariaDB mysql2 dialect ONLY (not postgres)
export default defineConfig({
  dialect: 'mysql',
  schema: './db/schema.ts',
  out: './db/migrations',
  // Use simple MySQL2 URL pattern
  dbCredentials: {
    url: process.env.DATABASE_URL ||
      `mysql://${process.env.DB_USER || 'eeat'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3307}/${process.env.DB_NAME || 'eeat_studio_v2'}`,
  },
  // Match MariaDB 10.5+ syntax (SA V2: deploy on same VPS = MariaDB 10.11+)
  migrations: {
    prefix: 'timestamp',
    table: 'drizzle_migrations_v2',
  },
  verbose: true,
  strict: true,
});
