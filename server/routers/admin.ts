// EEAT Studio V2 · Admin tRPC Router — Phase 3 Admin Audit (RBAC admin ONLY)
// 5 Procedures: getOverview | getProjectsEEAT | getSettingsMasked | getLlmUsageBars | exportCSV (UTF-8 BOM \uFEFF)
// ALL procedures gated by minRole='admin'; writer/member roles throw UNAUTHORIZED.
import { z } from 'zod';
import * as crypto from 'node:crypto';
import { router } from '../_core/trpc.js';
import { adminProcedure, TRPCError } from '../_core/middleware/rbac.js';
import { eq, and, desc, gt, sql, sum, count, avg } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  users, teams, teamMembers, projects, categories, articles, writeArticles,
  settings, researchAudit, keywords,
} from '../../db/schema.js';

const ADMIN_PROCEDURES_AUDIT = 5;

function maskKey(plaintext: string, first4 = 4, last4 = 4): string {
  const s = String(plaintext || '').trim();
  if (s.length <= first4 + last4 + 2) return s.slice(0, first4) + '*'.repeat(Math.max(2, s.length - first4));
  return s.slice(0, first4) + '*'.repeat(8) + s.slice(-last4);
}
function aesDecryptSettingsValue(encryptedBlob: string, sessionSecret: string): string | null {
  try {
    const parts = String(encryptedBlob || '').split('.');
    if (parts.length < 3) return null;
    const [ivB64, tagB64, ctB64] = parts;
    const key = crypto.createHash('sha256').update(String(sessionSecret || '')).digest();
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const ct = Buffer.from(ctB64, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
    return dec.toString('utf8');
  } catch { return null; }
}
async function settingsMaskedRow(teamId: number, keyName: any, displayName: string, opts?: { isProvider?: boolean, pingSerp?: boolean }) {
  const [row] = await db.select({ value: settings.value }).from(settings).where(and(eq(settings.teamId, teamId), eq(settings.keyName as any, String(keyName)))).limit(1);
  const sessionSecret = String(process.env.SESSION_SECRET || '');
  let plain: string | null = null;
  if (row?.value) {
    if (opts?.isProvider) { plain = row.value; }
    else if (sessionSecret) { plain = aesDecryptSettingsValue(row.value, sessionSecret); }
  }
  if (!plain || !plain.length) return { provider: displayName, masked: '-', status: '⚠️ Not set', calls: '0 calls' };
  const masked = opts?.isProvider ? String(plain).slice(0, 64) : maskKey(plain);
  let status = '✅ Active', calls = '';
  if (opts?.pingSerp && keyName === 'serp_api_key') {
    try {
      const r = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': plain, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'สล็อตออนไลน์', gl: 'th', hl: 'th', num: 1 }),
        signal: AbortSignal.timeout(9000),
      });
      status = r.status === 200 ? '✅ Active' : (r.status === 403 ? '⚠️ 403 Revoked' : `⚠️ HTTP ${r.status}`);
      calls = r.status === 200 ? 'verified HTTP 200' : `HTTP ${r.status}`;
    } catch (e: any) { status = '⚠️ Network fail'; calls = String(e?.message || e).slice(0, 24); }
  }
  return { provider: displayName, masked, status, calls };
}

