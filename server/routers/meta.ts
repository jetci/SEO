// EEAT Studio V2 · Meta tRPC Router (SA Phase 1 Task 1.1.2)
// Shared dropdown data that doesn't need project-scope permission checks:
//   · categories.list → isActive=1 sorted (G1.2 — feeds category dropdown in Project form)
import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { protectedProcedure, TRPCError } from '../_core/middleware/rbac.js';
import { db } from '../../db/index.js';
import { categories } from '../../db/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';

export const metaRouter = router({
  categories: router({
    /**
     * List active categories for dropdowns (name, slug, isYmyl badge, icon).
     * G1.2: Reads live from DB table categories. NEVER hardcoded on client.
     * Order: sort_order ASC, name ASC.
     */
    list: protectedProcedure
      .input(z.object({ includeInactive: z.boolean().optional().default(false) }))
      .query(async ({ input }) => {
        try {
          const rows = await db
            .select({
              id: categories.id,
              name: categories.name,
              slug: categories.slug,
              icon: categories.icon,
              isYmyl: categories.isYmyl,
              sortOrder: categories.sortOrder,
            })
            .from(categories)
            .where(input.includeInactive ? undefined : eq(categories.isActive, 1))
            .orderBy(asc(categories.sortOrder), asc(categories.name));
          return { ok: true, count: rows.length, categories: rows };
        } catch (e: any) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[meta.categories.list] DB unavailable; fallback empty.', e?.message ?? String(e).slice(0, 80));
            return { ok: true, count: 0, categories: [], mock: true };
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
        }
      }),
  }),
});

export default metaRouter;
