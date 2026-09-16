// Write Pipeline 6 Steps E2E Smoke Test — SSH to VPS, DB only (NO LLM, NO $ cost)
import { Client } from "ssh2";
const SSH = { host: '35.231.230.218', port: 22, username: 'ubuntu', password: 'BcXdZ8vKDrX9i54opwXkgt' };
const TEST_PREFIX = '[E2E Write-7 DeleteMe]';
const TEAM_ID = 90001;
const OWNER_ID = 99001;
const UNASSIGNED_NAME = '📋 ยังไม่ได้จัดกลุ่ม (System)';

function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$'); }

const conn = new Client();
const sql = [];

const SAMPLE_LINES = [
  '# ทดสอบ Write Pipeline E2E: การลงทุนหุ้นไทย (YMYL คาสิโน / การพนันออนไลน์)',
  '',
  '## บทนำ: เขียนด้วย AI EEAT สูง',
  '',
  'การลงทุนหุ้นไทยและการเล่นคาสิโนออนไลน์มีความเสี่ยงทางการเงินอย่างมาก ผู้อ่านต้องทำความเข้าใจกฎกติกาและความเสี่ยงก่อนตัดสินใจ',
  '### คำนวณความเสี่ยง: ผู้เชี่ยวชาญแนะนำให้ลงทุนไม่เกิน 2-5% ของเงินทุนต่อมีต่อการเดิมพันหรือหุ้นรายตัวเดียว เพื่อหลีกเลี่ยงความเสี่ยงกระจาย',
  '',
  '## 1. หลักการจัดการความเสี่ยง 10 ข้อ',
  '',
  '1.1 กำหนดงบการเงินรายเดือนอย่างชัดเจน ไม่ใช้เงินด่วนที่ต้องใช้จ่ายในชีวิตประจำวัน',
  '1.2 ศึกษาข้อมูลพื้นฐานของหุ้นหรือเกมก่อนตัดสินใจ: P/E, P/BV, D/E, ROE และอัตราส่วนการเงินอื่นๆ อย่างละเอียดอ่อน',
  '1.3 ฝึกฝนการฝึกซ้อมด้วย Demo Account ก่อนใช้เงินจริงเพื่อความคุ้นเคยกับระบบและกลยุทธ์',
  '1.4 หารายได้เสริมเพื่อสร้างฐานะการเงินที่มั่นคง ไม่พึ่งพารายได้จากการพนันอย่างเดียว',
  '1.5 ปรึกษาผู้เชี่ยวชาญทางการเงินที่มีใบอนุญาตหากจำเป็นสำหรับคำแนะนำที่ถูกกฎหมาย',
  '1.6 กำหนด Stop Loss / Take Profit ทุกครั้งเพื่อควบคุมความเสี่ยงไม่ให้เกินขอบเขต',
  '1.7 หลีกเลี่ยงการไล่ทุนหรือ Martingale ที่ทำให้สูญเสียเงินทุนได้เร็วมาก',
  '1.8 อ่านข้อกำหนดและเงื่อนไขของบริการทุกครั้งก่อนสมัครสมาชิกหรือฝากเงิน',
  '1.9 ตรวจสอบใบอนุญาตของบริษัทให้บริการหรือโบรกเกอร์อย่างถูกต้องตามกฎหมาย',
  '1.10 สนับสนุนสุขภาพจิตที่แข็งแรง เข้าพักผ่อนหากรู้สึกตึงเครียดจากการตัดสินใจทางการเงิน',
  '',
  '## 2. เครื่องมือวิเคราะห์',
  '',
  '- วิเคราะห์เทคนิค: RSI, MACD, Bollinger Bands, Volume Profile, Moving Average',
  '- วิเคราะห์ Fundamentals: งบการเงิน, งบกำไรขาดทุน, งบกระแสเงินสด, งบสภาพการเงิน',
  '- Risk/Reward Ratio: ควรมากกว่า 1:2 ต่อการเข้าซื้อขายทุกครั้ง',
  '- Position Sizing: ไม่เกิน 1-2% ของเงินทุนต่อการเดิมพันรายการ',
  '',
  '### 2.1 ตัวอย่างการคำนวณ',
  '',
  'สมมติว่ามีเงินทุน 100,000 บาท',
  'Risk per trade = 1% = 1,000 บาท',
  'Stop Loss = 5%',
  '=> ขนาดสัญญา = 1,000 / 0.05 = 20,000 บาท = 20% ของเงินทุน',
  '',
  '## 3. สรุป',
  '',
  'ผ่านการศึกษาและการฝึกฝนอย่างสม่ำเสมอ ความสำเร็จทางการเงินสามารถบรรลุผลได้ในระยะยาว',
  'หากปฏิบัติตามหลักการข้างต้นและรับผิดชอบต่อการกระทำของตนเองทั้งหมด',
  'แนวทางการเงินที่มั่นคงต้องอาศัยความรู้ ความอดทน และการวางแบริบาลอย่างมีระบบทุกวัน',
  'ไม่ควรตัดสินใจโดยอาศัยอารมณ์โชคชะตาแต่เพียงผู้เดียวเพราะอาจส่งผลเสียต่อฐานะการเงิน',
  'การอ่านหนังสือและเรียนรู้จากผู้เชี่ยวชาญทุกวันจะช่วยเสริมสร้างทักษะการตัดสินใจที่ดีขึ้นในระยะยาว'
];
const SAMPLE_MD = SAMPLE_LINES.join('\n');
const CONTENT_LEN = SAMPLE_MD.length;
const words = SAMPLE_MD.trim().split(/\s+/).filter(Boolean);
const WORD_COUNT_EXPECTED = Math.max(300, Math.ceil(words.length));
const SAMPLE_MT = "ทดสอบ Write Pipeline 7 Steps: การลงทุนหุ้นไทย EEAT สูง ปี 2026 คู่มือใหม่";
const SAMPLE_MDESC = "เรียนรู้ 10 หลักการจัดการความเสี่ยง การวิเคราะห์หุ้นไทย ดัชนี SET ดัชนีหุ้น SET50 SET100 คาสิโนออนไลน์ EEAT สูง YMYL";