function utf8Bom(text: string): string { return '\uFEFF' + String(text || ''); }
function csvEscape(v: any): string {
  const s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/[",;\t]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const adminRouter = router({
  /**
   * admin.getOverview — 4 KPI card numbers + role breakdowns
   * permission: admin ONLY
   */
  getOverview: adminProcedure.query(async ({ ctx }) => {
    const [usersCount, teamsCount, projectsCount, articlesCount] = await Promise.all([
      db.select({ n: count(users.id) }).from(users),
      db.select({ n: count(teams.id) }).from(teams),
      db.select({ n: count(projects.id) }).from(projects),
      db.select({ n: count(articles.id) }).from(articles),
    ]);
    const [draftArts, pubArts] = await Promise.all([
      db.select({ n: count(articles.id) }).from(articles).where(eq(articles.status, 'draft')),
      db.select({ n: count(articles.id) }).from(articles).where(eq(articles.status, 'published')),
    ]);
    const [waDraft, waRunning, waDone, waFail] = await Promise.all([
      db.select({ n: count(writeArticles.id) }).from(writeArticles).where(eq(writeArticles.stepStatus, 'pending')),
      db.select({ n: count(writeArticles.id) }).from(writeArticles).where(eq(writeArticles.stepStatus, 'running')),
      db.select({ n: count(writeArticles.id) }).from(writeArticles).where(eq(writeArticles.stepStatus, 'done')),
      db.select({ n: count(writeArticles.id) }).from(writeArticles).where(eq(writeArticles.stepStatus, 'fail')),
    ]);
    const [adminTm, memberTm] = await Promise.all([
      db.select({ n: count(teamMembers.id) }).from(teamMembers).where(eq(teamMembers.permission, 'admin')),
      db.select({ n: count(teamMembers.id) }).from(teamMembers).where(eq(teamMembers.permission, 'member')),
    ]);
    const n = (r: any[]) => Number(r?.[0]?.n || 0);
    return {
      ok: true,
      usersTotal: n(usersCount),
      teamsTotal: n(teamsCount),
      projectsTotal: n(projectsCount),
      articlesTotal: n(articlesCount),
      articlesDraft: n(draftArts),
      articlesPublished: n(pubArts),
      writePending: n(waDraft),
      writeRunning: n(waRunning),
      writeDone: n(waDone),
      writeFail: n(waFail),
      adminsTotal: n(adminTm),
      membersTotal: n(memberTm),
    };
  }),

  /**
   * admin.getProjectsEEAT — avg eeat_score grouped by project, keyword counts, article counts, YMYL flag
   * permission: admin ONLY
   */
  getProjectsEEAT: adminProcedure.query(async ({ ctx }) => {
    const projs = await db.select({
      id: projects.id, name: projects.name, mainKeyword: projects.mainKeyword,
      categoryId: projects.categoryId,
    }).from(projects).orderBy(desc(projects.id));
    const out: any[] = [];
    for (const p of projs) {
      const cat = p.categoryId ? (await db.select({ nm: categories.name, isYmyl: categories.isYmyl }).from(categories).where(eq(categories.id, Number(p.categoryId))).limit(1)).at(0) : null;
      const [kwsRow, artsRow] = await Promise.all([
        db.select({ n: count(keywords.id) }).from(keywords).where(eq(keywords.projectId, Number(p.id))).limit(1),
        db.select({ n: count(articles.id) }).from(articles).where(eq(articles.projectId, Number(p.id))).limit(1),
      ]);
      const kwsCnt = Number(kwsRow.at(0)?.n || 0);
      const artsCnt = Number(artsRow.at(0)?.n || 0);
      const eeatRows = await db.select({ s: writeArticles.eeatScore }).from(writeArticles).innerJoin(articles, eq(writeArticles.articleId, articles.id)).where(eq(articles.projectId, Number(p.id)));
      const scores = eeatRows.map(r => Number(r.s ?? 0)).filter(x => Number.isFinite(x) && x > 0);
      const eeatAvg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      let status = '✅ สมบูรณ์';
      if (cat?.isYmyl && eeatAvg < 80) status = '⚠️ ตรวจสอบ YMYL';
      else if (!scores.length) status = '📝 ในเซส';
      out.push({
        projectId: Number(p.id), name: String(p.name || '').slice(0, 255), mainKeyword: String(p.mainKeyword || ''),
        categoryName: cat?.nm || '(ไม่ระบุ)', eeatAvg, keywordsCount: Number(kwsCnt), articlesCount: Number(artsCnt),
        ymylFlag: !!cat?.isYmyl, statusLabel: status,
      });
    }
    return { ok: true, items: out, count: out.length };
  }),

  /**
   * admin.getSettingsMasked — AES decrypt all provider API keys, show first4****last4 mask, Serper live ping status
   * permission: admin ONLY
   */
  getSettingsMasked: adminProcedure.query(async ({ ctx }) => {
    // WO-CORE-2569-003 RBAC-02: adminProcedure already enforced above;
    // consistent fallback teamId resolver considers ctx.authMeta.role too (Phase 0 + Phase 1 coverage)
    const isAdmin = (ctx.user?.role === 'admin') || ((ctx as any).authMeta?.role === 'admin');
    const teamId = Number((ctx as any)?.teamId ?? (isAdmin ? 90001 : 0));
    const [llmProv, llmKey, serpProv, serpKey] = await Promise.all([
      settingsMaskedRow(teamId, 'llm_provider', 'LLM Provider', { isProvider: true }),
      settingsMaskedRow(teamId, 'llm_api_key', 'OpenRouter LLM API Key'),
      settingsMaskedRow(teamId, 'serp_provider', 'SERP Provider', { isProvider: true }),
      settingsMaskedRow(teamId, 'serp_api_key', 'Serper SERP API Key', { pingSerp: true }),
    ]);
    return { ok: true, items: [llmProv, llmKey, serpProv, serpKey] };
  }),

  /**
   * admin.getLlmUsageBars — 7 day window sum(usd_cost_est) grouped by provider_model; budgetUsd hardcoded $200 (configurable)
   * permission: admin ONLY
   */
  getLlmUsageBars: adminProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 7 * 86400_000);
    const rows = await db.select({
      model: researchAudit.providerModel, provider: researchAudit.provider,
      tokensIn: sql<number>`ifnull(sum(${researchAudit.tokensIn}),0)`,
      tokensOut: sql<number>`ifnull(sum(${researchAudit.tokensOut}),0)`,
      usd: sql<number>`ifnull(sum(${researchAudit.usdCostEst}),0)`,
    }).from(researchAudit).where(gt(researchAudit.createdAt, since)).groupBy(researchAudit.providerModel, researchAudit.provider);
    let totalUsedUsd = 0;
    const withTotals = rows.map(r => {
      const usd = Number(r.usd || 0); totalUsedUsd += usd;
      const tokens = Number(r.tokensIn || 0) + Number(r.tokensOut || 0);
      return { model: String(r.model || (r.provider === 'serp' ? 'Serper Search' : 'Unknown Model')), tokens, usd };
    }).sort((a, b) => b.tokens - a.tokens);
    const totalTokens = Math.max(1, withTotals.reduce((a, b) => a + b.tokens, 0));
    const palette = ['bg-amber-700', 'bg-emerald-700', 'bg-sky-700', 'bg-violet-700', 'bg-rose-700'];
    const bars = withTotals.map((r, i) => ({
      modelName: r.model, tokens: r.tokens,
      pct: Math.round(r.tokens / totalTokens * 100), col: palette[i % palette.length], usd: r.usd,
    }));
    const budgetUsd = 200.0;
    return { ok: true, bars, monthUsedUsd: Number(totalUsedUsd.toFixed(2)), budgetUsd };
  }),

  /**
   * admin.exportCSV — Returns string with UTF-8 BOM FIRST CHAR (\uFEFF) for Excel Thai readable.
   * Sections: (1) Audit Usage Last 500 Rows + (2) Projects EEAT + (3) KPIs overview.
   * permission: admin ONLY
   */
  exportCSV: adminProcedure.input(z.object({ section: z.enum(['all', 'usage', 'projects', 'kpis']).default('all') }).optional()).query(async ({ ctx, input }) => {
    const section = input?.section || 'all';
    let csv = '';
    const sep = ',';
    // (A) KPIs section
    if (section === 'all' || section === 'kpis') {
      const ov = await adminRouter.createCaller(ctx as any).getOverview();
      csv += '# Admin Audit — KPIs Overview\n';
      csv += csvEscape('Metric') + sep + csvEscape('ค่า') + sep + csvEscape('คำอธิบาย') + '\n';
      const kpiRows: [string, any, string][] = [
        ['ผู้ใช้ทั้งหมด (Users)', ov.usersTotal, 'registered users'],
        ['ทีมงาน (Teams)', ov.teamsTotal, 'workspace teams'],
        ['โปรเจกต์ (Projects)', ov.projectsTotal, 'active projects'],
        ['บทความทั้งหมด (Articles)', ov.articlesTotal, 'draft+published'],
        ['บทความ Draft', ov.articlesDraft, 'status=draft'],
        ['บทความ Published', ov.articlesPublished, 'status=published'],
        ['Write Pending', ov.writePending, 'step_status=pending'],
        ['Write Running', ov.writeRunning, 'step_status=running'],
        ['Write Done', ov.writeDone, 'step_status=done'],
        ['Write Error', ov.writeFail, 'step_status=fail'],
        ['Admins', ov.adminsTotal, 'permission=admin'],
        ['Members', ov.membersTotal, 'permission=member'],
      ];
      for (const row of kpiRows) csv += csvEscape(row[0]) + sep + csvEscape(String(row[1])) + sep + csvEscape(row[2]) + '\n';
      csv += '\n';
    }
    // (B) Projects EEAT section
    if (section === 'all' || section === 'projects') {
      const pr = await adminRouter.createCaller(ctx as any).getProjectsEEAT();
      csv += '# Projects EEAT ค่าเฉลี่ย\n';
      csv += ['Project ID', 'โปรเจกต์', 'หมวดหมู่', 'YMYL', 'EEAT Avg', 'Keywords', 'บทความ', 'สถานะ'].map(csvEscape).join(sep) + '\n';
      for (const p of pr.items) csv += [p.projectId, p.name, p.categoryName, p.ymylFlag ? 'Y' : 'N', p.eeatAvg, p.keywordsCount, p.articlesCount, p.statusLabel].map(csvEscape).join(sep) + '\n';
      csv += '\n';
    }
    // (C) Usage Audit last 500 rows section
    if (section === 'all' || section === 'usage') {
      const usage = await db.select({
        id: researchAudit.id, createdAt: researchAudit.createdAt, provider: researchAudit.provider,
        endpoint: researchAudit.endpointName, model: researchAudit.providerModel, tokensIn: researchAudit.tokensIn,
        tokensOut: researchAudit.tokensOut, rowsReturned: researchAudit.rowsReturned,
        usdCost: researchAudit.usdCostEst, traceId: researchAudit.traceId,
      }).from(researchAudit).orderBy(desc(researchAudit.id)).limit(500);
      csv += '# Usage Audit (LLM/SERP) Last 500 rows\n';
      csv += ['ID', 'เวลา', 'Provider', 'Endpoint', 'Model', 'Tokens In', 'Tokens Out', 'Rows', 'USD Cost', 'Trace ID'].map(csvEscape).join(sep) + '\n';
      for (const u of usage) csv += [
        u.id, String(u.createdAt || ''), String(u.provider || ''), String(u.endpoint || ''),
        String(u.model || ''), Number(u.tokensIn || 0), Number(u.tokensOut || 0), Number(u.rowsReturned || 0),
        Number(u.usdCost || 0).toFixed(6), String(u.traceId || ''),
      ].map(csvEscape).join(sep) + '\n';
      csv += '\n';
    }
    return { ok: true, csvBom: utf8Bom(csv), rowCount: csv.split('\n').length };
  }),

});

export default adminRouter;
