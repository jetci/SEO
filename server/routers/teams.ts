// EEAT Studio V2 · Teams tRPC Router (SA §4.2 + §4.3)
// G0.7 A-B: สร้างทีม / แสดงทีม / เพิ่มสมาชิก / เปลี่ยน permission สมาชิก
import { z } from 'zod';
import { router } from '../_core/trpc.js';
import { IS_DEV } from '../_core/env.js';
import { protectedProcedure, adminProcedure, TRPCError } from '../_core/middleware/rbac.js';
import { db } from '../../db/index.js';
import { teams, teamMembers, users } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { TEAM_PERMS } from '../../db/schema.js';
import type { TeamPermission } from '../../shared/types.js';
import { getInsertId } from '../_core/utils/insertId.js';

export const teamsRouter = router({
  /**
   * create: สร้างทีมใหม่ (owner = current user)
   * Required: isAuthenticated
   * Returns: new team row
   */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(2048).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const openId = ctx.session!.openId;
      let ownerId: number;

      try {
        const found = await db.select({ id: users.id }).from(users).where(eq(users.googleOpenId, openId)).limit(1);
        if (found.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found. Please sign in first.' });
        ownerId = found[0].id;
      } catch (e: any) {
        if (IS_DEV) {
          ownerId = 1;
          console.warn('[teams.create] DB unavailable, using fallback ownerId=1');
        } else {
          throw e;
        }
      }

      try {
        const inserted: any = await db.insert(teams).values({
          name: input.name,
          ownerId,
          description: input.description ?? null,
          isActive: 1,
        });
        const teamId: number = getInsertId(inserted);

        // Add creator as owner member
        await db.insert(teamMembers).values({
          teamId,
          userId: ownerId,
          permission: 'owner',
        });

        const [newTeam] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
        return { ok: true, team: newTeam, ownerId };
      } catch (e: any) {
        if (IS_DEV) {
          console.warn('[teams.create] DB insert skipped, returning mock:', e?.message ?? String(e).slice(0, 100));
          const mockTeamId = Date.now();
          return {
            ok: true,
            team: {
              id: mockTeamId,
              name: input.name,
              ownerId,
              description: input.description ?? null,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ownerId,
            mock: true,
          };
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to create team: ${String(e?.message ?? e).slice(0, 150)}` });
      }
    }),

  /**
   * list: แสดงรายการทีมของผู้ใช้ปัจจุบัน
   * Required: isAuthenticated
   * Returns: array of teams + user's permission in each team
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const openId = ctx.session!.openId;
    let userId: number;
    try {
      const found = await db.select({ id: users.id }).from(users).where(eq(users.googleOpenId, openId)).limit(1);
      if (found.length === 0) return { ok: true, teams: [] };
      userId = found[0].id;

      const members = await db.select({ teamId: teamMembers.teamId, permission: teamMembers.permission }).from(teamMembers).where(eq(teamMembers.userId, userId));
      if (members.length === 0) return { ok: true, teams: [] };
      const teamIds = members.map(m => m.teamId);
      const teamRows = await db.select().from(teams).where(inArray(teams.id, teamIds));
      const withPerm = teamRows.map(t => {
        const perm = members.find(m => m.teamId === t.id)?.permission ?? 'member';
        return { ...t, permission: perm as TeamPermission };
      });
      return { ok: true, teams: withPerm };
    } catch (e: any) {
      if (IS_DEV) {
        console.warn('[teams.list] DB unavailable, returning mock:', e?.message ?? String(e).slice(0, 100));
        return {
          ok: true,
          teams: [{
            id: 1,
            name: 'My Dev Team',
            ownerId: 1,
            description: 'Mock team for dev',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            permission: 'owner' as TeamPermission,
          }],
          mock: true,
        };
      }
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to list teams: ${String(e?.message ?? e).slice(0, 150)}` });
    }
  }),

  /**
   * addMember: เพิ่มสมาชิกในทีม (ต้องเป็น owner หรือ admin ของทีม)
   * Required: isAuthenticated + team permission owner/admin
   * Input: teamId, email, permission
   */
  addMember: protectedProcedure
    .input(z.object({
      teamId: z.number().int().positive(),
      email: z.string().email(),
      permission: z.enum(TEAM_PERMS as unknown as [string, ...string[]]).default('member'),
    }))
    .mutation(async ({ ctx, input }) => {
      const openId = ctx.session!.openId;
      let userId: number;
      try {
        const found = await db.select({ id: users.id }).from(users).where(eq(users.googleOpenId, openId)).limit(1);
        if (found.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
        userId = found[0].id;

        // Check actor permission in team
        const actor = await db.select({ permission: teamMembers.permission }).from(teamMembers)
          .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, userId))).limit(1);
        if (actor.length === 0 || !(actor[0].permission === 'owner' || actor[0].permission === 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only team owner/admin can add members.' });
        }

        // Find target user by email
        const target = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
        if (target.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Target user not found (user must sign in first).' });
        const targetId = target[0].id;

        // Check already exists
        const existing = await db.select().from(teamMembers)
          .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, targetId))).limit(1);
        if (existing.length > 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'User is already a member of this team.' });

        const inserted: any = await db.insert(teamMembers).values({
          teamId: input.teamId,
          userId: targetId,
          permission: input.permission as TeamPermission,
        });
        return { ok: true, added: true, teamMemberId: getInsertId(inserted) };
      } catch (e: any) {
        if (IS_DEV && e?.code !== 'FORBIDDEN' && e?.code !== 'NOT_FOUND') {
          console.warn('[teams.addMember] DB skipped, mock success:', e?.message ?? String(e).slice(0, 100));
          return { ok: true, added: true, teamMemberId: Date.now(), mock: true };
        }
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 150) });
      }
    }),

  /**
   * changePermission: เปลี่ยน permission ของสมาชิก (ต้องเป็น owner ของทีมเท่านั้น)
   * Required: isAuthenticated + team owner
   * Input: teamId, targetUserId, permission
   */
  changePermission: protectedProcedure
    .input(z.object({
      teamId: z.number().int().positive(),
      targetUserId: z.number().int().positive(),
      permission: z.enum(TEAM_PERMS as unknown as [string, ...string[]]),
    }))
    .mutation(async ({ ctx, input }) => {
      const openId = ctx.session!.openId;
      try {
        const found = await db.select({ id: users.id }).from(users).where(eq(users.googleOpenId, openId)).limit(1);
        if (found.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
        const actorId = found[0].id;

        // Actor must be owner of team
        const actor = await db.select({ permission: teamMembers.permission }).from(teamMembers)
          .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, actorId))).limit(1);
        if (actor.length === 0 || actor[0].permission !== 'owner') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only team OWNER can change member permissions.' });
        }

        // Cannot change owner via this route
        if (input.permission === 'owner') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Use transfer route to change owner.' });
        }

        const updated: any = await db.update(teamMembers)
          .set({ permission: input.permission as TeamPermission })
          .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.targetUserId)));
        return { ok: true, affected: Number(updated[0]?.affectedRows ?? updated.affectedRows ?? (updated as any)?.[0]?.affectedRows ?? 0) };
      } catch (e: any) {
        if (IS_DEV && e?.code !== 'FORBIDDEN' && e?.code !== 'NOT_FOUND' && e?.code !== 'BAD_REQUEST') {
          console.warn('[teams.changePermission] DB skipped, mock success:', e?.message ?? String(e).slice(0, 100));
          return { ok: true, affected: 1, mock: true };
        }
        throw e instanceof TRPCError ? e : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(e?.message ?? e).slice(0, 150) });
      }
    }),
});

export default teamsRouter;