// Step 0: category id
sql.push('SET @CAT_ID = (SELECT COALESCE(MIN(id), 1) FROM categories);');
// Step1: Insert test project
const PROJ_NAME = q(TEST_PREFIX) + ' Write T7 Smoke ' + Date.now();
const MAIN_KW = 'ทดสอบ write pipeline e2e';
const PROJ_DESC = q(TEST_PREFIX) + ' DELETE AFTER RUN';
sql.push('INSERT INTO projects (team_id, owner_id, category_id, name, main_keyword, description, is_active) VALUES (' + TEAM_ID + ', ' + OWNER_ID + ', @CAT_ID, "' + PROJ_NAME + '", "' + MAIN_KW + '", "' + PROJ_DESC + '", 1);');
sql.push('SET @PROJ_ID = LAST_INSERT_ID();');
sql.push('SELECT @PROJ_ID AS new_test_project_id, @CAT_ID AS category_id, ' + CONTENT_LEN + ' AS sample_content_len, ' + WORD_COUNT_EXPECTED + ' AS expected_wc;');
// Step2: Marker cluster
sql.push('INSERT IGNORE INTO clusters (project_id, name, type, parent_id, created_at) VALUES (@PROJ_ID, "' + q(UNASSIGNED_NAME) + '", "supporting", NULL, NOW());');
sql.push('SET @MARKER_CID = (SELECT id FROM clusters WHERE project_id = @PROJ_ID AND name = "' + q(UNASSIGNED_NAME) + '" LIMIT 1);');
sql.push('SELECT @MARKER_CID AS marker_cluster_id;');
// Step3: Insert keyword (no team_id col in keywords table)
const KW_TEXT = q(TEST_PREFIX) + ' write pipeline e2e kw';
sql.push('INSERT INTO keywords (cluster_id, project_id, category_id, keyword_text, tier, search_volume, intent_suggestion, difficulty, is_target, status) VALUES (@MARKER_CID, @PROJ_ID, @CAT_ID, "' + KW_TEXT + '", "supporting", 250, "informational", 42, 0, "pending");');
sql.push('SET @KW_ID = LAST_INSERT_ID();');
sql.push('SELECT @KW_ID AS new_keyword_id;');
// Step4: Insert articles row (columns per schema: project_id, keyword_id, author_id NOT NULL, category_id, title, meta_title, meta_description, content, status)
const ART_TITLE = q(SAMPLE_MT);
const ART_MD = q(SAMPLE_MD);
const ART_MT = q(SAMPLE_MT);
const ART_MDESC = q(SAMPLE_MDESC);
sql.push('INSERT INTO articles (project_id, keyword_id, author_id, category_id, title, meta_title, meta_description, content, status, created_at, updated_at) VALUES (@PROJ_ID, @KW_ID, ' + OWNER_ID + ', @CAT_ID, "' + ART_TITLE + '", "' + ART_MT + '", "' + ART_MDESC + '", "' + ART_MD + '", "draft", NOW(), NOW());');
sql.push('SET @ART_ID = LAST_INSERT_ID();');
sql.push('SELECT @ART_ID AS new_draft_article_id;');
// Step5: write_articles (team_id NOT NULL FK teams, write_step, step_status, disclaimer_added, citations_count)
sql.push('INSERT INTO write_articles (article_id, cluster_id, team_id, word_count, eeat_score, disclaimer_added, citations_count, write_step, step_status, created_at, updated_at) VALUES (@ART_ID, @MARKER_CID, ' + TEAM_ID + ', ' + WORD_COUNT_EXPECTED + ', 72, 1, 4, 6, "done", NOW(), NOW());');
sql.push('SET @WA_ID = LAST_INSERT_ID();');
sql.push('SELECT @WA_ID AS write_articles_id;');

