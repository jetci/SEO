// EEAT Studio V2 · useAuth — Auth hook + Session guard
import { trpc } from '../trpc';
import { useCallback, useEffect } from 'react';

// ======================================================================
// PHASE 2I BUGFIX: SESSION CACHE ACROSS ROUTE REMOUNTS
// Root cause: Menu click → React route remount → new useAuth instance
// → isLoggedIn defaults false 100-500ms WHILE fetching → old redirect
// timeout guard fired before server returned true = force logout loop.
// This module-level singleton cache survives route remounts. Refresh:
//   a) On successful me.data=true → cache true (keeps isLoggedIn=true BRIEFLY across route mount - fetch window)
//   b) On EXPLICIT UNAUTHORIZED server error code → cache cleared (confirmed logout)
// Cache TTL: 5 min (plenty for SPA navigation / menu clicks)
// ======================================================================
// ======================================================================
// PHASE 2J BUGFIX: GLOBAL markAuthLoggedOut() FOR ANY PROCEDURE 401
// Root cause: cache 5min made isLoggedIn=true but backend session cookie
// expired → settings.save / write.saveDraft / any proc fails UNAUTHORIZED.
// Only auth.me error invalidated cache → cache stale false login UI.
// Call markAuthLoggedOut() from ANY 401 handler (global tRPC onError too).
// Also exports getAuthCacheStatus() for tests.
// ======================================================================
type AuthCache = { isLoggedIn: boolean; user: any | null; cachedAt: number };
const _CACHE_TTL_MS = 1000 * 60 * 5;
const _authCache: AuthCache = { isLoggedIn: false, user: null, cachedAt: 0 };

// EXPORTED global helper — callable from ANYWHERE (no hook context needed)
// Clears module-level auth cache + forces redirect to login + toast.
export function markAuthLoggedOut(reason: string = "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่") {
  _authCache.isLoggedIn = false;
  _authCache.user = null;
  _authCache.cachedAt = 0;
  // Optional toast if sonner available at runtime
  try { (globalThis as any).__sonner_toast?.error?.(reason); } catch(e) {}
  // Hard redirect SPA to login (wouter useLocation via setTimeout avoids race)
  const redirect = () => {
    const cur = String(window.location.pathname || "/");
    if (cur !== "/login" && cur !== "/signin" && cur !== "/oauth/google/callback") {
      window.location.href = "/login?next=" + encodeURIComponent(cur);
    }
  };
  if (typeof window !== "undefined") {
    if (document.readyState === "complete") redirect();
    else window.addEventListener("load", redirect, { once: true });
  }
}

// ======================================================================
// PHASE 2K+ BUGFIX: markAuthCacheInvalid ONLY FOR 401/FORBIDDEN from tRPC LAYER (not auth.me)!
// Root cause: On page refresh, parallel projects.list, categories.list fire BEFORE auth.me
// resolves → cold cache cookie not yet read → protectedProcedure throws UNAUTHORIZED →
// OLD global 4-level interceptors IMMEDIATELY redirect login FALSE POSITIVE before auth.me
// could return {isLoggedIn:true}! NEW behavior: tRPC layer 401 ONLY invalidates cache,
// NEVER redirects. Redirect decision deferred EXCLUSIVELY to useAuth me.error useEffect
// (server explicit UNAUTHORIZED/FORBIDDEN CODE on auth.me query ITSELF = real dead session).
// Also invalidates → next auth.me staleTime check triggers refetch (refetchOnMount:true).
// ======================================================================
export function markAuthCacheInvalid(reason: string = "") {
  _authCache.isLoggedIn = false;
  _authCache.user = null;
  _authCache.cachedAt = 0;
  // OPTIONAL toast (sonner), but NOT redirect.
  try { if (reason && (globalThis as any).__sonner_toast) (globalThis as any).__sonner_toast.error?.(reason); } catch(e) {}
  // NO window.location.href = "/login" here; defer decision ONLY to auth.me useAuth effect!
}

export function getAuthCacheStatus() {
  return {
    isLoggedIn: _authCache.isLoggedIn,
    hasUser: !!_authCache.user,
    ageMs: _authCache.cachedAt ? Date.now() - _authCache.cachedAt : Infinity,
    ttlMs: _CACHE_TTL_MS,
  };
}

// Attach to globalThis so tRPC.ts / any vanilla module (no React) can call
if (typeof globalThis !== "undefined") {
  (globalThis as any).__markAuthLoggedOut = markAuthLoggedOut;
  (globalThis as any).__markAuthCacheInvalid = markAuthCacheInvalid;
  (globalThis as any).__getAuthCacheStatus = getAuthCacheStatus;
}

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  openId: string;
  role: 'admin' | 'writer';
  permission?: 'owner' | 'admin' | 'member';
  avatarUrl?: string | null;
};

export function isUserAdminOrOwner(u: CurrentUser | null | undefined): boolean {
  if (!u) return false;
  return u.role === 'admin' || u.permission === 'owner' || u.permission === 'admin';
}

