import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { companies, contactPoints, events, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { isGenericEmail, isLegalEntity } from "@/features/compliance/email";
import { normalizeName } from "@/features/diagnostic/normalize";
import { parseTracking, type Tracking } from "@/features/diagnostic/params";

/**
 * F31 · Leads from mokub.co's own form (`POST /api/public/lead`). The visitor gives consent on mokub.co; Faro stores the
 * company, one contact (email and/or phone) and a short message, attributed to `meta_ads` when the visit came from Meta.
 */

export const PUBLIC_LEAD_ORIGINS = ["https://mokub.co", "https://www.mokub.co", "https://web.mokub.co"] as const;

const phone = z.string().trim().max(30).regex(/^[+\d\s().-]{7,30}$/, "Escribe un teléfono válido");

export const publicLeadSchema = z
  .object({
    company: z.string().trim().min(2, "Escribe el nombre de la empresa").max(160),
    email: z.string().trim().toLowerCase().email("Escribe un correo válido").max(160).optional(),
    phone: phone.optional(),
    message: z.string().trim().max(500).optional(),
    consent: z.literal(true, { error: "Debes aceptar el aviso de privacidad" }),
  })
  .refine((v) => !!v.email || !!v.phone, { message: "Escribe un correo o un teléfono", path: ["email"] });
export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

export type PublicLeadParse =
  | { kind: "ok"; data: PublicLeadInput; tracking: Tracking }
  | { kind: "bot" }
  | { kind: "invalid"; errors: Record<string, string> };

/** Empty strings count as missing; `hp` is the honeypot. UTM keys and fbclid may come flat or under `utm`. */
export function parsePublicLead(input: unknown): PublicLeadParse {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (typeof raw.hp === "string" && raw.hp.length > 0) return { kind: "bot" };
  const clean = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== "" && v !== null));
  const r = publicLeadSchema.safeParse(clean);
  if (!r.success) {
    const errors: Record<string, string> = {};
    for (const i of r.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { kind: "invalid", errors };
  }
  const utm = raw.utm && typeof raw.utm === "object" ? (raw.utm as Record<string, unknown>) : {};
  const q = Object.fromEntries(Object.entries({ ...raw, ...utm }).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  return { kind: "ok", data: r.data, tracking: parseTracking(q) };
}

const fromMeta = (t: Tracking) => /^(meta|facebook|fb|instagram|ig)$/i.test(t.utm?.utm_source ?? "");

/** Creates (or reuses, by email or phone) the inbound lead and logs `form_submit`. Returns the lead id. */
export async function recordPublicLead(db: AppDb, input: PublicLeadInput, tracking: Tracking, opts: { adConsent?: boolean } = {}): Promise<string> {
  const source = fromMeta(tracking) ? ("meta_ads" as const) : ("website" as const);
  const utm = tracking.utm && Object.keys(tracking.utm).length ? { ...tracking.utm, origin: "mokub.co" } : { origin: "mokub.co" };
  const payload = { company: input.company, email: input.email ?? null, phone: input.phone ?? null, message: input.message ?? null, consent: true, adConsent: opts.adConsent === true, origin: "mokub.co", unverified: true };
  return db.transaction(async (tx) => {
    const contacts = [
      ...(input.email ? [{ type: "email" as const, value: input.email }] : []),
      ...(input.phone ? [{ type: "phone" as const, value: input.phone.replace(/[^\d+]/g, "") }] : []),
    ];
    let leadId: string | undefined;
    for (const c of contacts) {
      const [hit] = await tx
        .select({ id: leads.id })
        .from(contactPoints)
        .innerJoin(leads, eq(leads.companyId, contactPoints.companyId))
        .where(and(eq(contactPoints.type, c.type), sql`lower(${contactPoints.value}) = ${c.value.toLowerCase()}`, eq(leads.primarySource, source)))
        .limit(1);
      if (hit) {
        leadId = hit.id;
        break;
      }
    }
    if (!leadId) {
      const [company] = await tx
        .insert(companies)
        .values({ name: input.company, normalizedName: normalizeName(input.company), isLegalEntity: isLegalEntity(input.company).legal })
        .returning();
      await tx.insert(contactPoints).values(
        contacts.map((c) => ({ companyId: company.id, type: c.type, value: c.value, isGeneric: c.type === "email" && isGenericEmail(c.value), sourceChannel: source })),
      );
      const [lead] = await tx.insert(leads).values({ companyId: company.id, status: "responded", primarySource: source, slug: `in-${randomBytes(6).toString("hex")}` }).returning();
      leadId = lead.id;
    }
    await tx.insert(events).values({ leadId, type: "form_submit", payload, utm, isDemo: false });
    return leadId;
  });
}
