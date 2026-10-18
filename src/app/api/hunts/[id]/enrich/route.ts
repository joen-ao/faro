import { NextResponse } from "next/server";
import { z } from "zod";
import { EnrichInputError, enrichHunt } from "@/features/enrichment";
import { UUID } from "@/features/hunts/http";
import { getApify } from "@/integrations/apify";
import { getWebsiteFetch } from "@/integrations/website-fetch";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Query = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  apify: z.enum(["0", "1", "true", "false"]).optional(),
});

/** Time budget inside the 60 s function limit (the client loops with `nextCursor` until `done`). */
const BUDGET_MS = 52_000;

/** POST /api/hunts/[id]/enrich?cursor=N&apify=1: one batch of website enrichment; returns the summary plus `nextCursor` and `done`. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!UUID.test(id) || !q.success) return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  const useApify = q.data.apify === "1" || q.data.apify === "true";
  return withDb(async (db) => {
    try {
      const summary = await enrichHunt(db, id, {
        useApify,
        cursor: q.data.cursor,
        limit: q.data.limit ?? (useApify ? 25 : 20),
        budgetMs: BUDGET_MS,
        fetch: getWebsiteFetch(),
        apify: getApify(),
      });
      return NextResponse.json(summary);
    } catch (e) {
      if (e instanceof EnrichInputError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
