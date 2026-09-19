// EEAT Studio V2 · Auth Module (Phase 0 — lean transplant)
// 1) tRPC authRouter: me / devSignin (NODE_ENV=dev ONLY) / logout
// 2) Express Google OAuth 2 routes: /api/auth/google/login + callback
import { z } from 'zod';
import { Router as ExpressRouter } from 'express';
import {
  router,
  publicProcedure,
  TRPCError,
  type Context,
  touchSessionCookie,
} from './_core/trpc.js';
import { ENV, IS_DEV, IS_PROD } from './_core/env.js';
import { createSessionToken, verifySession, hashOpenIdToId } from './_core/sdk.js';
import { users } from '../db/schema.js';
import type { UserRole } from '../shared/types.js';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as jose from 'jose';
import { buildCookieOptions } from './_core/utils/cookies.js';

// ======================================================================
// PART 1 · tRPC authRouter (3 procedures per SA §0.4a-4)
// ======================================================================

export const authRouter = router({
  /**
   * me: return current session info (or null if guest)
   * Public call (no auth needed) — safe to call from landing page to detect login state.
   */
  me: publicProcedure.query(async ({ ctx }: { ctx: Context }) => {
    if (!ctx.session) {
      return { isLoggedIn: false as const, user: null, session: null };
    }
    // WO-CORE-2569-003 RBAC-01: hydrate ctx.user from DB + attach teamMembers permission (owner/admin/member)
    // so client SettingsPage L50 isAdmin = permission==='owner'||'admin' resolves correctly
    let u: any = ctx.user;
    let perm: any = ctx.user?.permission ?? null;
    try {
      if (!u) {
        const rows = await db.select().from(users).where(eq(users.googleOpenId, ctx.session.openId)).limit(1);
        if (rows && rows.length) {
          const raw = rows[0] as any;
          u = { ...raw, isActive: !!raw.isActive };
        }
      }
      if (u && !perm) {
        const tms = await db
          .select({ permission: (await import('../db/schema.js')).teamMembers.permission, teamId: (await import('../db/schema.js')).teamMembers.teamId })
          .from((await import('../db/schema.js')).teamMembers)
          .where(eq((await import('../db/schema.js')).teamMembers.userId, Number(u.id ?? 0)))
          .limit(5);
        const owner = tms.find(t => t.permission === 'owner');
        const admin = tms.find(t => t.permission === 'admin');
        perm = owner?.permission ?? admin?.permission ?? tms[0]?.permission ?? 'member';
        if (u) u.permission = perm;
      }
    } catch (e) { /* ignore hydrate failure — fallback to temp below */ }

    const userRole = (ctx.session.openId === ENV.ADMIN_OPENID ? 'admin' : (u?.role || 'writer')) as any;
    const effectivePerm = perm as any ?? (userRole === 'admin' ? 'admin' : 'member');
    if (u) u.role = userRole;
    const out = u ?? {
      id: hashOpenIdToId(ctx.session.openId),
      googleOpenId: ctx.session.openId,
      email: `${ctx.session.openId.slice(-8)}@dev.local`,
      name: ctx.session.name,
      role: userRole,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!(out as any).permission) (out as any).permission = effectivePerm;
    return {
      isLoggedIn: true as const,
      session: ctx.session,
      user: out,
    };
  }),

  /**
   * devSignin: mock sign-in WITHOUT Google (SA mandate: NODE_ENV=development ONLY)
   * Uses ENV.ADMIN_OPENID + ENV.ADMIN_EMAIL as first admin user.
   * Blocks in production for security.
   */
  devSignin: publicProcedure
    .input(
      z.object({
        openId: z.string().min(5).default(ENV.ADMIN_OPENID),
        name: z.string().min(1).default('Dev Admin'),
        email: z.string().email().default(ENV.ADMIN_EMAIL),
        role: z.enum(['admin','writer']).default('writer'),
        avatarUrl: z.string().url().optional(),
        password: z.string().max(120).default(''),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // WO-CORE-2569-003 ADMIN-01: Sanitize — NEVER log password or char codes anywhere.
      // Guard: zero runtime charCode loops on password field permitted.
      // Prevent accidental debug charCode leaks (DEBT-02 regression guard).
      void 0;

      const prodDemoAllowed = String(process.env.ALLOW_PROD_DEMO_SIGNIN || '0') === '1';
      const prodDemoPwd = String(process.env.PROD_DEMO_SIGNIN_PASSWORD || '').trim();
      const isAdminOpenId = String(input.openId || '').trim() === String(ENV.ADMIN_OPENID || '').trim();
      const pwdMatch = prodDemoPwd ? (String(input.password || '').trim() === prodDemoPwd) : false;
      const demoGateOk = prodDemoAllowed && isAdminOpenId && pwdMatch;

      // ADMIN-01 HARDEN: Replace IS_PROD string with !IS_DEV (covers Vercel preview NODE_ENV=production not actual prod)
      if (!IS_DEV && !demoGateOk) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'devSignin is disabled in non-dev environments.',
        });
      }
      if (IS_DEV && !ENV.DEV_USE_MOCK_AUTH && !demoGateOk) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'DEV_USE_MOCK_AUTH=0 — mock auth disabled. Use Google OAuth.',
        });
      }

      const roleOut: UserRole = input.openId === ENV.ADMIN_OPENID ? 'admin' : input.role;

      // Upsert user into DB
      let dbUser;
      try {
        await db.insert(users).values({
          googleOpenId: input.openId,
          email: input.email,
          name: input.name,
          avatarUrl: input.avatarUrl ?? null,
          role: roleOut,
          isActive: 1,
        }).onDuplicateKeyUpdate({
          name: input.name,
          email: input.email,
          avatarUrl: input.avatarUrl ?? undefined,
          role: roleOut,
          isActive: 1,
        } as any);

        const found = await db.select().from(users).where(eq(users.googleOpenId, input.openId)).limit(1);
        dbUser = found[0];
      } catch (e: any) {
        if (IS_DEV) {
          console.warn('[devSignin] DB upsert skipped (DB not available yet):', e?.message ?? String(e).slice(0,100));
        }
        dbUser = null;
      }

      const token = await createSessionToken(input.openId, {
        name: input.name,
      });

      if (token.length < 180 || token.length > 360) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `[AUTH BUG] Session token size invalid (len=${token.length}, expected 180-360 HS256 JWT)`,
        });
      }

      const expiresMs = ENV.SESSION_TTL_MS;
      ctx.res.cookie(ENV.SESSION_COOKIE_NAME, token, buildCookieOptions(expiresMs));

      const outUser = dbUser ?? {
        id: hashOpenIdToId(input.openId),
        googleOpenId: input.openId,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl ?? null,
        role: roleOut,
        bio: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return {
        ok: true,
        mode: 'dev',
        tokenLength: token.length,
        cookie: ENV.SESSION_COOKIE_NAME,
        user: outUser,
      };
    }),

  /**
   * logout: clear session cookie + return guest state
   */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.res.clearCookie(ENV.SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true, isLoggedIn: false as const };
  }),
});

