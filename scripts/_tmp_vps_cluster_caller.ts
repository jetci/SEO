process.chdir("/home/ubuntu/eeat-studio-v2");
import { config } from "dotenv";
config({ path: ".env" });
import { appRouter } from "./server/app.js";
import { db } from "./db/index.js";

(async () => {
  try {
    const SYSTEM_ADMIN_ID = 99001;
    const SYSTEM_TEAM_ID = 90001;
    const ADMIN_OPENID = "102308593207118714314";
    const ctx = {
      user: { id: SYSTEM_ADMIN_ID, role: "admin", teamId: SYSTEM_TEAM_ID, email: "scheduler@eeat.local", permission: "owner" as const, openId: ADMIN_OPENID },
      teamId: SYSTEM_TEAM_ID,
      req: undefined as any,
      res: undefined as any,
      session: { openId: ADMIN_OPENID, userId: SYSTEM_ADMIN_ID, teamId: SYSTEM_TEAM_ID, email: "scheduler@eeat.local", role: "admin" as const, iat: Date.now() / 1000, exp: Date.now() / 1000 + 86400 },
      db,
    } as any;
    console.log("[TRPC CALLER] ctx shape ok:", Object.keys(ctx));
    const caller = (appRouter as any).createCaller(ctx);
    console.log("[TRPC CALLER] caller created. keys:", Object.keys(caller).slice(0,8));
    console.log("[TRPC CALLER] keywords methods:", Object.keys(caller.keywords || {}).slice(0,12));
    const input = { projectId: 1, targetClusters: 9, longtailCount: 5 };
    console.log("[TRPC CALLER] Calling keywords.aiClusterize with input=", JSON.stringify(input));
    const t0 = Date.now();
    const res = await caller.keywords.aiClusterize(input);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log("[TRPC CALLER] RESULT @ " + dt + "s — typeof:", typeof res, "keys:", Object.keys(res || {}));
    console.log("[TRPC CALLER] JSON =", JSON.stringify(res, null, 2).slice(0, 5000));
    process.exit(0);
  } catch (e: any) {
    console.error("\n=============== [TRPC CALLER FATAL] ===============");
    console.error("Message:", e?.message ?? String(e));
    if (e?.code) console.error("Code:", e.code);
    if (e?.data?.httpStatus) console.error("HTTP:", e.data.httpStatus);
    if (e?.stack) console.error("\nSTACK:\n" + String(e.stack).slice(0, 6000));
    console.error("\nCause:", JSON.stringify(e?.cause ?? null, null, 2).slice(0, 2000));
    console.error("==================================================\n");
    process.exit(1);
  }
})();
