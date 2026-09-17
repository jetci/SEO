// EEAT Studio V2 · LLM Service Layer — Multi-Provider abstraction
// Usage: LlmService class → chatStructured(system, user, zodSchema) safe parse structured JSON
// Audit: Every call insertAudit row provider='llm', endpoint_name, model, tokens_in/out usd_cost
import { z } from 'zod';
import { ENV, IS_DEV } from '../_core/env.js';
import { type ProtectedCtx } from '../_core/middleware/rbac.js';
import { resolveTeamSettings, insertAudit, type TeamSettingsResolved } from '../routers/settings.js';
import * as crypto from 'node:crypto';

export type LlmChatOpts = {
  temperature?: number;
  model?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
};

export type LlmUsage = { input_tokens: number; output_tokens: number };

export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  openrouter: 'openai/gpt-4o-mini',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-2.0-flash-exp',
};

// Approximate pricing $ per 1M tokens (in/out). Subject to update when invoice received.
export const PROVIDER_PRICING: Record<string, { in: number; out: number }> = {
  openrouter: { in: 0.07, out: 0.15 },
  openai: { in: 2.50, out: 10.00 },   // gpt-4o
  anthropic: { in: 3.00, out: 15.00 }, // opus-class
  google: { in: 0.07, out: 0.15 },
};

