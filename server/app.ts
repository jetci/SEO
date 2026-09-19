import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { eq, and, lte, gte, sql } from 'drizzle-orm';

import { ENV, IS_PROD, ENV_PARSE_ERRORS, VERCEL, IS_DEV } from './_core/env.js';
import { router, createContext } from './_core/trpc.js';
import { db } from '../db/index.js';
import { articles, writeArticles } from '../db/schema.js';

import { authRouter, authExpressRouter } from './auth.js';
import { teamsRouter } from './routers/teams.js';
import { settingsRouter } from './routers/settings.js';
import { metaRouter } from './routers/meta.js';
import { projectsRouter } from './routers/projects.js';
import { categoriesRouter } from './routers/categories.js';
import { clustersRouter } from './routers/clusters.js';
import { keywordsRouter } from './routers/keywords.js';
import { researchRouter } from './routers/research.js';
import { writeRouter } from './routers/write.js';
import { adminRouter } from './routers/admin.js';
import { scheduledPublishTick } from './workers/schedulerWorker.js';

export const appRouter = router({
  auth: authRouter,
  teams: teamsRouter,
  settings: settingsRouter,
  meta: metaRouter,
  projects: projectsRouter,
  categories: categoriesRouter,
  clusters: clustersRouter,
  keywords: keywordsRouter,
  research: researchRouter,
  write: writeRouter,
  admin: adminRouter,
});
export type AppRouter = typeof appRouter;

