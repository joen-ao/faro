import { and, eq } from "drizzle-orm";
import { companies, companySources, contactPoints, fitAssessments, icpProfiles, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { IcpCriteria } from "@/features/icp/schema";
import type { AnthropicAdapter } from "@/integrations/anthropic";
import { dbCallRecorder, loadAiRates, recordAiCost } from "./cost";
import { scoreFit, type FitResult, type ScoreSource } from "./fit";

export class ScoreInputError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 422,
  ) {
    super(message);
    this.name = "ScoreInputError";
  }
}

function sourceFromRow(row: typeof companySources.$inferSelect): ScoreSource {
  const raw = row.raw as Record<string, unknown>;
  const tags = raw.tags && typeof raw.tags === "object" ? (raw.tags as Record<string, unknown>) : {};
  const osmTags = Object.entries(tags).map(([k, v]) => `${k}=${String(v)}`);
  const types = Array.isArray(raw.types) ? raw.types.filter((t): t is string => typeof t === "string") : undefined;
  return {
    channel: row.sourceChannel,
    url: row.sourceUrl,
    osmTags: osmTags.length ? osmTags : undefined,
    ciiu: typeof raw.ciiu === "string" ? raw.ciiu : null,
    placesTypes: types,
  };
}

/** Scores one lead against an ICP, persists the assessment and the AI cost entry. */
export async function scoreLead(
  db: AppDb,
  input: { leadId: string; icpProfileId: string },
  deps: { ai: AnthropicAdapter },
): Promise<FitResult & { assessmentId: string }> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId));
  if (!lead) throw new ScoreInputError("Lead no encontrado", 404);
  const [icp] = await db.select().from(icpProfiles).where(eq(icpProfiles.id, input.icpProfileId));
  if (!icp) throw new ScoreInputError("Perfil ICP no encontrado", 404);
  const criteria = IcpCriteria.safeParse(icp.criteria);
  if (!criteria.success) throw new ScoreInputError("El ICP guardado no cumple el esquema de criterios", 422);
  const [company] = await db.select().from(companies).where(eq(companies.id, lead.companyId));
  if (!company) throw new ScoreInputError("Empresa del lead no encontrada", 404);

  const [contacts, sources] = await Promise.all([
    db.select().from(contactPoints).where(eq(contactPoints.companyId, company.id)),
    db.select().from(companySources).where(eq(companySources.companyId, company.id)),
  ]);
  const websiteRaw = sources.find((s) => s.sourceChannel === "website")?.raw as Record<string, unknown> | undefined;
  const websiteText = typeof websiteRaw?.websiteText === "string" ? websiteRaw.websiteText : null;

  const result = await scoreFit(
    {
      name: company.name,
      city: company.city,
      website: company.website,
      nit: company.nit,
      isLegalEntity: company.isLegalEntity,
      contacts: contacts.map((c) => ({ type: c.type, value: c.value, isGeneric: c.isGeneric, evidenceUrl: c.evidenceUrl })),
      sources: sources.map(sourceFromRow),
      websiteText,
    },
    criteria.data,
    { ai: deps.ai, threshold: icp.threshold, recorder: dbCallRecorder(db) },
  );

  const [row] = await db
    .insert(fitAssessments)
    .values({
      companyId: company.id,
      icpProfileId: icp.id,
      score: result.score,
      criteriaMet: result.criteria,
      whyNow: result.why_now,
      model: result.model ?? "rules",
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    })
    .returning({ id: fitAssessments.id });

  await db
    .update(leads)
    .set({ fitScore: result.score, ...(result.meetsThreshold && lead.status === "found" ? { status: "fit" as const } : {}) })
    .where(and(eq(leads.id, lead.id)));

  if (result.usage.input_tokens + result.usage.output_tokens > 0) {
    await recordAiCost(db, {
      leadId: lead.id,
      huntId: lead.huntId,
      usage: result.usage,
      rates: await loadAiRates(db),
      isMock: result.is_mock,
      evidence: `scoring ${result.model ?? ""}`.trim(),
    });
  }
  return { ...result, assessmentId: row.id };
}
