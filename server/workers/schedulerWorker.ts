import * as cron from 'node-cron';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { articles, writeArticles, projects, teams, users } from '../../db/schema.js';
import { appRouter } from '../app.js';
import { VERCEL, ENV } from '../_core/env.js';

const SYSTEM_ADMIN_ID = 99001;

type CronTask = ReturnType<typeof cron.schedule>;
let cronTask: CronTask | null = null;

function parseOutlineJson(outlineJson: string | null | undefined): any {
  if (!outlineJson) return {};
  try {
    return typeof outlineJson === 'string' ? JSON.parse(outlineJson) : outlineJson;
  } catch {
    return {};
  }
}

function stringifyOutlineJson(obj: any): string {
  return JSON.stringify(obj ?? {});
}

/**
 * SCHED-01: Build a tRPC caller context enriched to act as the OWNER of the given teamId.
 * Resolves chain: project.teamId → teams.ownerId → users.googleOpenId.
 * Falls back to ENV.ADMIN_OPENID if any DB step fails (belt-and-suspenders for DB bootstrap).
 */
async function buildSystemCallerForTeam(teamId: number | null | undefined) {
  let ownerOpenId = String(ENV.ADMIN_OPENID || 'intelman26@gmail.com').trim();
  let ownerUserId = SYSTEM_ADMIN_ID;
  let ownerEmail = 'scheduler@eeat.local';
  let resolvedTeamId = Number(teamId ?? ENV.DEFAULT_ADMIN_TEAM_ID);

  try {
    if (teamId && Number(teamId) > 0) {
      const [teamRow] = await db
        .select({ ownerId: teams.ownerId })
        .from(teams)
        .where(eq(teams.id, Number(teamId)))
        .limit(1);
      if (teamRow?.ownerId) {
        const [userRow] = await db
          .select({ googleOpenId: users.googleOpenId, id: users.id, email: users.email })
          .from(users)
          .where(eq(users.id, Number(teamRow.ownerId)))
          .limit(1);
        if (userRow) {
          ownerOpenId = String(userRow.googleOpenId || ownerOpenId).trim();
          ownerUserId = Number(userRow.id || ownerUserId);
          ownerEmail = String(userRow.email || ownerEmail).trim();
          resolvedTeamId = Number(teamId);
        }
      }
    }
  } catch (resolveErr: any) {
    // Fall through to default system admin context, don't crash tick.
    if (String(process.env.NODE_ENV || '').trim() === 'development') {
      console.warn(`[SCHED WARN] buildSystemCallerForTeam resolve failed (teamId=${teamId}): ${String(resolveErr?.message || resolveErr).slice(0,120)}`);
    }
  }

  return (appRouter as any).createCaller({
    user: {
      id: ownerUserId,
      role: 'admin',
      teamId: resolvedTeamId,
      email: ownerEmail,
      permission: 'owner',
      isActive: 1,
    },
    authMeta: {
      role: 'admin',
      teamId: resolvedTeamId,
    } as any,
    req: undefined,
    res: undefined,
    session: { openId: ownerOpenId, teamId: resolvedTeamId, issuedAt: Date.now() },
  });
}

