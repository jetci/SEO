// Centralized cookie utilities — DEBT-03b (sessionCookieDomain duplicated 2x removed)
// Exports: getSessionCookieDomain() → hostname derived from ENV.APP_URL (skip IP/localhost)
//          buildCookieOptions(expiresMs) → full res.cookie() options object
import { ENV, COOKIE_SAMESITE, COOKIE_SECURE } from '../env.js';

/** Extract cookie domain (hostname) from ENV.APP_URL, or undefined if IP/localhost. */
export function getSessionCookieDomain(): string | undefined {
  try {
    const u = new URL(ENV.APP_URL);
    const host = u.hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost' || host === '127.0.0.1') return undefined;
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return undefined;
  }
}

/** Build cookie options for res.cookie() — same defaults sliding-session + auth login. */
export function buildCookieOptions(expiresMs: number): Record<string, unknown> {
  const domain = getSessionCookieDomain();
  return {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: COOKIE_SECURE,
    maxAge: Math.floor(expiresMs / 1000),
    path: '/',
    ...(domain ? { domain } : {}),
  };
}