export function createApp() {
  const APP_URL = ENV.APP_URL;
  const VERCEL_URL = process.env.VERCEL_URL;
  const allowedOrigins = new Set<string>([
    APP_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  if (VERCEL_URL) {
    allowedOrigins.add(`https://${VERCEL_URL}`);
    allowedOrigins.add(VERCEL_URL);
  }

  const app = express();

  app.set('trust proxy', true);

  app.use(
    cors({
      credentials: true,
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.has(origin)) return cb(null, true);
        if (VERCEL_URL && origin.endsWith(VERCEL_URL)) return cb(null, true);
        if (origin.startsWith('http://localhost:')) return cb(null, true);
        return cb(null, IS_PROD ? false : true);
      },
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.status(ENV_PARSE_ERRORS.length > 0 ? 200 : 200).json({
      ok: ENV_PARSE_ERRORS.length === 0,
      app: 'eeat-studio-v2',
      phase: 2,
      port: ENV.PORT,
      serverTime: new Date().toISOString(),
      env: ENV.NODE_ENV,
      routers: ['auth', 'teams', 'settings', 'meta', 'projects', 'categories', 'clusters', 'keywords', 'research', 'write', 'admin'],
      deployment: process.env.VERCEL ? 'vercel-serverless' : 'local',
      vercel: Boolean(process.env.VERCEL_URL || VERCEL),
      env_health: ENV_PARSE_ERRORS.length === 0 ? 'OK' : 'DEGRADED',
      env_errors: ENV_PARSE_ERRORS.length > 0 ? ENV_PARSE_ERRORS : undefined,
      setup_required: ENV_PARSE_ERRORS.length > 0 ? [
        'VERCEL DASHBOARD → Settings → Environment Variables → Add:',
        '  → SESSION_SECRET (≥32 chars random, recommended ≥64)',
        '  → DATABASE_URL (mysql://user:pass@host:port/db?sslaccept=strict from PlanetScale/Aiven)',
        '  → DB_SSL = 1',
        '  → GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Google Cloud OAuth 2.0)',
        '  → LLM_PROVIDER + LLM_API_KEY (OpenRouter / OpenAI / Anthropic / Google)',
        '  → SERP_PROVIDER + SERP_API_KEY (DataForSEO login:password or Serper)',
        'After adding, REDEPLOY snapshot (Vercel picks new env vars only after build/deploy)',
      ] : undefined,
    });
  });

  app.use(
    '/api/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        console.error(`[V2][tRPC ERROR] ${path ?? '<root>'}: ${error.code} — ${error.message}`);
      },
    }),
  );

  app.use('/api/auth', authExpressRouter);
  app.use('/api/oauth', authExpressRouter);

  // SCHED-02 · Vercel Cron HTTP Ping Endpoint (fire-forget, no await)
  // Called by: Vercel Cron Jobs (prod: 1min) or VPS custom curl healthcheck (dev)
  // Header gate: x-vercel-cron-secret === ENV.CRON_SECRET | (IS_DEV && secret empty bypass)
  app.get('/api/cron/scheduled-publish', (_req, _res) => {
    const secret = String(_req.headers['x-vercel-cron-secret'] ?? _req.headers['x-cron-secret'] ?? '');
    const envSecret = String(ENV.CRON_SECRET ?? '');
    const allowed = (envSecret && secret === envSecret) || (IS_DEV && !envSecret);
    if (!allowed) {
      _res.status(401).json({ ok: false, error: 'Invalid cron secret', code: 'CRON_UNAUTHORIZED' });
      return;
    }
    void (async () => { try { await scheduledPublishTick(); } catch (e: any) { console.error('[CRON] scheduledPublishTick fireForget error:', String(e?.message ?? e).slice(0, 300)); } })();
    _res.status(200).json({ ok: true, cron: 'dispatched' });
  });

  // ===== API 404 GUARD (MUST BE BEFORE STATIC / SPA ROUTES) =====
  // Any /api/* request not matched by tRPC/auth above → explicit 404 JSON.
  // NEVER fall through to static/SPA for /api/* — this is the HARD GUARD against "404 HTML SPA fallback".
  // EXPRESS V5 + path-to-regexp v8 SAFETY: DO NOT use string wildcard routes ("/api/*" or "*" or "/*").
  // ALL wildcard syntax strings cause: PathError: Missing parameter name at index N → PM2 CRASH → 502 Bad Gateway GLOBALLY.
  // ZERO-RISK FIX: Use pure middleware function with manual path prefix check. No path-to-regexp parsing at all.
  app.use((_req, _res, _next) => {
    if (_req.path && _req.path.startsWith('/api/')) {
      _res.status(404).json({
        error: {
          message: 'API endpoint not found',
          code: 'NOT_FOUND',
          httpStatus: 404,
          path: _req.path,
        },
      });
      return;
    }
    _next();
  });

  // ===== SPA: serve Vite dist + fallback to index.html for client routes =====
  // Always register static + catch-all (even if dist missing we'll send JSON 500, not default Express 404 HTML)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const PROJ_ROOT = path.resolve(__dirname, '..');
  const DIST_DIR = path.join(PROJ_ROOT, 'dist');
  const INDEX_HTML = path.join(DIST_DIR, 'index.html');
  const distExists = DIST_DIR && fs.existsSync(DIST_DIR) && fs.existsSync(INDEX_HTML);
  if (distExists) {
    app.use(express.static(DIST_DIR, {
      index: false,
      maxAge: '1d',
      redirect: false,
      fallthrough: true,
      setHeaders(res, p) {
        if (p.endsWith('.html') || p.includes('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));
    console.log(`[V2] Static: serving ${DIST_DIR} (SPA fallback index.html)`);
  } else {
    console.warn(`[V2] dist/index.html not found at ${INDEX_HTML} — skipping express.static, still registering SPA '*' route`);
  }

  // ===== SPA FALLBACK FINAL MIDDLEWARE (NO PATH ARGUMENT → path-to-regexp is NEVER called) =====
  // CRITICAL EXPRESS V5 + path-to-regexp v8 SAFETY:
  //   String wildcards ('*', '/*', '/api/*') ALL cause: PathError: Missing parameter name at index N
  //   → ZERO-RISK FIX: Use final middleware stack with NO PATH argument.
  // Order: (A) API guard above already sent 404 JSON for any /api/* path.
  //        (B) express.static() above already served matched files.
  //        (C) Anything remaining here = client route → SPA index.html for GET, 405 JSON for non-GET.
  // GET anything left → SPA index.html.
  app.use((_req, _res, _next) => {
    if (_req.method !== 'GET') { _next(); return; }
    if (!distExists) {
      _res.status(500).json({ error: 'dist/index.html missing during SPA fallback', indexHtmlPath: INDEX_HTML, cwd: process.cwd() });
      return;
    }
    _res.sendFile(INDEX_HTML, (err: any) => {
      if (err) {
        _res.status(500).json({ error: 'SPA fallback sendFile failed', detail: String(err?.message || err) });
      }
    });
  });
  // Anything still not handled (non-GET client routes) → 405 JSON. NOT default Express 404 HTML.
  app.use((_req, _res) => {
    _res.status(405).json({
      error: { message: 'Method not allowed for non-API path', code: 'METHOD_NOT_ALLOWED', httpStatus: 405, method: _req.method, path: _req.path },
    });
  });

  return { app, appRouter };
}

export default createApp;