async function scheduledPublishTick() {
  try {
    const now = new Date();
    const allRows = await db
      .select({
        articleId: writeArticles.articleId,
        projectId: articles.projectId,
        writeId: writeArticles.id,
        stepStatus: writeArticles.stepStatus,
        outlineJson: writeArticles.outlineJson,
      })
      .from(writeArticles)
      .innerJoin(articles, eq(articles.id, writeArticles.articleId))
      .where(and(
        eq(writeArticles.stepStatus, 'done'),
        eq(articles.status, 'draft'),
        isNotNull(writeArticles.outlineJson),
      ))
      .limit(50);

    if (allRows.length === 0) return;

    const eligible: Array<{
      articleId: number; projectId: number | null; writeId: number; outline: any; teamId: number | null;
    }> = [];

    for (const row of allRows) {
      const outline = parseOutlineJson(row.outlineJson);
      const scheduledAt = outline?.__scheduled_at;
      if (!scheduledAt) continue;
      const schedDate = new Date(scheduledAt);
      if (isNaN(schedDate.getTime())) continue;
      if (schedDate <= now && !outline?.__published) {
        eligible.push({
          articleId: Number(row.articleId),
          projectId: row.projectId ? Number(row.projectId) : null,
          writeId: Number(row.writeId),
          outline,
          teamId: null,
        });
      }
    }

    if (eligible.length === 0) return;

    // Resolve teamId for each eligible item (projects.teamId) — do bulk to avoid N+1.
    const projectIds = [...new Set(eligible.map(x => x.projectId).filter((x): x is number => Number(x) > 0))];
    if (projectIds.length) {
      const projRows = await db
        .select({ id: projects.id, teamId: projects.teamId })
        .from(projects)
        .where(eq(projects.id, projectIds[0]));
      const projMap = new Map<number, number | null>();
      for (const pr of projRows) projMap.set(Number(pr.id), pr.teamId ? Number(pr.teamId) : null);
      // Fill remaining projectIds with individual queries if >1 (rare)
      for (let i = 1; i < projectIds.length; i++) {
        try {
          const [pr] = await db.select({ id: projects.id, teamId: projects.teamId }).from(projects).where(eq(projects.id, projectIds[i])).limit(1);
          if (pr) projMap.set(Number(pr.id), pr.teamId ? Number(pr.teamId) : null);
        } catch {}
      }
      for (const it of eligible) {
        if (it.projectId && projMap.has(Number(it.projectId))) it.teamId = projMap.get(Number(it.projectId)) ?? null;
      }
    }

    console.log(`[SCHED CRON] Found ${eligible.length} scheduled articles due at ${now.toISOString()}`);

    for (const item of eligible) {
      try {
        // SCHED-01: Build per-team caller so assertProjectAccess finds real owner in team_members → minRole=admin PASS
        const caller = await buildSystemCallerForTeam(item.teamId);
        const pubRes = await caller.write.publish({ draftId: item.articleId });
        if (pubRes?.ok) {
          const updatedOutline = { ...item.outline };
          delete updatedOutline.__scheduled_at;
          updatedOutline.__published = true;
          updatedOutline.__published_at = now.toISOString();
          try {
            await db.update(writeArticles).set({
              outlineJson: stringifyOutlineJson(updatedOutline),
              updatedAt: new Date(),
            }).where(eq(writeArticles.id, item.writeId));
          } catch (updErr: any) {
            console.warn(`[SCHED CRON] outlineJson update fail article=${item.articleId}:`, String(updErr?.message || updErr).slice(0, 120));
          }
          console.log(`[SCHED CRON] PUBLISHED OK article=${item.articleId} project=${item.projectId} team=${item.teamId}`);
        } else {
          const msg = String(pubRes?.message || 'publish returned not ok').slice(0, 511);
          try {
            await db.update(writeArticles).set({
              errorMsg: `[SCHED_PUB_FAIL] ${msg}`,
              updatedAt: new Date(),
            }).where(eq(writeArticles.id, item.writeId));
          } catch { /* ignore */ }
          console.error(`[SCHED CRON] PUBLISH NOK article=${item.articleId}:`, msg.slice(0, 160));
        }
      } catch (err: any) {
        const code = String(err?.code || '').toUpperCase();
        const rawMsg = String(err?.message || err).slice(0, 511);
        const isRbacForbidden = code === 'FORBIDDEN' || rawMsg.includes('Not a member') || rawMsg.includes('Requires role');
        const taggedMsg = isRbacForbidden
          ? `[FORBIDDEN_BY_RBAC] ${rawMsg}`
          : `[SCHED_PUB_ERR] ${rawMsg}`;
        try {
          await db.update(writeArticles).set({
            errorMsg: taggedMsg,
            updatedAt: new Date(),
          }).where(eq(writeArticles.id, item.writeId));
        } catch { /* ignore */ }
        console.error(`[SCHED CRON] PUBLISH EXCEPTION article=${item.articleId} team=${item.teamId}:`, rawMsg.slice(0, 160));
      }
    }
  } catch (e: any) {
    console.error('[SCHED CRON] tick ERROR:', String(e?.message || e).slice(0, 512));
  }
}

export function startSchedulerWorker() {
  if (cronTask) {
    console.warn('[SCHED CRON] Already started — skipping duplicate start');
    return cronTask;
  }

  if (VERCEL) {
    console.log('[SCHED CRON] Skipped on Vercel Serverless (cron requires long-running process). Use external cron ping or deploy dedicated worker.');
    return null;
  }

  cronTask = cron.schedule('* * * * *', scheduledPublishTick, {
    timezone: 'Asia/Bangkok',
  } as any);

  setTimeout(() => {
    void scheduledPublishTick();
  }, 8000);

  console.log('[SCHED CRON] Started — runs EVERY MINUTE (* * * * *) Asia/Bangkok. Checking outlineJson.__scheduled_at < NOW().');

  process.once('SIGTERM', () => {
    if (cronTask) cronTask.stop();
  });
  process.once('SIGINT', () => {
    if (cronTask) cronTask.stop();
  });

  return cronTask;
}

export { scheduledPublishTick };
export default startSchedulerWorker;