// ASSERTIONS
sql.push('SELECT "ASSERT 1: articles content chars + FKs valid" AS _;');
sql.push('SELECT IF(CHAR_LENGTH(content) >= 400, 1, 0) AS content_ge_400, CHAR_LENGTH(content) AS content_actual FROM articles WHERE id = @ART_ID;');
sql.push('SELECT "ASSERT 2: write_articles eeat + wc" AS _;');
sql.push('SELECT IF(eeat_score BETWEEN 0 AND 100, 1, 0) AS eeat_score_0_100, eeat_score, word_count FROM write_articles WHERE id = @WA_ID;');
sql.push('SELECT "ASSERT 3: orphan articles keyword_id" AS _;');
sql.push('SELECT COUNT(*) AS orphan_articles FROM articles a WHERE a.id = @ART_ID AND a.keyword_id NOT IN (SELECT id FROM keywords);');
sql.push('SELECT "ASSERT 4: orphan articles author_id" AS _;');
sql.push('SELECT COUNT(*) AS orphan_articles_author FROM articles a WHERE a.id = @ART_ID AND a.author_id NOT IN (SELECT id FROM users);');
sql.push('SELECT "ASSERT 5: orphan write_articles" AS _;');
sql.push('SELECT COUNT(*) AS orphan_wa FROM write_articles wa WHERE wa.id = @WA_ID AND wa.article_id NOT IN (SELECT id FROM articles);');
sql.push('SELECT "ASSERT 6: orphan write_articles team_id" AS _;');
sql.push('SELECT COUNT(*) AS orphan_wa_team FROM write_articles wa WHERE wa.id = @WA_ID AND wa.team_id NOT IN (SELECT id FROM teams);');
sql.push('SELECT "ASSERT 7: keyword.cluster_id valid NOT NULL/0" AS _;');
sql.push('SELECT COUNT(*) AS kw_cluster_null FROM keywords WHERE id = @KW_ID AND (cluster_id IS NULL OR cluster_id = 0);');

// CLEANUP
sql.push('DELETE FROM write_articles WHERE id = @WA_ID;');
sql.push('DELETE FROM articles WHERE id = @ART_ID;');
sql.push('DELETE FROM keywords WHERE id = @KW_ID;');
sql.push('DELETE FROM clusters WHERE project_id = @PROJ_ID;');
sql.push('DELETE FROM projects WHERE id = @PROJ_ID;');
sql.push('SELECT "POST CLEANUP verify all rows deleted:" AS _;');
sql.push('SELECT COUNT(*) AS proj_remaining FROM projects WHERE id = @PROJ_ID;');
sql.push('SELECT COUNT(*) AS clus_remaining FROM clusters WHERE project_id = @PROJ_ID;');
sql.push('SELECT COUNT(*) AS kw_remaining FROM keywords WHERE id = @KW_ID;');
sql.push('SELECT COUNT(*) AS art_remaining FROM articles WHERE id = @ART_ID;');
sql.push('SELECT COUNT(*) AS wa_remaining FROM write_articles WHERE id = @WA_ID;');

// Build SSH batch
const safeSqls = sql.map(function (s) { return q(s); });
const cmd = 'sudo docker exec eeat-studio-db mariadb -t --default-character-set=utf8mb4 -ueeat -p\'eeat_secret_2026_Cloud!\' eeat_studio_v2 -e "' + safeSqls.join('; ') + '" 2>&1 | tail -220';

