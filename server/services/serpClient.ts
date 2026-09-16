// EEAT Studio V2 · SERP Service Layer — DataForSEO v3 (primary) / Serper (fallback)
// Tasks: (a) enrichBatch(keywords) => sv/difficulty/cpc/intent (b) organic serp (c) PAA questions
// Audit + serp_metric_cache MD5(keyword+lang+country) 7 days cross-project dedup
import { z } from 'zod';
import * as crypto from 'node:crypto';
import { db } from '../../db/index.js';
import { eq, and, gt, sql } from 'drizzle-orm';
import { serpMetricCache, keywords as keywordsTable, INTENTS } from '../../db/schema.js';
import { type ProtectedCtx } from '../_core/middleware/rbac.js';
import { resolveTeamSettings, insertAudit } from '../routers/settings.js';
import { ENV } from '../_core/env.js';
import type { TeamSettingsResolved } from '../routers/settings.js';

export type EnrichResult = {
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null; // 0-100
  cpc: number | null;
  intent: typeof INTENTS[number] | null;
  provider: 'dataforseo'|'serper';
  fromCache: boolean;
  error?: string;
};

type IntentsLiteral = typeof INTENTS[number];

function md5Hash(...parts: string[]): string {
  return crypto.createHash('md5').update(parts.join('||')).digest('hex');
}

function competitionLevelToDifficulty(level?: string | number): number | null {
  if (level == null) return null;
  if (typeof level === 'number') return Math.max(0, Math.min(100, Math.round(level)));
  const s = String(level).toLowerCase().trim();
  if (s.includes('low') || s.startsWith('0') || s === 'low') return 25;
  if (s.includes('medium') || s.startsWith('1') || s === 'medium') return 55;
  if (s.includes('high') || s.startsWith('2')) return 85;
  const n = parseInt(s, 10);
  if (!isNaN(n)) return Math.max(0, Math.min(100, n));
  return null;
}

