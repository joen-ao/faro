import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { companies, contactPoints, costEntries, events, leads, qualifications } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { safeEqual } from "@/lib/app-access";
import type { Env } from "@/lib/env";

const num = z.coerce.number().finite().nonnegative();
const optStr = z.string().trim().min(1).max(500).optional().nullable();

/** Tolerant payload: Flow Studio field names vary, so most fields are optional. */
export const daptaWebhookSchema = z
  .object({
    conversation_id: z.string().trim().min(1).max(200),
    lead_id: z.string().uuid().optional().nullable(),
    slug: optStr,
    phone: optStr,
    email: optStr,
    qualified: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).optional(),
    score: z.coerce.number().min(0).max(100).optional(),
    bant: z.record(z.string(), z.unknown()).optional(),
    budget: z.unknown().optional(),
    authority: z.unknown().optional(),
    need: z.unknown().optional(),
    timeline: z.unknown().optional(),
    summary: z.string().max(4000).optional().nullable(),
    ai_replies: num.optional(),
    credits_used: num.optional(),
  })
  .passthrough()
  .refine((p) => p.lead_id || p.slug || p.phone || p.email, { message: "lead_id, slug, phone or email is required" })
  .refine((p) => p.qualified !== undefined || p.score !== undefined, { message: "qualified or score is required" });

export type DaptaWebhookPayload = z.infer<typeof daptaWebhookSchema>;

/** Verifies the shared secret. Fail-closed: no secret configured -> reject in production. */
export function verifyWebhookSecret(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.DAPTA_WEBHOOK_SECRET;
  if (!secret) return false; // fail-closed in every environment
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const given = req.headers.get("x-dapta-secret") ?? bearer;
  return !!given && safeEqual(given, secret);
}

const normPhone = (p: string) => {
  const d = p.replace(/[^\d+]/g, "");
  return d.startsWith("+") ? d : `+${d}`;
};

async function findLead(db: AppDb, p: DaptaWebhookPayload) {
  if (p.lead_id) {
    const [l] = await db.select().from(leads).where(eq(leads.id, p.lead_id)).limit(1);
    if (l) return l;
  }
  if (p.slug) {
    const [l] = await db.select().from(leads).where(eq(leads.slug, p.slug)).limit(1);
    if (l) return l;
  }
  const byContact = async (type: "phone" | "email", value: string) => {
    const types = type === "phone" ? (["phone", "whatsapp"] as const) : (["email"] as const);
    const rows = await db
      .select({ lead: leads })
      .from(contactPoints)
      .innerJoin(companies, eq(contactPoints.companyId, companies.id))
      .innerJoin(leads, eq(leads.companyId, companies.id))
      .where(and(inArray(contactPoints.type, [...types]), eq(contactPoints.value, value)))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    return rows[0]?.lead;
  };
  if (p.phone) {
    const l = await byContact("phone", normPhone(p.phone));
    if (l) return l;
  }
  if (p.email) {
    const l = await byContact("email", p.email.trim().toLowerCase());
    if (l) return l;
  }
  return undefined;
}

export type WebhookOutcome =
  | { ok: true; duplicate: boolean; leadId: string; qualified: boolean; costUsd: number; credits: number }
  | { ok: false; status: 404; error: "lead_not_found" };

/** Applies one Dapta result. Idempotent by `conversation_id`. */
export async function processDaptaWebhook(
  db: AppDb,
  payload: DaptaWebhookPayload,
  env: Pick<Env, "DAPTA_CREDIT_USD" | "DAPTA_CREDITS_PER_AI_REPLY">,
): Promise<WebhookOutcome> {
  const lead = await findLead(db, payload);
  if (!lead) return { ok: false, status: 404, error: "lead_not_found" };

  const qualified = payload.qualified ?? (payload.score ?? 0) >= 60;
  const replies = payload.ai_replies ?? 0;
  const credits = payload.ai_replies !== undefined ? replies * env.DAPTA_CREDITS_PER_AI_REPLY : (payload.credits_used ?? 0);
  const costUsd = Math.round(credits * env.DAPTA_CREDIT_USD * 1e6) / 1e6;
  const bant = { ...(payload.bant ?? {}) } as Record<string, unknown>;
  for (const k of ["budget", "authority", "need", "timeline"] as const) if (payload[k] !== undefined && bant[k] === undefined) bant[k] = payload[k];

  return db.transaction(async (tx) => {
    // Serialise concurrent deliveries of the same conversation.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${payload.conversation_id}))`);
    const [dup] = await tx
      .select({ id: qualifications.id })
      .from(qualifications)
      .where(and(eq(qualifications.conversationId, payload.conversation_id), eq(qualifications.origin, "dapta")))
      .limit(1);
    if (dup) return { ok: true as const, duplicate: true, leadId: lead.id, qualified, costUsd: 0, credits: 0 };

    await tx.insert(qualifications).values({
      leadId: lead.id,
      origin: "dapta",
      qualified,
      score: payload.score !== undefined ? Math.round(payload.score) : null,
      bant,
      summary: payload.summary ?? null,
      conversationId: payload.conversation_id,
      creditsUsed: Math.round(credits),
      isDemo: lead.isDemo,
      isMock: false,
    });
    await tx.insert(events).values([
      { leadId: lead.id, type: "widget_chat", payload: { conversation_id: payload.conversation_id, ai_replies: replies }, isDemo: lead.isDemo },
      {
        leadId: lead.id,
        type: qualified ? "qualified" : "disqualified",
        payload: { conversation_id: payload.conversation_id, score: payload.score ?? null, origin: "dapta" },
        isDemo: lead.isDemo,
      },
    ]);
    if (lead.status !== "opted_out") {
      await tx.update(leads).set({ status: qualified ? "qualified" : "disqualified" }).where(eq(leads.id, lead.id));
    }
    if (credits > 0) {
      await tx.insert(costEntries).values({
        leadId: lead.id,
        huntId: lead.huntId,
        sourceChannel: lead.primarySource,
        contactChannel: "dapta_widget",
        category: "dapta",
        quantity: payload.ai_replies !== undefined ? replies : credits,
        unit: payload.ai_replies !== undefined ? "ai_reply" : "credit",
        rate: payload.ai_replies !== undefined ? env.DAPTA_CREDITS_PER_AI_REPLY * env.DAPTA_CREDIT_USD : env.DAPTA_CREDIT_USD,
        usd: costUsd,
        evidence: `dapta conversation ${payload.conversation_id}`,
        isDemo: lead.isDemo,
        isMock: false,
      });
    }
    return { ok: true as const, duplicate: false, leadId: lead.id, qualified, costUsd, credits };
  });
}