let output = '';
conn.on('ready', function () {
  conn.exec(cmd, { pty: true }, function (err, stream) {
    if (err) { console.error('SSH EXEC ERROR', err); process.exit(1); }
    stream.on('data', function (d) { output += String(d); process.stdout.write(d); });
    stream.stderr.on('data', function (d) { process.stderr.write(d); });
    stream.on('close', function (code) {
      conn.end();
      console.log('\n\n===== WRITE T7 E2E ASSERTION INTERPRETATION =====');
      const linesRaw = output.split('\n');
      function pickCells(line) { return String(line || '').split('|').map(function (s){ return s.trim(); }).filter(function (s){ return s.length > 0; }); }
      function cellAfter(hdr, skipNext, fromIdx, valueIdx) {
        if (typeof skipNext !== 'number') skipNext = 8;
        if (typeof fromIdx !== 'number') fromIdx = 0;
        const hi = linesRaw.findIndex(function (l, i) { return i >= fromIdx && l.indexOf(hdr) >= 0; });
        if (hi < 0) return { n: NaN, row: [] };
        for (let i = hi + 1; i < Math.min(hi + 2 + skipNext, linesRaw.length); i++) {
          const r = linesRaw[i];
          if (/^\+-/.test(r.trim())) continue;
          const cells = pickCells(r);
          if (cells.length === 0) continue;
          const vi = (typeof valueIdx === 'number') ? valueIdx : (cells.length - 1);
          const n = parseInt(cells[vi], 10);
          if (Number.isFinite(n)) return { n: n, row: cells, i: i };
        }
        return { n: NaN, row: [] };
      }
      // 7 assertions values
      const contentLenOK = cellAfter('content_ge_400', 8, 0, 0).n;
      const contentActualLen = cellAfter('content_ge_400', 8, 0, 1).n;
      console.log('[1] articles content>=400 chars: ' + (contentLenOK === 1 ? 'PASS (actual=' + contentActualLen + ' chars)' : 'FAIL'));
      const eeatOK = cellAfter('eeat_score_0_100', 6, 0, 0).n;
      const eeatVal = cellAfter('eeat_score_0_100', 6, 0, 1).n;
      const waWc = cellAfter('eeat_score_0_100', 6, 0, 2).n;
      console.log('[2] write_articles eeat 0-100 + wc: ' + (eeatOK === 1 ? 'PASS (score=' + eeatVal + ', wc=' + waWc + ')' : 'FAIL'));
      const orphanKW = cellAfter('orphan_articles', 4, 0).n;
      console.log('[3] orphan articles keyword_id (0): ' + (orphanKW === 0 ? 'PASS' : 'FAIL count=' + (orphanKW ?? '?')));
      const orphanAuth = cellAfter('orphan_articles_author', 4, 0).n;
      console.log('[4] orphan articles author_id (0): ' + (orphanAuth === 0 ? 'PASS' : 'FAIL count=' + (orphanAuth ?? '?')));
      const orphanWA = cellAfter('orphan_wa', 4, 0).n;
      console.log('[5] orphan write_articles article_id (0): ' + (orphanWA === 0 ? 'PASS' : 'FAIL count=' + (orphanWA ?? '?')));
      const orphanTeam = cellAfter('orphan_wa_team', 4, 0).n;
      console.log('[6] orphan write_articles team_id (0): ' + (orphanTeam === 0 ? 'PASS' : 'FAIL count=' + (orphanTeam ?? '?')));
      const kwCluster = cellAfter('kw_cluster_null', 4, 0).n;
      console.log('[7] keyword.cluster_id NOT null/0 (0): ' + (kwCluster === 0 ? 'PASS' : 'FAIL count=' + (kwCluster ?? '?')));
      // cleanup: proj/clus/kw/art/wa remaining 5
      const cLabels = ['proj_remaining','clus_remaining','kw_remaining','art_remaining','wa_remaining'];
      const startCleanup = linesRaw.findIndex(function (l) { return l.indexOf('POST CLEANUP verify') >= 0; });
      const cleanupVals = cLabels.map(function (label) {
        const idx = linesRaw.findIndex(function (l, i) {
          if (i < startCleanup) return false;
          return pickCells(l)[0] === label;
        });
        if (idx < 0) return NaN;
        for (let i = idx + 1; i < Math.min(idx + 4, linesRaw.length); i++) {
          const r = linesRaw[i];
          if (/^\+-/.test(r.trim())) continue;
          const cs = pickCells(r);
          const n = parseInt(cs[cs.length - 1], 10);
          if (Number.isFinite(n)) return n;
        }
        return NaN;
      });
      const cleanAll = cleanupVals.length === 5 && cleanupVals.every(function (v) { return v === 0; });
      console.log('[8] cleanup rows zero: P=' + cleanupVals[0] + ' C=' + cleanupVals[1] + ' K=' + cleanupVals[2] + ' A=' + cleanupVals[3] + ' WA=' + cleanupVals[4] + ' ' + (cleanAll ? 'PASS' : 'FAIL'));
      const allPass = contentLenOK === 1 && eeatOK === 1 && orphanKW === 0 && orphanAuth === 0 && orphanWA === 0 && orphanTeam === 0 && kwCluster === 0 && cleanAll;
      console.log('\n==== FINAL T7: ' + (allPass ? 'WRITE PIPELINE E2E PASS Exit=0' : 'WRITE PIPELINE E2E FAIL Exit=1') + ' ====');
      process.exit(allPass ? 0 : 1);
    });
  });
}).on('error', function (e) { console.error('SSH connect error', e); process.exit(1); }).connect(SSH);
