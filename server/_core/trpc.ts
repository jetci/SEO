// EEAT Studio V2 · tRPC Core Initialization
// SA Mandate: context extracts session cookie → sdk.verifySession → attach user (or null)
import { initTRPC, TRPCError } from '@trpc/server';
import type { Request, Response } from 'express';
import { ENV, IS_DEV, IS_PROD } from './env.js';
import { verifySession, createSessionToken, type SessionPayload } from './sdk.js';
import type { User } from '../../db/schema.js';
import { buildCookieOptions } from './utils/cookies.js';

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

export async function touchSessionCookie(res: Response, session: SessionPayload) {
  try {
    const freshToken = await createSessionToken(session.openId, { name: session.name });
    if (freshToken && freshToken.length >= 180 && freshToken.length <= 360) {
      const expiresMs = ENV.SESSION_TTL_MS;
      res.cookie(ENV.SESSION_COOKIE_NAME, freshToken, buildCookieOptions(expiresMs));
    }
  } catch {
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
    if (IS_PROD) {
      const safeCodesGeneric: Array<string> = ['INTERNAL_SERVER_ERROR', 'TIMEOUT', 'CONFLICT', 'PRECONDITION_FAILED', 'PAYLOAD_TOO_LARGE', 'METHOD_NOT_SUPPORTED'];
      if (safeCodesGeneric.includes(error.code)) {
        return { ...shape, message: `${error.code}: Request failed.` };
      }
      return {
        ...shape,
        data: { code: shape.data?.code, httpStatus: shape.data?.httpStatus, path: undefined, stack: undefined },
        message: /trace|teamId|team_id|permission|role|schema|DESCRIBE|ALTER|INSERT|UPDATE|DELETE|SELECT\b.*FROM|mariadb|mysql|sql|Error:|errno:|sqlState|code:\s*['"]?ER_/i.test(String(shape.message))
          ? `${error.code}: Request failed.`
          : shape.message,
      };
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
