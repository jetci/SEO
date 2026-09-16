// EEAT Studio V2 — ENV loader with zod runtime validation
// FAIL FAST at server startup if required vars missing (never silent undefined)
import 'dotenv/config';
import { z } from 'zod';

const VERCEL_URL = process.env.VERCEL_URL;
const DEFAULT_APP_URL = VERCEL_URL ? `https://${VERCEL_URL}` : 'http://localhost:5173';
const DEFAULT_SERVER_URL = VERCEL_URL ? `https://${VERCEL_URL}` : 'http://localhost:3002';
const VERCEL_DEPLOYED = Boolean(VERCEL_URL);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default(VERCEL_DEPLOYED ? 'production' : 'development'),
  PORT: z.coerce.number().default(3002),
  APP_URL: z.string().url().default(DEFAULT_APP_URL),
  SERVER_URL: z.string().url().default(DEFAULT_SERVER_URL),

  // MySQL / PlanetScale / Aiven cloud DB
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().min(1).default('eeat'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1).default('eeat_studio_v2'),
  DB_SSL: z
    .enum(['1','0','true','false','required','preferred'])
    .transform(v => v === '1' || v === 'true' || v === 'required')
    .default(VERCEL_DEPLOYED ? '1' : '0'),
  DATABASE_URL: z.string().optional(),

  // Session
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('eeat_studio_v2_session'),
  SESSION_TTL_MS: z.coerce.number().default(86400000),
  ONE_YEAR_MS: z.coerce.number().default(365 * 24 * 3600 * 1000),
  SESSION_SAMESITE: z.enum(['lax','strict','none']).default(VERCEL_DEPLOYED ? 'none' : 'lax'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1).optional().or(z.literal('__FILL_IN__.apps.googleusercontent.com')),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // SDK / Dev Auth (SA Mandate: first-login owner auto promoted admin)
  ADMIN_OPENID: z.string().default('102308593207118714314'),
  ADMIN_EMAIL: z.string().email().default('intelman26@gmail.com'),
  DEV_USE_MOCK_AUTH: z
    .enum(['1','0','true','false'])
    .transform(v => v === '1' || v === 'true')
    .default(VERCEL_DEPLOYED ? '0' : '1'),

  // LLM / SERP (Phase 2 ONLY — env vars stub ONLY until unlock)
  LLM_PROVIDER: z.enum(['openrouter','local','openai','anthropic','google']).default('openrouter'),
  LLM_API_KEY: z.string().optional(),
  SERP_PROVIDER: z.enum(['dataforseo','serper']).default('dataforseo'),
  SERP_API_KEY: z.string().optional(),
  DEFAULT_COUNTRY_CODE: z.string().length(2).default('th'),
  DEFAULT_LANG_CODE: z.string().length(2).default('th'),
});

// SAFE FAIL-FAST local dev, graceful degrade Vercel (so /api/health can report errors without cold-start crash)
const parsed = EnvSchema.safeParse(process.env);
export const ENV_PARSE_ERRORS: Array<{ key: string; messages: string[] }> = [];
let envData: z.infer<typeof EnvSchema>;

if (parsed.success) {
  envData = parsed.data;
} else {
  const flat = parsed.error.flatten();
  for (const [k, msgs] of Object.entries(flat.fieldErrors)) {
    ENV_PARSE_ERRORS.push({ key: k, messages: (msgs as string[]) || [] });
  }
  console.error('[V2][ENV WARN] Environment validation partial fail:');
  for (const err of ENV_PARSE_ERRORS) {
    console.error(`  - ${err.key}: ${err.messages.join(' / ')}`);
  }
  if (!VERCEL_DEPLOYED) {
    console.error('[V2][FATAL] Local dev — abort startup. Fix .env variables listed above.');
    process.exit(1);
  }
  // Vercel degraded fallback: use defaults + placeholder for required min-length to avoid undefined crashes
  envData = {
    NODE_ENV: 'production',
    PORT: 3002,
    APP_URL: DEFAULT_APP_URL,
    SERVER_URL: DEFAULT_SERVER_URL,
    DB_HOST: '127.0.0.1', DB_PORT: 3306, DB_USER: 'eeat', DB_PASSWORD: '', DB_NAME: 'eeat_studio_v2',
    DB_SSL: VERCEL_DEPLOYED, DATABASE_URL: process.env.DATABASE_URL || '',
    SESSION_SECRET: (process.env.SESSION_SECRET as string) || 'FALLBACK_UNSAFE_SESSION_SECRET_VERCEL_SET_ENV_VAR_32CHAR_MIN',
    SESSION_COOKIE_NAME: 'eeat_studio_v2_session',
    SESSION_TTL_MS: 86400000, ONE_YEAR_MS: 365 * 24 * 3600 * 1000, SESSION_SAMESITE: VERCEL_DEPLOYED ? 'none' : 'lax',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '__FILL_IN__.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || '',
    ADMIN_OPENID: '102308593207118714314', ADMIN_EMAIL: 'intelman26@gmail.com',
    DEV_USE_MOCK_AUTH: false,
    LLM_PROVIDER: 'openrouter', LLM_API_KEY: process.env.LLM_API_KEY || '',
    SERP_PROVIDER: (process.env.SERP_PROVIDER as any) || 'dataforseo',
    SERP_API_KEY: process.env.SERP_API_KEY || '',
    DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE || 'th',
    DEFAULT_LANG_CODE: process.env.DEFAULT_LANG_CODE || 'th',
  } as z.infer<typeof EnvSchema>;
}

export const ENV = envData;
export type ENV = typeof ENV;
export const VERCEL = VERCEL_DEPLOYED;
export const IS_DEV = ENV.NODE_ENV === 'development' && !VERCEL_DEPLOYED;
export const IS_PROD = ENV.NODE_ENV === 'production' || VERCEL_DEPLOYED;
export const COOKIE_SAMESITE =
  (IS_PROD || VERCEL_DEPLOYED) && String(ENV.SESSION_SAMESITE).toLowerCase() === 'none'
    ? 'none'
    : (ENV.SESSION_SAMESITE as 'lax' | 'strict' | 'none');
export const COOKIE_SECURE = IS_PROD || VERCEL_DEPLOYED;

// Compute helpers:
export const DB_URL =
  ENV.DATABASE_URL?.length
    ? ENV.DATABASE_URL
    : `mysql://${encodeURIComponent(ENV.DB_USER)}:${encodeURIComponent(ENV.DB_PASSWORD)}@${ENV.DB_HOST}:${ENV.DB_PORT}/${ENV.DB_NAME}`;
export { VERCEL_URL };