function approxUsd(provider: string, model: string, inTok: number, outTok: number): number {
  const p = PROVIDER_PRICING[provider] ?? PROVIDER_PRICING.openrouter;
  return (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out;
}

function countTokensApprox(text: string): number {
  // Rough token estimate: 1 token ~= 4 chars English, 1 token ~= 1.5 chars Thai/Chinese
  // heuristic: (chars / 3) ceil
  return Math.max(1, Math.ceil(text.length / 3));
}

type AdapterResult = { raw: string; usage: LlmUsage; model: string };

export class LlmService {
  private settings: TeamSettingsResolved;
  private ctx?: ProtectedCtx;

  private constructor(settings: TeamSettingsResolved, ctx?: ProtectedCtx) {
    this.settings = settings;
    this.ctx = ctx;
  }

  static async forContext(ctx: any): Promise<LlmService> {
    const s = await resolveTeamSettings(ctx);
    return new LlmService(s, ctx);
  }

  private async callAdapter(opts: Required<Pick<LlmChatOpts,'temperature'|'model'|'maxTokens'>> & { system:string; user:string; jsonMode:boolean; timeoutMs:number }): Promise<AdapterResult> {
    const provider = this.settings.llmProvider;
    const key = this.settings.llmApiKey;
    if (!key) throw new Error(`[LLM_${provider.toUpperCase()}_NO_KEY] No LLM API key stored for team.`);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), opts.timeoutMs);
    try {
      let url = '';
      let headers: Record<string,string> = { 'content-type':'application/json' };
      let body: any;

      if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${key}`;
        body = {
          model: opts.model,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          response_format: opts.jsonMode ? { type:'json_object' } : undefined,
          messages: [
            { role:'system', content: opts.system },
            { role:'user', content: opts.user },
          ],
        };
      } else if (provider === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${key}`;
        body = {
          model: opts.model, temperature: opts.temperature, max_tokens: opts.maxTokens,
          response_format: opts.jsonMode ? { type:'json_object' } : undefined,
          messages:[{role:'system',content:opts.system},{role:'user',content:opts.user}],
        };
      } else if (provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = key;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: opts.model,
          system: opts.system,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          messages:[{role:'user',content:opts.user}],
        };
      } else if (provider === 'google') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:${opts.jsonMode ? 'generateContent?alt=sse&key=' : 'generateContent?key='}${encodeURIComponent(key)}`;
        body = {
          generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens, responseMimeType: opts.jsonMode ? 'application/json' : undefined },
          contents: [{ role:'user', parts:[{ text: opts.system + '\n\n' + opts.user }] }],
        };
      }

      const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(body), signal: ac.signal });
      const text = await res.text();
      if (res.status === 401 || res.status === 403) throw new Error(`[LLM_AUTH_INVALID_${provider.toUpperCase()}] HTTP ${res.status}`);
      if (res.status === 402) throw new Error(`[LLM_CREDIT_EXHAUSTED_${provider.toUpperCase()}] HTTP 402 — LLM API key credit/billing exhausted.`);
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || res.headers.get('retry-after') || '';
        const secs = Number(retryAfter) || 0;
        throw new Error(`[LLM_RATE_LIMIT_${provider.toUpperCase()}] HTTP 429${secs > 0 ? ` (Retry-After ${secs}s)` : ''} — slow down or upgrade rate limit tier.`);
      }
      if (res.status >= 500) throw new Error(`[LLM_UPSTREAM_${provider.toUpperCase()}] HTTP ${res.status}: ${text.slice(0, 200)}`);
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`[LLM_JSON_PARSE_${provider}] upstream body not JSON. Snippet: ${text.slice(0, 200)}`); }

      let content = '';
      let usage: LlmUsage = { input_tokens:0, output_tokens:0 };
      let model = opts.model;
      if (provider === 'openrouter' || provider === 'openai') {
        model = json.model ?? model;
        usage.input_tokens = Number(json?.usage?.prompt_tokens ?? countTokensApprox(opts.system+' '+opts.user));
        usage.output_tokens = Number(json?.usage?.completion_tokens ?? countTokensApprox(json?.choices?.[0]?.message?.content ?? ''));
        content = json?.choices?.[0]?.message?.content ?? '';
      } else if (provider === 'anthropic') {
        model = json.model ?? model;
        usage.input_tokens = Number(json?.usage?.input_tokens ?? countTokensApprox(opts.system+' '+opts.user));
        usage.output_tokens = Number(json?.usage?.output_tokens ?? countTokensApprox(json?.content?.[0]?.text ?? ''));
        content = (json?.content ?? []).map((c:any) => c.text ?? '').join('\n');
      } else if (provider === 'google') {
        content = json?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text).join('\n') ?? '';
        usage.input_tokens = Number(json?.usageMetadata?.promptTokenCount ?? countTokensApprox(opts.system+' '+opts.user));
        usage.output_tokens = Number(json?.usageMetadata?.candidatesTokenCount ?? countTokensApprox(content));
      }
      return { raw: content, usage, model };
    } finally {
      clearTimeout(t);
    }
  }

  async chatRaw(system: string, user: string, inOpts: LlmChatOpts = {}): Promise<{ text:string; usage:LlmUsage; model:string }> {
    const temperature = inOpts.temperature ?? 0.2;
    const maxTokens = inOpts.maxTokens ?? 4096;
    const model = inOpts.model ?? PROVIDER_DEFAULT_MODELS[this.settings.llmProvider];
    const timeoutMs = inOpts.timeoutMs ?? 60000;
    const endpointName = inOpts.jsonMode ? 'chat.structured' : 'chat.raw';
    const MAX_ATTEMPTS = 2;
    const jitter = (baseMs: number): number => Math.max(100, Math.round(baseMs * (0.7 + Math.random() * 0.6)));
    let lastErr: any = null;
    for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const r = await this.callAdapter({ system, user, temperature, maxTokens, model, timeoutMs, jsonMode: !!inOpts.jsonMode });
        if (this.ctx) {
          try {
            await insertAudit({
              teamId: this.settings.teamId,
              provider: 'llm',
              endpointName,
              providerModel: r.model,
              tokensIn: r.usage.input_tokens,
              tokensOut: r.usage.output_tokens,
              usdCostEst: approxUsd(this.settings.llmProvider, r.model, r.usage.input_tokens, r.usage.output_tokens),
            });
          } catch {/* audit best-effort */}
        }
        return { text: r.raw, usage: r.usage, model: r.model };
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? '');
        const isAuth = msg.startsWith('[LLM_AUTH_INVALID_');
        const isCredit = msg.startsWith('[LLM_CREDIT_EXHAUSTED_');
        const isRate = msg.startsWith('[LLM_RATE_LIMIT_');
        const isUpstream = msg.startsWith('[LLM_UPSTREAM_');
        // CT-01: Hard fail types NO RETRY EVER (waste attempt slots)
        if (isAuth || isCredit) break;
        if (attempt < MAX_ATTEMPTS) {
          const base = isRate ? (2000 * Math.pow(2, attempt + 1)) : (1000 * Math.pow(2, attempt));
          const backoff = jitter(base);
          await new Promise(res => setTimeout(res, backoff));
          continue;
        }
      }
    }
    throw lastErr ?? new Error(`[LLM_CHATRAW_FAILED] Max ${MAX_ATTEMPTS+1} attempts exhausted`);
  }

  async chatStructured<T extends z.ZodTypeAny>(system: string, user: string, schema: T, opts: LlmChatOpts = {}): Promise<z.infer<T>> {
    const sampleShape = (() => {
      try {
        const s = JSON.stringify(schema);
        if (s && s.length < 1500) return s;
      } catch {}
      try { return JSON.stringify({}); } catch { return '{}'; }
    })();
    const schemaIntro = 'CRITICAL: Respond ONLY with JSON object. JSON SCHEMA OUTLINE:\n' + sampleShape + '\n\nEnforce types. No markdown fences, no prose. If uncertain fill null.';
    const descr: any = {};
    try { if (typeof (schema as any)._def !== 'undefined') { Object.assign(descr, { type: typeof (schema as any)._def }); } } catch {}
    const systemFull = `${system}\n\n${schemaIntro}\n\nSCHEMA_DESCRIPTION_HINT:\n${JSON.stringify(descr).slice(0, 1000)}`;
    const ATTEMPTS = 2;
    const BASE_TOK = Math.max(2048, Math.min(16000, opts.maxTokens ?? 4096));
    let lastErr: any = null;

    const tryRepairJson = (raw: string): any | null => {
      let t = String(raw || '').trim();
      t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      if (!t) return null;
      // 1) Normal parse (fast)
      try { return JSON.parse(t); } catch {}
      // 2) Remove trailing comma before } or ] (common LLM error)
      let cleaned = t.replace(/,\s*([}\]])/g, '$1');
      try { return JSON.parse(cleaned); } catch {}
      // 3) Find last complete array element: cut at last }, complete brackets/arrays
      const work = cleaned;
      // Find last occurrence of } that closes either clusters[] element or disclaimer_required
      const openBraces = (work.match(/\{/g) || []).length;
      const closeBraces = (work.match(/\}/g) || []).length;
      const openBrackets = (work.match(/\[/g) || []).length;
      const closeBrackets = (work.match(/\]/g) || []).length;
      if (closeBraces >= 1 && (closeBraces < openBraces || closeBrackets < openBrackets)) {
        let repair = work;
        // 3a: Complete missing clusters[] close bracket + outer brace(s)
        if (closeBrackets < openBrackets) repair += ']'.repeat(openBrackets - closeBrackets);
        if (closeBraces < openBraces) repair += '}'.repeat(openBraces - closeBraces);
        try { return JSON.parse(repair); } catch {}
      }
      // 4) Cut text at last occurrence of "}," (last complete cluster object) → rebuild remainder
      const lastCommaIdx = work.lastIndexOf('},');
      if (lastCommaIdx > 0) {
        let cut = work.slice(0, lastCommaIdx + 1);
        // Count open/close on cut
        const cOpen = (cut.match(/\{/g) || []).length;
        const cClose = (cut.match(/\}/g) || []).length;
        const bOpen = (cut.match(/\[/g) || []).length;
        const bClose = (cut.match(/\]/g) || []).length;
        cut = cut.replace(/,\s*$/,'');
        if (bClose < bOpen) cut += ']'.repeat(bOpen - bClose);
        if (cClose < cOpen) cut += '}'.repeat(cOpen - cClose);
        try { return JSON.parse(cut); } catch {}
      }
      // 5) If starts with { but no closing → close all
      if (work.startsWith('{')) {
        let r = work;
        const c = (r.match(/\{/g)||[]).length - (r.match(/\}/g)||[]).length;
        const b = (r.match(/\[/g)||[]).length - (r.match(/\]/g)||[]).length;
        if (b > 0) r += ']'.repeat(b);
        if (c > 0) r += '}'.repeat(c);
        try { return JSON.parse(r); } catch {}
      }
      return null;
    };

    for (let i=0;i<ATTEMPTS;i++) {
      try {
        const targetMax = BASE_TOK + Math.round((BASE_TOK * 0.20) * i);
        const { text } = await this.chatRaw(systemFull, user, { ...opts, temperature: i===0 ? (opts.temperature ?? 0.1) : 0.0, jsonMode: true, maxTokens: targetMax });
        const repaired = tryRepairJson(text);
        const obj = repaired;
        if (!obj || typeof obj !== 'object') {
          lastErr = new Error(`Repair JSON failed. Head: ${String(text||'').slice(0,100)}`);
          continue;
        }
        try {
          const parsed = await schema.parseAsync(obj);
          return parsed as T['_output'];
        } catch (zodErr: any) {
          lastErr = new Error(`Zod parse failed (repair OK, wrong shape). Head: ${JSON.stringify(obj).slice(0, 120)} | ${String(zodErr?.message ?? zodErr).slice(0, 160)}`);
        }
      } catch (e: any) { lastErr = e; if (IS_DEV) console.warn('[LlmService.structured attempt',i+1,'failed]:', String(e?.message ?? e).slice(0, 220)); }
    }
    throw new Error(`[INVALID_LLM_JSON_STRUCTURED] ${ATTEMPTS} attempts failed. Last: ${String(lastErr?.message ?? lastErr).slice(0, 260)}`);
  }
}

export default LlmService;
