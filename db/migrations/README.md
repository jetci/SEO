# db/migrations/ — Drizzle SQL Migrations (EEAT Studio V2)

## Order of execution (SA System Design §4 FK dependencies):
| # | File | Use |
|---|---|---|
| 0001 | `0001_init_8_tables.sql` | Create users/teams/team_members/categories/projects/clusters/keywords/articles (8 tables) + FK constraints + created_at DEFAULT NOW() + email UNIQUE |
| 0002 | `0002_seed_categories.sql` | Insert 15 categories rows · is_ymyl flag (5 YMYL: slot/lottery/casino/finance/health) |

Run migration (after `npm install` in v2 root):
```bash
npm run db:migrate
```

MariaDB syntax ONLY — NO PostgreSQL constructs (`SERIAL`, `UUID()`, `::regclass`, `GENERATED ALWAYS AS IDENTITY`).

SA Iron Rule §4 G0.4 Guard:
```sql
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP()   -- ✅ Use this
-- created_at DATETIME NOT NULL                           -- ❌ NEVER (2513 Bug Risk)
```
