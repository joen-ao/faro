import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { leads } from "@/db/schema";
import { createOptOutToken, verifyShortOptOutCode } from "@/features/compliance/optout";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

/** F51 · Short opt-out link from the email: verifies the code and sends people to the /baja confirmation page. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const slug = verifyShortOptOutCode(code);
  if (!slug) return new NextResponse("Enlace no válido", { status: 404 });
  return withDb(async (db) => {
    const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.slug, slug)).limit(1);
    if (!lead) return new NextResponse("Enlace no válido", { status: 404 });
    return NextResponse.redirect(new URL(`/baja/${encodeURIComponent(createOptOutToken(lead.id))}`, req.url), 303);
  });
}
