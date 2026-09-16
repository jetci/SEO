import * as cron from 'node-cron';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { articles, writeArticles } from '../../db/schema.js';
import { appRouter } from '../app.js';
import { VERCEL } from '../_core/env.js';

const SYSTEM_ADMIN_ID = 99001;
const SYSTEM_TEAM_ID = 90001;

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
      articleId: number; projectId: number | null; writeId: number; outline: any;
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
        });
      }
    }

    if (eligible.length === 0) return;

    console.log(`[SCHED CRON] Found ${eligible.length} scheduled articles due at ${now.toISOString()}`);

    const caller = (appRouter as any).createCaller({
      user: { id: SYSTEM_ADMIN_ID, role: 'admin', teamId: SYSTEM_TEAM_ID, email: 'scheduler@eeat.local' },
      req: undefined,
      res: undefined,
      session: undefined,
    });

    for (const item of eligible) {
      try {
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
          console.log(`[SCHED CRON] PUBLISHED OK article=${item.articleId} project=${item.projectId}`);
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
        const msg = String(err?.message || err).slice(0, 511);
        try {
          await db.update(writeArticles).set({
            errorMsg: `[SCHED_PUB_ERR] ${msg}`,
            updatedAt: new Date(),
          }).where(eq(writeArticles.id, item.writeId));
        } catch { /* ignore */ }
        console.error(`[SCHED CRON] PUBLISH EXCEPTION article=${item.articleId}:`, msg.slice(0, 160));
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
