// EEAT Studio V2 · Settings tRPC Router (SA §4.2 G0.7 C: LLM API keys encrypted)
// Encryption: AES-256-GCM (authenticated encryption) — NO plaintext keys in DB or logs
// Phase 2 migration: replaced in-memory _settingsMap → MySQL settings table per team.
import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { protectedProcedure, adminProcedure, TRPCError, type ProtectedCtx } from '../_core/middleware/rbac.js';
import { ENV, IS_DEV } from '../_core/env.js';
import * as crypto from 'node:crypto';
import { db } from '../../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { settings as settingsTable, users, teamMembers, researchAudit } from '../../db/schema.js';
import { userTeamIds, assertTeamAccess } from './_projectAccess.js';

export const LLM_PROVIDERS = ['openrouter','openai','anthropic','google'] as const;
export const SERP_PROVIDERS_SETTINGS = ['dataforseo','serper'] as const;
type LLMProvider = typeof LLM_PROVIDERS[number];
type SerpProvider = typeof SERP_PROVIDERS_SETTINGS[number];

// ── AES-256-GCM Encryption Helpers ──────────────────────────────
function getEncryptionKey(): Buffer {
  const secret = ENV.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('[SETTINGS] SESSION_SECRET must be ≥ 32 chars for AES-256-GCM encryption.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptValue(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    enc.toString('base64url'),
  ].join('.');
}

export function decryptValue(encrypted: string): string {
  try {
    const [ivB64, tagB64, ctB64] = encrypted.split('.');
    if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed encrypted value');
    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const ct = Buffer.from(ctB64, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
    return dec.toString('utf8');
  } catch (e: any) {
    throw new Error(`Decrypt failed: ${String(e?.message ?? e).slice(0, 100)}`);
  }
}

export function safeDecrypt(encrypted: string | null | undefined): { ok: true; val: string } | { ok: false; val: '' } {
  if (!encrypted || typeof encrypted !== 'string' || encrypted.length < 8) return { ok: false, val: '' };
  try {
    const out = decryptValue(encrypted);
    return { ok: true, val: out };
  } catch {
    return { ok: false, val: '' };
  }
}

function maskKey(k: string): string {
  if (!k) return '';
  if (k.length <= 8) return k.slice(0, 2) + '****';
  return k.slice(0, 4) + '****' + k.slice(-4);
}

function newTraceId(): string {
  return crypto.randomUUID();
}

/**
 * Resolve effective team for settings:
 *  - Admin user → return their default team (any owner/admin team).
 *  - Writer → must act on explicit team via context (userTeamIds).
 */
export async function resolveTeamIdForSettings(ctx: any): Promise<number> {
  const openId = ctx.session.openId;
  const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.googleOpenId, openId)).limit(1);
  if (!userRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
  const rows = await db.select({ teamId: teamMembers.teamId, permission: teamMembers.permission })
    .from(teamMembers).where(eq(teamMembers.userId, userRow.id));
  if (rows.length === 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'User is not a member of any team.' });
  }
  const ownerAdmin = rows.find(r => r.permission === 'owner' || r.permission === 'admin');
  return Number((ownerAdmin ?? rows[0]).teamId);
}

const BILLING_KEY = 'billing_limit_usd' as const;
type ExtraMeta = { c?: string; l?: string; bl?: number | null };

function readExtra(map: Map<string, string>): { countryCode: string; langCode: string; billingLimitUsd: number | null } {
  const raw = map.get(BILLING_KEY);
  const fallback = { countryCode: 'TH', langCode: 'th', billingLimitUsd: null as number | null };
  if (!raw) return fallback;
  const s = safeDecrypt(raw);
  if (!s.ok) return fallback;
  try {
    const j = JSON.parse(s.val) as ExtraMeta & any;
    return {
      countryCode: typeof j?.c === 'string' && /^[A-Z]{2}$/i.test(j.c) ? j.c.toUpperCase() : 'TH',
      langCode: typeof j?.l === 'string' && j.l.length >= 2 && j.l.length <= 10 ? j.l.toLowerCase() : 'th',
      billingLimitUsd: (typeof j?.bl === 'number' && Number.isFinite(j.bl)) ? j.bl : null,
    };
  } catch {
    // Legacy: numeric billing_limit plaintext / encrypted JSON failed → fallback
    if (s.val && /^-?\d+(\.\d+)?$/.test(s.val.trim())) {
      return { ...fallback, billingLimitUsd: Number(s.val.trim()) };
    }
    return fallback;
  }
}

