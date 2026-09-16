#!/usr/bin/env node
// Phase 2b W3 — Seed 5 mock research_audit rows team_id=90001 (2 LLM, 3 SERP)
// Idempotent: TRUNCATE team 90001 rows then INSERT (demo only safe)
import SSHClient from "ssh2-promise";

const SSH_CFG = {
  host: '35.231.230.218',
  username: 'ubuntu',
  password: 'BcXdZ8vKDrX9i54opwXkgt',
  port: 22,
};

const EEAT_PW = 'eeat_secret_2026_Cloud!';

const now = new Date();
const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
const yyyy = now.getUTCFullYear();

function ssh() {
  return new SSHClient(SSH_CFG);
}

async function runBash(sshConn, bashScript) {
  try {
    const data = await sshConn.exec(bashScript, []);
    return String(data);
  } catch (e) {
    console.error('[bash err]', e);
    throw e;
  }
}

async function main() {
  const conn = ssh();
  try {
    await conn.connect();
    console.log('✅ SSH connected');

    const sqlInsert = `
USE eeat_studio_v2;
DELETE FROM research_audit WHERE team_id = 90001;
INSERT INTO research_audit (team_id, provider, endpoint_name, provider_model, tokens_in, tokens_out, rows_returned, usd_cost_est, trace_id, created_at) VALUES
(90001, 'llm', 'clusterKeywords', 'openrouter/anthropic/claude-3.5-sonnet', 12400, 3820, NULL, '0.01842', UUID(), '${yyyy}-${mm}-03 08:12:00'),
(90001, 'llm', 'enrichKeywordIntent', 'openrouter/gpt-4o-mini', 4200, 980, NULL, '0.00231', UUID(), '${yyyy}-${mm}-07 13:45:00'),
(90001, 'serp', 'fetchSerpOrganic', 'serper.dev/search', NULL, NULL, 120, '0.00240', UUID(), '${yyyy}-${mm}-04 09:03:00'),
(90001, 'serp', 'fetchSerpOrganic', 'serper.dev/search', NULL, NULL, 88, '0.00176', UUID(), '${yyyy}-${mm}-08 15:22:00'),
(90001, 'serp', 'fetchSerpPeopleAlsoAsk', 'dataforseo/serp', NULL, NULL, 52, '0.00090', UUID(), '${yyyy}-${mm}-09 10:18:00');
SELECT COUNT(*) AS audit_rows_team9001 FROM research_audit WHERE team_id=90001;
SELECT provider, COUNT(*) c, SUM(CAST(usd_cost_est AS DECIMAL(14,6))) total_usd FROM research_audit WHERE team_id=90001 GROUP BY provider;
`;

    const out = await runBash(conn, `set -euo pipefail; cat > /tmp/_phase2b_audit_seed.sql <<'SQL_EOF'\n${sqlInsert}\nSQL_EOF\nsudo docker exec -i eeat-studio-db mariadb -ueeat -p'${EEAT_PW}' < /tmp/_phase2b_audit_seed.sql 2>&1 | tail -40`);
    console.log('--- DB audit seed OUTPUT ---');
    console.log(out.trim());

    console.log('✅ Phase 2b W3: Seed 5 mock research_audit rows team 90001 complete');
  } finally {
    try { await conn.close(); } catch {}
  }
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
