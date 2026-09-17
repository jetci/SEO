// EEAT Studio V2 · RBAC Middleware (SA §4.1 users roles admin/writer ONLY — viewer REMOVED!)
import { ENV, IS_DEV } from '../env.js';
import { publicProcedure, middleware, TRPCError } from '../trpc.js';
import type { UserRole } from '../../../shared/types.js';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Resolve effective role — works for both Phase 0 (no DB) and Phase 1+ (DB hydrated).
 * Priority:
 *   1. ctx.user.role (drizzle users row hydrated → production source)
 *   2. ctx.session.openId === ENV.ADMIN_OPENID → admin (Phase 0 dev signin fallback → SA mandate)
 *   3. default → 'writer' (LEAST PRIVILEGE, SA L46 only has admin/writer! viewer REMOVED)
 */
export function resolveRole(ctx: { user?: { role?: string } | null; session?: { openId?: string } | null }): UserRole {
  if (ctx.user?.role && typeof ctx.user.role === 'string') {
    const r = ctx.user.role;
    if (r === 'admin' || r === 'writer') return r as UserRole;  // ✅ SA L46: admin/writer ONLY (viewer REMOVED)
  }
  if (ctx.session?.openId && ctx.session.openId === ENV.ADMIN_OPENID) {
    return 'admin';
  }
  return 'writer'; // ✅ LEAST PRIVILEGE DEFAULT (writer = lowest possible SA enum. NO viewer!)
}

// ── MIDDLEWARE 1: isAuthenticated ───────────────────────────────
// Enforce: ctx.session exists AND ctx.session.openId non-empty string
// Guarantees downstream code: ctx.session is NOT null (typescript narrowed)
export const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.session || typeof ctx.session.openId !== 'string' || ctx.session.openId.length === 0) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: IS_DEV
        ? 'Session required — use auth.devSignin in dev mode or login via Google.'
        : 'Authentication required.',
    });
  }
  // Pre-resolve role once, attach lightweight hint to ctx for traces
  const role = resolveRole({ user: ctx.user, session: ctx.session });
  return next({
    ctx: {
      ...ctx,
      session: ctx.session, // TS narrowed (non-null after guard)
      authMeta: { authenticatedAt: Date.now(), role },
    },
  });
});

// ── MIDDLEWARE 2: isAdmin ────────────────────────────────────────
// Requires: isAuthenticated has run first (chain)
// Guarantees: role === 'admin' downstream
export const isAdmin = middleware(async ({ ctx, next }) => {
  // Re-check session (in case someone chains without isAuthenticated — safe guard)
  if (!ctx.session || typeof ctx.session.openId !== 'string' || ctx.session.openId.length === 0) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Login required.' });
  }
  const role = resolveRole({ user: ctx.user, session: ctx.session });
  if (role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: IS_DEV
        ? `Admin only — your role is '${role}'. Hint: use openId=${ENV.ADMIN_OPENID.slice(0,8)}… to become admin.`
        : 'Admin access required.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      authMeta: { authenticatedAt: Date.now(), role: 'admin' as const },
    },
  });
});

// ── MIDDLEWARE 3: hydrateUser ────────────────────────────────────
// Requires: isAuthenticated has run (ctx.session.openId exists)
// Action: Query DB users table by googleOpenId → attach ctx.user
// Guarantees: ctx.user is User object (from DB) OR null (if user row not yet created)
export const hydrateUser = middleware(async ({ ctx, next }) => {
  const openId = ctx.session?.openId;
  if (!openId) {
    return next({ ctx });
  }
  try {
    const rows = await db.select().from(users).where(eq(users.googleOpenId, openId)).limit(1);
    if (rows && rows.length > 0) {
      const u = rows[0] as any;
      // Normalize isActive: DB tinyint(1) → boolean for ctx
      return next({
        ctx: {
          ...ctx,
          user: { ...u, isActive: !!u.isActive } as any,
        },
      });
    }
  } catch (e) {
    // DB down or schema error: do NOT throw — fall back to ctx.user = null; resolveRole handles it
    if (IS_DEV) {
      console.warn('[hydrateUser] DB query skipped:', e instanceof Error ? e.message : String(e).slice(0, 100));
    }
  }
  return next({ ctx });
});

// ── EXPORTABLE PROCEDURES (use in all routers: teams/settings/projects etc.) ──
export const protectedProcedure = publicProcedure.use(isAuthenticated).use(hydrateUser);
export const adminProcedure = protectedProcedure.use(isAdmin);

// ── Type helpers for downstream routers ──────────────────────────
export type ProtectedCtx = {
  req: import('express').Request;
  res: import('express').Response;
  session: import('../sdk.js').SessionPayload;
  user: (import('../../../db/schema.js').User & { permission?: 'owner' | 'admin' | 'member' }) | null;
  authMeta: { authenticatedAt: number; role: 'admin' | 'writer' };
};
export type AdminCtx = ProtectedCtx & {
  authMeta: { authenticatedAt: number; role: 'admin' };
};
export { TRPCError } from '../trpc.js';
