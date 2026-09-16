// EEAT Studio V2 · tRPC Core Initialization
// SA Mandate: context extracts session cookie → sdk.verifySession → attach user (or null)
import { initTRPC, TRPCError } from '@trpc/server';
import type { Request, Response } from 'express';
import { ENV, IS_DEV, IS_PROD, COOKIE_SAMESITE, COOKIE_SECURE } from './env.js';
import { verifySession, createSessionToken, type SessionPayload } from './sdk.js';
import type { User } from '../../db/schema.js';

export type Context = {
  req: Request;
  res: Response;
  session: SessionPayload | null;
  // Will be hydrated by RBAC middleware (0.4b) after DB conn available
  user: (User & { permission?: 'owner' | 'admin' | 'member' }) | null;  // ✅ SA L53: owner/admin/member ONLY (read/edit REMOVED)
};

type CreateContextOpts = {
  req: Request;
  res: Response;
};

/** Extract cookie domain (hostname) from ENV.APP_URL, or undefined if IP */
function sessionCookieDomain(): string | undefined {
  try {
    const u = new URL(ENV.APP_URL);
    const host = u.hostname;
    // Skip domain= for IP addresses / localhost (cookies won't work with domain attribute)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost' || host === '127.0.0.1') return undefined;
    // Hostname: strip leading www for site-wide cookie (sub-domains share)
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return undefined;
  }
}

// Helper: re-issue session cookie with sliding expiration.
// Session is valid + we re-sign NEW JWT with NEW 24h exp each request →
// cookie never expires as long as user is active (classic sliding session).
export async function touchSessionCookie(res: Response, session: SessionPayload) {
  try {
    const freshToken = await createSessionToken(session.openId, { name: session.name });
    if (freshToken && freshToken.length >= 180 && freshToken.length <= 360) {
      const expiresMs = ENV.SESSION_TTL_MS;
      const domain = sessionCookieDomain();
      res.cookie(ENV.SESSION_COOKIE_NAME, freshToken, {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE,
        maxAge: Math.floor(expiresMs / 1000),
        path: '/',
        ...(domain ? { domain } : {}),
      });
    }
  } catch {
    // Never block context on cookie renewal failure (best effort)
  }
}

/**
 * Build tRPC context for every request.
 * Reads cookie (ENV.SESSION_COOKIE_NAME) → verify via SDK (jose HS256).
 * NEVER throws here — invalid/expired cookie → session=null (publicProcedure handle it).
 * PHASE 2K SLIDING-SESSION RENEWAL: after verify OK → re-sign new JWT + Set-Cookie =
 *   new 24h expiration EACH valid request. Session valid while user active; never drops
 *   old cookie on idle after exactly 24h from first login.
 * Also fixes host-only cookie gap (domain attribute derived from APP_URL hostname).
 */
export async function createContext({ req, res }: CreateContextOpts): Promise<Context> {
  const cookieValue = req.cookies?.[ENV.SESSION_COOKIE_NAME] ?? null;
  const session = cookieValue ? await verifySession(cookieValue) : null;
  // SLIDING renewal touch: if session valid, issue new cookie (new 24h) every request
  if (session) await touchSessionCookie(res, session);
  return {
    req,
    res,
    session,
    user: null, // hydrated later in 0.4b RBAC
  };
}

const t = initTRPC.context<Context>().create({
  isDev: IS_DEV,
  errorFormatter({ shape, error }) {
    // Prod: hide internal stack traces
    if (IS_PROD && error.code === 'INTERNAL_SERVER_ERROR') {
      return { ...shape, message: 'Internal error' };
    }
    return shape;
  },
});

// ── Base procedures (export for use in all routers) ──────────────
export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;
export const middleware = t.middleware;
export { TRPCError };