function encodeExtra(countryCode: string, langCode: string, bl?: number | null): string {
  const out: ExtraMeta & any = { c: (countryCode || 'TH').toUpperCase(), l: (langCode || 'th').toLowerCase() };
  if (typeof bl === 'number' && Number.isFinite(bl)) out.bl = bl;
  return JSON.stringify(out);
}

async function loadSettingsForTeam(teamId: number) {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.teamId, teamId));
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.keyName, r.value);

  const badKeys: string[] = [];
  for (const [k, v] of map.entries()) {
    const s = safeDecrypt(v);
    if (!s.ok) badKeys.push(k);
  }
  if (badKeys.length) {
    for (const k of badKeys) map.delete(k);
    try { await db.delete(settingsTable).where(and(eq(settingsTable.teamId, teamId), inArray(settingsTable.keyName, badKeys as any))); } catch {}
  }

  // Seed ENV defaults for missing settings on first call
  let changed = false;
  const ensure = (key: string, val: string | undefined) => {
    if (val && val.length && !val.startsWith('__FILL_IN__') && !map.has(key)) {
      map.set(key, encryptValue(val));
      changed = true;
    }
  };
  ensure('llm_provider', ENV.LLM_PROVIDER);
  ensure('llm_api_key', ENV.LLM_API_KEY);
  ensure('serp_provider', ENV.SERP_PROVIDER);
  ensure('serp_api_key', ENV.SERP_API_KEY);
  if (changed) {
    const insert: any[] = [];
    for (const [k, v] of map.entries()) {
      // Only seed ones that weren't present
      if (!rows.find(r => r.keyName === k)) {
        insert.push({ teamId, keyName: k, value: v });
      }
    }
    if (insert.length) {
      try { await db.insert(settingsTable).values(insert); } catch(e:any) { /* race cond ignore */ }
    }
  }
  return map;
}

async function upsertSetting(teamId: number, keyName: string, encryptedValue: string) {
  await db.insert(settingsTable)
    .values({ teamId, keyName: keyName as any, value: encryptedValue })
    .onDuplicateKeyUpdate({ set: { value: encryptedValue } });
}

