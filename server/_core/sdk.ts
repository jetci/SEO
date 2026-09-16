// EEAT Studio V2 · Server SDK (SIMPLIFIED — Phase 0 ONLY: signed JWT session tokens)
// NO OAuth/HTTP/axios — add those back in Phase 1.
// CRITICAL PATTERN FROM v1: createSessionToken → 199 bytes HS256 (NOT manual 869bytes SignJWT)
import { SignJWT, jwtVerify } from 'jose';
import { ENV } from './env.js';

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

/** session secret from env → TextEncoded (jose needs Uint8Array) */
function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(ENV.SESSION_SECRET);
}

/**
 * Build signed JWT session token for v2 cookie.
 * SA Mandate Token Length: ~199 bytes for standard openId (Google id format).
 * Same exact logic as v1 SDKServer.signSession.
 */
async function signSession(
  payload: SessionPayload,
  options: { expiresInMs?: number } = {},
): Promise<string> {
  const issuedAt = Date.now();
  const expiresMs = options.expiresInMs ?? ENV.SESSION_TTL_MS;
  const expSec = Math.floor((issuedAt + expiresMs) / 1000);
  return new SignJWT({
    openId: payload.openId,
    appId: payload.appId,
    name: payload.name,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(expSec)
    .sign(sessionSecret());
}

/** High level API — export name matches v1 for transplant convenience */
export async function createSessionToken(
  openId: string,
  options: { expiresInMs?: number; name?: string } = {},
): Promise<string> {
  return signSession(
    {
      openId,
      appId: 'eeat-studio-v2',
      name: options.name ?? '',
    },
    { expiresInMs: options.expiresInMs ?? ENV.SESSION_TTL_MS },
  );
}

/** Verify session cookie value → verified payload or null */
export async function verifySession(
  cookieValue: string | null | undefined,
): Promise<SessionPayload | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(String(cookieValue), sessionSecret(), {
      algorithms: ['HS256'],
    });
    let { openId, appId, name } = payload as Record<string, unknown>;
    // v1 hotfix pattern: fallback claim defaults
    if (typeof appId !== 'string' || appId.length === 0) appId = 'eeat-studio-v2';
    if (typeof name !== 'string' || name.length === 0)
      name = typeof openId === 'string' ? 'User_' + openId.slice(-6) : 'GoogleUser';
    if (
      typeof openId === 'string' && openId.length > 0 &&
      typeof appId === 'string' && appId.length > 0 &&
      typeof name === 'string' && name.length > 0
    ) {
      return { openId, appId, name };
    }
    return null;
  } catch {
    return null;
  }
}

/** Simple util: hash openId → deterministic positive int (for no-DB fallback user.id) */
export function hashOpenIdToId(openId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < openId.length; i++) {
    h ^= openId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) || 1;
}