function dseoIntentMap(arr?: any[]): IntentsLiteral | null {
  if (!Array.isArray(arr) || !arr.length) return null;
  const LEGACY_EXACT: Record<string,IntentsLiteral> = {
    informational: 'informational',
    navigational: 'navigational',
    commercial: 'commercial',
    transactional: 'transactional',
  };
  // Pass 1: exact known → direct map
  for (const raw of arr) {
    const k = String(raw).toLowerCase();
    if (LEGACY_EXACT[k]) return LEGACY_EXACT[k];
  }
  // 🟢 AUDIT P3 FALLBACK: Unknown/new intent from future DataForSEO API updates
  //  - Heuristic keyword fuzzy match to nearest bucket BEFORE returning null (preserve SEO value)
  //  - Structured console alert so devs know mapping needs updating
  const BUCKETS: Array<{ target: IntentsLiteral; matches: string[] }> = [
    { target: 'informational', matches: ['info','know','learn','research','what','why','how','when','where','who','guide','tutorial','explain','define','definition','ความรู้','คู่มือ','วิธี','คืออะไร','ทำไม','เมื่อไหร่','ที่ไหน','ใคร','สอน','คำอธิบาย'] },
    { target: 'commercial', matches: ['compare','comparison','best','top','review','rating','vs','versus','deal','offer','discount','cheap','affordable','recommend','เทียบ','ดีที่สุด','อันดับ','รีวิว','จัดอันดับ','โปรโมชั่น','ลดราคา','ถูก','แนะนำ','เปรียบเทียบ'] },
    { target: 'transactional', matches: ['buy','purchase','order','shop','store','price','coupon','booking','book now','sign up','register','subscribe','download','sale','checkout','payment','ซื้อ','สั่ง','จอง','ชำระ','ลงทะเบียน','สมัคร','ร้านค้า','ราคา','คูปอง','โปร','สั่งซื้อ','จองเลย'] },
    { target: 'navigational', matches: ['login','signin','dashboard','homepage','official site','website','page','app','download app','facebook','youtube','เข้าสู่ระบบ','ล็อกอิน','หน้าแรก','เว็บไซต์ทางการ','แอป','หน้า','แอปพลิเคชัน'] },
  ];
  for (const raw of arr) {
    const k = String(raw).toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g,' ').replace(/\s+/g,' ').trim();
    if (!k) continue;
    let best: { target: IntentsLiteral | null; score: number } = { target: null, score: 0 };
    for (const b of BUCKETS) {
      let score = 0;
      for (const m of b.matches) { if (k.includes(m)) score += 1; }
      if (score > best.score) best = { target: b.target, score };
    }
    if (best.target && best.score > 0) {
      console.warn(`[SerpService:dseoIntentMap] NEW UNKNOWN INTENT detected (fallback heuristic matched bucket=${best.target} score=${best.score}). Raw intent values=${JSON.stringify(arr)}. Update dseoIntentMap in serpClient.ts with explicit mapping.`);
      return best.target;
    }
  }
  console.warn(`[SerpService:dseoIntentMap] NEW UNKNOWN INTENT detected (NO heuristic bucket match — returning null). Raw intent values=${JSON.stringify(arr)}. Update dseoIntentMap mapping in serpClient.ts IMMEDIATELY to preserve SEO signal quality.`);
  return null;
}

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export class SerpService {
  private settings: TeamSettingsResolved;
  private ctx?: ProtectedCtx;
  constructor(s: TeamSettingsResolved, ctx?: ProtectedCtx) {
    this.settings = s;
    this.ctx = ctx;
  }
  static async forContext(ctx: ProtectedCtx) {
    const s = await resolveTeamSettings(ctx);
    return new SerpService(s, ctx);
  }

  private basicAuthForDataforseo(): { username: string; password: string } | null {
    if (this.settings.serpProvider !== 'dataforseo') return null;
    const parts = this.settings.serpApiKey.split(':');
    if (parts.length < 2) return null;
    return { username: parts[0], password: parts.slice(1).join(':') };
  }

  async enrichBatch(keywordTexts: string[], lang = ENV.DEFAULT_LANG_CODE, country = ENV.DEFAULT_COUNTRY_CODE): Promise<EnrichResult[]> {
    if (keywordTexts.length > 50) throw new Error('[BATCH_TOO_LARGE] enrich batch cap is 50 keywords per call.');
    const unique = Array.from(new Set(keywordTexts.map(k => (k ?? '').trim()).filter(Boolean)));
    const results: Record<string, EnrichResult> = {};
    const needFetch: { key:string; kw:string }[] = [];

    for (const kw of unique) {
      const hash = md5Hash(kw, lang, country);
      try {
        const hit = await db.select().from(serpMetricCache)
          .where(and(
            eq(serpMetricCache.cacheKeyHash, hash),
            eq(serpMetricCache.provider, this.settings.serpProvider),
            gt(serpMetricCache.fetchedAt, new Date(Date.now() - SEVEN_DAYS_MS))
          )).limit(1);
        if (hit[0]) {
          results[kw] = {
            keyword: kw,
            searchVolume: Number(hit[0].searchVolume ?? 0) || null,
            difficulty: hit[0].difficulty == null ? null : Number(hit[0].difficulty),
            cpc: hit[0].cpc == null ? null : Number(hit[0].cpc),
            intent: (hit[0].intentSuggestion as IntentsLiteral) ?? null,
            provider: this.settings.serpProvider,
            fromCache: true,
          };
          continue;
        }
      } catch {/* cache lookup fail → re-fetch */}
      needFetch.push({ key: hash, kw });
      results[kw] = { keyword: kw, searchVolume:null, difficulty:null, cpc:null, intent:null, provider: this.settings.serpProvider, fromCache:false };
    }

    if (needFetch.length) {
      let fetched = await this.fetchEnrichBatch(needFetch.map(n => n.kw), lang, country);
      // P0-3 SERP 401/403 FALLBACK 1 ROUND ENV KEY (SAFE)
      // SAFETY GUARD: Fallback only when (1) ALL fetched error auth class, (2) ENV key non-empty and DIFFERENT from DB key, (3) teamId === DEFAULT_ADMIN_TEAM (90001) or DB key === ENV key (seeded, user never changed it = not cross-team)
      const DEFAULT_ADMIN_TEAM = 90001;
      const allAuthErr = fetched.length > 0 && fetched.every(r => {
        const m = String(r.error ?? '');
        return m.startsWith('HTTP 401') || m.startsWith('HTTP 403') || m.startsWith('[SERP_AUTH_INVALID') || m.startsWith('[SERP_AUTH_INVALID_');
      });
      const envKey = (ENV.SERP_API_KEY ?? '').trim();
      const dbKey = (this.settings.serpApiKey ?? '').trim();
      const safeFallbackCond = allAuthErr && envKey && envKey !== dbKey && (Number(this.settings.teamId) === DEFAULT_ADMIN_TEAM || dbKey === (process.env.__SEED_SERP_API_KEY ?? ''));
      if (safeFallbackCond) {
        const fallbackSettings = { ...this.settings, serpApiKey: envKey };
        try {
          const svcFallback = new SerpService(fallbackSettings, this.ctx);
          const retryResults = await svcFallback.fetchEnrichBatch(needFetch.map(n => n.kw), lang, country);
          // Merge: use fallback result if it succeeded (no error), keep original if fallback also failed for that kw
          fetched = fetched.map((orig, i) => {
            const fr = retryResults[i];
            if (!fr || fr.error) return orig;
            return fr;
          });
        } catch (_fallbackErr: any) { /* ignore fallback fail; keep original error results */ }
      }
      const auditRowsReturned = fetched.reduce((acc, r) => acc + (r.searchVolume != null ? 1 : 0), 0);
      if (this.ctx) {
        try {
          await insertAudit({
            teamId: this.settings.teamId,
            provider: 'serp',
            endpointName: 'serp.enrichBatch',
            rowsReturned: auditRowsReturned,
            usdCostEst: (auditRowsReturned / 2500) * 0.35,
          });
        } catch {/* audit BE */}
      }
      // populate + persist cache
      const now = new Date();
      const cacheInserts: any[] = [];
      for (const r of fetched) {
        results[r.keyword] = { ...r, provider: this.settings.serpProvider, fromCache:false };
        const hash = md5Hash(r.keyword, lang, country);
        if (!r.error) {
          cacheInserts.push({
            cacheKeyHash: hash,
            provider: this.settings.serpProvider,
            searchVolume: r.searchVolume,
            difficulty: r.difficulty,
            cpc: r.cpc,
            intentSuggestion: r.intent,
            rawJsonResponse: JSON.stringify({}),
            fetchedAt: now,
          });
        }
      }
      if (cacheInserts.length) {
        // 🟡 AUDIT P1: Cache DB INSERT — transient DB errors (deadlock, conn fail, lock wait) should RETRY 2x
        // with small 300/700ms exponential backoff instead of failing silently. After all retries fail,
        // emit a structured monitoring-level warning (includes provider + keyword_count + err_code + msg)
        // so ops knows cache is down and API quota is burning unnecessarily on duplicate lookups.
        const MAX_ATTEMPTS = 3;
        let lastErr: any = null;
        let allSucceeded = false;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            for (const row of cacheInserts) {
              await db.insert(serpMetricCache).values(row).onDuplicateKeyUpdate({ set: row });
            }
            allSucceeded = true;
            break;
          } catch (e: any) {
            lastErr = e;
            if (attempt < MAX_ATTEMPTS - 1) {
              const backoffMs = 300 * Math.pow(2, attempt);
              await new Promise(res => setTimeout(res, backoffMs));
              continue;
            }
          }
        }
        if (!allSucceeded) {
          const errCode = String(lastErr?.code || lastErr?.errno || 'NO_ERR_CODE');
          const msgShort = String(lastErr?.message || lastErr || 'UNKNOWN').slice(0, 240);
          console.warn(
            `[MONITORING_ALERT][SerpService][SERP_METRIC_CACHE_PERSIST_FAILED] ALL ${MAX_ATTEMPTS} RETRIES EXHAUSTED | provider=${this.settings.serpProvider} | rows=${cacheInserts.length} | err_code=${errCode} | err_msg=${msgShort} | teamId=${this.settings.teamId ?? 'UNKNOWN'} | IMPACT: duplicate SERP API calls will be re-fired for these keywords (wastes quota $) until DB recovers.`
          );
          if (this.ctx) {
            try {
              await insertAudit({
                teamId: this.settings.teamId,
                provider: 'serp',
                endpointName: 'serp.cache.persist_failed_retries_exhausted',
                rowsReturned: cacheInserts.length,
                usdCostEst: 0,
              });
            } catch { /* ignore audit audit fail */ }
          }
        }
      }
    }

    // return in same order as input (original keywordTexts) — include null fills for blanks
    return keywordTexts.map(orig => {
      const k = (orig ?? '').trim();
      return results[k] ?? { keyword: k, searchVolume:null, difficulty:null, cpc:null, intent:null, provider: this.settings.serpProvider, fromCache:false, error: 'empty input' };
    });
  }

  private async fetchEnrichBatch(keywords: string[], lang: string, country: string): Promise<EnrichResult[]> {
    const provider = this.settings.serpProvider;
    if (provider === 'dataforseo') {
      const auth = this.basicAuthForDataforseo();
      if (!auth) throw new Error('[SERP_AUTH_INVALID] DataForSEO expects login:password key format. got <2 parts.');
      const hash = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      // location_code lookup: Thailand = 2840; en-us 2840. For lang th we use country TH.
      const locationCode = country.toLowerCase() === 'th' ? 2826 : 2840;
      const langCode = (lang || 'th').toLowerCase().startsWith('th') ? 'th' : 'en';
      const body = [{
        keywords,
        language_code: langCode,
        location_code: locationCode,
      }];
      const url = 'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_intent/live';
      const r = await fetch(url, { method:'POST', headers: { Authorization: `Basic ${hash}`, 'content-type':'application/json' }, body: JSON.stringify(body) });
      if (r.status === 401 || r.status === 403) throw new Error(`[SERP_AUTH_INVALID_DATAFORSEO] HTTP ${r.status}`);
      const text = await r.text();
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error('[SERP_UPSTREAM_INVALID_JSON] DataForSEO response not JSON: '+text.slice(0,200)); }
      const items: any[] = (json?.tasks?.[0]?.result ?? []).flatMap((r:any)=>Array.isArray(r.items) ? r.items : []);
      // Build a map by keyword
      const byKw = new Map<string, any>();
      for (const it of items) {
        const kw = String(it.keyword ?? '').trim();
        if (kw && !byKw.has(kw)) byKw.set(kw, it);
      }
      return keywords.map(kw => {
        const it = byKw.get(kw);
        if (!it) return { keyword: kw, searchVolume:null, difficulty:null, cpc:null, intent:null, provider:'dataforseo', fromCache:false, error: 'NO_RESULT' };
        return {
          keyword: kw,
          searchVolume: typeof it.search_volume === 'number' ? it.search_volume : null,
          difficulty: competitionLevelToDifficulty(it.competition_level ?? it.difficulty),
          cpc: typeof it.cpc === 'number' ? +it.cpc.toFixed(6) : null,
          intent: dseoIntentMap(it.keyword_intent),
          provider: 'dataforseo',
          fromCache:false,
        };
      });
    } else {
      // Serper volumes not cheap; fallback enrich with search endpoint metrics when possible
      const key = this.settings.serpApiKey;
      if (!key) throw new Error('[SERP_AUTH_INVALID_SERPER] missing key');
      const out: EnrichResult[] = [];
      for (const kw of keywords) {
        const body = { q: kw, gl: country.toLowerCase(), hl: lang.toLowerCase(), num:1 };
        try {
          const r = await fetch('https://google.serper.dev/search', {
            method:'POST', headers: { 'X-API-KEY': key, 'content-type':'application/json' }, body: JSON.stringify(body)
          });
          if (r.status !== 200) { out.push({ keyword:kw, searchVolume:null,difficulty:null,cpc:null,intent:null,provider:'serper', fromCache:false, error:`HTTP ${r.status}` }); continue; }
          const j = await r.json();
          out.push({ keyword: kw, searchVolume: Number(j?.search_information?.total_results ?? 0) || null, difficulty: j?.organic?.length ? Math.min(100, 20 + j.organic.length*8) : null, cpc: null, intent: null, provider:'serper', fromCache:false });
        } catch (e: any) {
          out.push({ keyword:kw, searchVolume:null,difficulty:null,cpc:null,intent:null,provider:'serper', fromCache:false, error: String(e?.message ?? e).slice(0,80) });
        }
      }
      return out;
    }
  }

  async organicTop10(keyword: string, lang = ENV.DEFAULT_LANG_CODE, country = ENV.DEFAULT_COUNTRY_CODE): Promise<{ url:string; title:string; snippet:string; estimatedWordCount:number; domainAuthority:number; relatedSearches: string[]; peopleAlsoSearch: string[] }> {
    const provider = this.settings.serpProvider;
    const startTime = Date.now();
    let out: any[] = [];
    let relatedSearches: string[] = [];
    let peopleAlsoSearch: string[] = [];
    const locationCode = country.toLowerCase() === 'th' ? 2826 : 2840;
    if (provider === 'dataforseo') {
      const auth = this.basicAuthForDataforseo();
      if (!auth) throw new Error('[SERP_AUTH_INVALID] DataForSEO expects login:password');
      const hash = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      const body = [{ keyword, language_code: lang, location_code: locationCode, priority: 1 }];
      const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
        method:'POST', headers: { Authorization: `Basic ${hash}`, 'content-type':'application/json' }, body: JSON.stringify(body),
      });
      if (r.status===401||r.status===403) throw new Error(`[SERP_AUTH_INVALID_DATAFORSEO] HTTP ${r.status}`);
      const j = await r.json();
      const items: any[] = (((j?.tasks?.[0]?.result ?? [])[0])?.items ?? []).filter((x:any)=>x.type==='organic').slice(0,10);
      out = items.map((o:any) => ({
        url: String(o.url ?? ''), title: String(o.title ?? ''), snippet: String(o.description ?? ''),
        estimatedWordCount: Number(o.text?.length ?? o.description?.length ?? 0),
        domainAuthority: Math.max(0, Math.min(100, 100 - Math.round(100/Math.max(1,(o.rank_group ?? 10))))),
        relatedSearches: [],
        peopleAlsoSearch: [],
      }));
      const rs: any[] = (((j?.tasks?.[0]?.result ?? [])[0])?.items ?? []).filter((x:any)=>x.type==='related_searches');
      for (const rItem of rs) if (Array.isArray(rItem.links)) for (const l of rItem.links) if (typeof l.title==='string' && l.title.trim()) relatedSearches.push(String(l.title).trim());
    } else {
      const key = this.settings.serpApiKey;
      if (!key) throw new Error('[SERP_AUTH_INVALID_SERPER] missing');
      const r = await fetch('https://google.serper.dev/search', {
        method:'POST', headers:{'X-API-KEY':key,'content-type':'application/json'}, body: JSON.stringify({ q: keyword, gl:country, hl:lang, num:10 }),
      });
      if (r.status!==200) throw new Error(`[SERP_UPSTREAM_SERPER] HTTP ${r.status}`);
      const j = await r.json();
      const organics = Array.isArray(j.organic) ? j.organic.slice(0,10) : [];
      out = organics.map((o:any, idx:number) => ({
        url: String(o.link ?? ''), title: String(o.title ?? ''), snippet: String(o.snippet ?? ''),
        estimatedWordCount: String(o.snippet ?? '').length * 6,
        domainAuthority: Math.max(0, 100 - idx*9),
        relatedSearches: [],
        peopleAlsoSearch: [],
      }));
      if (Array.isArray(j.relatedSearches)) {
        for (const rs of j.relatedSearches) if (typeof rs.query === 'string' && rs.query.trim()) relatedSearches.push(String(rs.query).trim());
      }
      if (Array.isArray(j.peopleAlsoSearch)) {
        for (const p of j.peopleAlsoSearch) if (typeof p.query === 'string' && p.query.trim()) peopleAlsoSearch.push(String(p.query).trim());
      }
    }
    if (this.ctx) {
      try {
        await insertAudit({
          teamId: this.settings.teamId, provider:'serp', endpointName:'serp.organic',
          rowsReturned: out.length, usdCostEst: 0.002 + out.length*0.0005,
        });
      } catch {/* BE */}
    }
    return { organic: out, relatedSearches: Array.from(new Set(relatedSearches)).slice(0, 30), peopleAlsoSearch: Array.from(new Set(peopleAlsoSearch)).slice(0, 30) } as any;
  }

  async paaQuestions(keyword: string, lang = ENV.DEFAULT_LANG_CODE, country = ENV.DEFAULT_COUNTRY_CODE): Promise<{ question:string; snippet:string; urlSource:string }[]> {
    const locationCode = country.toLowerCase()==='th' ? 2826 : 2840;
    if (this.settings.serpProvider === 'dataforseo') {
      const auth = this.basicAuthForDataforseo();
      if (!auth) throw new Error('[SERP_AUTH_INVALID] DataForSEO expects login:password');
      const hash = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      const body = [{ keyword, language_code: lang, location_code: locationCode }];
      const r = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/questions_for_keyword/live', {
        method:'POST', headers: { Authorization: `Basic ${hash}`, 'content-type':'application/json' }, body: JSON.stringify(body),
      });
      if (r.status===401||r.status===403) throw new Error(`[SERP_AUTH_INVALID_DATAFORSEO] HTTP ${r.status}`);
      const j = await r.json();
      const items: any[] = (j?.tasks?.[0]?.result ?? []).flatMap((x:any)=>x.items ?? []).slice(0, 12);
      const out = items.map((it:any) => ({ question: String(it.text ?? it.question ?? ''), snippet: String(it.description ?? ''), urlSource: String(it.url ?? '') }));
      if (this.ctx) {
        try { await insertAudit({ teamId: this.settings.teamId, provider:'serp', endpointName:'serp.paa', rowsReturned: out.length, usdCostEst: out.length*0.0004 }); } catch {/*BE*/}
      }
      return out;
    }
    // Serper PAA
    const key = this.settings.serpApiKey;
    if (!key) throw new Error('[SERP_AUTH_INVALID_SERPER]');
    const r = await fetch('https://google.serper.dev/search', {
      method:'POST', headers:{'X-API-KEY':key,'content-type':'application/json'}, body: JSON.stringify({ q: keyword, gl:country, hl:lang }),
    });
    if (r.status!==200) throw new Error(`[SERP_UPSTREAM_SERPER] HTTP ${r.status}`);
    const j = await r.json();
    const arr: any[] = Array.isArray(j.peopleAlsoAsk) ? j.peopleAlsoAsk.slice(0, 12) : [];
    return arr.map(p => ({ question: String(p.question ?? ''), snippet: String(p.snippet ?? ''), urlSource: String(p.link ?? '') }));
  }
}

export default SerpService;
