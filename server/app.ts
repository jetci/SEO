import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { eq, and, lte, gte, sql } from 'drizzle-orm';

import { ENV, IS_PROD, ENV_PARSE_ERRORS, VERCEL } from './_core/env.js';
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

  // ===== Phase 3 · Scheduler Publish (NO ALTER TABLE FOREVER — reuse existing cols only) =====
  // Reuses: articles.status(draft/published), articles.updatedAt, writeArticles.writeStep,
  //          writeArticles.stepStatus, writeArticles.error_msg(VARCHAR 512).
  // Publish eligible rows: draft + writeStep>=8 (pipeline done) + stepStatus=done + updatedAt>=30min buffer.
  if (IS_PROD && !VERCEL) {
    const SCHED_INTERVAL_MS = 60_000;
    const PUBLISH_BUFFER_MIN = 30;
    const MAX_LOOKBACK_DAYS = 7;
    const SYSTEM_ADMIN_ID = 99001;

    const schedTick = async () => {
      try {
        const sinceBuf = new Date(Date.now() - PUBLISH_BUFFER_MIN * 60_000);
        const sinceMin = new Date(Date.now() - MAX_LOOKBACK_DAYS * 24 * 60 * 60_000);
        const rows = await db
          .select({
            articleId: articles.id,
            projectId: articles.projectId,
            writeId: writeArticles.id,
          })
          .from(articles)
          .innerJoin(writeArticles, eq(writeArticles.articleId, articles.id))
          .where(and(
            eq(articles.status, 'draft'),
            gte(writeArticles.writeStep, 8),
            eq(writeArticles.stepStatus, 'done'),
            lte(articles.updatedAt, sinceBuf),
            gte(articles.updatedAt, sinceMin),
          ))
          .limit(25);
        if (rows.length === 0) return;
        const caller = (appRouter as any).createCaller({
          user: { id: SYSTEM_ADMIN_ID, role: 'admin', teamId: 90001, email: 'scheduler@eeat.local' },
          req: undefined,
          res: undefined,
          session: undefined,
        });
        for (const r of rows) {
          try {
            await caller.write.publish({ draftId: Number(r.articleId) });
            console.log(`[SCHED PUB] OK article=${r.articleId} project=${r.projectId}`);
          } catch (err: any) {
            const msg = String(err?.message || err).slice(0, 511);
            try {
              await db.update(writeArticles).set({
                errorMsg: `[SCHED_FAIL] ${msg}`,
                updatedAt: new Date(),
              }).where(eq(writeArticles.id, Number(r.writeId)));
            } catch { /* ignore */ }
            console.error(`[SCHED PUB] FAIL article=${r.articleId}:`, msg.slice(0, 160));
          }
        }
      } catch (e: any) {
        console.error('[SCHED PUB] tick ERROR:', String(e?.message || e).slice(0, 512));
      }
    };

    setTimeout(schedTick, 5_000);
    const iid = setInterval(schedTick, SCHED_INTERVAL_MS);
    process.once('SIGTERM', () => clearInterval(iid));
    process.once('SIGINT', () => clearInterval(iid));
    console.log(`[V2] Scheduler Publish started (interval=${SCHED_INTERVAL_MS}ms, buffer=${PUBLISH_BUFFER_MIN}min, lookback=${MAX_LOOKBACK_DAYS}d)`);
  }

  return { app, appRouter };
}

export default createApp;
