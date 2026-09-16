// ─────────────────────────────────────────────────────────────
// EEAT Studio V2 — Local Dev Server Entry (PORT 3002)
// Vercel Serverless uses ../api/index.ts → createApp() factory instead
// ─────────────────────────────────────────────────────────────
import { ENV } from './_core/env.js';
import { createApp, appRouter } from './app.js';
import startSchedulerWorker from './workers/schedulerWorker.js';

export type AppRouter = typeof appRouter;
export { appRouter };

const { app } = createApp();
const PORT = ENV.PORT;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[V2] Phase 1 Server OK → http://localhost:${PORT}/api/health`);
  console.log(`[V2] tRPC endpoint  → http://localhost:${PORT}/api/trpc`);
  console.log(`[V2] Auth routes    → http://localhost:${PORT}/api/auth/google/login`);
  startSchedulerWorker();
});

export default app;

