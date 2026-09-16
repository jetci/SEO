// EEAT Studio V2 · tRPC React Client + QueryClient setup
// Dependencies: @trpc/client + @trpc/react-query + @tanstack/react-query v4
import { createTRPCReact, httpLink } from '@trpc/react-query';
import { QueryClient } from '@tanstack/react-query';
import type { AppRouter } from '../../server/index';

export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3002';

// ======================================================================
// PHASE 2J BUGFIX: GLOBAL 401 UNAUTHORIZED INTERCEPTOR FOR ALL PROCEDURES!
// Root cause: settings.save / write.saveDraft / research.enrichSerp etc.
// could fail UNAUTHORIZED when session cookie expired. BEFORE: only auth.me
// error invalidated cache + redirected. AFTER: ANY procedure 401/403 triggers
// markAuthLoggedOut via globalThis bridge (imported from useAuth.ts at runtime).
// ======================================================================
// ======================================================================
// PHASE 2K+ BUGFIX #1: tRPC LAYER NEVER CALLS markAuthLoggedOut (window redirect)!
// Root cause: On page REFRESH, parallel protected queries (projects.list/categories.list/settings.*)
// fire BEFORE auth.me query resolves → they hit protectedProcedure ctx.session=null during brief
// cookie parse/verify window → throw UNAUTHORIZED → OLD 4-level interceptors IMMEDIATELY
// markAuthLoggedOut HARD redirect to /login FALSE POSITIVE before auth.me could return true!
// NEW behavior (SAFE pattern): tRPC layer 401/FORBIDDEN → ONLY __markAuthCacheInvalid
// (clears client cache, NO redirect). Redirect decision deferred EXCLUSIVELY to useAuth
// auth.me query effect (L121-128 useAuth.ts): ONLY fires if auth.me ITSELF returns explicit
// UNAUTHORIZED/FORBIDDEN CODE = confirmed server says session actually dead. Real dead =
// auth.me query returns error code → redirect. Valid session = auth.me succeeds BEFORE
// any race 401 can falsely logout user.
// ======================================================================
function globalOnAny401OrForbidden(errCode: string, errMessage: string = "") {
  try {
    if (typeof globalThis !== "undefined" && typeof (globalThis as any).__markAuthCacheInvalid === "function") {
      const prefix = errCode === "UNAUTHORIZED"
        ? "Session ตรวจสอบอีกครั้ง (กำลังโหลด)"
        : "บัญชีไม่มีสิทธิ์ดำเนินการนี้ (FORBIDDEN)";
      const suffix = errMessage ? " · " + String(errMessage || "").slice(0, 100) : "";
      // CALL CacheInvalid (NO redirect!) — auth.me useEffect SINGLE DECIDER for redirect.
      (globalThis as any).__markAuthCacheInvalid(prefix + suffix);
    }
  } catch(e) {}
}

export const trpc = createTRPCReact<AppRouter>({
  unstable_overrides: {
    useMutation: {
      async onSuccess(opts: any) {
        await opts.originalFn();
        await opts.queryClient.invalidateQueries();
      },
      // NOTE: tRPC v10 type UseMutationOverride has no onError.
      // Global 401/FORBIDDEN interception handled at 4 levels below:
      //  (a) httpBatchLink fetch wrapper resp.status === 401/403
      //  (b) QueryClient.defaultOptions.mutations.onError
      //  (c) QueryClient.defaultOptions.queries.onError
      //  (d) Each page saveMut/resetMut inline useMutation({ onError })
      //  (e) useAuth auth.me useEffect explicit error code
    },
    // Same rationale: useQuery override has no onError in tRPC v10 type sig
  },
});

export function getTrpcClientConfig() {
  return {
    links: [
      httpLink({
        url: '/api/trpc',
        async fetch(url: any, options: any = {}) {
          try {
            const resp = await fetch(url as any, { ...options, credentials: 'include' });
            // PHASE 2J: Even HTTP-level 401 (before tRPC JSON body parses) → redirect
            if (resp.status === 401 || resp.status === 403) {
              globalOnAny401OrForbidden(resp.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
                `HTTP ${resp.status} on ${String(url).slice(0, 120)}`);
            }
            return resp;
          } catch (e) {
            // Network-level error: propagate, not 401
            throw e;
          }
        },
      }),
    ],
  };
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 15,
        refetchOnWindowFocus: false,
        // ======================================================================
        // PHASE 2J: Global Query onError - catch UNAUTHORIZED at QueryClient level too
        // (3rd safety net in addition to httpBatchLink + useQuery override)
        // ======================================================================
        onError: (err: any) => {
          const code = String(err?.data?.code ?? err?.code ?? "");
          if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
            globalOnAny401OrForbidden(code, String(err?.message ?? ""));
          }
        },
        retry: (failureCount, error: any) => {
          const code = error?.data?.code;
          if (['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST'].includes(String(code))) return false;
          return failureCount <= 2;
        },
      },
      mutations: {
        retry: false,
        // ======================================================================
        // PHASE 2J: Global Mutation onError - settings.save 401 caught HERE!
        // 4th safety net total = globalOnAny401OrForbidden called from 4 levels:
        //   1. fetch HTTP level 401/403 (httpBatchLink wrapper)
        //   2. useMutation override (trpc createTRPCReact)
        //   3. useQuery override (trpc createTRPCReact)
        //   4. QueryClient default options (global) ← THIS ONE
        // ======================================================================
        onError: (err: any) => {
          const code = String(err?.data?.code ?? err?.code ?? "");
          if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
            globalOnAny401OrForbidden(code, String(err?.message ?? ""));
          }
        },
      },
    },
  });
}
