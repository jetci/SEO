import { TRPCError } from '../middleware/rbac.js';

export function getInsertId(res: any): number {
  const tryNum = (v: any): number | null => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    return null;
  };

  if (res == null) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'INSERT failed: no valid insertId returned (null response). Please retry.' });
  }

  let found: number | null = null;

  if (Array.isArray(res)) {
    if (res.length > 0) found = tryNum((res as any)[0]?.insertId) ?? tryNum((res as any)[0]?.[0]?.insertId) ?? null;
    if (!found) found = tryNum((res as any).insertId);
    const first = (res as any)[0];
    if (!found && first && typeof first === 'object') {
      found = tryNum((first as any).insertId) ?? tryNum((first as any)[0]?.insertId) ?? null;
    }
  } else if (typeof res === 'object') {
    found = tryNum((res as any).insertId);
    if (!found) {
      const ok = (res as any).okPacket || (res as any).OkPacket || (res as any)[0];
      if (ok && typeof ok === 'object') found = tryNum((ok as any).insertId);
    }
  }

  if (!found || found <= 0) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'INSERT failed: no valid insertId returned, please retry.' });
  }
  return found;
}