async function pingProvider(provider: string, apiKey: string, kind: 'llm'|'serp'): Promise<{ ok: boolean; msg: string; latencyMs: number }> {
  const start = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    let url = '';
    let headers: Record<string, string> = {};
    let body: any;
    let method: 'GET'|'POST' = 'GET';
    if (kind === 'llm') {
      if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/models';
        headers = { Authorization: `Bearer ${apiKey}` };
      } else if (provider === 'openai') {
        url = 'https://api.openai.com/v1/models';
        headers = { Authorization: `Bearer ${apiKey}` };
      } else if (provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages';
        headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type':'application/json' };
        method = 'POST'; body = { model: 'claude-3-opus-20240229', max_tokens:1, messages: [] };
      } else if (provider === 'google') {
        url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`;
      }
    } else {
      // serp
      if (provider === 'dataforseo') {
        const parts = apiKey.split(':');
        if (parts.length < 2) return { ok: false, msg: 'DataForSEO key format expects "login:password"', latencyMs: Date.now()-start };
        const basic = Buffer.from(`${parts[0]}:${parts.slice(1).join(':')}`).toString('base64');
        url = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
        headers = { Authorization: `Basic ${basic}`, 'content-type':'application/json' };
        method = 'POST';
        body = [{ target: 'apple.com', language_code: 'en', location_code: 2840, priority: 1 }];
      } else if (provider === 'serper') {
        url = 'https://google.serper.dev/search';
        headers = { 'X-API-KEY': apiKey, 'content-type':'application/json' };
        method = 'POST'; body = { q: 'apple' };
      }
    }
    const opts: RequestInit = { method, headers, signal: ctrl.signal };
    if (method === 'POST') opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const latencyMs = Date.now() - start;
    // 400/401/422 check. For most invalid keys = 401. 400 for empty body = still authed (anthropic).
    if (r.status === 401 || r.status === 403) return { ok: false, msg: `${provider} key invalid (HTTP ${r.status})`, latencyMs };
    if (r.status >= 500) return { ok: false, msg: `${provider} server error (HTTP ${r.status})`, latencyMs };
    return { ok: true, msg: `${provider} ping OK (HTTP ${r.status})`, latencyMs };
  } catch (e: any) {
    return { ok: false, msg: kind === 'llm' ? 'LLM ping failed: ' + String(e?.message ?? e).slice(0, 80) : 'SERP ping failed: ' + String(e?.message ?? e).slice(0, 80), latencyMs: Date.now() - start };
  } finally {
    clearTimeout(to);
  }
}

export type TeamSettingsResolved = {
  teamId: number;
  llmProvider: LLMProvider;
  llmApiKey: string;
  serpProvider: SerpProvider;
  serpApiKey: string;
  countryCode: string;
  langCode: string;
};

export async function resolveTeamSettings(ctx: any): Promise<TeamSettingsResolved> {
  const teamId = await resolveTeamIdForSettings(ctx);
  const map = await loadSettingsForTeam(teamId);
  const dec = (k: string, fallback='') => {
    const enc = map.get(k); if (!enc) return fallback;
    return safeDecrypt(enc).val || fallback;
  };
  const extra = readExtra(map);
  return {
    teamId,
    llmProvider: (dec('llm_provider', ENV.LLM_PROVIDER) as LLMProvider) || 'openrouter',
    llmApiKey: dec('llm_api_key', ENV.LLM_API_KEY ?? ''),
    serpProvider: (dec('serp_provider', ENV.SERP_PROVIDER) as SerpProvider) || 'dataforseo',
    serpApiKey: dec('serp_api_key', ENV.SERP_API_KEY ?? ''),
    countryCode: extra.countryCode,
    langCode: extra.langCode,
  } as TeamSettingsResolved;
}

export async function insertAudit(params: {
  teamId: number;
  provider: 'llm'|'serp';
  endpointName: string;
  providerModel?: string;
  tokensIn?: number;
  tokensOut?: number;
  rowsReturned?: number;
  usdCostEst?: number;
  keywordId?: number;
}) {
  const traceId = newTraceId();
  await db.insert(researchAudit).values({
    teamId: params.teamId,
    provider: params.provider,
    endpointName: params.endpointName,
    providerModel: params.providerModel,
    tokensIn: params.tokensIn,
    tokensOut: params.tokensOut,
    rowsReturned: params.rowsReturned,
    usdCostEst: String(params.usdCostEst ?? 0),
    traceId,
    keywordId: params.keywordId,
  });
  return traceId;
}

// ── Router ──────────────────────────────────────────────────────
export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    try {
      const teamId = await resolveTeamIdForSettings(ctx);
      const map = await loadSettingsForTeam(teamId);
      const dec = (k: string) => map.has(k) ? safeDecrypt(map.get(k)!).val : '';
      const extra = readExtra(map);
      const llmProvider = dec('llm_provider') || ENV.LLM_PROVIDER;
      const serpProvider = dec('serp_provider') || ENV.SERP_PROVIDER;
      const llmKey = dec('llm_api_key');
      const serpKey = dec('serp_api_key');
      const countryCode = extra.countryCode;
      const langCode = extra.langCode;
      return {
        ok: true,
        teamId,
        settings: {
          llmProvider,
          llmApiKeyMasked: maskKey(llmKey),
          hasLlmApiKey: !!llmKey,
          serpProvider,
          serpApiKeyMasked: maskKey(serpKey),
          hasSerpApiKey: !!serpKey,
          hasBothKeys: !!llmKey && !!serpKey,
          countryCode,
          langCode,
        },
      };
    } catch (e: any) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to get settings: ${String(e?.message ?? e).slice(0, 150)}` });
    }
  }),

  save: adminProcedure
    .input(z.object({
      teamId: z.coerce.number().int().positive().optional(),
      llmProvider: z.enum(LLM_PROVIDERS).default('openrouter'),
      llmApiKey: z.string().default(''),
      serpProvider: z.enum(SERP_PROVIDERS_SETTINGS).default('dataforseo'),
      serpApiKey: z.string().optional().default(''),
      validatePing: z.boolean().default(true),
      countryCode: z.string().length(2, 'countryCode ต้อง 2 อักษร เช่น TH/US').default('TH'),
      langCode: z.string().min(2, 'langCode min 2 อักษร').max(10, 'langCode max 10 อักษร').default('th'),
    }))
    .mutation(async ({ input, ctx }) => {
      const traceId = newTraceId();
      try {
        let teamId = input.teamId;
        if (!teamId) teamId = await resolveTeamIdForSettings(ctx);
        await assertTeamAccess(ctx, teamId, { minRole: 'admin' }, TRPCError);

        // Load existing keys BEFORE deciding to ping/overwrite (B1 CRITICAL FIX: allow edit country only without re-pasting keys)
        const existing = await loadSettingsForTeam(teamId);
        const hasExistingLlm = !!(existing.get('llm_api_key') && safeDecrypt(existing.get('llm_api_key')).ok);
        const hasExistingSerp = !!(existing.get('serp_api_key') && safeDecrypt(existing.get('serp_api_key')).ok);

        const useNewLlmKey = (typeof input.llmApiKey === 'string' && input.llmApiKey.trim().length >= 10);
        const useNewSerpKey = (typeof input.serpApiKey === 'string' && input.serpApiKey.trim().length >= 10);

        // VALIDATE: require at least existing OR new llm key (llm always required — pipeline cannot run without)
        if (!useNewLlmKey && !hasExistingLlm) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `[LLM_API_KEY_REQUIRED] ต้องระบุ LLM API Key อย่างน้อยครั้งแรก (min 10 ตัวอักษร)`, cause: { traceId, retryable: false } as any });
        }

        if (input.validatePing) {
          if (useNewLlmKey) {
            const pingLlm = await pingProvider(input.llmProvider, input.llmApiKey.trim(), 'llm');
            if (!pingLlm.ok) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: `[LLM_AUTH_INVALID] ${pingLlm.msg}`, cause: { traceId, retryable: false } as any });
            }
          }
          if (useNewSerpKey) {
            const pingSerp = await pingProvider(input.serpProvider, input.serpApiKey!.trim(), 'serp');
            if (!pingSerp.ok) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: `[SERP_AUTH_INVALID] ${pingSerp.msg}`, cause: { traceId, retryable: false } as any });
            }
          }
        }

        // Always upsert providers + store country/lang inside billing_limit_usd (only allowed enum key 0 ALTER rule)
        const encProv = encryptValue(input.llmProvider);
        const encSerpProv = encryptValue(input.serpProvider);
        const extraPrev = readExtra(existing);
        const encExtra = encryptValue(encodeExtra(input.countryCode, input.langCode, extraPrev.billingLimitUsd));

        await upsertSetting(teamId, 'llm_provider', encProv);
        // Only upsert NEW llm if provided (otherwise preserve existing — B1 fix)
        let encLlm;
        if (useNewLlmKey) {
          encLlm = encryptValue(input.llmApiKey.trim());
          await upsertSetting(teamId, 'llm_api_key', encLlm);
        } else {
          encLlm = existing.get('llm_api_key')!;
        }
        await upsertSetting(teamId, 'serp_provider', encSerpProv);
        // Only upsert NEW serp if provided (if empty keep existing — B1 fix)
        if (useNewSerpKey && input.serpApiKey) {
          const encSerp = encryptValue(input.serpApiKey.trim());
          await upsertSetting(teamId, 'serp_api_key', encSerp);
        }
        await upsertSetting(teamId, BILLING_KEY, encExtra);

        // Roundtrip verify NEW llm only if upserted
        if (useNewLlmKey) {
          const decCheck = safeDecrypt(encLlm!);
          if (!decCheck.ok || decCheck.val !== input.llmApiKey.trim()) {
            throw new Error('Encrypt/decrypt roundtrip verification FAILED.');
          }
        }

        return {
          ok: true,
          saved: true,
          traceId,
          teamId,
          keys: {
            llmProvider: input.llmProvider,
            hasLlmApiKey: useNewLlmKey || hasExistingLlm,
            serpProvider: input.serpProvider,
            hasSerpApiKey: useNewSerpKey || hasExistingSerp,
            countryCode: input.countryCode,
            langCode: input.langCode,
          },
          encryptedWith: 'AES-256-GCM',
          keysUpdated: {
            llmApiKey: useNewLlmKey,
            serpApiKey: useNewSerpKey,
          },
        };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `[trace ${traceId}] Save settings failed: ${String(e?.message ?? e).slice(0, 150)}`, cause: { traceId, retryable: false } as any });
      }
    }),

  resetKey: adminProcedure
    .input(z.object({ teamId: z.coerce.number().int().positive().optional(), keyType: z.enum(['llm','serp']) }))
    .mutation(async ({ input, ctx }) => {
      let teamId = input.teamId;
      if (!teamId) teamId = await resolveTeamIdForSettings(ctx);
      await assertTeamAccess(ctx, teamId, { minRole: 'admin' }, TRPCError);
      const deletes = (input.keyType === 'llm'
        ? ['llm_provider', 'llm_api_key']
        : ['serp_provider', 'serp_api_key']) as Array<'llm_provider'|'llm_api_key'|'serp_provider'|'serp_api_key'|'billing_limit_usd'>;
      await db.delete(settingsTable).where(and(eq(settingsTable.teamId, teamId), inArray(settingsTable.keyName, deletes)));
      return { ok: true, deleted: deletes, teamId };
    }),

  getBillingWindow: adminProcedure
    .input(z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int().min(2024).max(2099) }))
    .query(async ({ input, ctx }) => {
      let teamId: number|undefined;
      try { teamId = await resolveTeamIdForSettings(ctx); } catch { throw new TRPCError({ code: 'FORBIDDEN', message: 'Team required.' }); }
      // Pull rows, group in JS to avoid strict date SQL compat
      const rows = await db.select().from(researchAudit).where(eq(researchAudit.teamId, teamId));
      const inMonth = rows.filter(r => {
        const d = new Date(r.createdAt as any);
        return d.getUTCMonth() + 1 === input.month && d.getUTCFullYear() === input.year;
      });
      let llmCalls = 0, llmIn = 0, llmOut = 0, llmUsd = 0;
      let serpCalls = 0, serpRows = 0, serpUsd = 0;
      for (const r of inMonth) {
        if (r.provider === 'llm') {
          llmCalls++; llmIn += Number(r.tokensIn ?? 0); llmOut += Number(r.tokensOut ?? 0); llmUsd += Number(r.usdCostEst ?? 0);
        } else {
          serpCalls++; serpRows += Number(r.rowsReturned ?? 0); serpUsd += Number(r.usdCostEst ?? 0);
        }
      }
      return {
        ok: true,
        month: input.month, year: input.year,
        llm_calls_count: llmCalls, llm_tokens_in: llmIn, llm_tokens_out: llmOut, llm_usd_total: +llmUsd.toFixed(6),
        serp_calls_count: serpCalls, serp_rows_returned: serpRows, serp_usd_total: +serpUsd.toFixed(6),
        grand_total_usd: +(llmUsd + serpUsd).toFixed(6),
        total_calls: inMonth.length,
      };
    }),

  pingCurrent: adminProcedure
    .input(z.object({ teamId: z.coerce.number().int().positive().optional(), kind: z.enum(['llm','serp','both']).default('both') }))
    .query(async ({ input, ctx }) => {
      let teamId = input.teamId;
      if (!teamId) teamId = await resolveTeamIdForSettings(ctx);
      await assertTeamAccess(ctx, teamId, { minRole: 'admin' }, TRPCError);
      const existing = await loadSettingsForTeam(teamId);
      const llmProvider = existing.get('llm_provider') ? (safeDecrypt(existing.get('llm_provider')).val || 'openrouter') : 'openrouter';
      const serpProvider = existing.get('serp_provider') ? (safeDecrypt(existing.get('serp_provider')).val || 'dataforseo') : 'dataforseo';
      const llmKeyRaw = existing.get('llm_api_key');
      const serpKeyRaw = existing.get('serp_api_key');
      const llmKey = llmKeyRaw ? safeDecrypt(llmKeyRaw).val : '';
      const serpKey = serpKeyRaw ? safeDecrypt(serpKeyRaw).val : '';
      const res: any = { ok: true, teamId, llm: null as any, serp: null as any };
      if (input.kind === 'llm' || input.kind === 'both') {
        if (!llmKey || llmKey.trim().length < 10) {
          res.llm = { ok: false, msg: 'LLM Key ยังไม่ได้บันทึก (ต้อง ≥ 10 ตัวอักษร)', latencyMs: 0, provider: llmProvider };
        } else {
          const ping = await pingProvider(llmProvider, llmKey.trim(), 'llm');
          res.llm = { ...ping, provider: llmProvider };
        }
      }
      if (input.kind === 'serp' || input.kind === 'both') {
        if (!serpKey || serpKey.trim().length < 10) {
          res.serp = { ok: false, msg: 'SERP Key ยังไม่ได้บันทึก (ต้อง ≥ 10 ตัวอักษร)', latencyMs: 0, provider: serpProvider };
        } else {
          const ping = await pingProvider(serpProvider, serpKey.trim(), 'serp');
          res.serp = { ...ping, provider: serpProvider };
        }
      }
      return res;
    }),
});

export default settingsRouter;