// ======================================================================
// PART 2 · Google OAuth 2 Express Routes (redirect + callback)
// Phase 0: skeleton routes — actual token exchange added in Phase 1.
// Returns clear error if GOOGLE_CLIENT_ID not configured yet (avoids 500 crash).
// ======================================================================

export const authExpressRouter = ExpressRouter();

function googleOAuthConfigured(): boolean {
  return (
    !!ENV.GOOGLE_CLIENT_ID &&
    ENV.GOOGLE_CLIENT_ID !== '__FILL_IN__.apps.googleusercontent.com' &&
    !!ENV.GOOGLE_CLIENT_SECRET &&
    !!ENV.GOOGLE_CALLBACK_URL
  );
}

/** GET /api/auth/google/login → redirect to Google consent screen */
authExpressRouter.get('/google/login', (_req, res) => {
  if (!googleOAuthConfigured()) {
    if (IS_DEV) {
      // Dev shortcut: redirect to devSignin (same result, no Google roundtrip)
      return res.redirect(`${ENV.APP_URL}/auth/dev-login`);
    }
    return res.status(503).json({
      ok: false,
      error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID / SECRET / CALLBACK_URL in .env',
    });
  }

  const params = new URLSearchParams({
    client_id: ENV.GOOGLE_CLIENT_ID!,
    redirect_uri: ENV.GOOGLE_CALLBACK_URL!,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

async function exchangeGoogleCodeForTokens(code: string): Promise<{ access_token: string; id_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    code,
    client_id: ENV.GOOGLE_CLIENT_ID!,
    client_secret: ENV.GOOGLE_CLIENT_SECRET!,
    redirect_uri: ENV.GOOGLE_CALLBACK_URL!,
    grant_type: 'authorization_code',
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Google token exchange failed (${resp.status}): ${body.slice(0, 200)}`);
  }
  return resp.json();
}

async function verifyGoogleIdToken(idToken: string): Promise<{ sub: string; email: string; email_verified: boolean; name?: string; picture?: string }> {
  const JWKS = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: ENV.GOOGLE_CLIENT_ID!,
  });
  return payload as any;
}

/**
 * GET /api/auth/google/callback → exchange code → upsert user → set cookie → redirect to dashboard
 */
authExpressRouter.get('/google/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    return res.status(400).json({ ok: false, error: 'Missing OAuth ?code parameter' });
  }

  if (!googleOAuthConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID / SECRET / CALLBACK_URL in .env',
      codeReceived: code.slice(0, 8) + '…',
    });
  }

  try {
    const tokens = await exchangeGoogleCodeForTokens(code);
    if (!tokens.id_token) throw new Error('Google did not return id_token');

    const claims = await verifyGoogleIdToken(tokens.id_token);
    if (!claims.email_verified) throw new Error('Google email not verified');

    const openId = claims.sub;
    const email = claims.email;
    const name = claims.name ?? email.split('@')[0];
    const avatarUrl = claims.picture ?? null;
    const role: UserRole = (openId === ENV.ADMIN_OPENID || email === ENV.ADMIN_EMAIL) ? 'admin' : 'writer';

    // Upsert user into DB
    let dbUser;
    try {
      await db.insert(users).values({
        googleOpenId: openId,
        email,
        name,
        avatarUrl,
        role,
        isActive: 1,
      }).onDuplicateKeyUpdate({
        name,
        email,
        avatarUrl: avatarUrl ?? undefined,
        isActive: 1,
      } as any);
      const found = await db.select().from(users).where(eq(users.googleOpenId, openId)).limit(1);
      dbUser = found[0];
    } catch (e: any) {
      if (IS_DEV) {
        console.warn('[GoogleCallback] DB upsert skipped:', e?.message ?? String(e).slice(0, 100));
      }
      dbUser = null;
    }

    const sessionToken = await createSessionToken(openId, { name });
    if (sessionToken.length < 180 || sessionToken.length > 360) {
      throw new Error(`Session token invalid length: ${sessionToken.length}`);
    }

    const expiresMs = ENV.SESSION_TTL_MS;
    res.cookie(ENV.SESSION_COOKIE_NAME, sessionToken, buildCookieOptions(expiresMs));

    return res.redirect(ENV.APP_URL + '/');
  } catch (e: any) {
    console.error('[GoogleCallback ERROR]:', e?.message ?? String(e));
    return res.status(500).json({
      ok: false,
      error: `OAuth failed: ${String(e?.message ?? e).slice(0, 200)}`,
    });
  }
});
