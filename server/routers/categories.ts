import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { protectedProcedure, TRPCError } from '../_core/middleware/rbac.js';
import { db } from '../../db/index.js';
import { categories } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { IS_DEV, ENV } from '../_core/env.js';

// WRITER-01: explicit opt-in mock guard. Default: NO mocks anywhere even locally.
const MOCK_CATEGORIES_ALLOWED = IS_DEV && String((ENV as any).CATEGORIES_MOCK_ENABLE || process.env.CATEGORIES_MOCK_ENABLE || '0') === '1';

export const categoriesRouter = router({
  list: protectedProcedure
    .input(z.object({
      includeInactive: z.boolean().optional().default(false),
    }).optional())
    .query(async ({ input }) => {
      try {
        const rows = await db
          .select()
          .from(categories)
          .where(input?.includeInactive ? undefined : eq(categories.isActive, 1))
          .orderBy(asc(categories.id));
        return rows as any[];
      } catch (e: any) {
        if (MOCK_CATEGORIES_ALLOWED) {
          console.warn('[categories.list] DB fallback mock (CATEGORIES_MOCK_ENABLE=1).', e?.message ?? String(e).slice(0, 100));
          return [
            { id: 1, name: 'ฟุตบอล', slug: 'football', icon: '⚽', isYmyl: 0, isActive: 1 },
            { id: 2, name: 'มวย', slug: 'boxing', icon: '🥊', isYmyl: 0, isActive: 1 },
            { id: 3, name: 'สล็อต', slug: 'slots', icon: '🎰', isYmyl: 1, isActive: 1 },
            { id: 4, name: 'หวย', slug: 'lottery', icon: '🎫', isYmyl: 1, isActive: 1 },
            { id: 5, name: 'คาสิโน', slug: 'casino', icon: '🎲', isYmyl: 1, isActive: 1 },
            { id: 6, name: 'ไก่ชน', slug: 'cockfighting', icon: '🐓', isYmyl: 0, isActive: 1 },
            { id: 7, name: 'วัวชน', slug: 'bullfighting', icon: '🐂', isYmyl: 0, isActive: 1 },
          ];
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 200) });
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(categories).where(eq(categories.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `Category ${input.id} not found.` });
      return row;
    }),
});

export default categoriesRouter;
