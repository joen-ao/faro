import { NextResponse } from "next/server";
import { z } from "zod";
import { bogotaDate } from "@/features/ads";
import { adPerformance, allowedPriceNumbers, chatCopilot, ChatTurn, learningsForProposals, VariantSchema } from "@/features/copilot";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { dbCallRecorder, loadAiRates, recordAiCost } from "@/features/scoring/cost";
import { getServiceCatalog } from "@/features/settings/services";
import { AiError, getAnthropic } from "@/integrations/anthropic";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(ChatTurn).max(20).default([]),
  brief: z.record(z.string(), z.unknown()).nullable().default(null),
  variants: z.array(VariantSchema).max(6).default([]),
});

/** F33 · Chat: edits ad copy (re-validated and linted) or answers questions from 30-day performance. Never acts on Meta. */
export async function POST(req: Request) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.error === "too_large" ? 413 : 400 });
  const body = Body.safeParse(raw.json);
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid", issues: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  const env = getEnv();
  return withDb(async (db) => {
    const catalog = await getServiceCatalog(db);
    const prices = allowedPriceNumbers(catalog.services.flatMap((x) => [x.price, x.entryOffer]));
    const ai = getAnthropic(env);
    try {
      const res = await chatCopilot(
        body.data.message,
        {
          brief: body.data.brief,
          variants: body.data.variants,
          performance: await adPerformance(db, bogotaDate(29)),
          learnings: await learningsForProposals(db, getMetaAds(env).isMock),
          history: body.data.history.slice(-10),
        },
        prices,
        ai,
        { recorder: dbCallRecorder(db) },
      );
      await recordAiCost(db, { usage: res.usage, rates: await loadAiRates(db), isMock: res.is_mock, evidence: `ad_chat ${res.model}` });
      return NextResponse.json({ ok: true, mock: res.is_mock, reply: res.reply, variants: res.variants, changed: res.changed, rejected: res.rejected, issues: res.issues });
    } catch (e) {
      if (e instanceof AiError) {
        await recordAiCost(db, { usage: e.usage, rates: await loadAiRates(db), isMock: e.isMock, evidence: `ad_chat ${e.model} (fallido)` });
        return NextResponse.json({ ok: false, error: "ai_failed", message: "Claude no respondió bien. Intenta de nuevo." }, { status: 502 });
      }
      throw e;
    }
  });
}
