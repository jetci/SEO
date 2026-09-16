// EEAT Studio V2 · Project-Level Team Permission Helper (SA Phase 1 Task 1.5)
// Reused in EVERY project/cluster/keyword/write procedure
import type { ProtectedCtx, TRPCError } from '../_core/middleware/rbac.js';
import { db } from '../../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { users, projects, teamMembers } from '../../db/schema.js';
import type { TeamPermission } from '../../shared/types.js';

/** Role hierarchy: owner > admin > member. Returns true if actor meets minRole. */
export function roleAtLeast(actor: TeamPermission, minRole: TeamPermission): boolean {
  const rank: Record<TeamPermission, number> = { member: 1, admin: 2, owner: 3 };
  return rank[actor] >= rank[minRole];
}

export interface ProjectAccess {
  userId: number;
  teamId: number;
  permission: TeamPermission;
}

/**
 * Asserts authenticated user is a member of the team that owns the project.
 * Returns the resolved access info (userId / teamId / permission).
 * Throws TRPCError(FORBIDDEN) if not a member or role below minRole.
 */
export async function assertProjectAccess(
  ctx: ProtectedCtx,
  projectId: number,
  opts: { minRole: TeamPermission },
  _TRPC: typeof TRPCError
): Promise<ProjectAccess> {
  const openId = ctx.session.openId;
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleOpenId, openId))
    .limit(1);
  if (!userRow) throw new _TRPC({ code: 'NOT_FOUND', message: 'User not found. Please sign in first.' });
  const userId = userRow.id;

  const [proj] = await db
    .select({ teamId: projects.teamId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj || !proj.teamId) throw new _TRPC({ code: 'NOT_FOUND', message: `Project ${projectId} not found or has no team.` });
  const teamId = proj.teamId;

  const [memberRow] = await db
    .select({ permission: teamMembers.permission })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  if (!memberRow) {
    throw new _TRPC({ code: 'FORBIDDEN', message: `Not a member of team (id=${teamId}) for this project.` });
  }
  const permission = memberRow.permission as TeamPermission;
  if (!roleAtLeast(permission, opts.minRole)) {
    throw new _TRPC({
      code: 'FORBIDDEN',
      message: `Requires role >= ${opts.minRole} on team. Your role: ${permission}`,
    });
  }
  return { userId, teamId, permission };
}

/** Like assertProjectAccess, but takes teamId directly (for create/list). */
export async function assertTeamAccess(
  ctx: ProtectedCtx,
  teamId: number,
  opts: { minRole: TeamPermission },
  _TRPC: typeof TRPCError
): Promise<{ userId: number; permission: TeamPermission }> {
  const openId = ctx.session.openId;
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleOpenId, openId))
    .limit(1);
  if (!userRow) throw new _TRPC({ code: 'NOT_FOUND', message: 'User not found.' });
  const userId = userRow.id;
  const [memberRow] = await db
    .select({ permission: teamMembers.permission })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  if (!memberRow) throw new _TRPC({ code: 'FORBIDDEN', message: `Not a member of team ${teamId}.` });
  const permission = memberRow.permission as TeamPermission;
  if (!roleAtLeast(permission, opts.minRole)) {
    throw new _TRPC({ code: 'FORBIDDEN', message: `Requires >= ${opts.minRole}. You are ${permission}.` });
  }
  return { userId, permission };
}

/** Returns teamIds that the current user is a member of (for list filtering). */
export async function userTeamIds(ctx: ProtectedCtx): Promise<number[]> {
  const openId = ctx.session.openId;
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleOpenId, openId))
    .limit(1);
  if (!userRow) return [];
  const rows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userRow.id));
  return rows.map(r => r.teamId);
}
