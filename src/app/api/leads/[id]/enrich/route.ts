import { NextResponse } from "next/server";
import { handleLeadEnrich } from "@/features/enrichment";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";
import { getApify } from "@/integrations/apify";
import { getWebsiteFetch } from "@/integrations/website-fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const json: unknown = await req.json().catch(() => ({}));
  return withDb(async (db) => {
    const res = await handleLeadEnrich(db, id, json, { fetch: getWebsiteFetch(), apify: getApify() });
    return NextResponse.json(res.body, { status: res.status });
  });
}
