import { eq } from "drizzle-orm";
import { z } from "zod";
import { leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { HandlerResult } from "@/features/icp/api";
import { enrichCompany, EnrichInputError, type EnrichDeps } from "./enrich";

const LeadId = z.uuid("id de lead invalido");
const Body = z.object({ apify: z.boolean().optional() }).strict();

/** POST /api/leads/[id]/enrich: `{ "apify": true }` additionally runs the (paid in real mode) Apify contact actor. */
export async function handleLeadEnrich(db: AppDb, leadId: string, json: unknown, deps: Omit<EnrichDeps, "useApify">): Promise<HandlerResult> {
  const id = LeadId.safeParse(leadId);
  const body = Body.safeParse(json ?? {});
  if (!id.success || !body.success) return { status: 400, body: { error: "Solicitud invalida" } };
  const [lead] = await db.select({ companyId: leads.companyId }).from(leads).where(eq(leads.id, id.data));
  if (!lead) return { status: 404, body: { error: "Lead no encontrado" } };
  try {
    return { status: 200, body: await enrichCompany(db, lead.companyId, { ...deps, useApify: body.data.apify === true }) };
  } catch (e) {
    if (e instanceof EnrichInputError) return { status: e.status, body: { error: e.message } };
    throw e;
  }
}