export function useAuth() {
  const me = trpc.auth.me.useQuery(undefined, {
    retry: (_f: number, err: any) => err?.data?.code !== 'UNAUTHORIZED' && err?.data?.code !== 'FORBIDDEN',
    // ============================================================
    // FIX #2: refetchOnWindowFocus = FALSE — matches trpc.ts L38 global default
    // Root cause: Click menu → browser focus event fires + old hook had true (override global)
    // → spurious refetch every route change → me.data cleared during fetch →
    // MainDashboardShell redirect timer saw brief isLoggedIn=false → logout loop.
    // ============================================================
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    staleTime: 1000 * 30,
    cacheTime: 1000 * 60 * 5,
  });

  const devSignin = trpc.auth.devSignin.useMutation();
  const logout = trpc.auth.logout.useMutation();

  // ============================================================
  // FIX #1: Cached login hint survives route remount
  // Fallback order:
  //   1. Current me.data (if already resolved) → takes priority over cache
  //   2. Module cache hint (if TTL fresh AND no explicit UNAUTHORIZED error yet)
  //      → bridges the mount->fetch 100-500ms window so isLoggedIn never falsely false
  // While fetching: if cache says user was logged in 5min ago AND no explicit error yet
  // → isLoggedIn=true (optimistic, will flip to false only if server returns UNAUTHORIZED code)
  // ============================================================
  const cacheFresh =
    _authCache.isLoggedIn &&
    (Date.now() - _authCache.cachedAt) < _CACHE_TTL_MS &&
    me.error?.data?.code !== 'UNAUTHORIZED';

  const loggedInData = !!(me.data?.isLoggedIn && me.data?.user);
  const isLoggedIn = loggedInData || cacheFresh;
  const user: CurrentUser | null = (me.data?.user as any ?? null) || (cacheFresh ? (_authCache.user as any) : null);

  // ============================================================
  // Sync cache AFTER each query success or EXPLICIT UNAUTHORIZED error
  // ============================================================
  useEffect(() => {
    if (me.data?.isLoggedIn && me.data?.user) {
      _authCache.isLoggedIn = true;
      _authCache.user = me.data.user;
      _authCache.cachedAt = Date.now();
    }
  }, [me.data?.isLoggedIn, me.data?.user]);

  useEffect(() => {
    if (me.error?.data?.code === 'UNAUTHORIZED' || me.error?.data?.code === 'FORBIDDEN') {
      // EXPLICIT server rejection (NOT a race/fetch-in-flight): clear cache + GLOBAL redirect handler
      markAuthLoggedOut(me.error?.data?.code === 'UNAUTHORIZED'
        ? 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่ (UNAUTHORIZED)'
        : 'บัญชีไม่มีสิทธิ์เข้าถึงหน้านี้ (FORBIDDEN)');
    }
  }, [me.error?.data?.code]);

  const requireLoginMsg = me.error?.data?.code === 'UNAUTHORIZED'
    ? 'Please sign in via Google or use Dev signin.'
    : me.error?.message ?? null;

  const signInDev = useCallback(async (openIdOverride?: string) => {
    const input: any = openIdOverride ? { openId: openIdOverride } : {};
    const res = await devSignin.mutateAsync(input);
    await me.refetch();
    return res;
  }, [devSignin, me]);

  const loginWithMock = useCallback(async (picked: any) => {
    const isAdmin = picked?.role === 'admin';
    const pwd = String(picked?.password || '').trim();
    const input: any = isAdmin
      ? {
          openId: '102308593207118714314',
          name: 'Admin Intelman',
          email: 'intelman26@gmail.com',
          role: 'admin',
          avatarUrl: 'https://i.pravatar.cc/128?img=1',
          password: pwd,
        }
      : {
          openId: picked?.openId ?? (picked?.email ? `mock-${picked.email.replace(/[^a-zA-Z0-9]/g, '_')}` : undefined),
          name: picked?.name ?? 'Demo User',
          email: picked?.email ?? 'demo@eeat-pro.local',
          role: (picked?.role === 'admin') ? 'admin' : 'writer',
          avatarUrl: picked?.avatarUrl ?? undefined,
          password: pwd,
        };
    const res = await devSignin.mutateAsync(input);
    await me.refetch();
    return res;
  }, [devSignin, me]);

  const signOut = useCallback(async () => {
    await logout.mutateAsync();
    _authCache.isLoggedIn = false;
    _authCache.user = null;
    _authCache.cachedAt = 0;
    await me.refetch();
  }, [logout, me]);

  return {
    me, user, isLoggedIn,
    isAuthenticated: isLoggedIn,
    // ✅ FIX Infinite Loading (CT-02 EMERGENCY 2026-09-20): old condition 3 (!loggedInData && !cacheFresh && !me.error)
    //     = TRUE forever when auth.me returned {isLoggedIn:false, user:null} (NO SESSION yet)
    //     → loading=true forever → GuardSpinner never exits → Redirect /login NEVER fires.
    // NEW: additionally require !me.data (only true WHILE query is IN FLIGHT, not AFTER it resolved with negative answer)
    //     → After query resolves (data exists, even isLoggedIn=false), loading=false → RequireAuth can redirect to Login.
    loading: me.isLoading || me.isFetching || (!loggedInData && !cacheFresh && !me.error && !me.data),
    error: requireLoginMsg,
    signInDev, signOut, loginWithMock, logout: signOut,
    refetch: () => me.refetch(),
    refresh: () => me.refetch(),
  };
}

export default useAuth;
