import { NextResponse } from "next/server";
import { cronAuthorized } from "@/features/outreach/cron";
import { closeIdleConversations, getAgentDeps, getCloseDeps } from "@/features/wa-agent";
import { runFollowups } from "@/features/wa-agent/followup";
import { templateStatus } from "@/features/whatsapp/template-status";
import { getWaCloud, waCloudIsReal } from "@/integrations/wa-cloud";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * F45 · Every 10 minutes (GitHub Actions, .github/workflows/wa-agent-cron.yml; Vercel's daily meta-ads-sync is the
 * fallback for closing): closes quiet conversations, sends due follow-ups and refreshes the template statuses.
 * Each step reports on its own; one failing never hides the others.
 */
export async function GET(req: Request) {
  const env = getEnv();
  if (!cronAuthorized(req, env.CRON_SECRET)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return withDb(async (db) => {
    const msg = (e: unknown) => ({ error: e instanceof Error ? e.message.slice(0, 200) : "failed" });
    const closed = await closeIdleConversations(db, getCloseDeps(env)).catch(msg);
    const followups = await runFollowups(db, getAgentDeps(env), { afterMin: env.WA_FOLLOWUP_AFTER_MIN, max: Math.floor(env.WA_FOLLOWUP_MAX) }).catch(msg);
    const templates = waCloudIsReal(env)
      ? await templateStatus(db, getWaCloud(env))
          .then((s) => ({ checkedAt: s.checkedAt, approved: Object.values(s.statuses).filter((v) => v === "APPROVED").length, error: s.error ?? null }))
          .catch(msg)
      : null;
    return NextResponse.json({ ok: true, closed, followups, templates });
  });
}
